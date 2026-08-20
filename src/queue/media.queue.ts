import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export const MEDIA_QUEUE = 'media-analysis';
export const mediaQueue = new Queue(MEDIA_QUEUE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export async function enqueueMediaAnalysis(processingId: string): Promise<void> {
  await mediaQueue.add('analyse-media', { processingId }, { jobId: processingId });
  logger.info({ processingId }, 'media analysis job enqueued');
}
