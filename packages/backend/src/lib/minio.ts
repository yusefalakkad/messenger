import * as Minio from 'minio';
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
  // Всегда устанавливаем политику публичного чтения
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    }],
  });
  await minioClient.setBucketPolicy(bucketName, policy);
  logger.info(`MinIO bucket '${bucketName}' ready`);
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
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${clientUrl}/media/${objectName}`;
}

export async function deleteFile(objectName: string): Promise<void> {
  await minioClient.removeObject(config.minio.bucket, objectName);
}

export function generateObjectName(
  userId: string,
  type: 'image' | 'video' | 'voice' | 'circle' | 'avatar' | 'file',
  ext: string,
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${type}/${userId}/${timestamp}_${random}.${ext}`;
}
