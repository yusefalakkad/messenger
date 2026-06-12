import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { backdrop, popIn, tapSoft, SPRING } from '@/lib/motion';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export default function Dialog({ open, onClose, title, description, children, footer, size = 'sm' }: Props) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        // Подложка — z-overlay, всегда ниже карточки
        <motion.div
          variants={backdrop}
          initial="hidden" animate="visible" exit="exit"
          className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          {/* Карточка — z-modal, поверх подложки */}
          <motion.div
            variants={popIn}
            initial="hidden" animate="visible" exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              'relative z-modal glass-card rounded-2xl shadow-e3 overflow-hidden',
              size === 'sm' && 'w-full max-w-sm',
              size === 'md' && 'w-full max-w-md',
              size === 'lg' && 'w-full max-w-xl',
            )}
          >
            {/* Brand-засветка в углах */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-spot-pink blur-3xl pointer-events-none opacity-60" />

            <div className="relative">
              {(title || description) && (
                <div className="px-6 pt-6 pb-3">
                  {title && <h3 className="text-lg font-semibold">{title}</h3>}
                  {description && <p className="text-[13px] text-content/55 mt-1.5 leading-relaxed">{description}</p>}
                </div>
              )}
              {children && <div className="px-6 py-2">{children}</div>}
              {footer && <div className="px-6 pt-3 pb-5 flex gap-3">{footer}</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DialogButton({
  variant = 'secondary', children, onClick, disabled,
}: { variant?: 'primary' | 'secondary' | 'danger'; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={tapSoft}
      transition={SPRING.snappy}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex-1',
        variant === 'primary'   && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'danger'    && 'btn-danger',
      )}
    >
      {children}
    </motion.button>
  );
}
