import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';

export interface AuthRequest extends Request {
  userId: string;
  username: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Authorization header missing', 401);
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).userId = payload.sub;
    (req as AuthRequest).username = payload.username;
    next();
  } catch {
    sendError(res, 'TOKEN_INVALID', 'Invalid or expired access token', 401);
  }
}
