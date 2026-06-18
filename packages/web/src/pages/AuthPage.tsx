import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import PhoneAuthForm from '@/components/auth/PhoneAuthForm';
import DakkaIcon from '@/components/ui/DakkaIcon';
import { EASE, SPRING, tap } from '@/lib/motion';

// Точный фирменный градиент из референса (coral → pink → periwinkle).
const BRAND = 'linear-gradient(135deg, #FF7A78 0%, #FF4E86 46%, #7A82FF 100%)';

// Парящие аватарки-плитки (декор) внутри верхнего кластера — позиции по референсу.
// rot задаём через framer (animate), т.к. Tailwind-transform конфликтует с motion.
const FLOATERS: { t: string; g: string; cls: string; rot: number; delay: number }[] = [
  { t: 'ДР', g: 'linear-gradient(150deg,#9aa0ff,#5b5bf5)', cls: 'left-1 top-[4%]',   rot: -8, delay: 0.05 },
  { t: 'СВ', g: 'linear-gradient(150deg,#46e5cf,#13a6be)', cls: 'right-2 top-[22%]', rot:  7, delay: 0.12 },
  { t: 'АП', g: 'linear-gradient(150deg,#ffd06b,#ff8a3d)', cls: 'left-4 top-[54%]',  rot:  5, delay: 0.19 },
  { t: 'НК', g: 'linear-gradient(150deg,#c98dff,#8a45e6)', cls: 'right-1 top-[66%]', rot: -6, delay: 0.26 },
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
            className="relative flex-1 flex flex-col px-6 pt-[var(--sat)] pb-[calc(var(--sab)+1.25rem)]"
          >
            {/* ── Верхний кластер: парящие аватарки + лого-локап по центру ── */}
            <div className="relative w-full" style={{ height: '44vh', minHeight: 308 }}>
              {FLOATERS.map((f) => (
                <motion.div
                  key={f.t}
                  initial={{ opacity: 0, scale: 0.6, rotate: f.rot }}
                  animate={{ opacity: 1, scale: 1, rotate: f.rot, y: [0, -7, 0] }}
                  transition={{ opacity: { delay: f.delay, duration: 0.4 }, scale: { ...SPRING.gentle, delay: f.delay }, y: { duration: 4 + f.delay * 6, repeat: Infinity, ease: 'easeInOut' } }}
                  className={`absolute w-[58px] h-[58px] rounded-[19px] flex items-center justify-center text-white font-semibold text-[15px] shadow-[0_14px_28px_-8px_rgba(0,0,0,0.35)] ${f.cls}`}
                  style={{ background: f.g }}
                >
                  {f.t}
                </motion.div>
              ))}

              {/* Лого-локап: пузырь + вордмарк «dakka», по центру кластера */}
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING.gentle, delay: 0.18 }}
                className="absolute flex flex-col items-center"
                style={{ top: '50%', left: '50%', x: '-50%' }}
              >
                <div className="animate-float drop-shadow-[0_14px_30px_rgba(255,90,130,0.35)]">
                  <DakkaIcon size={70} />
                </div>
                <span className="text-[44px] font-extrabold tracking-[-0.045em] lowercase leading-none mt-3">dakka</span>
              </motion.div>
            </div>

            {/* ── Заголовок + подзаголовок (слева) ── */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.5, ease: EASE.out }}
              className="mt-1"
            >
              <h1 className="text-[28px] font-bold leading-[1.16] tracking-[-0.02em]">
                Сообщения, которые<br />хочется открывать
              </h1>
              <p className="text-content/50 text-[15px] leading-relaxed mt-3">
                Голос, видео и текст — в одном красивом, быстром и приватном приложении.
              </p>
            </motion.div>

            {/* ── Кнопки + дисклеймер, прижаты вниз ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.5, ease: EASE.out }}
              className="mt-auto pt-7"
            >
              <div className="space-y-3">
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
              </div>
              <p className="text-center text-content/35 text-[12px] leading-relaxed mt-5 px-4">
                {t('auth.terms')}
              </p>
            </motion.div>
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
              <DakkaIcon size={40} />
              <span className="text-[26px] font-extrabold tracking-[-0.04em] lowercase">dakka</span>
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
