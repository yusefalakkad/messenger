import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import PhoneAuthForm from '@/components/auth/PhoneAuthForm';
import DakkaIcon from '@/components/ui/DakkaIcon';
import { EASE, SPRING, tap } from '@/lib/motion';

// Точный фирменный градиент из референса (coral → pink → periwinkle).
const BRAND = 'linear-gradient(135deg, #FF7A78 0%, #FF4E86 46%, #7A82FF 100%)';

// Парящие аватарки-плитки (декор) — фирменные градиенты из референса.
const FLOATERS: { t: string; g: string; cls: string; delay: number }[] = [
  { t: 'ДР', g: 'linear-gradient(150deg,#9aa0ff,#5b5bf5)', cls: 'left-5 top-[8%] -rotate-[8deg]',  delay: 0.05 },
  { t: 'СВ', g: 'linear-gradient(150deg,#46e5cf,#13a6be)', cls: 'right-7 top-[15%] rotate-[7deg]',  delay: 0.12 },
  { t: 'АП', g: 'linear-gradient(150deg,#ffd06b,#ff8a3d)', cls: 'left-9 top-[27%] rotate-[5deg]',   delay: 0.19 },
  { t: 'НК', g: 'linear-gradient(150deg,#c98dff,#8a45e6)', cls: 'right-10 top-[31%] -rotate-[5deg]', delay: 0.26 },
];

export default function AuthPage() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);

  return (
    <div className="min-h-screen relative overflow-hidden bg-dark-bg text-content flex flex-col">
      {/* Тёплое свечение сверху по референсу */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(125% 55% at 50% -8%, rgba(255,110,140,0.18), transparent 62%)' }}
      />

      <AnimatePresence mode="wait">
        {!started ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="relative flex-1 flex flex-col px-6 pt-[var(--sat)] pb-[calc(var(--sab)+1.5rem)]"
          >
            {/* Парящие аватарки */}
            {FLOATERS.map((f) => (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ ...SPRING.gentle, delay: f.delay }}
                className={`absolute w-14 h-14 rounded-[18px] flex items-center justify-center text-white font-semibold text-[15px] shadow-[0_12px_26px_-8px_rgba(0,0,0,0.35)] ${f.cls}`}
                style={{ background: f.g }}
              >
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4 + f.delay * 6, repeat: Infinity, ease: 'easeInOut' }}>
                  {f.t}
                </motion.div>
              </motion.div>
            ))}

            {/* Низ экрана: лого + заголовок + кнопки */}
            <div className="relative mt-auto">
              <motion.div
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.5, ease: EASE.out }}
              >
                <div className="flex items-center gap-2.5 mb-6">
                  <DakkaIcon size={52} />
                  <span className="text-[34px] font-extrabold tracking-[-0.03em] lowercase">dakka</span>
                </div>

                <h1 className="text-[28px] font-bold leading-[1.16] tracking-[-0.02em]">
                  Сообщения, которые<br />хочется открывать
                </h1>
                <p className="text-content/50 text-[15px] leading-relaxed mt-3 max-w-[330px]">
                  Голос, видео и текст — в одном красивом, быстром и приватном приложении.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: EASE.out }}
                className="mt-8 space-y-3"
              >
                <motion.button
                  onClick={() => setStarted(true)} whileTap={tap} transition={SPRING.snappy}
                  className="w-full h-[58px] rounded-full text-white font-semibold text-[16px] flex items-center justify-center gap-2"
                  style={{ background: BRAND, boxShadow: '0 16px 34px -12px rgba(255,78,134,0.55)' }}
                >
                  Создать аккаунт <ArrowRight size={18} />
                </motion.button>
                <motion.button
                  onClick={() => setStarted(true)} whileTap={tap} transition={SPRING.snappy}
                  className="w-full h-[58px] rounded-full bg-dark-card border border-dark-border text-content font-semibold text-[16px] shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]"
                >
                  У меня уже есть аккаунт
                </motion.button>
              </motion.div>

              <p className="text-center text-content/35 text-[12px] leading-relaxed mt-5 px-4">
                {t('auth.terms')}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="relative flex-1 flex flex-col px-6 pt-[calc(var(--sat)+1rem)] pb-[calc(var(--sab)+1.5rem)]"
          >
            <button
              onClick={() => setStarted(false)}
              className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center text-content/70 hover:bg-content/[0.06] transition-colors"
              aria-label="Назад"
            >
              <ArrowLeft size={22} />
            </button>

            <div className="flex items-center gap-2.5 mt-4 mb-8">
              <DakkaIcon size={44} />
              <span className="text-[26px] font-extrabold tracking-[-0.03em] lowercase">dakka</span>
            </div>

            <div className="flex-1">
              <PhoneAuthForm />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
