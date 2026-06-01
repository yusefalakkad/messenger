/**
 * Chat-management API helpers.
 * Backend endpoints update per-user state and broadcast 'chat:state-updated'
 * over the socket, so we don't need to mutate the store locally here.
 */
import { api } from './api';
import type { Chat } from '@messenger/shared';

export async function pinChat(chatId: string, pinned: boolean): Promise<void> {
  await api.patch(`/chats/${chatId}/pin`, { pinned });
}

export async function archiveChat(chatId: string, archived: boolean): Promise<void> {
  await api.patch(`/chats/${chatId}/archive`, { archived });
}

export async function muteChat(chatId: string, until: string | null | 'forever'): Promise<void> {
  await api.patch(`/chats/${chatId}/mute`, { until });
}

export async function fetchArchivedChats(): Promise<Chat[]> {
  const { data } = await api.get('/chats/archived');
  return (data?.data ?? []) as Chat[];
}

// Сервер возвращает 400 с code === 'PIN_LIMIT_REACHED' если превышен лимит закрепления.
export function isPinLimitError(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { error?: { code?: string } } } };
  return e?.response?.status === 400 && e?.response?.data?.error?.code === 'PIN_LIMIT_REACHED';
}
