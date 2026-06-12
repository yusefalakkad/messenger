import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle, type Components } from 'react-virtuoso';
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

// Плоский элемент виртуализированного списка: разделитель даты или сообщение
type ListItem =
  | { kind: 'date'; label: string }
  | { kind: 'msg'; msg: Message; isOwn: boolean; showAvatar: boolean };

interface ListContext {
  isTyping: boolean;
  chatId: string;
}

// «Дно» с запасом — браузер клампит до реального scrollHeight
const BOTTOM = 1_000_000_000;

// Header/Footer заменяют py-4 контейнера (px-4 перенесён в обёртки элементов,
// чтобы скроллбар оставался у края)
function ListHeader() {
  return <div className="h-4" />;
}

function ListFooter({ context }: { context?: ListContext }) {
  return (
    <div className="px-4 pb-4">
      {context?.isTyping && <TypingIndicator chatId={context.chatId} />}
    </div>
  );
}

const listComponents: Components<ListItem, ListContext> = {
  Header: ListHeader,
  Footer: ListFooter,
};

export default function MessageList({ chatId, messages }: Props) {
  const user        = useAuthStore((s) => s.user);
  const typingUsers = useChatStore((s) => s.typingUsers[chatId]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
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
    const out: ListItem[] = [];
    let prevDate: string | null = null;
    let prevSenderId: string | null = null;
    for (const msg of messages) {
      if (msg.deletedAt) continue;
      const label = new Date(msg.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      if (label !== prevDate) {
        out.push({ kind: 'date', label });
        prevDate = label;
        prevSenderId = null; // новая дата — группировка отправителя начинается заново
      }
      const isOwn = msg.senderId === user?.id;
      out.push({ kind: 'msg', msg, isOwn, showAvatar: !isOwn && prevSenderId !== msg.senderId });
      prevSenderId = msg.senderId;
    }
    return out;
  }, [messages, user?.id]);

  // ── Прыжок к сообщению по jumpRequest из store ───────────────────────────────
  // Индекс ищем в items (плоский список с date-разделителями) — именно его
  // индексами оперирует Virtuoso. Если сообщения нет в загруженных — догружаем
  // окрестность через /messages/around; mergeMessages обновит items и эффект
  // перезапустится сам.
  useEffect(() => {
    if (!jumpRequest || jumpRequest.chatId !== chatId) return;
    const { messageId, seq } = jumpRequest;
    const index = items.findIndex((it) => it.kind === 'msg' && it.msg.id === messageId);
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
      setHighlightMessage(messageId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightMessage(null), 2000);
      consumeJump();
      return;
    }
    if (aroundSeqRef.current === seq) return; // уже запросили /around — ждём merge
    aroundSeqRef.current = seq;
    api
      .get(`/chats/${chatId}/messages/around`, { params: { messageId } })
      .then(({ data }) => {
        const around: Message[] = data.data ?? [];
        mergeMessages(chatId, around);
        // Target удалён/не пришёл — items его не покажут, гасим запрос
        if (!around.some((m) => m.id === messageId && !m.deletedAt)) consumeJump();
      })
      .catch(() => consumeJump());
  }, [jumpRequest, items, chatId, consumeJump, setHighlightMessage, mergeMessages]);

  // Очистка таймера подсветки при размонтировании
  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // Сброс состояния при смене чата (Virtuoso ремаунтится через key={chatId})
  useEffect(() => {
    initialLoadedRef.current = false;
    prevCountRef.current = 0;
    atBottomRef.current = true;
    setShowScrollBtn(false);
    setUnreadBelow(0);
  }, [chatId]);

  // ── Авто-скролл Virtuoso при появлении новых элементов ───────────────────────
  // P2-10: собственные сообщения ВСЕГДА скроллим вниз. Если юзер их отправил
  // прокрученный вверх по истории — он ждёт увидеть свой текст, а не бейдж.
  const followOutput = useCallback((isAtBottom: boolean): 'smooth' | 'auto' | false => {
    // P2-18: первая партия после открытия чата — мгновенно к низу
    if (!initialLoadedRef.current) return 'auto';
    const msgs = messagesRef.current;
    const last = msgs[msgs.length - 1];
    const isOwnLast = !!last && last.senderId === user?.id;
    return isOwnLast || isAtBottom ? 'smooth' : false;
  }, [user?.id]);

  // Счётчик непрочитанных под кнопкой «вниз»: чужие сообщения, прилетевшие
  // пока юзер прокручен вверх (скролл для своих/при-низу делает followOutput)
  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!initialLoadedRef.current) {
      if (messages.length > 0) {
        initialLoadedRef.current = true;
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' });
      }
      return;
    }
    if (messages.length <= prevCount) return;
    const last = messages[messages.length - 1];
    const isOwnLast = !!last && last.senderId === user?.id;
    if (!isOwnLast && !atBottomRef.current) setUnreadBelow((n) => n + 1);
  }, [messages.length, user?.id, messages]);

  useEffect(() => {
    if (isTyping) virtuosoRef.current?.scrollTo({ top: BOTTOM, behavior: 'smooth' });
  }, [isTyping]);

  // Отслеживаем позицию скролла (порог 120px — как раньше)
  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
    if (atBottom) setUnreadBelow(0);
  }, []);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollTo({ top: BOTTOM, behavior: 'smooth' });
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

  // ── Рендер элемента ──────────────────────────────────────────────────────────
  // Без AnimatePresence-exit: виртуализация размонтирует элементы при скролле,
  // exit-анимации с ней не дружат. px-4 — на обёртке, py вместо my, чтобы
  // Virtuoso корректно мерил высоту (внешние margin схлопываются).
  const renderItem = useCallback((_index: number, item: ListItem) => {
    if (item.kind === 'date') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3 py-4 px-4"
        >
          <div className="flex-1 divider-grad" />
          <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium px-2">{item.label}</span>
          <div className="flex-1 divider-grad" />
        </motion.div>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="px-4 flow-root"
      >
        <MessageBubble
          message={item.msg}
          isOwn={item.isOwn}
          showAvatar={item.showAvatar}
          chatId={chatId}
        />
      </motion.div>
    );
  }, [chatId]);

  const computeItemKey = useCallback(
    (_index: number, item: ListItem) => (item.kind === 'msg' ? item.msg.id : `date-${item.label}`),
    [],
  );

  return (
    <div className="flex-1 relative overflow-hidden">
      <Virtuoso<ListItem, ListContext>
        key={chatId}
        ref={virtuosoRef}
        className="h-full"
        data={items}
        context={{ isTyping, chatId }}
        components={listComponents}
        itemContent={renderItem}
        computeItemKey={computeItemKey}
        followOutput={followOutput}
        atBottomStateChange={handleAtBottomChange}
        atBottomThreshold={120}
        increaseViewportBy={{ top: 400, bottom: 200 }}
        initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
      />

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
