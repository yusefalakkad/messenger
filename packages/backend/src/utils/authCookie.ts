import { Response } from 'express';
import { config } from '../config';

/**
 * Ставит httpOnly refresh-cookie. Единый источник истины для всех путей логина
 * (username-auth И phone-auth). Без этой cookie POST /auth/refresh не находит
 * токен → 401 → axios-интерсептор выбивает юзера через 15 мин (TTL access-токена),
 * а logout стирает E2E-ключ → «зашифровано, не прочитать». См. инцидент батча 5.
 */
export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: !config.isDev,
    // 'lax' — чтобы <img src=".../api/media/...">, deep-link из push и навигация
    // с лендинга на /chat не теряли cookie. CSRF минимизирован CSP + sameSite.
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}
