import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { menu, tapSoft } from '@/lib/motion';

type Props = {
  open: boolean;
  onClose: () => void;
  anchor?: 'left' | 'right';
  children: ReactNode;
  className?: string;
};

export default function Dropdown({ open, onClose, anchor = 'right', children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    // P2-19: на iOS click-outside через mousedown не срабатывает (мобильный Safari
    // эмулирует mouse-события неоднозначно). touchstart ловит тап надёжно — без него
    // меню Plus/Settings/Attach не закрываются и блокируют интерфейс.
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          variants={menu}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: anchor === 'right' ? 'top right' : 'top left' }}
          className={clsx(
            'absolute top-full mt-2 min-w-[190px] glass',
            'rounded-2xl shadow-e3 overflow-hidden z-dropdown p-1',
            anchor === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DropdownItem({
  icon, label, onClick, danger,
}: { icon?: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={tapSoft}
      className={clsx('group menu-item rounded-lg', danger && 'menu-item-danger')}
    >
      {icon && (
        <span className={clsx(
          'flex-shrink-0 transition-transform duration-200 group-hover:scale-110',
          danger ? 'text-rose-400' : 'text-primary-600 dark:text-primary-300',
        )}>{icon}</span>
      )}
      <span>{label}</span>
    </motion.button>
  );
}

// Тонкий разделитель между группами пунктов меню.
export function DropdownDivider() {
  return <div className="my-1 h-px bg-dark-border/70" />;
}
