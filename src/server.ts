import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { mediaQueue } from './queue/media.queue.js';

await connectDatabase();
if (process.env.RUN_WORKER_IN_API === 'true') {
  await import('./worker.js');
}

const app = createApp();
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api server started'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown requested');
  server.close();
  await mediaQueue.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
