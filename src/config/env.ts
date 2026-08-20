import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().default('mongodb://localhost:27017/media_pipeline'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPLOAD_DIR: z.string().default('./storage'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  OCR_ENABLED: z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  }, z.boolean()).default(true),
  BLUR_THRESHOLD: z.coerce.number().positive().default(55),
  LOW_BRIGHTNESS_THRESHOLD: z.coerce.number().min(0).max(255).default(55),
  HIGH_BRIGHTNESS_THRESHOLD: z.coerce.number().min(0).max(255).default(215),
  DUPLICATE_PHASH_DISTANCE: z.coerce.number().int().min(0).max(64).default(8),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

export const env = schema.parse(process.env);
