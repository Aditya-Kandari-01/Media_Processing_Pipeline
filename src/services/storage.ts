import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

export async function ensureStorageDirectory(): Promise<void> {
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
}

export async function saveUpload(file: Express.Multer.File, processingId: string): Promise<{ path: string; sha256: string }> {
  await ensureStorageDirectory();
  const extension = path.extname(file.originalname).toLowerCase() || '.bin';
  const destination = path.join(env.UPLOAD_DIR, `${processingId}${extension}`);
  await fs.writeFile(destination, file.buffer);
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  return { path: destination, sha256 };
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}
