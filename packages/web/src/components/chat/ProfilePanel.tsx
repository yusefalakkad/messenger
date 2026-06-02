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
        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <span className="font-semibold text-sm">Профиль</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-dark-hover flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Аватар + инфо */}
          <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-dark-border">
            <Avatar
              src={avatar}
              name={name ?? '?'}
              size="xl"
              online={chat.type === 'direct' ? isOnline : undefined}
            />
            <div className="text-center">
              <h2 className="font-bold text-lg leading-tight">{name}</h2>
              {username && (
                <p className="text-primary-400 text-sm mt-0.5">@{username}</p>
              )}
              <p className={`text-xs mt-1 ${isOnline ? 'text-green-400' : 'text-white/40'}`}>
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
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white/80">Фото и видео</span>
              <span className="text-xs text-white/40">{media.length}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : media.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-white/30">
                <ImageIcon size={32} />
                <span className="text-xs">Нет медиафайлов</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {media.map((item, i) => (
                  <button
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden bg-dark-hover group"
                    onClick={() => setViewer({ src: item.url, type: item.type })}
                  >
                    <img
                      src={item.thumbnailUrl ?? item.url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                          <Film size={14} className="text-white" />
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
