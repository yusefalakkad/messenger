import { useEffect, useState } from 'react';
import { Loader2, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import Avatar from '@/components/ui/Avatar';

/**
 * Секция «Чёрный список» — GET /users/me/blocked + разблокировка
 * через DELETE /users/:userId/block.
 */

type BlockedUser = {
  id: string;
  username: string | null;
  displayName: string;
  avatar?: string | null;
};

export default function SettingsBlocked() {
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/users/me/blocked')
      .then(({ data }) => setBlocked(data.data ?? []))
      .catch(() => {
        setBlocked([]);
        toast.error('Не удалось загрузить чёрный список');
      });
  }, []);

  const unblock = async (u: BlockedUser) => {
    setBusyId(u.id);
    try {
      await api.delete(`/users/${u.id}/block`);
      setBlocked((prev) => (prev ?? []).filter((x) => x.id !== u.id));
      toast.success(`${u.displayName} разблокирован`);
    } catch {
      toast.error('Не удалось разблокировать');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-3 px-1">
        <span className="text-[12px] uppercase tracking-wider font-semibold text-white/55">Чёрный список</span>
      </div>

      {blocked === null ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      ) : blocked.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-white/35">
          <div className="w-12 h-12 rounded-md bg-white/[0.04] border border-dark-border flex items-center justify-center">
            <UserX size={22} />
          </div>
          <span className="text-[13px]">Никто не заблокирован</span>
        </div>
      ) : (
        <div className="space-y-1">
          {blocked.map((u) => (
            <div key={u.id} className="list-item cursor-default">
              <Avatar src={u.avatar} name={u.displayName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{u.displayName}</div>
                {u.username && <div className="text-[12px] text-white/40 truncate">@{u.username}</div>}
              </div>
              <button
                className="btn-ghost btn-sm flex-shrink-0"
                onClick={() => unblock(u)}
                disabled={busyId === u.id}
              >
                {busyId === u.id && <Loader2 size={14} className="animate-spin" />}
                Разблокировать
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
