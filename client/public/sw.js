// Cortex Service Worker v1.19.3
// Includes: Push notifications, offline caching
// v1.19.3: Fix E2EE unlock on PWA reopen
const CACHE_NAME = 'cortex-v1.19.3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v1.19.3...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Message handler for client communication
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_ALL_CACHES') {
    console.log('[SW] Clearing all caches...');
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      console.log('[SW] All caches cleared');
      event.ports[0]?.postMessage({ success: true });
    }).catch((err) => {
      console.error('[SW] Failed to clear caches:', err);
      event.ports[0]?.postMessage({ success: false, error: err.message });
    });
  }
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('cortex-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: Network-first for HTML, cache-first for hashed assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // API requests: Network only (real-time data needs to be fresh)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation requests (HTML): Network-first, fall back to cache
  // This ensures users always get the latest app version
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh HTML for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: try to serve cached HTML
          return caches.match(request).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Hashed assets (JS/CSS with hash in filename): Cache-first (immutable)
  // These files have unique hashes so cached versions are always valid
  if (url.pathname.match(/\.[a-f0-9]{8,}\.(js|css)$/i)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Other assets: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'Cortex',
      body: event.data.text()
    };
  }

  // Use unique tag per message to prevent notification replacement
  // Fall back to timestamp if no messageId provided
  const uniqueTag = data.messageId
    ? `cortex-msg-${data.messageId}`
    : `cortex-${Date.now()}`;

  const options = {
    body: data.body || 'New message received',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: uniqueTag,
    renotify: true,
    requireInteraction: false, // Auto-dismiss after a while on mobile
    silent: false, // Ensure notification makes sound
    data: {
      url: data.url || '/',
      waveId: data.waveId,
      messageId: data.messageId
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  // Check if app is in foreground - if so, skip notification
  // (WebSocket will deliver the message directly to the app)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if any client window is visible/focused
        const hasVisibleClient = clientList.some(client =>
          client.visibilityState === 'visible'
        );

        // Only show notification if app is not visible (backgrounded or closed)
        if (!hasVisibleClient) {
          return self.registration.showNotification(data.title || 'Cortex', options);
        }
        // If app is visible, WebSocket message will show the message directly
        return Promise.resolve();
      })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing Cortex window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate to the specific wave if provided
          if (event.notification.data?.waveId) {
            client.postMessage({
              type: 'navigate-to-wave',
              waveId: event.notification.data.waveId,
              dropletId: event.notification.data.messageId
            });
          }
          return client.focus();
        }
      }
      // No existing window, open new one
      return clients.openWindow(urlToOpen);
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
