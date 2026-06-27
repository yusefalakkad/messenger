import { useEffect, useState } from 'react';
import i18nInstance from '@/lib/i18n';
import { motion } from 'framer-motion';
import { Loader2, Megaphone, SearchX, Users, MessageSquarePlus } from 'lucide-react';
import { api } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import type { Chat, ChatType, Message } from '@messenger/shared';
import { EASE, listParent, listChild, tap, SPRING } from '@/lib/motion';

interface Props {
  query: string;
  /** messageId передаётся для результатов-сообщений — прыжок к сообщению после открытия чата */
  onOpenChat: (chatId: string, messageId?: string) => void;
}

// Ответ GET /search: чаты где я участник + незашифрованные сообщения с инфой о чате
interface SearchMessage extends Message {
  chat: { id: string; name: string | null; type: ChatType };
}
interface SearchResults {
  chats: Chat[];
  messages: SearchMessage[];
}

// Ответ GET /channels/search — публичные каналы И группы (username != null)
interface ChannelSearchResult {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  description: string | null;
  subscriberCount: number;
  isMember: boolean;
  type?: ChatType; // 'channel' | 'group' — для иконки-фолбэка
}

// Ответ GET /users/search — люди по @username / имени / телефону
interface UserResult {
  id: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  publicKey: string | null;
}

// Плюрализация: 1 подписчик, 2 подписчика, 5 подписчиков
function subscribersLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} подписчик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} подписчика`;
  return `${n} подписчиков`;
}

// Имя чата: группа/saved — своё, direct — собеседник
function chatTitle(chat: Chat, myUserId?: string): string {
  if (chat.type === 'saved') return i18nInstance.t('chat.saved');
  if (chat.type === 'group') return chat.name ?? 'Группа';
  return chat.members?.find((m) => m.userId !== myUserId)?.user.displayName ?? 'Чат';
}

function chatAvatar(chat: Chat, myUserId?: string): string | null | undefined {
  if (chat.type === 'direct') {
    return chat.members?.find((m) => m.userId !== myUserId)?.user.avatar;
  }
  return chat.avatar;
}

// Сегодня — время, иначе — дата
function formatTime(date: Date | string): string {
  const d = new Date(date);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru', { day: '2-digit', month: 'short' });
}

// Сниппет: если совпадение глубоко в тексте — обрезаем начало, чтобы <mark> был виден
function makeSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (idx > 30) return '…' + text.slice(idx - 24);
  return text;
}

function highlightMatch(text: string, q: string) {
  const t = q.trim();
  if (!t) return text;
  const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-primary-500/30 text-white rounded px-0.5">{p}</mark>
      : p,
  );
}

export default function GlobalSearchOverlay({ query, onOpenChat }: Props) {
  const myUserId = useAuthStore((s) => s.user?.id);
  // «Избранное» (Saved Messages) всегда показываем в поиске первым (как в Telegram).
  const savedChat = useChatStore((s) => s.chats.find((c) => c.type === 'saved'));
  const [results, setResults] = useState<SearchResults | null>(null);
  const [channels, setChannels] = useState<ChannelSearchResult[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setChannels([]);
      setUsers([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    // Дебаунс 300мс; AbortController отменяет in-flight запросы при смене query
    const handle = setTimeout(async () => {
      // Параллельно: чаты+сообщения, публичные каналы и люди по @username
      const [searchRes, channelsRes, usersRes] = await Promise.allSettled([
        api.get('/search', { params: { q, limit: 30 }, signal: ctrl.signal }),
        api.get('/channels/search', { params: { q }, signal: ctrl.signal }),
        api.get('/users/search', { params: { q }, signal: ctrl.signal }),
      ]);
      if (ctrl.signal.aborted) return;
      if (searchRes.status === 'fulfilled') {
        const payload = (searchRes.value.data?.data ?? { chats: [], messages: [] }) as SearchResults;
        setResults({ chats: payload.chats ?? [], messages: payload.messages ?? [] });
      } else {
        setResults({ chats: [], messages: [] });
      }
      setChannels(
        channelsRes.status === 'fulfilled'
          ? ((channelsRes.value.data?.data ?? []) as ChannelSearchResult[])
          : [],
      );
      setUsers(
        usersRes.status === 'fulfilled'
          ? ((usersRes.value.data?.data ?? []) as UserResult[])
          : [],
      );
      setLoading(false);
    }, 300);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query]);

  // Подписка на канал из поиска: добавляем чат в store и открываем
  const handleSubscribe = async (channel: ChannelSearchResult) => {
    setSubscribingId(channel.id);
    try {
      const { data } = await api.post(`/channels/${channel.id}/subscribe`);
      const chat = data?.data as Chat;
      if (chat) useChatStore.getState().addChat(chat);
      onOpenChat(channel.id);
    } catch {
      // не подписались — кнопка остаётся, можно повторить
    } finally {
      setSubscribingId(null);
    }
  };

  // Старт личного чата по найденному человеку: создаём/открываем direct.
  const handleOpenUser = async (u: UserResult) => {
    setStartingUserId(u.id);
    try {
      const { data } = await api.post('/chats/direct', { targetUserId: u.id });
      const chat = data?.data as Chat;
      if (chat) useChatStore.getState().addChat(chat);
      onOpenChat(chat?.id ?? u.id);
    } catch {
      // не удалось — оставляем строку, можно повторить
    } finally {
      setStartingUserId(null);
    }
  };

  // Дедуп: не показываем в «Люди» тех, с кем уже есть личный чат (они в «Чаты»).
  const knownPeerIds = new Set<string>();
  results?.chats.forEach((c) => {
    if (c.type === 'direct') c.members?.forEach((m) => { if (m.userId !== myUserId) knownPeerIds.add(m.userId); });
  });
  const freshUsers = users.filter((u) => !knownPeerIds.has(u.id));

  // «Избранное» всегда первым в результатах поиска (если уже создано).
  const baseChats = results?.chats ?? [];
  const chatsToShow = savedChat
    ? [savedChat, ...baseChats.filter((c) => c.id !== savedChat.id)]
    : baseChats;

  const isEmpty = !loading && results !== null
    && chatsToShow.length === 0 && results.messages.length === 0
    && channels.length === 0 && freshUsers.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: EASE.soft }}
      className="absolute inset-0 z-raised bg-dark-surface overflow-y-auto"
    >
      {/* Skeleton при загрузке — вместо голого спиннера (shimmer-плейсхолдеры) */}
      {loading && (
        <div className="pt-2">
          <div className="px-4 py-2">
            <div className="skeleton h-3 w-20 rounded-md" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="list-row">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="skeleton h-3.5 rounded-md" style={{ width: `${55 + (i % 3) * 12}%` }} />
                <div className="skeleton h-2.5 w-1/3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Премиум пустое состояние — крупная иконка в rounded-2xl с brand-glow */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE.out }}
          className="flex flex-col items-center justify-center gap-4 px-8 py-20 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center shadow-glow-violet">
            <SearchX size={28} className="text-primary-600 dark:text-primary-300" />
          </div>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-content/90">Ничего не найдено</p>
            <p className="text-[13px] text-content/45 max-w-[260px]">
              Попробуйте изменить запрос или поискать по @username канала
            </p>
          </div>
        </motion.div>
      )}

      {!loading && results !== null && chatsToShow.length > 0 && (
        <motion.section variants={listParent} initial="hidden" animate="visible">
          <h4 className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-content/45 font-semibold">
            Чаты
          </h4>
          {chatsToShow.map((chat) => {
            const title = chatTitle(chat, myUserId);
            return (
              <motion.button
                variants={listChild}
                key={chat.id}
                onClick={() => onOpenChat(chat.id)}
                className="list-row w-full text-left"
              >
                <Avatar src={chatAvatar(chat, myUserId)} name={title} size="md" />
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-content/95 truncate">
                  {highlightMatch(title, query)}
                </span>
              </motion.button>
            );
          })}
        </motion.section>
      )}

      {!loading && freshUsers.length > 0 && (
        <motion.section variants={listParent} initial="hidden" animate="visible">
          <h4 className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-content/45 font-semibold">
            Люди
          </h4>
          {freshUsers.map((u) => {
            const title = u.displayName ?? u.username ?? 'Пользователь';
            return (
              <motion.button
                variants={listChild}
                key={u.id}
                onClick={() => handleOpenUser(u)}
                disabled={startingUserId === u.id}
                className="list-row w-full text-left"
              >
                <Avatar src={u.avatar} name={title} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-content/95 truncate">
                    {highlightMatch(title, query)}
                  </p>
                  {u.username && (
                    <p className="text-[12px] text-content/45 truncate">
                      {highlightMatch(`@${u.username}`, query)}
                    </p>
                  )}
                </div>
                <span className="flex items-center gap-1.5 flex-shrink-0 text-primary-600 dark:text-primary-300">
                  {startingUserId === u.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : <MessageSquarePlus size={18} />}
                </span>
              </motion.button>
            );
          })}
        </motion.section>
      )}

      {!loading && channels.length > 0 && (
        <motion.section variants={listParent} initial="hidden" animate="visible">
          <h4 className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-content/45 font-semibold">
            Каналы и группы
          </h4>
          {channels.map((channel) => (
            <motion.div variants={listChild} key={channel.id} className="list-row w-full">
              {channel.avatar ? (
                <Avatar src={channel.avatar} name={channel.name} size="md" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0 shadow-glow-violet">
                  {channel.type === 'group'
                    ? <Users size={18} className="text-white" />
                    : <Megaphone size={18} className="text-white" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-content/95 truncate">
                  {highlightMatch(channel.name, query)}
                </p>
                <p className="text-[12px] text-content/45 truncate tabular-nums">
                  {channel.username ? `@${channel.username} · ` : ''}
                  {subscribersLabel(channel.subscriberCount)}
                </p>
              </div>
              {channel.isMember ? (
                <motion.button whileTap={tap} transition={SPRING.snappy}
                  onClick={() => onOpenChat(channel.id)}
                  className="btn-ghost btn-sm flex-shrink-0"
                >
                  Открыть
                </motion.button>
              ) : (
                <motion.button whileTap={tap} transition={SPRING.snappy}
                  onClick={() => handleSubscribe(channel)}
                  disabled={subscribingId === channel.id}
                  className="btn-primary btn-sm flex-shrink-0"
                >
                  {subscribingId === channel.id
                    ? <Loader2 size={15} className="animate-spin" />
                    : 'Подписаться'}
                </motion.button>
              )}
            </motion.div>
          ))}
        </motion.section>
      )}

      {!loading && results !== null && results.messages.length > 0 && (
        <motion.section variants={listParent} initial="hidden" animate="visible">
          <h4 className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-content/45 font-semibold">
            Сообщения
          </h4>
          {results.messages.map((msg) => {
            const chatName = msg.chat.type === 'saved'
              ? i18nInstance.t('chat.saved')
              : msg.chat.name ?? msg.sender?.displayName ?? 'Чат';
            const snippet = makeSnippet(msg.content ?? '', query);
            return (
              <motion.button
                variants={listChild}
                key={msg.id}
                onClick={() => onOpenChat(msg.chatId, msg.id)}
                className="list-row w-full text-left"
              >
                <Avatar src={msg.sender?.avatar} name={msg.sender?.displayName ?? '?'} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-content/95 truncate">
                      {chatName}
                    </span>
                    <span className="text-[12px] text-content/40 flex-shrink-0 tabular-nums">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-[13px] leading-[18px] text-content/55 truncate mt-0.5">
                    {highlightMatch(snippet, query)}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.section>
      )}
    </motion.div>
  );
}
