import { motion } from 'framer-motion';
import OceanLogo from '@/components/ui/OceanLogo';
import { EASE } from '@/lib/motion';

// Лёгкий каскад появления hero-блока.
const parent = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const child = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE.out } },
};

export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
      {/* Ambient градиентные пятна на фоне */}
      <div className="absolute -top-32 -left-24 w-[480px] h-[480px] bg-spot-violet blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-[480px] h-[480px] bg-spot-pink blur-3xl opacity-50 pointer-events-none" />

      <motion.div
        variants={parent}
        initial="hidden"
        animate="visible"
        className="relative flex flex-col items-center max-w-md"
      >
        {/* Логотип — сама форма пузыря-бабла, без квадратной подложки. */}
        <motion.div variants={child} className="relative mb-8 animate-float">
          <div className="absolute inset-0 bg-brand-gradient blur-2xl opacity-40" style={{ borderRadius: '40%' }} />
          <div className="relative drop-shadow-[0_10px_30px_rgba(22,224,230,0.45)]">
            <OceanLogo size={100} />
          </div>
        </motion.div>

        {/* Заголовок с градиентным акцентом */}
        <motion.h2 variants={child} className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          Общение, которое<br />
          <span className="text-gradient">чувствуешь</span>
        </motion.h2>

        <motion.p variants={child} className="text-content/45 text-sm sm:text-base mt-4 max-w-sm leading-relaxed">
          Выберите чат слева или начните новый разговор — реакции, голос, видео и атмосфера под каждого собеседника.
        </motion.p>
      </motion.div>
    </div>
  );
}
