import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useAppInit } from '@/hooks/useAppInit';
import AuthPage from '@/pages/AuthPage';
import ChatPage from '@/pages/ChatPage';
import LandingPage from '@/pages/LandingPage';
import CallOverlay from '@/components/call/CallOverlay';
import GroupCallView from '@/components/call/GroupCallView';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const ready = useAppInit();

  // Слушаем событие разлогина от axios interceptor
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [logout]);

  // Показываем пустой экран пока идёт инициализация (обновление токена)
  if (!ready) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center animate-pulse">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
            </svg>
          </div>
          <div className="flex gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Авторизация: гостям — форма, авторизованным — сразу в чаты. */}
        <Route
          path="/auth"
          element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage />}
        />
        {/* «/» и все остальные пути:
             • если гость и путь корневой — показываем лендинг;
             • если гость и путь не корневой — редирект на /auth;
             • если авторизован — основное приложение (ChatPage). */}
        <Route
          path="/*"
          element={
            isAuthenticated
              ? <ChatPage />
              : <GuestRoot />
          }
        />
      </Routes>
      {/* Глобальный оверлей звонков поверх всего */}
      {isAuthenticated && <CallOverlay />}
      {/* Групповые звонки через LiveKit SFU — независимый канал от 1-на-1 */}
      {isAuthenticated && <GroupCallView />}
    </BrowserRouter>
  );
}

/** Гостевой root: лендинг на «/», иначе редиректим на /auth. */
function GuestRoot() {
  const isHome = window.location.pathname === '/' || window.location.pathname === '';
  return isHome ? <LandingPage /> : <Navigate to="/auth" replace />;
}
