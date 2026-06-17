import { useEffect } from 'react';
import { Routes, Route, useMatch, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import EmptyChat from '@/components/chat/EmptyChat';
import JoinByCode from '@/components/chat/JoinByCode';
import AddByUsername from '@/components/chat/AddByUsername';
import NowPlayingBar from '@/components/chat/NowPlayingBar';
import FloatingCircle from '@/components/chat/FloatingCircle';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';

export default function ChatPage() {
  const setChats = useChatStore((s) => s.setChats);
  const inChat = useMatch('/chat/:chatId');
  // /join/:code и /u/:username тоже показываем в main-панели (на мобиле — вместо сайдбара)
  const inJoin = useMatch('/join/:code');
  const inUser = useMatch('/u/:username');
  const location = useLocation();

  useEffect(() => {
    api.get('/chats').then(({ data }) => {
      setChats(data.data ?? []);
    });
  }, [setChats]);

  return (
    <div className="flex h-full bg-dark-bg">
      {/* Плавающий кружок-PiP — на уровне страницы (portal в body), переживает смену чата */}
      <FloatingCircle />
      <div className={clsx(
        'flex-shrink-0 w-full lg:w-auto h-full',
        (inChat || inJoin || inUser) && 'hidden lg:block',
      )}>
        <Sidebar />
      </div>
      <main className={clsx(
        'flex-1 flex-col min-w-0 h-full relative',
        (inChat || inJoin || inUser) ? 'flex' : 'hidden lg:flex',
      )}>
        {/* Плашка «сейчас играет» — вне роут-анимации, поэтому переживает смену чата */}
        <NowPlayingBar />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col flex-1 min-h-0"
          >
            <Routes location={location}>
              <Route path="/" element={<EmptyChat />} />
              <Route path="/chat/:chatId" element={<ChatWindow />} />
              <Route path="/join/:code" element={<JoinByCode />} />
              <Route path="/u/:username" element={<AddByUsername />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
