self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

function isUnreadCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function updateAppBadge(fallbackCount) {
  if (typeof self.navigator?.setAppBadge !== 'function') return;

  let count = fallbackCount;
  try {
    const response = await fetch('/api/notifications/unread-count', {
      cache: 'no-store', signal: AbortSignal.timeout?.(3000),
    });
    if (response.ok) {
      const { unreadCount } = await response.json();
      if (isUnreadCount(unreadCount)) count = unreadCount;
    }
  } catch {
    // The push payload also works offline or after a session expires.
  }
  if (isUnreadCount(count)) {
    try { await self.navigator.setAppBadge(count); } catch { /* Permission may have changed. */ }
  }
}

const reservationPath = /^\/spalatorie\/(?:1|2|uscatorie)\?echipament=\d+&zi=\d{4}-\d{2}-\d{2}#rezervare-\d+$/;

self.addEventListener('push', event => {
  const { id, unreadCount, message, path, title } = event.data?.json() ?? {};
  if (!/^\d+$/.test(id)) return;
  const reservation = typeof message === 'string' && reservationPath.test(path);
  event.waitUntil(Promise.all([
    self.registration.showNotification(typeof title === 'string' ? title : 'Căminul Meu', {
      body: reservation ? message : 'Ai un mesaj nou. Deschide aplicația pentru detalii.',
      tag: 'laundry-notice-' + id,
      data: { path: reservation ? path : '/notificari#notificare-' + id },
    }),
    updateAppBadge(unreadCount),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!/^\/notificari#notificare-\d+$/.test(path) && !reservationPath.test(path)) return;
  event.waitUntil(self.clients.openWindow(path));
});
