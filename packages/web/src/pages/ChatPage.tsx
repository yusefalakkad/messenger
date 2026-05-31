import { useEffect } from 'react';
import { Routes, Route, useMatch, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import EmptyChat from '@/components/chat/EmptyChat';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';

export default function ChatPage() {
  const setChats = useChatStore((s) => s.setChats);
  const inChat = useMatch('/chat/:chatId');
  const location = useLocation();

  useEffect(() => {
    api.get('/chats').then(({ data }) => {
      setChats(data.data ?? []);
    });
  }, [setChats]);

  return (
    <div className="flex h-full bg-dark-bg">
      <div className={clsx(
        'flex-shrink-0 w-full lg:w-auto h-full',
        inChat && 'hidden lg:block',
      )}>
        <Sidebar />
      </div>
      <main className={clsx(
        'flex-1 flex-col min-w-0 h-full relative',
        inChat ? 'flex' : 'hidden lg:flex',
      )}>
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
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
