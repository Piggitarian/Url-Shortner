// Run with npm run test:browser; starts an isolated MongoDB and test server.
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Browser verification · Step 1: Allocate an isolated temporary database directory.
(async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'littlelink-browser-'));
  let database, service;
  try {
// Browser verification · Step 2: Start an isolated database and app on an available port.
    database = await MongoMemoryServer.create({ instance: { dbPath: dataDirectory, storageEngine: 'wiredTiger' } });
    process.env.JWT_SECRET = 'browser-test-secret-at-least-thirty-two-characters';
    const { startServer } = await import('../index.js');
    service = await startServer({ mongoUri: database.getUri(), port: 0 });
// Browser verification · Step 3: Run Playwright against the isolated app.
    const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test'], {
      cwd: path.join(__dirname, '..'), stdio: 'inherit', env: { ...process.env, TEST_BASE_URL: `http://localhost:${service.server.address().port}` },
    });
    process.exitCode = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
  } catch (err) { console.error(err); process.exitCode = 1; }
// Browser verification · Step 4: Close test services and remove temporary database files.
  finally { await service?.close(); await database?.stop(); await rm(dataDirectory, { recursive: true, force: true }); }
})();
