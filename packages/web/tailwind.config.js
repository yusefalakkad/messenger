/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand: фиолетово-розово-оранжевый градиент. primary = violet-фиолетовый.
        primary: {
          50:  '#f4efff',
          100: '#e8dcff',
          200: '#d3b8ff',
          300: '#b794ff',
          400: '#9a6dff',
          500: '#7c4dff',
          600: '#6a3df0',
          700: '#5a2fd6',
          800: '#4823a8',
          900: '#311975',
          950: '#1c0d4a',
        },
        // Акцентные тона для градиентов
        accent: {
          pink:   '#ff4d8d',
          fuchsia:'#d946ef',
          orange: '#ff8a3d',
          violet: '#7c4dff',
        },
        // Глубокий тёмно-фиолетовый ночник — не чисто чёрный, со слегка фиолетовым подтоном
        dark: {
          bg:      '#0b0a14',
          surface: '#13111f',
          card:    '#1b1828',
          border:  '#2a2638',
          hover:   '#221f30',
          input:   '#14121e',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'msg': '20px',
        'msg-sm': '8px',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7c4dff 0%, #d946ef 50%, #ff8a3d 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(124,77,255,0.18) 0%, rgba(217,70,239,0.14) 50%, rgba(255,138,61,0.14) 100%)',
        'brand-radial': 'radial-gradient(circle at 30% 20%, rgba(124,77,255,0.25), transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,77,141,0.18), transparent 55%)',
      },
      boxShadow: {
        'glow-violet': '0 10px 40px -10px rgba(124,77,255,0.55)',
        'glow-pink':   '0 10px 40px -10px rgba(255,77,141,0.45)',
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,77,255,0.4)' },
          '50%':      { boxShadow: '0 0 0 14px rgba(124,77,255,0)' },
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
