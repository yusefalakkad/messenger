import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, CornerUpRight, AlertTriangle } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { sendMessage } from '@/lib/socket';
import { isChatE2E, getRecipientPublicKey, encryptText, decryptMessage } from '@/lib/e2e';
import type { Chat, Message } from '@messenger/shared';

interface Props { message: Message; onClose: () => void; }

export default function ForwardDialog({ message, onClose }: Props) {
  const chats = useChatStore((s) => s.chats);
  const user  = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  // P1-14: подтверждение пересылки зашифрованного → не-зашифрованного чата.
  // null = не запрашивали, иначе — целевой чат, ждём решения юзера.
  const [confirmTarget, setConfirmTarget] = useState<Chat | null>(null);

  const filtered = chats.filter((c) => {
    if (!q.trim()) return true;
    const name = c.type === 'group' ? c.name : c.members.find((m) => m.userId !== user?.id)?.user.displayName;
    return name?.toLowerCase().includes(q.toLowerCase());
  });

  const startForward = (targetChatId: string) => {
    if (!user) return;
    const targetChat = chats.find((c) => c.id === targetChatId);
    if (!targetChat) return;
    // P1-14: если источник E2E (текстовый шифрованный ИЛИ медиа с шифрованным caption),
    // а цель — НЕ E2E, показываем диалог. Иначе сразу шлём.
    const isSourceE2E = !!message.encrypted;
    if (isSourceE2E && !isChatE2E(targetChat)) {
      setConfirmTarget(targetChat);
      return;
    }
    void doForward(targetChatId);
  };

  async function doForward(targetChatId: string) {
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

          {/* P1-14: подтверждение пересылки зашифрованного → не-зашифрованный чат. */}
          {confirmTarget && (
            <div className="px-5 py-4 border-b border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-200 mb-1">Пересылка шифрованного сообщения</p>
                  <p className="text-white/70 text-xs leading-relaxed">
                    В чате «{confirmTarget.type === 'group'
                      ? confirmTarget.name
                      : confirmTarget.members.find((m) => m.userId !== user?.id)?.user.displayName ?? 'Личный чат'}»
                    нет E2E-шифрования. Сообщение будет видно серверу.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setConfirmTarget(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-hover text-white/70 hover:text-white"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => { void doForward(confirmTarget.id); setConfirmTarget(null); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/80 text-white hover:bg-amber-500"
                    >
                      Переслать
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  onClick={() => startForward(c.id)}
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
