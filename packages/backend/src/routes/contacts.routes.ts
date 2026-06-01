import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/response';
import {
  checkSyncRateLimit,
  normalizePhones,
  syncContacts,
} from '../services/contacts.service';

const router = Router();

// POST /contacts/sync — find Dakka users by phone numbers from address book.
// body: { phones: string[] (max 1000) }
router.post(
  '/sync',
  requireAuth,
  validate([
    body('phones').isArray({ min: 1, max: 1000 }),
    body('phones.*').isString().isLength({ min: 3, max: 32 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { phones } = req.body as { phones: string[] };

      await checkSyncRateLimit(userId);

      const normalized = normalizePhones(phones);
      const matched = await syncContacts(userId, normalized);

      sendSuccess(res, {
        matched,
        stats: {
          requested: phones.length,
          normalized: normalized.length,
          matched: matched.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
