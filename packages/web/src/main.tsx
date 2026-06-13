import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initNative } from './lib/native';
import { initTheme } from './lib/theme';
import { initSentry } from './lib/sentry';
import { queryClient } from './lib/queryClient';
import './index.css';

// Мониторинг ошибок (no-op без VITE_SENTRY_DSN).
initSentry();

// Тема: применяем сохранённую (dark/light/auto) + подписка на системную смену.
// index.html уже выставил data-theme до пейнта; здесь — react-runtime + auto-listener.
initTheme();

// Десктоп (Electron, macOS): окно без рамки (hiddenInset) — системные кнопки
// «светофор» рисуются в левом-верхнем углу поверх контента и налезали на аватар
// в шапке. Добавляем перетаскиваемую полоску-титлбар сверху и сдвигаем контент
// вниз (html.is-desktop в index.css), чтобы кнопки жили в своём «баре».
if ((window as { dakkaDesktop?: { isDesktop?: boolean } }).dakkaDesktop?.isDesktop) {
  document.documentElement.classList.add('is-desktop');
  const bar = document.createElement('div');
  bar.className = 'desktop-titlebar';
  document.body.appendChild(bar);
}

// Инициализируем нативные плагины как можно раньше — до первого рендера.
// На web этот вызов — no-op.
initNative().catch((err) => console.error('[native] init failed', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
