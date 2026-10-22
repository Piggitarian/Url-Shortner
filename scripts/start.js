import 'dotenv/config';
// Startup · Step 1: Choose the persistent local database when no external URI is configured.
if (!process.env.MONGODB_URI) {
  await import('./start-local.js');
} else {
// Startup · Step 2: Start the configured server and attach graceful shutdown handlers.
  const { startServer } = await import('../index.js');
  try {
    const { close } = await startServer();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
