/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Тема через атрибут data-theme на <html> (см. lib/theme.ts). Включаем
  // `dark:`-варианты, привязанные к data-theme="dark" — для точечных правок,
  // где цвет должен отличаться в светлой теме (напр. акцентный текст на тинте).
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Brand: океанский градиент (аква → циан → океанский синий → глубокая синь).
        // primary = ocean blue #2D6BF0.
        primary: {
          50:  '#eaf1ff',
          100: '#d6e4ff',
          200: '#aecaff',
          300: '#7da6ff',
          400: '#4d80f6',
          500: '#2d6bf0',  // ocean blue
          600: '#2257de',
          700: '#1e40c8',  // deep sea
          800: '#1a36a8',
          900: '#16307f',
          950: '#0e1d4d',
        },
        // Акцентные тона ocean (ключи сохранены — значения переведены на океан,
        // чтобы существующие usage-и автоматически стали океанскими).
        accent: {
          pink:   '#16b6e0',  // cyan (середина бренд-градиента)
          fuchsia:'#2d6bf0',  // ocean blue
          orange: '#ff9a3d',  // тёплый «всплеск» (amber)
          violet: '#2d6bf0',  // единый океанский акцент
          coral:  '#34dcc8',  // aqua
          indigo: '#2d6bf0',
          teal:   '#34dcc8',  // aqua («в сети»)
        },
        // Поверхности — через CSS-переменные (см. index.css :root / [data-theme=light]).
        // Один и тот же класс bg-dark-bg меняет цвет по теме автоматически.
        // RGB-канальная форма → работает opacity-модификатор (bg-dark-surface/80).
        dark: {
          bg:      'rgb(var(--bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
          card:    'rgb(var(--card-rgb) / <alpha-value>)',
          border:  'rgb(var(--border-rgb) / <alpha-value>)',
          hover:   'rgb(var(--hover-rgb) / <alpha-value>)',
          input:   'rgb(var(--input-rgb) / <alpha-value>)',
        },
        // Семантический цвет текста/иконок: white в тёмной теме, near-black в светлой.
        // text-content/70 даёт правильную прозрачность в обеих темах.
        content: 'rgb(var(--content-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      // ─── Дизайн-система ────────────────────────────────────────────────────
      // 4/8px-сетка отступов. Радиусы 6/10/14/18/24/9999. Hit-target ≥ 44px.
      // Типографика — 5 ступеней + line-height + tracking.
      spacing: {
        // помимо tailwind-дефолтов 4/8/12/16/20/24 (1/2/3/4/5/6),
        // полезные «межсредние» для плотной messenger-вёрстки.
        '4.5':  '1.125rem',  // 18
        '13':   '3.25rem',   // 52  — стандартная ячейка списка
        '15':   '3.75rem',   // 60  — chat-header высота
        '18':   '4.5rem',    // 72
      },
      minHeight:  { 'tap': '44px' },  // hit-target по WCAG
      minWidth:   { 'tap': '44px' },
      // ─── Z-layer система ───────────────────────────────────────────────────
      // Единая шкала слоёв — чтобы НИЧЕГО не перекрывалось хаотично.
      // Используй ТОЛЬКО эти значения через z-{name}.
      zIndex: {
        'base':     '0',    // контент в потоке
        'raised':   '10',   // приподнятые элементы (sticky-бары, бейджи)
        'header':   '30',   // шапки чата/сайдбара (над контентом и баннерами)
        'dropdown': '40',   // выпадающие меню, поповеры, пикеры
        'panel':    '60',   // боковые панели (профиль), selection-bar
        'overlay':  '100',  // затемнённая подложка модалок
        'modal':    '110',  // сами модалки/диалоги
        'sheet':    '120',  // bottom-sheets, schedule
        'call':     '300',  // оверлей звонков (поверх всего)
        'toast':    '400',  // тосты-уведомления (самый верх)
      },
      borderRadius: {
        // Token-набор. Используй ТОЛЬКО эти значения по системе.
        // Шкала округлена сильнее (мягкий, современный вид) — 2026-06-17.
        'xs':     '8px',
        'sm':     '11px',
        'md':     '14px',
        'lg':     '18px',
        'xl':     '24px',
        '2xl':    '30px',
        '3xl':    '40px',
        // legacy aliases для уже написанных пузырей.
        'msg':    '24px',
        'msg-sm': '8px',
      },
      fontSize: {
        // 5-ступенчатая шкала по messenger-конвенции.
        // [size, { lineHeight, letterSpacing, fontWeight? }]
        'caption':  ['11px', { lineHeight: '14px', letterSpacing: '0.01em' }],     // time stamps
        'micro':    ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],     // metadata
        'body-sm':  ['13px', { lineHeight: '18px' }],                              // sidebar preview
        'body':     ['15px', { lineHeight: '20px' }],                              // основной
        'body-lg':  ['16px', { lineHeight: '22px' }],
        'title-sm': ['17px', { lineHeight: '22px', letterSpacing: '-0.01em', fontWeight: '600' }], // chat-header
        'title':    ['20px', { lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: '600' }], // section
        'h2':       ['24px', { lineHeight: '30px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'h1':       ['32px', { lineHeight: '38px', letterSpacing: '-0.025em', fontWeight: '700' }],
      },
      backgroundImage: {
        // Океанский градиент: аква → циан → океанский синий → глубокая синь.
        'brand-gradient': 'linear-gradient(135deg, #42E6CE 0%, #16B6E0 40%, #2D6BF0 74%, #1E40C8 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(52,220,200,0.18) 0%, rgba(22,182,224,0.15) 45%, rgba(45,107,240,0.16) 100%)',
        'brand-radial': 'radial-gradient(circle at 30% 20%, rgba(22,182,224,0.25), transparent 50%), radial-gradient(circle at 70% 80%, rgba(45,107,240,0.18), transparent 55%)',
      },
      boxShadow: {
        // Дизайн-система: 4 ступени высоты + 2 brand-glow.
        // e1 — кнопки в покое; e2 — карточки; e3 — модалки; e4 — оверлеи/popover.
        'e1': '0 1px 2px rgba(0,0,0,0.25), 0 1px 1px rgba(0,0,0,0.15)',
        'e2': '0 4px 12px -2px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)',
        'e3': '0 12px 32px -8px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.25)',
        'e4': '0 24px 64px -12px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.3)',
        /* glow-* — океанские свечения (имена сохранены, цвет переведён на океан) */
        'glow-violet': '0 8px 28px -10px rgba(45,107,240,0.55)',   /* ocean blue glow */
        'glow-pink':   '0 8px 28px -10px rgba(22,182,224,0.45)',   /* cyan glow */
        'glow-soft':   '0 8px 32px -12px rgba(0,0,0,0.6)',
      },
      animation: {
        'fade-in':         'fadeIn 0.25s ease-out',
        'slide-up':        'slideUp 0.3s ease-out',
        'slide-down':      'slideDown 0.3s ease-out',
        'slide-left':      'slideLeft 0.3s ease-out',
        'slide-right':     'slideRight 0.3s ease-out',
        'pulse-dot':       'pulseDot 1.4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 12s ease infinite',
        'float':           'float 7s ease-in-out infinite',
        'float-slow':      'float 11s ease-in-out infinite',
        'breathe':         'breathe 6s ease-in-out infinite',
        'pulse-glow':      'pulseGlow 3s ease-in-out infinite',
        'spin-slow':       'spin 12s linear infinite',
        'shimmer':         'shimmer 2.5s linear infinite',
        'pop':             'pop 0.35s cubic-bezier(.34,1.56,.64,1)',
        // ocean: кольцо присутствия у аватара/в звонке + точки «печатает».
        'presence-pulse':  'presencePulse 2.4s ease-in-out infinite',
        'typing-dot':      'typingDot 1.2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:    { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown:  { from: { opacity: '0', transform: 'translateY(-12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideLeft:  { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        slideRight: { from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseDot: { '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' }, '40%': { transform: 'scale(1)', opacity: '1' } },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%':      { transform: 'scale(1.06)', opacity: '0.85' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(45,107,240,0.4)' },
          '50%':      { boxShadow: '0 0 0 14px rgba(45,107,240,0)' },
        },
        // ocean — кольцо присутствия (как у аватара в макете).
        presencePulse: {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%':      { opacity: '0.2',  transform: 'scale(1.1)' },
        },
        // ocean — точки индикатора «печатает» (фазовый сдвиг задаётся inline).
        typingDot: {
          '0%, 60%, 100%': { opacity: '0.3', transform: 'translateY(0)' },
          '30%':           { opacity: '1',   transform: 'translateY(-2px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pop: {
          '0%':   { transform: 'scale(0.85)', opacity: '0' },
          '60%':  { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      transitionTimingFunction: {
        'soft':   'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
