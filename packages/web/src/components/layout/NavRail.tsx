import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, Bookmark, Users, Settings, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import OceanLogo from '@/components/ui/OceanLogo';
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
type RailKey = 'chats' | 'calls' | 'saved' | 'archive' | 'contacts';

export default function NavRail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const chats = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const { settingsOpen, contactsOpen, callsOpen, archiveOpen,
          setSettingsOpen, setContactsOpen, setCallsOpen, setArchiveOpen } = useUIStore();

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

  const items: { key: RailKey; Icon: typeof Users; label: string; on: boolean; onClick: () => void }[] = [
    { key: 'chats',    Icon: MessageCircle, label: t('nav.chats'),    on: active === 'chats' && !archiveOpen, onClick: () => { closeAll(); navigate('/'); } },
    { key: 'calls',    Icon: Phone,         label: t('nav.calls'),    on: active === 'calls',    onClick: () => { setSettingsOpen(false); setContactsOpen(false); setCallsOpen(true); } },
    { key: 'saved',    Icon: Bookmark,      label: t('chat.saved'),   on: false,                 onClick: openSaved },
    { key: 'archive',  Icon: Archive,       label: t('chat.archive'), on: archiveOpen,           onClick: () => setArchiveOpen(true) },
  ];

  return (
    <div className="hidden lg:flex w-[76px] flex-shrink-0 flex-col items-center bg-dark-bg border-e border-dark-border pb-4">
      {/* Зона под traffic lights / перетаскивание окна (Electron) */}
      <div className="h-[52px] w-full" style={{ WebkitAppRegion: 'drag' } as Record<string, string>} />

      {/* Логотип-плитка */}
      <motion.button
        onClick={() => { closeAll(); navigate('/'); }}
        whileTap={tap}
        transition={SPRING.snappy}
        className="mb-6 active:scale-95 transition-transform"
        title="ocean"
        aria-label="ocean"
      >
        <OceanLogo size={42} />
      </motion.button>

      {/* Навигация */}
      <div className="flex flex-col gap-2.5">
        {items.map(({ key, Icon, label, on, onClick }) => {
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
              {on && <span className="absolute -left-[15px] top-[13px] w-[3px] h-5 rounded-full" style={{ background: 'linear-gradient(180deg,#16E0E6,#7A2BFF)', boxShadow: '0 0 10px rgba(22,224,230,0.6)' }} />}
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
