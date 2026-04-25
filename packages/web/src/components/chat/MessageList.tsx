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

  // ── Scroll to bottom on new message (если пользователь внизу) ───────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Авто-скролл только если близко к низу (< 120px)
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setUnreadBelow((n) => n + 1);
    }
  }, [messages.length]);

  useEffect(() => {
    if (isTyping) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isTyping]);

  // Начальная прокрутка вниз при открытии чата
  useEffect(() => {
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
  useEffect(() => {
    const unread = messages.filter(
      (m) => m.senderId !== user?.id && !m.readBy?.some((r) => r.userId === user?.id),
    );
    unread.forEach((m) => markRead(m.id, chatId));
  }, [chatId, user?.id]);

  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (!lastMsg) return;
    if (lastMsg.senderId !== user?.id && !lastMsg.readBy?.some((r) => r.userId === user?.id)) {
      markRead(lastMsg.id, chatId);
    }
  }, [lastMsg?.id]);

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
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-dark-border" />
              <span className="text-xs text-white/30 px-2">{date}</span>
              <div className="flex-1 h-px bg-dark-border" />
            </div>

            <AnimatePresence initial={false}>
              {msgs.map((msg, i) => {
                const isOwn = msg.senderId === user?.id;
                const prevMsg = msgs[i - 1];
                const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
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
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-dark-card border border-dark-border
                       shadow-lg flex items-center justify-center hover:bg-dark-hover transition-colors z-10"
          >
            <ChevronDown size={18} className="text-white/70" />
            {unreadBelow > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full
                               bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5">
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
