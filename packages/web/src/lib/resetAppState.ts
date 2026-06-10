/**
 * Полный сброс in-memory + кэш-стейта приложения. Должен вызываться при ЛЮБОМ
 * пути logout'а (явный, refresh failure, multi-tab):
 *   • чтобы данные предыдущего юзера не утекли новому в той же вкладке;
 *   • чтобы pending-сообщения не улетели под новой сессией.
 *
 * Контекст: P1-8 / P1-10 / P1-17 в docs/WEB_AUDIT_2026-06-10.md.
 *
 * Что НЕ сбрасывается здесь:
 *   • keyVault (encrypted private key in localStorage) — нужен для следующего логина;
 *     plaintext-кэш в sessionStorage чистится в auth.store.logout() через clearVaultCache.
 *   • zustand-persist auth state — чистится в auth.store.logout() через set().
 */
import { useChatStore } from '@/stores/chat.store';
import { useCallStore } from '@/stores/call.store';
import { disconnectSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

const DRAFT_PREFIX = 'draft:';

export function resetAppState(): void {
  // Сокет + outbox + ack-таймеры + флаг initial-connect — внутри disconnectSocket.
  try { disconnectSocket(); } catch { /* ignore */ }

  // Stores
  try { useChatStore.getState().reset(); } catch { /* ignore */ }
  try {
    const call = useCallStore.getState();
    call.clearCall();
    call.clearGroupCall();
  } catch { /* ignore */ }

  // React-query кэш — содержит контакты, профили и пр. предыдущего юзера.
  try { queryClient.clear(); } catch { /* ignore */ }

  // Drafts: хранятся в localStorage по ключу `draft:<chatId>`. Они приватны
  // для юзера и не должны переживать смену сессии в той же вкладке.
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch { /* инкогнито / квота */ }
}
