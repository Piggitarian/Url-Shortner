import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';
import { createModels } from './server/models.js';

// Startup · Step 1: Check database and session configuration before accepting requests.
export async function startServer({ mongoUri = process.env.MONGODB_URI, port = process.env.PORT || 3000 } = {}) {
  if (!mongoUri) throw new Error('Set MONGODB_URI in .env, or run npm run dev:local for a local MongoDB.');
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. See .env.example.');
// Startup · Step 2: Connect MongoDB and wait for collection indexes.
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const models = createModels(mongoose.connection);
  await Promise.all(Object.values(models).map(model => model.init()));
// Startup · Step 3: Migrate saved legacy themes to current landscape names.
  for (const [previous, theme] of [['graphite', 'meadow'], ['nebula', 'dusk'], ['silver', 'ocean']]) {
    await models.User.updateMany({ theme: previous }, { $set: { theme } });
  }
// Startup · Step 4: Pass environment settings to the app and listen on the selected port.
  const app = createApp({ models, config: { secret, publicUrl: process.env.PUBLIC_URL, production: process.env.NODE_ENV === 'production',
    googleClientId: process.env.GOOGLE_CLIENT_ID, googleClientSecret: process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
  } });
  const server = app.listen(port, () => console.log(`Littlelink is ready at http://localhost:${server.address().port}`));
// Startup · Step 5: Close HTTP connections and MongoDB during graceful shutdown.
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  };
  return { server, close };
}

// Startup · Step 6: Run the server only when this entry point is executed directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(({ close }) => {
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(); process.exit(0); });
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
