import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chat.store';
import type { Chat } from '@messenger/shared';

/**
 * Роут /u/:username — открытие диалога по публичному username (QR / ссылка-визитка).
 * Резолвим юзера → создаём/находим direct-чат → переходим в него.
 * 404 → экран «Пользователь не найден».
 */
export default function AddByUsername() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const addChat = useChatStore((s) => s.addChat);
  const [error, setError] = useState(false);
  // StrictMode монтирует эффект дважды — гарантируем единственный запрос
  const requested = useRef(false);

  useEffect(() => {
    if (!username || requested.current) return;
    requested.current = true;
    api.get(`/users/by-username/${encodeURIComponent(username)}`)
      .then(async ({ data }) => {
        const user = data?.data as { id: string } | undefined;
        if (!user?.id) { setError(true); return; }
        const { data: chatRes } = await api.post('/chats/direct', { targetUserId: user.id });
        const chat = chatRes?.data as Chat | undefined;
        if (!chat?.id) { setError(true); return; }
        addChat(chat);
        navigate(`/chat/${chat.id}`, { replace: true });
      })
      .catch(() => setError(true));
  }, [username, addChat, navigate]);

  return (
    <div className="flex flex-col h-full items-center justify-center text-center px-6">
      {error ? (
        <div className="flex flex-col items-center gap-3 text-white/50 max-w-xs">
          <UserX size={32} className="text-white/40" />
          <p className="text-sm">Пользователь не найден.</p>
          <Link to="/" className="btn-ghost btn-sm">
            На главную
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-white/40">
          <div className="w-10 h-10 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
          <p className="text-sm">Ищем пользователя...</p>
        </div>
      )}
    </div>
  );
}
