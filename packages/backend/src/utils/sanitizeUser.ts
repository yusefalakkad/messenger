/**
 * Приватность онлайн-статуса.
 *
 * Если у юзера lastSeenVisibility === 'nobody', его status/lastSeenAt не должны
 * быть видны ДРУГИМ пользователям: везде, где user-объект отдаётся наружу
 * (members в списке чатов, GET /users/:id и т.п.), статус подменяется на
 * 'offline', lastSeenAt — на null. Сам владелец видит себя как есть.
 *
 * lastSeenVisibility — внутреннее поле: его селектим для проверки, но всегда
 * stripаем из ответа (наружу оно не отдаётся).
 */
export function sanitizeMemberStatus<
  T extends {
    id: string;
    lastSeenVisibility?: string | null;
    status?: string | null;
    lastSeenAt?: Date | string | null;
  },
>(user: T, requesterId: string): Omit<T, 'lastSeenVisibility'> {
  const { lastSeenVisibility, ...rest } = user;
  if (lastSeenVisibility === 'nobody' && user.id !== requesterId) {
    return { ...rest, status: 'offline', lastSeenAt: null };
  }
  return rest;
}
