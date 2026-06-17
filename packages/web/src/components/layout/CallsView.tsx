import { Phone } from 'lucide-react';

/**
 * Мобильная вкладка «Звонки» — панель над контентом (таб-бар остаётся снизу).
 * Истории звонков на бэке пока нет, поэтому это честное пустое состояние.
 * Когда появится лог звонков — список рендерится здесь.
 */
export default function CallsView() {
  return (
    <div className="lg:hidden absolute inset-0 z-30 bg-dark-bg flex flex-col pt-[var(--sat)]">
      <header className="flex-shrink-0 h-14 flex items-center px-5 liquid-glass">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Звонки</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
        <div className="relative">
          <div className="absolute -inset-2 bg-brand-gradient blur-2xl opacity-20 rounded-full" />
          <div className="relative w-16 h-16 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center">
            <Phone size={26} className="text-content/55" />
          </div>
        </div>
        <p className="text-content/90 text-[15px] font-semibold">Пока нет звонков</p>
        <p className="text-content/45 text-[13px] leading-5 max-w-[240px]">
          Здесь появится история ваших аудио- и видеозвонков
        </p>
      </div>
    </div>
  );
}
