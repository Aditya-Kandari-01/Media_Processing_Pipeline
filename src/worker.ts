import { Worker, type Job } from 'bullmq';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createRedisConnection } from './config/redis.js';
import { env } from './config/env.js';
import { Media } from './models/media.js';
import { readStoredFile } from './services/storage.js';
import { analyseMedia } from './services/analyzer/index.js';
import { MEDIA_QUEUE } from './queue/media.queue.js';
import { logger } from './utils/logger.js';

await connectDatabase();

const worker = new Worker(MEDIA_QUEUE, async (job: Job<{ processingId: string }>) => {
  const { processingId } = job.data;
  const media = await Media.findOne({ processingId });
  if (!media) throw new Error(`Media record not found: ${processingId}`);

  await Media.updateOne({ processingId }, { $set: { status: 'processing' }, $inc: { attempts: 1 } });
  logger.info({ processingId, attempt: job.attemptsMade + 1 }, 'analysis started');

  try {
    const buffer = await readStoredFile(media.storagePath);
    const startedAt = Date.now();
    const analysis = await analyseMedia(buffer, media.sha256, startedAt, processingId);
    const perceptualHash = await import('./services/analyzer/phash.js').then((module) => module.computePerceptualHash(buffer));

    await Media.updateOne(
      { processingId },
      { $set: { status: 'completed', analysis, perceptualHash, completedAt: new Date() }, $unset: { failureReason: 1 } }
    );
    logger.info({ processingId, processingMs: analysis.processingMs }, 'analysis completed');
  } catch (error) {
    logger.error({ err: error, processingId }, 'analysis attempt failed');
    throw error;
  }
}, {
  connection: createRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY
});

worker.on('failed', async (job, error) => {
  if (!job) return;
  logger.error({ processingId: job.data.processingId, attempts: job.attemptsMade, err: error }, 'analysis job failed');
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await Media.updateOne({ processingId: job.data.processingId }, {
      $set: { status: 'failed', failureReason: error.message }
    });
  }
});

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'queue job completed'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutdown requested');
  await worker.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
