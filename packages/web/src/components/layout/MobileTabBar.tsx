import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

const TABS: { key: TabKey; i18nKey: string; Icon: typeof Users }[] = [
  { key: 'contacts', i18nKey: 'nav.contacts', Icon: Users },
  { key: 'calls',    i18nKey: 'nav.calls',    Icon: Phone },
  { key: 'chats',    i18nKey: 'nav.chats',    Icon: MessageCircle },
  { key: 'settings', i18nKey: 'nav.settings', Icon: Settings },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
        aria-label={t('nav.chats')}
      >
        {TABS.map(({ key, i18nKey, Icon }) => {
          const label = t(i18nKey);
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
              className="relative flex-1 flex flex-col items-center justify-center gap-1 h-[50px] rounded-[22px]"
            >
              {isActive && (
                <motion.span
                  layoutId="tabbar-active"
                  transition={SPRING.smooth}
                  className="absolute inset-0 rounded-[22px] bg-[#7A82FF]/25 ring-1 ring-[#7A82FF]/45"
                />
              )}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <span className="relative">
                  <Icon
                    size={24}
                    className={isActive ? 'text-[#aeb4ff]' : 'text-content/55'}
                    fill="currentColor"
                    strokeWidth={1.6}
                  />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full
                                     bg-accent-pink text-white text-[10px] font-bold leading-[17px]
                                     text-center tabular-nums">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] leading-none ${isActive ? 'text-[#aeb4ff] font-semibold' : 'text-content/55'}`}>
                  {label}
                </span>
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
