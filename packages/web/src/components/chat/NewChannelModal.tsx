/**
 * Модал создания канала.
 * Название + опциональный публичный @username + описание.
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Megaphone, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import type { Chat } from '@messenger/shared';

interface Props { onClose: () => void; }

export default function NewChannelModal({ onClose }: Props) {
  const [name,        setName]        = useState('');
  const [username,    setUsername]    = useState('');
  const [description, setDescription] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const descRef  = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const addChat  = useChatStore((s) => s.addChat);

  // Live-нормализация хэндла: lowercase + только [a-z0-9_], максимум 32
  const onUsernameChange = (raw: string) => {
    setUsername(raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32));
    setError(null);
  };

  // username либо пустой, либо валидный по формату (короткий — ещё не валиден)
  const usernameTooShort = username.length > 0 && username.length < 5;

  // Auto-height textarea до 3 строк
  const growDescription = () => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 84)}px`; // ~3 строки
  };

  const create = async () => {
    if (!name.trim() || usernameTooShort || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { data } = await api.post('/chats/channel', {
        name: name.trim(),
        ...(username ? { username } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      const chat = data.data as Chat;
      addChat(chat);
      navigate(`/chat/${chat.id}`);
      onClose();
    } catch (e) {
      const code = (e as { response?: { data?: { error?: { code?: string } } } })
        ?.response?.data?.error?.code;
      setError(code === 'USERNAME_TAKEN' ? 'Это имя уже занято' : 'Не удалось создать канал');
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
              <Megaphone size={18} className="text-primary-300" />
              <h2 className="font-semibold">Новый канал</h2>
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
            {/* Название канала */}
            <input
              autoFocus
              className="input-base w-full !py-2.5"
              placeholder="Название канала..."
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              maxLength={64}
            />

            {/* Публичный хэндл (опционально) */}
            <div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none z-10">@</span>
                <input
                  className="input-base w-full !py-2.5 !pl-8"
                  placeholder="username (необязательно)"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  maxLength={32}
                />
              </div>
              <p className={`text-[11px] mt-1.5 px-1 ${usernameTooShort ? 'text-red-400/80' : 'text-white/40'}`}>
                {usernameTooShort
                  ? 'Минимум 5 символов: a-z, 0-9 и _'
                  : 'Публичный канал можно найти в поиске'}
              </p>
            </div>

            {/* Описание */}
            <textarea
              ref={descRef}
              rows={1}
              className="input-base w-full !py-2.5 resize-none overflow-y-auto"
              placeholder="Описание (необязательно)"
              value={description}
              onChange={(e) => { setDescription(e.target.value); growDescription(); }}
              maxLength={255}
            />
          </div>

          {/* Создать */}
          <div className="p-4 border-t border-white/[0.05] space-y-2">
            {error && (
              <p className="text-[11px] text-red-400/90 text-center">{error}</p>
            )}
            {!error && !name.trim() && (
              <p className="text-[11px] text-white/45 text-center">Введите название канала</p>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={create}
              disabled={!name.trim() || usernameTooShort || creating}
              className="btn-primary w-full !py-2.5 flex items-center justify-center gap-2"
            >
              {creating ? (
                <><Loader2 size={16} className="animate-spin" />Создание...</>
              ) : (
                <>Создать канал</>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
