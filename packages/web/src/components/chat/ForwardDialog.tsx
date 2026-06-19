import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, CornerUpRight, AlertTriangle } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { sendMessage } from '@/lib/socket';
import { isChatE2E, getRecipientPublicKey, encryptText, decryptMessage } from '@/lib/e2e';
import { backdrop, popIn, listParent, listChild, tap, SPRING } from '@/lib/motion';
import type { Chat, Message } from '@messenger/shared';

interface Props { messages: Message[]; onClose: () => void; }

export default function ForwardDialog({ messages, onClose }: Props) {
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
    // P1-14: если ХОТЬ ОДНО сообщение E2E, а цель — НЕ E2E, показываем диалог.
    const anySourceE2E = messages.some((m) => !!m.encrypted);
    if (anySourceE2E && !isChatE2E(targetChat)) {
      setConfirmTarget(targetChat);
      return;
    }
    void doForward(targetChatId);
  };

  // Пересылка одного сообщения: E2E decrypt → re-encrypt / plain / media.
  async function forwardOne(message: Message, targetChat: Chat) {
    if (!user) return;
    const targetChatId = targetChat.id;
    const sourceChat = chats.find((c) => c.id === message.chatId);
    const { privateKey } = useAuthStore.getState();

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
  }

  async function doForward(targetChatId: string) {
    if (!user) return;
    setSending(targetChatId);
    try {
      const targetChat = chats.find((c) => c.id === targetChatId);
      if (!targetChat) return;
      // Последовательно — сохраняем порядок сообщений в целевом чате
      for (const message of messages) {
        await forwardOne(message, targetChat);
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
      {/* Подложка — z-overlay */}
      <motion.div
        variants={backdrop}
        initial="hidden" animate="visible" exit="exit"
        className="fixed inset-0 z-overlay flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Карточка — z-modal */}
        <motion.div
          variants={popIn}
          initial="hidden" animate="visible" exit="exit"
          onClick={(e) => e.stopPropagation()}
          className="relative z-modal surface-2 rounded-2xl shadow-e3 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border">
            <CornerUpRight size={18} className="text-primary-400" />
            <h3 className="font-semibold text-base flex-1">
              {messages.length > 1 ? `Переслать (${messages.length})` : 'Переслать в...'}
            </h3>
            <motion.button
              whileTap={tap}
              transition={SPRING.snappy}
              onClick={onClose}
              className="btn-icon btn-icon-sm"
              aria-label="Закрыть"
            >
              <X size={16} />
            </motion.button>
          </div>

          <div className="px-4 py-3 border-b border-dark-border">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content/35 z-raised" />
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
                  <p className="text-content/70 text-xs leading-relaxed">
                    В чате «{confirmTarget.type === 'group'
                      ? confirmTarget.name
                      : confirmTarget.members.find((m) => m.userId !== user?.id)?.user.displayName ?? 'Личный чат'}»
                    нет E2E-шифрования. Сообщение будет видно серверу.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setConfirmTarget(null)}
                      className="btn-ghost btn-sm"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => { void doForward(confirmTarget.id); setConfirmTarget(null); }}
                      className="btn-sm bg-amber-500/85 text-white hover:bg-amber-500 transition"
                    >
                      Переслать
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {filtered.length === 0 && (
              // Пустое состояние с brand-glow иконкой
              <div className="flex flex-col items-center text-center px-6 py-8">
                <div className="w-14 h-14 rounded-2xl bg-brand-gradient-soft border border-dark-border shadow-glow-violet flex items-center justify-center mb-3">
                  <Search size={24} className="text-content/55" />
                </div>
                <p className="text-[15px] font-medium">Нет подходящих чатов</p>
                <p className="text-[13px] text-content/45 mt-1">Попробуйте другой запрос</p>
              </div>
            )}
            <motion.div variants={listParent} initial="hidden" animate="visible">
              {filtered.map((c) => {
                const other = c.type === 'direct' ? c.members.find((m) => m.userId !== user?.id) : null;
                const name = c.type === 'group' ? c.name : other?.user.displayName ?? '?';
                const avatar = c.type === 'group' ? c.avatar : other?.user.avatar;
                return (
                  <motion.button
                    key={c.id}
                    variants={listChild}
                    disabled={sending === c.id}
                    onClick={() => startForward(c.id)}
                    className="list-row w-full min-h-[48px] text-left disabled:opacity-50"
                  >
                    <Avatar src={avatar} name={name ?? '?'} size="sm" />
                    <span className="flex-1 text-[15px] font-medium truncate">{name}</span>
                    {sending === c.id && (
                      <span className="text-[12px] text-primary-400">отправка...</span>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
