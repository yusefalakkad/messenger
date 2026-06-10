import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useAppInit } from '@/hooks/useAppInit';

// P1-19: code splitting. Главный путь — лендинг + auth — не должен тянуть
// livekit-client (~700KB) и весь чат. CallOverlay + GroupCallView рендерятся
// только при isAuthenticated, AuthPage/LandingPage — только для гостей.
const AuthPage      = lazy(() => import('@/pages/AuthPage'));
const ChatPage      = lazy(() => import('@/pages/ChatPage'));
const LandingPage   = lazy(() => import('@/pages/LandingPage'));
const CallOverlay   = lazy(() => import('@/components/call/CallOverlay'));
const GroupCallView = lazy(() => import('@/components/call/GroupCallView'));

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

  // P2-15: cross-tab logout. zustand persist пишет состояние в localStorage,
  // но НЕ подписывается на storage event. Если юзер logout'нулся в одной
  // вкладке — в других он остаётся «онлайн» до hard-reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // ключ зустанд-persist — 'messenger-auth' (см. auth.store.ts).
      if (e.key !== 'messenger-auth') return;
      // newValue=null означает что другая вкладка вызвала localStorage.removeItem.
      // Любое изменение, делающее юзера неавторизованным — выкидываем эту вкладку.
      try {
        const stillAuthed = e.newValue ? JSON.parse(e.newValue)?.state?.isAuthenticated === true : false;
        if (!stillAuthed && useAuthStore.getState().isAuthenticated) logout();
      } catch { /* malformed JSON — игнорируем */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
      <Suspense fallback={<div className="min-h-screen bg-dark-bg" />}>
        <Routes>
          {/* Авторизация: гостям — форма, авторизованным — сразу в чаты.
              P2-7: после login возвращаем юзера на запрошенный deep link. */}
          <Route
            path="/auth"
            element={isAuthenticated ? <RedirectAfterAuth /> : <AuthPage />}
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
        {/* Глобальный оверлей звонков поверх всего. Lazy — livekit/webrtc-тяжёлый код
            не качается пока юзер не залогинился. */}
        {isAuthenticated && <CallOverlay />}
        {/* Групповые звонки через LiveKit SFU — независимый канал от 1-на-1 */}
        {isAuthenticated && <GroupCallView />}
      </Suspense>
    </BrowserRouter>
  );
}

/** Гостевой root: лендинг на «/», иначе редиректим на /auth.
 *  P2-7: пробрасываем оригинальный путь через state, чтобы после auth юзер
 *  попал в /chat/abc, а не на «/». */
function GuestRoot() {
  const path = window.location.pathname;
  const isHome = path === '/' || path === '';
  if (isHome) return <LandingPage />;
  const from = path + window.location.search + window.location.hash;
  return <Navigate to="/auth" replace state={{ from }} />;
}

/** После успешного login возвращаем юзера туда, куда он шёл (state.from), либо на «/». */
function RedirectAfterAuth() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <Navigate to={from && from !== '/auth' ? from : '/'} replace />;
}
