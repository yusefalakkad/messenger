/**
 * Модал создания группового чата.
 * 1. Вводим название
 * 2. Ищем и добавляем участников (мультиселект)
 * 3. Создаём
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Users, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import Avatar from '@/components/ui/Avatar';
import { backdrop, popIn, listParent, listChild, tap, tapSoft, SPRING } from '@/lib/motion';
import type { Chat } from '@messenger/shared';

interface Props { onClose: () => void; }

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

export default function NewGroupModal({ onClose }: Props) {
  const [name,     setName]     = useState('');
  const [username, setUsername] = useState('');
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const navigate  = useNavigate();
  const addChat   = useChatStore((s) => s.addChat);

  // Live-нормализация хэндла: lowercase + только [a-z0-9_], максимум 32 (как у каналов)
  const onUsernameChange = (raw: string) => {
    setUsername(raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32));
    setError(null);
  };

  // username либо пустой, либо валидный по формату (короткий — ещё не валиден)
  const usernameTooShort = username.length > 0 && username.length < 5;

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setResults((data.data ?? []).filter((u: SearchUser) => !selected.some((s) => s.id === u.id)));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (user: SearchUser) => {
    setSelected((prev) =>
      prev.some((s) => s.id === user.id)
        ? prev.filter((s) => s.id !== user.id)
        : [...prev, user],
    );
  };

  const create = async () => {
    if (!name.trim() || selected.length === 0 || usernameTooShort) return;
    setCreating(true);
    setError(null);
    try {
      const { data } = await api.post('/chats/group', {
        name: name.trim(),
        memberIds: selected.map((u) => u.id),
        ...(username ? { username } : {}),
      });
      const chat = data.data as Chat;
      addChat(chat);
      navigate(`/chat/${chat.id}`);
      onClose();
    } catch (e) {
      const code = (e as { response?: { data?: { error?: { code?: string } } } })
        ?.response?.data?.error?.code;
      setError(code === 'USERNAME_TAKEN' ? 'Это имя уже занято' : 'Не удалось создать группу');
    } finally {
      setCreating(false);
    }
  };

  return (
    // Подложка — z-overlay
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
        className="relative z-modal glass-card rounded-2xl shadow-e3 w-full max-w-sm overflow-hidden"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-spot-pink blur-3xl pointer-events-none opacity-60" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary-600 dark:text-primary-300" />
              <h3 className="font-semibold">Новая группа</h3>
            </div>
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

          <div className="p-4 space-y-3">
            {/* Название группы */}
            <input
              autoFocus
              className="input-base w-full !py-2.5"
              placeholder="Название группы..."
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              maxLength={64}
            />

            {/* Публичный хэндл (опционально) — как у каналов */}
            <div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40 text-[15px] pointer-events-none z-raised">@</span>
                <input
                  className="input-base w-full !pl-8"
                  placeholder="username (необязательно)"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  maxLength={32}
                />
              </div>
              <p className={`text-[12px] mt-1.5 px-1 ${usernameTooShort ? 'text-red-400/80' : 'text-content/45'}`}>
                {usernameTooShort
                  ? 'Минимум 5 символов: a-z, 0-9 и _'
                  : 'Публичную группу можно найти в поиске'}
              </p>
            </div>

            {/* Поиск участников */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content/30 z-raised" />
              <input
                className="input-pill w-full"
                placeholder="Добавить участников..."
                value={query}
                onChange={(e) => search(e.target.value)}
              />
            </div>

            {/* Выбранные участники */}
            <AnimatePresence>
              {selected.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 overflow-hidden"
                >
                  {selected.map((u) => (
                    <motion.div key={u.id}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                      className="flex items-center gap-1.5 chip-brand !py-1 !pl-1.5 !pr-2"
                    >
                      <Avatar src={u.avatar} name={u.displayName} size="sm" />
                      <span className="text-xs">{u.displayName}</span>
                      <button onClick={() => toggle(u)} className="text-white/60 hover:text-white">
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Результаты поиска */}
          <div className="max-h-52 overflow-y-auto border-t border-dark-border px-2 py-1">
            {loading && (
              // Skeleton вместо голого спиннера
              <div className="space-y-1 px-2 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <div className="skeleton w-9 h-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-28 rounded" />
                      <div className="skeleton h-2.5 w-16 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && (
              <motion.div variants={listParent} initial="hidden" animate="visible">
                {results.map((u) => {
                  const isSelected = selected.some((s) => s.id === u.id);
                  return (
                    <motion.button
                      key={u.id}
                      variants={listChild}
                      onClick={() => toggle(u)}
                      className="list-row w-full min-h-[48px] text-left"
                    >
                      <Avatar src={u.avatar} name={u.displayName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium truncate">{u.displayName}</p>
                        <p className="text-[12px] text-content/45 truncate">@{u.username}</p>
                      </div>
                      {/* Check-индикатор выбранного */}
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition ${
                        isSelected ? 'bg-brand-gradient shadow-glow-violet' : 'border border-dark-border'
                      }`}>
                        {isSelected && <Check size={13} className="text-white" />}
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
            {!loading && query.length > 0 && results.length === 0 && (
              <p className="text-center text-content/45 text-[13px] py-4">Пользователи не найдены</p>
            )}
          </div>

          {/* Создать */}
          <div className="p-4 border-t border-dark-border space-y-2">
            {error && (
              <p className="text-[12px] text-red-400/90 text-center">{error}</p>
            )}
            {!error && (!name.trim() || selected.length === 0) && (
              <p className="text-[12px] text-content/45 text-center">
                {!name.trim() && selected.length === 0
                  ? 'Введите название группы и выберите хотя бы одного участника'
                  : !name.trim()
                  ? 'Введите название группы'
                  : 'Выберите хотя бы одного участника'}
              </p>
            )}
            <motion.button
              whileTap={tapSoft}
              transition={SPRING.snappy}
              onClick={create}
              disabled={!name.trim() || selected.length === 0 || usernameTooShort || creating}
              className="btn-primary btn-block"
            >
              {creating ? (
                <><Loader2 size={16} className="animate-spin" />Создание...</>
              ) : (
                <>Создать группу · {selected.length} участн.</>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
