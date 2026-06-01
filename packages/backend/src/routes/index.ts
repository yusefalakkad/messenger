import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import chatRoutes from './chat.routes';
import mediaRoutes from './media.routes';
import pushRoutes from './push.routes';
import webrtcRoutes from './webrtc.routes';
import livekitRoutes from './livekit.routes';
import telegramRoutes from './telegram.routes';
import contactsRoutes from './contacts.routes';

const router = Router();

router.use('/auth',     authRoutes);
router.use('/users',    userRoutes);
router.use('/chats',    chatRoutes);
router.use('/contacts', contactsRoutes);
router.use('/media',    mediaRoutes);
router.use('/push',     pushRoutes);
router.use('/webrtc',   webrtcRoutes);
router.use('/livekit',  livekitRoutes);
router.use('/telegram', telegramRoutes);

export default router;
