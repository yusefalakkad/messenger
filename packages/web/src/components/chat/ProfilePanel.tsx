/**
 * Панель профиля собеседника — открывается при нажатии на имя в шапке.
 * Показывает: аватар, имя, @username, статус, safety number, все фото/видео из чата.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Film } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ImageViewer from '@/components/media/ImageViewer';
import SafetyNumberView from './SafetyNumberView';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { Chat, ChatMember } from '@messenger/shared';

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

  const myUserId = useAuthStore((s) => s.user?.id);
  const name     = chat.type === 'direct' ? otherMember?.user.displayName : chat.name;
  const username = chat.type === 'direct' ? otherMember?.user.username   : undefined;
  const avatar   = chat.type === 'direct' ? otherMember?.user.avatar      : chat.avatar;
  const isOnline = otherMember?.user.status === 'online';
  const myPublicKey = chat.members.find((m) => m.userId === myUserId)?.user.publicKey;
  const theirPublicKey = otherMember?.user.publicKey;

  useEffect(() => {
    api.get(`/chats/${chat.id}/media`)
      .then(({ data }) => setMedia(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chat.id]);

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
          <div className="flex flex-col items-center gap-4 px-4 py-8 border-b border-dark-border">
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
              <p className={`text-[12px] leading-4 mt-2 ${isOnline ? 'text-green-400' : 'text-white/45'}`}>
                {chat.type === 'direct'
                  ? (isOnline ? 'в сети' : 'не в сети')
                  : `${chat.members.length} участников`}
              </p>
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
        </div>
      </motion.div>

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
