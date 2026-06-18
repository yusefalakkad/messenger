import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initNative } from './lib/native';
import { initTheme } from './lib/theme';
import { initSentry } from './lib/sentry';
import { initAppUpdateCheck } from './lib/appUpdate';
import { primeAudioUnlock } from './lib/notificationSound';
import '@fontsource-variable/inter'; // шрифт Inter (self-hosted) — как в дизайн-референсе
import './lib/i18n'; // инициализация i18n (язык из localStorage/системы)
import { queryClient } from './lib/queryClient';
import './index.css';

// Мониторинг ошибок (no-op без VITE_SENTRY_DSN).
initSentry();

// Авто-детект новой версии фронта → тост «Обновить» (no-op в dev/desktop/native).
initAppUpdateCheck();

// Тема: применяем сохранённую (dark/light/auto) + подписка на системную смену.
// index.html уже выставил data-theme до пейнта; здесь — react-runtime + auto-listener.
initTheme();

// Разблокируем аудио на первый клик/ввод — чтобы входящий рингтон гарантированно
// зазвучал, даже если звонок придёт до первого взаимодействия со страницей.
primeAudioUnlock();

// Десктоп (Electron, macOS): окно без рамки (hiddenInset) — системные кнопки
// «светофор» рисуются в левом-верхнем углу поверх контента и налезали на аватар
// в шапке. Добавляем перетаскиваемую полоску-титлбар сверху и сдвигаем контент
// вниз (html.is-desktop в index.css), чтобы кнопки жили в своём «баре».
const dd = (window as { dakkaDesktop?: { isDesktop?: boolean; platform?: string } }).dakkaDesktop;
if (dd?.isDesktop) {
  document.documentElement.classList.add('is-desktop');
  // Перетаскиваемая полоска + сдвиг под «светофор» нужны ТОЛЬКО на macOS
  // (frameless hiddenInset). На Windows/Linux рамка системная — иначе сверху
  // висел бы лишний пустой бар, а слева — зазор под несуществующий «светофор».
  if (dd.platform === 'darwin') {
    document.documentElement.classList.add('is-desktop-mac');
    const bar = document.createElement('div');
    bar.className = 'desktop-titlebar';
    document.body.appendChild(bar);
  }
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
