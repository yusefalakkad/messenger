/* Messenger Service Worker — обработка push-уведомлений. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { /* */ }

  // Sealed-sender-lite: показываем только generic-уведомление, без имени отправителя.
  // Содержимое юзер увидит когда откроет приложение.
  const title = payload.title || 'Новое сообщение';
  const options = {
    body:  payload.body || '',
    icon:  '/icon-192.png',
    badge: '/badge.png',
    tag:   payload.chatId || 'msg',
    data:  { chatId: payload.chatId, url: payload.chatId ? `/chat/${payload.chatId}` : '/' },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        // Если есть открытая вкладка приложения — фокусируем и навигируем
        if (c.url.includes(self.location.origin)) {
          c.focus();
          c.navigate?.(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
