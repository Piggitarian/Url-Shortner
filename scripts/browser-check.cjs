// Run with npm run test:browser; starts an isolated MongoDB and test server.
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'littlelink-browser-'));
  let database, service;
  try {
    database = await MongoMemoryServer.create({ instance: { dbPath: dataDirectory, storageEngine: 'wiredTiger' } });
    process.env.JWT_SECRET = 'browser-test-secret-at-least-thirty-two-characters';
    const { startServer } = await import('../index.js');
    service = await startServer({ mongoUri: database.getUri(), port: 0 });
    const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test'], {
      cwd: path.join(__dirname, '..'), stdio: 'inherit', env: { ...process.env, TEST_BASE_URL: `http://localhost:${service.server.address().port}` },
    });
    process.exitCode = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { await service?.close(); await database?.stop(); await rm(dataDirectory, { recursive: true, force: true }); }
})();
