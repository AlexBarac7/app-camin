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

self.addEventListener('push', event => {
  const { id, unreadCount } = event.data?.json() ?? {};
  if (!/^\d+$/.test(id)) return;
  event.waitUntil(Promise.all([
    self.registration.showNotification('Căminul Meu', {
      body: 'Ai un mesaj nou. Deschide aplicația pentru detalii.',
      tag: 'laundry-notice-' + id,
      data: { path: '/notificari#notificare-' + id },
    }),
    updateAppBadge(unreadCount),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!/^\/notificari#notificare-\d+$/.test(path)) return;
  event.waitUntil(self.clients.openWindow(path));
});
