import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { startScheduler } from './scheduler';

async function start(): Promise<void> {
  const app = createApp();

  try {
    await connectDB();
    // Only start scheduled crawling once Mongo is actually reachable — a
    // scheduler that can't persist anything shouldn't be firing jobs that
    // are guaranteed to fail. startScheduler() itself is a no-op unless
    // SCHEDULER_ENABLED=true (off by default, see .env.example).
    startScheduler();
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
