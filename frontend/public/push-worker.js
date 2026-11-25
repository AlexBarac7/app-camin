self.addEventListener('push', event => {
  const { id } = event.data?.json() ?? {};
  if (!/^\d+$/.test(id)) return;
  event.waitUntil(self.registration.showNotification('Cămin', {
    body: 'Ai un mesaj nou. Deschide aplicația pentru detalii.',
    tag: 'laundry-notice-' + id,
    data: { path: '/notificari#notificare-' + id },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!/^\/notificari#notificare-\d+$/.test(path)) return;
  event.waitUntil(self.clients.openWindow(path));
});
