import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Users, Settings, Search, MessageCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { haptic } from '@/lib/native';
import { SPRING, tap } from '@/lib/motion';

/**
 * Нижняя навигация для телефона — Контакты · Звонки · Чаты · Настройки + круглый
 * поиск. Только на мобиле (`lg:hidden`), внутри чата её прячет ChatPage.
 *
 * Активная вкладка — производная от стора (открытый оверлей). Под активной едет
 * мягкая «пилюля» (layoutId-spring) — плавный, приятный переход между вкладками.
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

  const focusSearch = () => {
    const el = document.querySelector<HTMLInputElement>('aside input.input-pill');
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  };

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
    <nav
      className="lg:hidden flex-shrink-0 flex items-stretch gap-1 px-2 pt-1.5 liquid-glass pb-[var(--sab)]"
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
            className="relative flex-1 flex flex-col items-center justify-center gap-1 h-[52px] rounded-2xl"
          >
            {/* Мягкая пилюля под активной вкладкой — едет между табами. */}
            {isActive && (
              <motion.span
                layoutId="tabbar-active"
                transition={SPRING.smooth}
                className="absolute inset-x-1 inset-y-0.5 rounded-2xl bg-accent-violet/14 ring-1 ring-accent-violet/25"
              />
            )}
            <span className="relative z-10 flex flex-col items-center gap-1">
              <span className="relative">
                <Icon
                  size={23}
                  className={isActive ? 'text-accent-violet' : 'text-content/45'}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full
                                   bg-accent-violet text-white text-[10px] font-bold leading-[17px]
                                   text-center tabular-nums shadow-glow-violet">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span className={`text-[10.5px] leading-none ${isActive ? 'text-accent-violet font-semibold' : 'text-content/45'}`}>
                {label}
              </span>
            </span>
          </motion.button>
        );
      })}

      {/* Круглая кнопка поиска справа. */}
      <motion.button
        type="button"
        aria-label="Поиск"
        onClick={() => { haptic.selection(); closeAll(); navigate('/'); setTimeout(focusSearch, 60); }}
        whileTap={tap}
        transition={SPRING.snappy}
        className="self-center flex-shrink-0 w-11 h-11 ml-0.5 mr-1 rounded-full liquid-glass
                   flex items-center justify-center text-content/75 active:opacity-90"
      >
        <Search size={20} />
      </motion.button>
    </nav>
  );
}
