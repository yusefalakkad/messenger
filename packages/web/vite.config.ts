import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Ссылка на исходники shared пакета
      '@messenger/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  optimizeDeps: {
    // КРИТИЧЕСКИ ВАЖНО: Исключаем libsodium из пре-бандлинга,
    // чтобы Vite не ломал пути к .mjs файлам внутри библиотеки
    exclude: ['libsodium-wrappers'],
    // Позволяем Vite подтягивать shared пакет как зависимость
    include: ['@messenger/shared']
  },
  build: {
    commonjsOptions: {
      // Позволяет корректно собирать смешанные CJS/ESM модули
      include: [/libsodium-wrappers/, /node_modules/],
    },
    // P1-19: явные чанки. livekit-client (~700KB) и framer-motion (~150KB)
    // не должны лежать в общем index.js — они нужны только в чате/звонках.
    rollupOptions: {
      output: {
        manualChunks: {
          livekit:  ['livekit-client'],
          motion:   ['framer-motion'],
          icons:    ['lucide-react'],
          'date-utils': ['date-fns'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
