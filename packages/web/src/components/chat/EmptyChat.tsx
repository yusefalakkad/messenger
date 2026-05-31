import { ShieldCheck } from 'lucide-react';

export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
      {/* Ambient градиентные пятна на фоне */}
      <div className="absolute -top-32 -left-24 w-[480px] h-[480px] bg-spot-violet blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-[480px] h-[480px] bg-spot-pink blur-3xl opacity-50 pointer-events-none" />

      <div className="relative flex flex-col items-center max-w-md">
        {/* Логотип-карточка со стеклом и брендовым градиентом */}
        <div className="relative mb-8 animate-float">
          <div className="absolute inset-0 bg-brand-gradient blur-2xl opacity-40 rounded-3xl" />
          <div className="relative w-24 h-24 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow-violet">
            <svg width="44" height="44" viewBox="0 0 48 48" fill="none" className="text-white">
              <path
                d="M8 14C8 10.7 10.7 8 14 8H34C37.3 8 40 10.7 40 14V28C40 31.3 37.3 34 34 34H24L18 40V34H14C10.7 34 8 31.3 8 28V14Z"
                fill="currentColor" fillOpacity="0.18"
              />
              <path
                d="M8 14C8 10.7 10.7 8 14 8H34C37.3 8 40 10.7 40 14V28C40 31.3 37.3 34 34 34H24L18 40V34H14C10.7 34 8 31.3 8 28V14Z"
                stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
              />
            </svg>
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
