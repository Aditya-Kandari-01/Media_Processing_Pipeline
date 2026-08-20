import express from 'express';
import { pinoHttp } from 'pino-http';
import mediaRoutes from './routes/media.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './utils/logger.js';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1', mediaRoutes);
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
  app.use(errorHandler);
  return app;
}
