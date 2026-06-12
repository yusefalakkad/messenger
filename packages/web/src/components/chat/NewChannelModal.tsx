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
import { backdrop, popIn, tap, tapSoft, SPRING } from '@/lib/motion';
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
              <Megaphone size={18} className="text-primary-600 dark:text-primary-300" />
              <h3 className="font-semibold">Новый канал</h3>
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
            {/* Название канала */}
            <input
              autoFocus
              className="input-base w-full"
              placeholder="Название канала..."
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              maxLength={64}
            />

            {/* Публичный хэндл (опционально) */}
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
                  : 'Публичный канал можно найти в поиске'}
              </p>
            </div>

            {/* Описание */}
            <textarea
              ref={descRef}
              rows={1}
              className="input-base w-full !h-auto py-2.5 resize-none overflow-y-auto"
              placeholder="Описание (необязательно)"
              value={description}
              onChange={(e) => { setDescription(e.target.value); growDescription(); }}
              maxLength={255}
            />
          </div>

          {/* Создать */}
          <div className="p-4 border-t border-dark-border space-y-2">
            {error && (
              <p className="text-[12px] text-red-400/90 text-center">{error}</p>
            )}
            {!error && !name.trim() && (
              <p className="text-[12px] text-content/45 text-center">Введите название канала</p>
            )}
            <motion.button
              whileTap={tapSoft}
              transition={SPRING.snappy}
              onClick={create}
              disabled={!name.trim() || usernameTooShort || creating}
              className="btn-primary btn-block"
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
