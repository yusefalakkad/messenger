import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.94, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -6 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          className={clsx(
            'absolute top-full mt-2 min-w-[190px] glass',
            'rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50',
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
    <button onClick={onClick} className={clsx('menu-item', danger && 'menu-item-danger')}>
      {icon && (
        <span className={clsx(
          'flex-shrink-0 transition-transform duration-200',
          danger ? 'text-rose-400' : 'text-primary-300',
        )}>{icon}</span>
      )}
      <span>{label}</span>
    </button>
  );
}
