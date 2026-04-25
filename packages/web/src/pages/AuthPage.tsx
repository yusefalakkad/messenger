import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      {/* Background gradient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-primary-800/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4 shadow-lg shadow-primary-600/30">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Messenger</h1>
          <p className="text-white/40 text-sm mt-1">Безопасный мессенджер</p>
        </div>

        {/* Card */}
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-6 shadow-2xl">
          {/* Tabs */}
          <div className="flex bg-dark-bg rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === tab
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab === 'login' ? 'Войти' : 'Регистрация'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {mode === 'login' ? <LoginForm /> : <RegisterForm />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
