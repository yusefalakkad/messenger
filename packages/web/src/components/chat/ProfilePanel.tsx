/**
 * Панель профиля собеседника — открывается при нажатии на имя в шапке.
 * Показывает: аватар, имя, @username, статус, safety number, все фото/видео из чата.
 * Для каналов: описание, число подписчиков, ссылка-приглашение (owner/admin), отписка (member).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Film, Copy, RefreshCw, QrCode } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import QRCodeModal from '@/components/ui/QRCodeModal';
import ImageViewer from '@/components/media/ImageViewer';
import SafetyNumberView from './SafetyNumberView';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import type { Chat, ChatMember } from '@messenger/shared';

/** Русское склонение: 1 подписчик / 2 подписчика / 5 подписчиков. */
function pluralSubscribers(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} подписчик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} подписчика`;
  return `${n} подписчиков`;
}

interface MediaItem {
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  type: 'image' | 'video';
}

interface Props {
  chat: Chat;
  otherMember?: ChatMember;
  onClose: () => void;
}

export default function ProfilePanel({ chat, otherMember, onClose }: Props) {
  const [media,    setMedia]    = useState<MediaItem[]>([]);
  const [viewer,   setViewer]   = useState<{ src: string; type: 'image' | 'video' } | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Канал: ссылка-приглашение и confirm-диалоги
  const [inviteCode,   setInviteCode]   = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // QR-модалка: профиль собеседника или инвайт-ссылка канала
  const [qrData, setQrData] = useState<{ value: string; title: string; subtitle?: string } | null>(null);

  // Чёрный список: заблокирован ли собеседник (только direct)
  const [blocked,      setBlocked]      = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const navigate = useNavigate();
  const myUserId = useAuthStore((s) => s.user?.id);
  const name     = chat.type === 'direct' ? otherMember?.user.displayName : chat.name;
  const username = chat.type === 'direct' ? otherMember?.user.username   : undefined;
  const avatar   = chat.type === 'direct' ? otherMember?.user.avatar      : chat.avatar;
  const isOnline = otherMember?.user.status === 'online';
  // bio пока нет в Pick-типе ChatMember.user — бэкенд отдаёт скаляр напрямую
  const otherBio = chat.type === 'direct'
    ? (otherMember?.user as (ChatMember['user'] & { bio?: string | null }) | undefined)?.bio
    : undefined;
  const myPublicKey = chat.members.find((m) => m.userId === myUserId)?.user.publicKey;
  const theirPublicKey = otherMember?.user.publicKey;

  const otherUserId = chat.type === 'direct' ? otherMember?.userId : undefined;

  const isChannel = chat.type === 'channel';
  const myRole    = chat.members.find((m) => m.userId === myUserId)?.role;
  const isChannelAdmin = isChannel && (myRole === 'owner' || myRole === 'admin');
  // description пока нет в shared-типе Chat — бэкенд отдаёт скаляр напрямую
  const description = isChannel ? (chat as Chat & { description?: string | null }).description : undefined;
  const inviteLink  = inviteCode ? `${window.location.origin}/join/${inviteCode}` : null;

  useEffect(() => {
    api.get(`/chats/${chat.id}/media`)
      .then(({ data }) => setMedia(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chat.id]);

  // Ссылка-приглашение — только для owner/admin канала
  useEffect(() => {
    if (!isChannelAdmin) return;
    api.get(`/chats/${chat.id}/invite-code`)
      .then(({ data }) => setInviteCode(data.data?.code ?? null))
      .catch(() => {});
  }, [chat.id, isChannelAdmin]);

  // Статус блокировки — проверяем при открытии панели
  useEffect(() => {
    if (!otherUserId) return;
    api.get('/users/me/blocked')
      .then(({ data }) => {
        const list: { id: string }[] = data.data ?? [];
        setBlocked(list.some((u) => u.id === otherUserId));
      })
      .catch(() => {});
  }, [otherUserId]);

  const handleBlock = async () => {
    setConfirmBlock(false);
    if (!otherUserId) return;
    try {
      await api.post(`/users/${otherUserId}/block`);
      setBlocked(true);
      toast.success('Пользователь заблокирован');
    } catch {
      toast.error('Не удалось заблокировать');
    }
  };

  const handleUnblock = async () => {
    if (!otherUserId) return;
    try {
      await api.delete(`/users/${otherUserId}/block`);
      setBlocked(false);
      toast.success('Пользователь разблокирован');
    } catch {
      toast.error('Не удалось разблокировать');
    }
  };

  const copyInvite = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink)
      .then(() => toast.success('Ссылка скопирована'))
      .catch(() => toast.error('Не удалось скопировать'));
  };

  const regenInvite = async () => {
    setConfirmRegen(false);
    try {
      const { data } = await api.post(`/chats/${chat.id}/invite-code`);
      setInviteCode(data.data?.code ?? null);
      toast.success('Ссылка обновлена');
    } catch {
      toast.error('Не удалось обновить ссылку');
    }
  };

  const handleUnsubscribe = async () => {
    setConfirmLeave(false);
    try {
      await api.delete(`/chats/${chat.id}/members/${myUserId}`);
      navigate('/');
    } catch {
      toast.error('Не удалось отписаться');
    }
  };

  return (
    <>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute inset-y-0 right-0 w-full sm:w-80 bg-dark-surface border-l border-dark-border flex flex-col z-30 shadow-2xl"
      >
        {/* Шапка — h-16 единая с ChatHeader/GroupCallView */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-dark-border bg-dark-surface/80 backdrop-blur-xl flex-shrink-0">
          <h4 className="flex-1 truncate">Профиль</h4>
          <button
            onClick={onClose}
            aria-label="Закрыть профиль"
            className="w-10 h-10 rounded-md bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/70 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Hero-блок: аватар + имя + статус */}
          <div className="relative flex flex-col items-center gap-4 px-4 py-8 border-b border-dark-border">
            {/* QR профиля собеседника — только direct с username */}
            {chat.type === 'direct' && username && (
              <button
                className="btn-icon absolute top-3 right-3"
                aria-label="QR-код профиля"
                onClick={() => setQrData({
                  value: `${window.location.origin}/u/${username}`,
                  title: name ?? `@${username}`,
                  subtitle: `@${username}`,
                })}
              >
                <QrCode size={18} />
              </button>
            )}
            <Avatar
              src={avatar}
              name={name ?? '?'}
              size="xl"
              online={chat.type === 'direct' ? isOnline : undefined}
            />
            <div className="text-center px-4 min-w-0">
              <h3 className="leading-tight truncate">{name}</h3>
              {username && (
                <p className="text-primary-300 text-[14px] mt-1 truncate">@{username}</p>
              )}
              {otherBio && (
                <p className="text-[14px] text-white/70 mt-2 leading-snug break-words">{otherBio}</p>
              )}
              <p className={`text-[12px] leading-4 mt-2 ${isOnline ? 'text-green-400' : 'text-white/45'} tabular-nums`}>
                {chat.type === 'direct'
                  ? (isOnline ? 'в сети' : 'не в сети')
                  : isChannel
                    ? pluralSubscribers(chat.members.length)
                    : `${chat.members.length} участников`}
              </p>
              {isChannel && description && (
                <p className="text-[14px] text-white/70 mt-3 leading-snug">{description}</p>
              )}
            </div>
          </div>

          {/* Safety number (только для direct-чатов с известными ключами) */}
          {chat.type === 'direct' && myPublicKey && theirPublicKey && (
            <SafetyNumberView
              myPublicKey={myPublicKey}
              theirPublicKey={theirPublicKey}
              chatId={chat.id}
            />
          )}

          {/* Медиа-галерея */}
          <div className="px-4 py-5">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[12px] uppercase tracking-wider font-semibold text-white/55">Фото и видео</span>
              {!loading && media.length > 0 && (
                <span className="text-[12px] text-white/40 tabular-nums">{media.length}</span>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : media.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-white/35">
                <div className="w-12 h-12 rounded-md bg-white/[0.04] border border-dark-border flex items-center justify-center">
                  <ImageIcon size={22} />
                </div>
                <span className="text-[13px]">Нет медиафайлов</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {media.map((item, i) => (
                  <button
                    key={i}
                    className="relative aspect-square rounded-md overflow-hidden bg-dark-hover group focus-visible:ring-2 focus-visible:ring-primary-500/60"
                    onClick={() => setViewer({ src: item.url, type: item.type })}
                    aria-label={item.type === 'video' ? 'Открыть видео' : 'Открыть фото'}
                  >
                    <img
                      src={item.thumbnailUrl ?? item.url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
                          <Film size={15} className="text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Блокировка собеседника — только direct */}
          {chat.type === 'direct' && otherUserId && (
            <div className="px-4 pb-6">
              {blocked ? (
                <button className="btn-ghost btn-block" onClick={handleUnblock}>
                  Разблокировать
                </button>
              ) : (
                <button className="btn-danger btn-block" onClick={() => setConfirmBlock(true)}>
                  Заблокировать пользователя
                </button>
              )}
            </div>
          )}

          {/* Ссылка-приглашение — канал, owner/admin */}
          {isChannelAdmin && (
            <div className="px-4 py-5 border-t border-dark-border">
              <div className="mb-3 px-1">
                <span className="text-[12px] uppercase tracking-wider font-semibold text-white/55">Ссылка-приглашение</span>
              </div>
              <div className="surface-1 px-3 py-2 rounded-md font-mono text-[12px] text-white/80 truncate">
                {inviteLink ?? '…'}
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  className="btn-ghost btn-sm flex-1"
                  onClick={copyInvite}
                  disabled={!inviteLink}
                >
                  <Copy size={15} />
                  Копировать
                </button>
                <button
                  className="btn-ghost btn-sm"
                  aria-label="QR-код приглашения"
                  disabled={!inviteLink}
                  onClick={() => inviteLink && setQrData({
                    value: inviteLink,
                    title: chat.name ?? 'Канал',
                    subtitle: 'Ссылка-приглашение',
                  })}
                >
                  <QrCode size={15} />
                </button>
                <button
                  className="btn-ghost btn-sm flex-1"
                  onClick={() => setConfirmRegen(true)}
                >
                  <RefreshCw size={15} />
                  Обновить
                </button>
              </div>
            </div>
          )}

          {/* Отписка — канал, обычный подписчик */}
          {isChannel && myRole === 'member' && (
            <div className="px-4 pb-6">
              <button className="btn-danger btn-block" onClick={() => setConfirmLeave(true)}>
                Отписаться от канала
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Confirm: регенерация ссылки-приглашения */}
      <Dialog
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        title="Обновить ссылку?"
        description="Старая ссылка перестанет работать."
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirmRegen(false)}>Отмена</DialogButton>
            <DialogButton variant="primary" onClick={regenInvite}>Обновить</DialogButton>
          </>
        }
      />

      {/* Confirm: отписаться от канала */}
      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Отписаться от канала?"
        description="Канал исчезнет из списка чатов."
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirmLeave(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleUnsubscribe}>Отписаться</DialogButton>
          </>
        }
      />

      {/* Confirm: заблокировать пользователя */}
      <Dialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title="Заблокировать пользователя?"
        description="Пользователь не сможет писать вам."
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirmBlock(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleBlock}>Заблокировать</DialogButton>
          </>
        }
      />

      {/* QR-код: профиль собеседника / инвайт-ссылка */}
      <AnimatePresence>
        {qrData && (
          <QRCodeModal
            value={qrData.value}
            title={qrData.title}
            subtitle={qrData.subtitle}
            onClose={() => setQrData(null)}
          />
        )}
      </AnimatePresence>

      {/* Просмотрщик */}
      <AnimatePresence>
        {viewer && (
          <ImageViewer
            src={viewer.src}
            type={viewer.type}
            onClose={() => setViewer(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
