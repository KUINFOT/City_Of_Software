import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';

async function start(): Promise<void> {
  const app = createApp();

  try {
    await connectDB();
  } catch (err) {
    console.error(
      '⚠️  Could not connect to MongoDB. The server will still start, but ' +
        'database operations will fail until MONGODB_URI points at a real cluster.'
    );
    console.error('   Reason:', (err as Error).message);
  }

  app.listen(env.port, () => {
    console.log(`🚀 Server listening on http://localhost:${env.port}`);
    console.log(`   Health check: http://localhost:${env.port}/api/health`);
  });
}

start();
