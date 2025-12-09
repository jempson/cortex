# PWA Implementation Plan for Cortex v1.6.0

## Overview

Transform Cortex into a Progressive Web App (PWA) that can be installed on Android and iOS devices, work offline, and deliver push notifications.

**Goal:** Make Cortex installable on mobile devices via "Add to Home Screen" with native app-like experience.

---

## What We Need

| Component | Purpose | Priority |
|-----------|---------|----------|
| Web App Manifest | App metadata, icons, install prompt | Required |
| Service Worker | Offline caching, push notifications | Required |
| App Icons | Home screen icons for all devices | Required |
| HTTPS | Required for service workers | Required (prod) |
| Install Prompt UI | Custom "Install App" button | Recommended |
| Offline Shell | Basic UI when offline | Recommended |
| Push Notifications | Alerts when app is closed | Optional (Phase 2) |

---

## Phase 1: Basic PWA (Installable App)

### 1. Web App Manifest

Create `client/public/manifest.json`:

```json
{
  "name": "Cortex - Secure Wave Communications",
  "short_name": "Cortex",
  "description": "Privacy-first federated communication platform",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#050805",
  "theme_color": "#0ead69",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["communication", "social"],
  "shortcuts": [
    {
      "name": "New Wave",
      "short_name": "New Wave",
      "description": "Create a new wave",
      "url": "/?action=new-wave",
      "icons": [{ "src": "/icons/shortcut-new-wave.png", "sizes": "96x96" }]
    }
  ]
}
```

### 2. Update index.html

Add to `client/index.html` `<head>`:

```html
<!-- PWA Meta Tags -->
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0ead69">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Cortex">

<!-- iOS Icons -->
<link rel="apple-touch-icon" href="/icons/icon-152x152.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png">

<!-- iOS Splash Screens (optional but recommended) -->
<link rel="apple-touch-startup-image" href="/icons/splash-640x1136.png"
      media="(device-width: 320px) and (device-height: 568px)">
<link rel="apple-touch-startup-image" href="/icons/splash-750x1334.png"
      media="(device-width: 375px) and (device-height: 667px)">
<link rel="apple-touch-startup-image" href="/icons/splash-1242x2208.png"
      media="(device-width: 414px) and (device-height: 736px)">
<link rel="apple-touch-startup-image" href="/icons/splash-1125x2436.png"
      media="(device-width: 375px) and (device-height: 812px)">

<!-- Favicon -->
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png">
```

### 3. Service Worker

Create `client/public/sw.js`:

```javascript
const CACHE_NAME = 'cortex-v1.6.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch: Network-first strategy for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // API requests: Network only (real-time data)
  if (url.pathname.startsWith('/api/')) {
    return; // Let browser handle normally
  }

  // Static assets: Cache-first, fallback to network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached, but also update cache in background
        event.waitUntil(
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }

      // Not cached, fetch from network
      return fetch(request).then((response) => {
        // Cache successful responses
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Handle push notifications (Phase 2)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New message',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'cortex-notification',
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Cortex', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(urlToOpen);
    })
  );
});
```

### 4. Register Service Worker

Add to `client/CortexApp.jsx` (after imports, ~line 20):

```javascript
// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service worker registered:', registration.scope);

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Every hour
      })
      .catch((error) => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
}
```

### 5. Install Prompt Component

Add new component to `client/CortexApp.jsx`:

```javascript
const InstallPrompt = ({ isMobile }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show prompt after 30 seconds or on second visit
      const visitCount = parseInt(localStorage.getItem('cortex_visits') || '0') + 1;
      localStorage.setItem('cortex_visits', visitCount.toString());

      if (visitCount >= 2) {
        setShowPrompt(true);
      } else {
        setTimeout(() => setShowPrompt(true), 30000);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] App installed');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for 7 days
    localStorage.setItem('cortex_install_dismissed', Date.now().toString());
  };

  // Check if dismissed recently
  useEffect(() => {
    const dismissedAt = localStorage.getItem('cortex_install_dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (isInstalled || !showPrompt || !deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: isMobile ? '70px' : '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
      border: '2px solid #0ead69',
      padding: isMobile ? '16px' : '20px',
      zIndex: 1000,
      maxWidth: '400px',
      width: 'calc(100% - 40px)',
      boxShadow: '0 4px 20px rgba(14, 173, 105, 0.3)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px'
      }}>
        <div style={{ color: '#0ead69', fontWeight: 'bold', fontSize: '1rem' }}>
          Install Cortex
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#6a7a6a',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: 0,
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      <p style={{
        color: '#c5d5c5',
        fontSize: '0.85rem',
        marginBottom: '16px',
        lineHeight: 1.4
      }}>
        Install Cortex on your device for quick access and offline support.
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleInstall}
          style={{
            flex: 1,
            padding: '12px 20px',
            background: '#0ead69',
            border: 'none',
            color: '#050805',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '0.9rem'
          }}
        >
          INSTALL APP
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: '1px solid #3a4a3a',
            color: '#6a7a6a',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          LATER
        </button>
      </div>
    </div>
  );
};
```

Add to App component JSX (before closing `</div>`):

```javascript
<InstallPrompt isMobile={isMobile} />
```

### 6. Offline Indicator Component

```javascript
const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: '#ff6b35',
      color: '#050805',
      padding: '8px',
      textAlign: 'center',
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      fontWeight: 'bold',
      zIndex: 9999
    }}>
      OFFLINE - Some features unavailable
    </div>
  );
};
```

---

## Phase 2: Browser Notifications (Desktop)

Add to `client/CortexApp.jsx` in the App component:

```javascript
// Notification permission state
const [notificationsEnabled, setNotificationsEnabled] = useState(
  Notification.permission === 'granted'
);

// Request notification permission
const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser', 'error');
    return;
  }

  const permission = await Notification.requestPermission();
  setNotificationsEnabled(permission === 'granted');

  if (permission === 'granted') {
    showToast('Notifications enabled', 'success');
  } else if (permission === 'denied') {
    showToast('Notifications blocked. Enable in browser settings.', 'error');
  }
};

// Show notification for new messages
const showMessageNotification = (message, wave) => {
  if (!notificationsEnabled) return;
  if (document.visibilityState === 'visible') return; // Don't notify if tab is active
  if (message.author_id === currentUser?.id) return; // Don't notify for own messages

  const notification = new Notification(`New message in ${wave.title}`, {
    body: message.content.replace(/<[^>]*>/g, '').substring(0, 100),
    icon: '/icons/icon-192x192.png',
    tag: `wave-${wave.id}`,
    requireInteraction: false
  });

  notification.onclick = () => {
    window.focus();
    setSelectedWave(wave.id);
    notification.close();
  };

  // Auto-close after 5 seconds
  setTimeout(() => notification.close(), 5000);
};
```

In WebSocket message handler, add notification trigger:

```javascript
case 'new_message':
  // ... existing message handling ...

  // Show notification if not viewing this wave
  if (selectedWave !== data.waveId) {
    const wave = waves.find(w => w.id === data.waveId);
    if (wave) {
      showMessageNotification(data.message, wave);
    }
  }
  break;
```

Add notification toggle in ProfileSettings:

```javascript
{/* Notifications Section */}
<div style={{ marginBottom: '24px' }}>
  <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '12px' }}>
    NOTIFICATIONS
  </div>

  {!('Notification' in window) ? (
    <div style={{ color: '#6a7a6a', fontSize: '0.85rem' }}>
      Notifications not supported in this browser
    </div>
  ) : Notification.permission === 'denied' ? (
    <div style={{ color: '#ff6b35', fontSize: '0.85rem' }}>
      Notifications blocked. Enable in browser settings.
    </div>
  ) : notificationsEnabled ? (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#0ead69'
    }}>
      <span>✓</span> Desktop notifications enabled
    </div>
  ) : (
    <button
      onClick={requestNotificationPermission}
      style={{
        padding: '10px 20px',
        background: '#0ead69',
        border: 'none',
        color: '#050805',
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontWeight: 'bold'
      }}
    >
      ENABLE NOTIFICATIONS
    </button>
  )}
</div>
```

---

## App Icons Required

Create these icons in `client/public/icons/`:

### Required Icons
| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browser tab |
| `favicon-32x32.png` | 32x32 | Browser tab |
| `icon-72x72.png` | 72x72 | Android |
| `icon-96x96.png` | 96x96 | Android |
| `icon-128x128.png` | 128x128 | Android |
| `icon-144x144.png` | 144x144 | Android |
| `icon-152x152.png` | 152x152 | iOS |
| `icon-180x180.png` | 180x180 | iOS |
| `icon-192x192.png` | 192x192 | Android/PWA |
| `icon-384x384.png` | 384x384 | Android |
| `icon-512x512.png` | 512x512 | Android/PWA |
| `icon-maskable-192x192.png` | 192x192 | Android adaptive |
| `icon-maskable-512x512.png` | 512x512 | Android adaptive |
| `badge-72x72.png` | 72x72 | Notification badge |

### Icon Design Guidelines
- **Standard icons**: Full Cortex logo on dark green (#050805) background
- **Maskable icons**: Logo centered with 20% safe zone padding
- **Badge icon**: Simple monochrome version for notifications

### Generating Icons
Use a tool like:
- [PWA Asset Generator](https://github.com/nickschwab/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- Or create manually in Figma/Photoshop

---

## Implementation Checklist

### Phase 1: Basic PWA
- [ ] Create `client/public/manifest.json`
- [ ] Create `client/public/sw.js` service worker
- [ ] Update `client/index.html` with PWA meta tags
- [ ] Add service worker registration to `CortexApp.jsx`
- [ ] Create all required app icons
- [ ] Add `InstallPrompt` component
- [ ] Add `OfflineIndicator` component
- [ ] Test on Android Chrome
- [ ] Test on iOS Safari
- [ ] Verify "Add to Home Screen" works

### Phase 2: Notifications
- [ ] Add notification permission request
- [ ] Add notification toggle in settings
- [ ] Trigger notifications for new messages
- [ ] Handle notification clicks
- [ ] Test on desktop browsers

### Testing
- [ ] Lighthouse PWA audit (aim for 100)
- [ ] Test offline behavior
- [ ] Test install flow on Android
- [ ] Test install flow on iOS
- [ ] Test notifications (desktop)
- [ ] Verify service worker updates correctly

---

## Lighthouse PWA Checklist

To pass Lighthouse PWA audit:

- [x] **Installable**
  - [x] Web app manifest meets requirements
  - [x] Service worker registered
  - [x] start_url responds when offline

- [x] **PWA Optimized**
  - [x] Redirects HTTP to HTTPS (production)
  - [x] Configured for custom splash screen
  - [x] Sets theme-color meta tag
  - [x] Content sized correctly for viewport
  - [x] Has valid apple-touch-icon
  - [x] Maskable icon provided

---

## iOS Limitations

Note these iOS Safari PWA limitations:

1. **No push notifications** - iOS doesn't support Web Push in PWAs (as of iOS 17, limited support added but requires specific setup)
2. **No background sync** - App doesn't run in background
3. **Storage limits** - ~50MB cache limit
4. **No badging** - Can't show unread count on icon
5. **Session handling** - May need to re-authenticate after long periods

Workarounds:
- Use in-app toast notifications
- Prompt users to open app regularly
- Handle auth token refresh gracefully

---

## Production Deployment Notes

### HTTPS Required
Service workers require HTTPS in production. Ensure your server has valid SSL certificate.

### Cache Versioning
Update `CACHE_NAME` in `sw.js` with each release to bust cache:
```javascript
const CACHE_NAME = 'cortex-v1.6.1'; // Increment with each release
```

### Vite PWA Plugin (Alternative)
For easier PWA management, consider using `vite-plugin-pwa`:

```bash
npm install -D vite-plugin-pwa
```

```javascript
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cortex',
        // ... manifest options
      }
    })
  ]
}
```

This handles service worker generation and manifest automatically.

---

## Success Criteria

PWA implementation is complete when:

- [ ] App installable on Android via Chrome
- [ ] App installable on iOS via Safari "Add to Home Screen"
- [ ] App works offline (shows cached shell + offline indicator)
- [ ] Lighthouse PWA score: 100
- [ ] Install prompt appears for first-time users
- [ ] Desktop notifications work (Chrome, Firefox, Edge)
- [ ] Service worker caches static assets
- [ ] App updates automatically on new deployments

---

*Plan Created: December 5, 2025*
*Target: Cortex v1.6.0*
