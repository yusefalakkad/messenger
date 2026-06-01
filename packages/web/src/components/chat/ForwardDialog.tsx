import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, CornerUpRight } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { sendMessage } from '@/lib/socket';
import { isChatE2E, getRecipientPublicKey, encryptText, decryptMessage } from '@/lib/e2e';
import type { Message } from '@messenger/shared';

interface Props { message: Message; onClose: () => void; }

export default function ForwardDialog({ message, onClose }: Props) {
  const chats = useChatStore((s) => s.chats);
  const user  = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  const filtered = chats.filter((c) => {
    if (!q.trim()) return true;
    const name = c.type === 'group' ? c.name : c.members.find((m) => m.userId !== user?.id)?.user.displayName;
    return name?.toLowerCase().includes(q.toLowerCase());
  });

  const handleForward = async (targetChatId: string) => {
    if (!user) return;
    setSending(targetChatId);
    try {
      const sourceChat = chats.find((c) => c.id === message.chatId);
      const targetChat = chats.find((c) => c.id === targetChatId);
      const { privateKey } = useAuthStore.getState();
      if (!targetChat) return;

      // Текст — расшифровать если нужно, перешифровать для нового чата
      if (message.type === 'text') {
        let plainText = message.content ?? '';
        if (message.encrypted && sourceChat && privateKey) {
          plainText = await decryptMessage(message, sourceChat, user.id, privateKey);
        }
        if (isChatE2E(targetChat) && privateKey) {
          const pub = getRecipientPublicKey(targetChat, user.id);
          if (pub) {
            const { ciphertext, nonce } = await encryptText(targetChatId, plainText, pub, privateKey);
            sendMessage({ chatId: targetChatId, type: 'text', content: ciphertext, nonce, encrypted: true, forwardedFromId: message.id });
          } else {
            sendMessage({ chatId: targetChatId, type: 'text', content: plainText, forwardedFromId: message.id });
          }
        } else {
          sendMessage({ chatId: targetChatId, type: 'text', content: plainText, forwardedFromId: message.id });
        }
      } else if (message.media) {
        // Медиа — переиспользуем тот же objectName (Media создаётся новая, но URL одинаковый)
        sendMessage({
          chatId: targetChatId,
          type:    message.type,
          mediaData: {
            url:          message.media.url,
            thumbnailUrl: message.media.thumbnailUrl,
            mimeType:     message.media.mimeType,
            size:         message.media.size,
            width:        message.media.width,
            height:       message.media.height,
            duration:     message.media.duration,
            waveform:     message.media.waveform,
          },
          forwardedFromId: message.id,
        });
      }
      onClose();
    } catch (err) {
      console.error('[Forward] failed', err);
    } finally {
      setSending(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-dark-card border border-dark-border rounded-3xl shadow-2xl shadow-black/60 w-[28rem] max-h-[80vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border/60">
            <CornerUpRight size={18} className="text-primary-400" />
            <h3 className="font-semibold text-base flex-1">Переслать в...</h3>
            <button onClick={onClose} className="btn-icon btn-icon-sm">
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-dark-border/40">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск чата..."
                className="input-pill w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-white/40">Нет подходящих чатов</div>
            )}
            {filtered.map((c) => {
              const other = c.type === 'direct' ? c.members.find((m) => m.userId !== user?.id) : null;
              const name = c.type === 'group' ? c.name : other?.user.displayName ?? '?';
              const avatar = c.type === 'group' ? c.avatar : other?.user.avatar;
              return (
                <button
                  key={c.id}
                  disabled={sending === c.id}
                  onClick={() => handleForward(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-hover transition-colors text-left disabled:opacity-50"
                >
                  <Avatar src={avatar} name={name ?? '?'} size="sm" />
                  <span className="flex-1 text-sm font-medium truncate">{name}</span>
                  {sending === c.id && (
                    <span className="text-xs text-primary-400">отправка...</span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
