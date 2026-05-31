import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'md';
  danger?: boolean;
  active?: boolean;
};

const IconBtn = forwardRef<HTMLButtonElement, Props>(function IconBtn(
  { className, size = 'md', danger, active, children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={clsx(
        'btn-icon',
        size === 'sm' && 'btn-icon-sm',
        danger && 'btn-icon-danger',
        active && 'bg-white/[0.08] text-white',
        className,
      )}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
});

export default IconBtn;
