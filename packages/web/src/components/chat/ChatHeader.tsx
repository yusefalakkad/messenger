import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, Video, Search, MoreVertical, ShieldCheck, Trash2, ChevronLeft, Users, Timer, Hourglass, Palette, Bookmark } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx } from 'clsx';
import { AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import ProfilePanel from './ProfilePanel';
import ChatSearch from './ChatSearch';
import WallpaperPicker from './WallpaperPicker';
import { isChatE2E } from '@/lib/e2e';
import { initiateCall, setChatTtl, setSlowMode } from '@/lib/socket';
import { useCallStore } from '@/stores/call.store';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Chat, ChatMember } from '@messenger/shared';

interface Props {
  chat: Chat;
  otherMember?: ChatMember;
}

// Пресеты автоудаления сообщений (null = выключено)
const TTL_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: 'Выключено', seconds: null },
  { label: '1 час',     seconds: 3600 },
  { label: '24 часа',   seconds: 86400 },
  { label: '7 дней',    seconds: 604800 },
  { label: '90 дней',   seconds: 7776000 },
];

// Пресеты медленного режима (null = выключен)
const SLOW_MODE_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: 'Выключен', seconds: null },
  { label: '10 секунд', seconds: 10 },
  { label: '30 секунд', seconds: 30 },
  { label: '1 минута',  seconds: 60 },
  { label: '5 минут',   seconds: 300 },
  { label: '15 минут',  seconds: 900 },
  { label: '1 час',     seconds: 3600 },
];

export default function ChatHeader({ chat, otherMember }: Props) {
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu,    setShowMenu]    = useState(false);
  const [showSearch,  setShowSearch]  = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showTtl,      setShowTtl]      = useState(false);
  const [showSlowMode, setShowSlowMode] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const myUserId  = useAuthStore((s) => s.user?.id);
  const setOutgoing = useCallStore((s) => s.setOutgoing);
  const setGroupCall = useCallStore((s) => s.setGroupCall);
  const activeGroupCall = useCallStore((s) => s.group);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const [startingGroupCall, setStartingGroupCall] = useState(false);

  const { t } = useTranslation();
  const isChannel = chat.type === 'channel';
  const isSaved   = chat.type === 'saved';
  // Моя роль в чате — медленный режим настраивают только owner/admin групп и каналов
  const myRole = chat.members.find((m) => m.userId === myUserId)?.role;
  const canSetSlowMode =
    (chat.type === 'group' || chat.type === 'channel') &&
    (myRole === 'owner' || myRole === 'admin');
  const name     = isSaved ? t('chat.saved') : chat.type === 'direct' ? otherMember?.user.displayName : chat.name;
  const avatar   = chat.type === 'direct' ? otherMember?.user.avatar : chat.avatar;
  const isOnline = otherMember?.user.status === 'online';
  // «Избранное» — личное хранилище, не показываем индикатор шифрования.
  const e2e      = !isSaved && isChatE2E(chat);
  const subtitle = isSaved
    ? t('chat.savedSub')
    : chat.type === 'group'
      ? `${chat.members.length} участников`
      : isChannel
        ? `${chat.members.length} ${pluralRu(chat.members.length, 'подписчик', 'подписчика', 'подписчиков')}`
        : formatLastSeen(isOnline, otherMember?.user.lastSeenAt);

  const peerId = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== myUserId)?.userId
    : undefined;

  const startCall = useCallback((callType: 'audio' | 'video') => {
    if (!peerId) return;
    // Busy-guard (исходящая сторона): нельзя начать второй звонок поверх текущего —
    // иначе active + outgoing висят одновременно и оба ломаются. Симметрично P1-4
    // на входящей стороне (socket.ts call:incoming).
    const cs = useCallStore.getState();
    if (cs.active || cs.outgoing || cs.incoming || cs.group) {
      toast.error('Сначала завершите текущий звонок');
      return;
    }
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    initiateCall(callId, peerId, chat.id, callType);
    setOutgoing({ callId, chatId: chat.id, peerId, callType });
  }, [peerId, chat.id, setOutgoing]);

  // Групповой звонок через LiveKit SFU. Совершенно отдельный от 1-на-1:
  // запрашиваем токен у бэка, открываем GroupCallView, который сам коннектится.
  const startGroupCall = useCallback(async () => {
    if (chat.type !== 'group' || startingGroupCall) return;
    // Если уже в групповом звонке этого же чата — просто разворачиваем.
    if (activeGroupCall?.chatId === chat.id) {
      useCallStore.getState().setGroupMinimized(false);
      return;
    }
    if (activeGroupCall) {
      toast.error('Вы уже в групповом звонке');
      return;
    }
    setStartingGroupCall(true);
    try {
      const { data } = await api.post('/livekit/token', { chatId: chat.id });
      const payload = data?.data as { token: string; url: string; room: string } | undefined;
      if (!payload?.token || !payload?.url) {
        toast.error('Не удалось получить токен звонка');
        return;
      }
      setGroupCall({
        chatId:    chat.id,
        chatName:  chat.name ?? 'Групповой звонок',
        url:       payload.url,
        token:     payload.token,
        room:      payload.room,
        startedAt: new Date(),
        minimized: false,
      });
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'LIVEKIT_DISABLED') {
        toast.error('Групповые звонки временно недоступны');
      } else {
        toast.error('Не удалось начать звонок');
      }
    } finally {
      setStartingGroupCall(false);
    }
  }, [chat.id, chat.name, chat.type, activeGroupCall, setGroupCall, startingGroupCall]);

  const handleClearChat = async () => {
    try {
      await api.delete(`/chats/${chat.id}/messages`);
      clearMessages(chat.id);
    } catch {}
    setConfirmClear(false);
    setShowMenu(false);
  };

  return (
    <>
      {/* Высота 64px (h-16), padding x16/y0 — стандарт messenger-headers по 8-сетке.
          На мобиле — h-15 (60) и компактный отступ от safe-area. */}
      <header className={clsx(
        'relative z-30 flex items-center gap-2 flex-shrink-0 h-16 px-3',
        // Мобила — плавающая стеклянная капсула (по референсу).
        'mx-2 mt-[calc(var(--sat)+0.5rem)] rounded-[24px] border border-white/20 bg-[rgba(56,51,84,0.55)] backdrop-blur-xl shadow-[0_12px_34px_-18px_rgba(0,0,0,0.6)]',
        // Десктоп — обычный бар, как был.
        'lg:mx-0 lg:mt-0 lg:px-4 lg:pt-[var(--sat)] lg:rounded-none lg:border-0 lg:bg-dark-surface/70 lg:shadow-none',
      )}>
        <IconBtn onClick={() => navigate('/')} className="lg:hidden -ml-2" title="Назад">
          <ChevronLeft size={20} />
        </IconBtn>

        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity h-full disabled:hover:opacity-100"
          onClick={() => { if (!isSaved) setShowProfile(true); }}
          disabled={isSaved}
        >
          {isSaved ? (
            <span className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0">
              <Bookmark size={18} className="text-white" />
            </span>
          ) : (
            <Avatar
              src={avatar}
              name={name ?? '?'}
              size="md"
              online={chat.type === 'direct' ? isOnline : undefined}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="truncate">{name}</h4>
              {e2e && <ShieldCheck size={13} className="text-primary-600 dark:text-primary-300 flex-shrink-0" />}
            </div>
            <p className={`flex items-center gap-1 text-[12px] leading-4 truncate mt-0.5 font-medium ${isOnline ? 'text-green-400' : 'text-content/45'}`}>
              {chat.messageTtlSeconds != null && (
                <span title="Автоудаление включено" className="flex-shrink-0 inline-flex">
                  <Timer size={11} className="text-content/45" />
                </span>
              )}
              <span className="truncate">{subtitle}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {peerId && (
            <IconBtn onClick={() => startCall('audio')} title="Аудиозвонок">
              <Phone size={18} />
            </IconBtn>
          )}
          {peerId && (
            <IconBtn onClick={() => startCall('video')} title="Видеозвонок">
              <Video size={18} />
            </IconBtn>
          )}
          {chat.type === 'group' && (
            <IconBtn
              onClick={startGroupCall}
              title="Групповой звонок"
              active={activeGroupCall?.chatId === chat.id}
              disabled={startingGroupCall}
            >
              <Users size={18} />
            </IconBtn>
          )}
          <IconBtn onClick={() => setShowSearch(true)} title="Поиск в чате">
            <Search size={18} />
          </IconBtn>

          <div className="relative">
            <IconBtn onClick={() => setShowMenu((v) => !v)} active={showMenu}>
              <MoreVertical size={18} />
            </IconBtn>
            <Dropdown open={showMenu} onClose={() => setShowMenu(false)}>
              <DropdownItem
                icon={<Timer size={16} />} label="Автоудаление"
                onClick={() => { setShowMenu(false); setShowTtl(true); }}
              />
              {canSetSlowMode && (
                <DropdownItem
                  icon={<Hourglass size={16} />} label="Медленный режим"
                  onClick={() => { setShowMenu(false); setShowSlowMode(true); }}
                />
              )}
              <DropdownItem
                icon={<Palette size={16} />} label="Обои чата"
                onClick={() => { setShowMenu(false); setShowWallpaper(true); }}
              />
              <DropdownItem
                icon={<Trash2 size={16} />} label="Очистить чат" danger
                onClick={() => { setShowMenu(false); setConfirmClear(true); }}
              />
            </Dropdown>
          </div>
        </div>
      </header>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Очистить чат?"
        description="Все сообщения будут удалены безвозвратно."
        footer={
          <>
            <DialogButton onClick={() => setConfirmClear(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleClearChat}>Очистить</DialogButton>
          </>
        }
      />

      <Dialog
        open={showTtl}
        onClose={() => setShowTtl(false)}
        title="Автоудаление"
        description="Новые сообщения будут удаляться автоматически по истечении срока."
      >
        <div className="flex flex-col gap-0.5 pb-3">
          {TTL_OPTIONS.map((opt) => {
            const active = (chat.messageTtlSeconds ?? null) === opt.seconds;
            return (
              <button
                key={opt.label}
                className={clsx(
                  'menu-item',
                  active && 'text-primary-600 dark:text-primary-300 bg-primary-500/15 hover:bg-primary-500/20',
                )}
                onClick={() => { setChatTtl(chat.id, opt.seconds); setShowTtl(false); }}
              >
                <Timer size={16} className={active ? 'text-primary-600 dark:text-primary-300' : 'text-content/45'} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={showSlowMode}
        onClose={() => setShowSlowMode(false)}
        title="Медленный режим"
        description="Участники смогут отправлять сообщения не чаще выбранного интервала. Админы не ограничены."
      >
        <div className="flex flex-col gap-0.5 pb-3">
          {SLOW_MODE_OPTIONS.map((opt) => {
            const active = (chat.slowModeSeconds ?? null) === opt.seconds;
            return (
              <button
                key={opt.label}
                className={clsx(
                  'menu-item',
                  active && 'text-primary-600 dark:text-primary-300 bg-primary-500/15 hover:bg-primary-500/20',
                )}
                onClick={() => { setSlowMode(chat.id, opt.seconds); setShowSlowMode(false); }}
              >
                <Hourglass size={16} className={active ? 'text-primary-600 dark:text-primary-300' : 'text-content/45'} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Dialog>

      <AnimatePresence>
        {showWallpaper && (
          <WallpaperPicker
            chatId={chat.id}
            current={chat.wallpaper}
            onClose={() => setShowWallpaper(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && (
          <ChatSearch chatId={chat.id} onClose={() => setShowSearch(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <ProfilePanel
            chat={chat}
            otherMember={otherMember}
            onClose={() => setShowProfile(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// «в сети» / «был(а) в сети 11 часов назад» — как в Telegram.
// Если lastSeenAt пуст (юзер скрыл «последний раз» или мы его не получили) — «не в сети».
function formatLastSeen(online: boolean, lastSeenAt?: Date | string | null): string {
  if (online) return 'в сети';
  if (!lastSeenAt) return 'не в сети';
  const d = new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return 'не в сети';
  if (Date.now() - d.getTime() < 60_000) return 'был(а) в сети только что';
  return `был(а) в сети ${formatDistanceToNowStrict(d, { locale: ru, addSuffix: false })} назад`;
}

// Русская плюрализация: 1 подписчик, 2 подписчика, 5 подписчиков.
// 11..14 — всегда родительный мн. (одиннадцать подписчиков).
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
