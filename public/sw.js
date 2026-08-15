const CACHE_NAME = 'hello-trader-v2-cache-bypass';

// On install, activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// On activate, IMMEDIATELY PURGE AND DELETE ALL OLD CACHES
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler: STRICT NETWORK-ONLY for all JS chunks, HTML pages, and APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache APIs, WebSockets, Next.js static JS chunks, or page navigations
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.js')
  ) {
    return; // Pass through directly to live network
  }

  // 2. Only cache static images/media assets with network fallback
  if (url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.ico') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      }).catch(() => fetch(event.request))
    );
  }
});
