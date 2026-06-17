import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Users, Settings, Search, MessageCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { haptic } from '@/lib/native';
import { SPRING, tap } from '@/lib/motion';

/**
 * Нижняя навигация для телефона — раскладка как в Telegram, цвета наши (фиолет).
 * Полноширинная панель вровень с низом, ТОТ ЖЕ фон, что у сайдбара/списка
 * (bg-dark-surface/80 + blur) — чтобы низ не выбивался. Активная вкладка просто
 * подсвечена цветом (без «пилюли»), справа — круглая кнопка поиска (как в TG).
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
      className="lg:hidden flex-shrink-0 flex items-stretch px-1 border-t border-dark-border
                 bg-dark-surface/80 backdrop-blur-xl pb-[var(--sab)]"
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
            className="flex-1 flex flex-col items-center justify-center gap-1 h-[52px]"
          >
            <span className="relative">
              <Icon
                size={25}
                className={isActive ? 'text-accent-violet' : 'text-content/45'}
                strokeWidth={isActive ? 2.3 : 2}
              />
              {showBadge && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full
                                 bg-accent-violet text-white text-[10px] font-bold leading-[18px]
                                 text-center tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            <span className={`text-[10px] leading-none ${isActive ? 'text-accent-violet font-medium' : 'text-content/45'}`}>
              {label}
            </span>
          </motion.button>
        );
      })}

      {/* Круглая кнопка поиска справа — как в Telegram. */}
      <motion.button
        type="button"
        aria-label="Поиск"
        onClick={() => { haptic.selection(); closeAll(); navigate('/'); setTimeout(focusSearch, 60); }}
        whileTap={tap}
        transition={SPRING.snappy}
        className="self-center flex-shrink-0 w-12 h-12 mx-1 rounded-full bg-content/[0.06]
                   border border-content/10 flex items-center justify-center text-content/65
                   active:bg-content/10"
      >
        <Search size={20} />
      </motion.button>
    </nav>
  );
}
