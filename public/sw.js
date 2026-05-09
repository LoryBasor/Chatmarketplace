// public/sw.js — Service Worker pour les notifications push
const CACHE_NAME = 'instantchat-v2';
const STATIC_ASSETS = [
  '/',
  '/chat',
  '/css/style.css',
  '/js/app.js',
  '/js/socket.js',
  '/js/notifications.js',
  '/images/default-avatar.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ne pas intercepter les requêtes API ou Socket.IO
  if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'InstantChat', {
      body:    data.body || 'Nouveau message',
      icon:    '/images/logo.png',
      badge:   '/images/badge.png',
      vibrate: [200, 100, 200],
      tag:     data.tag || 'instantchat',
      data:    data.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/chat');
    })
  );
});
