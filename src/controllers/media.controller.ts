import { type Request, type Response, type NextFunction } from 'express';
import { promises as fs } from 'node:fs';
import { Media } from '../models/media.js';
import { createProcessingId } from '../utils/id.js';
import { saveUpload } from '../services/storage.js';
import { enqueueMediaAnalysis } from '../queue/media.queue.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff']);

export async function uploadMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { code: 'FILE_REQUIRED', message: 'Upload an image using the "image" multipart field.' } });
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Supported formats: JPEG, PNG, WebP, TIFF.' } });
      return;
    }

    const processingId = createProcessingId();
    const stored = await saveUpload(file, processingId);
    await Media.create({
      processingId,
      status: 'pending',
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: stored.path,
      sha256: stored.sha256,
      attempts: 0
    });

    try {
      await enqueueMediaAnalysis(processingId);
    } catch (queueError) {
      await Media.updateOne({ processingId }, { $set: { status: 'failed', failureReason: 'Unable to enqueue analysis job.' } });
      await fs.rm(stored.path, { force: true });
      throw queueError;
    }

    res.status(202).json({
      processingId,
      status: 'pending',
      statusUrl: `/api/v1/media/${processingId}/status`,
      resultUrl: `/api/v1/media/${processingId}/results`
    });
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  const media = await Media.findOne({ processingId: req.params.processingId }).select('processingId status failureReason attempts createdAt updatedAt completedAt').lean();
  if (!media) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Processing ID was not found.' } });
    return;
  }
  res.json(media);
}

export async function getResults(req: Request, res: Response): Promise<void> {
  const media = await Media.findOne({ processingId: req.params.processingId }).select('processingId status analysis failureReason createdAt updatedAt completedAt').lean();
  if (!media) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Processing ID was not found.' } });
    return;
  }
  if (media.status === 'failed') {
    res.status(500).json({ processingId: media.processingId, status: media.status, failureReason: media.failureReason });
    return;
  }
  if (media.status !== 'completed') {
    res.status(409).json({ error: { code: 'RESULT_NOT_READY', message: 'Analysis is still in progress.', status: media.status } });
    return;
  }
  res.json(media);
}
