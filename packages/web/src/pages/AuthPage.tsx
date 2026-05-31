import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

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
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Логотип */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 18 }}
            className="relative inline-block mb-5"
          >
            <div className="absolute inset-0 bg-brand-gradient blur-2xl opacity-60 rounded-3xl" />
            <div className="relative w-20 h-20 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow-violet animate-float">
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
              </svg>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold tracking-tight"
          >
            <span className="text-gradient">messen</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-white/45 text-sm mt-2"
          >
            Общение, которое чувствуешь
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
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
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="glass-card p-6 relative"
        >
          {/* Tabs */}
          <div className="relative flex bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`relative flex-1 py-2.5 rounded-lg text-sm font-medium z-10 ${
                  mode === tab ? 'text-white' : 'text-white/45 hover:text-white/75'
                }`}
              >
                {mode === tab && (
                  <motion.span
                    layoutId="tab-indicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-brand-gradient shadow-glow-violet"
                    style={{ zIndex: -1 }}
                  />
                )}
                <span className="relative">{tab === 'login' ? 'Войти' : 'Регистрация'}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === 'login' ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'login' ? 12 : -12 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              {mode === 'login' ? <LoginForm /> : <RegisterForm />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}
