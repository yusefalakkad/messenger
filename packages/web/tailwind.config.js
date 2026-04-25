/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary brand color (similar to Telegram blue but unique)
        primary: {
          50:  '#eef5ff',
          100: '#d9e9ff',
          200: '#bcd5ff',
          300: '#8fb9ff',
          400: '#6093ff',
          500: '#3b6ef5',
          600: '#2650ea',
          700: '#1e3fd6',
          800: '#1f35ad',
          900: '#1e3188',
          950: '#161f52',
        },
        // Dark theme backgrounds (Telegram-inspired)
        dark: {
          bg:      '#0e0e10',
          surface: '#1c1c1e',
          card:    '#2c2c2e',
          border:  '#38383a',
          hover:   '#3a3a3c',
          input:   '#1c1c1e',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'msg': '18px',
        'msg-sm': '8px',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' }, '40%': { transform: 'scale(1)', opacity: '1' } },
      },
    },
  },
  plugins: [],
};
