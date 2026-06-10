import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import PhoneAuthForm from '@/components/auth/PhoneAuthForm';
import DakkaIcon from '@/components/ui/DakkaIcon';

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Глубокий ambient-фон: три парящих градиентных пятна */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-spot-violet blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -25, 0], y: [0, -15, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -right-40 w-[520px] h-[520px] bg-spot-pink blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 18, 0], y: [0, -10, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/3 left-1/2 w-[360px] h-[360px] bg-spot-orange blur-3xl opacity-70"
        />
      </div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Логотип */}
        <div className="text-center mb-8">
          <motion.div
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 18 }}
            className="relative inline-block mb-5"
          >
            <div className="absolute inset-0 bg-brand-gradient blur-2xl opacity-50" style={{ borderRadius: '40%' }} />
            <div className="relative animate-float drop-shadow-[0_10px_30px_rgba(154,77,255,0.45)]">
              <DakkaIcon size={88} />
            </div>
          </motion.div>

          <motion.h1
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold tracking-tight"
          >
            <span className="text-gradient">Dakka</span>
          </motion.h1>
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-white/45 text-sm mt-2"
          >
            Общение, которое чувствуешь
          </motion.p>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45 }}
            className="chip-brand mt-4"
          >
            <ShieldCheck size={12} className="text-primary-300" />
            E2E-шифрование по умолчанию
          </motion.div>
        </div>

        {/* Карточка */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="glass-card p-6 relative"
        >
          <PhoneAuthForm />
        </motion.div>
      </motion.div>
    </div>
  );
}
