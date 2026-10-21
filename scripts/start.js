import 'dotenv/config';
if (!process.env.MONGODB_URI) {
  await import('./start-local.js');
} else {
  const { startServer } = await import('../index.js');
  try {
    const { close } = await startServer();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
