import { useEffect } from 'react';
import { Routes, Route, useMatch, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import MobileTabBar from '@/components/layout/MobileTabBar';
import ContactsView from '@/components/layout/ContactsView';
import CallsView from '@/components/layout/CallsView';
import ChatWindow from '@/components/chat/ChatWindow';
import EmptyChat from '@/components/chat/EmptyChat';
import JoinByCode from '@/components/chat/JoinByCode';
import AddByUsername from '@/components/chat/AddByUsername';
import NowPlayingBar from '@/components/chat/NowPlayingBar';
import FloatingCircle from '@/components/chat/FloatingCircle';
import SettingsDialog from '@/components/settings/SettingsDialog';
import { useChatStore } from '@/stores/chat.store';
import { useUIStore } from '@/stores/ui.store';
import { SPRING } from '@/lib/motion';
import { api } from '@/lib/api';

export default function ChatPage() {
  const setChats = useChatStore((s) => s.setChats);
  const inChat = useMatch('/chat/:chatId');
  // /join/:code и /u/:username тоже показываем в main-панели (на мобиле — вместо сайдбара)
  const inJoin = useMatch('/join/:code');
  const inUser = useMatch('/u/:username');
  const location = useLocation();

  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const contactsOpen = useUIStore((s) => s.contactsOpen);
  const callsOpen    = useUIStore((s) => s.callsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  // Внутри чата (и join/user) на мобиле скрываем таб-бар, чтобы он не перекрывал ввод.
  const inThread = !!(inChat || inJoin || inUser);

  useEffect(() => {
    api.get('/chats').then(({ data }) => {
      setChats(data.data ?? []);
    });
  }, [setChats]);

  return (
    <div className="relative flex flex-col h-full bg-dark-bg overflow-hidden">
      {/* Фирменное свечение в фоне — чтобы матовое стекло (таб-бар, панели) «играло»
          и преломляло цвет, как в glassmorphism. Только мобила, тускло, не мешает чтению. */}
      <div className="lg:hidden pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-spot-violet blur-3xl opacity-60" />
        <div className="absolute top-1/3 -right-20 w-64 h-64 rounded-full bg-spot-pink blur-3xl opacity-40" />
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[460px] h-80 rounded-full bg-spot-pink blur-3xl opacity-55" />
      </div>

      {/* Плавающий кружок-PiP — на уровне страницы (portal в body), переживает смену чата */}
      <FloatingCircle />

      <div className="relative flex flex-1 min-h-0">
        <div className={clsx(
          'flex-shrink-0 w-full lg:w-auto h-full',
          inThread && 'hidden lg:block',
        )}>
          <Sidebar />
        </div>
        <main className={clsx(
          'flex-1 flex-col min-w-0 h-full relative',
          inThread ? 'flex' : 'hidden lg:flex',
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

        {/* Мобильные вкладки-панели поверх контента (таб-бар остаётся под ними).
            Обёртка motion даёт плавный slide+fade; панели заполняют её. */}
        <AnimatePresence>
          {!inThread && contactsOpen && (
            <motion.div
              key="contacts"
              className="lg:hidden absolute inset-0 z-30"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={SPRING.smooth}
            >
              <ContactsView />
            </motion.div>
          )}
          {!inThread && callsOpen && (
            <motion.div
              key="calls"
              className="lg:hidden absolute inset-0 z-30"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={SPRING.smooth}
            >
              <CallsView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Нижняя навигация — только мобила, прячется внутри чата. */}
      {!inThread && <MobileTabBar />}

      {/* Глобальные оверлеи (открываются из сайдбара и таб-бара). */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
