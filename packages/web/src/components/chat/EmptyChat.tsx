export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-24 h-24 rounded-3xl bg-dark-card flex items-center justify-center mb-6">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-white/20">
          <path
            d="M8 12C8 9.8 9.8 8 12 8H36C38.2 8 40 9.8 40 12V28C40 30.2 38.2 32 36 32H26L20 38L16 32H12C9.8 32 8 30.2 8 28V12Z"
            stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
          />
          <circle cx="18" cy="20" r="2" fill="currentColor" />
          <circle cx="24" cy="20" r="2" fill="currentColor" />
          <circle cx="30" cy="20" r="2" fill="currentColor" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white/80 mb-2">Выберите чат</h2>
      <p className="text-white/30 text-sm max-w-xs">
        Выберите существующий чат или начните новый разговор
      </p>
    </div>
  );
}
