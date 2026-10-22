// Runs a real local MongoDB with a persistent data directory; no external account needed.
import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { startServer } from '../index.js';

// Local startup · Step 1: Create the persistent database directory for this project.
const dataDirectory = new URL('../.data/', import.meta.url);
await mkdir(new URL('mongodb/', dataDirectory), { recursive: true });
// A second start replaces only this project's own local preview, gracefully.
// Check both the parent's entry point and working directory before signalling it.
try {
  const mongoPid = (await readFile(new URL('mongodb/mongod.lock', dataDirectory), 'utf8')).trim();
  if (/^\d+$/.test(mongoPid)) {
    const status = await readFile(`/proc/${mongoPid}/status`, 'utf8');
    const parentPid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
    if (parentPid && parentPid !== process.pid) {
      const parentCwd = await readlink(`/proc/${parentPid}/cwd`);
      const argumentsList = (await readFile(`/proc/${parentPid}/cmdline`, 'utf8')).split('\0');
      const ownsPreview = parentCwd === new URL('../', import.meta.url).pathname.replace(/\/$/, '') &&
        argumentsList.some(argument => ['scripts/start.js', 'scripts/start-local.js'].includes(argument));
      if (ownsPreview) {
        console.log('Restarting the previous local preview…');
        process.kill(parentPid, 'SIGTERM');
        for (let attempt = 0; attempt < 80; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try { process.kill(parentPid, 0); } catch { break; }
        }
      }
    }
  }
} catch (err) { if (!['ENOENT', 'ESRCH'].includes(err.code)) console.warn('The existing local database will be checked during startup.'); }
// Local startup · Step 2: Reuse a local session secret or generate one privately.
if (!process.env.JWT_SECRET) {
  const secretPath = new URL('local-jwt-secret', dataDirectory);
  try { process.env.JWT_SECRET = await readFile(secretPath, 'utf8'); }
  catch { process.env.JWT_SECRET = randomBytes(48).toString('hex'); await writeFile(secretPath, process.env.JWT_SECRET, { mode: 0o600 }); }
}
// Local startup · Step 3: Start MongoDB and HTTP together, then shut both down gracefully.
let database, service;
try {
  database = await MongoMemoryServer.create({ instance: { dbPath: new URL('mongodb/', dataDirectory).pathname, storageEngine: 'wiredTiger', dbName: 'littlelink' } });
  service = await startServer({ mongoUri: database.getUri() });
  console.log('Local MongoDB stores your links in .data/mongodb.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); await database.stop({ doCleanup: false }); process.exit(0); });
} catch (error) {
  console.error(error.message);
  if (database) await database.stop({ doCleanup: false });
  process.exitCode = 1;
}
