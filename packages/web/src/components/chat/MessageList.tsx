import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { markRead } from '@/lib/socket';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import type { Message } from '@messenger/shared';

interface Props {
  chatId: string;
  messages: Message[];
}

// Плоский элемент виртуализированного списка: разделитель даты или сообщение.
// Группировка: showAvatar — последний в серии (аватар внизу, как iMessage);
// showName — первый в серии (имя сверху); isCont — продолжение серии (плотнее).
type ListItem =
  | { kind: 'date'; label: string }
  | { kind: 'msg'; msg: Message; isOwn: boolean; showAvatar: boolean; showName: boolean; isCont: boolean };

export default function MessageList({ chatId, messages }: Props) {
  const user        = useAuthStore((s) => s.user);
  const typingUsers = useChatStore((s) => s.typingUsers[chatId]);
  // Имя отправителя над пузырём — только в группах/каналах (в direct избыточно).
  const isGroupChat = useChatStore((s) => {
    const c = s.chats.find((x) => x.id === chatId);
    return c ? c.type !== 'direct' : false;
  });
  // Нативный скролл-контейнер (вместо Virtuoso — он давал пустой рендер в проде).
  const scrollRef = useRef<HTMLDivElement>(null);
  const isTyping    = !!(typingUsers && typingUsers.size > 0);

  // ── Jump-to-message ──────────────────────────────────────────────────────────
  const jumpRequest         = useChatStore((s) => s.jumpRequest);
  const consumeJump         = useChatStore((s) => s.consumeJump);
  const setHighlightMessage = useChatStore((s) => s.setHighlightMessage);
  const mergeMessages       = useChatStore((s) => s.mergeMessages);
  const highlightTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // seq уже запрошенного /around — чтобы не дёргать API повторно, пока ждём merge
  const aroundSeqRef        = useRef<number | null>(null);

  // Показывать ли кнопку «вниз»
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadBelow,   setUnreadBelow]   = useState(0);
  // P2-18: до первой загрузки сообщений считаем юзера «на дне» — иначе фантомный
  // unread-badge инкрементится на первом messages.length:0→N.
  const initialLoadedRef = useRef(false);
  const atBottomRef      = useRef(true);
  const prevCountRef     = useRef(0);
  // Свежие messages для followOutput-колбэка без пересоздания
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Плоский список: разделители дат + сообщения ─────────────────────────────
  const items = useMemo<ListItem[]>(() => {
    const live = messages.filter((m) => !m.deletedAt);
    const out: ListItem[] = [];
    const dateLabel = (m: Message) =>
      new Date(m.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    // Серия рвётся при: смене отправителя, смене даты, или большом разрыве (>5 мин).
    const sameSeries = (a: Message, b: Message) => {
      if (a.senderId !== b.senderId) return false;
      if (dateLabel(a) !== dateLabel(b)) return false;
      const gap = Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return gap < 5 * 60 * 1000;
    };
    let prevDate: string | null = null;
    for (let i = 0; i < live.length; i++) {
      const msg = live[i];
      const label = dateLabel(msg);
      if (label !== prevDate) { out.push({ kind: 'date', label }); prevDate = label; }
      const isOwn = msg.senderId === user?.id;
      const prev = live[i - 1];
      const next = live[i + 1];
      const isCont      = !!prev && sameSeries(prev, msg) && dateLabel(prev) === label;
      const isLastInSer = !next || !sameSeries(msg, next);
      const isFirstInSer = !isCont;
      out.push({
        kind: 'msg', msg, isOwn,
        showAvatar: !isOwn && isLastInSer,                  // аватар у последнего в серии
        showName:   !isOwn && isFirstInSer && isGroupChat,  // имя у первого — только в группах
        isCont,
      });
    }
    return out;
  }, [messages, user?.id, isGroupChat]);

  // Прокрутка к низу контейнера.
  const scrollToBottomEl = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // ── Прыжок к сообщению по jumpRequest из store ───────────────────────────────
  // Скроллим к DOM-узлу с data-mid; если сообщения нет в загруженных — догружаем
  // окрестность через /messages/around (эффект перезапустится после merge).
  useEffect(() => {
    if (!jumpRequest || jumpRequest.chatId !== chatId) return;
    const { messageId, seq } = jumpRequest;
    const node = scrollRef.current?.querySelector(`[data-mid="${messageId}"]`);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightMessage(messageId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightMessage(null), 2000);
      consumeJump();
      return;
    }
    if (aroundSeqRef.current === seq) return;
    aroundSeqRef.current = seq;
    api
      .get(`/chats/${chatId}/messages/around`, { params: { messageId } })
      .then(({ data }) => {
        const around: Message[] = data.data ?? [];
        mergeMessages(chatId, around);
        if (!around.some((m) => m.id === messageId && !m.deletedAt)) consumeJump();
      })
      .catch(() => consumeJump());
  }, [jumpRequest, items, chatId, consumeJump, setHighlightMessage, mergeMessages]);

  // Очистка таймера подсветки при размонтировании
  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // Сброс состояния при смене чата.
  useEffect(() => {
    initialLoadedRef.current = false;
    prevCountRef.current = 0;
    atBottomRef.current = true;
    setShowScrollBtn(false);
    setUnreadBelow(0);
  }, [chatId]);

  // ── Авто-скролл при появлении новых сообщений ────────────────────────────────
  // Первая партия — мгновенно к низу. Дальше: свои сообщения и «когда внизу» —
  // плавно к низу; чужие при прокрутке вверх — инкремент unread-бейджа.
  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!initialLoadedRef.current) {
      if (messages.length > 0) {
        initialLoadedRef.current = true;
        // requestAnimationFrame — дождаться отрисовки пузырей перед скроллом.
        requestAnimationFrame(() => scrollToBottomEl('auto'));
      }
      return;
    }
    if (messages.length <= prevCount) return;
    const last = messages[messages.length - 1];
    const isOwnLast = !!last && last.senderId === user?.id;
    if (isOwnLast || atBottomRef.current) {
      requestAnimationFrame(() => scrollToBottomEl('smooth'));
    } else {
      setUnreadBelow((n) => n + 1);
    }
  }, [messages.length, user?.id, messages, scrollToBottomEl]);

  useEffect(() => {
    if (isTyping && atBottomRef.current) requestAnimationFrame(() => scrollToBottomEl('smooth'));
  }, [isTyping, scrollToBottomEl]);

  // Отслеживаем позицию скролла (порог 120px от низа).
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 120;
    atBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
    if (atBottom) setUnreadBelow(0);
  }, []);

  const scrollToBottom = () => {
    scrollToBottomEl('smooth');
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

  // ── Рендер одной строки списка ──────────────────────────────────────────────
  const renderRow = (item: ListItem) => {
    if (item.kind === 'date') {
      return (
        <div key={`date-${item.label}`} className="flex items-center justify-center py-3 px-4">
          <span className="text-[11px] text-white/55 font-semibold uppercase tracking-wider
                       px-3 py-1 rounded-full bg-black/25 backdrop-blur-md border border-white/[0.06]">
            {item.label}
          </span>
        </div>
      );
    }
    // Continuation — плотнее (2px), новая серия — воздух (10px сверху).
    return (
      <div
        key={item.msg.id}
        data-mid={item.msg.id}
        className={item.isCont ? 'px-4 pt-0.5 flow-root' : 'px-4 pt-2.5 flow-root'}
      >
        <MessageBubble
          message={item.msg}
          isOwn={item.isOwn}
          showAvatar={item.showAvatar}
          showName={item.showName}
          isCont={item.isCont}
          chatId={chatId}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden pt-4"
      >
        {items.map(renderRow)}
        {/* Индикатор «печатает…» */}
        <div className="px-4 pb-4 pt-1">
          {isTyping && <TypingIndicator chatId={chatId} />}
        </div>
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
            <ChevronDown size={20} className="text-content/80" />
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
