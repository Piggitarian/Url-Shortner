import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { createModels } from '../server/models.js';
import { djb2, toBase62 } from '../shortener.js';

const secret = 'integration-test-secret-at-least-thirty-two-characters';
const config = { secret, publicUrl: 'http://localhost:3000', production: false };
let database, connection, models, app, dataDirectory;
before(async () => {
  dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'littlelink-test-'));
  database = await MongoMemoryServer.create({ instance: { dbPath: dataDirectory, storageEngine: 'wiredTiger' } });
  connection = await mongoose.createConnection(database.getUri()).asPromise();
  models = createModels(connection);
  await Promise.all(Object.values(models).map(model => model.init()));
  app = createApp({ models, config });
});
after(async () => { await connection?.close(); await database?.stop(); if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true }); });
const register = async (username, agent = request.agent(app)) => {
  const response = await agent.post('/api/auth/register').send({ username, email: `${username}@example.com`, password: 'very-good-password' }).expect(201);
  return { agent, response };
};

test('shortening preserves the original DJB2 → Base62 mapping and redirects', async () => {
  const longUrl = 'https://example.com';
  const response = await request(app).post('/shorten').send({ longUrl }).expect(201);
  assert.equal(response.body.shortId, toBase62(djb2(longUrl)));
  assert.equal(response.body.longUrl, longUrl);
  assert.equal(response.body.saved, null);
  const redirect = await request(app).get(`/${response.body.shortId}`).expect(302);
  assert.equal(redirect.headers.location, longUrl);
  assert.equal((await models.Link.findOne({ longUrl })).clicks, 1);
  const repeat = await request(app).post('/shorten').send({ longUrl }).expect(201);
  assert.equal(repeat.body.shortId, response.body.shortId);
});

test('bare domains work and unsafe URLs are rejected', async () => {
  const response = await request(app).post('/shorten').send({ longUrl: 'example.org/path?q=1' }).expect(201);
  assert.equal(response.body.longUrl, 'https://example.org/path?q=1');
  for (const longUrl of ['', 'javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com', 'not a url', 'http://']) {
    await request(app).post('/shorten').send({ longUrl }).expect(400);
  }
  await request(app).post('/shorten').expect(400);
  await request(app).post('/shorten').set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app).get('/nosuch').expect(404);
});

test('actual DJB2 collisions never replace another destination', async () => {
  const first = 'https://collision.example/Aa', second = 'https://collision.example/B@';
  assert.equal(djb2(first), djb2(second));
  const a = await request(app).post('/shorten').send({ longUrl: first }).expect(201);
  const b = await request(app).post('/shorten').send({ longUrl: second }).expect(201);
  assert.equal(a.body.shortId, toBase62(djb2(first)));
  assert.equal(b.body.shortId, toBase62(djb2(`${second}\0${1}`)));
  assert.notEqual(a.body.shortId, b.body.shortId);
  assert.equal((await request(app).get(`/${a.body.shortId}`).expect(302)).headers.location, first);
  assert.equal((await request(app).get(`/${b.body.shortId}`).expect(302)).headers.location, second);
});

test('concurrent shortening creates one stable stored link', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/shorten').send({ longUrl: 'https://concurrent.example/path' }).expect(201)));
  assert.equal(new Set(responses.map(response => response.body.shortId)).size, 1);
  assert.equal(await models.Link.countDocuments({ longUrl: 'https://concurrent.example/path' }), 1);
});

test('JWT signup, password hashing, login, session, and logout', async () => {
  const { agent, response } = await register('session_user');
  assert.ok(response.headers['set-cookie'][0].includes('HttpOnly'));
  assert.ok(response.headers['set-cookie'][0].includes('SameSite=Lax'));
  assert.equal(response.body.user.username, 'session_user');
  assert.equal(response.body.user.passwordHash, undefined);
  const user = await models.User.findOne({ username: 'session_user' }).select('+passwordHash');
  assert.notEqual(user.passwordHash, 'very-good-password');
  assert.match(user.passwordHash, /^\$2[ab]\$/);
  assert.equal((await agent.get('/api/auth/me').expect(200)).body.user.username, 'session_user');
  await agent.post('/api/auth/logout').send({}).expect(200);
  assert.equal((await agent.get('/api/auth/me').expect(200)).body.user, null);
  await agent.get('/api/links').expect(401);
  await agent.post('/api/auth/login').send({ email: 'session_user@example.com', password: 'wrong-password' }).expect(401);
  await agent.post('/api/auth/login').send({ email: 'missing@example.com', password: 'wrong-password' }).expect(401);
  await agent.post('/api/auth/login').send({ email: 'SESSION_USER@example.com', password: 'very-good-password' }).expect(200);
  await agent.get('/api/links').expect(200);
  const token = jwt.sign({}, secret, { subject: String(user._id), expiresIn: '-1s', issuer: 'littlelink', audience: 'littlelink' });
  await request(app).get('/api/links').set('Authorization', `Bearer ${token}`).expect(401);
  await request(app).post('/shorten').set('Authorization', 'Bearer invalid').send({ longUrl: 'https://example.com' }).expect(401);
});

test('signup validates inputs and rejects duplicate accounts', async () => {
  for (const fields of [{ username: 'x' }, { username: '<script>' }, { email: 'bad' }, { password: 'short' }, { password: '😀'.repeat(30) }]) {
    await request(app).post('/api/auth/register').send({ username: 'validation_user', email: 'validation@example.com', password: 'very-good-password', ...fields }).expect(400);
  }
  await request(app).post('/api/auth/register').send({ username: 'session_user', email: 'different@example.com', password: 'very-good-password' }).expect(409);
});

test('saved links support titles, visibility, ordering, removal, and independent ownership', async () => {
  const { agent: alice } = await register('alice');
  const { agent: bob } = await register('bob');
  const first = (await alice.post('/api/links').send({ longUrl: 'https://shared.example', title: 'My website' }).expect(201)).body;
  const second = (await alice.post('/api/links').send({ longUrl: 'https://second.example' }).expect(201)).body;
  const shared = (await bob.post('/api/links').send({ longUrl: 'https://shared.example', title: 'Bob’s website' }).expect(201)).body;
  assert.equal(first.shortId, shared.shortId);
  await alice.post('/api/links').send({ longUrl: 'https://shared.example' }).expect(201);
  assert.equal((await alice.get('/api/links')).body.links.length, 2);
  await bob.patch(`/api/links/${first.saved.id}`).send({ title: 'Stolen' }).expect(404);
  await bob.delete(`/api/links/${first.saved.id}`).expect(404);
  await alice.patch(`/api/links/${first.saved.id}`).send({ title: 'Renamed website', visible: false }).expect(200);
  const publicProfile = (await request(app).get('/api/profiles/alice').expect(200)).body;
  assert.equal(publicProfile.links.length, 1);
  assert.equal(publicProfile.links[0].shortId, second.shortId);
  assert.equal(publicProfile.user.email, undefined);
  await alice.patch('/api/links/reorder').send({ ids: [second.saved.id, first.saved.id] }).expect(200);
  assert.equal((await alice.get('/api/links')).body.links[0].id, second.saved.id);
  await alice.patch('/api/links/reorder').send({ ids: [shared.saved.id, first.saved.id] }).expect(400);
  await alice.patch(`/api/links/${first.saved.id}`).send({ title: '' }).expect(400);
  await alice.patch('/api/links/not-an-id').send({ title: 'Test' }).expect(404);
  await alice.delete(`/api/links/${first.saved.id}`).expect(200);
  assert.equal((await bob.get('/api/links')).body.links[0].title, 'Bob’s website');
  await request(app).get(`/${first.shortId}`).expect(302);
});

test('profile details and theme persist; private fields cannot be overwritten', async () => {
  const { agent } = await register('profile_user');
  await agent.patch('/api/profile').send({ name: 'My little corner', bio: 'All my favorites.', theme: 'dusk', email: 'hijacked@example.com', passwordHash: 'unsafe' }).expect(200);
  const profile = (await request(app).get('/api/profiles/profile_user').expect(200)).body.user;
  assert.equal(profile.name, 'My little corner'); assert.equal(profile.bio, 'All my favorites.'); assert.equal(profile.theme, 'dusk');
  assert.equal((await models.User.findOne({ username: 'profile_user' })).email, 'profile_user@example.com');
  await agent.patch('/api/profile').send({ theme: 'unknown' }).expect(400);
  await agent.patch('/api/profile').send({ name: '' }).expect(400);
  await agent.patch('/api/profile').send({ bio: 'a'.repeat(181) }).expect(400);
  await request(app).patch('/api/profile').send({ name: 'Test' }).expect(401);
  await request(app).get('/api/profiles/nonexistent').expect(404);
});

test('cross-origin mutations are blocked and private source files are never served', async () => {
  await request(app).post('/shorten').set('Origin', 'https://other.example').send({ longUrl: 'https://example.com' }).expect(403);
  await request(app).post('/shorten').set('Origin', 'http://localhost:3000').send({ longUrl: 'https://same-origin.example' }).expect(201);
  for (const file of ['/.env', '/package.json', '/index.js', '/shortener.js', '/server/models.js']) await request(app).get(file).expect(404);
  const page = await request(app).get('/').expect(200);
  assert.ok(page.headers['content-security-policy'].includes("script-src 'self'"));
  await request(app).get('/assets/meadow.gif').expect(200).expect('Content-Type', /gif/);
  await request(app).get('/dashboard').expect(200);
  await request(app).get('/u/alice').expect(200);
});

test('links and accounts survive a full MongoDB stop and restart', async () => {
  const previousLink = await models.Link.findOne({ longUrl: 'https://example.com' });
  const uri = database.getUri();
  await connection.close(); await database.stop({ doCleanup: false }); await database.start();
  connection = await mongoose.createConnection(database.getUri()).asPromise(); models = createModels(connection); app = createApp({ models, config });
  assert.equal((await models.Link.findOne({ longUrl: 'https://example.com' })).shortId, previousLink.shortId);
  assert.equal((await request(app).get('/api/profiles/profile_user').expect(200)).body.user.theme, 'dusk');
  await request(app).get(`/${previousLink.shortId}`).expect(302);
});
