import { Request, Response, NextFunction } from 'express';
import { AppError, sendError } from '../utils/response';
import { logger } from '../lib/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode);
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
}

export function notFound(_req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', 'Route not found', 404);
}
