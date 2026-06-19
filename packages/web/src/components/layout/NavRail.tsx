import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, Bookmark, Users, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';
import { tap, SPRING } from '@/lib/motion';
import type { Chat } from '@messenger/shared';

/**
 * Десктопный нав-рейл (76px) в стиле Aurora — крайняя левая колонка окна.
 * Логотип-плитка сверху, навигация (Чаты · Звонки · Избранное · Контакты),
 * снизу — настройки и аватар пользователя. Только десктоп (`hidden lg:flex`);
 * на мобиле навигация живёт в нижнем таб-баре.
 */
type RailKey = 'chats' | 'calls' | 'saved' | 'contacts';

/** Белый знак-лого (чат-бабл с вырезанной волной) на градиентной плитке. */
function RailMark() {
  const bubble =
    'M50 14C28.4 14 11 28.7 11 46.8c0 9.9 5.2 18.8 13.4 24.8 0 4.6-1.6 10.3-5.1 15.2 7.6-.7 15.2-3.4 21-7.7 3.1.7 6.3 1 9.7 1 21.6 0 39-14.7 39-32.8S71.6 14 50 14z';
  const bars: [number, number][] = [[33, 16], [41, 30], [49, 22], [57, 34], [65, 14]];
  return (
    <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <mask id="rail-mark-m">
          <path d={bubble} fill="#fff" />
          {bars.map(([x, h], i) => (
            <rect key={i} x={x} y={46 - h / 2} width="5" height={h} rx="2.5" fill="#000" />
          ))}
        </mask>
      </defs>
      <path d={bubble} fill="#fff" mask="url(#rail-mark-m)" />
    </svg>
  );
}

export default function NavRail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const chats = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const { settingsOpen, contactsOpen, callsOpen,
          setSettingsOpen, setContactsOpen, setCallsOpen } = useUIStore();

  const closeAll = () => { setSettingsOpen(false); setContactsOpen(false); setCallsOpen(false); };

  const openSaved = async () => {
    closeAll();
    const existing = chats.find((c) => c.type === 'saved');
    if (existing) { navigate(`/chat/${existing.id}`); return; }
    try {
      const { data } = await api.post('/chats/saved');
      const chat = data.data as Chat;
      if (!useChatStore.getState().chats.some((c) => c.id === chat.id)) addChat(chat);
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error('Failed to open saved messages', err);
    }
  };

  const active: RailKey = contactsOpen ? 'contacts' : callsOpen ? 'calls' : 'chats';

  const items: { key: RailKey; Icon: typeof Users; label: string; onClick: () => void }[] = [
    { key: 'chats',    Icon: MessageCircle, label: t('nav.chats'),    onClick: () => { closeAll(); navigate('/'); } },
    { key: 'calls',    Icon: Phone,         label: t('nav.calls'),    onClick: () => { setSettingsOpen(false); setContactsOpen(false); setCallsOpen(true); } },
    { key: 'saved',    Icon: Bookmark,      label: t('chat.saved'),   onClick: openSaved },
    { key: 'contacts', Icon: Users,         label: t('nav.contacts'), onClick: () => { setSettingsOpen(false); setCallsOpen(false); setContactsOpen(true); } },
  ];

  return (
    <div className="hidden lg:flex w-[76px] flex-shrink-0 flex-col items-center bg-dark-bg border-r border-dark-border pb-4">
      {/* Зона под traffic lights / перетаскивание окна (Electron) */}
      <div className="h-[52px] w-full" style={{ WebkitAppRegion: 'drag' } as Record<string, string>} />

      {/* Логотип-плитка */}
      <button
        onClick={() => { closeAll(); navigate('/'); }}
        className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center mb-6 shadow-[0_6px_18px_rgba(255,78,134,0.4)] active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg,#FF7A78 0%,#FF4E86 46%,#7A82FF 100%)' }}
        title="Dakka"
        aria-label="Dakka"
      >
        <RailMark />
      </button>

      {/* Навигация */}
      <div className="flex flex-col gap-2.5">
        {items.map(({ key, Icon, label, onClick }) => {
          const on = active === key;
          return (
            <motion.button
              key={key}
              onClick={onClick}
              whileTap={tap}
              transition={SPRING.snappy}
              title={label}
              aria-label={label}
              aria-current={on}
              className={clsx(
                'relative w-[46px] h-[46px] rounded-[14px] flex items-center justify-center transition-colors',
                on ? 'bg-dark-hover border border-dark-border' : 'border border-transparent hover:bg-dark-hover/60',
              )}
            >
              {on && <span className="absolute -left-[15px] top-[13px] w-[3px] h-5 rounded-full" style={{ background: '#FF6B72' }} />}
              <Icon size={22} strokeWidth={on ? 2 : 1.7}
                    className={on ? 'text-content' : 'text-content/40'} />
            </motion.button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Настройки + аватар */}
      <motion.button
        onClick={() => setSettingsOpen(true)}
        whileTap={tap}
        transition={SPRING.snappy}
        title={t('nav.settings')}
        aria-label={t('nav.settings')}
        className={clsx(
          'w-[46px] h-[46px] rounded-[14px] flex items-center justify-center mb-2 transition-colors',
          settingsOpen ? 'bg-dark-hover border border-dark-border text-content' : 'text-content/40 hover:bg-dark-hover/60',
        )}
      >
        <Settings size={22} strokeWidth={settingsOpen ? 2 : 1.7} />
      </motion.button>
      <button
        onClick={() => setSettingsOpen(true)}
        className="rounded-full active:scale-95 transition-transform"
        title={user?.displayName ?? ''}
        aria-label={user?.displayName ?? t('nav.settings')}
      >
        <Avatar src={user?.avatar} name={user?.displayName ?? '?'} size="md" />
      </button>
    </div>
  );
}
