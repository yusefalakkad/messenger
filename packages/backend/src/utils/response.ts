import { Response } from 'express';
import { ApiResponse } from '@messenger/shared';

export function sendSuccess<T>(
  res: Response,
  data?: T,
  statusCode = 200,
  meta?: ApiResponse<T>['meta'],
): Response {
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
