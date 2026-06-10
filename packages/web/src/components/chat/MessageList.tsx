import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { markRead } from '@/lib/socket';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import type { Message } from '@messenger/shared';

interface Props {
  chatId: string;
  messages: Message[];
}

export default function MessageList({ chatId, messages }: Props) {
  const user       = useAuthStore((s) => s.user);
  const typingUsers = useChatStore((s) => s.typingUsers[chatId]);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isTyping   = typingUsers && typingUsers.size > 0;

  // Показывать ли кнопку «вниз»
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadBelow,   setUnreadBelow]   = useState(0);
  // P2-18: до первой загрузки сообщений считаем юзера «на дне» — иначе фантомный
  // unread-badge инкрементится на первом messages.length:0→N.
  const initialLoadedRef = useRef(false);

  // ── Scroll to bottom on new message (если пользователь внизу) ───────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    const isOwnLast = lastMsg && lastMsg.senderId === user?.id;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // P2-18: первая партия сообщений после открытия чата — всегда «прокрутить
    // к низу», без unread-badge.
    if (!initialLoadedRef.current && messages.length > 0) {
      initialLoadedRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      return;
    }
    // P2-10: собственные сообщения ВСЕГДА скроллим вниз. Если юзер их отправил
    // прокрученный вверх по истории — он ждёт увидеть свой текст, а не бейдж.
    if (isOwnLast || distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setUnreadBelow((n) => n + 1);
    }
  }, [messages.length, user?.id, messages]);

  useEffect(() => {
    if (isTyping) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isTyping]);

  // Начальная прокрутка вниз при открытии чата. Сбрасываем initialLoaded flag,
  // чтобы следующий батч сообщений снова считался «первым» и не показал unread-badge.
  useEffect(() => {
    initialLoadedRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    setShowScrollBtn(false);
    setUnreadBelow(0);
  }, [chatId]);

  // Отслеживаем позицию скролла
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distanceFromBottom > 120);
    if (distanceFromBottom < 120) setUnreadBelow(0);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadBelow(0);
  };

  // ── Read tracking ────────────────────────────────────────────────────────────
  // P2-11: добавляем `messages` в deps — без этого read-tracking запускался один
  // раз на открытии чата, и сообщения, прилетевшие через resync/pagination,
  // оставались неотмеченными. markRead идемпотентный на бэке, повторных хитов
  // на одно и то же сообщение бояться не надо.
  useEffect(() => {
    const unread = messages.filter(
      (m) => m.senderId !== user?.id && !m.readBy?.some((r) => r.userId === user?.id),
    );
    unread.forEach((m) => markRead(m.id, chatId));
  }, [chatId, user?.id, messages]);

  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (!lastMsg) return;
    if (lastMsg.senderId !== user?.id && !lastMsg.readBy?.some((r) => r.userId === user?.id)) {
      markRead(lastMsg.id, chatId);
    }
  }, [lastMsg?.id, chatId, user?.id]);

  const groups = groupByDate(messages.filter((m) => !m.deletedAt));

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 space-y-1"
      >
        {groups.map(({ date, msgs }) => (
          <div key={date}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-3 my-4"
            >
              <div className="flex-1 divider-grad" />
              <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium px-2">{date}</span>
              <div className="flex-1 divider-grad" />
            </motion.div>

            <AnimatePresence initial={false}>
              {msgs.map((msg, i) => {
                const isOwn = msg.senderId === user?.id;
                const prevMsg = msgs[i - 1];
                const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <MessageBubble
                      message={msg}
                      isOwn={isOwn}
                      showAvatar={!isOwn && isFirstInGroup}
                      chatId={chatId}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ))}

        {isTyping && <TypingIndicator chatId={chatId} />}
        <div ref={bottomRef} />
      </div>

      {/* ── Кнопка «прокрутить вниз» ── */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 w-11 h-11 rounded-full glass shadow-glow-soft
                       flex items-center justify-center z-10"
          >
            <ChevronDown size={20} className="text-white/80" />
            {unreadBelow > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] rounded-full
                               bg-brand-gradient text-white text-[10px] font-bold flex items-center justify-center px-0.5 shadow-glow-violet">
                {unreadBelow > 99 ? '99+' : unreadBelow}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function groupByDate(messages: Message[]): { date: string; msgs: Message[] }[] {
  const map = new Map<string, Message[]>();
  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const key = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(msg);
  }
  return Array.from(map.entries()).map(([date, msgs]) => ({ date, msgs }));
}
