import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useMatch, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import NavRail from '@/components/layout/NavRail';
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
  const setContactsOpen = useUIStore((s) => s.setContactsOpen);
  const setCallsOpen    = useUIStore((s) => s.setCallsOpen);

  // Внутри чата (и join/user) на мобиле скрываем таб-бар, чтобы он не перекрывал ввод.
  const inThread = !!(inChat || inJoin || inUser);

  // При открытии конкретного чата закрываем панели Контакты/Звонки (десктоп-рейл).
  useEffect(() => {
    if (inThread) { setContactsOpen(false); setCallsOpen(false); }
  }, [inThread, setContactsOpen, setCallsOpen]);

  // ── Ширина списка чатов (десктоп): тянется за разделитель, как в Telegram.
  // По умолчанию пошире (340px), хранится в localStorage. Зажата 280–560.
  const SB_MIN = 280, SB_MAX = 560, SB_DEFAULT = 340;
  const [sbWidth, setSbWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('sidebarW') ?? '', 10);
    return Number.isFinite(v) ? Math.min(SB_MAX, Math.max(SB_MIN, v)) : SB_DEFAULT;
  });
  const widthRef = useRef(sbWidth);
  const dragRef  = useRef<{ startX: number; startW: number; rtl: boolean } | null>(null);
  const setW = (w: number) => { const c = Math.min(SB_MAX, Math.max(SB_MIN, w)); widthRef.current = c; setSbWidth(c); };

  const onResizeDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: widthRef.current, rtl: document.documentElement.dir === 'rtl' };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.startX;
    setW(d.rtl ? d.startW - dx : d.startW + dx); // в RTL сайдбар справа → знак инвертируем
  };
  const onResizeUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try { localStorage.setItem('sidebarW', String(widthRef.current)); } catch { /* инкогнито */ }
  };

  useEffect(() => {
    api.get('/chats').then(({ data }) => {
      setChats(data.data ?? []);
    });
  }, [setChats]);

  return (
    <div className="relative flex flex-col h-full bg-dark-bg overflow-hidden">
      {/* Фон чата (ТОЛЬКО МОБИЛА) — океанский амбиент поверх абиссального базиса,
          тема-aware через CSS-переменные. */}
      <div
        className="lg:hidden pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{
          background: 'rgb(var(--bg-rgb))',
          backgroundImage: 'var(--app-bg-image)',
        }}
      />

      {/* Плавающий кружок-PiP — на уровне страницы (portal в body), переживает смену чата */}
      <FloatingCircle />

      <div className="relative flex flex-1 min-h-0">
        {/* Десктопный нав-рейл (76px) — Aurora; на мобиле скрыт (есть таб-бар). */}
        <NavRail />

        <div
          className={clsx(
            'flex-shrink-0 w-full lg:w-[var(--sbw)] h-full',
            inThread && 'hidden lg:block',
          )}
          style={{ ['--sbw' as string]: `${sbWidth}px` }}
        >
          <Sidebar />
        </div>

        {/* Разделитель-ручка: тянем за неё, чтобы менять ширину списка (десктоп). */}
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onDoubleClick={() => setW(SB_DEFAULT)}
          className={clsx(
            'hidden lg:block relative z-20 w-1 flex-shrink-0 cursor-col-resize group',
            inThread && 'max-lg:hidden',
          )}
          title="Потяните, чтобы изменить ширину • двойной клик — сбросить"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
          <span className="absolute inset-y-0 left-0 w-px bg-transparent group-hover:bg-primary-500/60 transition-colors" />
        </div>

        <main className={clsx(
          'flex-1 flex-col min-w-0 h-full relative',
          inThread ? 'flex' : 'hidden lg:flex',
        )}>
          {/* Плашка «сейчас играет» — вне роут-анимации, поэтому переживает смену чата */}
          <NowPlayingBar />
          {/* Десктоп: Контакты/Звонки открываются как панель в зоне переписки
              (прячутся, когда открыт конкретный чат). */}
          {!inThread && contactsOpen && (
            <div className="hidden lg:block absolute inset-0 z-30"><ContactsView /></div>
          )}
          {!inThread && callsOpen && (
            <div className="hidden lg:block absolute inset-0 z-30"><CallsView /></div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
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
