import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initNative } from './lib/native';
import { queryClient } from './lib/queryClient';
import './index.css';

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
