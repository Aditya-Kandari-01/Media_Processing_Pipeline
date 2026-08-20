import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';

function getBucket(): GridFSBucket {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not initialized.');
  }

  return new GridFSBucket(db, {
    bucketName: 'mediaUploads'
  });
}

export async function saveUpload(
  file: Express.Multer.File,
  processingId: string
): Promise<{ path: string; sha256: string }> {
  const sha256 = createHash('sha256')
    .update(file.buffer)
    .digest('hex');

  const bucket = getBucket();

  const uploadStream = bucket.openUploadStream(file.originalname, {
    metadata: {
      processingId,
      mimeType: file.mimetype,
      sha256
    }
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve());
    uploadStream.end(file.buffer);
  });

  return {
    path: uploadStream.id.toString(),
    sha256
  };
}

export async function readStoredFile(
  storagePath: string
): Promise<Buffer> {
  const bucket = getBucket();
  const chunks: Buffer[] = [];

  const downloadStream = bucket.openDownloadStream(
    new ObjectId(storagePath)
  );

  return new Promise<Buffer>((resolve, reject) => {
    downloadStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    downloadStream.on('error', reject);

    downloadStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function deleteStoredFile(
  storagePath: string
): Promise<void> {
  const bucket = getBucket();

  try {
    await bucket.delete(new ObjectId(storagePath));
  } catch {
    // Cleanup failure should not hide the original queue error.
  }
}