import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import Avatar from '@/components/ui/Avatar';
import { listParent, listChild, tap, SPRING } from '@/lib/motion';

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
        <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">Чёрный список</span>
      </div>

      {blocked === null ? (
        // Skeleton-плейсхолдеры вместо спиннера
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="list-row cursor-default">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="skeleton h-3.5 w-28 rounded" />
                <div className="skeleton h-2.5 w-20 rounded" />
              </div>
              <div className="skeleton h-8 w-28 rounded-lg flex-shrink-0" />
            </div>
          ))}
        </div>
      ) : blocked.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-16 h-16 rounded-2xl bg-dark-card border border-dark-border shadow-glow-violet flex items-center justify-center text-content/45">
            <UserX size={26} />
          </div>
          <div className="text-center">
            <p className="text-[15px] text-content/80 font-medium">Никто не заблокирован</p>
            <p className="text-[13px] text-content/45 mt-0.5">Заблокированные пользователи появятся здесь</p>
          </div>
        </div>
      ) : (
        <motion.div
          variants={listParent}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          {blocked.map((u) => (
            <motion.div key={u.id} variants={listChild} className="list-row cursor-default">
              <Avatar src={u.avatar} name={u.displayName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{u.displayName}</div>
                {u.username && <div className="text-[12px] text-content/40 truncate">@{u.username}</div>}
              </div>
              <motion.button
                className="btn-ghost btn-sm flex-shrink-0"
                whileTap={tap}
                transition={SPRING.snappy}
                onClick={() => unblock(u)}
                disabled={busyId === u.id}
              >
                {busyId === u.id && <Loader2 size={14} className="animate-spin" />}
                Разблокировать
              </motion.button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
