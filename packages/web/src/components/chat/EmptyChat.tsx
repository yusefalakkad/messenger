import { ShieldCheck } from 'lucide-react';
import DakkaIcon from '@/components/ui/DakkaIcon';

export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
      {/* Ambient градиентные пятна на фоне */}
      <div className="absolute -top-32 -left-24 w-[480px] h-[480px] bg-spot-violet blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-[480px] h-[480px] bg-spot-pink blur-3xl opacity-50 pointer-events-none" />

      <div className="relative flex flex-col items-center max-w-md">
        {/* Логотип — сама форма пузыря-бабла, без квадратной подложки. */}
        <div className="relative mb-8 animate-float">
          <div className="absolute inset-0 bg-brand-gradient blur-2xl opacity-40" style={{ borderRadius: '40%' }} />
          <div className="relative drop-shadow-[0_10px_30px_rgba(154,77,255,0.4)]">
            <DakkaIcon size={100} />
          </div>
        </div>

        {/* Чип-плашка */}
        <div className="chip-brand mb-6">
          <ShieldCheck size={13} className="text-primary-300" />
          Приватность по умолчанию · E2E-шифрование
        </div>

        {/* Заголовок с градиентным акцентом */}
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          Общение, которое<br />
          <span className="text-gradient">чувствуешь</span>
        </h2>

        <p className="text-white/45 text-sm sm:text-base mt-4 max-w-sm leading-relaxed">
          Выберите чат слева или начните новый разговор — реакции, голос, видео и атмосфера под каждого собеседника.
        </p>
      </div>
    </div>
  );
}
