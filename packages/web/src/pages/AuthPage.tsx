import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import PhoneAuthForm from '@/components/auth/PhoneAuthForm';
import DakkaIcon from '@/components/ui/DakkaIcon';
import { popIn, SPRING, EASE } from '@/lib/motion';

export default function AuthPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Глубокий ambient-фон: три парящих градиентных пятна, медленно дышат */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-spot-violet blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -25, 0], y: [0, -15, 0], scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -right-40 w-[520px] h-[520px] bg-spot-pink blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 18, 0], y: [0, -10, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/3 left-1/2 w-[360px] h-[360px] bg-spot-orange blur-3xl opacity-70"
        />
      </div>

      {/* Лёгкая виньетка для фокуса по центру */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.35) 100%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE.soft }}
        className="relative w-full max-w-md z-base"
      >
        {/* Логотип */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING.gentle, delay: 0.05 }}
            className="relative inline-block mb-5"
          >
            {/* Брендовое свечение под иконкой — пульсирует в такт float */}
            <motion.div
              aria-hidden
              animate={{ opacity: [0.4, 0.62, 0.4], scale: [1, 1.12, 1] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 bg-brand-gradient blur-2xl"
              style={{ borderRadius: '40%' }}
            />
            <div className="relative animate-float drop-shadow-[0_10px_30px_rgba(154,77,255,0.45)]">
              <DakkaIcon size={88} />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.4, ease: EASE.out }}
            className="text-3xl font-bold tracking-tight"
          >
            <span className="text-gradient">Dakka</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.4, ease: EASE.out }}
            className="text-content/45 text-sm mt-2"
          >
            {t('auth.tagline')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.4, ...SPRING.snappy }}
            className="chip-brand mt-4"
          >
            <ShieldCheck size={12} className="text-primary-600 dark:text-primary-300" />
            {t('auth.e2eBadge')}
          </motion.div>
        </div>

        {/* Карточка формы */}
        <motion.div
          variants={popIn}
          initial="hidden"
          animate="visible"
          transition={{ ...SPRING.smooth, delay: 0.32 }}
          className="glass-card p-6 relative"
        >
          <PhoneAuthForm />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center text-content/30 text-xs mt-6 px-4"
        >
          {t('auth.terms')}
        </motion.p>
      </motion.div>
    </div>
  );
}
