import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Link2Off } from 'lucide-react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import type { Chat } from '@messenger/shared';

/**
 * Роут /join/:code — вступление в канал/группу по инвайт-ссылке.
 * На маунт один раз POST /join/:code → addChat + переход в чат.
 * Невалидный код → экран «Недействительная ссылка».
 */
export default function JoinByCode() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const addChat = useChatStore((s) => s.addChat);
  const [error, setError] = useState(false);
  // StrictMode монтирует эффект дважды — гарантируем единственный запрос
  const requested = useRef(false);

  useEffect(() => {
    if (!code || requested.current) return;
    requested.current = true;
    api.post(`/join/${code}`)
      .then(({ data }) => {
        const chat = data?.data as Chat | undefined;
        if (!chat?.id) { setError(true); return; }
        addChat(chat);
        navigate(`/chat/${chat.id}`, { replace: true });
      })
      .catch(() => setError(true));
  }, [code, addChat, navigate]);

  return (
    <div className="flex flex-col h-full items-center justify-center text-center px-6">
      {error ? (
        <div className="flex flex-col items-center gap-3 text-content/50 max-w-xs">
          <Link2Off size={32} className="text-content/40" />
          <p className="text-sm">Недействительная ссылка-приглашение.</p>
          <Link to="/" className="text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 text-sm font-medium">
            ← На главную
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-content/40">
          <div className="w-10 h-10 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
          <p className="text-sm">Подключаем к чату...</p>
        </div>
      )}
    </div>
  );
}
