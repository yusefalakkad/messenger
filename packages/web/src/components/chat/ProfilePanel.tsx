/**
 * Панель профиля собеседника — открывается при нажатии на имя в шапке.
 * Показывает: аватар, имя, @username, статус, safety number, все фото/видео из чата.
 * Для каналов: описание, число подписчиков, ссылка-приглашение (owner/admin), отписка (member).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Film, Copy, RefreshCw, QrCode, Crown, ShieldCheck, ShieldPlus, UserMinus } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import QRCodeModal from '@/components/ui/QRCodeModal';
import ImageViewer from '@/components/media/ImageViewer';
import SafetyNumberView from './SafetyNumberView';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { drawerRight, fadeUp, listParent, listChild, tap, SPRING } from '@/lib/motion';
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

  // ─── Управление участниками (группы/каналы) ─────────────────────────────────
  const isGroupOrChannel = chat.type === 'group' || chat.type === 'channel';
  const canManage  = isGroupOrChannel && (myRole === 'owner' || myRole === 'admin');
  const isOwner    = myRole === 'owner';
  const updateChat = useChatStore((s) => s.updateChat);
  // Активные участники, отсортированные: owner → admins → members.
  const sortedMembers = isGroupOrChannel
    ? [...chat.members].sort((a, b) => {
        const rank = (r: string) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2);
        return rank(a.role) - rank(b.role);
      })
    : [];

  const setMemberRole = async (targetId: string, role: 'admin' | 'member') => {
    try {
      await api.patch(`/chats/${chat.id}/members/${targetId}/role`, { role });
      updateChat(chat.id, {
        members: chat.members.map((m) => (m.userId === targetId ? { ...m, role } : m)),
      });
      toast.success(role === 'admin' ? 'Назначен админом' : 'Снят с админов');
    } catch {
      toast.error('Не удалось изменить роль');
    }
  };

  const kickMember = async (targetId: string) => {
    try {
      await api.delete(`/chats/${chat.id}/members/${targetId}`);
      updateChat(chat.id, { members: chat.members.filter((m) => m.userId !== targetId) });
      toast.success('Участник исключён');
    } catch {
      toast.error('Не удалось исключить');
    }
  };

  return (
    <>
      <motion.div
        variants={drawerRight}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="absolute inset-y-0 end-0 w-full sm:w-80 bg-dark-surface border-s border-dark-border flex flex-col z-panel shadow-e4"
      >
        {/* Шапка — h-16 единая с ChatHeader/GroupCallView */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-dark-border bg-dark-surface/80 backdrop-blur-xl flex-shrink-0 z-header">
          <h4 className="flex-1 truncate">Профиль</h4>
          <motion.button
            onClick={onClose}
            aria-label="Закрыть профиль"
            whileTap={tap}
            whileHover={{ scale: 1.04 }}
            transition={SPRING.snappy}
            className="btn-icon flex-shrink-0"
          >
            <X size={18} />
          </motion.button>
        </div>

        <motion.div
          variants={listParent}
          initial="hidden"
          animate="visible"
          className="flex-1 overflow-y-auto"
        >
          {/* Hero-блок: аватар + имя + статус */}
          <motion.div
            variants={fadeUp}
            className="relative flex flex-col items-center gap-4 px-4 pt-9 pb-8 border-b border-dark-border"
          >
            {/* Мягкий brand-glow за аватаром */}
            <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-brand-gradient opacity-[0.12] blur-3xl" aria-hidden />
            {/* QR профиля собеседника — только direct с username */}
            {chat.type === 'direct' && username && (
              <motion.button
                className="btn-icon absolute top-3 right-3 z-raised"
                aria-label="QR-код профиля"
                whileTap={tap}
                whileHover={{ scale: 1.04 }}
                transition={SPRING.snappy}
                onClick={() => setQrData({
                  value: `${window.location.origin}/u/${username}`,
                  title: name ?? `@${username}`,
                  subtitle: `@${username}`,
                })}
              >
                <QrCode size={18} />
              </motion.button>
            )}
            <div className="relative">
              <Avatar
                src={avatar}
                name={name ?? '?'}
                size="xl"
                online={chat.type === 'direct' ? isOnline : undefined}
              />
            </div>
            <div className="relative text-center px-4 min-w-0">
              <h3 className="leading-tight truncate">{name}</h3>
              {username && (
                <p className="text-primary-600 dark:text-primary-300 text-[14px] mt-1 truncate">@{username}</p>
              )}
              {otherBio && (
                <p className="text-[14px] text-content/70 mt-2 leading-snug break-words">{otherBio}</p>
              )}
              <p className={`text-[12px] leading-4 mt-2 ${isOnline ? 'text-green-400' : 'text-content/45'} tabular-nums`}>
                {chat.type === 'direct'
                  ? (isOnline ? 'в сети' : 'не в сети')
                  : isChannel
                    ? pluralSubscribers(chat.members.length)
                    : `${chat.members.length} участников`}
              </p>
              {isChannel && description && (
                <p className="text-[14px] text-content/70 mt-3 leading-snug">{description}</p>
              )}
            </div>
          </motion.div>

          {/* Safety number (только для direct-чатов с известными ключами) */}
          {chat.type === 'direct' && myPublicKey && theirPublicKey && (
            <SafetyNumberView
              myPublicKey={myPublicKey}
              theirPublicKey={theirPublicKey}
              chatId={chat.id}
            />
          )}

          {/* ── Участники / подписчики (группы и каналы) ── */}
          {isGroupOrChannel && (
            <motion.div variants={fadeUp} className="px-4 py-5 border-t border-dark-border">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">
                  {isChannel ? 'Подписчики' : 'Участники'}
                </span>
                <span className="text-[12px] text-content/40 tabular-nums">{sortedMembers.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {sortedMembers.map((m) => {
                  const isMe = m.userId === myUserId;
                  // owner меняет роли всем (кроме себя); admin может только исключать member'ов.
                  const canPromote = isOwner && !isMe && m.role === 'member';
                  const canDemote  = isOwner && !isMe && m.role === 'admin';
                  const canKick    = canManage && !isMe && m.role !== 'owner'
                    && !(myRole === 'admin' && m.role === 'admin');
                  return (
                    <div key={m.userId} className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-content/[0.04] transition-colors">
                      <Avatar src={m.user.avatar} name={m.user.displayName ?? m.user.username ?? '?'} size="sm"
                        online={m.user.status === 'online'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium truncate">
                          {m.user.displayName ?? m.user.username}{isMe && ' (вы)'}
                        </p>
                        {m.user.username && <p className="text-[12px] text-content/45 truncate">@{m.user.username}</p>}
                      </div>
                      {m.role === 'owner' && <Crown size={15} className="text-amber-400 flex-shrink-0" aria-label="Владелец" />}
                      {m.role === 'admin' && <ShieldCheck size={15} className="text-primary-500 dark:text-primary-300 flex-shrink-0" aria-label="Админ" />}
                      {canPromote && (
                        <button onClick={() => setMemberRole(m.userId, 'admin')} title="Назначить админом"
                          aria-label="Назначить админом" className="btn-icon btn-icon-sm text-content/55 hover:text-primary-500 flex-shrink-0">
                          <ShieldPlus size={16} />
                        </button>
                      )}
                      {canDemote && (
                        <button onClick={() => setMemberRole(m.userId, 'member')} title="Снять с админов"
                          aria-label="Снять с админов" className="btn-icon btn-icon-sm text-content/55 hover:text-amber-400 flex-shrink-0">
                          <ShieldCheck size={16} />
                        </button>
                      )}
                      {canKick && (
                        <button onClick={() => kickMember(m.userId)} title="Исключить"
                          aria-label="Исключить" className="btn-icon btn-icon-sm text-content/55 hover:text-rose-400 flex-shrink-0">
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Медиа-галерея */}
          <motion.div variants={fadeUp} className="px-4 py-5">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">Фото и видео</span>
              {!loading && media.length > 0 && (
                <span className="text-[12px] text-content/40 tabular-nums">{media.length}</span>
              )}
            </div>

            {loading ? (
              // Skeleton-плейсхолдеры вместо голого спиннера
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton aspect-square rounded-md" />
                ))}
              </div>
            ) : media.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-16 h-16 rounded-2xl bg-dark-card border border-dark-border shadow-glow-violet flex items-center justify-center text-content/45">
                  <ImageIcon size={26} />
                </div>
                <div className="text-center">
                  <p className="text-[15px] text-content/80 font-medium">Пока нет медиа</p>
                  <p className="text-[13px] text-content/45 mt-0.5">Фото и видео из чата появятся здесь</p>
                </div>
              </div>
            ) : (
              <motion.div
                variants={listParent}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-3 gap-1.5"
              >
                {media.map((item, i) => (
                  <motion.button
                    key={i}
                    variants={listChild}
                    whileTap={tap}
                    className="relative aspect-square rounded-md overflow-hidden bg-dark-card group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
                    onClick={() => setViewer({ src: item.url, type: item.type })}
                    aria-label={item.type === 'video' ? 'Открыть видео' : 'Открыть фото'}
                  >
                    <img
                      src={item.thumbnailUrl ?? item.url}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                    {/* Затемнение по hover для глубины */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200 pointer-events-none" />
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center shadow-e2">
                          <Film size={15} className="text-white" />
                        </div>
                      </div>
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>

          {/* Блокировка собеседника — только direct */}
          {chat.type === 'direct' && otherUserId && (
            <motion.div variants={fadeUp} className="px-4 pb-6">
              {blocked ? (
                <motion.button whileTap={tap} transition={SPRING.snappy} className="btn-ghost btn-block" onClick={handleUnblock}>
                  Разблокировать
                </motion.button>
              ) : (
                <motion.button whileTap={tap} transition={SPRING.snappy} className="btn-danger btn-block" onClick={() => setConfirmBlock(true)}>
                  Заблокировать пользователя
                </motion.button>
              )}
            </motion.div>
          )}

          {/* Ссылка-приглашение — канал, owner/admin */}
          {isChannelAdmin && (
            <motion.div variants={fadeUp} className="px-4 py-5 border-t border-dark-border">
              <div className="mb-3 px-1">
                <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">Ссылка-приглашение</span>
              </div>
              <div className="surface-1 px-3 py-2.5 rounded-lg font-mono text-[12px] text-content/80 truncate">
                {inviteLink ?? '…'}
              </div>
              <div className="flex gap-2 mt-2.5">
                <motion.button
                  whileTap={tap}
                  transition={SPRING.snappy}
                  className="btn-ghost btn-sm flex-1"
                  onClick={copyInvite}
                  disabled={!inviteLink}
                >
                  <Copy size={15} />
                  Копировать
                </motion.button>
                <motion.button
                  whileTap={tap}
                  transition={SPRING.snappy}
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
                </motion.button>
                <motion.button
                  whileTap={tap}
                  transition={SPRING.snappy}
                  className="btn-ghost btn-sm flex-1"
                  onClick={() => setConfirmRegen(true)}
                >
                  <RefreshCw size={15} />
                  Обновить
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Отписка — канал, обычный подписчик */}
          {isChannel && myRole === 'member' && (
            <motion.div variants={fadeUp} className="px-4 pb-6">
              <motion.button whileTap={tap} transition={SPRING.snappy} className="btn-danger btn-block" onClick={() => setConfirmLeave(true)}>
                Отписаться от канала
              </motion.button>
            </motion.div>
          )}
        </motion.div>
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
