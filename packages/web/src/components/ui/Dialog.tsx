import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

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
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              'glass-card overflow-hidden relative',
              size === 'sm' && 'w-[22rem]',
              size === 'md' && 'w-[28rem]',
              size === 'lg' && 'w-[36rem]',
            )}
          >
            {/* Brand-засветка в углу */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-spot-violet blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-spot-pink blur-3xl pointer-events-none opacity-60" />

            <div className="relative">
              {(title || description) && (
                <div className="px-6 pt-6 pb-3">
                  {title && <h3 className="font-semibold text-lg">{title}</h3>}
                  {description && <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{description}</p>}
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
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50',
        variant === 'primary'  && 'btn-primary !py-2.5 !px-4',
        variant === 'secondary' && 'bg-white/[0.05] hover:bg-white/[0.08] text-white border border-white/[0.06]',
        variant === 'danger'   && 'bg-rose-500/90 hover:bg-rose-500 text-white shadow-glow-pink',
      )}
    >
      {children}
    </motion.button>
  );
}
