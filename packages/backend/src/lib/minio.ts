import * as Minio from 'minio';
import crypto from 'node:crypto';
import { Readable } from 'stream';
import { config } from '../config';
import { logger } from './logger';

export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function initializeMinio(): Promise<void> {
  const bucketName = config.minio.bucket;
  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, 'us-east-1');
    logger.info(`MinIO bucket '${bucketName}' created`);
  }
  // Bucket остаётся приватным — раздача идёт через GET /api/media/:path с auth-проверкой.
  logger.info(`MinIO bucket '${bucketName}' ready (private)`);
}

export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  mimeType: string,
  size: number,
): Promise<string> {
  await minioClient.putObject(
    config.minio.bucket,
    objectName,
    buffer,
    size,
    { 'Content-Type': mimeType },
  );
  // Относительный URL — раздаётся через auth-checked backend route.
  return `/api/media/${objectName}`;
}

export async function deleteFile(objectName: string): Promise<void> {
  await minioClient.removeObject(config.minio.bucket, objectName);
}

export async function getObjectStream(objectName: string): Promise<Readable> {
  return minioClient.getObject(config.minio.bucket, objectName);
}

export async function statObject(objectName: string): Promise<Minio.BucketItemStat> {
  return minioClient.statObject(config.minio.bucket, objectName);
}

/** Извлекает objectName из URL вида `/api/media/foo/bar.jpg` или старого `${CLIENT_URL}/media/...`. */
export function extractObjectName(url: string): string | null {
  const apiMatch = url.match(/\/api\/media\/(.+)$/);
  if (apiMatch) return apiMatch[1];
  const legacyMatch = url.match(/\/media\/(.+)$/);
  if (legacyMatch) return legacyMatch[1];
  return null;
}

export function generateObjectName(
  userId: string,
  type: 'image' | 'video' | 'voice' | 'circle' | 'avatar' | 'file',
  ext: string,
): string {
  // 16 байт = 128 бит энтропии. ~3.4e38 вариантов — не подобрать перебором,
  // в отличие от Math.random().toString(36).slice(2,8) (~2 млрд вариантов на timestamp).
  const random = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${type}/${userId}/${timestamp}_${random}.${ext}`;
}
