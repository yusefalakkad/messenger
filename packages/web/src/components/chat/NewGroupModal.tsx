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
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate  = useNavigate();
  const addChat   = useChatStore((s) => s.addChat);

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
    if (!name.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const { data } = await api.post('/chats/group', {
        name: name.trim(),
        memberIds: selected.map((u) => u.id),
      });
      const chat = data.data as Chat;
      addChat(chat);
      navigate(`/chat/${chat.id}`);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-sm overflow-hidden relative"
      >
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-spot-pink blur-3xl pointer-events-none opacity-60" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary-300" />
              <h2 className="font-semibold">Новая группа</h2>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ rotate: 90 }}
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/60"
            >
              <X size={18} />
            </motion.button>
          </div>

          <div className="p-4 space-y-3">
            {/* Название группы */}
            <input
              autoFocus
              className="input-base w-full !py-2.5"
              placeholder="Название группы..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />

            {/* Поиск участников */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 z-10" />
              <input
                className="input-pill w-full !pl-9"
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
          <div className="max-h-52 overflow-y-auto border-t border-white/[0.05]">
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-primary-300" />
              </div>
            )}
            {!loading && results.map((u, idx) => {
              const isSelected = selected.some((s) => s.id === u.id);
              return (
                <motion.button
                  key={u.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  whileHover={{ x: 2 }}
                  onClick={() => toggle(u)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05]"
                >
                  <Avatar src={u.avatar} name={u.displayName} size="sm" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.displayName}</p>
                    <p className="text-xs text-white/40">@{u.username}</p>
                  </div>
                  {isSelected && <Check size={16} className="text-primary-300 flex-shrink-0" />}
                </motion.button>
              );
            })}
            {!loading && query.length > 0 && results.length === 0 && (
              <p className="text-center text-white/35 text-sm py-4">Пользователи не найдены</p>
            )}
          </div>

          {/* Создать */}
          <div className="p-4 border-t border-white/[0.05]">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={create}
              disabled={!name.trim() || selected.length === 0 || creating}
              className="btn-primary w-full !py-2.5 flex items-center justify-center gap-2"
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
