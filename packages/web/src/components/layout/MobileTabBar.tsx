import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Users, Settings, MessageCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { haptic } from '@/lib/native';
import { SPRING, tap } from '@/lib/motion';

/**
 * Нижняя навигация для телефона — ПЛАВАЮЩАЯ округлая капсула ПОВЕРХ контента
 * (полупрозрачное жидкое стекло с тусклым фирменным оттенком, без заливки).
 * Только на мобиле (`lg:hidden`); внутри чата её прячет ChatPage. Контент под
 * ней просвечивает — поэтому списки получают нижний отступ (pb), чтобы не
 * прятались за капсулой.
 *
 * Вкладки: Контакты · Звонки · Чаты · Настройки. Поиска тут нет — он в шапке.
 * Под активной едет мягкая пилюля (layoutId + spring).
 */
type TabKey = 'contacts' | 'calls' | 'chats' | 'settings';

const TABS: { key: TabKey; label: string; Icon: typeof Users }[] = [
  { key: 'contacts', label: 'Контакты',  Icon: Users },
  { key: 'calls',    label: 'Звонки',    Icon: Phone },
  { key: 'chats',    label: 'Чаты',      Icon: MessageCircle },
  { key: 'settings', label: 'Настройки', Icon: Settings },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const { settingsOpen, contactsOpen, callsOpen,
          setSettingsOpen, setContactsOpen, setCallsOpen } = useUIStore();

  const unread = useChatStore((s) =>
    s.chats.reduce((n, c) => n + (c.archivedAt ? 0 : (c.unreadCount ?? 0)), 0));

  const active: TabKey = settingsOpen ? 'settings' : contactsOpen ? 'contacts' : callsOpen ? 'calls' : 'chats';
  const closeAll = () => { setSettingsOpen(false); setContactsOpen(false); setCallsOpen(false); };

  const onTab = (key: TabKey) => {
    haptic.selection();
    closeAll();
    if (key === 'chats')    navigate('/');
    if (key === 'contacts') setContactsOpen(true);
    if (key === 'calls')    setCallsOpen(true);
    if (key === 'settings') setSettingsOpen(true);
  };

  return (
    // Плавающий слой поверх контента: capsule по центру, над safe-area.
    <div className="lg:hidden absolute inset-x-0 bottom-0 z-40 flex justify-center
                    px-3 pb-[calc(var(--sab)+0.55rem)] pointer-events-none">
      <nav
        className="pointer-events-auto w-full max-w-md flex items-stretch gap-1 px-2 py-1.5
                   rounded-[28px] liquid-glass"
        role="tablist"
        aria-label="Навигация"
      >
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          const showBadge = key === 'chats' && unread > 0;
          return (
            <motion.button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              onClick={() => onTab(key)}
              whileTap={tap}
              transition={SPRING.snappy}
              className="relative flex-1 flex flex-col items-center justify-center gap-1.5 h-[54px]"
            >
              <span className="relative w-12 h-8 flex items-center justify-center">
                {/* Плитка «расплавленного стекла» под иконкой; активная — фирменная. */}
                {isActive && (
                  <motion.span
                    layoutId="tabbar-active"
                    transition={SPRING.smooth}
                    className="absolute inset-0 rounded-[15px] glass-icon glass-icon--active"
                  />
                )}
                {!isActive && <span className="absolute inset-0 rounded-[15px] glass-icon opacity-70" />}
                <Icon
                  size={20}
                  className={`relative z-10 ${isActive ? 'text-white' : 'text-content/60'}`}
                  fill="currentColor"
                  fillOpacity={0.35}
                  strokeWidth={1.7}
                />
                {showBadge && (
                  <span className="absolute -top-1 -right-0.5 z-20 min-w-[16px] h-[16px] px-1 rounded-full
                                   bg-accent-pink text-white text-[9.5px] font-bold leading-[16px]
                                   text-center tabular-nums">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span className={`text-[10px] leading-none ${isActive ? 'text-accent-violet font-semibold' : 'text-content/55'}`}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
