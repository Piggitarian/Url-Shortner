import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { djb2, toBase62 } from '../shortener.js';
import { THEMES } from './models.js';
import { mountGoogleAuth } from './google.js';

const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const string = value => typeof value === 'string' ? value.trim() : '';
const objectId = value => /^[a-f0-9]{24}$/i.test(value);

// URL validation · Step 1: Accept HTTP(S) addresses and add HTTPS to bare domains.
export function normalizeUrl(value) {
  let input = string(value);
  if (!input || input.length > 4096) throw error('Enter a website address, up to 4096 characters.');
  if (!/^[a-z][a-z\d+.-]*:/i.test(input)) input = `https://${input}`;
  let url;
  try { url = new URL(input); } catch { throw error('That address does not look like a valid website.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw error('Use an http or https website address without embedded credentials.');
  }
  // Keep the supplied URL text for the original project's deterministic hash.
  return input;
}

// Server setup · Step 1: Create the Express app with the supplied database models.
export function createApp({ models, config, hashUrl = djb2, fetchGoogle }) {
  const { User, Link, SavedLink } = models;
  const app = express();
// Server setup · Step 2: Apply security headers, JSON limits, and cookie parsing.
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"],
    upgradeInsecureRequests: config.production ? [] : null,
  } } }));
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => { req.body ??= {}; next(); });
  app.use(cookieParser());
// Server setup · Step 3: Build public URLs and omit private fields from API responses.
  const baseUrl = req => config.publicUrl ? config.publicUrl.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
  const userData = user => ({ id: String(user._id), username: user.username, name: user.name, bio: user.bio, theme: user.theme });
  const linkData = (saved, req) => ({
    id: String(saved._id), title: saved.title, visible: saved.visible, position: saved.position,
    longUrl: saved.link.longUrl, shortId: saved.link.shortId, shortUrl: `${baseUrl(req)}/${saved.link.shortId}`,
    clicks: saved.link.clicks, createdAt: saved.createdAt,
  });
// Server setup · Step 4: Reject mutations sent from a different website.
  app.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) && req.get('origin')) {
      try {
        if (new URL(req.get('origin')).origin !== new URL(baseUrl(req)).origin) return next(error('This request came from a different website.', 403));
      } catch { return next(error('Invalid request origin.', 403)); }
    }
    next();
  });
// Server setup · Step 5: Limit API traffic and repeated failed login attempts.
  const apiLimit = rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'A little too fast. Try again in a minute.' } });
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
  app.use('/api', apiLimit);
  app.use('/shorten', apiLimit);
  app.use('/api/auth/register', authLimit);
  app.use('/api/auth/login', authLimit);
// Account API · Step 1: Store signed, expiring sessions in an HTTP-only cookie.
  const cookieOptions = { httpOnly: true, secure: Boolean(config.production), sameSite: 'lax', path: '/' };
  const setSession = (res, user) => {
    const token = jwt.sign({}, config.secret, { subject: String(user._id), algorithm: 'HS256', expiresIn: '7d', issuer: 'littlelink', audience: 'littlelink' });
    res.cookie('littlelink_session', token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  };
// Account API · Step 2: Resolve a cookie or bearer token into the current user.
  async function identify(req, res, next) {
    const authorization = req.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : req.cookies.littlelink_session;
    if (token) {
      try {
        const payload = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: 'littlelink', audience: 'littlelink' });
        if (!objectId(payload.sub)) throw error('Invalid session.', 401);
        req.user = await User.findById(payload.sub);
        if (!req.user) req.sessionExpired = true;
      } catch (err) {
        if (err.name?.startsWith('Mongo')) return next(err);
        req.sessionExpired = true;
      }
    }
    next();
  }
// Account API · Step 3: Require authentication for private collection and profile actions.
  const required = (req, res, next) => req.user ? next() : next(error(req.sessionExpired ? 'Your session expired. Please log in again.' : 'Log in to save and manage your links.', 401));
  app.use(['/api', '/shorten'], identify);
  mountGoogleAuth({ app, User, config, baseUrl, cookieOptions, setSession, fetchGoogle });

// Account API · Step 4: Validate signup details, hash the password, and start a session.
  app.post('/api/auth/register', async (req, res) => {
    const email = string(req.body.email).toLowerCase();
    const username = string(req.body.username).toLowerCase();
    const name = string(req.body.name) || username;
    const password = req.body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw error('Enter a valid email address.');
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw error('Use 3–24 lowercase letters, numbers, or underscores for your username.');
    if (name.length > 60) throw error('Keep your display name under 60 characters.');
    if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password) > 72) throw error('Use a password with at least 10 characters and no more than 72 bytes.');
    const user = await User.create({ email, username, name, passwordHash: await bcrypt.hash(password, 12) });
    setSession(res, user);
    res.status(201).json({ user: userData(user) });
  });
// Account API · Step 5: Verify the password and issue a new session.
  app.post('/api/auth/login', async (req, res) => {
    const email = string(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (email.length > 254 || Buffer.byteLength(password) > 72) throw error('Email or password is incorrect.', 401);
    const user = await User.findOne({ email }).select('+passwordHash');
    const matches = await bcrypt.compare(password, user?.passwordHash || '$2b$12$KIXh7I.hGY.FFGRuaFQF5eSYYkm.P9ScWKzxkhxhNx68faJg.Xnnm');
    if (!user || !matches) throw error('Email or password is incorrect.', 401);
    setSession(res, user);
    res.json({ user: userData(user) });
  });
// Account API · Step 6: Clear the session cookie when the user logs out.
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('littlelink_session', cookieOptions);
    res.json({ ok: true });
  });
// Account API · Step 7: Return public session details to initialize the page.
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? userData(req.user) : null }));

// Home API · Step 1: Reuse stored URLs and retry hashes only when a collision occurs.
  async function findOrCreateLink(longUrl) {
    const existing = await Link.findOne({ longUrl });
    if (existing) return existing;
    for (let attempt = 0; attempt < 100; attempt++) {
      // Preserve DJB2 → Base62; rehash with a suffix only on an actual collision.
      const shortId = toBase62(hashUrl(attempt ? `${longUrl}\0${attempt}` : longUrl));
      try { return await Link.create({ longUrl, shortId }); } catch (err) {
        if (err.code !== 11000) throw err;
        const sameUrl = await Link.findOne({ longUrl });
        if (sameUrl) return sameUrl;
      }
    }
    throw error('Could not create a unique link. Try again.', 503);
  }
// Dashboard API · Step 1: Save each URL once per user and append it to the collection.
  async function saveLink(user, link, title) {
    const last = await SavedLink.findOne({ user: user._id }).sort({ position: -1 });
    try {
      return await SavedLink.findOneAndUpdate({ user: user._id, link: link._id }, { $setOnInsert: {
        title: title || new URL(link.longUrl).hostname.replace(/^www\./, ''), position: (last?.position ?? -1) + 1,
      } }, { upsert: true, returnDocument: 'after', runValidators: true }).populate('link');
    } catch (err) {
      if (err.code !== 11000) throw err;
      return SavedLink.findOne({ user: user._id, link: link._id }).populate('link');
    }
  }
// Home API · Step 2: Create a short URL and save it when a user is signed in.
  async function shorten(req, res) {
    if (req.sessionExpired) throw error('Your session expired. Please log in again.', 401);
    const longUrl = normalizeUrl(req.body.longUrl);
    const title = string(req.body.title);
    if (title.length > 80) throw error('Keep link titles under 80 characters.');
    const link = await findOrCreateLink(longUrl);
    const saved = req.user ? await saveLink(req.user, link, title) : null;
    res.status(201).json({ shortId: link.shortId, shortUrl: `${baseUrl(req)}/${link.shortId}`, longUrl, saved: saved ? linkData(saved, req) : null });
  }
  app.post('/shorten', shorten);
  app.post('/api/links', shorten);
// Dashboard API · Step 2: Return the current user's collection in saved order.
  app.get('/api/links', required, async (req, res) => {
    const saved = await SavedLink.find({ user: req.user._id }).sort({ position: 1, createdAt: 1 }).populate('link');
    res.json({ links: saved.map(link => linkData(link, req)) });
  });
// Dashboard API · Step 3: Verify ownership of the complete collection before reordering.
  app.patch('/api/links/reorder', required, async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== 'string' || !objectId(id)) || new Set(ids).size !== ids.length) throw error('Send a valid list of link IDs.');
    const owned = await SavedLink.find({ user: req.user._id }).select('_id');
    if (ids.length !== owned.length || owned.some(link => !ids.includes(String(link._id)))) throw error('Reorder your complete link collection.');
    if (ids.length) await SavedLink.bulkWrite(ids.map((id, position) => ({ updateOne: { filter: { _id: id, user: req.user._id }, update: { $set: { position } } } })));
    res.json({ ok: true });
  });
// Dashboard API · Step 4: Update only an owned link's title and visibility.
  app.patch('/api/links/:id', required, async (req, res) => {
    if (!objectId(req.params.id)) throw error('Link not found.', 404);
    const update = {};
    if ('title' in req.body) {
      update.title = string(req.body.title);
      if (!update.title || update.title.length > 80) throw error('Use a title between 1 and 80 characters.');
    }
    if ('visible' in req.body) {
      if (typeof req.body.visible !== 'boolean') throw error('Visibility must be true or false.');
      update.visible = req.body.visible;
    }
    const saved = await SavedLink.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: update }, { returnDocument: 'after', runValidators: true }).populate('link');
    if (!saved) throw error('Link not found.', 404);
    res.json({ link: linkData(saved, req) });
  });
// Dashboard API · Step 5: Remove a link from this user's saved collection.
  app.delete('/api/links/:id', required, async (req, res) => {
    if (!objectId(req.params.id)) throw error('Link not found.', 404);
    const deleted = await SavedLink.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!deleted) throw error('Link not found.', 404);
    res.json({ ok: true });
  });
// Dashboard API · Step 6: Validate and save the public name, bio, and theme.
  app.patch('/api/profile', required, async (req, res) => {
    const update = {};
    for (const [field, max] of [['name', 60], ['bio', 180]]) if (field in req.body) {
      update[field] = string(req.body[field]);
      if (update[field].length > max || (field === 'name' && !update[field])) throw error(`${field === 'name' ? 'Name' : 'Bio'} must be ${field === 'name' ? '1–' : 'up to '}${max} characters.`);
    }
    if ('theme' in req.body) {
      if (!THEMES.includes(req.body.theme)) throw error('Choose a theme from the available landscape themes.');
      update.theme = req.body.theme;
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { returnDocument: 'after', runValidators: true });
    res.json({ user: userData(user), profileUrl: `${baseUrl(req)}/u/${user.username}` });
  });
// Public profile API · Step 1: Return public details and visible links in saved order.
  app.get('/api/profiles/:username', async (req, res) => {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) throw error('This profile has not been planted yet.', 404);
    const saved = await SavedLink.find({ user: user._id, visible: true }).sort({ position: 1, createdAt: 1 }).populate('link');
    res.json({ user: userData(user), links: saved.map(link => linkData(link, req)) });
  });
// Page serving · Step 1: Expose health status and serve only the public asset directory.
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res, next) => next(error('Endpoint not found.', 404)));
  app.use(express.static(publicDirectory, { index: 'index.html' }));
  for (const route of ['/dashboard', '/u/:username']) app.get(route, (req, res) => res.sendFile(`${publicDirectory}/index.html`));
// Page serving · Step 2: Count each short-link visit and redirect to its destination.
  app.get('/:shortId', async (req, res) => {
    if (!/^[a-zA-Z0-9]{1,6}$/.test(req.params.shortId)) return res.status(404).sendFile(`${publicDirectory}/404.html`);
    const link = await Link.findOneAndUpdate({ shortId: req.params.shortId }, { $inc: { clicks: 1 } }, { returnDocument: 'after' });
    if (!link) return res.status(404).sendFile(`${publicDirectory}/404.html`);
    res.set('Cache-Control', 'no-store').redirect(302, link.longUrl);
  });
  app.use((req, res) => res.status(404).sendFile(`${publicDirectory}/404.html`));
// Page serving · Step 3: Translate validation and server failures into readable JSON errors.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500;
    let message = err.status ? err.message : 'Something went wrong. Please try again.';
    if (err.code === 11000) { status = 409; message = 'That email or username is already registered.'; }
    if (err.type === 'entity.parse.failed') { status = 400; message = 'Send valid JSON.'; }
    if (err.type === 'entity.too.large') { status = 413; message = 'That request is too large.'; }
    if (status >= 500) console.error(err);
    res.status(status).json({ error: message });
  });
  return app;
}
