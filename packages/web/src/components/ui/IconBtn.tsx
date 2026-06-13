import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'md';
  danger?: boolean;
  active?: boolean;
};

const IconBtn = forwardRef<HTMLButtonElement, Props>(function IconBtn(
  { className, size = 'md', danger, active, children, title, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  // Доступность: у иконочных кнопок нет текста — даём screen reader'у имя.
  // Если aria-label не задан явно, берём из title.
  const label = ariaLabel ?? title;
  return (
    <motion.button
      ref={ref}
      title={title}
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={clsx(
        'btn-icon',
        size === 'sm' && 'btn-icon-sm',
        danger && 'btn-icon-danger',
        active && 'bg-content/[0.08] text-content',
        className,
      )}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
});

export default IconBtn;
