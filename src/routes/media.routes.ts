import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { getResults, getStatus, uploadMedia } from '../controllers/media.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 }
});

router.post('/media', upload.single('image'), uploadMedia);
router.get('/media/:processingId/status', getStatus);
router.get('/media/:processingId/results', getResults);

export default router;
