import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import chatRoutes from './chat.routes';
import channelsRoutes from './channels.routes';
import mediaRoutes from './media.routes';
import pushRoutes from './push.routes';
import webrtcRoutes from './webrtc.routes';
import livekitRoutes from './livekit.routes';
import telegramRoutes from './telegram.routes';
import contactsRoutes from './contacts.routes';
import foldersRoutes from './folders.routes';
import searchRoutes from './search.routes';
import ogPreviewRoutes from './ogPreview.routes';
import scheduleRoutes from './schedule.routes';
import messagesRoutes from './messages.routes';

const router = Router();

router.use('/auth',     authRoutes);
router.use('/users',    userRoutes);
router.use('/chats',    chatRoutes);
// Каналы: пути полные внутри роутера (/channels/* и /join/:code)
router.use('/',         channelsRoutes);
router.use('/contacts', contactsRoutes);
router.use('/folders',  foldersRoutes);
router.use('/media',    mediaRoutes);
router.use('/push',     pushRoutes);
router.use('/webrtc',   webrtcRoutes);
router.use('/livekit',  livekitRoutes);
router.use('/telegram', telegramRoutes);
router.use('/search',   searchRoutes);
router.use('/og-preview', ogPreviewRoutes);
router.use('/messages', scheduleRoutes);
// View-once: пути (/:messageId/view) не пересекаются со schedule-роутами
router.use('/messages', messagesRoutes);

export default router;
