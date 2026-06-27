import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import PhoneAuthForm from '@/components/auth/PhoneAuthForm';
import OceanLogo from '@/components/ui/OceanLogo';
import Spores from '@/components/ui/Spores';
import { EASE, SPRING, tap } from '@/lib/motion';

const INTER = "'Inter Variable', -apple-system, system-ui, sans-serif";
// Океанский фирменный градиент (аква → циан → океанский синий → глубокая синь).
const BRAND = 'linear-gradient(135deg, #42E6CE 0%, #16B6E0 40%, #2D6BF0 74%, #1E40C8 100%)';
// «Текстура» плиток: верхний inset-блик + нижняя inset-тень + мягкая внешняя тень.
const GLOSS = 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -8px 16px rgba(0,0,0,0.18), 0 14px 28px -6px rgba(0,0,0,0.30)';

// Парящие аватарки — океанские акценты (aqua/cyan/ocean/violet + тёплый amber-всплеск).
const FLOATERS: { t: string; g: string; size: number; top: number; left: number; dur: number; delay: number }[] = [
  { t: 'ДР', g: 'linear-gradient(150deg,#6AA2FF,#2D5BF0)', size: 52, top: 150, left: 36,  dur: 4,   delay: 0   },
  { t: 'СВ', g: 'linear-gradient(150deg,#5DEBD6,#13B6BE)', size: 58, top: 196, left: 300, dur: 4.6, delay: 0.6 },
  { t: 'АП', g: 'linear-gradient(150deg,#FFD58A,#FF9A3D)', size: 46, top: 320, left: 60,  dur: 5.1, delay: 1.1 },
  { t: 'НК', g: 'linear-gradient(150deg,#C79CFF,#7A45E6)', size: 50, top: 360, left: 312, dur: 5.6, delay: 1.6 },
];

export default function AuthPage() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-dark-bg text-content flex flex-col"
      style={{ fontFamily: INTER }}
    >
      {/* Тёплое свечение сверху по референсу */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 55% at 18% -8%, rgba(22,224,230,0.18), transparent 60%), radial-gradient(110% 50% at 92% 4%, rgba(122,43,255,0.16), transparent 62%)' }}
      />
      {/* биолюминесцентные споры — только тёмная тема */}
      <Spores count={40} seed={11} />
      <span className="sr-only">ocean</span>

      <AnimatePresence mode="wait">
        {!started ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="relative flex flex-col min-h-screen px-5 pb-[calc(var(--sab)+1.25rem)] w-full lg:max-w-[420px] lg:mx-auto"
          >
            {/* ── Парящие аватарки: точные позиции, размеры, float-анимация ── */}
            {FLOATERS.map((f) => (
              <div key={f.t} className="absolute" style={{ top: f.top, left: f.left, width: f.size, height: f.size }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.55 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...SPRING.gentle, delay: f.delay * 0.4 }}
                  className="w-full h-full"
                >
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-semibold"
                    style={{
                      fontSize: 16,
                      borderRadius: f.size * 0.34,
                      background: f.g,
                      boxShadow: GLOSS,
                      animation: `dakkaFloatY ${f.dur}s ease-in-out ${f.delay}s infinite`,
                    }}
                  >
                    {f.t}
                  </div>
                </motion.div>
              </div>
            ))}

            {/* ── Лого-локап: пузырь + вордмарк «ocean» по центру ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING.gentle, delay: 0.15 }}
              className="absolute left-0 right-0 flex flex-col items-center"
              style={{ top: 198 }}
            >
              <div className="animate-float drop-shadow-[0_16px_32px_rgba(45,107,240,0.4)]">
                <OceanLogo size={92} />
              </div>
              <span style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-2.9px', lineHeight: 1 }} className="mt-2">ocean</span>
            </motion.div>

            {/* спейсер под верхний кластер */}
            <div style={{ height: 440 }} className="flex-shrink-0" />

            {/* ── Заголовок + подзаголовок (слева) ── */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.5, ease: EASE.out }}
            >
              <h1 style={{ fontSize: 33, fontWeight: 800, lineHeight: '37px', letterSpacing: '-1.3px' }}>
                Сообщения, которые хочется открывать
              </h1>
              <p style={{ fontSize: 16.5, lineHeight: '24.75px', maxWidth: 320 }} className="text-content/[0.56] mt-3">
                Голос, видео и текст — в одном красивом, быстром и приватном приложении.
              </p>
            </motion.div>

            {/* ── Кнопки + дисклеймер, прижаты вниз ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: EASE.out }}
              className="mt-auto pt-7"
            >
              <motion.button
                onClick={() => setStarted(true)} whileTap={tap} transition={SPRING.snappy}
                className="w-full flex items-center justify-center gap-2 text-white"
                style={{ height: 58, borderRadius: 29, fontSize: 17, fontWeight: 700, background: BRAND, boxShadow: '0 12px 28px rgba(45,107,240,0.45), inset 0 1px 1px rgba(255,255,255,0.5)' }}
              >
                Войти <ArrowRight size={18} strokeWidth={2.4} />
              </motion.button>
              <p className="text-center text-content/[0.4] text-[12px] leading-relaxed mt-5 px-4">
                {t('auth.terms')}
              </p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="relative flex-1 flex flex-col px-6 pt-[calc(var(--sat)+1rem)] pb-[calc(var(--sab)+1.5rem)] w-full lg:max-w-[420px] lg:mx-auto"
          >
            <button
              onClick={() => setStarted(false)}
              className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center text-content/70 hover:bg-content/[0.06] transition-colors"
              aria-label="Назад"
            >
              <ArrowLeft size={22} />
            </button>

            <div className="flex items-center gap-2.5 mt-4 mb-8">
              <OceanLogo size={40} />
              <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1.5px' }}>ocean</span>
            </div>

            {/* На десктопе центрируем форму по вертикали (не «прижата» к верху
                с пустотой снизу), на мобиле — обычный поток. */}
            <div className="flex-1 lg:flex lg:flex-col lg:justify-center lg:pb-24">
              <PhoneAuthForm />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
