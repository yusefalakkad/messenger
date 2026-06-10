import { Response } from 'express';
import { ApiResponse } from '@messenger/shared';
import { signMediaUrlsDeep } from '../lib/mediaUrl';

export function sendSuccess<T>(
  res: Response,
  data?: T,
  statusCode = 200,
  meta?: ApiResponse<T>['meta'],
): Response {
  // Подписываем media URL'ы перед сериализацией — мутирует data на месте.
  // Безопасно: трогает только строки в полях url/thumbnailUrl/avatarUrl/avatar/previewUrl,
  // и только те, которые матчат /api/media/...
  if (data !== undefined) signMediaUrlsDeep(data);
  const body: ApiResponse<T> = { success: true, data, meta };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown,
): Response {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  return res.status(statusCode).json(body);
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
