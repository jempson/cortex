import React, { useState, useEffect, useLayoutEffect, useRef, createContext, useContext, useCallback, useMemo } from 'react';
import { E2EEProvider, useE2EE } from './e2ee-context.jsx';
import { E2EESetupModal, PassphraseUnlockModal, E2EEStatusIndicator, EncryptedWaveBadge, LegacyWaveNotice, PartialEncryptionBanner } from './e2ee-components.jsx';

// ============ CONFIGURATION ============
// Version - keep in sync with package.json
const VERSION = '2.0.0';

// Auto-detect production vs development
const isProduction = window.location.hostname !== 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const hostname = isProduction ? window.location.hostname : 'localhost';
const port = isProduction ? '' : ':3001';

const BASE_URL = isProduction
  ? `${protocol}//${hostname}`
  : 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;
const WS_URL = isProduction
  ? `${wsProtocol}//${hostname}/ws`
  : 'ws://localhost:3001';

// ============ SERVICE WORKER REGISTRATION ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service worker registered:', registration.scope);

        // Check for updates periodically (every hour)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                console.log('[PWA] New version available');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
}

// ============ CONTEXTS ============
const AuthContext = createContext();
const useAuth = () => useContext(AuthContext);

// ============ PRIVACY LEVELS ============
const PRIVACY_LEVELS = {
  private: { name: 'Private', color: 'var(--accent-orange)', bgColor: 'var(--overlay-orange)', icon: '◉', desc: 'Only invited participants' },
  group: { name: 'Crew', color: 'var(--accent-amber)', bgColor: 'var(--overlay-amber)', icon: '◈', desc: 'All crew members' },
  crossServer: { name: 'Cross-Server', color: 'var(--accent-teal)', bgColor: 'var(--overlay-teal)', icon: '◇', desc: 'Federated servers' },
  public: { name: 'Public', color: 'var(--accent-green)', bgColor: 'var(--overlay-green)', icon: '○', desc: 'Visible to everyone' },
};

// ============ THEMES ============
const THEMES = {
  firefly: {
    name: 'Firefly',
    description: 'Classic green terminal aesthetic',
  },
  highContrast: {
    name: 'High Contrast',
    description: 'Maximum readability',
  },
  amoled: {
    name: 'AMOLED Black',
    description: 'True black for OLED screens',
  },
  light: {
    name: 'Light Mode',
    description: 'Light background for daytime',
  },
  ocean: {
    name: 'Ocean Blue',
    description: 'Blue-tinted dark theme',
  },
};

const FONT_SIZES = {
  small: { name: 'Small', multiplier: 0.9 },
  medium: { name: 'Medium', multiplier: 1 },
  large: { name: 'Large', multiplier: 1.15 },
  xlarge: { name: 'X-Large', multiplier: 1.3 },
};

// ============ ROLE-BASED ACCESS (v1.20.0) ============
const ROLE_HIERARCHY = { admin: 3, moderator: 2, user: 1 };

// Check if user has required role level (admin > moderator > user)
const canAccess = (user, requiredRole) => {
  if (!user) return false;
  const userRole = user.role || (user.isAdmin ? 'admin' : 'user');
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
};

// ============ THREADING DEPTH LIMIT ============
// Maximum nesting depth before prompting user to Focus or Ripple
const THREAD_DEPTH_LIMIT = 3;

// ============ PWA BADGE & TAB NOTIFICATIONS ============
// PWA Badge API - shows unread count on installed app icon
// Note: Only works when installed as PWA (not in browser tab)
const updateAppBadge = (count) => {
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true;
  const hasAPI = 'setAppBadge' in navigator;

  console.log(`[Badge] Update requested: count=${count}, installed=${isInstalled}, hasAPI=${hasAPI}`);

  if (hasAPI) {
    if (count > 0) {
      navigator.setAppBadge(count)
        .then(() => console.log(`[Badge] Successfully set to ${count}`))
        .catch(err => console.log('[Badge] Failed to set:', err.message));
    } else {
      navigator.clearAppBadge()
        .then(() => console.log('[Badge] Successfully cleared'))
        .catch(err => console.log('[Badge] Failed to clear:', err.message));
    }
  } else {
    console.log('[Badge] API not available - requires installed PWA in supported browser');
  }
};

// Tab notification state
let originalTitle = 'Farhold';
let originalFaviconHref = '/icons/favicon-32x32.png';
let notificationFaviconDataUrl = null;
let faviconFlashInterval = null;
let isFlashing = false;

// Generate notification favicon with red dot overlay
const generateNotificationFavicon = () => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');

      // Draw original favicon
      ctx.drawImage(img, 0, 0, 32, 32);

      // Draw notification dot (red circle in top-right)
      ctx.beginPath();
      ctx.arc(24, 8, 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff6b35'; // Orange accent color
      ctx.fill();
      ctx.strokeStyle = '#050805'; // Dark border
      ctx.lineWidth = 1;
      ctx.stroke();

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = originalFaviconHref;
  });
};

// Initialize notification favicon on load
generateNotificationFavicon().then(dataUrl => {
  notificationFaviconDataUrl = dataUrl;
});

// Update document title with unread count
const updateDocumentTitle = (count) => {
  if (count > 0) {
    document.title = `(${count}) ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
};

// Set favicon
const setFavicon = (href) => {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
};

// Start flashing favicon between normal and notification versions
const startFaviconFlash = () => {
  if (isFlashing || !notificationFaviconDataUrl) return;
  isFlashing = true;
  let showNotification = true;
  faviconFlashInterval = setInterval(() => {
    setFavicon(showNotification ? notificationFaviconDataUrl : originalFaviconHref);
    showNotification = !showNotification;
  }, 1000);
};

// Stop flashing favicon
const stopFaviconFlash = () => {
  if (faviconFlashInterval) {
    clearInterval(faviconFlashInterval);
    faviconFlashInterval = null;
  }
  isFlashing = false;
  setFavicon(originalFaviconHref);
};

// ============ STORAGE ============
// Browser session timeout (24 hours for non-PWA browser sessions)
const BROWSER_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

// Check if running as installed PWA (standalone mode)
const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true || // iOS Safari
         document.referrer.includes('android-app://'); // Android TWA
};

const storage = {
  getToken: () => localStorage.getItem('farhold_token'),
  setToken: (token) => localStorage.setItem('farhold_token', token),
  removeToken: () => localStorage.removeItem('farhold_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('farhold_user')); } catch { return null; } },
  setUser: (user) => {
    localStorage.setItem('farhold_user', JSON.stringify(user));
    // Also store theme separately for fast access on page load
    if (user?.preferences?.theme) {
      localStorage.setItem('farhold_theme', user.preferences.theme);
    }
  },
  removeUser: () => { localStorage.removeItem('farhold_user'); localStorage.removeItem('farhold_theme'); },
  getPushEnabled: () => localStorage.getItem('farhold_push_enabled') !== 'false', // Default true
  setPushEnabled: (enabled) => localStorage.setItem('farhold_push_enabled', enabled ? 'true' : 'false'),
  getTheme: () => localStorage.getItem('farhold_theme'),
  setTheme: (theme) => localStorage.setItem('farhold_theme', theme),
  // Session start time tracking for browser session timeout
  getSessionStart: () => {
    const start = localStorage.getItem('farhold_session_start');
    return start ? parseInt(start, 10) : null;
  },
  setSessionStart: () => localStorage.setItem('farhold_session_start', Date.now().toString()),
  removeSessionStart: () => localStorage.removeItem('farhold_session_start'),
  // Check if browser session has expired (24 hours for non-PWA)
  isSessionExpired: () => {
    // PWA sessions don't expire based on time (they use device session)
    if (isPWA()) return false;

    const sessionStart = storage.getSessionStart();
    if (!sessionStart) return false; // No session start = legacy session, let it continue

    const elapsed = Date.now() - sessionStart;
    return elapsed > BROWSER_SESSION_TIMEOUT_MS;
  },
};

// ============ PUSH NOTIFICATION HELPERS ============
// Subscribe to push notifications
async function subscribeToPush(token) {
  console.log('[Push] subscribeToPush called');

  if (!('serviceWorker' in navigator)) {
    console.log('[Push] Service Worker not supported');
    return { success: false, reason: 'Service Worker not supported in this browser' };
  }

  if (!('PushManager' in window)) {
    console.log('[Push] PushManager not supported');
    return { success: false, reason: 'Push notifications not supported in this browser' };
  }

  try {
    // First check/request notification permission
    console.log('[Push] Current permission:', Notification.permission);
    let permission = Notification.permission;
    if (permission === 'default') {
      console.log('[Push] Requesting notification permission...');
      permission = await Notification.requestPermission();
      console.log('[Push] Permission result:', permission);
    }

    if (permission !== 'granted') {
      console.log('[Push] Notification permission not granted:', permission);
      return { success: false, reason: permission === 'denied' ? 'Notification permission denied. Check browser settings.' : 'Notification permission required' };
    }

    // Get VAPID public key from server
    console.log('[Push] Fetching VAPID key...');
    const response = await fetch(`${API_URL}/push/vapid-key`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.log('[Push] VAPID key fetch failed:', response.status);
      return { success: false, reason: 'Server push configuration unavailable' };
    }

    const { publicKey } = await response.json();
    console.log('[Push] Got VAPID key');

    // Get service worker registration
    console.log('[Push] Waiting for service worker...');
    const registration = await navigator.serviceWorker.ready;
    console.log('[Push] Service worker ready');

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();
    console.log('[Push] Existing subscription:', subscription ? 'yes' : 'no');

    // Check if VAPID key has changed - if so, unsubscribe old and create new
    const storedVapidKey = localStorage.getItem('farhold_vapid_key');
    if (subscription && storedVapidKey && storedVapidKey !== publicKey) {
      console.log('[Push] VAPID key changed, unsubscribing old subscription...');
      try {
        await subscription.unsubscribe();
        subscription = null;
        console.log('[Push] Old subscription removed due to VAPID key change');
      } catch (unsubError) {
        console.warn('[Push] Failed to unsubscribe old subscription:', unsubError.message);
        subscription = null; // Proceed anyway
      }
    }

    // If no subscription (or was cleared due to VAPID change), create new subscription
    if (!subscription) {
      console.log('[Push] Creating new push subscription...');
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        console.log('[Push] New push subscription created');
      } catch (subError) {
        console.error('[Push] Failed to create subscription:', subError.name, subError.message);

        // If AbortError (push service error), try unregistering and re-registering service worker
        if (subError.name === 'AbortError') {
          console.log('[Push] AbortError detected - attempting service worker recovery...');
          try {
            await registration.unregister();
            console.log('[Push] Service worker unregistered, re-registering...');
            const newReg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            console.log('[Push] Service worker re-registered, retrying subscription...');

            subscription = await newReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
            console.log('[Push] Subscription succeeded after recovery');
          } catch (recoveryError) {
            console.error('[Push] Recovery failed:', recoveryError.message);
            return { success: false, reason: 'Push service error. Try clearing browser cache and refreshing.' };
          }
        } else {
          return { success: false, reason: `Browser subscription failed: ${subError.message}` };
        }
      }
    }

    // Send subscription to server
    console.log('[Push] Sending subscription to server...');
    const subscribeResponse = await fetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    if (!subscribeResponse.ok) {
      const errorText = await subscribeResponse.text();
      console.error('[Push] Server rejected subscription:', subscribeResponse.status, errorText);
      return { success: false, reason: `Server rejected subscription: ${errorText}` };
    }

    // Store VAPID key to detect future changes
    localStorage.setItem('farhold_vapid_key', publicKey);
    console.log('[Push] Push subscription registered with server');
    return { success: true };
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error.name, error.message, error);
    return { success: false, reason: `Unexpected error: ${error.message}` };
  }
}

// Unsubscribe from push notifications
async function unsubscribeFromPush(token) {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Unsubscribe locally
      await subscription.unsubscribe();

      // Tell server to remove subscription
      await fetch(`${API_URL}/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      // Clear stored VAPID key
      localStorage.removeItem('farhold_vapid_key');
      console.log('[Push] Push subscription removed');
    }
    return true;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return false;
  }
}

// Convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============ IMAGE LIGHTBOX COMPONENT ============
const ImageLightbox = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'zoom-out',
        padding: '20px',
      }}
    >
      <img
        src={src}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '95vw',
          maxHeight: '95vh',
          objectFit: 'contain',
          borderRadius: '4px',
          boxShadow: '0 0 30px rgba(0, 0, 0, 0.5)',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-secondary)',
          color: '#fff',
          fontSize: '1.5rem',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>
    </div>
  );
};

// ============ RICH EMBED COMPONENT ============
// Platform icons and colors
const EMBED_PLATFORMS = {
  youtube: { icon: '▶', color: '#ff0000', name: 'YouTube' },
  vimeo: { icon: '▶', color: '#1ab7ea', name: 'Vimeo' },
  spotify: { icon: '🎵', color: '#1db954', name: 'Spotify' },
  tiktok: { icon: '♪', color: '#ff0050', name: 'TikTok' },
  twitter: { icon: '𝕏', color: '#1da1f2', name: 'X/Twitter' },
  soundcloud: { icon: '☁', color: '#ff5500', name: 'SoundCloud' },
  tenor: { icon: '🎬', color: '#5856d6', name: 'Tenor' },
  giphy: { icon: '🎬', color: '#00ff99', name: 'GIPHY' },
};

// URL patterns for detecting embeddable content (mirrors server)
const EMBED_URL_PATTERNS = {
  youtube: [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  ],
  vimeo: [
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i,
  ],
  spotify: [
    /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i,
  ],
  tiktok: [
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
    /(?:https?:\/\/)?(?:vm\.)?tiktok\.com\/([a-zA-Z0-9]+)/i,
  ],
  twitter: [
    /(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/\w+\/status\/(\d+)/i,
  ],
  soundcloud: [
    /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[\w-]+\/[\w-]+/i,
  ],
  tenor: [
    /(?:https?:\/\/)?(?:www\.)?tenor\.com\/view\/[\w-]+-(\d+)/i,
    /(?:https?:\/\/)?tenor\.com\/([a-zA-Z0-9]+)\.gif/i,
  ],
  giphy: [
    /(?:https?:\/\/)?(?:www\.)?giphy\.com\/gifs\/(?:[\w-]+-)*([a-zA-Z0-9]+)/i,
    /(?:https?:\/\/)?gph\.is\/([a-zA-Z0-9]+)/i,
  ],
};

// Detect embed URLs in text (skip image URLs already embedded as <img> tags)
function detectEmbedUrls(text) {
  const embeds = [];
  const seenUrls = new Set(); // Prevent duplicate embeds

  // Collect URLs already embedded as <img> tags (we don't want to re-embed images)
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const alreadyEmbeddedImages = new Set();
  let imgMatch;
  while ((imgMatch = imgSrcRegex.exec(text)) !== null) {
    alreadyEmbeddedImages.add(imgMatch[1]);
  }

  // Find all URLs in the text (including those in <a> tags - we want to embed videos)
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  const urls = text.match(urlRegex) || [];

  for (const url of urls) {
    // Skip URLs already embedded as images
    if (alreadyEmbeddedImages.has(url)) continue;
    // Skip duplicate URLs
    if (seenUrls.has(url)) continue;

    for (const [platform, patterns] of Object.entries(EMBED_URL_PATTERNS)) {
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          const embed = { platform, url, contentId: match[1] };

          // Handle Spotify's type/id format
          if (platform === 'spotify' && match[2]) {
            embed.contentType = match[1];
            embed.contentId = match[2];
          }

          // Generate embed URLs
          if (platform === 'youtube') {
            embed.embedUrl = `https://www.youtube.com/embed/${embed.contentId}?rel=0`;
            embed.thumbnail = `https://img.youtube.com/vi/${embed.contentId}/hqdefault.jpg`;
          } else if (platform === 'vimeo') {
            embed.embedUrl = `https://player.vimeo.com/video/${embed.contentId}`;
          } else if (platform === 'spotify') {
            embed.embedUrl = `https://open.spotify.com/embed/${embed.contentType}/${embed.contentId}`;
          }

          embeds.push(embed);
          seenUrls.add(url);
          break;
        }
      }
    }
  }

  return embeds;
}

// Single embed component with click-to-load
const RichEmbed = ({ embed, autoLoad = false }) => {
  const [loaded, setLoaded] = useState(autoLoad);
  const [error, setError] = useState(false);
  const [oembedHtml, setOembedHtml] = useState(null);
  const [oembedLoading, setOembedLoading] = useState(false);
  const [tiktokData, setTiktokData] = useState(null);
  const [gifData, setGifData] = useState(null);
  const platform = EMBED_PLATFORMS[embed.platform] || { icon: '🔗', color: '#666', name: 'Link' };
  const embedContainerRef = useRef(null);

  // Platforms that require oEmbed HTML injection (no direct iframe embed URL)
  // Note: TikTok removed - their embed.js doesn't work well with React's virtual DOM
  const requiresOembed = ['twitter', 'soundcloud'].includes(embed.platform);

  // Fetch TikTok oEmbed data for thumbnail and title
  useEffect(() => {
    if (embed.platform === 'tiktok' && !tiktokData) {
      fetch(`${API_URL}/embeds/oembed?url=${encodeURIComponent(embed.url)}`)
        .then(res => res.json())
        .then(data => {
          // Server returns 'thumbnail' and 'author', normalize to what we expect
          if (data.thumbnail || data.author || data.title) {
            setTiktokData({
              thumbnail_url: data.thumbnail,
              author_name: data.author,
              title: data.title,
            });
          }
        })
        .catch(() => {}); // Silently fail - link card still works without thumbnail
    }
  }, [embed.platform, embed.url, tiktokData]);

  // Fetch Tenor/GIPHY oEmbed data to get the actual GIF URL
  useEffect(() => {
    if (['tenor', 'giphy'].includes(embed.platform) && !gifData) {
      fetch(`${API_URL}/embeds/oembed?url=${encodeURIComponent(embed.url)}`)
        .then(res => res.json())
        .then(data => {
          // Tenor returns 'url' field with direct GIF URL
          // GIPHY returns 'url' field with direct GIF URL
          if (data.url || data.thumbnail) {
            setGifData(data);
          }
        })
        .catch(() => {}); // Silently fail
    }
  }, [embed.platform, embed.url, gifData]);

  // Determine iframe dimensions based on platform
  const getDimensions = () => {
    switch (embed.platform) {
      case 'spotify':
        return { width: '100%', height: embed.contentType === 'track' ? '152px' : '352px' };
      case 'soundcloud':
        return { width: '100%', height: '166px' };
      case 'twitter':
        return { width: '100%', height: '400px' };
      case 'tiktok':
        return { width: '100%', height: '750px' };
      default: // YouTube, Vimeo
        return { width: '100%', height: '315px' };
    }
  };

  const dimensions = getDimensions();

  // Fetch oEmbed data when loaded for platforms that need it
  useEffect(() => {
    if (loaded && requiresOembed && !oembedHtml && !oembedLoading) {
      setOembedLoading(true);
      fetch(`${API_URL}/embeds/oembed?url=${encodeURIComponent(embed.url)}`)
        .then(res => res.json())
        .then(data => {
          if (data.html) {
            // Strip script tags from oEmbed HTML - we'll load scripts ourselves
            const cleanHtml = data.html.replace(/<script[^>]*>.*?<\/script>/gi, '');
            setOembedHtml(cleanHtml);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true))
        .finally(() => setOembedLoading(false));
    }
  }, [loaded, requiresOembed, oembedHtml, oembedLoading, embed.url]);

  // Load external embed scripts after oEmbed HTML is inserted (run once)
  const scriptLoadedRef = useRef(false);
  useEffect(() => {
    if (oembedHtml && embedContainerRef.current && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true;

      // Twitter/X embed script
      if (embed.platform === 'twitter') {
        if (window.twttr?.widgets) {
          // Script already loaded - re-process embeds
          setTimeout(() => window.twttr.widgets.load(embedContainerRef.current), 100);
        } else if (!document.querySelector('script[src*="platform.twitter.com"]')) {
          const script = document.createElement('script');
          script.src = 'https://platform.twitter.com/widgets.js';
          script.async = true;
          document.body.appendChild(script);
        }
      }
      // SoundCloud doesn't need external script - oEmbed returns iframe directly
    }
  }, [oembedHtml, embed.platform]);

  // Tenor/GIPHY - show the GIF directly as an image
  if (['tenor', 'giphy'].includes(embed.platform)) {
    const gifUrl = gifData?.url || gifData?.thumbnail;
    const imgStyle = 'max-width:200px;max-height:150px;border-radius:4px;cursor:pointer;object-fit:cover;display:block;border:1px solid var(--border-primary);';

    if (gifUrl) {
      // GIF loaded - show it
      return (
        <div style={{ marginTop: '8px' }}>
          <img
            src={gifUrl}
            alt={gifData?.title || 'GIF'}
            style={{
              maxWidth: '200px',
              maxHeight: '150px',
              borderRadius: '4px',
              cursor: 'pointer',
              objectFit: 'cover',
              display: 'block',
              border: '1px solid var(--border-primary)',
            }}
            className="zoomable-image"
            loading="lazy"
          />
        </div>
      );
    }

    // Loading state - show placeholder with platform branding
    return (
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--bg-elevated)',
        border: `1px solid ${platform.color}40`,
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '200px',
      }}>
        <span style={{ color: platform.color }}>{platform.icon}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Loading {platform.name}...</span>
      </div>
    );
  }

  // TikTok doesn't work with React - show a styled link card with thumbnail
  if (embed.platform === 'tiktok') {
    const hasThumbnail = tiktokData?.thumbnail_url;
    const authorName = tiktokData?.author_name || '';
    const title = tiktokData?.title || 'Click to open in TikTok';

    return (
      <a
        href={embed.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '0',
          background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-base))',
          border: '1px solid #ff0050',
          borderRadius: '8px',
          color: '#e5e5e5',
          textDecoration: 'none',
          marginTop: '8px',
          maxWidth: '400px',
          overflow: 'hidden',
        }}
      >
        {/* Thumbnail or fallback icon */}
        <div style={{
          width: hasThumbnail ? '100px' : '60px',
          minHeight: hasThumbnail ? '130px' : '60px',
          flexShrink: 0,
          background: hasThumbnail ? '#000' : '#ff0050',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {hasThumbnail ? (
            <>
              <img
                src={tiktokData.thumbnail_url}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              {/* Play button overlay */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 0, 80, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                color: 'white',
              }}>
                ▶
              </div>
            </>
          ) : (
            <span style={{ fontSize: '24px' }}>♪</span>
          )}
        </div>
        {/* Text content */}
        <div style={{
          padding: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
        }}>
          <div style={{ color: '#ff0050', fontSize: '0.7rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>♪</span> TikTok
          </div>
          {authorName && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              @{authorName}
            </div>
          )}
          <div style={{
            fontSize: '0.85rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.3',
          }}>
            {title}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          color: '#ff0050',
          fontSize: '1.2rem',
        }}>→</div>
      </a>
    );
  }

  if (error) {
    return (
      <a
        href={embed.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          padding: '12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          marginTop: '8px',
        }}
      >
        <span style={{ color: platform.color, marginRight: '8px' }}>{platform.icon}</span>
        {embed.url}
      </a>
    );
  }

  if (!loaded) {
    return (
      <div
        onClick={() => setLoaded(true)}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '560px',
          aspectRatio: embed.platform === 'spotify' ? 'auto' : '16/9',
          height: embed.platform === 'spotify' ? dimensions.height : 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          cursor: 'pointer',
          marginTop: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Thumbnail background for YouTube */}
        {embed.thumbnail && (
          <img
            src={embed.thumbnail}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.4,
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}

        {/* Play button overlay */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: platform.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            {platform.icon}
          </div>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            Click to load {platform.name}
          </span>
        </div>
      </div>
    );
  }

  // Loading state for oEmbed platforms
  if (requiresOembed && oembedLoading) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '560px',
        padding: '20px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '4px',
        marginTop: '8px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}>
        Loading {platform.name}...
      </div>
    );
  }

  // Render oEmbed HTML for platforms that need it
  if (requiresOembed && oembedHtml) {
    return (
      <div
        ref={embedContainerRef}
        style={{
          width: '100%',
          maxWidth: '560px',
          marginTop: '8px',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: oembedHtml }}
      />
    );
  }

  // Loaded state - render iframe (for YouTube, Vimeo, Spotify)
  return (
    <div style={{
      width: '100%',
      maxWidth: embed.platform === 'spotify' || embed.platform === 'soundcloud' ? '100%' : '560px',
      marginTop: '8px',
    }}>
      <iframe
        src={embed.embedUrl}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          display: 'block',
        }}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        onError={() => setError(true)}
      />
    </div>
  );
};

// Component to render droplet content with embeds (formerly MessageWithEmbeds)
const DropletWithEmbeds = ({ content, autoLoadEmbeds = false, participants = [], contacts = [], onMentionClick, fetchAPI }) => {
  const embeds = useMemo(() => detectEmbedUrls(content), [content]);

  // Get the plain text URLs that have embeds (to potentially hide them)
  const embedUrls = useMemo(() => new Set(embeds.map(e => e.url)), [embeds]);

  // Combine participants and contacts for user lookup
  const allUsers = useMemo(() => {
    const combined = [...participants, ...contacts];
    // Dedupe by id
    const seen = new Set();
    return combined.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }, [participants, contacts]);

  // Process @mentions to make them styled and clickable
  const processMentions = (html) => {
    // Match @handle patterns not already inside HTML tags
    return html.replace(/@([a-zA-Z0-9_]+)/g, (match, handle) => {
      // Find the user by handle in participants or contacts
      const user = allUsers.find(p =>
        (p.handle || '').toLowerCase() === handle.toLowerCase()
      );
      const userId = user?.id || '';
      const displayName = user?.displayName || user?.display_name || user?.name || handle;
      // Show display name but keep handle in tooltip and data attribute
      return `<span class="mention-link" data-handle="${handle}" data-user-id="${userId}" style="color: var(--accent-teal); cursor: pointer;" title="@${handle}">@${displayName}</span>`;
    });
  };

  // Strip embed URLs from displayed content if we're showing the embed
  const displayContent = useMemo(() => {
    let result = content;
    if (embeds.length > 0) {
      for (const url of embedUrls) {
        // Only hide the URL if it's on its own line or at the end
        result = result.replace(new RegExp(`\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), ' ');
      }
      result = result.trim();
    }
    // Process mentions
    result = processMentions(result);
    return result;
  }, [content, embedUrls, embeds.length, allUsers]);

  // Handle click events with delegation for mentions
  const handleClick = async (e) => {
    const mentionEl = e.target.closest('.mention-link');
    if (mentionEl && onMentionClick) {
      e.preventDefault();
      e.stopPropagation();
      let userId = mentionEl.dataset.userId;
      const handle = mentionEl.dataset.handle;

      // If we don't have the userId, try to look up the user by handle
      if (!userId && handle && fetchAPI) {
        try {
          const users = await fetchAPI(`/users/search?q=${encodeURIComponent(handle)}&limit=1`);
          if (users && users.length > 0 && users[0].handle.toLowerCase() === handle.toLowerCase()) {
            userId = users[0].id;
          }
        } catch (err) {
          console.error('Failed to look up user by handle:', err);
        }
      }

      if (userId) {
        onMentionClick(userId);
      }
    }
  };

  return (
    <>
      <div
        dangerouslySetInnerHTML={{ __html: displayContent }}
        onClick={handleClick}
      />
      {embeds.map((embed, index) => (
        <RichEmbed key={`${embed.platform}-${embed.contentId}-${index}`} embed={embed} autoLoad={autoLoadEmbeds} />
      ))}
    </>
  );
};

// ============ COLLAPSIBLE SECTION COMPONENT ============
// Supports controlled mode (isOpen + onToggle) or uncontrolled mode (defaultOpen)
const CollapsibleSection = ({ title, children, defaultOpen = true, isOpen: controlledIsOpen, onToggle, isMobile, titleColor = 'var(--text-dim)', accentColor, badge }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

  // Use controlled mode if onToggle is provided, otherwise use internal state
  const isOpen = onToggle ? controlledIsOpen : internalIsOpen;
  const handleToggle = onToggle || (() => setInternalIsOpen(!internalIsOpen));

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: accentColor ? `1px solid ${accentColor}40` : '1px solid var(--border-subtle)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ color: titleColor, fontSize: '0.8rem', fontWeight: 500 }}>{title}</div>
          {badge && (
            <span style={{
              padding: '2px 6px',
              background: 'var(--accent-amber)20',
              border: '1px solid var(--accent-amber)',
              color: 'var(--accent-amber)',
              fontSize: '0.65rem',
              borderRadius: '3px',
            }}>{badge}</span>
          )}
        </div>
        <button
          onClick={handleToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? (accentColor ? `${accentColor}20` : 'var(--accent-amber)20') : 'transparent',
            border: `1px solid ${isOpen ? (accentColor || 'var(--accent-amber)') : 'var(--border-primary)'}`,
            color: isOpen ? (accentColor || 'var(--accent-amber)') : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>
      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ============ EMOJI PICKER COMPONENT ============
const EmojiPicker = ({ onSelect, isMobile }) => {
  const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '💯', '❤️', '😎', '🚀', '✨', '💪', '👏', '🙌'];
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      padding: isMobile ? '10px' : '6px', display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
      gap: isMobile ? '6px' : '2px',
      zIndex: 10,
    }}>
      {emojis.map(emoji => (
        <button key={emoji} onClick={() => onSelect(emoji)} style={{
          width: isMobile ? '44px' : '32px',
          height: isMobile ? '44px' : '32px',
          padding: 0,
          background: 'transparent', border: '1px solid var(--border-subtle)',
          cursor: 'pointer', fontSize: isMobile ? '1.3rem' : '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>{emoji}</button>
      ))}
    </div>
  );
};

// ============ GIF SEARCH MODAL ============
const GifSearchModal = ({ isOpen, onClose, onSelect, fetchAPI, isMobile }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showTrending, setShowTrending] = useState(true);
  const [provider, setProvider] = useState('giphy'); // Track which provider returned results
  const searchTimeoutRef = useRef(null);

  // Load trending GIFs when modal opens
  useEffect(() => {
    if (isOpen && showTrending) {
      loadTrending();
    }
  }, [isOpen]);

  const loadTrending = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAPI('/gifs/trending?limit=20');
      setGifs(data.gifs || []);
      setProvider(data.provider || 'giphy');
    } catch (err) {
      setError(err.message || 'Failed to load trending GIFs');
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (query) => {
    if (!query.trim()) {
      setShowTrending(true);
      loadTrending();
      return;
    }
    setShowTrending(false);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAPI(`/gifs/search?q=${encodeURIComponent(query)}&limit=20`);
      setGifs(data.gifs || []);
      setProvider(data.provider || 'giphy');
    } catch (err) {
      setError(err.message || 'Failed to search GIFs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(query);
    }, 500);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: isMobile ? '10px' : '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : '600px',
        maxHeight: isMobile ? '90vh' : '80vh',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-teal)40',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: isMobile ? '14px 16px' : '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <GlowText color="var(--accent-teal)" size={isMobile ? '1rem' : '0.9rem'}>GIF SEARCH</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: isMobile ? '10px 14px' : '6px 12px',
            minHeight: isMobile ? '44px' : 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
          }}>✕ CLOSE</button>
        </div>

        {/* Search Input */}
        <div style={{ padding: isMobile ? '14px 16px' : '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search for GIFs..."
            autoFocus
            style={{
              width: '100%',
              padding: isMobile ? '14px 16px' : '10px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent-teal)50',
              color: 'var(--text-primary)',
              fontSize: isMobile ? '1rem' : '0.9rem',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            color: 'var(--text-muted)',
            fontSize: '0.65rem',
            marginTop: '6px',
            textAlign: 'center',
          }}>
            {showTrending ? '🔥 TRENDING' : `Searching for "${searchQuery}"`}
          </div>
        </div>

        {/* GIF Grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '12px' : '12px 16px',
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              Loading GIFs...
            </div>
          )}

          {error && (
            <div style={{
              textAlign: 'center',
              padding: '20px',
              color: 'var(--accent-orange)',
              background: 'var(--accent-orange)10',
              border: '1px solid var(--accent-orange)30',
              marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {!loading && !error && gifs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              {searchQuery ? 'No GIFs found' : 'Search for GIFs above'}
            </div>
          )}

          {!loading && gifs.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: '8px',
            }}>
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.url)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    padding: 0,
                    cursor: 'pointer',
                    aspectRatio: '1',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={gif.title}
                >
                  <img
                    src={gif.preview}
                    alt={gif.title}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Provider Attribution */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.6rem',
        }}>
          Powered by {provider === 'tenor' ? 'Tenor' : provider === 'both' ? 'GIPHY & Tenor' : 'GIPHY'}
        </div>
      </div>
    </div>
  );
};

// ============ PWA INSTALL PROMPT ============
const InstallPrompt = ({ isMobile }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently (within 7 days)
    const dismissedAt = localStorage.getItem('farhold_install_dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return; // Don't show prompt
      }
    }

    // Listen for install prompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show prompt after second visit or 30 seconds
      const visitCount = parseInt(localStorage.getItem('farhold_visits') || '0') + 1;
      localStorage.setItem('farhold_visits', visitCount.toString());

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
      console.log('[PWA] App installed successfully');
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
      console.log('[PWA] User accepted install prompt');
    } else {
      console.log('[PWA] User dismissed install prompt');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('farhold_install_dismissed', Date.now().toString());
  };

  if (isInstalled || !showPrompt || !deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: isMobile ? '70px' : '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '2px solid var(--accent-green)',
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
        <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'monospace' }}>
          Install Farhold
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: 0,
            lineHeight: 1
          }}
        >
          x
        </button>
      </div>

      <p style={{
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        marginBottom: '16px',
        lineHeight: 1.4,
        fontFamily: 'monospace'
      }}>
        Install Farhold on your device for quick access and offline support.
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleInstall}
          style={{
            flex: 1,
            padding: '12px 20px',
            background: 'var(--accent-green)',
            border: 'none',
            color: 'var(--bg-base)',
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
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
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

// ============ OFFLINE INDICATOR ============
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
      background: 'var(--accent-orange)',
      color: 'var(--bg-base)',
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

// ============ BOTTOM NAVIGATION ============
const BottomNav = ({ activeView, onNavigate, unreadCount, pendingContacts, pendingGroups }) => {
  const items = [
    { id: 'waves', icon: '◈', label: 'Waves', badge: unreadCount },
    { id: 'contacts', icon: '●', label: 'Contacts', badge: pendingContacts },
    { id: 'groups', icon: '◆', label: 'Crews', badge: pendingGroups },
    { id: 'profile', icon: '⚙', label: 'Profile' },
  ];

  const handleNavigate = (view) => {
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    onNavigate(view);
  };

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '60px',
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      {items.map(item => {
        const isActive = activeView === item.id;
        const badgeColor = item.badgeColor ? item.badgeColor :
                          item.id === 'contacts' && item.badge > 0 ? 'var(--accent-teal)' :
                          item.id === 'groups' && item.badge > 0 ? 'var(--accent-amber)' : 'var(--accent-orange)';

        return (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--accent-amber)' : 'var(--text-dim)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'color 0.2s ease',
            }}
          >
            <span style={{
              fontSize: '1.2rem',
              textShadow: isActive ? '0 0 10px var(--accent-amber)80' : 'none',
            }}>
              {item.icon}
            </span>
            <span style={{
              fontSize: '0.6rem',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              textShadow: isActive ? '0 0 8px var(--accent-amber)40' : 'none',
            }}>
              {item.label}
            </span>
            {item.badge > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '10%',
                background: badgeColor,
                color: item.id === 'groups' ? '#000' : '#fff',
                fontSize: '0.55rem',
                fontWeight: 700,
                padding: '2px 4px',
                borderRadius: '10px',
                minWidth: '16px',
                textAlign: 'center',
                boxShadow: `0 0 8px ${badgeColor}80`,
              }}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

// ============ RESPONSIVE HOOK ============
function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Multiple breakpoints for better responsive design
  const isMobile = size.width < 600;      // Phone screens
  const isTablet = size.width >= 600 && size.width < 1024;  // Tablet screens
  const isDesktop = size.width >= 1024;   // Desktop screens

  return { ...size, isMobile, isTablet, isDesktop };
}

// ============ SWIPE GESTURE HOOK ============
function useSwipeGesture(ref, { onSwipeLeft, onSwipeRight, threshold = 100 }) {
  const touchStart = useRef({ x: 0, y: 0 });
  const touchEnd = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e) => {
      touchEnd.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const deltaX = touchEnd.current.x - touchStart.current.x;
      const deltaY = Math.abs(touchEnd.current.y - touchStart.current.y);

      // Only trigger if horizontal swipe and not too much vertical movement
      if (Math.abs(deltaX) > threshold && deltaY < 100) {
        if (deltaX > 0 && onSwipeRight) onSwipeRight();
        if (deltaX < 0 && onSwipeLeft) onSwipeLeft();
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold]);
}

// ============ PULL TO REFRESH HOOK ============
function usePullToRefresh(ref, onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const threshold = 60;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      // Only activate if scrolled to top
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        setPulling(true);
      }
    };

    const handleTouchMove = (e) => {
      if (!pulling && el.scrollTop !== 0) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      // Only pull down, and apply resistance
      if (distance > 0 && el.scrollTop === 0) {
        setPullDistance(Math.min(distance * 0.5, threshold + 20)); // Resistance effect
        if (distance > 10) {
          e.preventDefault(); // Prevent scroll bounce
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > threshold && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      setPulling(false);
      setPullDistance(0);
      startY.current = 0;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, pulling, pullDistance, refreshing, onRefresh]);

  return { pulling, pullDistance, refreshing };
}

// ============ API HOOK ============
function useAPI() {
  const { token, logout } = useAuth();
  
  const fetchAPI = useCallback(async (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) logout?.();
      throw new Error(data.error || `API error: ${res.status}`);
    }
    return data;
  }, [token, logout]);
  
  return { fetchAPI };
}

// ============ WEBSOCKET HOOK ============
function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Keep onMessage ref updated without triggering reconnection
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!token) return;

    let intentionallyClosed = false;

    const connect = () => {
      console.log('🔌 Connecting to WebSocket...');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        ws.send(JSON.stringify({ type: 'auth', token }));

        // Start heartbeat ping every 30 seconds to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'auth_success') {
            setConnected(true);
            console.log('✅ WebSocket authenticated');
          } else if (data.type === 'auth_error') {
            setConnected(false);
            console.error('❌ WebSocket auth failed');
          } else if (data.type === 'pong') {
            // Heartbeat response, ignore
          } else {
            onMessageRef.current?.(data);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        // Auto-reconnect after 3 seconds unless intentionally closed
        if (!intentionallyClosed) {
          console.log('🔄 Reconnecting in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnected(false);
      };
    };

    connect();

    return () => {
      intentionallyClosed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { connected, sendMessage };
}

// ============ UI COMPONENTS ============
const ScanLines = ({ enabled = true }) => {
  if (!enabled) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000,
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
  );
};

const GlowText = ({ children, color = 'var(--accent-amber)', size = '1rem', weight = 400 }) => (
  <span style={{ color, fontSize: size, fontWeight: weight, textShadow: `0 0 10px ${color}80, 0 0 20px ${color}40` }}>
    {children}
  </span>
);

const Avatar = ({ letter, color = 'var(--accent-amber)', size = 40, status, imageUrl }) => {
  const [imgError, setImgError] = useState(false);

  // Reset error state when imageUrl changes
  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  const showImage = imageUrl && !imgError;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size,
        background: showImage ? 'transparent' : `linear-gradient(135deg, ${color}40, ${color}10)`,
        border: `1px solid ${color}60`, borderRadius: '2px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', color, fontSize: size * 0.4,
        overflow: 'hidden',
      }}>
        {showImage ? (
          <img
            src={`${BASE_URL}${imageUrl}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          letter
        )}
      </div>
      {status && (
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: '8px', height: '8px', borderRadius: '50%',
          background: status === 'online' ? 'var(--accent-green)' : status === 'away' ? 'var(--accent-amber)' : 'var(--text-muted)',
          boxShadow: status === 'online' ? '0 0 6px var(--accent-green)' : 'none',
        }} />
      )}
    </div>
  );
};

const PrivacyBadge = ({ level, compact = false }) => {
  const config = PRIVACY_LEVELS[level] || PRIVACY_LEVELS.private;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: compact ? '2px 8px' : '4px 12px',
      background: config.bgColor,
      border: `1px solid ${config.color}50`,
      borderRadius: '2px',
      fontSize: compact ? '0.7rem' : '0.75rem',
      flexShrink: 0,
    }}>
      <span style={{ color: config.color }}>{config.icon}</span>
      {!compact && <span style={{ color: config.color }}>{config.name}</span>}
    </div>
  );
};

const Toast = ({ message, type = 'info', onClose }) => {
  const colors = { success: 'var(--accent-green)', error: 'var(--accent-orange)', info: 'var(--accent-amber)' };
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      padding: '12px 24px', background: 'var(--bg-surface)',
      border: `1px solid ${colors[type]}`, color: colors[type],
      fontFamily: 'monospace', fontSize: '0.85rem', zIndex: 200,
      maxWidth: '90vw', textAlign: 'center',
    }}>
      {message}
    </div>
  );
};

// ============ CRAWL BAR COMPONENT ============
const CRAWL_SCROLL_SPEEDS = {
  slow: 60,     // seconds for full scroll - leisurely pace
  normal: 45,   // comfortable reading speed
  fast: 30,     // quicker but still readable
};

const CrawlBar = ({ fetchAPI, enabled = true, userPrefs = {}, isMobile = false, onAlertClick }) => {
  const [data, setData] = useState({ stocks: { data: [] }, weather: { data: null }, news: { data: [] }, alerts: { data: [] } });
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef(null);
  const animationRef = useRef(null);
  const [contentWidth, setContentWidth] = useState(0);

  const scrollSpeed = CRAWL_SCROLL_SPEEDS[userPrefs.scrollSpeed || 'normal'];

  // Fetch crawl data without resetting animation (using Web Animations API)
  const loadData = useCallback(async () => {
    try {
      // Save current animation time before update
      let savedTime = 0;
      if (animationRef.current) {
        savedTime = animationRef.current.currentTime || 0;
      }

      const result = await fetchAPI('/crawl/all');
      setData(result);

      // Restore animation position after React re-render
      requestAnimationFrame(() => {
        if (scrollRef.current && savedTime > 0) {
          // Re-measure content width in case it changed
          const newContentWidth = scrollRef.current.scrollWidth / 2;

          // Cancel existing animation if any
          if (animationRef.current) {
            animationRef.current.cancel();
          }
          // Create new animation and restore position
          const anim = scrollRef.current.animate(
            [
              { transform: 'translateX(0px)' },
              { transform: `translateX(-${newContentWidth}px)` }
            ],
            {
              duration: scrollSpeed * 1000,
              iterations: Infinity,
              easing: 'linear'
            }
          );
          anim.currentTime = savedTime;
          animationRef.current = anim;
          setContentWidth(newContentWidth);
        }
      });
    } catch (err) {
      console.error('Crawl bar error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchAPI, scrollSpeed]);

  // Initial load and polling
  useEffect(() => {
    if (!enabled) return;

    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [enabled, loadData]);

  // Measure content width for pixel-perfect seamless looping
  useEffect(() => {
    if (!scrollRef.current || loading) return;

    // Measure the width of one set of items (half the total since content is duplicated)
    const measureWidth = () => {
      if (scrollRef.current) {
        const totalWidth = scrollRef.current.scrollWidth;
        setContentWidth(totalWidth / 2); // Half because content is duplicated
      }
    };

    measureWidth();
    // Re-measure on window resize
    window.addEventListener('resize', measureWidth);
    return () => window.removeEventListener('resize', measureWidth);
  }, [loading, data]);

  // Initialize WAAPI animation when content width is known
  useEffect(() => {
    if (!scrollRef.current || loading || contentWidth === 0) return;

    // Create animation using pixel-based translation for seamless loop
    if (!animationRef.current) {
      const anim = scrollRef.current.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: `translateX(-${contentWidth}px)` }
        ],
        {
          duration: scrollSpeed * 1000,
          iterations: Infinity,
          easing: 'linear'
        }
      );
      animationRef.current = anim;
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.cancel();
        animationRef.current = null;
      }
    };
  }, [loading, scrollSpeed, contentWidth]);

  // Handle pause/resume
  useEffect(() => {
    if (animationRef.current) {
      if (isPaused) {
        animationRef.current.pause();
      } else {
        animationRef.current.play();
      }
    }
  }, [isPaused]);

  if (!enabled) {
    return null;
  }

  // Build crawl items
  const items = [];

  // System Alerts (from admins) - displayed first, highest priority
  const alertPriorityConfig = {
    critical: { icon: '🚨', color: 'var(--accent-orange)' },
    warning: { icon: '⚠️', color: 'var(--accent-amber)' },
    info: { icon: 'ℹ️', color: 'var(--accent-teal)' }
  };

  if (data.alerts?.enabled && data.alerts?.data?.length > 0) {
    // Sort by priority (critical first, then warning, then info)
    const priorityOrder = { critical: 0, warning: 1, info: 2 };
    const sortedAlerts = [...data.alerts.data].sort((a, b) =>
      (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
    );

    sortedAlerts.forEach(alert => {
      const cfg = alertPriorityConfig[alert.priority] || alertPriorityConfig.info;
      items.push({
        type: 'system-alert',
        key: `system-alert-${alert.id}`,
        content: (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onAlertClick?.(alert);
            }}
            style={{
              cursor: 'pointer',
              color: cfg.color,
            }}
          >
            {cfg.icon} [{alert.priority.toUpperCase()}] {alert.title}
            {alert.originNode && (
              <span style={{ fontSize: '0.7em', opacity: 0.7, marginLeft: '4px' }}>
                (@{alert.originNode})
              </span>
            )}
          </span>
        ),
      });
    });
  }

  // Stocks - clickable links to Yahoo Finance
  if (userPrefs.showStocks !== false && data.stocks?.enabled && data.stocks?.data?.length > 0) {
    data.stocks.data.forEach(stock => {
      if (!stock) return;
      const isUp = (stock.change || 0) >= 0;
      items.push({
        type: 'stock',
        key: `stock-${stock.symbol}`,
        content: (
          <a
            href={`https://finance.yahoo.com/quote/${stock.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{stock.symbol}</span>
            {' '}
            <span style={{ color: 'var(--text-primary)' }}>${stock.price?.toFixed(2)}</span>
            {' '}
            <span style={{ color: isUp ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
              {isUp ? '▲' : '▼'} {Math.abs(stock.changePercent || 0).toFixed(2)}%
            </span>
          </a>
        ),
      });
    });
  }

  // Weather - clickable link to OpenWeatherMap
  if (userPrefs.showWeather !== false && data.weather?.enabled && data.weather?.data) {
    const weather = data.weather.data;
    const location = data.weather.location;
    const hasAlerts = weather.alerts?.length > 0;
    const weatherUrl = location?.lat && location?.lon
      ? `https://openweathermap.org/weathermap?basemap=map&cities=true&layer=temperature&lat=${location.lat}&lon=${location.lon}&zoom=10`
      : 'https://openweathermap.org/';

    items.push({
      type: 'weather',
      key: 'weather-current',
      content: (
        <a
          href={weatherUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ color: 'var(--accent-teal)' }}>🌡</span>
          {' '}
          <span style={{ color: 'var(--text-primary)' }}>{location?.name || 'Weather'}</span>
          {': '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {weather.temp}°F, {weather.description}
          </span>
        </a>
      ),
    });

    // Weather alerts - clickable link to location-specific NWS forecast page
    if (hasAlerts) {
      const alertUrl = location?.lat && location?.lon
        ? `https://forecast.weather.gov/MapClick.php?lat=${location.lat}&lon=${location.lon}`
        : 'https://www.weather.gov/alerts';

      weather.alerts.slice(0, 2).forEach((alert, i) => {
        items.push({
          type: 'alert',
          key: `alert-${i}`,
          content: (
            <a
              href={alertUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: 'var(--accent-orange)' }}
              onClick={(e) => e.stopPropagation()}
            >
              ⚠️ ALERT: {alert.event}
            </a>
          ),
        });
      });
    }
  }

  // News
  if (userPrefs.showNews !== false && data.news?.enabled && data.news?.data?.length > 0) {
    data.news.data.slice(0, 5).forEach((headline, i) => {
      if (!headline?.title) return;
      items.push({
        type: 'news',
        key: `news-${i}`,
        content: (
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: 'var(--accent-purple)' }}>◆</span>
            {' '}
            {headline.title?.substring(0, 80)}{headline.title?.length > 80 ? '...' : ''}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7em', marginLeft: '6px' }}>
              [{headline.source}]
            </span>
          </a>
        ),
      });
    });
  }

  // If no items to display, hide the bar
  if (items.length === 0 && !loading) {
    return null;
  }

  // Duplicate items for seamless loop
  const allItems = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      style={{
        position: 'relative',
        height: isMobile ? '28px' : '32px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        fontFamily: "'Courier New', monospace",
        fontSize: isMobile ? '0.7rem' : '0.75rem',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Animation controlled via Web Animations API for seamless data refresh */}

      {loading && items.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
        }}>
          Loading crawl data...
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            whiteSpace: 'nowrap',
            // Animation controlled via Web Animations API (see useEffect above)
          }}
        >
          {allItems.map((item, index) => (
            <span
              key={`${item.key}-${index}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 24px',
              }}
            >
              {item.content}
            </span>
          ))}
        </div>
      )}

      {/* Gradient fade edges */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '40px',
        height: '100%',
        background: 'linear-gradient(90deg, var(--bg-surface), transparent)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '40px',
        height: '100%',
        background: 'linear-gradient(-90deg, var(--bg-surface), transparent)',
        pointerEvents: 'none',
      }} />
    </div>
  );
};

const LoadingSpinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
    <div style={{
      width: '40px', height: '40px', border: '3px solid var(--border-subtle)',
      borderTop: '3px solid var(--accent-amber)', borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Notification type styling
const NOTIFICATION_TYPES = {
  direct_mention: { icon: '@', color: 'var(--accent-amber)', label: 'Mentioned you' },
  reply: { icon: '↩', color: 'var(--accent-teal)', label: 'Replied to you' },
  wave_activity: { icon: '◎', color: 'var(--accent-green)', label: 'Wave activity' },
  ripple: { icon: '◈', color: 'var(--accent-purple)', label: 'Burst' },
  system: { icon: '⚡', color: 'var(--accent-orange)', label: 'System' },
};

const NotificationItem = ({ notification, onRead, onDismiss, onClick }) => {
  const typeConfig = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.system;
  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      onClick={() => onClick(notification)}
      style={{
        padding: '12px',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        background: notification.read ? 'transparent' : 'var(--accent-amber)08',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        position: 'relative',
      }}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div style={{
          position: 'absolute',
          left: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: typeConfig.color,
        }} />
      )}

      {/* Type icon */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: `${typeConfig.color}20`,
        border: `1px solid ${typeConfig.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: typeConfig.color,
        fontSize: '0.9rem',
        fontWeight: 'bold',
        flexShrink: 0,
      }}>
        {typeConfig.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 500 }}>
            {notification.actorDisplayName || notification.title}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{timeAgo(notification.createdAt)}</span>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>
          {notification.body || typeConfig.label}
        </div>
        {notification.preview && (
          <div style={{
            color: 'var(--text-dim)',
            fontSize: '0.7rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            "{notification.preview.substring(0, 60)}{notification.preview.length > 60 ? '...' : ''}"
          </div>
        )}
        {notification.waveTitle && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '4px' }}>
            in {notification.waveTitle}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '0.8rem',
          padding: '4px',
          opacity: 0.6,
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

const NotificationDropdown = ({ notifications, unreadCount, onRead, onDismiss, onClick, onReadAll, onClose, isMobile }) => {
  return (
    <div style={{
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? '0' : '100%',
      right: isMobile ? '0' : '-10px',
      left: isMobile ? '0' : 'auto',
      bottom: isMobile ? '0' : 'auto',
      width: isMobile ? '100%' : '360px',
      maxHeight: isMobile ? '100%' : '480px',
      background: 'var(--bg-surface)',
      border: isMobile ? 'none' : '1px solid var(--border-primary)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        paddingTop: isMobile ? 'calc(12px + env(safe-area-inset-top, 0px))' : '12px',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-hover)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--accent-amber)', fontSize: '0.9rem', fontWeight: 600 }}>Notifications</span>
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--accent-orange)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '10px',
            }}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <button
              onClick={onReadAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-teal)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
              }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}>
            No notifications
          </div>
        ) : (
          notifications.map(n => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={onRead}
              onDismiss={onDismiss}
              onClick={onClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

const NotificationBell = ({ fetchAPI, onNavigateToWave, isMobile, refreshTrigger }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const bellRef = useRef(null);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      const [notifData, countData] = await Promise.all([
        fetchAPI('/notifications?limit=20'),
        fetchAPI('/notifications/count'),
      ]);
      setNotifications(notifData.notifications || []);
      setUnreadCount(countData.total || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [fetchAPI]);

  // Load on mount and periodically
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Refresh when trigger changes (WebSocket notification received)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadNotifications();
    }
  }, [refreshTrigger, loadNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown && !isMobile) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown, isMobile]);

  const handleMarkRead = async (notificationId) => {
    try {
      await fetchAPI(`/notifications/${notificationId}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetchAPI('/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleDismiss = async (notificationId) => {
    try {
      await fetchAPI(`/notifications/${notificationId}`, { method: 'DELETE' });
      const notification = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.read) {
      handleMarkRead(notification.id);
    }

    // Navigate to the relevant content
    if (notification.waveId) {
      onNavigateToWave(notification.waveId, notification.dropletId);
    }

    setShowDropdown(false);
  };

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          padding: '8px 12px',
          background: showDropdown ? 'var(--accent-amber)15' : 'transparent',
          border: `1px solid ${showDropdown ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
          color: showDropdown ? 'var(--accent-amber)' : 'var(--text-dim)',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          position: 'relative',
        }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            background: 'var(--accent-orange)',
            color: '#fff',
            fontSize: '0.55rem',
            fontWeight: 700,
            padding: '2px 5px',
            borderRadius: '10px',
            minWidth: '16px',
            textAlign: 'center',
            boxShadow: '0 0 8px rgba(255, 107, 53, 0.8)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <NotificationDropdown
          notifications={notifications}
          unreadCount={unreadCount}
          onRead={handleMarkRead}
          onDismiss={handleDismiss}
          onClick={handleNotificationClick}
          onReadAll={handleMarkAllRead}
          onClose={() => setShowDropdown(false)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

const PullIndicator = ({ pulling, pullDistance, refreshing, threshold = 60 }) => {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: `${Math.max(pullDistance, 0)}px`,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: '10px',
      background: 'linear-gradient(to bottom, var(--bg-surface), transparent)',
      transition: refreshing ? 'height 0.3s ease' : 'none',
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {(pulling || refreshing) && (
        <div style={{
          width: '24px',
          height: '24px',
          border: '2px solid var(--border-subtle)',
          borderTop: '2px solid var(--accent-green)',
          borderRadius: '50%',
          transform: refreshing ? 'none' : `rotate(${rotation}deg)`,
          animation: refreshing ? 'spin 1s linear infinite' : 'none',
          opacity: Math.max(progress, 0.3),
        }} />
      )}
    </div>
  );
};

// ============ ERROR BOUNDARY ============
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'var(--accent-orange)', background: 'var(--bg-base)', border: '1px solid var(--accent-orange)', margin: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>⚠️ Something went wrong</h3>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'var(--accent-amber)' }}>
            {this.state.error?.toString()}
          </pre>
          <details style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <summary>Stack trace</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.errorInfo?.componentStack}</pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{ marginTop: '10px', padding: '8px 16px', background: 'var(--accent-green)', border: 'none', color: 'var(--bg-base)', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============ ABOUT SERVER PAGE ============
const AboutServerPage = ({ onBack }) => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isMobile } = useWindowSize();

  useEffect(() => {
    fetch(`${API_URL}/server/info`)
      .then(res => res.json())
      .then(data => {
        setInfo(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
    padding: isMobile ? '20px' : '40px',
  };

  const cardStyle = {
    maxWidth: '600px',
    margin: '0 auto',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-primary)',
  };

  const sectionStyle = {
    padding: isMobile ? '16px' : '20px',
    borderBottom: '1px solid var(--border-subtle)',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading server info...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--status-error)' }}>
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{
          ...sectionStyle,
          background: 'var(--bg-elevated)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: isMobile ? '1.5rem' : '1.8rem',
            color: 'var(--accent-teal)',
            fontFamily: 'monospace',
            marginBottom: '8px',
          }}>
            {info.federationEnabled && <span style={{ marginRight: '10px' }}>◇</span>}
            {info.name || 'Farhold Server'}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Farhold v{info.version}
            {info.federationEnabled && (
              <span style={{
                marginLeft: '12px',
                padding: '2px 8px',
                background: 'var(--accent-purple)20',
                color: 'var(--accent-purple)',
                fontSize: '0.75rem',
              }}>
                FEDERATION ENABLED
              </span>
            )}
          </div>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
            >
              ← Back to Login
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={sectionStyle}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '12px' }}>
            Statistics
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
            <span>Users: <strong style={{ color: 'var(--text-primary)' }}>{info.stats?.users || 0}</strong></span>
            <span>Waves: <strong style={{ color: 'var(--text-primary)' }}>{info.stats?.waves || 0}</strong></span>
            <span>Uptime: <strong style={{ color: 'var(--accent-green)' }}>{formatUptime(info.stats?.uptime || 0)}</strong></span>
          </div>
        </div>

        {/* Federation Partners */}
        {info.federationEnabled && info.federation?.configured && (
          <div style={sectionStyle}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '12px' }}>
              Federated Servers ({info.federation.partnerCount})
            </div>
            {info.federation.partners.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {info.federation.partners.map((partner, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--accent-purple)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}>
                    ◇ {partner}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No federation partners yet
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          Powered by <a href="https://github.com/jempson/cortex" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-teal)' }}>Farhold</a>
        </div>
      </div>
    </div>
  );
};

// ============ LOGIN SCREEN ============
const LoginScreen = ({ onAbout }) => {
  const { login, completeMfaLogin, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState({ loading: false, message: '', error: '' });
  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaMethods, setMfaMethods] = useState([]);
  const [mfaMethod, setMfaMethod] = useState('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const { isMobile, isTablet, isDesktop } = useWindowSize();

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setForgotStatus({ loading: false, message: '', error: 'Please enter a valid email address' });
      return;
    }
    setForgotStatus({ loading: true, message: '', error: '' });
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setForgotStatus({ loading: false, message: data.message || 'Check your email for reset instructions.', error: '' });
      } else {
        setForgotStatus({ loading: false, message: '', error: data.error || 'Failed to send reset email' });
      }
    } catch (err) {
      setForgotStatus({ loading: false, message: '', error: 'Network error. Please try again.' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate password confirmation during registration
    if (isRegistering && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        await register(handle, email, password, displayName);
      } else {
        const result = await login(handle, password);
        if (result?.mfaRequired) {
          setMfaRequired(true);
          setMfaChallenge(result.mfaChallenge);
          setMfaMethods(result.mfaMethods || []);
          setMfaMethod(result.mfaMethods?.[0] || 'totp');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMfaLoading(true);
    try {
      await completeMfaLogin(mfaChallenge, mfaMethod, mfaCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaCancel = () => {
    setMfaRequired(false);
    setMfaChallenge(null);
    setMfaMethods([]);
    setMfaCode('');
    setError('');
    setEmailCodeSent(false);
    setEmailCodeSending(false);
  };

  const handleSendEmailCode = async () => {
    setEmailCodeSending(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/mfa/send-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: mfaChallenge }),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaChallenge(data.challengeId); // Update to new challenge ID
        setEmailCodeSent(true);
      } else {
        setError(data.error || 'Failed to send email code');
      }
    } catch (err) {
      console.error('Send email code error:', err);
      setError('Network error. Please try again.');
    } finally {
      setEmailCodeSending(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace", padding: isMobile ? '20px' : '0',
    }}>
      <ScanLines />
      <div style={{
        width: '100%', maxWidth: '400px', padding: isMobile ? '24px' : '40px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <GlowText color="var(--accent-amber)" size={isMobile ? '2rem' : '2.5rem'} weight={700}>FARHOLD</GlowText>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>SECURE COMMUNICATIONS</div>
        </div>

        {mfaRequired ? (
          <div>
            <div style={{ color: 'var(--accent-teal)', fontSize: '0.9rem', marginBottom: '24px', textAlign: 'center' }}>
              🔐 Two-Factor Authentication Required
            </div>

            {mfaMethods.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                  VERIFICATION METHOD
                </label>
                <select
                  value={mfaMethod}
                  onChange={(e) => { setMfaMethod(e.target.value); setMfaCode(''); setError(''); setEmailCodeSent(false); }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {mfaMethods.includes('totp') && <option value="totp">Authenticator App</option>}
                  {mfaMethods.includes('email') && <option value="email">Email Code</option>}
                  {mfaMethods.includes('recovery') && <option value="recovery">Recovery Code</option>}
                </select>
              </div>
            )}

            <form onSubmit={handleMfaSubmit}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                  {mfaMethod === 'totp' ? 'AUTHENTICATOR CODE' : mfaMethod === 'email' ? 'EMAIL CODE' : 'RECOVERY CODE'}
                </label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ''))}
                  placeholder={mfaMethod === 'totp' ? '6-digit code' : mfaMethod === 'email' ? '6-digit code' : '8-character code'}
                  style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.2em', textAlign: 'center' }}
                  autoFocus
                  autoComplete="one-time-code"
                />
                {mfaMethod === 'totp' && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '8px' }}>
                    Enter the code from your authenticator app
                  </div>
                )}
                {mfaMethod === 'email' && (
                  <div style={{ marginTop: '8px' }}>
                    {!emailCodeSent ? (
                      <button
                        type="button"
                        onClick={handleSendEmailCode}
                        disabled={emailCodeSending}
                        style={{
                          width: '100%', padding: '10px',
                          background: emailCodeSending ? 'var(--border-subtle)' : 'var(--accent-amber)20',
                          border: `1px solid ${emailCodeSending ? 'var(--border-primary)' : 'var(--accent-amber)'}`,
                          color: emailCodeSending ? 'var(--text-muted)' : 'var(--accent-amber)',
                          cursor: emailCodeSending ? 'not-allowed' : 'pointer',
                          fontFamily: 'monospace', fontSize: '0.8rem',
                        }}
                      >
                        {emailCodeSending ? 'SENDING...' : '📧 SEND CODE TO EMAIL'}
                      </button>
                    ) : (
                      <div style={{ color: 'var(--accent-green)', fontSize: '0.7rem' }}>
                        ✓ Code sent! Check your email and enter the 6-digit code above.
                        <button
                          type="button"
                          onClick={handleSendEmailCode}
                          disabled={emailCodeSending}
                          style={{
                            background: 'none', border: 'none', color: 'var(--accent-amber)',
                            cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
                            marginLeft: '8px', textDecoration: 'underline',
                          }}
                        >
                          {emailCodeSending ? 'Sending...' : 'Resend'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {mfaMethod === 'recovery' && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '8px' }}>
                    Enter one of your recovery codes (each can only be used once)
                  </div>
                )}
              </div>

              {error && <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>{error}</div>}

              <button type="submit" disabled={mfaLoading || !mfaCode} style={{
                width: '100%', padding: '14px',
                background: mfaLoading ? 'var(--border-subtle)' : 'var(--accent-teal)20',
                border: `1px solid ${mfaLoading ? 'var(--border-primary)' : 'var(--accent-teal)'}`,
                color: mfaLoading ? 'var(--text-muted)' : 'var(--accent-teal)',
                cursor: mfaLoading || !mfaCode ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace', fontSize: '0.9rem',
              }}>
                {mfaLoading ? 'VERIFYING...' : 'VERIFY'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button onClick={handleMfaCancel}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                ← Cancel and try again
              </button>
            </div>
          </div>
        ) : (
        <>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
              {isRegistering ? 'HANDLE' : 'HANDLE / EMAIL'}
            </label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
              placeholder={isRegistering ? 'Choose handle' : 'Enter handle or email'} style={inputStyle} />
          </div>

          {isRegistering && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>EMAIL</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>DISPLAY NAME</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you" style={inputStyle} />
              </div>
            </>
          )}

          <div style={{ marginBottom: isRegistering ? '16px' : '24px' }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PASSWORD</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegistering ? 'Min 8 chars, upper, lower, number' : 'Enter password'} style={inputStyle} />
          </div>

          {isRegistering && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CONFIRM PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password" style={inputStyle} />
            </div>
          )}

          {error && <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px',
            background: loading ? 'var(--border-subtle)' : 'var(--accent-amber)20',
            border: `1px solid ${loading ? 'var(--border-primary)' : 'var(--accent-amber)'}`,
            color: loading ? 'var(--text-muted)' : 'var(--accent-amber)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace', fontSize: '0.9rem',
          }}>
            {loading ? 'PROCESSING...' : isRegistering ? 'CREATE ACCOUNT' : 'LOGIN'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={() => { setIsRegistering(!isRegistering); setError(''); setConfirmPassword(''); setShowForgotPassword(false); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {isRegistering ? '← BACK TO LOGIN' : 'NEW USER? CREATE ACCOUNT →'}
          </button>
        </div>

        {!isRegistering && !showForgotPassword && (
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <button onClick={() => { setShowForgotPassword(true); setError(''); setForgotStatus({ loading: false, message: '', error: '' }); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              Forgot password?
            </button>
          </div>
        )}

        {showForgotPassword && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Enter your email address and we'll send you a link to reset your password.
            </div>
            <form onSubmit={handleForgotPassword}>
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={inputStyle}
                />
              </div>
              {forgotStatus.error && (
                <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>
                  {forgotStatus.error}
                </div>
              )}
              {forgotStatus.message && (
                <div style={{ color: 'var(--accent-green)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-green)10', border: '1px solid var(--accent-green)30' }}>
                  {forgotStatus.message}
                </div>
              )}
              <button type="submit" disabled={forgotStatus.loading} style={{
                width: '100%', padding: '12px',
                background: forgotStatus.loading ? 'var(--border-subtle)' : 'var(--accent-teal)20',
                border: `1px solid ${forgotStatus.loading ? 'var(--border-primary)' : 'var(--accent-teal)'}`,
                color: forgotStatus.loading ? 'var(--text-muted)' : 'var(--accent-teal)',
                cursor: forgotStatus.loading ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace', fontSize: '0.9rem',
              }}>
                {forgotStatus.loading ? 'SENDING...' : 'SEND RESET LINK'}
              </button>
            </form>
            <button onClick={() => { setShowForgotPassword(false); setForgotStatus({ loading: false, message: '', error: '' }); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem', marginTop: '12px', display: 'block', width: '100%', textAlign: 'center' }}>
              ← Back to login
            </button>
          </div>
        )}
        </>
        )}

        {onAbout && (
          <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={onAbout}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              About this server ◇
            </button>
          </div>
        )}

        {/* Clear All Data - for troubleshooting stale data issues */}
        <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={async () => {
              if (confirm('This will clear all local data including saved login, encryption keys, and cached content. You will need to log in again. Continue?')) {
                try {
                  // Clear all storage
                  localStorage.clear();
                  sessionStorage.clear();

                  // Clear IndexedDB
                  const databases = await indexedDB.databases?.() || [];
                  for (const db of databases) {
                    if (db.name) indexedDB.deleteDatabase(db.name);
                  }

                  // Unregister service workers
                  const registrations = await navigator.serviceWorker?.getRegistrations() || [];
                  for (const registration of registrations) {
                    await registration.unregister();
                  }

                  // Clear caches
                  const cacheNames = await caches?.keys() || [];
                  for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                  }

                  alert('All data cleared. The page will now reload.');
                  window.location.reload();
                } catch (err) {
                  console.error('Failed to clear data:', err);
                  alert('Failed to clear some data. Try clearing manually in browser settings.');
                }
              }
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.7 }}
          >
            Having trouble? Clear all data ✕
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ RESET PASSWORD PAGE ============
const ResetPasswordPage = ({ onBack }) => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ loading: true, valid: null, error: '', success: false });
  const { isMobile } = useWindowSize();

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (!urlToken) {
      setStatus({ loading: false, valid: false, error: 'No reset token provided', success: false });
      return;
    }
    setToken(urlToken);

    // Verify token with server
    fetch(`${API_URL}/auth/reset-password/${urlToken}`)
      .then(res => res.json())
      .then(data => {
        setStatus({ loading: false, valid: data.valid, error: data.error || '', success: false });
      })
      .catch(() => {
        setStatus({ loading: false, valid: false, error: 'Failed to verify token', success: false });
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus(s => ({ ...s, error: 'Passwords do not match' }));
      return;
    }
    if (newPassword.length < 8) {
      setStatus(s => ({ ...s, error: 'Password must be at least 8 characters' }));
      return;
    }

    setStatus(s => ({ ...s, loading: true, error: '' }));
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ loading: false, valid: true, error: '', success: true });
      } else {
        setStatus(s => ({ ...s, loading: false, error: data.error || 'Failed to reset password' }));
      }
    } catch (err) {
      setStatus(s => ({ ...s, loading: false, error: 'Network error. Please try again.' }));
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace", padding: isMobile ? '20px' : '0',
    }}>
      <ScanLines />
      <div style={{
        width: '100%', maxWidth: '400px', padding: isMobile ? '24px' : '40px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <GlowText color="var(--accent-amber)" size={isMobile ? '2rem' : '2.5rem'} weight={700}>FARHOLD</GlowText>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>PASSWORD RESET</div>
        </div>

        {status.loading && !status.success && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Verifying reset token...</div>
        )}

        {!status.loading && !status.valid && !status.success && (
          <div>
            <div style={{ color: 'var(--accent-orange)', fontSize: '0.9rem', marginBottom: '24px', padding: '12px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30', textAlign: 'center' }}>
              {status.error || 'Invalid or expired reset link'}
            </div>
            <button onClick={onBack} style={{
              width: '100%', padding: '12px',
              background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)',
              color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              BACK TO LOGIN
            </button>
          </div>
        )}

        {!status.loading && status.valid && !status.success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>NEW PASSWORD</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, number" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CONFIRM PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password" style={inputStyle} />
            </div>
            {status.error && (
              <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>
                {status.error}
              </div>
            )}
            <button type="submit" disabled={status.loading} style={{
              width: '100%', padding: '14px',
              background: status.loading ? 'var(--border-subtle)' : 'var(--accent-amber)20',
              border: `1px solid ${status.loading ? 'var(--border-primary)' : 'var(--accent-amber)'}`,
              color: status.loading ? 'var(--text-muted)' : 'var(--accent-amber)',
              cursor: status.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              {status.loading ? 'RESETTING...' : 'RESET PASSWORD'}
            </button>
          </form>
        )}

        {status.success && (
          <div>
            <div style={{ color: 'var(--accent-green)', fontSize: '0.9rem', marginBottom: '24px', padding: '12px', background: 'var(--accent-green)10', border: '1px solid var(--accent-green)30', textAlign: 'center' }}>
              Password reset successfully! You can now login with your new password.
            </div>
            <button onClick={onBack} style={{
              width: '100%', padding: '14px',
              background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
              color: 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              GO TO LOGIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ WAVE LIST (Mobile Responsive) ============
// Badge colors by notification type (priority order: mention > reply > burst > activity)
const NOTIFICATION_BADGE_COLORS = {
  direct_mention: { bg: 'var(--accent-amber)', shadow: 'var(--glow-amber)', icon: '@' },  // Amber - someone mentioned you
  reply: { bg: 'var(--accent-green)', shadow: 'var(--glow-green)', icon: '↩' },           // Green - reply to your ping
  ripple: { bg: 'var(--accent-purple)', shadow: 'var(--glow-purple)', icon: '◈' },          // Purple - burst activity
  wave_activity: { bg: 'var(--accent-orange)', shadow: 'var(--glow-orange)', icon: null },  // Orange - general activity
};

const WaveList = ({ waves, selectedWave, onSelectWave, onNewWave, showArchived, onToggleArchived, isMobile, waveNotifications = {} }) => (
  <div style={{
    width: isMobile ? '100%' : '300px',
    minWidth: isMobile ? 'auto' : '280px',
    borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', height: '100%',
    borderBottom: isMobile ? '1px solid var(--border-subtle)' : 'none',
  }}>
    <div style={{ padding: isMobile ? '14px 16px' : '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
      <GlowText color="var(--accent-amber)" size={isMobile ? '1rem' : '0.9rem'}>WAVES</GlowText>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onToggleArchived}
          title={showArchived ? 'Show active waves' : 'Show archived waves'}
          style={{
            padding: isMobile ? '12px 14px' : '6px 10px',
            minHeight: isMobile ? '44px' : 'auto',
            minWidth: isMobile ? '44px' : 'auto',
            background: showArchived ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${showArchived ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: showArchived ? 'var(--accent-teal)' : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
          }}
        >{showArchived ? '📦 ARCHIVED' : '📬'}</button>
        <button onClick={onNewWave} style={{
          padding: isMobile ? '12px 16px' : '6px 12px',
          minHeight: isMobile ? '44px' : 'auto',
          background: 'var(--accent-amber)20', border: '1px solid var(--accent-amber)50',
          color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
        }}>+ NEW</button>
      </div>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {waves.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {showArchived ? 'No archived waves' : 'No waves yet. Create one!'}
        </div>
      ) : waves.map(wave => {
        const config = PRIVACY_LEVELS[wave.privacy] || PRIVACY_LEVELS.private;
        const isSelected = selectedWave?.id === wave.id;
        // Get notification info for this wave (priority-based type from server)
        const notifInfo = waveNotifications[wave.id];
        const notifCount = notifInfo?.count || 0;
        const notifType = notifInfo?.highestType || 'wave_activity';
        const badgeStyle = NOTIFICATION_BADGE_COLORS[notifType] || NOTIFICATION_BADGE_COLORS.wave_activity;
        // Show notification badge OR unread count (notification badge takes priority)
        const showNotificationBadge = notifCount > 0;
        const showUnreadBadge = !showNotificationBadge && wave.unread_count > 0;
        return (
          <div key={wave.id} onClick={() => onSelectWave(wave)}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            style={{
            padding: '12px 16px', cursor: 'pointer',
            background: isSelected ? 'var(--accent-amber)10' : (showNotificationBadge ? `${badgeStyle.bg}08` : 'transparent'),
            borderBottom: '1px solid var(--bg-hover)',
            borderLeft: `3px solid ${showNotificationBadge ? badgeStyle.bg : (isSelected ? config.color : 'transparent')}`,
            transition: 'background 0.2s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                {wave.is_archived && '📦 '}{wave.title}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {showNotificationBadge && (
                  <span style={{
                    background: badgeStyle.bg,
                    color: '#000',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    boxShadow: `0 0 8px ${badgeStyle.shadow}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}>
                    {badgeStyle.icon && <span style={{ fontSize: '0.7rem' }}>{badgeStyle.icon}</span>}
                    {notifCount}
                  </span>
                )}
                {showUnreadBadge && (
                  <span style={{
                    background: 'var(--accent-orange)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    boxShadow: '0 0 8px var(--glow-orange)',
                  }}>{wave.unread_count}</span>
                )}
                <span style={{ color: config.color }}>{config.icon}</span>
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.85rem' : '0.7rem' }}>
              {wave.creator_name || 'Unknown'} • {wave.message_count} msgs
              {wave.group_name && <span> • {wave.group_name}</span>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ============ DROPLET (formerly ThreadedMessage) ============
const Droplet = ({ message, depth = 0, onReply, onDelete, onEdit, onSaveEdit, onCancelEdit, editingMessageId, editContent, setEditContent, currentUserId, highlightId, playbackIndex, collapsed, onToggleCollapse, isMobile, onReact, onMessageClick, participants = [], contacts = [], onShowProfile, onReport, onFocus, onRipple, onShare, wave, onNavigateToWave, currentWaveId, unreadCountsByWave = {}, autoFocusDroplets = false, fetchAPI }) => {
  const config = PRIVACY_LEVELS[message.privacy] || PRIVACY_LEVELS.private;
  const isHighlighted = highlightId === message.id;
  const isVisible = playbackIndex === null || message._index <= playbackIndex;

  // Check if there are any visible children (non-deleted or deleted with visible descendants)
  const hasVisibleChildren = (children) => {
    if (!children || children.length === 0) return false;
    return children.some(child => !child.deleted || hasVisibleChildren(child.children));
  };
  const hasChildren = hasVisibleChildren(message.children);
  const isCollapsed = collapsed[message.id];
  const isDeleted = message.deleted;
  const canDelete = !isDeleted && message.author_id === currentUserId;
  const isEditing = !isDeleted && editingMessageId === message.id;
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const isUnread = !isDeleted && message.is_unread && message.author_id !== currentUserId;
  const isReply = depth > 0 && message.parentId;
  const isAtDepthLimit = depth >= THREAD_DEPTH_LIMIT;

  // Count all droplets in children (recursive) - for collapsed thread indicator
  const countAllChildren = (children) => {
    if (!children) return 0;
    return children.reduce((count, child) => {
      return count + 1 + countAllChildren(child.children);
    }, 0);
  };
  const totalChildCount = hasChildren ? countAllChildren(message.children) : 0;

  // Count unread droplets in children (recursive) - for collapsed thread indicator
  const countUnreadChildren = (children) => {
    if (!children) return 0;
    return children.reduce((count, child) => {
      const childUnread = !child.deleted && child.is_unread && child.author_id !== currentUserId ? 1 : 0;
      return count + childUnread + countUnreadChildren(child.children);
    }, 0);
  };
  const unreadChildCount = isCollapsed && hasChildren ? countUnreadChildren(message.children) : 0;

  const quickReactions = ['👍', '❤️', '😂', '🎉', '🤔', '👏', '😢', '😭'];

  if (!isVisible) return null;

  // Don't render deleted messages unless they have children (replies)
  // Deleted messages with children show placeholder to preserve thread context
  if (isDeleted && !hasChildren) return null;

  // If this droplet has been rippled out, show a link card instead
  // But NOT when viewing from the ripple wave itself (where rippledTo === currentWaveId)
  const isRippled = !!(message.brokenOutTo || message.rippledTo) && (message.brokenOutTo || message.rippledTo) !== currentWaveId;

  const handleMessageClick = () => {
    if (isUnread && onMessageClick) {
      onMessageClick(message.id);
    }
    // Auto-focus if preference enabled and droplet has children (replies)
    if (autoFocusDroplets && hasChildren && onFocus && !isDeleted) {
      onFocus(message);
    }
  };

  // Render rippled droplet as a link card
  if (isRippled) {
    const rippledToId = message.brokenOutTo || message.rippledTo;
    const rippledToTitle = message.brokenOutToTitle || message.rippledToTitle || 'New Wave';
    return (
      <div data-message-id={message.id}>
        <RippledLinkCard
          droplet={message}
          waveTitle={rippledToTitle}
          onClick={() => onNavigateToWave && onNavigateToWave({
            id: rippledToId,
            title: rippledToTitle,
          })}
          isMobile={isMobile}
          unreadCount={unreadCountsByWave[rippledToId] || 0}
        />
      </div>
    );
  }

  // Compact styling
  const avatarSize = isMobile ? 24 : 20;

  return (
    <div data-message-id={message.id}>
      <div
        onClick={handleMessageClick}
        style={{
          padding: '0px 12px',
          marginTop: isMobile ? '8px' : '6px',
          background: isHighlighted ? `${config.color}15` : isUnread ? 'var(--accent-amber)08' : 'transparent',
          borderLeft: isUnread ? '2px solid var(--accent-amber)' : '2px solid transparent',
          cursor: (isUnread || (autoFocusDroplets && hasChildren && !isDeleted)) ? 'pointer' : 'default',
          transition: 'background 0.15s ease',
          opacity: isDeleted ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isHighlighted && !isUnread) {
            e.currentTarget.style.background = 'var(--bg-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isHighlighted && !isUnread) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Header row with author info (left) and actions (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{ cursor: onShowProfile ? 'pointer' : 'default', flexShrink: 0 }}
              onClick={onShowProfile && message.author_id ? (e) => { e.stopPropagation(); onShowProfile(message.author_id); } : undefined}
            >
              <Avatar letter={message.sender_avatar || '?'} color={config.color} size={avatarSize} imageUrl={message.sender_avatar_url} />
            </div>
            <span
              style={{ color: config.color, fontSize: isMobile ? '0.85rem' : '0.8rem', fontWeight: 600, cursor: onShowProfile ? 'pointer' : 'default' }}
              onClick={onShowProfile && message.author_id ? (e) => { e.stopPropagation(); onShowProfile(message.author_id); } : undefined}
            >
              {message.sender_name}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.7rem' : '0.65rem' }}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {wave?.privacy !== message.privacy && <PrivacyBadge level={message.privacy} compact />}
          </div>

          {/* Compact inline actions */}
          {!isDeleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: 0.6, transition: 'opacity 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              {/* Reply / Focus to Reply */}
              {isAtDepthLimit && onFocus ? (
                <button onClick={() => onFocus(message)} title="Focus to reply" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-teal)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>⤢</button>
              ) : (
                <button onClick={() => onReply(message)} title="Reply" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--text-dim)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>↵</button>
              )}
              {/* Collapse/Expand */}
              {hasChildren && (
                <button onClick={() => onToggleCollapse(message.id)} title={isCollapsed ? 'Expand' : 'Collapse'} style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-amber)', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.65rem',
                }}>{isCollapsed ? `▶${totalChildCount}` : '▼'}</button>
              )}
              {/* Focus */}
              {hasChildren && !isAtDepthLimit && onFocus && (
                <button onClick={() => onFocus(message)} title="Focus" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-teal)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>⤢</button>
              )}
              {/* Share */}
              {wave?.privacy === 'public' && onShare && (
                <button onClick={() => onShare(message)} title="Share" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-purple)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>⤴</button>
              )}
              {/* Burst (create new wave from this ping) */}
              {onRipple && (
                <button onClick={() => onRipple(message)} title="Burst to new wave" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-teal)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>◈</button>
              )}
              {/* Edit */}
              {canDelete && !isEditing && (
                <button onClick={() => onEdit(message)} title="Edit" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-amber)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>✏</button>
              )}
              {/* Delete */}
              {canDelete && !isEditing && (
                <button onClick={() => onDelete(message)} title="Delete" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-orange)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>✕</button>
              )}
              {/* Reaction */}
              <button onClick={() => setShowReactionPicker(!showReactionPicker)} title="React" style={{
                padding: isMobile ? '8px 10px' : '2px 4px', background: showReactionPicker ? 'var(--bg-hover)' : 'transparent', border: 'none',
                color: 'var(--text-dim)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>{showReactionPicker ? '✕' : '😀'}</button>
              {/* Reaction picker dropdown */}
              {showReactionPicker && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 10,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '4px',
                  display: 'flex', gap: '2px',
                }}>
                  {quickReactions.map(emoji => (
                    <button key={emoji} onClick={() => { onReact(message.id, emoji); setShowReactionPicker(false); }}
                      style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                    >{emoji}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Depth indicator for deep threads */}
        {isAtDepthLimit && (
          <div style={{
            marginBottom: '8px',
            padding: '6px 10px',
            background: 'var(--accent-teal)10',
            border: '1px solid var(--accent-teal)40',
            borderLeft: '3px solid var(--accent-teal)',
            fontSize: isMobile ? '0.7rem' : '0.65rem',
            color: 'var(--accent-teal)',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>⬡</span>
            <span>Thread depth limit reached</span>
            <span style={{ color: 'var(--text-dim)' }}>•</span>
            <span style={{ color: 'var(--text-dim)' }}>Use Focus to continue deeper</span>
          </div>
        )}
        {depth > THREAD_DEPTH_LIMIT && (
          <div style={{
            marginBottom: '8px',
            padding: '4px 8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '2px solid var(--text-dim)',
            fontSize: isMobile ? '0.65rem' : '0.6rem',
            color: 'var(--text-dim)',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span>⬡</span>
            <span>Depth: {depth} levels</span>
          </div>
        )}
        {isEditing ? (
          <div style={{ marginBottom: '10px' }}>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  onSaveEdit(message.id);
                } else if (e.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-amber)',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.95rem' : '0.85rem',
                resize: 'vertical',
              }}
              placeholder="Edit your ping..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => onSaveEdit(message.id)} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-green)20',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>💾 SAVE (Ctrl+Enter)</button>
              <button onClick={onCancelEdit} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid var(--text-dim)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>✕ CANCEL (Esc)</button>
            </div>
          </div>
        ) : isDeleted ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              fontStyle: 'italic',
            }}
          >
            [Ping deleted]
          </div>
        ) : (
          <div
            onClick={(e) => {
              // Handle image clicks for lightbox
              if (e.target.tagName === 'IMG' && e.target.classList.contains('zoomable-image')) {
                e.stopPropagation();
                setLightboxImage(e.target.src);
                return;
              }
            }}
            style={{
              color: 'var(--text-primary)',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
            }}
          >
            <DropletWithEmbeds
              content={message.content}
              participants={participants}
              contacts={contacts}
              onMentionClick={onShowProfile}
              fetchAPI={fetchAPI}
            />
          </div>
        )}
        {/* Reactions and Read Receipts Row */}
        {!isDeleted && message.reactions && Object.keys(message.reactions).length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px' }}>
            {Object.entries(message.reactions).map(([emoji, userIds]) => {
              const hasReacted = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  style={{
                    padding: '1px 4px',
                    background: hasReacted ? 'var(--accent-amber)20' : 'var(--bg-hover)',
                    border: 'none',
                    color: hasReacted ? 'var(--accent-amber)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontSize: isMobile ? '0.8rem' : '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    borderRadius: '2px',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: '0.6rem', fontFamily: 'monospace' }}>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Read Receipts - compact display */}
        {!isDeleted && message.readBy && message.readBy.length > 0 && (
          <details style={{ marginTop: '6px', cursor: 'pointer' }}>
            <summary style={{
              color: 'var(--text-muted)',
              fontSize: isMobile ? '0.65rem' : '0.6rem',
              userSelect: 'none',
              fontFamily: 'monospace',
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <span style={{ color: 'var(--accent-green)' }}>✓</span>
              {message.readBy.length}
            </summary>
            <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {message.readBy.map(userId => {
                const participant = participants.find(p => p.id === userId);
                return (
                  <span key={userId} title={participant?.handle || ''} style={{
                    padding: '1px 4px', background: 'var(--accent-green)15', border: '1px solid var(--accent-green)40',
                    color: 'var(--accent-green)', fontSize: isMobile ? '0.6rem' : '0.55rem', fontFamily: 'monospace'
                  }}>
                    {participant ? participant.name : userId}
                  </span>
                );
              })}
            </div>
          </details>
        )}

        {/* Nested replies rendered INSIDE parent droplet */}
        {hasChildren && !isCollapsed && (
          <div style={{
            marginTop: '2px',
            marginLeft: '0px',
            paddingLeft: isMobile ? '4px' : '6px',
            borderLeft: '1px solid var(--border-subtle)',
          }}>
            {message.children.map((child) => (
              <Droplet key={child.id} message={child} depth={depth + 1} onReply={onReply} onDelete={onDelete}
                onEdit={onEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
                editingMessageId={editingMessageId} editContent={editContent} setEditContent={setEditContent}
                currentUserId={currentUserId} highlightId={highlightId} playbackIndex={playbackIndex} collapsed={collapsed}
                onToggleCollapse={onToggleCollapse} isMobile={isMobile} onReact={onReact} onMessageClick={onMessageClick}
                participants={participants} contacts={contacts} onShowProfile={onShowProfile} onReport={onReport}
                onFocus={onFocus} onRipple={onRipple} onShare={onShare} wave={wave} onNavigateToWave={onNavigateToWave} currentWaveId={currentWaveId}
                unreadCountsByWave={unreadCountsByWave} autoFocusDroplets={autoFocusDroplets} fetchAPI={fetchAPI} />
            ))}
          </div>
        )}
      </div>
      {lightboxImage && (
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
};

// ============ PLAYBACK CONTROLS (Mobile Responsive) ============
const PlaybackControls = ({ isPlaying, onTogglePlay, currentIndex, totalMessages, onSeek, onReset, playbackSpeed, onSpeedChange, isMobile }) => (
  <div style={{
    flexShrink: 0,
    padding: isMobile ? '8px 12px' : '12px 16px', background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
    borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap',
  }}>
    <GlowText color="var(--accent-teal)" size="0.8rem">PLAYBACK</GlowText>
    <div style={{ display: 'flex', gap: '4px' }}>
      <button onClick={onReset} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem' }}>⟲</button>
      <button onClick={onTogglePlay} style={{
        padding: '4px 12px', background: isPlaying ? 'var(--accent-orange)20' : 'var(--accent-green)20',
        border: `1px solid ${isPlaying ? 'var(--accent-orange)' : 'var(--accent-green)'}`,
        color: isPlaying ? 'var(--accent-orange)' : 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
      }}>{isPlaying ? '⏸' : '▶'}</button>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '100px' }}>
      <input type="range" min={0} max={totalMessages - 1} value={currentIndex ?? totalMessages - 1}
        onChange={(e) => onSeek(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-teal)', minWidth: '60px' }} />
      <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {(currentIndex ?? totalMessages - 1) + 1}/{totalMessages}
      </span>
    </div>
    {!isMobile && (
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0.5, 1, 2, 4].map(speed => (
          <button key={speed} onClick={() => onSpeedChange(speed)} style={{
            padding: '4px 6px', background: playbackSpeed === speed ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${playbackSpeed === speed ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: playbackSpeed === speed ? 'var(--accent-teal)' : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem',
          }}>{speed}x</button>
        ))}
      </div>
    )}
  </div>
);

// ============ DELETE CONFIRM MODAL ============
const DeleteConfirmModal = ({ isOpen, onClose, waveTitle, onConfirm, isMobile }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '450px',
        background: 'linear-gradient(135deg, var(--bg-base), var(--bg-surface))',
        border: '2px solid var(--accent-orange)80', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: '20px' }}>
          <GlowText color="var(--accent-orange)" size={isMobile ? '1rem' : '1.1rem'}>Delete Wave</GlowText>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{
            color: 'var(--text-primary)',
            fontSize: isMobile ? '0.9rem' : '0.95rem',
            lineHeight: 1.6,
            marginBottom: '12px'
          }}>
            Are you sure you want to delete <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>"{waveTitle}"</span>?
          </div>
          <div style={{
            color: 'var(--accent-orange)',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
            lineHeight: 1.5,
            background: 'var(--accent-orange)15',
            padding: '12px',
            border: '1px solid var(--accent-orange)30',
          }}>
            ⚠ This action cannot be undone. All messages will be permanently deleted and all participants will be notified.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
          }}>CANCEL</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'var(--accent-orange)',
            border: '1px solid var(--accent-orange)',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            fontWeight: 600,
          }}>DELETE WAVE</button>
        </div>
      </div>
    </div>
  );
};

// ============ USER PROFILE MODAL ============
const UserProfileModal = ({ isOpen, onClose, userId, currentUser, fetchAPI, showToast, contacts, blockedUsers, mutedUsers, onAddContact, onBlock, onMute, onFollow, onUnfollow, isMobile }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      fetchAPI(`/users/${userId}/profile`)
        .then(data => setProfile(data))
        .catch(err => {
          console.error('Failed to load profile:', err);
          showToast('Failed to load profile', 'error');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, userId, fetchAPI, showToast]);

  if (!isOpen) return null;

  const isCurrentUser = userId === currentUser?.id;
  const isContact = contacts?.some(c => c.id === userId);
  const isFollowing = contacts?.some(c => c.id === userId && c.isRemote);
  const isBlocked = blockedUsers?.some(u => u.blockedUserId === userId);
  const isMuted = mutedUsers?.some(u => u.mutedUserId === userId);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '1px solid var(--border-subtle)', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Loading...</div>
        ) : profile ? (
          <>
            {/* Header with close button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <GlowText color="var(--accent-amber)" size={isMobile ? '1rem' : '1.1rem'}>User Profile</GlowText>
              <button onClick={onClose} style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
              }}>✕</button>
            </div>

            {/* Federated user indicator */}
            {profile.isRemote && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                marginBottom: '16px', padding: '8px 12px',
                background: 'var(--accent-purple)15', border: '1px solid var(--accent-purple)50',
                fontSize: '0.75rem', color: 'var(--accent-purple)',
              }}>
                <span>◇</span>
                <span>Federated User from <strong>{profile.nodeName}</strong></span>
              </div>
            )}

            {/* Avatar and basic info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <Avatar letter={profile.avatar || profile.displayName?.[0] || '?'} color={profile.isRemote ? 'var(--accent-purple)' : 'var(--accent-amber)'} size={80} imageUrl={profile.avatarUrl} />
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 600 }}>{profile.displayName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  @{profile.handle}{profile.isRemote && <span style={{ color: 'var(--accent-purple)' }}>@{profile.nodeName}</span>}
                </div>
                <div style={{ color: 'var(--border-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
                  {profile.isRemote ? `Cached ${formatDate(profile.createdAt)}` : `Joined ${formatDate(profile.createdAt)}`}
                </div>
              </div>
            </div>

            {/* Bio section */}
            {profile.bio && (
              <div style={{
                marginBottom: '20px', padding: '16px',
                background: 'var(--bg-elevated)', border: '1px solid var(--bg-hover)',
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '8px' }}>ABOUT</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {profile.bio}
                </div>
              </div>
            )}

            {/* Action buttons (not shown for current user or federated users) */}
            {!isCurrentUser && !profile.isRemote && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!isContact && !isBlocked && onAddContact && (
                  <button onClick={() => { onAddContact(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
                    color: 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>+ ADD CONTACT</button>
                )}
                {isContact && (
                  <div style={{ color: 'var(--accent-green)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-green)10', border: '1px solid var(--accent-green)40' }}>
                    ✓ Contact
                  </div>
                )}
                {!isBlocked && onBlock && (
                  <button onClick={() => { onBlock(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>BLOCK</button>
                )}
                {isBlocked && (
                  <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)40' }}>
                    Blocked
                  </div>
                )}
                {!isMuted && !isBlocked && onMute && (
                  <button onClick={() => { onMute(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-amber)',
                    color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>MUTE</button>
                )}
                {isMuted && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)40' }}>
                    Muted
                  </div>
                )}
              </div>
            )}

            {/* Action buttons for federated users */}
            {!isCurrentUser && profile.isRemote && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!isFollowing && !isBlocked && onFollow && (
                  <button onClick={() => { onFollow(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-purple)20', border: '1px solid var(--accent-purple)',
                    color: 'var(--accent-purple)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>◇ FOLLOW</button>
                )}
                {isFollowing && onUnfollow && (
                  <button onClick={() => { onUnfollow(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-purple)10', border: '1px solid var(--accent-purple)40',
                    color: 'var(--accent-purple)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>✓ FOLLOWING</button>
                )}
                {!isBlocked && onBlock && (
                  <button onClick={() => { onBlock(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>BLOCK</button>
                )}
                {isBlocked && (
                  <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)40' }}>
                    Blocked
                  </div>
                )}
                {!isMuted && !isBlocked && onMute && (
                  <button onClick={() => { onMute(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-amber)',
                    color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>MUTE</button>
                )}
                {isMuted && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)40' }}>
                    Muted
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--accent-orange)', textAlign: 'center', padding: '40px' }}>Profile not found</div>
        )}
      </div>
    </div>
  );
};

// ============ ALERT DETAIL MODAL ============
const AlertDetailModal = ({ alert, onClose, onDismiss, isMobile }) => {
  if (!alert) return null;

  const priorityConfig = {
    critical: { icon: '🚨', color: 'var(--accent-orange)', label: 'CRITICAL' },
    warning: { icon: '⚠️', color: 'var(--accent-amber)', label: 'WARNING' },
    info: { icon: 'ℹ️', color: 'var(--accent-teal)', label: 'INFO' }
  };

  const categoryLabels = {
    system: 'System',
    announcement: 'Announcement',
    emergency: 'Emergency'
  };

  const cfg = priorityConfig[alert.priority] || priorityConfig.info;
  const categoryLabel = categoryLabels[alert.category] || alert.category;

  // Format dates - ensure we parse as UTC
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    // Append Z if not present (SQLite may strip it)
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const d = new Date(utcStr);
    return d.toLocaleString();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.8)', padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-elevated)', border: `1px solid ${cfg.color}`,
        borderRadius: '4px', padding: isMobile ? '16px' : '24px',
        maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto',
        boxShadow: `0 0 20px ${cfg.color}40`,
      }} onClick={e => e.stopPropagation()}>
        {/* Priority Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '16px', padding: '8px 12px',
          background: `${cfg.color}15`, border: `1px solid ${cfg.color}40`,
          borderRadius: '4px',
        }}>
          <span style={{ fontSize: '1.5rem' }}>{cfg.icon}</span>
          <span style={{ color: cfg.color, fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {cfg.label}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginLeft: 'auto' }}>
            {categoryLabel}
          </span>
        </div>

        {/* Title */}
        <h2 style={{
          margin: '0 0 16px 0', color: 'var(--text-primary)',
          fontFamily: 'monospace', fontSize: isMobile ? '1.1rem' : '1.25rem',
        }}>
          {alert.title}
        </h2>

        {/* Content */}
        <div style={{
          color: 'var(--text-secondary)', marginBottom: '16px',
          lineHeight: '1.6', fontFamily: 'monospace', fontSize: '0.9rem',
          padding: '12px', background: 'var(--bg-surface)', borderRadius: '4px',
        }} dangerouslySetInnerHTML={{ __html: alert.content }} />

        {/* Metadata */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '4px',
          marginBottom: '20px', color: 'var(--text-dim)',
          fontFamily: 'monospace', fontSize: '0.75rem',
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Active: </span>
            {formatDate(alert.startTime)} — {formatDate(alert.endTime)}
          </div>
          {alert.originNode && (
            <div>
              <span style={{ color: 'var(--text-muted)' }}>From: </span>
              <span style={{ color: 'var(--accent-purple)' }}>@{alert.originNode}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {onDismiss && (
            <button onClick={() => { onDismiss(alert.id); onClose(); }} style={{
              padding: isMobile ? '10px 16px' : '8px 14px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'transparent', border: '1px solid var(--border-secondary)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'monospace',
              fontSize: isMobile ? '0.85rem' : '0.8rem',
            }}>DISMISS</button>
          )}
          <button onClick={onClose} style={{
            padding: isMobile ? '10px 16px' : '8px 14px',
            minHeight: isMobile ? '44px' : 'auto',
            background: `${cfg.color}20`, border: `1px solid ${cfg.color}`,
            color: cfg.color, cursor: 'pointer', fontFamily: 'monospace',
            fontSize: isMobile ? '0.85rem' : '0.8rem',
          }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
};

// ============ REPORT MODAL ============
const REPORT_REASONS = [
  { value: 'spam', label: 'Spam', desc: 'Unwanted promotional content or repetitive pings' },
  { value: 'harassment', label: 'Harassment', desc: 'Bullying, threats, or targeted abuse' },
  { value: 'inappropriate', label: 'Inappropriate Content', desc: 'Offensive, explicit, or harmful content' },
  { value: 'other', label: 'Other', desc: 'Other violation of community guidelines' },
];

// ============ RIPPLE MODAL ============
const RippleModal = ({ isOpen, onClose, droplet, wave, participants, fetchAPI, showToast, isMobile, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Count children recursively
  const countChildren = (msg) => {
    if (!msg.children || msg.children.length === 0) return 0;
    return msg.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
  };

  useEffect(() => {
    if (isOpen && droplet) {
      // Pre-fill title from droplet content (first 50 chars, strip HTML)
      const cleanContent = (droplet.content || '').replace(/<[^>]*>/g, '').trim();
      setTitle(cleanContent.substring(0, 50) || 'Continued Discussion');
      // Pre-select all current wave participants
      setSelectedParticipants(participants.map(p => p.id));
    }
  }, [isOpen, droplet, participants]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Please enter a title for the new wave', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchAPI(`/pings/${droplet.id}/burst`, {
        method: 'POST',
        body: { title: title.trim(), participants: selectedParticipants }
      });
      showToast(`Created new wave: ${result.newWave.title}`, 'success');
      onClose();
      if (onSuccess) {
        onSuccess(result.newWave);
      }
    } catch (err) {
      showToast(err.message || 'Failed to burst ping', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleParticipant = (userId) => {
    setSelectedParticipants(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!isOpen || !droplet) return null;

  const childCount = countChildren(droplet);
  const contentPreview = (droplet.content || '').replace(/<[^>]*>/g, '').substring(0, 100);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '550px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-elevated))',
        border: '2px solid var(--accent-teal)80', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size={isMobile ? '1rem' : '1.1rem'}>◈ Burst to New Wave</GlowText>
        </div>

        {/* Preview of what's being rippled */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderLeft: '3px solid var(--accent-teal)',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: isMobile ? '0.8rem' : '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
            Rippling
          </div>
          <div style={{
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            "{contentPreview}{contentPreview.length >= 100 ? '...' : ''}"
          </div>
          <div style={{ fontSize: isMobile ? '0.75rem' : '0.7rem', color: 'var(--accent-teal)' }}>
            1 ping + {childCount} {childCount === 1 ? 'reply' : 'replies'} will be moved
          </div>
        </div>

        {/* New wave title */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            New Wave Title
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            placeholder="Enter a title for the new wave..."
            maxLength={200}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.95rem' : '0.9rem',
            }}
            autoFocus
          />
          <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', textAlign: 'right', marginTop: '4px' }}>
            {title.length}/200
          </div>
        </div>

        {/* Participants selection */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            Participants ({selectedParticipants.length} selected)
          </div>
          <div style={{
            maxHeight: '150px',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '8px',
          }}>
            {participants.map(p => (
              <label key={p.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                marginBottom: '4px',
                background: selectedParticipants.includes(p.id) ? 'var(--accent-teal)15' : 'transparent',
                border: `1px solid ${selectedParticipants.includes(p.id) ? 'var(--accent-teal)30' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(p.id)}
                  onChange={() => toggleParticipant(p.id)}
                  style={{ accentColor: 'var(--accent-teal)' }}
                />
                <Avatar letter={p.avatar || '?'} color="var(--accent-teal)" size={24} imageUrl={p.avatarUrl} />
                <span style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                  {p.display_name || p.displayName || p.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Origin info */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '20px',
          fontSize: isMobile ? '0.75rem' : '0.7rem',
          color: 'var(--text-dim)',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>From:</span> {wave?.title || 'Unknown Wave'}
          <span style={{ margin: '0 8px' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>Privacy:</span> {wave?.privacy || 'private'}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={submitting} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            opacity: submitting ? 0.5 : 1,
          }}>CANCEL</button>
          <button onClick={handleSubmit} disabled={submitting || !title.trim()} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: title.trim() ? 'var(--accent-teal)' : 'var(--border-primary)',
            border: `1px solid ${title.trim() ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: 'var(--bg-base)',
            cursor: (submitting || !title.trim()) ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            fontWeight: 600,
            opacity: submitting ? 0.7 : 1,
          }}>{submitting ? 'CREATING...' : '◈ CREATE WAVE'}</button>
        </div>
      </div>
    </div>
  );
};

// ============ LINK CARD FOR RIPPLED DROPLETS ============
const RippledLinkCard = ({ droplet, waveTitle, onClick, isMobile, unreadCount = 0 }) => {
  return (
    <div
      onClick={onClick}
      style={{
        padding: isMobile ? '14px 16px' : '12px 16px',
        marginBottom: '8px',
        background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))',
        border: `2px solid ${unreadCount > 0 ? 'var(--accent-purple)60' : 'var(--accent-teal)40'}`,
        borderLeft: `4px solid ${unreadCount > 0 ? 'var(--accent-purple)' : 'var(--accent-teal)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = unreadCount > 0 ? 'var(--accent-purple)10' : 'var(--accent-teal)10';
        e.currentTarget.style.borderColor = unreadCount > 0 ? 'var(--accent-purple)80' : 'var(--accent-teal)60';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))';
        e.currentTarget.style.borderColor = unreadCount > 0 ? 'var(--accent-purple)60' : 'var(--accent-teal)40';
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '1.2rem', color: unreadCount > 0 ? 'var(--accent-purple)' : undefined }}>◈</span>
        <span style={{
          color: unreadCount > 0 ? 'var(--accent-purple)' : 'var(--accent-teal)',
          fontSize: isMobile ? '0.8rem' : '0.75rem',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Burst to wave...
        </span>
        {unreadCount > 0 && (
          <span style={{
            background: 'var(--accent-purple)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '10px',
            marginLeft: 'auto',
          }}>
            {unreadCount} new
          </span>
        )}
      </div>
      <div style={{
        color: 'var(--text-primary)',
        fontSize: isMobile ? '1rem' : '0.95rem',
        fontWeight: 500,
        marginBottom: '6px',
      }}>
        "{waveTitle || 'Unknown Wave'}"
      </div>
      <div style={{
        color: 'var(--text-dim)',
        fontSize: isMobile ? '0.8rem' : '0.75rem',
        fontFamily: 'monospace',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span>→</span>
        <span>Click to open</span>
      </div>
    </div>
  );
};

const ReportModal = ({ isOpen, onClose, type, targetId, targetPreview, fetchAPI, showToast, isMobile }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDetails('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason) {
      showToast('Please select a reason for the report', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchAPI('/reports', {
        method: 'POST',
        body: JSON.stringify({ type, targetId, reason, details: details.trim() }),
      });
      if (res.ok) {
        showToast('Report submitted successfully. Thank you for helping keep Farhold safe.', 'success');
        onClose();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to submit report', 'error');
      }
    } catch (err) {
      showToast('Failed to submit report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const typeLabels = { message: 'Ping', droplet: 'Ping', wave: 'Wave', user: 'User' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '500px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-base))',
        border: '2px solid var(--accent-orange)80', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: '20px' }}>
          <GlowText color="var(--accent-orange)" size={isMobile ? '1rem' : '1.1rem'}>Report {typeLabels[type] || 'Content'}</GlowText>
        </div>

        {targetPreview && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '12px',
            marginBottom: '16px',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
            color: 'var(--text-secondary)',
            maxHeight: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {targetPreview}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            Reason for report
          </div>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 12px',
              marginBottom: '8px',
              background: reason === r.value ? 'var(--accent-amber)15' : 'var(--bg-surface)',
              border: `1px solid ${reason === r.value ? 'var(--accent-amber)50' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={(e) => setReason(e.target.value)}
                style={{ marginTop: '2px', accentColor: 'var(--accent-amber)' }}
              />
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.9rem' : '0.95rem' }}>{r.label}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: isMobile ? '0.8rem' : '0.85rem', marginTop: '2px' }}>{r.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            Additional details (optional)
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 500))}
            placeholder="Provide any additional context..."
            maxLength={500}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
              resize: 'vertical',
            }}
          />
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textAlign: 'right', marginTop: '4px' }}>
            {details.length}/500
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={submitting} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            opacity: submitting ? 0.5 : 1,
          }}>CANCEL</button>
          <button onClick={handleSubmit} disabled={submitting || !reason} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: reason ? 'var(--accent-orange)' : 'var(--border-primary)',
            border: `1px solid ${reason ? 'var(--accent-orange)' : 'var(--border-primary)'}`,
            color: '#fff',
            cursor: (submitting || !reason) ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            fontWeight: 600,
            opacity: submitting ? 0.7 : 1,
          }}>{submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}</button>
        </div>
      </div>
    </div>
  );
};

// ============ ADMIN REPORTS PANEL ============
const AdminReportsPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedReport, setSelectedReport] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolution, setResolution] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAPI(`/admin/reports?status=${activeTab}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {
      showToast('Failed to load reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [fetchAPI, activeTab, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadReports();
    }
  }, [isOpen, loadReports]);

  const handleResolve = async () => {
    if (!selectedReport || !resolution) return;
    try {
      const res = await fetchAPI(`/admin/reports/${selectedReport.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution, notes: resolveNotes }),
      });
      if (res.ok) {
        showToast('Report resolved', 'success');
        setSelectedReport(null);
        setResolution('');
        setResolveNotes('');
        loadReports();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to resolve report', 'error');
      }
    } catch (err) {
      showToast('Failed to resolve report', 'error');
    }
  };

  const handleDismiss = async (reportId) => {
    try {
      const res = await fetchAPI(`/admin/reports/${reportId}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'No action required' }),
      });
      if (res.ok) {
        showToast('Report dismissed', 'success');
        loadReports();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to dismiss report', 'error');
      }
    } catch (err) {
      showToast('Failed to dismiss report', 'error');
    }
  };

  const tabs = [
    { id: 'pending', label: 'Pending', color: 'var(--accent-amber)' },
    { id: 'resolved', label: 'Resolved', color: 'var(--accent-green)' },
    { id: 'dismissed', label: 'Dismissed', color: 'var(--text-dim)' },
  ];

  const resolutionOptions = [
    { value: 'warning_issued', label: 'Warning Issued' },
    { value: 'content_removed', label: 'Content Removed' },
    { value: 'user_banned', label: 'User Banned' },
    { value: 'no_action', label: 'No Action Needed' },
  ];

  return (
    <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-orange)40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', fontWeight: 500 }}>REPORTS DASHBOARD</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-orange)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-orange)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-orange)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: activeTab === tab.id ? `${tab.color}20` : 'transparent',
              border: `1px solid ${activeTab === tab.id ? tab.color : 'var(--border-primary)'}`,
              color: activeTab === tab.id ? tab.color : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.85rem' : '0.8rem',
              textTransform: 'uppercase',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>Loading reports...</div>
      ) : reports.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center', border: '1px dashed var(--border-subtle)' }}>
          No {activeTab} reports
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: isMobile ? '14px' : '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: report.type === 'message' ? 'var(--accent-teal)20' : report.type === 'wave' ? 'var(--accent-amber)20' : 'var(--accent-orange)20',
                    color: report.type === 'message' ? 'var(--accent-teal)' : report.type === 'wave' ? 'var(--accent-amber)' : 'var(--accent-orange)',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    marginRight: '8px',
                  }}>
                    {report.type}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                    {report.reason}
                  </span>
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
              </div>

              {report.details && (
                <div style={{
                  color: 'var(--text-secondary)',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                  marginBottom: '8px',
                  padding: '8px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--bg-hover)',
                }}>
                  {report.details}
                </div>
              )}

              {report.target_preview && (
                <div style={{
                  color: 'var(--text-dim)',
                  fontSize: '0.75rem',
                  marginBottom: '8px',
                  fontStyle: 'italic',
                }}>
                  Target: {report.target_preview}
                </div>
              )}

              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '12px' }}>
                Reported by: {report.reporter_handle || report.reporter_id}
              </div>

              {activeTab === 'pending' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedReport(report)}
                    style={{
                      padding: isMobile ? '10px 14px' : '6px 12px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-green)',
                      border: '1px solid var(--accent-green)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.85rem' : '0.75rem',
                    }}
                  >
                    RESOLVE
                  </button>
                  <button
                    onClick={() => handleDismiss(report.id)}
                    style={{
                      padding: isMobile ? '10px 14px' : '6px 12px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'transparent',
                      border: '1px solid var(--text-dim)',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.85rem' : '0.75rem',
                    }}
                  >
                    DISMISS
                  </button>
                </div>
              )}

              {report.resolution && (
                <div style={{ marginTop: '8px', padding: '8px', background: 'var(--accent-green)20', border: '1px solid var(--accent-green)50' }}>
                  <div style={{ color: 'var(--accent-green)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Resolution: {report.resolution.replace(/_/g, ' ')}
                  </div>
                  {report.resolution_notes && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
                      {report.resolution_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedReport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 101, padding: '20px',
        }} onClick={() => setSelectedReport(null)}>
          <div style={{
            width: '100%', maxWidth: '450px',
            background: 'var(--bg-surface)',
            border: '2px solid var(--accent-green)80',
            padding: isMobile ? '20px' : '24px',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '16px' }}>
              <GlowText color="var(--accent-green)" size="1rem">Resolve Report</GlowText>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                Resolution Action
              </div>
              {resolutionOptions.map((opt) => (
                <label key={opt.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  marginBottom: '6px',
                  background: resolution === opt.value ? 'var(--accent-green)20' : 'var(--bg-surface)',
                  border: `1px solid ${resolution === opt.value ? 'var(--accent-green)50' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="resolution"
                    value={opt.value}
                    checked={resolution === opt.value}
                    onChange={(e) => setResolution(e.target.value)}
                    style={{ accentColor: 'var(--accent-green)' }}
                  />
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{opt.label}</span>
                </label>
              ))}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                Notes (optional)
              </div>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Add resolution notes..."
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedReport(null)} style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}>CANCEL</button>
              <button onClick={handleResolve} disabled={!resolution} style={{
                padding: '10px 20px',
                background: resolution ? 'var(--accent-green)' : 'var(--border-primary)',
                border: `1px solid ${resolution ? 'var(--accent-green)' : 'var(--border-primary)'}`,
                color: '#fff',
                cursor: resolution ? 'pointer' : 'not-allowed',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}>RESOLVE</button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

// ============ MY REPORTS PANEL ============
const MyReportsPanel = ({ fetchAPI, showToast, isMobile }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMyReports = async () => {
      try {
        const res = await fetchAPI('/reports');
        if (res.ok) {
          const data = await res.json();
          setReports(data.reports || []);
        }
      } catch (err) {
        showToast('Failed to load your reports', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadMyReports();
  }, [fetchAPI, showToast]);

  const statusColors = {
    pending: 'var(--accent-amber)',
    resolved: 'var(--accent-green)',
    dismissed: 'var(--text-dim)',
  };

  if (loading) {
    return <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <GlowText color="var(--accent-teal)" size={isMobile ? '1rem' : '1.1rem'}>My Reports</GlowText>
      </div>

      {reports.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center', border: '1px dashed var(--border-subtle)' }}>
          You haven't submitted any reports
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: isMobile ? '12px' : '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '2px 8px',
                    background: `${statusColors[report.status]}20`,
                    color: statusColors[report.status],
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                  }}>
                    {report.status}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {report.type} - {report.reason}
                  </span>
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
              </div>

              {report.resolution && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'var(--accent-green)15',
                  border: '1px solid var(--accent-green)30',
                  fontSize: '0.8rem',
                }}>
                  <span style={{ color: 'var(--accent-green)' }}>Resolution: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{report.resolution.replace(/_/g, ' ')}</span>
                  {report.resolution_notes && (
                    <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.75rem' }}>
                      {report.resolution_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ WAVE SETTINGS MODAL ============
const WaveSettingsModal = ({ isOpen, onClose, wave, groups, fetchAPI, showToast, onUpdate, participants = [], showParticipants, setShowParticipants, federationEnabled, currentUserId, onFederate, isMobile }) => {
  const [privacy, setPrivacy] = useState(wave?.privacy || 'private');
  const [selectedGroup, setSelectedGroup] = useState(wave?.groupId || null);
  const [title, setTitle] = useState(wave?.title || '');

  useEffect(() => {
    if (wave) {
      setPrivacy(wave.privacy);
      setSelectedGroup(wave.groupId);
      setTitle(wave.title);
    }
  }, [wave]);

  if (!isOpen || !wave) return null;

  const handleSave = async () => {
    try {
      await fetchAPI(`/waves/${wave.id}`, {
        method: 'PUT',
        body: { title, privacy, groupId: privacy === 'group' ? selectedGroup : null },
      });
      showToast('Wave updated', 'success');
      onUpdate();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update wave', 'error');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-teal)40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size="1.1rem">Wave Settings</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
          }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PRIVACY LEVEL</div>
          {Object.entries(PRIVACY_LEVELS).map(([key, config]) => (
            <button key={key} onClick={() => { setPrivacy(key); if (key !== 'group') setSelectedGroup(null); }}
              style={{
                width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left',
                background: privacy === key ? config.bgColor : 'var(--bg-elevated)',
                border: `1px solid ${privacy === key ? config.color : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: config.color, fontSize: '1.1rem' }}>{config.icon}</span>
                <div>
                  <div style={{ color: config.color }}>{config.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{config.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {privacy === 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>SELECT CREW</div>
            {groups.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '10px', background: 'var(--bg-elevated)' }}>No crews available</div>
            ) : groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
                width: '100%', padding: '10px', marginBottom: '4px', textAlign: 'left',
                background: selectedGroup === g.id ? 'var(--accent-amber)15' : 'var(--bg-elevated)',
                border: `1px solid ${selectedGroup === g.id ? 'var(--accent-amber)' : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
                <div style={{ color: 'var(--text-primary)' }}>{g.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{g.memberCount} members</div>
              </button>
            ))}
          </div>
        )}

        {/* Participants Section */}
        {participants.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PARTICIPANTS ({participants.length})</div>
            <button
              onClick={() => { setShowParticipants(!showParticipants); onClose(); }}
              style={{
                width: '100%', padding: '12px', textAlign: 'left',
                background: showParticipants ? 'var(--accent-green)15' : 'var(--bg-elevated)',
                border: `1px solid ${showParticipants ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                color: showParticipants ? 'var(--accent-green)' : 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {showParticipants ? '✓ Participants panel visible' : 'Show participants panel'}
            </button>
          </div>
        )}

        {/* Federation Section */}
        {federationEnabled && wave?.createdBy === currentUserId && wave?.federationState !== 'participant' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>FEDERATION</div>
            <button
              onClick={onFederate}
              style={{
                width: '100%', padding: '12px', textAlign: 'left',
                background: wave?.federationState === 'origin' ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                border: `1px solid ${wave?.federationState === 'origin' ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                color: wave?.federationState === 'origin' ? 'var(--accent-teal)' : 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'monospace',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span>◇</span>
              {wave?.federationState === 'origin' ? 'Manage federated participants' : 'Federate this wave'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleSave} style={{
            flex: 1, padding: '12px', background: 'var(--accent-teal)20',
            border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace',
          }}>SAVE</button>
        </div>
      </div>
    </div>
  );
};

// ============ INVITE TO WAVE MODAL ============
const InviteToWaveModal = ({ isOpen, onClose, wave, contacts, participants, fetchAPI, showToast, isMobile, onParticipantsChange }) => {
  const e2ee = useE2EE();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedUsers([]);
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen || !wave) return null;

  // Get current participant IDs
  const participantIds = participants.map(p => p.id);

  // Filter contacts that are not already participants
  const availableContacts = (contacts || []).filter(c => !participantIds.includes(c.id));

  // Filter by search query
  const filteredContacts = availableContacts.filter(c => {
    const query = searchQuery.toLowerCase();
    return (c.displayName || c.name || '').toLowerCase().includes(query) ||
           (c.handle || '').toLowerCase().includes(query);
  });

  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleInvite = async () => {
    if (selectedUsers.length === 0) {
      showToast('Select at least one user to invite', 'error');
      return;
    }

    setLoading(true);
    let successCount = 0;
    let errors = [];

    for (const userId of selectedUsers) {
      try {
        // Add participant to wave
        await fetchAPI(`/waves/${wave.id}/participants`, {
          method: 'POST',
          body: { userId }
        });

        // If wave is encrypted, distribute wave key to new participant
        if (wave.encrypted && e2ee.isUnlocked) {
          try {
            await e2ee.distributeKeyToParticipant(wave.id, userId);
          } catch (keyErr) {
            console.error('Failed to distribute E2EE key:', keyErr);
            // Don't fail the whole operation, just warn
            showToast(`Added ${availableContacts.find(c => c.id === userId)?.displayName || 'user'} but E2EE key distribution failed`, 'warning');
          }
        }

        successCount++;
      } catch (err) {
        const user = availableContacts.find(c => c.id === userId);
        errors.push(`${user?.displayName || user?.name || userId}: ${err.message}`);
      }
    }

    setLoading(false);

    if (successCount > 0) {
      showToast(`Added ${successCount} participant${successCount > 1 ? 's' : ''} to wave`, 'success');
      if (onParticipantsChange) onParticipantsChange();
      onClose();
    }
    if (errors.length > 0) {
      showToast(errors.join(', '), 'error');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-teal)40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size="1.1rem">Invite to Wave</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
          {filteredContacts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
              {availableContacts.length === 0 ? 'All contacts are already participants' : 'No matching contacts'}
            </div>
          ) : (
            filteredContacts.map(contact => (
              <div
                key={contact.id}
                onClick={() => toggleUser(contact.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  cursor: 'pointer',
                  background: selectedUsers.includes(contact.id) ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                  border: `1px solid ${selectedUsers.includes(contact.id) ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                  marginBottom: '4px',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(contact.id)}
                  onChange={() => toggleUser(contact.id)}
                  style={{ accentColor: 'var(--accent-teal)' }}
                />
                <Avatar letter={(contact.displayName || contact.name)?.[0] || '?'} color="var(--accent-teal)" size={28} imageUrl={contact.avatarUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {contact.displayName || contact.name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    @{contact.handle}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} disabled={loading} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid var(--border-primary)', color: 'var(--text-dim)',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
            opacity: loading ? 0.5 : 1,
          }}>CANCEL</button>
          <button onClick={handleInvite} disabled={loading || selectedUsers.length === 0} style={{
            flex: 1, padding: '12px', background: 'var(--accent-teal)20',
            border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)',
            cursor: (loading || selectedUsers.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            opacity: (loading || selectedUsers.length === 0) ? 0.5 : 1,
          }}>
            {loading ? 'ADDING...' : `INVITE ${selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ SEARCH MODAL ============
const SearchModal = ({ onClose, fetchAPI, showToast, onSelectMessage, isMobile }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) {
      showToast('Search query must be at least 2 characters', 'error');
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const data = await fetchAPI(`/search?q=${encodeURIComponent(searchQuery)}`);
      setResults(data.results || []);
    } catch (err) {
      showToast(err.message || 'Search failed', 'error');
    }
    setSearching(false);
  };

  const highlightMatch = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} style={{ background: 'var(--accent-amber)40', color: 'var(--accent-amber)', fontWeight: 'bold' }}>{part}</span>
        : part
    );
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: isMobile ? '20px' : '40px',
      overflowY: 'auto',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-teal)',
        padding: isMobile ? '20px' : '24px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--accent-teal)', margin: 0, fontSize: isMobile ? '1.2rem' : '1.5rem' }}>SEARCH MESSAGES</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.5rem',
            minHeight: isMobile ? '44px' : 'auto', minWidth: isMobile ? '44px' : 'auto',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search pings..."
            style={{
              flex: 1,
              padding: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: isMobile ? '1rem' : '0.9rem',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            style={{
              padding: isMobile ? '14px 20px' : '12px 24px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-teal)20',
              border: '1px solid var(--accent-teal)',
              color: 'var(--accent-teal)',
              cursor: searching ? 'wait' : 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {searching ? 'SEARCHING...' : 'SEARCH'}
          </button>
        </div>

        {hasSearched && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '16px' }}>
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.map(result => (
            <div
              key={result.id}
              onClick={() => onSelectMessage(result)}
              style={{
                padding: isMobile ? '14px' : '12px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-teal)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--accent-teal)' }}>{result.waveName}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {new Date(result.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '4px' }}>
                {result.authorName}
              </div>
              {result.snippet ? (
                <div
                  style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.95rem' : '0.9rem', lineHeight: '1.5' }}
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              ) : (
                <div style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.95rem' : '0.9rem', lineHeight: '1.5' }}>
                  {highlightMatch(result.content, searchQuery)}
                </div>
              )}
            </div>
          ))}
        </div>

        {hasSearched && results.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 20px' }}>
            No pings found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

// ============ WAVE VIEW (Mobile Responsive) ============
const WaveView = ({ wave, onBack, fetchAPI, showToast, currentUser, groups, onWaveUpdate, isMobile, sendWSMessage, typingUsers, reloadTrigger, contacts, contactRequests, sentContactRequests, onRequestsChange, onContactsChange, blockedUsers, mutedUsers, onBlockUser, onUnblockUser, onMuteUser, onUnmuteUser, onBlockedMutedChange, onShowProfile, onFocusDroplet, onNavigateToWave, scrollToDropletId, onScrollToDropletComplete, federationEnabled }) => {
  // E2EE context
  const e2ee = useE2EE();

  const [waveData, setWaveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    // Load collapsed state from localStorage per wave
    try {
      const saved = localStorage.getItem(`farhold_collapsed_${wave.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifSearch, setShowGifSearch] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [requestModalParticipant, setRequestModalParticipant] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { type, targetId, targetPreview }
  const [rippleTarget, setRippleTarget] = useState(null); // droplet to ripple
  const [showFederateModal, setShowFederateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [unreadCountsByWave, setUnreadCountsByWave] = useState({}); // For ripple activity badges
  const [decryptionErrors, setDecryptionErrors] = useState({}); // Track droplets that failed to decrypt

  // E2EE Migration state
  const [encryptionStatus, setEncryptionStatus] = useState(null); // { state, progress, participantsWithE2EE, totalParticipants }
  const [isEnablingEncryption, setIsEnablingEncryption] = useState(false);
  const [isEncryptingBatch, setIsEncryptingBatch] = useState(false);

  const playbackRef = useRef(null);
  const fileInputRef = useRef(null);

  // Helper functions for participant contact status
  const isContact = (userId) => contacts?.some(c => c.id === userId) || false;
  const hasSentRequestTo = (userId) => sentContactRequests?.some(r => r.to_user_id === userId) || false;
  const hasReceivedRequestFrom = (userId) => contactRequests?.some(r => r.from_user_id === userId) || false;

  // Helper functions for blocked/muted status
  const isBlocked = (userId) => blockedUsers?.some(u => u.blockedUserId === userId) || false;
  const isMuted = (userId) => mutedUsers?.some(u => u.mutedUserId === userId) || false;

  // E2EE: Helper to decrypt droplets
  const decryptDroplets = useCallback(async (droplets, waveId) => {
    if (!e2ee.isUnlocked) return droplets;

    const errors = {};
    const decrypted = await Promise.all(
      droplets.map(async (droplet) => {
        if (!droplet.encrypted || !droplet.nonce) {
          return droplet; // Not encrypted
        }
        try {
          const plaintext = await e2ee.decryptDroplet(
            droplet.content,
            droplet.nonce,
            waveId,
            droplet.keyVersion
          );
          return { ...droplet, content: plaintext, _decrypted: true };
        } catch (err) {
          console.error('Failed to decrypt droplet:', droplet.id, err);
          errors[droplet.id] = err.message;
          return { ...droplet, content: '[Unable to decrypt]', _decryptError: true };
        }
      })
    );
    setDecryptionErrors(prev => ({ ...prev, ...errors }));
    return decrypted;
  }, [e2ee]);

  // E2EE: Helper to decrypt a tree of droplets recursively
  const decryptDropletTree = useCallback(async (tree, waveId) => {
    const decryptNode = async (node) => {
      const decrypted = await decryptDroplets([node], waveId);
      const result = decrypted[0];
      if (result.children && result.children.length > 0) {
        result.children = await Promise.all(result.children.map(child => decryptNode(child)));
      }
      return result;
    };
    return Promise.all(tree.map(node => decryptNode(node)));
  }, [decryptDroplets]);

  // State for showing moderation menu
  const [showModMenu, setShowModMenu] = useState(null); // participant.id or null

  const handleToggleBlock = async (participant) => {
    const wasBlocked = isBlocked(participant.id);
    const success = wasBlocked
      ? await onUnblockUser(participant.id)
      : await onBlockUser(participant.id);
    if (success) {
      showToast(wasBlocked ? `Unblocked ${participant.name}` : `Blocked ${participant.name}`, 'success');
      onBlockedMutedChange?.();
      // Reload wave to show/hide blocked user's droplets
      loadWave(true);
    } else {
      showToast(`Failed to ${wasBlocked ? 'unblock' : 'block'} user`, 'error');
    }
    setShowModMenu(null);
  };

  const handleToggleMute = async (participant) => {
    const wasMuted = isMuted(participant.id);
    const success = wasMuted
      ? await onUnmuteUser(participant.id)
      : await onMuteUser(participant.id);
    if (success) {
      showToast(wasMuted ? `Unmuted ${participant.name}` : `Muted ${participant.name}`, 'success');
      onBlockedMutedChange?.();
      // Reload wave to show/hide muted user's droplets
      loadWave(true);
    } else {
      showToast(`Failed to ${wasMuted ? 'unmute' : 'mute'} user`, 'error');
    }
    setShowModMenu(null);
  };

  const handleQuickSendRequest = async (participant) => {
    try {
      await fetchAPI('/contacts/request', {
        method: 'POST',
        body: { toUserId: participant.id }
      });
      showToast(`Contact request sent to ${participant.name}`, 'success');
      onRequestsChange?.();
    } catch (err) {
      showToast(err.message || 'Failed to send request', 'error');
    }
  };

  const handleAcceptRequest = async (participant) => {
    const request = contactRequests?.find(r => r.from_user_id === participant.id);
    if (!request) return;
    try {
      await fetchAPI(`/contacts/requests/${request.id}/accept`, { method: 'POST' });
      showToast(`${participant.name} is now a contact!`, 'success');
      onRequestsChange?.();
      onContactsChange?.();
    } catch (err) {
      showToast(err.message || 'Failed to accept request', 'error');
    }
  };

  // Thread collapse/expand functions with localStorage persistence
  const toggleThreadCollapse = (messageId) => {
    setCollapsed(prev => {
      const next = { ...prev, [messageId]: !prev[messageId] };
      // Persist to localStorage
      try {
        localStorage.setItem(`farhold_collapsed_${wave.id}`, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save collapse state:', e);
      }
      return next;
    });
  };

  const collapseAllThreads = () => {
    // Get all droplets with children and collapse them
    const newCollapsed = {};
    const countThreads = (msgs) => {
      msgs.forEach(msg => {
        if (msg.children && msg.children.length > 0) {
          newCollapsed[msg.id] = true;
          countThreads(msg.children);
        }
      });
    };
    countThreads(waveData?.messages || []);
    setCollapsed(newCollapsed);
    try {
      localStorage.setItem(`farhold_collapsed_${wave.id}`, JSON.stringify(newCollapsed));
    } catch (e) {
      console.error('Failed to save collapse state:', e);
    }
    showToast('All threads collapsed', 'success');
  };

  const expandAllThreads = () => {
    setCollapsed({});
    try {
      localStorage.setItem(`farhold_collapsed_${wave.id}`, JSON.stringify({}));
    } catch (e) {
      console.error('Failed to save collapse state:', e);
    }
    showToast('All threads expanded', 'success');
  };

  // Share droplet to external platforms
  const handleShareDroplet = async (droplet) => {
    const shareUrl = `${window.location.origin}/share/${droplet.id}`;
    const shareTitle = wave?.title || waveData?.title || 'Farhold';
    const shareText = `Check out this conversation on Farhold`;

    // Try native Web Share API first (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        showToast('Shared successfully', 'success');
        return;
      } catch (err) {
        // User cancelled or share failed - fall through to clipboard
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard', 'success');
    } catch (err) {
      // Final fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Link copied to clipboard', 'success');
    }
  };

  const composeRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const hasMarkedAsReadRef = useRef(false);
  const scrollPositionToRestore = useRef(null);
  const lastTypingSentRef = useRef(null);
  const hasScrolledToUnreadRef = useRef(false);
  const userActionInProgressRef = useRef(false); // Suppress WebSocket reloads during user actions

  useEffect(() => {
    loadWave();
    hasMarkedAsReadRef.current = false; // Reset when switching waves
    hasScrolledToUnreadRef.current = false; // Reset scroll-to-unread for new wave

    // Notify server that user is viewing this wave (for notification suppression)
    if (sendWSMessage) {
      sendWSMessage({ type: 'viewing_wave', waveId: wave.id });
    }

    // Cleanup: notify server when leaving wave
    return () => {
      if (sendWSMessage) {
        sendWSMessage({ type: 'viewing_wave', waveId: null });
      }
    };
  }, [wave.id, sendWSMessage]);

  // Reload wave when reloadTrigger changes (from WebSocket events)
  useEffect(() => {
    if (reloadTrigger > 0) {
      // Skip WebSocket-triggered reloads when a user action (send/edit/delete) is in progress
      // The user action will handle its own reload and scroll restoration
      if (userActionInProgressRef.current) {
        return;
      }
      // Only save scroll position if not already pending restoration
      // (prevents overwriting correct position during race conditions)
      if (messagesRef.current && scrollPositionToRestore.current === null) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }
      loadWave(true);
    }
  }, [reloadTrigger]);

  // Restore scroll position after wave data updates (for click-to-read and similar actions)
  // Use useLayoutEffect to restore scroll synchronously before browser paint
  useLayoutEffect(() => {
    if (scrollPositionToRestore.current !== null && messagesRef.current) {
      messagesRef.current.scrollTop = scrollPositionToRestore.current;
      scrollPositionToRestore.current = null;
    }
  }, [waveData]);

  // Scroll to first unread message or bottom on initial wave load
  useEffect(() => {
    // Skip if: no data, no container, already scrolled, still loading, pending scroll restoration, OR navigating to specific droplet
    if (!waveData || !messagesRef.current || hasScrolledToUnreadRef.current || loading || scrollPositionToRestore.current !== null || scrollToDropletId) return;

    // Only run once per wave
    hasScrolledToUnreadRef.current = true;

    const allDroplets = waveData.all_messages || [];

    // Find first unread droplet (not authored by current user)
    const firstUnreadDroplet = allDroplets.find(m =>
      m.is_unread && m.author_id !== currentUser?.id
    );

    setTimeout(() => {
      const container = messagesRef.current;
      if (!container) return;

      if (firstUnreadDroplet) {
        // Scroll to first unread droplet
        const dropletElement = container.querySelector(`[data-message-id="${firstUnreadDroplet.id}"]`);
        if (dropletElement) {
          dropletElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      // No unread droplets or element not found - scroll to bottom
      container.scrollTop = container.scrollHeight;
    }, 100);
  }, [waveData, loading, currentUser?.id]);

  // Scroll to specific droplet when navigating from notification
  useEffect(() => {
    if (!scrollToDropletId || !waveData || loading) return;

    // Wait for render to complete
    const scrollToTarget = () => {
      const element = document.querySelector(`[data-message-id="${scrollToDropletId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight effect
        element.style.transition = 'background-color 0.3s, outline 0.3s';
        element.style.backgroundColor = 'var(--accent-amber)20';
        element.style.outline = '2px solid var(--accent-amber)';
        setTimeout(() => {
          element.style.backgroundColor = '';
          element.style.outline = '';
        }, 1500);
        // Clear the target
        onScrollToDropletComplete?.();
      } else {
        // Droplet not in DOM - might be in "load more" section
        // Try again after a short delay in case of slow render
        setTimeout(() => {
          const retryElement = document.querySelector(`[data-message-id="${scrollToDropletId}"]`);
          if (retryElement) {
            retryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            retryElement.style.transition = 'background-color 0.3s, outline 0.3s';
            retryElement.style.backgroundColor = 'var(--accent-amber)20';
            retryElement.style.outline = '2px solid var(--accent-amber)';
            setTimeout(() => {
              retryElement.style.backgroundColor = '';
              retryElement.style.outline = '';
            }, 1500);
          }
          onScrollToDropletComplete?.();
        }, 300);
      }
    };

    // Delay to allow React to render the messages
    setTimeout(scrollToTarget, 100);
  }, [scrollToDropletId, waveData, loading, onScrollToDropletComplete]);

  // Mark wave as read when user scrolls to bottom or views unread messages
  useEffect(() => {
    if (!waveData || !messagesRef.current || hasMarkedAsReadRef.current) return;

    const markAsRead = () => {
      if (hasMarkedAsReadRef.current) return; // Prevent duplicate calls
      hasMarkedAsReadRef.current = true;

      console.log(`📖 Marking wave ${wave.id} as read...`);
      fetchAPI(`/waves/${wave.id}/read`, { method: 'POST' })
        .then(() => {
          console.log(`✅ Wave ${wave.id} marked as read, refreshing wave list`);
          onWaveUpdate?.();
        })
        .catch((err) => {
          console.error(`❌ Failed to mark wave ${wave.id} as read:`, err);
          hasMarkedAsReadRef.current = false; // Allow retry on error
        });
    };

    // Check if user has scrolled to bottom
    const handleScroll = () => {
      const container = messagesRef.current;
      if (!container || hasMarkedAsReadRef.current) return;

      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      if (isAtBottom) {
        markAsRead();
      }
    };

    const container = messagesRef.current;
    container.addEventListener('scroll', handleScroll);

    // Also mark as read if already at bottom on load
    const checkInitialPosition = () => {
      if (hasMarkedAsReadRef.current) return;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      if (isAtBottom) {
        markAsRead();
      }
    };
    setTimeout(checkInitialPosition, 500);

    return () => container.removeEventListener('scroll', handleScroll);
  }, [waveData, wave.id, fetchAPI, onWaveUpdate]);

  useEffect(() => {
    if (isPlaying && waveData && waveData.all_messages) {
      const total = waveData.all_messages.length;
      playbackRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          const next = (prev ?? -1) + 1;
          if (next >= total) { setIsPlaying(false); return total - 1; }
          return next;
        });
      }, 1500 / playbackSpeed);
    }
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [isPlaying, playbackSpeed, waveData]);

  // Scroll to current playback message when playbackIndex changes
  useEffect(() => {
    if (playbackIndex === null || !waveData?.all_messages || !messagesRef.current) return;

    // Find the message with the current playback index
    const findMessageByIndex = (messages, targetIndex) => {
      for (const msg of messages) {
        if (msg._index === targetIndex) return msg;
        if (msg.children) {
          const found = findMessageByIndex(msg.children, targetIndex);
          if (found) return found;
        }
      }
      return null;
    };

    const currentMessage = findMessageByIndex(waveData.messages || [], playbackIndex);
    if (currentMessage) {
      // Use setTimeout to ensure React has re-rendered and the element is in the DOM
      // This is needed because the element only appears when playbackIndex >= its _index
      setTimeout(() => {
        const container = messagesRef.current;
        const element = container?.querySelector(`[data-message-id="${currentMessage.id}"]`);
        if (element && container) {
          // Calculate element's position relative to the scroll container
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();

          // Current scroll position + element's visual offset from container top
          // minus half the container height to center it
          const elementVisualTop = elementRect.top - containerRect.top;
          const targetScrollTop = container.scrollTop + elementVisualTop - (containerRect.height / 2) + (elementRect.height / 2);

          // Scroll to the target position (instant for reliability, highlight provides visual feedback)
          container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'auto'
          });

          // Brief highlight effect to show current playback position
          element.style.transition = 'background-color 0.3s';
          element.style.backgroundColor = 'var(--accent-amber)30';
          element.style.outline = '2px solid var(--accent-amber)';
          setTimeout(() => {
            element.style.backgroundColor = '';
            element.style.outline = '';
          }, 800);
        }
      }, 50);
    }
  }, [playbackIndex, waveData]);

  // Scroll to compose area when replying on mobile
  useEffect(() => {
    if (replyingTo && isMobile && composeRef.current) {
      setTimeout(() => {
        composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [replyingTo, isMobile]);

  // Auto-focus textarea when replying
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          const length = textarea.value.length;
          textarea.setSelectionRange(length, length);
        }
      }, 150);
    }
  }, [replyingTo]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [newMessage]);

  const loadWave = async (isRefresh = false) => {
    // Only show loading spinner on initial load, not on refresh
    // This prevents scroll position from being lost when the container is unmounted
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await fetchAPI(`/waves/${wave.id}`);
      console.log('Wave API response:', data);

      // Ensure required fields exist with defaults
      if (!data.messages) data.messages = [];
      if (!data.all_messages) data.all_messages = [];
      if (!data.participants) data.participants = [];

      // E2EE: Decrypt messages if wave is encrypted and E2EE is unlocked
      if (data.encrypted && e2ee.isUnlocked) {
        try {
          // Decrypt all_messages flat list
          data.all_messages = await decryptDroplets(data.all_messages, wave.id);
          // Decrypt the tree structure
          data.messages = await decryptDropletTree(data.messages, wave.id);
        } catch (decryptErr) {
          console.error('Failed to decrypt wave messages:', decryptErr);
        }
      }

      // Assign chronological indices based on created_at for proper playback order
      // Sort all_messages by created_at and create a map of id -> chronoIndex
      const sortedByTime = [...data.all_messages].sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      );
      const chronoIndexMap = new Map();
      sortedByTime.forEach((m, idx) => chronoIndexMap.set(m.id, idx));

      // Apply chronological indices to the tree structure
      const addIndices = (msgs) => msgs.forEach(m => {
        m._index = chronoIndexMap.get(m.id) ?? 0;
        if (m.children) addIndices(m.children);
      });
      addIndices(data.messages);
      console.log('Wave data loaded:', {
        title: data.title,
        privacy: data.privacy,
        can_edit: data.can_edit,
        createdBy: data.createdBy,
        currentUserId: currentUser?.id,
        totalMessages: data.total_messages,
        hasMoreMessages: data.hasMoreMessages,
        messageCount: data.messages?.length,
        allMessagesCount: data.all_messages?.length,
        encrypted: data.encrypted
      });
      setWaveData(data);
      setHasMoreMessages(data.hasMoreMessages || false);

      // Load unread counts by wave for ripple activity badges
      try {
        const countsData = await fetchAPI('/notifications/by-wave');
        setUnreadCountsByWave(countsData.countsByWave || {});
      } catch (e) {
        console.error('Failed to load unread counts by wave:', e);
      }
    } catch (err) {
      console.error('Failed to load wave:', err);
      showToast('Failed to load wave', 'error');
    }
    if (!isRefresh) {
      setLoading(false);
    }
  };

  // E2EE: Load encryption status for legacy/partial waves
  const loadEncryptionStatus = useCallback(async () => {
    if (!e2ee.isE2EEEnabled || !waveData) return;

    // Only check for legacy (0) or partial (2) waves
    if (waveData.encrypted === 1) {
      setEncryptionStatus(null);
      return;
    }

    try {
      const status = await e2ee.getWaveEncryptionStatus(wave.id);
      setEncryptionStatus(status);
    } catch (err) {
      console.error('Failed to load encryption status:', err);
    }
  }, [e2ee, wave.id, waveData]);

  // Load encryption status when wave data changes
  useEffect(() => {
    if (waveData && e2ee.isE2EEEnabled && waveData.encrypted !== 1) {
      loadEncryptionStatus();
    }
  }, [waveData?.id, waveData?.encrypted, e2ee.isE2EEEnabled, loadEncryptionStatus]);

  // E2EE: Enable encryption for a legacy wave
  const handleEnableEncryption = async () => {
    if (!e2ee.isUnlocked) {
      showToast('Please unlock E2EE first', 'error');
      return;
    }

    setIsEnablingEncryption(true);
    try {
      const participantIds = waveData.participants
        .filter(p => p.id !== currentUser.id)
        .map(p => p.id);

      const result = await e2ee.enableWaveEncryption(wave.id, participantIds);

      if (result.success) {
        showToast('Encryption enabled! Starting migration...', 'success');
        // Refresh encryption status
        await loadEncryptionStatus();
        // Start encrypting first batch
        await handleContinueEncryption();
      }
    } catch (err) {
      console.error('Failed to enable encryption:', err);
      showToast(err.message || 'Failed to enable encryption', 'error');
    } finally {
      setIsEnablingEncryption(false);
    }
  };

  // E2EE: Continue encrypting droplets in batches
  const handleContinueEncryption = async () => {
    if (!e2ee.isUnlocked || isEncryptingBatch) return;

    setIsEncryptingBatch(true);
    try {
      let hasMore = true;
      let totalEncrypted = 0;

      // Process batches until done or error
      while (hasMore) {
        const result = await e2ee.encryptLegacyWaveBatch(wave.id, 50);
        totalEncrypted += result.encrypted;
        hasMore = result.hasMore;

        // Update progress
        setEncryptionStatus(prev => ({
          ...prev,
          progress: result.progress,
          encryptionState: result.encryptionState
        }));

        // Small delay between batches to avoid overwhelming
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (totalEncrypted > 0) {
        showToast(`Encrypted ${totalEncrypted} pings`, 'success');
      }

      // Refresh wave data to show encrypted content
      await loadWave(true);
      await loadEncryptionStatus();
    } catch (err) {
      console.error('Failed to encrypt batch:', err);
      showToast(err.message || 'Failed to encrypt pings', 'error');
    } finally {
      setIsEncryptingBatch(false);
    }
  };

  // Load older messages (pagination)
  const loadMoreMessages = async () => {
    if (loadingMore || !waveData?.all_messages?.length) return;

    setLoadingMore(true);
    try {
      // Get the oldest message ID from current set
      const oldestMessage = waveData.all_messages[0]; // First message is oldest (sorted by created_at)
      const data = await fetchAPI(`/waves/${wave.id}/messages?limit=50&before=${oldestMessage.id}`);

      if (data.messages.length > 0) {
        // Save scroll position before adding messages
        const container = messagesRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;

        // E2EE: Decrypt new messages if wave is encrypted
        let decryptedMessages = data.messages;
        if (waveData?.encrypted && e2ee.isUnlocked) {
          try {
            decryptedMessages = await decryptDroplets(data.messages, wave.id);
          } catch (decryptErr) {
            console.error('Failed to decrypt older messages:', decryptErr);
          }
        }

        // Merge older messages with existing ones
        const mergedMessages = [...decryptedMessages, ...waveData.all_messages];

        // Rebuild the message tree - treat orphaned replies (parent not in set) as roots
        const messageIds = new Set(mergedMessages.map(m => m.id));
        function buildMessageTree(messages, parentId = null) {
          return messages
            .filter(m => {
              if (parentId === null) {
                // Root level: include messages with no parent OR whose parent isn't loaded
                return m.parent_id === null || !messageIds.has(m.parent_id);
              }
              return m.parent_id === parentId;
            })
            .map(m => ({ ...m, children: buildMessageTree(messages, m.id) }));
        }

        const tree = buildMessageTree(mergedMessages);

        // Assign chronological indices based on created_at for proper playback order
        const sortedByTime = [...mergedMessages].sort((a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
        );
        const chronoIndexMap = new Map();
        sortedByTime.forEach((m, idx) => chronoIndexMap.set(m.id, idx));

        const addIndices = (msgs) => msgs.forEach(m => {
          m._index = chronoIndexMap.get(m.id) ?? 0;
          if (m.children) addIndices(m.children);
        });
        addIndices(tree);

        setWaveData(prev => ({
          ...prev,
          messages: tree,
          all_messages: mergedMessages,
        }));
        setHasMoreMessages(data.hasMore);

        // Restore scroll position after DOM updates
        setTimeout(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            container.scrollTop = scrollHeightAfter - scrollHeightBefore;
          }
        }, 50);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      showToast('Failed to load older pings', 'error');
    }
    setLoadingMore(false);
  };

  // Handle playback toggle - load all messages first if needed
  const handlePlaybackToggle = async () => {
    if (isPlaying) {
      // Stopping playback
      setIsPlaying(false);
      return;
    }

    // Starting playback - load all messages first if there are more
    if (hasMoreMessages) {
      showToast('Loading all pings for playback...', 'info');
      try {
        // Keep loading until we have all messages
        let allMessages = [...(waveData?.all_messages || [])];
        let hasMore = true;

        while (hasMore) {
          const oldestMessage = allMessages.reduce((oldest, m) =>
            new Date(m.created_at) < new Date(oldest.created_at) ? m : oldest
          );
          const data = await fetchAPI(`/waves/${wave.id}/messages?limit=100&before=${oldestMessage.id}`);

          if (data.messages.length > 0) {
            allMessages = [...data.messages, ...allMessages];
            hasMore = data.hasMore;
          } else {
            hasMore = false;
          }
        }

        // Rebuild the tree with all messages
        const messageIds = new Set(allMessages.map(m => m.id));
        function buildMessageTree(messages, parentId = null) {
          return messages
            .filter(m => {
              if (parentId === null) {
                return m.parent_id === null || !messageIds.has(m.parent_id);
              }
              return m.parent_id === parentId;
            })
            .map(m => ({ ...m, children: buildMessageTree(messages, m.id) }));
        }

        const tree = buildMessageTree(allMessages);

        // Assign chronological indices
        const sortedByTime = [...allMessages].sort((a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
        );
        const chronoIndexMap = new Map();
        sortedByTime.forEach((m, idx) => chronoIndexMap.set(m.id, idx));

        const addIndices = (msgs) => msgs.forEach(m => {
          m._index = chronoIndexMap.get(m.id) ?? 0;
          if (m.children) addIndices(m.children);
        });
        addIndices(tree);

        setWaveData(prev => ({
          ...prev,
          messages: tree,
          all_messages: allMessages,
        }));
        setHasMoreMessages(false);
        showToast(`Loaded ${allMessages.length} pings`, 'success');
      } catch (err) {
        showToast('Failed to load all pings for playback', 'error');
        return;
      }
    }

    // Start playback from the beginning
    setPlaybackIndex(0);
    setIsPlaying(true);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    const isReply = replyingTo !== null;

    // Suppress WebSocket-triggered reloads during this operation
    userActionInProgressRef.current = true;

    try {
      // Save scroll position if replying (so we don't jump around)
      if (isReply && messagesRef.current) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }

      // E2EE: Encrypt message if wave is encrypted and E2EE is unlocked
      let messageBody = { wave_id: wave.id, parent_id: replyingTo?.id || null, content: newMessage };

      if (waveData?.encrypted && e2ee.isUnlocked) {
        try {
          const { ciphertext, nonce } = await e2ee.encryptDroplet(newMessage, wave.id);
          const waveKeyVersion = await fetchAPI(`/waves/${wave.id}/key`).then(r => r.keyVersion).catch(() => 1);
          messageBody = {
            ...messageBody,
            content: ciphertext,
            encrypted: true,
            nonce,
            keyVersion: waveKeyVersion || 1
          };
        } catch (encryptErr) {
          console.error('Failed to encrypt message:', encryptErr);
          showToast('Failed to encrypt message', 'error');
          userActionInProgressRef.current = false;
          return;
        }
      }

      await fetchAPI('/pings', {
        method: 'POST',
        body: messageBody,
      });
      setNewMessage('');
      setReplyingTo(null);
      showToast('Ping sent', 'success');
      await loadWave(true);

      // Only scroll to bottom if posting a root message (not a reply)
      if (!isReply) {
        setTimeout(() => {
          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
          // Clear the flag after scroll completes
          userActionInProgressRef.current = false;
        }, 150);
      } else {
        // For replies, clear the flag after scroll restoration has time to complete
        setTimeout(() => {
          userActionInProgressRef.current = false;
        }, 150);
      }
    } catch (err) {
      showToast('Failed to send ping', 'error');
      scrollPositionToRestore.current = null; // Clear on error
      userActionInProgressRef.current = false;
    }
  };

  // Handle image upload for messages
  const handleImageUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Allowed: jpg, png, gif, webp', 'error');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large. Maximum size is 10MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const token = storage.getToken();
      const response = await fetch(`${API_URL}/uploads`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      // Insert the image URL into the message - it will auto-embed when sent
      setNewMessage(prev => prev + (prev ? '\n' : '') + data.url);
      showToast('Image uploaded', 'success');
      textareaRef.current?.focus();
    } catch (err) {
      showToast(err.message || 'Failed to upload image', 'error');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleArchive = async () => {
    try {
      await fetchAPI(`/waves/${wave.id}/archive`, {
        method: 'POST',
        body: { archived: !waveData?.is_archived },
      });
      showToast(waveData?.is_archived ? 'Wave restored' : 'Wave archived', 'success');
      onWaveUpdate?.();
      onBack();
    } catch (err) {
      showToast('Failed to archive wave', 'error');
    }
  };

  const handleDeleteWave = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteWave = async () => {
    try {
      await fetchAPI(`/waves/${wave.id}`, { method: 'DELETE' });
      showToast('Wave deleted', 'success');
      onBack();
      onWaveUpdate?.();
    } catch (err) {
      showToast(err.message || 'Failed to delete wave', 'error');
    }
  };

  const handleDeleteMessage = (message) => {
    setMessageToDelete(message);
  };

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    // Strip HTML tags to get plain text for editing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = message.content;
    setEditContent(tempDiv.textContent || tempDiv.innerText || '');
  };

  const handleSaveEdit = async (messageId) => {
    if (!editContent.trim()) {
      showToast('Ping cannot be empty', 'error');
      return;
    }

    // Suppress WebSocket-triggered reloads and preserve scroll
    userActionInProgressRef.current = true;
    if (messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    try {
      await fetchAPI(`/pings/${messageId}`, {
        method: 'PUT',
        body: { content: editContent },
      });
      showToast('Ping updated', 'success');
      setEditingMessageId(null);
      setEditContent('');
      await loadWave(true);
      // Clear flag after scroll restoration has time to complete
      setTimeout(() => {
        userActionInProgressRef.current = false;
      }, 150);
    } catch (err) {
      showToast(err.message || 'Failed to update ping', 'error');
      scrollPositionToRestore.current = null;
      userActionInProgressRef.current = false;
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleReaction = async (messageId, emoji) => {
    // Suppress WebSocket-triggered reloads and preserve scroll
    userActionInProgressRef.current = true;
    if (messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    try {
      await fetchAPI(`/pings/${messageId}/react`, {
        method: 'POST',
        body: { emoji },
      });
      // Reload wave data immediately to show the reaction
      await loadWave(true);
      // Clear flag after scroll restoration has time to complete
      setTimeout(() => {
        userActionInProgressRef.current = false;
      }, 150);
    } catch (err) {
      showToast(err.message || 'Failed to add reaction', 'error');
      scrollPositionToRestore.current = null;
      userActionInProgressRef.current = false;
    }
  };

  const handleReportMessage = (message) => {
    // Extract preview text from message content (strip HTML tags)
    const textContent = message.content?.replace(/<[^>]*>/g, '').slice(0, 100) || '';
    setReportTarget({
      type: 'droplet',
      targetId: message.id,
      targetPreview: `${message.sender_name}: ${textContent}${message.content?.length > 100 ? '...' : ''}`,
    });
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    // Suppress WebSocket-triggered reloads and preserve scroll
    userActionInProgressRef.current = true;
    if (messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    try {
      await fetchAPI(`/pings/${messageToDelete.id}`, { method: 'DELETE' });
      showToast('Ping deleted', 'success');
      await loadWave(true);
      // Clear flag after scroll restoration has time to complete
      setTimeout(() => {
        userActionInProgressRef.current = false;
      }, 150);
    } catch (err) {
      showToast(err.message || 'Failed to delete ping', 'error');
      scrollPositionToRestore.current = null;
      userActionInProgressRef.current = false;
    }
  };

  const handleMessageClick = async (messageId) => {
    // Suppress WebSocket-triggered reloads and preserve scroll
    userActionInProgressRef.current = true;
    if (messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    try {
      console.log(`📖 Marking droplet ${messageId} as read...`);
      await fetchAPI(`/pings/${messageId}/read`, { method: 'POST' });
      // Reload wave to update unread status
      await loadWave(true);
      // Also refresh wave list to update unread counts
      console.log('📋 Calling onWaveUpdate to refresh wave list...', { onWaveUpdate: typeof onWaveUpdate });
      if (onWaveUpdate) {
        onWaveUpdate();
      } else {
        console.warn('⚠️ onWaveUpdate is not defined!');
      }
      // Clear flag after scroll restoration has time to complete
      setTimeout(() => {
        userActionInProgressRef.current = false;
      }, 150);
    } catch (err) {
      console.error(`❌ Failed to mark droplet ${messageId} as read:`, err);
      showToast('Failed to mark ping as read', 'error');
      scrollPositionToRestore.current = null;
      userActionInProgressRef.current = false;
    }
  };

  const handleTyping = () => {
    if (!newMessage.trim() || !sendWSMessage) return;
    const now = Date.now();
    // Throttle: Send typing event max once every 2 seconds
    if (!lastTypingSentRef.current || now - lastTypingSentRef.current > 2000) {
      sendWSMessage({
        type: 'user_typing',
        waveId: wave.id
      });
      lastTypingSentRef.current = now;
    }
  };

  const config = PRIVACY_LEVELS[wave.privacy] || PRIVACY_LEVELS.private;
  if (loading) return <LoadingSpinner />;
  if (!waveData) return <div style={{ padding: '20px', color: 'var(--text-dim)' }}>Wave not found</div>;

  // Safe access with fallbacks for pagination fields
  // Note: API returns `messages` and `all_messages` but we use `droplets` internally (v1.11.0)
  const allDroplets = waveData.all_messages || [];
  const participants = waveData.participants || [];
  const droplets = waveData.messages || [];
  const total = allDroplets.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px' : '16px 20px', background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
        borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-primary)',
          color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.9rem' : '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{waveData.title}</span>
            {waveData.group_name && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({waveData.group_name})</span>}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            {participants.length} participants • {total} pings
          </div>
        </div>
        <PrivacyBadge level={wave.privacy} compact={isMobile} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleArchive}
            title={waveData.is_archived ? 'Restore this wave from archive' : 'Archive this wave'}
            style={{
              padding: isMobile ? '10px 12px' : '6px 10px',
              minHeight: isMobile ? '44px' : 'auto',
              background: waveData.is_archived ? 'var(--accent-teal)20' : 'transparent',
              border: `1px solid ${waveData.is_archived ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
              color: waveData.is_archived ? 'var(--accent-teal)' : 'var(--text-dim)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
            }}
          >{waveData.is_archived ? '📬 RESTORE' : '📦'}</button>
          {/* Settings and Delete buttons only show for wave creator (all privacy levels) */}
          {waveData.can_edit && (
            <>
              <button onClick={() => setShowSettings(true)} style={{
                padding: isMobile ? '10px 12px' : '6px 10px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent', border: '1px solid var(--accent-teal)50',
                color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>⚙</button>
              <button onClick={handleDeleteWave} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-orange)20',
                border: '1px solid var(--accent-orange)',
                color: 'var(--accent-orange)', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>DELETE</button>
            </>
          )}
        </div>
      </div>

      {/* Wave Toolbar - Participants & Playback */}
      {(participants.length > 0 || total > 0) && (
        <div style={{
          padding: isMobile ? '6px 12px' : '6px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          flexShrink: 0
        }}>
          {/* Playback Toggle */}
          {total > 0 && (
            <button
              onClick={() => setShowPlayback(!showPlayback)}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                background: showPlayback ? `${config.color}20` : 'transparent',
                border: `1px solid ${showPlayback ? config.color : 'var(--border-primary)'}`,
                color: showPlayback ? config.color : 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{showPlayback ? '▼' : '▶'}</span>
              PLAYBACK
            </button>
          )}

          {/* Thread Collapse/Expand Toggle */}
          {total > 0 && (
            <button
              onClick={() => {
                const allCollapsed = Object.keys(collapsed).length > 0;
                if (allCollapsed) {
                  expandAllThreads();
                } else {
                  collapseAllThreads();
                }
              }}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
              }}
              title={Object.keys(collapsed).length > 0 ? 'Expand all threads' : 'Collapse all threads'}
            >
              {Object.keys(collapsed).length > 0 ? '▼' : '▶'} ALL
            </button>
          )}

          {/* Mark All Read Button - always visible if unread */}
          {allDroplets.some(m => m.is_unread && m.author_id !== currentUser.id) && (
            <button
              onClick={async () => {
                try {
                  // Use is_unread flag from server for consistency
                  const unreadDroplets = allDroplets
                    .filter(m => m.is_unread && m.author_id !== currentUser.id);
                  if (unreadDroplets.length === 0) return;
                  await Promise.all(unreadDroplets.map(m => fetchAPI(`/pings/${m.id}/read`, { method: 'POST' })));
                  await loadWave(true);
                  onWaveUpdate?.();
                  showToast(`Marked ${unreadDroplets.length} ping${unreadDroplets.length !== 1 ? 's' : ''} as read`, 'success');
                } catch (err) {
                  showToast('Failed to mark pings as read', 'error');
                }
              }}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid var(--accent-amber)',
                color: 'var(--accent-amber)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
              }}
            >
              MARK ALL READ
            </button>
          )}
        </div>
      )}

      {/* Expanded Participants Panel */}
      {showParticipants && participants.length > 0 && (
        <div style={{
          padding: isMobile ? '12px' : '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flexShrink: 0
        }}>
          {/* Header with Invite button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'monospace' }}>
              PARTICIPANTS ({participants.length})
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Invite button - only for private waves by creator, or any wave by participants */}
              {((waveData?.privacy === 'private' && waveData?.createdBy === currentUser?.id) ||
                (waveData?.privacy !== 'private' && participants.some(p => p.id === currentUser?.id))) && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  style={{
                    padding: isMobile ? '6px 10px' : '4px 8px',
                    minHeight: isMobile ? '36px' : 'auto',
                    background: 'var(--accent-teal)20',
                    border: '1px solid var(--accent-teal)',
                    color: 'var(--accent-teal)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                  }}
                >
                  + INVITE
                </button>
              )}
              {/* Leave button for non-creators */}
              {waveData?.createdBy !== currentUser?.id && participants.some(p => p.id === currentUser?.id) && (
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to leave this wave?')) {
                      try {
                        await fetchAPI(`/waves/${wave.id}/participants/${currentUser.id}`, { method: 'DELETE' });
                        showToast('You have left the wave', 'success');
                        onBack();
                      } catch (err) {
                        showToast(err.message || 'Failed to leave wave', 'error');
                      }
                    }
                  }}
                  style={{
                    padding: isMobile ? '6px 10px' : '4px 8px',
                    minHeight: isMobile ? '36px' : 'auto',
                    background: 'var(--accent-orange)20',
                    border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                  }}
                >
                  LEAVE
                </button>
              )}
            </div>
          </div>
          {participants.map(p => {
            const latestDroplet = allDroplets.length > 0 ? allDroplets[allDroplets.length - 1] : null;
            const hasReadLatest = latestDroplet ? (latestDroplet.readBy || [latestDroplet.author_id]).includes(p.id) : true;
            const isCurrentUser = p.id === currentUser?.id;
            const isAlreadyContact = isContact(p.id);
            const hasSentRequest = hasSentRequestTo(p.id);
            const hasReceivedRequest = hasReceivedRequestFrom(p.id);
            const userBlocked = isBlocked(p.id);
            const userMuted = isMuted(p.id);

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  background: userBlocked ? 'var(--accent-orange)10' : 'var(--bg-elevated)',
                  border: `1px solid ${userBlocked ? 'var(--accent-orange)40' : 'var(--border-subtle)'}`,
                }}
              >
                {/* Participant Info */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, cursor: onShowProfile ? 'pointer' : 'default' }}
                  onClick={onShowProfile ? () => onShowProfile(p.id) : undefined}
                  title={onShowProfile ? 'View profile' : undefined}
                >
                  <Avatar letter={p.avatar || p.name?.[0] || '?'} color={isCurrentUser ? 'var(--accent-amber)' : 'var(--accent-teal)'} size={isMobile ? 32 : 28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      color: userBlocked ? 'var(--accent-orange)' : userMuted ? 'var(--text-dim)' : 'var(--text-primary)',
                      fontSize: isMobile ? '0.85rem' : '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                      {isCurrentUser && <span style={{ color: 'var(--accent-amber)', marginLeft: '4px' }}>(you)</span>}
                      {userBlocked && <span style={{ color: 'var(--accent-orange)', marginLeft: '4px', fontSize: '0.65rem' }}>⊘ BLOCKED</span>}
                      {userMuted && !userBlocked && <span style={{ color: 'var(--text-dim)', marginLeft: '4px', fontSize: '0.65rem' }}>🔇 MUTED</span>}
                    </div>
                  </div>
                </div>

                {/* Read Status */}
                <div style={{
                  padding: '2px 6px',
                  background: hasReadLatest ? 'var(--accent-green)20' : 'var(--border-subtle)',
                  border: `1px solid ${hasReadLatest ? 'var(--accent-green)50' : 'var(--border-primary)'}`,
                  fontSize: '0.6rem',
                  color: hasReadLatest ? 'var(--accent-green)' : 'var(--text-dim)',
                  fontFamily: 'monospace',
                }}>
                  {hasReadLatest ? '✓ READ' : '○ UNREAD'}
                </div>

                {/* Contact Action Button */}
                {!isCurrentUser && (
                  <>
                    {isAlreadyContact ? (
                      <span style={{
                        padding: '2px 8px',
                        background: 'var(--accent-green)20',
                        border: '1px solid var(--accent-green)50',
                        fontSize: '0.6rem',
                        color: 'var(--accent-green)',
                        fontFamily: 'monospace',
                      }}>✓ CONTACT</span>
                    ) : hasSentRequest ? (
                      <span style={{
                        padding: '2px 8px',
                        background: 'var(--accent-amber)20',
                        border: '1px solid var(--accent-amber)50',
                        fontSize: '0.6rem',
                        color: 'var(--accent-amber)',
                        fontFamily: 'monospace',
                      }}>PENDING</span>
                    ) : hasReceivedRequest ? (
                      <button
                        onClick={() => handleAcceptRequest(p)}
                        style={{
                          padding: isMobile ? '6px 10px' : '4px 8px',
                          minHeight: isMobile ? '36px' : 'auto',
                          background: 'var(--accent-teal)20',
                          border: '1px solid var(--accent-teal)',
                          color: 'var(--accent-teal)',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.6rem',
                        }}
                      >ACCEPT</button>
                    ) : (
                      <button
                        onClick={() => handleQuickSendRequest(p)}
                        style={{
                          padding: isMobile ? '6px 10px' : '4px 8px',
                          minHeight: isMobile ? '36px' : 'auto',
                          background: 'transparent',
                          border: '1px solid var(--accent-teal)50',
                          color: 'var(--accent-teal)',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.6rem',
                        }}
                      >+ ADD</button>
                    )}
                  </>
                )}

                {/* Moderation Menu Button */}
                {!isCurrentUser && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowModMenu(showModMenu === p.id ? null : p.id)}
                      style={{
                        padding: isMobile ? '6px 8px' : '4px 6px',
                        minHeight: isMobile ? '36px' : 'auto',
                        minWidth: isMobile ? '36px' : 'auto',
                        background: showModMenu === p.id ? 'var(--border-subtle)' : 'transparent',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                      title="Moderation options"
                    >⋮</button>

                    {/* Moderation Dropdown Menu */}
                    {showModMenu === p.id && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-primary)',
                        zIndex: 100,
                        minWidth: '120px',
                      }}>
                        <button
                          onClick={() => handleToggleMute(p)}
                          style={{
                            width: '100%',
                            padding: isMobile ? '12px' : '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid var(--border-subtle)',
                            color: userMuted ? 'var(--accent-green)' : 'var(--text-dim)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            textAlign: 'left',
                          }}
                        >
                          {userMuted ? '🔊 UNMUTE' : '🔇 MUTE'}
                        </button>
                        <button
                          onClick={() => handleToggleBlock(p)}
                          style={{
                            width: '100%',
                            padding: isMobile ? '12px' : '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: waveData?.createdBy === currentUser?.id ? '1px solid var(--border-subtle)' : 'none',
                            color: userBlocked ? 'var(--accent-green)' : 'var(--accent-orange)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            textAlign: 'left',
                          }}
                        >
                          {userBlocked ? '✓ UNBLOCK' : '⊘ BLOCK'}
                        </button>
                        {/* Remove from wave - only for wave creator */}
                        {waveData?.createdBy === currentUser?.id && (
                          <button
                            onClick={async () => {
                              if (confirm(`Remove ${p.name} from this wave?`)) {
                                try {
                                  await fetchAPI(`/waves/${wave.id}/participants/${p.id}`, { method: 'DELETE' });
                                  showToast(`${p.name} removed from wave`, 'success');
                                  setShowModMenu(null);
                                  loadWave(); // Refresh participants
                                } catch (err) {
                                  showToast(err.message || 'Failed to remove participant', 'error');
                                }
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: isMobile ? '12px' : '8px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent-orange)',
                              cursor: 'pointer',
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                              textAlign: 'left',
                            }}
                          >
                            ✕ REMOVE
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Playback Panel */}
      {showPlayback && total > 0 && (
        <PlaybackControls isPlaying={isPlaying} onTogglePlay={handlePlaybackToggle}
          currentIndex={playbackIndex} totalMessages={total} onSeek={setPlaybackIndex}
          onReset={() => { setPlaybackIndex(null); setIsPlaying(false); }}
          playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed} isMobile={isMobile} />
      )}

      {/* Messages */}
      <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '12px' : '20px' }}>
        {/* E2EE: Show encryption status banners */}
        {e2ee.isE2EEEnabled && waveData?.encrypted === 0 && (
          <LegacyWaveNotice
            isCreator={waveData?.createdBy === currentUser?.id}
            onEnableEncryption={e2ee.isUnlocked ? handleEnableEncryption : undefined}
            isEnabling={isEnablingEncryption}
          />
        )}
        {e2ee.isE2EEEnabled && waveData?.encrypted === 2 && encryptionStatus && (
          <PartialEncryptionBanner
            progress={encryptionStatus.progress || 0}
            participantsWithE2EE={encryptionStatus.readyCount || 0}
            totalParticipants={encryptionStatus.totalParticipants || 0}
            onContinue={waveData?.createdBy === currentUser?.id && e2ee.isUnlocked ? handleContinueEncryption : undefined}
            isContinuing={isEncryptingBatch}
          />
        )}
        {/* Load Older Messages Button */}
        {hasMoreMessages && (
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <button
              onClick={loadMoreMessages}
              disabled={loadingMore}
              style={{
                padding: isMobile ? '10px 20px' : '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                color: loadingMore ? 'var(--text-muted)' : 'var(--accent-green)',
                cursor: loadingMore ? 'wait' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}
            >
              {loadingMore ? 'Loading...' : `↑ Load older pings (${(waveData.total_messages || 0) - allDroplets.length} more)`}
            </button>
          </div>
        )}
        {droplets.map((msg) => (
          <Droplet key={msg.id} message={msg} onReply={setReplyingTo} onDelete={handleDeleteMessage}
            onEdit={handleStartEdit} onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
            editingMessageId={editingMessageId} editContent={editContent} setEditContent={setEditContent}
            currentUserId={currentUser?.id} highlightId={replyingTo?.id} playbackIndex={playbackIndex}
            collapsed={collapsed} onToggleCollapse={toggleThreadCollapse} isMobile={isMobile}
            onReact={handleReaction} onMessageClick={handleMessageClick} participants={participants}
            contacts={contacts} onShowProfile={onShowProfile} onReport={handleReportMessage}
            onFocus={onFocusDroplet ? (droplet) => onFocusDroplet(wave.id, droplet) : undefined}
            onRipple={(droplet) => setRippleTarget(droplet)}
            onShare={handleShareDroplet} wave={wave || waveData}
            onNavigateToWave={onNavigateToWave} currentWaveId={wave.id}
            unreadCountsByWave={unreadCountsByWave}
            autoFocusDroplets={currentUser?.preferences?.autoFocusDroplets === true}
            fetchAPI={fetchAPI} />
        ))}
      </div>

      {/* Typing Indicator */}
      {typingUsers && Object.keys(typingUsers).length > 0 && (
        <div style={{
          padding: isMobile ? '8px 12px' : '6px 20px',
          color: 'var(--text-dim)',
          fontSize: isMobile ? '0.85rem' : '0.75rem',
          fontStyle: 'italic',
          borderTop: '1px solid var(--bg-hover)',
          background: 'var(--bg-elevated)',
        }}>
          {Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Compose */}
      <div
        ref={composeRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) {
            handleImageUpload(file);
          }
        }}
        style={{
          flexShrink: 0,
          padding: isMobile ? '12px' : '16px 20px',
          paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : '16px',
          background: dragOver ? 'linear-gradient(0deg, var(--bg-hover), var(--border-subtle))' : 'linear-gradient(0deg, var(--bg-surface), var(--bg-hover))',
          borderTop: dragOver ? '2px dashed var(--accent-orange)' : '1px solid var(--border-subtle)',
          transition: 'all 0.2s ease',
        }}>
        {replyingTo && (
          <div style={{
            padding: isMobile ? '10px 14px' : '8px 12px',
            marginBottom: '10px', background: 'var(--bg-elevated)',
            border: `1px solid ${config.color}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.85rem' : '0.7rem' }}>REPLYING TO </span>
              <span style={{ color: config.color, fontSize: isMobile ? '0.9rem' : '0.75rem' }}>{replyingTo.sender_name}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{
              background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
              minHeight: isMobile ? '44px' : 'auto',
              minWidth: isMobile ? '44px' : 'auto',
              padding: isMobile ? '12px' : '4px',
              fontSize: isMobile ? '1.2rem' : '1rem',
            }}>✕</button>
          </div>
        )}
        {dragOver && (
          <div style={{
            padding: '12px',
            marginBottom: '10px',
            background: 'var(--accent-orange)15',
            border: '2px dashed var(--accent-orange)',
            textAlign: 'center',
            color: 'var(--accent-orange)',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
          }}>
            Drop image to upload
          </div>
        )}
        {/* Textarea - full width with mention picker */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              const value = e.target.value;
              const cursorPos = e.target.selectionStart;
              setNewMessage(value);
              handleTyping();

              // Detect @ mention
              const textBeforeCursor = value.slice(0, cursorPos);
              const atMatch = textBeforeCursor.match(/@(\w*)$/);
              if (atMatch) {
                setShowMentionPicker(true);
                setMentionSearch(atMatch[1].toLowerCase());
                setMentionStartPos(cursorPos - atMatch[0].length);
                setMentionIndex(0);
              } else {
                setShowMentionPicker(false);
                setMentionSearch('');
                setMentionStartPos(null);
              }
            }}
            onKeyDown={(e) => {
              // Handle mention picker navigation
              if (showMentionPicker) {
                const mentionableUsers = [...(contacts || []), ...(participants || [])]
                  .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i) // dedupe
                  .filter(u => u.id !== currentUser?.id)
                  .filter(u => {
                    const name = (u.displayName || u.display_name || u.handle || '').toLowerCase();
                    const handle = (u.handle || '').toLowerCase();
                    return name.includes(mentionSearch) || handle.includes(mentionSearch);
                  })
                  .slice(0, 8);

                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex(i => Math.min(i + 1, mentionableUsers.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(i => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  if (mentionableUsers.length > 0) {
                    e.preventDefault();
                    const user = mentionableUsers[mentionIndex];
                    const handle = user.handle || user.displayName || user.display_name;
                    const before = newMessage.slice(0, mentionStartPos);
                    const after = newMessage.slice(textareaRef.current?.selectionStart || mentionStartPos);
                    setNewMessage(before + '@' + handle + ' ' + after);
                    setShowMentionPicker(false);
                    setMentionSearch('');
                    setMentionStartPos(null);
                    return;
                  }
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowMentionPicker(false);
                  setMentionSearch('');
                  setMentionStartPos(null);
                  return;
                }
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (file) handleImageUpload(file);
                  return;
                }
              }
            }}
            placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}... (Shift+Enter for new line)` : 'Type a ping... (Shift+Enter for new line, @ to mention)'}
            rows={1}
            style={{
              width: '100%',
              padding: isMobile ? '14px 16px' : '12px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              maxHeight: '200px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: isMobile ? '1rem' : '0.9rem',
              fontFamily: 'inherit',
              resize: 'none',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          />
          {/* Mention Picker Dropdown */}
          {showMentionPicker && (() => {
            const mentionableUsers = [...(contacts || []), ...(participants || [])]
              .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
              .filter(u => u.id !== currentUser?.id)
              .filter(u => {
                const name = (u.displayName || u.display_name || u.handle || '').toLowerCase();
                const handle = (u.handle || '').toLowerCase();
                return name.includes(mentionSearch) || handle.includes(mentionSearch);
              })
              .slice(0, 8);

            if (mentionableUsers.length === 0) return null;

            return (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: '4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-primary)',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 20,
              }}>
                {mentionableUsers.map((user, idx) => (
                  <div
                    key={user.id}
                    onClick={() => {
                      const handle = user.handle || user.displayName || user.display_name;
                      const before = newMessage.slice(0, mentionStartPos);
                      const after = newMessage.slice(textareaRef.current?.selectionStart || mentionStartPos);
                      setNewMessage(before + '@' + handle + ' ' + after);
                      setShowMentionPicker(false);
                      setMentionSearch('');
                      setMentionStartPos(null);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      padding: isMobile ? '12px' : '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      background: idx === mentionIndex ? 'var(--bg-hover)' : 'transparent',
                      borderBottom: idx < mentionableUsers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <Avatar
                      letter={(user.displayName || user.display_name || user.handle || '?')[0]}
                      color="var(--accent-teal)"
                      size={24}
                      imageUrl={user.avatarUrl || user.avatar_url}
                    />
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {user.displayName || user.display_name || user.handle}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        @{user.handle}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Button row - below textarea */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
          {/* Left side: media buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{
                padding: isMobile ? '8px 10px' : '8px 10px',
                minHeight: isMobile ? '38px' : '32px',
                background: showEmojiPicker ? 'var(--accent-amber)20' : 'transparent',
                border: `1px solid ${showEmojiPicker ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                color: 'var(--accent-amber)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
                fontWeight: 700,
              }}
              title="Insert Emoji"
            >
              EMO
            </button>
            <button
              onClick={() => setShowGifSearch(true)}
              style={{
                padding: isMobile ? '8px 10px' : '8px 10px',
                minHeight: isMobile ? '38px' : '32px',
                background: showGifSearch ? 'var(--accent-teal)20' : 'transparent',
                border: `1px solid ${showGifSearch ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                color: 'var(--accent-teal)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
                fontWeight: 700,
              }}
              title="Insert GIF"
            >
              GIF
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: isMobile ? '8px 10px' : '8px 10px',
                minHeight: isMobile ? '38px' : '32px',
                background: uploading ? 'var(--accent-orange)20' : 'transparent',
                border: `1px solid ${uploading ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
                color: 'var(--accent-orange)',
                cursor: uploading ? 'wait' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
                fontWeight: 700,
                opacity: uploading ? 0.7 : 1,
              }}
              title="Upload Image"
            >
              {uploading ? '...' : 'IMG'}
            </button>
          </div>
          {/* Spacer */}
          <div style={{ flex: 1 }} />
          {/* Right side: send button */}
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || uploading}
            style={{
              padding: isMobile ? '10px 20px' : '8px 20px',
              minHeight: isMobile ? '38px' : '32px',
              background: newMessage.trim() ? 'var(--accent-amber)20' : 'transparent',
              border: `1px solid ${newMessage.trim() ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
              color: newMessage.trim() ? 'var(--accent-amber)' : 'var(--text-muted)',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}
          >
            SEND
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={(emoji) => {
                setNewMessage(prev => prev + emoji);
                setShowEmojiPicker(false);
              }}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      <WaveSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)}
        wave={waveData} groups={groups} fetchAPI={fetchAPI} showToast={showToast}
        onUpdate={() => { loadWave(true); onWaveUpdate?.(); }}
        participants={participants}
        showParticipants={showParticipants}
        setShowParticipants={setShowParticipants}
        federationEnabled={federationEnabled}
        currentUserId={currentUser?.id}
        onFederate={() => { setShowSettings(false); setShowFederateModal(true); }}
        isMobile={isMobile} />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        waveTitle={waveData.title}
        onConfirm={confirmDeleteWave}
        isMobile={isMobile}
      />

      {messageToDelete && (
        <DeleteConfirmModal
          isOpen={!!messageToDelete}
          onClose={() => setMessageToDelete(null)}
          waveTitle={`message from ${messageToDelete.sender_name}`}
          onConfirm={confirmDeleteMessage}
          isMobile={isMobile}
        />
      )}

      {showGifSearch && (
        <GifSearchModal
          isOpen={showGifSearch}
          onClose={() => setShowGifSearch(false)}
          onSelect={(gifUrl) => {
            setNewMessage(prev => prev + (prev.trim() ? ' ' : '') + gifUrl);
            setShowGifSearch(false);
          }}
          fetchAPI={fetchAPI}
          isMobile={isMobile}
        />
      )}

      {reportTarget && (
        <ReportModal
          isOpen={!!reportTarget}
          onClose={() => setReportTarget(null)}
          type={reportTarget.type}
          targetId={reportTarget.targetId}
          targetPreview={reportTarget.targetPreview}
          fetchAPI={fetchAPI}
          showToast={showToast}
          isMobile={isMobile}
        />
      )}

      {rippleTarget && (
        <RippleModal
          isOpen={!!rippleTarget}
          onClose={() => setRippleTarget(null)}
          droplet={rippleTarget}
          wave={wave}
          participants={waveData?.participants || []}
          fetchAPI={fetchAPI}
          showToast={showToast}
          isMobile={isMobile}
          onSuccess={(newWave) => {
            setRippleTarget(null);
            // Navigate to the new wave
            onNavigateToWave?.(newWave);
          }}
        />
      )}

      <InviteToWaveModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        wave={waveData}
        contacts={contacts}
        participants={participants}
        fetchAPI={fetchAPI}
        showToast={showToast}
        isMobile={isMobile}
        onParticipantsChange={() => loadWave(true)}
      />

      {showFederateModal && waveData && (
        <InviteFederatedModal
          isOpen={showFederateModal}
          onClose={() => setShowFederateModal(false)}
          wave={waveData}
          fetchAPI={fetchAPI}
          showToast={showToast}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

// ============ CONTACT REQUEST COMPONENTS ============
const ContactRequestsPanel = ({ requests, fetchAPI, showToast, onRequestsChange, onContactsChange, isMobile }) => {
  const [processing, setProcessing] = useState({});

  const handleAccept = async (requestId) => {
    setProcessing(prev => ({ ...prev, [requestId]: 'accept' }));
    try {
      await fetchAPI(`/contacts/requests/${requestId}/accept`, { method: 'POST' });
      showToast('Contact request accepted!', 'success');
      onRequestsChange();
      onContactsChange();
    } catch (err) {
      showToast(err.message || 'Failed to accept request', 'error');
    }
    setProcessing(prev => ({ ...prev, [requestId]: null }));
  };

  const handleDecline = async (requestId) => {
    setProcessing(prev => ({ ...prev, [requestId]: 'decline' }));
    try {
      await fetchAPI(`/contacts/requests/${requestId}/decline`, { method: 'POST' });
      showToast('Contact request declined', 'info');
      onRequestsChange();
    } catch (err) {
      showToast(err.message || 'Failed to decline request', 'error');
    }
    setProcessing(prev => ({ ...prev, [requestId]: null }));
  };

  if (requests.length === 0) return null;

  return (
    <div style={{
      marginBottom: '24px', padding: '16px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-teal)40',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ color: 'var(--accent-teal)', fontSize: '1rem' }}>INCOMING REQUESTS</span>
        <span style={{
          background: 'var(--accent-teal)', color: '#000', fontSize: '0.65rem',
          padding: '2px 6px', borderRadius: '10px', fontWeight: 700,
        }}>{requests.length}</span>
      </div>
      {requests.map(request => (
        <div key={request.id} style={{
          padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          marginBottom: '8px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <Avatar letter={request.from_user?.avatar || request.from_user?.displayName?.[0] || '?'} color="var(--accent-teal)" size={isMobile ? 40 : 36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {request.from_user?.displayName || 'Unknown'}
              </div>
              {request.message && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px', fontStyle: 'italic' }}>
                  "{request.message}"
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => handleAccept(request.id)}
              disabled={!!processing[request.id]}
              style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)', cursor: processing[request.id] ? 'wait' : 'pointer',
                fontFamily: 'monospace', fontSize: '0.75rem',
                opacity: processing[request.id] ? 0.6 : 1,
              }}>
              {processing[request.id] === 'accept' ? '...' : 'ACCEPT'}
            </button>
            <button
              onClick={() => handleDecline(request.id)}
              disabled={!!processing[request.id]}
              style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent', border: '1px solid var(--accent-orange)50',
                color: 'var(--accent-orange)', cursor: processing[request.id] ? 'wait' : 'pointer',
                fontFamily: 'monospace', fontSize: '0.75rem',
                opacity: processing[request.id] ? 0.6 : 1,
              }}>
              {processing[request.id] === 'decline' ? '...' : 'DECLINE'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const SentRequestsPanel = ({ requests, fetchAPI, showToast, onRequestsChange, isMobile }) => {
  const [cancelling, setCancelling] = useState({});
  const [expanded, setExpanded] = useState(false);

  const handleCancel = async (requestId) => {
    setCancelling(prev => ({ ...prev, [requestId]: true }));
    try {
      await fetchAPI(`/contacts/requests/${requestId}`, { method: 'DELETE' });
      showToast('Contact request cancelled', 'info');
      onRequestsChange();
    } catch (err) {
      showToast(err.message || 'Failed to cancel request', 'error');
    }
    setCancelling(prev => ({ ...prev, [requestId]: false }));
  };

  if (requests.length === 0) return null;

  return (
    <div style={{
      marginBottom: '24px', padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-amber)40',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 500 }}>PENDING SENT REQUESTS</span>
          <span style={{
            background: 'var(--accent-amber)', color: '#000', fontSize: '0.65rem',
            padding: '2px 6px', borderRadius: '10px', fontWeight: 700,
          }}>{requests.length}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: expanded ? 'var(--accent-amber)20' : 'transparent',
            border: `1px solid ${expanded ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
            color: expanded ? 'var(--accent-amber)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {expanded ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {requests.map(request => (
            <div key={request.id} style={{
              padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              marginBottom: '8px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <Avatar letter={request.to_user?.avatar || request.to_user?.displayName?.[0] || '?'} color="var(--accent-amber)" size={isMobile ? 40 : 36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {request.to_user?.displayName || 'Unknown'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleCancel(request.id)}
                disabled={cancelling[request.id]}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 10px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent', border: '1px solid var(--accent-orange)50',
                  color: 'var(--accent-orange)', cursor: cancelling[request.id] ? 'wait' : 'pointer',
                  fontFamily: 'monospace', fontSize: '0.7rem',
                  opacity: cancelling[request.id] ? 0.6 : 1,
                }}>
                {cancelling[request.id] ? '...' : 'CANCEL'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SendContactRequestModal = ({ isOpen, onClose, toUser, fetchAPI, showToast, onRequestSent, isMobile }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen || !toUser) return null;

  const handleSend = async () => {
    setSending(true);
    try {
      await fetchAPI('/contacts/request', {
        method: 'POST',
        body: { toUserId: toUser.id, message: message.trim() || undefined }
      });
      showToast(`Contact request sent to ${toUser.displayName || toUser.handle}`, 'success');
      onRequestSent();
      setMessage('');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to send request', 'error');
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: isMobile ? '16px' : '0',
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '1px solid var(--accent-teal)', padding: isMobile ? '20px' : '24px',
        width: '100%', maxWidth: '400px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size="1rem">SEND CONTACT REQUEST</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
          }}>×</button>
        </div>

        <div style={{
          padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <Avatar letter={toUser.avatar || toUser.displayName?.[0] || '?'} color="var(--accent-teal)" size={44} />
          <div>
            <div style={{ color: 'var(--text-primary)' }}>{toUser.displayName}</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>
            Message (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to your request..."
            maxLength={200}
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical',
              minHeight: '80px',
            }}
          />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textAlign: 'right', marginTop: '4px' }}>
            {message.length}/200
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: isMobile ? '12px 20px' : '10px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent', border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleSend} disabled={sending} style={{
            padding: isMobile ? '12px 20px' : '10px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)',
            color: 'var(--accent-teal)', cursor: sending ? 'wait' : 'pointer',
            fontFamily: 'monospace', opacity: sending ? 0.6 : 1,
          }}>{sending ? 'SENDING...' : 'SEND REQUEST'}</button>
        </div>
      </div>
    </div>
  );
};

// ============ GROUP INVITATIONS PANEL ============
const GroupInvitationsPanel = ({ invitations, fetchAPI, showToast, onInvitationsChange, onGroupsChange, isMobile }) => {
  const [processing, setProcessing] = useState({});

  const handleAccept = async (invitationId) => {
    setProcessing(prev => ({ ...prev, [invitationId]: 'accept' }));
    try {
      await fetchAPI(`/groups/invitations/${invitationId}/accept`, { method: 'POST' });
      showToast('You joined the crew!', 'success');
      onInvitationsChange();
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to accept invitation', 'error');
    }
    setProcessing(prev => ({ ...prev, [invitationId]: null }));
  };

  const handleDecline = async (invitationId) => {
    setProcessing(prev => ({ ...prev, [invitationId]: 'decline' }));
    try {
      await fetchAPI(`/groups/invitations/${invitationId}/decline`, { method: 'POST' });
      showToast('Crew invitation declined', 'info');
      onInvitationsChange();
    } catch (err) {
      showToast(err.message || 'Failed to decline invitation', 'error');
    }
    setProcessing(prev => ({ ...prev, [invitationId]: null }));
  };

  if (invitations.length === 0) return null;

  return (
    <div style={{
      marginBottom: '16px', padding: '16px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-amber)40',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ color: 'var(--accent-amber)', fontSize: '0.9rem' }}>GROUP INVITATIONS</span>
        <span style={{
          background: 'var(--accent-amber)', color: '#000', fontSize: '0.65rem',
          padding: '2px 6px', borderRadius: '10px', fontWeight: 700,
        }}>{invitations.length}</span>
      </div>
      {invitations.map(invitation => (
        <div key={invitation.id} style={{
          padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          marginBottom: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--accent-amber)', fontSize: '0.95rem', marginBottom: '4px' }}>
                {invitation.group?.name || 'Unknown Crew'}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                Invited by {invitation.invited_by_user?.displayName || 'Someone'}
              </div>
              {invitation.message && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '6px', fontStyle: 'italic' }}>
                  "{invitation.message}"
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => handleAccept(invitation.id)}
                disabled={!!processing[invitation.id]}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 12px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
                  color: 'var(--accent-green)', cursor: processing[invitation.id] ? 'wait' : 'pointer',
                  fontFamily: 'monospace', fontSize: '0.75rem',
                  opacity: processing[invitation.id] ? 0.6 : 1,
                }}>
                {processing[invitation.id] === 'accept' ? '...' : 'JOIN'}
              </button>
              <button
                onClick={() => handleDecline(invitation.id)}
                disabled={!!processing[invitation.id]}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 12px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent', border: '1px solid var(--accent-orange)50',
                  color: 'var(--accent-orange)', cursor: processing[invitation.id] ? 'wait' : 'pointer',
                  fontFamily: 'monospace', fontSize: '0.75rem',
                  opacity: processing[invitation.id] ? 0.6 : 1,
                }}>
                {processing[invitation.id] === 'decline' ? '...' : 'DECLINE'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ INVITE TO GROUP MODAL ============
const InviteToGroupModal = ({ isOpen, onClose, group, contacts, fetchAPI, showToast, isMobile }) => {
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen || !group) return null;

  // Filter contacts that aren't already group members
  const availableContacts = contacts.filter(c => {
    // Check if contact matches search
    const matchesSearch = !searchQuery ||
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const toggleContact = (contactId) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSendInvites = async () => {
    if (selectedContacts.length === 0) return;
    setSending(true);
    try {
      const result = await fetchAPI(`/groups/${group.id}/invite`, {
        method: 'POST',
        body: { userIds: selectedContacts, message: message.trim() || undefined }
      });
      const successCount = result.invitations?.length || 0;
      const errorCount = result.errors?.length || 0;
      if (successCount > 0) {
        showToast(`Sent ${successCount} invitation${successCount > 1 ? 's' : ''}`, 'success');
      }
      if (errorCount > 0) {
        showToast(`${errorCount} invitation${errorCount > 1 ? 's' : ''} failed`, 'error');
      }
      setSelectedContacts([]);
      setMessage('');
      setSearchQuery('');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to send invitations', 'error');
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: isMobile ? '16px' : '0',
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40', padding: isMobile ? '20px' : '24px',
        width: '100%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <GlowText color="var(--accent-amber)" size="1rem">INVITE TO {group.name?.toUpperCase()}</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
          }}>×</button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          style={{
            width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: '12px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />

        <div style={{
          flex: 1, overflowY: 'auto', marginBottom: '16px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
          maxHeight: '250px', minHeight: '150px',
        }}>
          {availableContacts.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {contacts.length === 0 ? 'No contacts to invite' : 'No matching contacts'}
            </div>
          ) : availableContacts.map(contact => {
            const isSelected = selectedContacts.includes(contact.id);
            return (
              <div
                key={contact.id}
                onClick={() => toggleContact(contact.id)}
                style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: isSelected ? 'var(--accent-amber)15' : 'transparent',
                  borderBottom: '1px solid var(--bg-hover)',
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                <div style={{
                  width: '20px', height: '20px', border: `2px solid ${isSelected ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                  background: isSelected ? 'var(--accent-amber)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#000', fontSize: '0.8rem', fontWeight: 'bold',
                }}>
                  {isSelected && '✓'}
                </div>
                <Avatar letter={contact.avatar || contact.name?.[0] || '?'} color={isSelected ? 'var(--accent-amber)' : 'var(--text-dim)'} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {contact.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>
            Message (optional)
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to your invitation..."
            maxLength={200}
            style={{
              width: '100%', padding: '10px', boxSizing: 'border-box',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
            {selectedContacts.length} selected
          </span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{
              padding: isMobile ? '12px 20px' : '10px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'transparent', border: '1px solid var(--border-primary)',
              color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
            }}>CANCEL</button>
            <button
              onClick={handleSendInvites}
              disabled={sending || selectedContacts.length === 0}
              style={{
                padding: isMobile ? '12px 20px' : '10px 16px',
                minHeight: isMobile ? '44px' : 'auto',
                background: selectedContacts.length > 0 ? 'var(--accent-amber)20' : 'transparent',
                border: `1px solid ${selectedContacts.length > 0 ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                color: selectedContacts.length > 0 ? 'var(--accent-amber)' : 'var(--text-muted)',
                cursor: sending || selectedContacts.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace', opacity: sending ? 0.6 : 1,
              }}>
              {sending ? 'SENDING...' : 'SEND INVITES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ FOCUS VIEW (Droplet Deep-Dive) ============
const FocusView = ({
  wave,
  focusStack, // Array of { dropletId, droplet } entries
  onBack, // Go back one level
  onClose, // Return to wave list
  onFocusDeeper, // Focus on a child droplet
  fetchAPI,
  showToast,
  currentUser,
  isMobile,
  sendWSMessage,
  typingUsers,
  reloadTrigger,
  onShowProfile,
  blockedUsers,
  mutedUsers,
  contacts = []
}) => {
  const currentFocus = focusStack[focusStack.length - 1];
  const initialDroplet = currentFocus?.droplet;

  const [replyingTo, setReplyingTo] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [liveDroplet, setLiveDroplet] = useState(initialDroplet); // Live data that updates
  const containerRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const lastTypingSentRef = useRef(null);

  // Swipe-back gesture for mobile navigation
  useSwipeGesture(containerRef, {
    onSwipeRight: isMobile ? () => {
      // Swipe right to go back
      if (focusStack.length > 1) {
        onBack();
      } else {
        onClose();
      }
    } : undefined,
    threshold: 80 // Slightly lower threshold for easier back navigation
  });

  // Update liveDroplet when focus changes
  useEffect(() => {
    setLiveDroplet(initialDroplet);
  }, [initialDroplet?.id]);

  // Function to fetch fresh droplet data
  const fetchFreshData = useCallback(async () => {
    if (!wave?.id || !initialDroplet?.id) return;
    try {
      // Fetch all messages for the wave and find our focused droplet with updated children
      const data = await fetchAPI(`/waves/${wave.id}`);
      if (data.messages) {
        // Build tree and find our droplet
        const findDroplet = (messages, targetId) => {
          for (const msg of messages) {
            if (msg.id === targetId) return msg;
            if (msg.children) {
              const found = findDroplet(msg.children, targetId);
              if (found) return found;
            }
          }
          return null;
        };
        const updated = findDroplet(data.messages, initialDroplet.id);
        if (updated) {
          setLiveDroplet(updated);
        }
      }
    } catch (err) {
      console.error('Failed to refresh focus view:', err);
    }
  }, [wave?.id, initialDroplet?.id, fetchAPI]);

  // Fetch fresh droplet data when reloadTrigger changes
  useEffect(() => {
    if (reloadTrigger > 0) {
      fetchFreshData();
    }
  }, [reloadTrigger, fetchFreshData]);

  // Use liveDroplet for display (falls back to initialDroplet)
  const focusedDroplet = liveDroplet || initialDroplet;

  // Build droplets array from focused droplet and its children
  const focusDroplets = focusedDroplet ? [focusedDroplet] : [];
  const participants = wave?.participants || [];

  // Filter out droplets from blocked/muted users
  const isBlocked = (userId) => blockedUsers?.some(u => u.blockedUserId === userId) || false;
  const isMuted = (userId) => mutedUsers?.some(u => u.mutedUserId === userId) || false;

  const filterDroplets = (msgs) => {
    return msgs.filter(msg => {
      if (isBlocked(msg.author_id) || isMuted(msg.author_id)) return false;
      if (msg.children) {
        msg.children = filterDroplets(msg.children);
      }
      return true;
    });
  };

  const filteredDroplets = filterDroplets([...focusDroplets]);

  const config = PRIVACY_LEVELS[wave?.privacy] || PRIVACY_LEVELS.private;

  // Typing indicator
  const sendTypingIndicator = () => {
    const now = Date.now();
    if (!lastTypingSentRef.current || now - lastTypingSentRef.current > 3000) {
      sendWSMessage?.({
        type: 'typing',
        waveId: wave?.id,
        userId: currentUser?.id,
        userName: currentUser?.displayName || currentUser?.handle
      });
      lastTypingSentRef.current = now;
    }
  };

  // Handle reply - set the target and focus the textarea
  const handleReply = (message) => {
    setReplyingTo(message);
    // Focus the textarea after state updates
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !wave?.id) return;

    try {
      const parentId = replyingTo?.id || focusedDroplet?.id;
      await fetchAPI('/pings', {
        method: 'POST',
        body: { wave_id: wave.id, parent_id: parentId, content: newMessage }
      });
      setNewMessage('');
      setReplyingTo(null);
      showToast('Ping sent', 'success');
      // Immediately refresh to show the new droplet
      fetchFreshData();
    } catch (err) {
      showToast(err.message || 'Failed to send', 'error');
    }
  };

  const handleReaction = async (messageId, emoji) => {
    // Save scroll position before updating
    const scrollTop = messagesRef.current?.scrollTop;
    try {
      await fetchAPI(`/pings/${messageId}/react`, {
        method: 'POST',
        body: { emoji }
      });
      // Refresh data to show reaction
      await fetchFreshData();
      // Restore scroll position
      if (messagesRef.current && scrollTop !== undefined) {
        messagesRef.current.scrollTop = scrollTop;
      }
    } catch (err) {
      showToast('Failed to react', 'error');
    }
  };

  // Mark droplet as read when clicked
  const handleMessageClick = async (messageId) => {
    try {
      await fetchAPI(`/pings/${messageId}/read`, { method: 'POST' });
      // Refresh to update UI
      await fetchFreshData();
    } catch (err) {
      console.error('Failed to mark droplet as read:', err);
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!confirm('Delete this ping?')) return;
    try {
      await fetchAPI(`/pings/${message.id}`, { method: 'DELETE' });
      showToast('Ping deleted', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setEditContent(message.content?.replace(/<[^>]*>/g, '') || '');
  };

  const handleSaveEdit = async (messageId) => {
    try {
      await fetchAPI(`/pings/${messageId}`, {
        method: 'PUT',
        body: { content: editContent }
      });
      setEditingMessageId(null);
      setEditContent('');
      showToast('Ping updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const toggleThreadCollapse = (messageId) => {
    setCollapsed(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  // Share droplet to external platforms
  const handleShareDroplet = async (droplet) => {
    const shareUrl = `${window.location.origin}/share/${droplet.id}`;
    const shareTitle = wave?.title || wave?.name || 'Farhold';
    const shareText = `Check out this conversation on Farhold`;

    // Try native Web Share API first
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        showToast('Shared successfully', 'success');
        return;
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Share failed:', err);
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard', 'success');
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Link copied to clipboard', 'success');
    }
  };

  // Build breadcrumb from focus stack
  const buildBreadcrumb = () => {
    // On mobile, show more compact breadcrumb
    const maxLabelLength = isMobile ? 15 : 30;
    const truncateThreshold = isMobile ? 3 : 4;

    const waveName = wave?.name || wave?.title || 'Wave';
    const items = [
      { label: isMobile ? (waveName.substring(0, 12) + (waveName.length > 12 ? '…' : '')) : waveName, onClick: onClose, isWave: true }
    ];

    focusStack.forEach((item, index) => {
      const rawContent = item.droplet?.content?.replace(/<[^>]*>/g, '') || '';
      const truncatedContent = rawContent.substring(0, maxLabelLength) +
        (rawContent.length > maxLabelLength ? '…' : '');

      if (index < focusStack.length - 1) {
        // Previous items are clickable
        items.push({
          label: truncatedContent || 'Ping',
          onClick: () => {
            // Pop stack back to this level
            for (let i = focusStack.length - 1; i > index; i--) {
              onBack();
            }
          }
        });
      } else {
        // Current item is not clickable
        items.push({ label: truncatedContent || 'Ping', current: true });
      }
    });

    // Truncate middle items based on screen size
    if (items.length > truncateThreshold) {
      const first = items[0];
      const last = items[items.length - 1];
      if (isMobile) {
        // On mobile, just show wave and current
        return [first, { label: '…', ellipsis: true }, last];
      } else {
        const secondLast = items[items.length - 2];
        return [first, { label: '...', ellipsis: true }, secondLast, last];
      }
    }

    return items;
  };

  const breadcrumb = buildBreadcrumb();

  if (!focusedDroplet) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        No ping focused
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Mobile swipe hint - shown briefly on first focus */}
      {isMobile && (
        <div style={{
          padding: '4px 12px',
          background: 'var(--accent-teal)10',
          borderBottom: '1px solid var(--accent-teal)20',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
          fontFamily: 'monospace'
        }}>
          ← Swipe right to go back
        </div>
      )}
      {/* Breadcrumb Header */}
      <div style={{
        padding: isMobile ? '8px 12px' : '12px 16px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        borderBottom: `2px solid ${config.color}40`,
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? '6px' : '8px',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflow: isMobile ? 'hidden' : 'visible'
      }}>
        {/* Back button */}
        <button
          onClick={focusStack.length > 1 ? onBack : onClose}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.85rem' : '0.75rem',
          }}
        >
          ← {focusStack.length > 1 ? 'BACK' : 'WAVE'}
        </button>

        {/* Breadcrumb trail */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          overflow: 'hidden'
        }}>
          {breadcrumb.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span style={{ color: 'var(--border-primary)' }}>›</span>}
              {item.ellipsis ? (
                <span style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.8rem' : '0.75rem' }}>...</span>
              ) : item.current ? (
                <span style={{
                  color: 'var(--accent-teal)',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                  fontWeight: 600,
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {item.label}
                </span>
              ) : (
                <button
                  onClick={item.onClick}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: item.isWave ? config.color : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                    padding: '2px 4px',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={item.label}
                >
                  {item.label}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--accent-orange)40',
            color: 'var(--accent-orange)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.85rem' : '0.75rem',
          }}
          title="Return to wave"
        >
          ✕
        </button>
      </div>

      {/* Focus indicator */}
      <div style={{
        padding: '6px 16px',
        background: 'var(--accent-teal)10',
        borderBottom: '1px solid var(--accent-teal)30',
        fontSize: isMobile ? '0.75rem' : '0.7rem',
        color: 'var(--accent-teal)',
        fontFamily: 'monospace',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span>⤢</span>
        <span>FOCUS VIEW</span>
        <span style={{ color: 'var(--text-muted)' }}>•</span>
        <span style={{ color: 'var(--text-dim)' }}>
          {focusedDroplet.children?.length || 0} {focusedDroplet.children?.length === 1 ? 'reply' : 'replies'}
        </span>
      </div>

      {/* Messages area */}
      <div
        ref={messagesRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '12px' : '16px',
        }}
      >
        {filteredDroplets.map((msg) => (
          <Droplet
            key={msg.id}
            message={msg}
            onReply={handleReply}
            onDelete={handleDeleteMessage}
            onEdit={handleStartEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            editingMessageId={editingMessageId}
            editContent={editContent}
            setEditContent={setEditContent}
            currentUserId={currentUser?.id}
            highlightId={replyingTo?.id}
            playbackIndex={null}
            collapsed={collapsed}
            onToggleCollapse={toggleThreadCollapse}
            isMobile={isMobile}
            onReact={handleReaction}
            onMessageClick={handleMessageClick}
            participants={participants}
            contacts={contacts}
            onShowProfile={onShowProfile}
            onFocus={onFocusDeeper ? (droplet) => onFocusDeeper(droplet) : undefined}
            onShare={handleShareDroplet}
            wave={wave}
            currentWaveId={wave?.id}
            fetchAPI={fetchAPI}
          />
        ))}
      </div>

      {/* Typing Indicator */}
      {typingUsers && Object.keys(typingUsers).length > 0 && (
        <div style={{
          padding: isMobile ? '8px 12px' : '6px 20px',
          color: 'var(--text-dim)',
          fontSize: isMobile ? '0.85rem' : '0.75rem',
          fontStyle: 'italic',
          borderTop: '1px solid var(--bg-hover)',
          background: 'var(--bg-elevated)',
        }}>
          {Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Compose area */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        padding: isMobile ? '12px' : '16px',
      }}>
        {replyingTo && (
          <div style={{
            marginBottom: '8px',
            padding: '8px 12px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-primary)',
            borderLeft: `3px solid ${config.color}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '2px' }}>
                Replying to {replyingTo.sender_name}
              </div>
              <div style={{
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {replyingTo.content?.replace(/<[^>]*>/g, '').substring(0, 50)}...
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--text-dim)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                sendTypingIndicator();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}...` : 'Type a ping... (Shift+Enter for new line)'}
              style={{
                width: '100%',
                minHeight: isMobile ? '50px' : '40px',
                maxHeight: '150px',
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                border: `1px solid ${replyingTo ? config.color : 'var(--border-subtle)'}`,
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.95rem' : '0.85rem',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Emoji button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{
                padding: isMobile ? '12px' : '10px',
                minHeight: isMobile ? '44px' : 'auto',
                background: showEmojiPicker ? 'var(--accent-amber)20' : 'transparent',
                border: `1px solid ${showEmojiPicker ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                color: showEmojiPicker ? 'var(--accent-amber)' : 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: isMobile ? '1.1rem' : '1rem',
              }}
            >
              {showEmojiPicker ? '✕' : '😀'}
            </button>

            {showEmojiPicker && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                right: 0,
                marginBottom: '4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '4px',
                zIndex: 10,
              }}>
                {['😀', '😂', '❤️', '👍', '👎', '🎉', '🤔', '😢', '😮', '🔥', '💯', '👏', '🙏', '💪', '✨', '🚀'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setNewMessage(prev => prev + emoji);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            style={{
              padding: isMobile ? '12px 20px' : '10px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: newMessage.trim() ? 'var(--accent-green)20' : 'transparent',
              border: `1px solid ${newMessage.trim() ? 'var(--accent-green)' : 'var(--border-primary)'}`,
              color: newMessage.trim() ? 'var(--accent-green)' : 'var(--text-muted)',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.85rem' : '0.75rem',
              fontWeight: 600,
            }}
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ CONTACTS VIEW ============
const ContactsView = ({
  contacts, fetchAPI, showToast, onContactsChange,
  contactRequests, sentContactRequests, onRequestsChange,
  onShowProfile
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [requestModalUser, setRequestModalUser] = useState(null);
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await fetchAPI(`/users/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(results);
      } catch (err) { console.error(err); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, fetchAPI]);

  const handleRemoveContact = async (id) => {
    try {
      await fetchAPI(`/contacts/${id}`, { method: 'DELETE' });
      showToast('Contact removed', 'success');
      onContactsChange();
    } catch (err) {
      showToast(err.message || 'Failed to remove contact', 'error');
    }
  };

  // Helper to check if we already sent a request to this user
  const hasSentRequestTo = (userId) => sentContactRequests.some(r => r.to_user_id === userId);
  // Helper to check if we received a request from this user
  const hasReceivedRequestFrom = (userId) => contactRequests.some(r => r.from_user_id === userId);

  return (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <GlowText color="var(--accent-amber)" size="1.1rem">CONTACTS</GlowText>
        <button onClick={() => setShowSearch(!showSearch)} style={{
          padding: isMobile ? '10px 16px' : '8px 16px',
          minHeight: isMobile ? '44px' : 'auto',
          background: showSearch ? 'var(--accent-teal)20' : 'var(--accent-amber)20',
          border: `1px solid ${showSearch ? 'var(--accent-teal)' : 'var(--accent-amber)50'}`,
          color: showSearch ? 'var(--accent-teal)' : 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
        }}>{showSearch ? '✕ CLOSE' : '+ FIND PEOPLE'}</button>
      </div>

      {/* Incoming Contact Requests */}
      <ContactRequestsPanel
        requests={contactRequests}
        fetchAPI={fetchAPI}
        showToast={showToast}
        onRequestsChange={onRequestsChange}
        onContactsChange={onContactsChange}
        isMobile={isMobile}
      />

      {/* Sent Requests (collapsed by default) */}
      <SentRequestsPanel
        requests={sentContactRequests}
        fetchAPI={fetchAPI}
        showToast={showToast}
        onRequestsChange={onRequestsChange}
        isMobile={isMobile}
      />

      {showSearch && (
        <div style={{ marginBottom: '24px', padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-teal)40' }}>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by handle or name..."
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box', marginBottom: '16px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
            }} />
          {searching && <div style={{ color: 'var(--text-muted)' }}>Searching...</div>}
          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div style={{ color: 'var(--text-muted)' }}>No users found</div>
          )}
          {searchResults.map(user => {
            const sentRequest = hasSentRequestTo(user.id);
            const receivedRequest = hasReceivedRequestFrom(user.id);
            return (
              <div key={user.id} style={{
                padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Avatar letter={user.avatar || user.displayName[0]} color="var(--accent-amber)" size={isMobile ? 40 : 36} status={user.status} />
                  <div>
                    <div style={{ color: 'var(--text-primary)' }}>{user.displayName}</div>
                  </div>
                </div>
                {user.isContact ? (
                  <span style={{ color: 'var(--accent-green)', fontSize: '0.75rem' }}>✓ CONTACT</span>
                ) : sentRequest ? (
                  <span style={{ color: 'var(--accent-amber)', fontSize: '0.75rem' }}>REQUEST SENT</span>
                ) : receivedRequest ? (
                  <span style={{ color: 'var(--accent-teal)', fontSize: '0.75rem' }}>RESPOND ABOVE</span>
                ) : (
                  <button onClick={() => setRequestModalUser(user)} style={{
                    padding: isMobile ? '10px 14px' : '6px 12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)',
                    color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace',
                  }}>SEND REQUEST</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {contacts.length === 0 && contactRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◎</div>
          <div>No contacts yet</div>
          <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>Use "Find People" to send contact requests</div>
        </div>
      ) : contacts.length > 0 && (
        <>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '12px', marginTop: '8px' }}>
            YOUR CONTACTS ({contacts.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '280px'}, 1fr))`, gap: '12px' }}>
            {contacts.map(contact => (
              <div key={contact.id} style={{
                padding: '16px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
                border: `1px solid ${contact.isRemote ? 'var(--accent-purple)30' : 'var(--border-subtle)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, cursor: onShowProfile ? 'pointer' : 'default', flex: 1 }}
                  onClick={onShowProfile ? () => onShowProfile(contact.id) : undefined}
                  title={onShowProfile ? 'View profile' : undefined}
                >
                  <Avatar
                    letter={contact.avatar || contact.name?.[0] || '?'}
                    color={contact.isRemote ? 'var(--accent-purple)' : 'var(--accent-amber)'}
                    size={44}
                    status={contact.status}
                    imageUrl={contact.avatarUrl}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contact.name}
                    </div>
                    {contact.isRemote && (
                      <div style={{ color: 'var(--accent-purple)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{contact.handle}@{contact.nodeName}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => handleRemoveContact(contact.id)} style={{
                  padding: isMobile ? '10px' : '6px 10px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent', border: '1px solid var(--accent-orange)50',
                  color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0,
                }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Send Contact Request Modal */}
      <SendContactRequestModal
        isOpen={!!requestModalUser}
        onClose={() => setRequestModalUser(null)}
        toUser={requestModalUser}
        fetchAPI={fetchAPI}
        showToast={showToast}
        onRequestSent={() => {
          onRequestsChange();
          setSearchResults(prev => prev.map(u =>
            u.id === requestModalUser?.id ? { ...u, requestSent: true } : u
          ));
        }}
        isMobile={isMobile}
      />
    </div>
  );
};

// ============ GROUPS VIEW ============
const GroupsView = ({ groups, fetchAPI, showToast, onGroupsChange, groupInvitations, onInvitationsChange, contacts }) => {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();

  useEffect(() => {
    if (selectedGroup) {
      fetchAPI(`/groups/${selectedGroup}`)
        .then(setGroupDetails)
        .catch(() => showToast('Failed to load crew', 'error'));
    }
  }, [selectedGroup, fetchAPI, showToast]);

  useEffect(() => {
    if (memberSearch.length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const results = await fetchAPI(`/users/search?q=${encodeURIComponent(memberSearch)}`);
        const memberIds = groupDetails?.members?.map(m => m.id) || [];
        setSearchResults(results.filter(r => !memberIds.includes(r.id)));
      } catch (err) { console.error(err); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [memberSearch, fetchAPI, groupDetails]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await fetchAPI('/groups', { method: 'POST', body: { name: newGroupName, description: newGroupDesc } });
      showToast('Crew created', 'success');
      setNewGroupName('');
      setNewGroupDesc('');
      setShowNewGroup(false);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to create crew', 'error');
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Delete this crew?')) return;
    try {
      await fetchAPI(`/groups/${selectedGroup}`, { method: 'DELETE' });
      showToast('Crew deleted', 'success');
      setSelectedGroup(null);
      setGroupDetails(null);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to delete crew', 'error');
    }
  };

  const handleAddMember = async (userId) => {
    try {
      // Use invitation flow instead of direct add - users should consent to joining
      const result = await fetchAPI(`/groups/${selectedGroup}/invite`, {
        method: 'POST',
        body: { userIds: [userId] }
      });
      if (result.invitations?.length > 0) {
        showToast('Invitation sent', 'success');
      } else if (result.errors?.length > 0) {
        showToast(result.errors[0].error || 'Failed to send invitation', 'error');
      }
      setMemberSearch('');
      setSearchResults([]);
    } catch (err) {
      showToast(err.message || 'Failed to send invitation', 'error');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this crew?')) return;
    try {
      await fetchAPI(`/groups/${selectedGroup}/members/${groupDetails.currentUserId}`, { method: 'DELETE' });
      showToast('Left crew', 'success');
      setSelectedGroup(null);
      setGroupDetails(null);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to leave crew', 'error');
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await fetchAPI(`/groups/${selectedGroup}/members/${userId}`, { method: 'DELETE' });
      showToast('Member removed', 'success');
      const updated = await fetchAPI(`/groups/${selectedGroup}`);
      setGroupDetails(updated);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const handleToggleAdmin = async (userId, currentRole) => {
    try {
      await fetchAPI(`/groups/${selectedGroup}/members/${userId}`, {
        method: 'PUT', body: { role: currentRole === 'admin' ? 'member' : 'admin' },
      });
      const updated = await fetchAPI(`/groups/${selectedGroup}`);
      setGroupDetails(updated);
    } catch (err) {
      showToast(err.message || 'Failed to update role', 'error');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%' }}>
      {/* Group list */}
      <div style={{
        width: isMobile ? '100%' : '300px',
        borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
        borderBottom: isMobile ? '1px solid var(--border-subtle)' : 'none',
        display: 'flex', flexDirection: 'column',
        maxHeight: isMobile ? '300px' : 'none',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button onClick={() => setShowNewGroup(true)} style={{
            width: '100%', padding: '10px', background: 'var(--accent-amber)15', border: '1px solid var(--accent-amber)50',
            color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
          }}>+ NEW GROUP</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: groupInvitations?.length > 0 ? '12px' : '0' }}>
          {/* Group Invitations */}
          <GroupInvitationsPanel
            invitations={groupInvitations || []}
            fetchAPI={fetchAPI}
            showToast={showToast}
            onInvitationsChange={onInvitationsChange}
            onGroupsChange={onGroupsChange}
            isMobile={isMobile}
          />
          {groups.length === 0 && (!groupInvitations || groupInvitations.length === 0) ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No crews yet</div>
          ) : groups.map(g => (
            <div key={g.id} onClick={() => setSelectedGroup(g.id)} style={{ padding: '14px 16px', cursor: 'pointer',
              background: selectedGroup === g.id ? 'var(--accent-amber)10' : 'transparent',
              borderBottom: '1px solid var(--bg-hover)',
              borderLeft: `3px solid ${selectedGroup === g.id ? 'var(--accent-amber)' : 'transparent'}`,
            }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{g.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{g.memberCount} members • {g.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Crew details */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!selectedGroup ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--border-primary)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◈</div>
              <div>Select a crew or create a new one</div>
            </div>
          </div>
        ) : !groupDetails ? (
          <LoadingSpinner />
        ) : (
          <>
            <div style={{
              padding: '20px', borderBottom: '1px solid var(--border-subtle)',
              background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '1.2rem', marginBottom: '4px' }}>{groupDetails.name}</div>
                  {groupDetails.description && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{groupDetails.description}</div>
                  )}
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '8px' }}>
                    {groupDetails.members?.length} members
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => setShowInviteModal(true)} style={{
                    padding: '6px 12px', background: 'var(--accent-teal)15', border: '1px solid var(--accent-teal)',
                    color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                  }}>+ INVITE</button>
                  <button onClick={handleLeaveGroup} style={{
                    padding: '6px 12px', background: 'var(--accent-amber)15', border: '1px solid var(--accent-amber)50',
                    color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                  }}>LEAVE CREW</button>
                  {groupDetails.isAdmin && (
                    <button onClick={handleDeleteGroup} style={{
                      padding: '6px 12px', background: 'var(--accent-orange)20', border: '1px solid var(--accent-orange)',
                      color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                    }}>DELETE CREW</button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <GlowText color="var(--accent-amber)" size="0.9rem">MEMBERS</GlowText>
                {groupDetails.isAdmin && (
                  <button onClick={() => setShowAddMember(!showAddMember)} style={{
                    padding: '6px 12px', background: showAddMember ? 'var(--accent-teal)20' : 'transparent',
                    border: `1px solid ${showAddMember ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
                    color: showAddMember ? 'var(--accent-teal)' : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                  }}>{showAddMember ? '✕ CLOSE' : '+ INVITE MEMBER'}</button>
                )}
              </div>

              {showAddMember && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-teal)40' }}>
                  <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search users..."
                    style={{
                      width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: '8px',
                      background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
                    }} />
                  {searchResults.map(user => (
                    <div key={user.id} style={{
                      padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'var(--bg-surface)', marginBottom: '4px',
                    }}>
                      <span style={{ color: 'var(--text-primary)' }}>{user.displayName}</span>
                      <button onClick={() => handleAddMember(user.id)} style={{
                        padding: '4px 8px', background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)',
                        color: 'var(--accent-teal)', cursor: 'pointer', fontSize: '0.7rem',
                      }}>INVITE</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
              {groupDetails.members?.map(member => (
                <div key={member.id} style={{
                  padding: '12px', marginTop: '8px',
                  background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar letter={member.avatar || member.name[0]} color={member.role === 'admin' ? 'var(--accent-amber)' : 'var(--text-dim)'} size={36} status={member.status} />
                    <div>
                      <div style={{ color: 'var(--text-primary)' }}>{member.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{member.role}</div>
                    </div>
                  </div>
                  {groupDetails.isAdmin && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleToggleAdmin(member.id, member.role)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-primary)',
                        color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
                      }}>{member.role === 'admin' ? '↓' : '↑'}</button>
                      <button onClick={() => handleRemoveMember(member.id)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid var(--accent-orange)50',
                        color: 'var(--accent-orange)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
                      }}>✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
        }}>
          <div style={{
            width: '100%', maxWidth: '400px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
            border: '2px solid var(--accent-amber)40', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <GlowText color="var(--accent-amber)" size="1.1rem">Create Crew</GlowText>
              <button onClick={() => setShowNewGroup(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>NAME</div>
              <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Crew name..."
                style={{
                  width: '100%', padding: '10px', boxSizing: 'border-box',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
                }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>DESCRIPTION (optional)</div>
              <textarea value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="What's this crew for?"
                style={{
                  width: '100%', padding: '10px', boxSizing: 'border-box', height: '80px', resize: 'none',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
                }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowNewGroup(false)} style={{
                flex: 1, padding: '12px', background: 'transparent',
                border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
              }}>CANCEL</button>
              <button onClick={handleCreateGroup} disabled={!newGroupName.trim()} style={{
                flex: 1, padding: '12px',
                background: newGroupName.trim() ? 'var(--accent-amber)20' : 'transparent',
                border: `1px solid ${newGroupName.trim() ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                color: newGroupName.trim() ? 'var(--accent-amber)' : 'var(--text-muted)',
                cursor: newGroupName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
              }}>CREATE</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite to Group Modal */}
      <InviteToGroupModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        group={groupDetails}
        contacts={contacts || []}
        fetchAPI={fetchAPI}
        showToast={showToast}
        isMobile={isMobile}
      />
    </div>
  );
};

// ============ USER MANAGEMENT ADMIN PANEL ============
const UserManagementPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle, currentUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null); // 'reset-password' | 'disable-mfa' | 'change-role' | null
  const [pendingRole, setPendingRole] = useState(null);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await fetchAPI(`/admin/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data.users || []);
    } catch (err) {
      showToast('Failed to search users', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleResetPassword = async (sendEmail) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const data = await fetchAPI(`/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        body: { sendEmail }
      });
      if (data.temporaryPassword) {
        showToast(`Password reset. Temp password: ${data.temporaryPassword}`, 'success');
      } else {
        showToast(data.message || 'Password reset successfully', 'success');
      }
      setShowConfirm(null);
      setSelectedUser(null);
    } catch (err) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await fetchAPI(`/admin/users/${selectedUser.id}/disable-mfa`, { method: 'POST' });
      showToast('MFA disabled for user', 'success');
      setShowConfirm(null);
      setSelectedUser(null);
    } catch (err) {
      showToast(err.message || 'Failed to disable MFA', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeRole = async () => {
    if (!selectedUser || !pendingRole) return;
    setActionLoading(true);
    try {
      const data = await fetchAPI(`/admin/users/${selectedUser.id}/role`, {
        method: 'PUT',
        body: { role: pendingRole }
      });
      showToast(`Role changed to ${pendingRole} for @${data.user.handle}`, 'success');
      // Update search results with new role
      setSearchResults(prev => prev.map(u =>
        u.id === selectedUser.id ? { ...u, role: pendingRole, isAdmin: pendingRole === 'admin' } : u
      ));
      setShowConfirm(null);
      setSelectedUser(null);
      setPendingRole(null);
    } catch (err) {
      showToast(err.message || 'Failed to change role', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Check if current user can assign roles (admin only)
  const canAssignRoles = canAccess(currentUser, 'admin');

  const inputStyle = {
    padding: '8px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  };

  const buttonStyle = {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid var(--border-primary)',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  };

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-purple)40',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', fontWeight: 500 }}>USER MANAGEMENT</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-purple)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-purple)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {/* Search */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              placeholder="Search by handle or email..."
              style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
            />
            <button
              onClick={searchUsers}
              disabled={searching || !searchQuery.trim()}
              style={{
                ...buttonStyle,
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                opacity: searching || !searchQuery.trim() ? 0.5 : 1,
              }}
            >
              {searching ? 'Searching...' : 'SEARCH'}
            </button>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                Found {searchResults.length} user(s)
              </div>
              {searchResults.map(u => {
                const userRole = u.role || (u.isAdmin ? 'admin' : 'user');
                const roleColors = {
                  admin: 'var(--accent-amber)',
                  moderator: 'var(--accent-teal)',
                  user: 'var(--text-muted)'
                };
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                    style={{
                      padding: '10px 12px',
                      marginBottom: '4px',
                      background: selectedUser?.id === u.id ? 'var(--accent-purple)20' : 'var(--bg-elevated)',
                      border: `1px solid ${selectedUser?.id === u.id ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{u.displayName || u.handle}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>@{u.handle}</div>
                    </div>
                    <span style={{
                      color: roleColors[userRole],
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      border: `1px solid ${roleColors[userRole]}`,
                      borderRadius: '3px',
                      textTransform: 'uppercase'
                    }}>
                      {userRole}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions for selected user */}
          {selectedUser && !showConfirm && (
            <div style={{ padding: '12px', background: 'var(--bg-hover)', border: '1px solid var(--border-secondary)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '12px' }}>
                Actions for <strong style={{ color: 'var(--text-primary)' }}>@{selectedUser.handle}</strong>
                {selectedUser.role && (
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    (role: {selectedUser.role || (selectedUser.isAdmin ? 'admin' : 'user')})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowConfirm('reset-password')}
                  style={{ ...buttonStyle, border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }}
                >
                  RESET PASSWORD
                </button>
                <button
                  onClick={() => setShowConfirm('disable-mfa')}
                  style={{ ...buttonStyle, border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)' }}
                >
                  DISABLE MFA
                </button>
                {canAssignRoles && selectedUser.id !== currentUser?.id && (
                  <button
                    onClick={() => setShowConfirm('change-role')}
                    style={{ ...buttonStyle, border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}
                  >
                    CHANGE ROLE
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Confirmation dialogs */}
          {showConfirm === 'reset-password' && (
            <div style={{ padding: '16px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)40' }}>
              <div style={{ color: 'var(--accent-amber)', marginBottom: '12px', fontSize: '0.85rem' }}>
                Reset password for @{selectedUser.handle}?
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                User will be required to change password on next login.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleResetPassword(true)}
                  disabled={actionLoading}
                  style={{ ...buttonStyle, border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
                >
                  {actionLoading ? '...' : 'RESET & EMAIL USER'}
                </button>
                <button
                  onClick={() => handleResetPassword(false)}
                  disabled={actionLoading}
                  style={{ ...buttonStyle, border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }}
                >
                  {actionLoading ? '...' : 'RESET (SHOW PASSWORD)'}
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  disabled={actionLoading}
                  style={buttonStyle}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {showConfirm === 'disable-mfa' && (
            <div style={{ padding: '16px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)40' }}>
              <div style={{ color: 'var(--accent-orange)', marginBottom: '12px', fontSize: '0.85rem' }}>
                Disable all MFA for @{selectedUser.handle}?
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                This will disable TOTP, email MFA, and remove all recovery codes.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDisableMfa}
                  disabled={actionLoading}
                  style={{ ...buttonStyle, border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)' }}
                >
                  {actionLoading ? '...' : 'DISABLE MFA'}
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  disabled={actionLoading}
                  style={buttonStyle}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {showConfirm === 'change-role' && (
            <div style={{ padding: '16px', background: 'var(--accent-purple)10', border: '1px solid var(--accent-purple)40' }}>
              <div style={{ color: 'var(--accent-purple)', marginBottom: '12px', fontSize: '0.85rem' }}>
                Change role for @{selectedUser.handle}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                Current role: <strong>{selectedUser.role || (selectedUser.isAdmin ? 'admin' : 'user')}</strong>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <select
                  value={pendingRole || ''}
                  onChange={(e) => setPendingRole(e.target.value)}
                  style={{
                    ...inputStyle,
                    width: '100%',
                    cursor: 'pointer',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <option value="">Select new role...</option>
                  <option value="user">User - Regular user</option>
                  <option value="moderator">Moderator - Reports, warnings, user management</option>
                  <option value="admin">Admin - Full access</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleChangeRole}
                  disabled={actionLoading || !pendingRole}
                  style={{
                    ...buttonStyle,
                    border: '1px solid var(--accent-purple)',
                    color: 'var(--accent-purple)',
                    opacity: !pendingRole ? 0.5 : 1
                  }}
                >
                  {actionLoading ? '...' : 'CONFIRM CHANGE'}
                </button>
                <button
                  onClick={() => { setShowConfirm(null); setPendingRole(null); }}
                  disabled={actionLoading}
                  style={buttonStyle}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ ACTIVITY LOG ADMIN PANEL ============
const ActivityLogPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const ACTION_LABELS = {
    login: { label: 'Login', color: 'var(--accent-green)' },
    login_failed: { label: 'Login Failed', color: 'var(--accent-orange)' },
    logout: { label: 'Logout', color: 'var(--text-dim)' },
    register: { label: 'Registration', color: 'var(--accent-teal)' },
    password_change: { label: 'Password Change', color: 'var(--accent-amber)' },
    password_reset_complete: { label: 'Password Reset', color: 'var(--accent-amber)' },
    mfa_enable: { label: 'MFA Enabled', color: 'var(--accent-green)' },
    mfa_disable: { label: 'MFA Disabled', color: 'var(--accent-orange)' },
    admin_warn: { label: 'Admin Warning', color: 'var(--accent-purple)' },
    admin_password_reset: { label: 'Admin Password Reset', color: 'var(--accent-purple)' },
    admin_force_logout: { label: 'Admin Force Logout', color: 'var(--accent-purple)' },
    admin_disable_mfa: { label: 'Admin MFA Disabled', color: 'var(--accent-purple)' },
    create_wave: { label: 'Wave Created', color: 'var(--accent-teal)' },
    delete_wave: { label: 'Wave Deleted', color: 'var(--accent-orange)' },
    create_droplet: { label: 'Ping Created', color: 'var(--text-secondary)' },
    edit_droplet: { label: 'Ping Edited', color: 'var(--text-secondary)' },
    delete_droplet: { label: 'Ping Deleted', color: 'var(--accent-orange)' },
  };

  const loadActivities = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      let url = `/admin/activity-log?limit=${LIMIT}&offset=${newOffset}`;
      if (selectedAction) url += `&actionType=${selectedAction}`;

      const data = await fetchAPI(url);
      if (newOffset === 0) {
        setActivities(data.activities || []);
      } else {
        setActivities(prev => [...prev, ...(data.activities || [])]);
      }
      setTotal(data.total || 0);
      setHasMore((data.activities || []).length === LIMIT);
      setOffset(newOffset);
    } catch (err) {
      // Check if it's a 501 (not implemented) error
      if (err.message?.includes('501')) {
        setActivities([]);
        setTotal(0);
      } else {
        showToast('Failed to load activity log', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchAPI, selectedAction, showToast]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAPI('/admin/activity-stats?days=7');
      setStats(data);
    } catch {
      // Stats not critical, ignore errors
    }
  }, [fetchAPI]);

  useEffect(() => {
    if (isOpen && activities.length === 0) {
      loadActivities(0);
      loadStats();
    }
  }, [isOpen, loadActivities, loadStats, activities.length]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getActionStyle = (actionType) => {
    const config = ACTION_LABELS[actionType] || { label: actionType, color: 'var(--text-dim)' };
    return config;
  };

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-teal)40',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ color: 'var(--accent-teal)', fontSize: '0.8rem', fontWeight: 500 }}>
            📊 ACTIVITY LOG
          </div>
          {stats && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              Last 7 days: {stats.totalActivities} events | {stats.uniqueUsers} users
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-teal)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>

      {/* Filter by action type */}
      <div style={{ marginBottom: '16px' }}>
        <select
          value={selectedAction}
          onChange={(e) => {
            const newAction = e.target.value;
            setSelectedAction(newAction);
            setOffset(0);
            // Fetch filtered results immediately
            setLoading(true);
            let url = `/admin/activity-log?limit=${LIMIT}&offset=0`;
            if (newAction) url += `&actionType=${newAction}`;
            fetchAPI(url).then(data => {
              setActivities(data.activities || []);
              setTotal(data.total || 0);
              setHasMore((data.activities || []).length === LIMIT);
            }).catch(() => {
              showToast('Failed to load activity log', 'error');
            }).finally(() => setLoading(false));
          }}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            cursor: 'pointer',
            minWidth: '180px'
          }}
        >
          <option value="">All Actions</option>
          <option value="login">Logins</option>
          <option value="login_failed">Failed Logins</option>
          <option value="register">Registrations</option>
          <option value="password_change">Password Changes</option>
          <option value="password_reset_complete">Password Resets</option>
          <option value="mfa_enable">MFA Enabled</option>
          <option value="mfa_disable">MFA Disabled</option>
          <option value="admin_warn">Admin Warnings</option>
          <option value="admin_password_reset">Admin Password Resets</option>
          <option value="admin_disable_mfa">Admin MFA Disabled</option>
          <option value="create_wave">Waves Created</option>
          <option value="delete_wave">Waves Deleted</option>
        </select>
      </div>

      {loading && activities.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>Loading...</div>
      ) : activities.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '20px', textAlign: 'center' }}>
          No activity logs found. Activity logging may not be enabled.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
            Showing {activities.length} of {total} entries
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {activities.map((activity) => {
              const actionConfig = getActionStyle(activity.action_type);
              return (
                <div
                  key={activity.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '6px' : '12px',
                    alignItems: isMobile ? 'flex-start' : 'center',
                  }}
                >
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: actionConfig.color,
                    color: 'var(--bg-base)',
                    borderRadius: '2px',
                    whiteSpace: 'nowrap',
                    minWidth: isMobile ? 'auto' : '120px',
                    textAlign: 'center',
                  }}>
                    {actionConfig.label}
                  </span>
                  <span style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    flex: 1,
                  }}>
                    {activity.user_handle || activity.user_id || 'System'}
                  </span>
                  <span style={{
                    color: 'var(--text-dim)',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {activity.ip_address || '-'}
                  </span>
                  <span style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatDate(activity.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => loadActivities(offset + LIMIT)}
              disabled={loading}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                width: '100%',
              }}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </>
      )}
        </div>
      )}
    </div>
  );
};

// ============ CRAWL BAR ADMIN PANEL ============
const CrawlBarAdminPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stockSymbols, setStockSymbols] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/admin/crawl/config');
      setConfig(data.config);
      setStockSymbols((data.config?.stock_symbols || []).join(', '));
      setDefaultLocation(data.config?.default_location?.name || '');
    } catch (err) {
      if (!err.message?.includes('401')) {
        showToast(err.message || 'Failed to load crawl config', 'error');
      }
    }
    setLoading(false);
  }, [fetchAPI, showToast]);

  useEffect(() => {
    if (isOpen && !config) {
      loadConfig();
    }
  }, [isOpen, config, loadConfig]);

  const handleSave = async (updates) => {
    setSaving(true);
    try {
      const data = await fetchAPI('/admin/crawl/config', {
        method: 'PUT',
        body: updates
      });
      setConfig(data.config);
      showToast('Crawl bar configuration updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update config', 'error');
    }
    setSaving(false);
  };

  const handleSaveSymbols = async () => {
    const symbols = stockSymbols
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);
    await handleSave({ stock_symbols: symbols });
    setStockSymbols(symbols.join(', '));
  };

  const handleSaveLocation = async () => {
    // Simple location parsing - just store the name and let backend resolve coordinates
    if (defaultLocation.trim()) {
      await handleSave({
        default_location: { name: defaultLocation.trim(), lat: null, lon: null }
      });
    } else {
      await handleSave({
        default_location: { name: 'New York, NY', lat: 40.7128, lon: -74.0060 }
      });
      setDefaultLocation('New York, NY');
    }
  };

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-teal)40',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ color: 'var(--accent-teal)', fontSize: '0.8rem', fontWeight: 500 }}>📊 CRAWL BAR CONFIG</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-teal)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : (
            <>
              {/* Feature Toggles */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>ENABLED FEATURES</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleSave({ stocks_enabled: !config?.stocks_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.stocks_enabled ? 'var(--accent-green)20' : 'transparent',
                      border: `1px solid ${config?.stocks_enabled ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                      color: config?.stocks_enabled ? 'var(--accent-green)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    📈 STOCKS
                  </button>
                  <button
                    onClick={() => handleSave({ weather_enabled: !config?.weather_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.weather_enabled ? 'var(--accent-teal)20' : 'transparent',
                      border: `1px solid ${config?.weather_enabled ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                      color: config?.weather_enabled ? 'var(--accent-teal)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    🌡️ WEATHER
                  </button>
                  <button
                    onClick={() => handleSave({ news_enabled: !config?.news_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.news_enabled ? 'var(--accent-purple)20' : 'transparent',
                      border: `1px solid ${config?.news_enabled ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                      color: config?.news_enabled ? 'var(--accent-purple)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    ◆ NEWS
                  </button>
                </div>
              </div>

              {/* Stock Symbols */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>STOCK SYMBOLS</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="AAPL, GOOGL, MSFT, AMZN, TSLA"
                    value={stockSymbols}
                    onChange={(e) => setStockSymbols(e.target.value)}
                    style={{
                      flex: 1,
                      padding: isMobile ? '12px' : '10px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  />
                  <button
                    onClick={handleSaveSymbols}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '12px 16px' : '10px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-amber)20',
                      border: '1px solid var(--accent-amber)',
                      color: 'var(--accent-amber)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    SAVE
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                  Comma-separated list of stock ticker symbols
                </div>
              </div>

              {/* Default Location */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>DEFAULT LOCATION</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="New York, NY"
                    value={defaultLocation}
                    onChange={(e) => setDefaultLocation(e.target.value)}
                    style={{
                      flex: 1,
                      padding: isMobile ? '12px' : '10px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  />
                  <button
                    onClick={handleSaveLocation}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '12px 16px' : '10px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-amber)20',
                      border: '1px solid var(--accent-amber)',
                      color: 'var(--accent-amber)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    SAVE
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                  Default location for weather when user location is unavailable
                </div>
              </div>

              {/* Refresh Intervals */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>REFRESH INTERVALS (SECONDS)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>Stocks</div>
                    <input
                      type="number"
                      min="30"
                      max="600"
                      value={config?.stock_refresh_interval || 60}
                      onChange={(e) => handleSave({ stock_refresh_interval: parseInt(e.target.value, 10) || 60 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>Weather</div>
                    <input
                      type="number"
                      min="60"
                      max="1800"
                      value={config?.weather_refresh_interval || 300}
                      onChange={(e) => handleSave({ weather_refresh_interval: parseInt(e.target.value, 10) || 300 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>News</div>
                    <input
                      type="number"
                      min="60"
                      max="1800"
                      value={config?.news_refresh_interval || 180}
                      onChange={(e) => handleSave({ news_refresh_interval: parseInt(e.target.value, 10) || 180 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* API Key Status */}
              <div style={{ padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>API KEY STATUS</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                  <span style={{ color: config?.apiKeys?.finnhub ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.finnhub ? '✓' : '✗'} Finnhub
                  </span>
                  <span style={{ color: config?.apiKeys?.openweathermap ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.openweathermap ? '✓' : '✗'} OpenWeather
                  </span>
                  <span style={{ color: config?.apiKeys?.newsapi ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.newsapi ? '✓' : '✗'} NewsAPI
                  </span>
                  <span style={{ color: config?.apiKeys?.gnews ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.gnews ? '✓' : '✗'} GNews
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '8px' }}>
                  Configure API keys in server/.env file
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============ ALERTS ADMIN PANEL ============
const AlertsAdminPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState('info');
  const [formCategory, setFormCategory] = useState('system');
  const [formScope, setFormScope] = useState('local');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/admin/alerts');
      setAlerts(data.alerts || []);
    } catch (err) {
      if (!err.message?.includes('401')) {
        showToast(err.message || 'Failed to load alerts', 'error');
      }
    }
    setLoading(false);
  }, [fetchAPI, showToast]);

  useEffect(() => {
    if (isOpen && alerts.length === 0) {
      loadAlerts();
    }
  }, [isOpen, alerts.length, loadAlerts]);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormPriority('info');
    setFormCategory('system');
    setFormScope('local');
    // Default start time to now
    const now = new Date();
    setFormStartTime(now.toISOString().slice(0, 16));
    // Default end time to 24 hours from now
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setFormEndTime(tomorrow.toISOString().slice(0, 16));
    setEditingAlert(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (alert) => {
    setEditingAlert(alert);
    setFormTitle(alert.title);
    setFormContent(alert.content);
    setFormPriority(alert.priority);
    setFormCategory(alert.category);
    setFormScope(alert.scope);
    // Safely parse dates - convert to local datetime format for datetime-local input
    const parseToLocalDatetime = (dateStr) => {
      if (!dateStr) return '';
      // Ensure we parse as UTC - append Z if not present (SQLite may strip it)
      const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
      const d = new Date(utcStr);
      if (isNaN(d.getTime())) return '';
      // Use local time methods to convert UTC to user's local timezone
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    setFormStartTime(parseToLocalDatetime(alert.startTime));
    setFormEndTime(parseToLocalDatetime(alert.endTime));
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim() || !formStartTime || !formEndTime) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingAlert) {
        await fetchAPI(`/admin/alerts/${editingAlert.id}`, {
          method: 'PUT',
          body: {
            title: formTitle.trim(),
            content: formContent.trim(),
            priority: formPriority,
            category: formCategory,
            scope: formScope,
            startTime: new Date(formStartTime).toISOString(),
            endTime: new Date(formEndTime).toISOString(),
          }
        });
        showToast('Alert updated', 'success');
      } else {
        await fetchAPI('/admin/alerts', {
          method: 'POST',
          body: {
            title: formTitle.trim(),
            content: formContent.trim(),
            priority: formPriority,
            category: formCategory,
            scope: formScope,
            startTime: new Date(formStartTime).toISOString(),
            endTime: new Date(formEndTime).toISOString(),
          }
        });
        showToast('Alert created', 'success');
      }
      setShowCreateModal(false);
      loadAlerts();
    } catch (err) {
      showToast(err.message || 'Failed to save alert', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (alertId) => {
    if (!confirm('Delete this alert?')) return;
    try {
      await fetchAPI(`/admin/alerts/${alertId}`, { method: 'DELETE' });
      showToast('Alert deleted', 'success');
      loadAlerts();
    } catch (err) {
      showToast(err.message || 'Failed to delete alert', 'error');
    }
  };

  const getAlertStatus = (alert) => {
    const now = new Date();
    // Ensure we parse as UTC - append Z if not present (SQLite may strip it)
    const startStr = alert.startTime?.endsWith('Z') ? alert.startTime : alert.startTime + 'Z';
    const endStr = alert.endTime?.endsWith('Z') ? alert.endTime : alert.endTime + 'Z';
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (now < start) return { label: 'SCHEDULED', color: 'var(--accent-purple)' };
    if (now > end) return { label: 'EXPIRED', color: 'var(--text-muted)' };
    return { label: 'ACTIVE', color: 'var(--accent-green)' };
  };

  const priorityConfig = {
    critical: { icon: '🚨', color: 'var(--accent-orange)' },
    warning: { icon: '⚠️', color: 'var(--accent-amber)' },
    info: { icon: 'ℹ️', color: 'var(--accent-teal)' }
  };

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-amber)40',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 500 }}>🚨 SYSTEM ALERTS</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-amber)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-amber)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : (
            <>
              {/* Create button */}
              <div style={{ marginBottom: '16px' }}>
                <button onClick={openCreateModal} style={{
                  padding: isMobile ? '10px 16px' : '8px 14px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'var(--accent-amber)20',
                  border: '1px solid var(--accent-amber)',
                  color: 'var(--accent-amber)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                }}>+ NEW ALERT</button>
              </div>

              {/* Alerts list */}
              {alerts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No alerts configured
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {alerts.map(alert => {
                    const status = getAlertStatus(alert);
                    const cfg = priorityConfig[alert.priority] || priorityConfig.info;
                    return (
                      <div key={alert.id} style={{
                        padding: '12px',
                        background: 'var(--bg-surface)',
                        border: `1px solid ${cfg.color}40`,
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: '8px',
                        alignItems: isMobile ? 'flex-start' : 'center',
                      }}>
                        {/* Priority icon and title */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <span>{cfg.icon}</span>
                            <span style={{
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {alert.title}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                            <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                            <span>•</span>
                            <span>{alert.category}</span>
                            <span>•</span>
                            <span>{alert.scope}</span>
                            {alert.origin_node && (
                              <>
                                <span>•</span>
                                <span style={{ color: 'var(--accent-purple)' }}>@{alert.origin_node}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Actions */}
                        {!alert.origin_node && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => openEditModal(alert)} style={{
                              padding: '4px 8px',
                              background: 'transparent',
                              border: '1px solid var(--border-secondary)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                            }}>EDIT</button>
                            <button onClick={() => handleDelete(alert.id)} style={{
                              padding: '4px 8px',
                              background: 'transparent',
                              border: '1px solid var(--accent-orange)40',
                              color: 'var(--accent-orange)',
                              cursor: 'pointer',
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                            }}>DEL</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)', padding: '16px',
        }} onClick={() => setShowCreateModal(false)}>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--accent-amber)',
            borderRadius: '4px', padding: isMobile ? '16px' : '24px',
            maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--accent-amber)', fontFamily: 'monospace' }}>
              {editingAlert ? 'EDIT ALERT' : 'NEW ALERT'}
            </h3>

            {/* Title */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>TITLE *</label>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
                placeholder="Alert title..."
              />
            </div>

            {/* Content */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>CONTENT *</label>
              <textarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                }}
                placeholder="Alert content (supports basic HTML)..."
              />
            </div>

            {/* Priority + Category Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>PRIORITY</label>
                <select
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="critical">🚨 Critical</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>CATEGORY</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="system">System</option>
                  <option value="announcement">Announcement</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>

            {/* Scope */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>SCOPE</label>
              <select
                value={formScope}
                onChange={e => setFormScope(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              >
                <option value="local">Local only</option>
                <option value="federated">Federated (broadcast to subscribers)</option>
              </select>
            </div>

            {/* Start + End Time */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>START TIME *</label>
                <input
                  type="datetime-local"
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>END TIME *</label>
                <input
                  type="datetime-local"
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
              }}>CANCEL</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-amber)20',
                border: '1px solid var(--accent-amber)',
                color: 'var(--accent-amber)',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
                opacity: saving ? 0.6 : 1,
              }}>{saving ? 'SAVING...' : (editingAlert ? 'UPDATE' : 'CREATE')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ ALERT SUBSCRIPTIONS PANEL ============
const AlertSubscriptionsPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [federationNodes, setFederationNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formSourceNode, setFormSourceNode] = useState('');
  const [formCategories, setFormCategories] = useState({ system: false, announcement: false, emergency: false });

  const availableCategories = ['system', 'announcement', 'emergency'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load both subscriptions and federation nodes
      const [subsData, nodesData] = await Promise.all([
        fetchAPI('/admin/alert-subscriptions'),
        fetchAPI('/admin/federation/nodes').catch(() => ({ nodes: [] })) // Gracefully handle if federation disabled
      ]);
      setSubscriptions(subsData.subscriptions || []);
      setFederationNodes(nodesData.nodes || []);
    } catch (err) {
      if (!err.message?.includes('401')) {
        showToast(err.message || 'Failed to load subscriptions', 'error');
      }
    }
    setLoading(false);
  }, [fetchAPI, showToast]);

  const loadSubscriptions = loadData; // Alias for refresh

  useEffect(() => {
    if (isOpen && subscriptions.length === 0 && federationNodes.length === 0) {
      loadData();
    }
  }, [isOpen, subscriptions.length, federationNodes.length, loadData]);

  const resetForm = () => {
    setFormSourceNode('');
    setFormCategories({ system: false, announcement: false, emergency: false });
    setEditingSub(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (sub) => {
    setEditingSub(sub);
    setFormSourceNode(sub.source_node);
    const cats = JSON.parse(sub.categories || '[]');
    setFormCategories({
      system: cats.includes('system'),
      announcement: cats.includes('announcement'),
      emergency: cats.includes('emergency'),
    });
    setShowAddModal(true);
  };

  const handleSave = async () => {
    const selectedCats = Object.entries(formCategories)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (!formSourceNode && !editingSub) {
      showToast('Please select a federation node', 'error');
      return;
    }
    if (selectedCats.length === 0) {
      showToast('Please select at least one category', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingSub) {
        await fetchAPI(`/admin/alert-subscriptions/${editingSub.id}`, {
          method: 'PUT',
          body: { categories: selectedCats }
        });
        showToast('Subscription updated', 'success');
      } else {
        await fetchAPI('/admin/alert-subscriptions', {
          method: 'POST',
          body: { sourceNode: formSourceNode, categories: selectedCats }
        });
        showToast('Subscription created', 'success');
      }
      setShowAddModal(false);
      loadSubscriptions();
    } catch (err) {
      showToast(err.message || 'Failed to save subscription', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (subId) => {
    if (!confirm('Unsubscribe from this node?')) return;
    try {
      await fetchAPI(`/admin/alert-subscriptions/${subId}`, { method: 'DELETE' });
      showToast('Subscription removed', 'success');
      loadSubscriptions();
    } catch (err) {
      showToast(err.message || 'Failed to remove subscription', 'error');
    }
  };

  const handleToggleStatus = async (sub) => {
    try {
      await fetchAPI(`/admin/alert-subscriptions/${sub.id}`, {
        method: 'PUT',
        body: { status: sub.status === 'active' ? 'paused' : 'active' }
      });
      showToast(`Subscription ${sub.status === 'active' ? 'paused' : 'resumed'}`, 'success');
      loadSubscriptions();
    } catch (err) {
      showToast(err.message || 'Failed to update subscription', 'error');
    }
  };

  // Get nodes we haven't subscribed to yet
  const subscribedNodes = subscriptions.map(s => s.source_node);
  const availableNodes = federationNodes.filter(n => !subscribedNodes.includes(n.node_name) && n.status === 'active');

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-purple)40',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', fontWeight: 500 }}>◇ ALERT SUBSCRIPTIONS</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-purple)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-purple)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : (
            <>
              {/* Info text */}
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '12px' }}>
                Subscribe to receive alerts from federated servers. Choose which categories to receive.
              </div>

              {/* Add button */}
              <div style={{ marginBottom: '16px' }}>
                <button onClick={openAddModal} disabled={availableNodes.length === 0} style={{
                  padding: isMobile ? '10px 16px' : '8px 14px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'var(--accent-purple)20',
                  border: '1px solid var(--accent-purple)',
                  color: 'var(--accent-purple)',
                  cursor: availableNodes.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                  opacity: availableNodes.length === 0 ? 0.5 : 1,
                }}>+ NEW SUBSCRIPTION</button>
                {availableNodes.length === 0 && federationNodes.length > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '8px' }}>
                    (subscribed to all nodes)
                  </span>
                )}
                {federationNodes.length === 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '8px' }}>
                    (no federation nodes configured)
                  </span>
                )}
              </div>

              {/* Subscriptions list */}
              {subscriptions.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No alert subscriptions configured
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {subscriptions.map(sub => {
                    const cats = JSON.parse(sub.categories || '[]');
                    return (
                      <div key={sub.id} style={{
                        padding: '12px',
                        background: 'var(--bg-surface)',
                        border: `1px solid ${sub.status === 'active' ? 'var(--accent-purple)40' : 'var(--border-subtle)'}`,
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: '8px',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        opacity: sub.status === 'paused' ? 0.6 : 1,
                      }}>
                        {/* Node name and categories */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--accent-purple)' }}>◇</span>
                            <span style={{
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                            }}>
                              {sub.source_node}
                            </span>
                            {sub.status === 'paused' && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>(paused)</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {cats.map(cat => (
                              <span key={cat} style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                background: 'var(--accent-purple)20',
                                border: '1px solid var(--accent-purple)40',
                                color: 'var(--accent-purple)',
                                fontFamily: 'monospace',
                              }}>
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleToggleStatus(sub)} style={{
                            padding: '4px 8px',
                            background: 'transparent',
                            border: '1px solid var(--border-secondary)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                          }}>{sub.status === 'active' ? 'PAUSE' : 'RESUME'}</button>
                          <button onClick={() => openEditModal(sub)} style={{
                            padding: '4px 8px',
                            background: 'transparent',
                            border: '1px solid var(--border-secondary)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                          }}>EDIT</button>
                          <button onClick={() => handleDelete(sub.id)} style={{
                            padding: '4px 8px',
                            background: 'transparent',
                            border: '1px solid var(--accent-orange)40',
                            color: 'var(--accent-orange)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                          }}>DEL</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)', padding: '16px',
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--accent-purple)',
            borderRadius: '4px', padding: isMobile ? '16px' : '24px',
            maxWidth: '400px', width: '100%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--accent-purple)', fontFamily: 'monospace' }}>
              {editingSub ? 'EDIT SUBSCRIPTION' : 'NEW SUBSCRIPTION'}
            </h3>

            {/* Node selector */}
            {!editingSub && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '4px' }}>FEDERATION NODE</label>
                <select
                  value={formSourceNode}
                  onChange={e => setFormSourceNode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select a node...</option>
                  {availableNodes.map(node => (
                    <option key={node.id} value={node.node_name}>{node.node_name}</option>
                  ))}
                </select>
              </div>
            )}

            {editingSub && (
              <div style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                Node: <span style={{ color: 'var(--accent-purple)' }}>{editingSub.source_node}</span>
              </div>
            )}

            {/* Category checkboxes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CATEGORIES TO RECEIVE</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableCategories.map(cat => (
                  <label key={cat} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'monospace',
                  }}>
                    <input
                      type="checkbox"
                      checked={formCategories[cat] || false}
                      onChange={e => setFormCategories(prev => ({ ...prev, [cat]: e.target.checked }))}
                      style={{ accentColor: 'var(--accent-purple)' }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)} style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
              }}>CANCEL</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-purple)20',
                border: '1px solid var(--accent-purple)',
                color: 'var(--accent-purple)',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
                opacity: saving ? 0.6 : 1,
              }}>{saving ? 'SAVING...' : (editingSub ? 'UPDATE' : 'SUBSCRIBE')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ FEDERATION ADMIN PANEL ============
const FederationAdminPanel = ({ fetchAPI, showToast, isMobile, refreshTrigger = 0, isOpen, onToggle }) => {
  const [status, setStatus] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeUrl, setNewNodeUrl] = useState('');
  const [handshakeLoading, setHandshakeLoading] = useState(null);
  // Federation request system
  const [federationRequests, setFederationRequests] = useState([]);
  const [requestUrl, setRequestUrl] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(null);

  const loadFederationData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, nodesData, requestsData] = await Promise.all([
        fetchAPI('/admin/federation/status'),
        fetchAPI('/admin/federation/nodes'),
        fetchAPI('/admin/federation/requests').catch(() => ({ requests: [] }))
      ]);
      setStatus(statusData);
      setNodes(nodesData.nodes || []);
      setFederationRequests(requestsData.requests || []);
      if (statusData.nodeName) {
        setNodeName(statusData.nodeName);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load federation data', 'error');
    }
    setLoading(false);
  }, [fetchAPI, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadFederationData();
    }
  }, [isOpen, loadFederationData, refreshTrigger]);

  const handleSetupIdentity = async () => {
    if (!nodeName.trim() || nodeName.length < 3) {
      showToast('Node name must be at least 3 characters', 'error');
      return;
    }
    try {
      await fetchAPI('/admin/federation/identity', {
        method: 'POST',
        body: { nodeName: nodeName.trim() }
      });
      showToast('Federation identity configured', 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to configure identity', 'error');
    }
  };

  const handleAddNode = async () => {
    if (!newNodeName.trim() || !newNodeUrl.trim()) {
      showToast('Node name and URL are required', 'error');
      return;
    }
    try {
      await fetchAPI('/admin/federation/nodes', {
        method: 'POST',
        body: { nodeName: newNodeName.trim(), baseUrl: newNodeUrl.trim() }
      });
      showToast('Node added successfully', 'success');
      setNewNodeName('');
      setNewNodeUrl('');
      setShowAddNode(false);
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to add node', 'error');
    }
  };

  const handleHandshake = async (nodeId) => {
    setHandshakeLoading(nodeId);
    try {
      const result = await fetchAPI(`/admin/federation/nodes/${nodeId}/handshake`, {
        method: 'POST'
      });
      showToast(result.message || 'Handshake successful', 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Handshake failed', 'error');
    }
    setHandshakeLoading(null);
  };

  const handleDeleteNode = async (nodeId) => {
    if (!confirm('Remove this federation node?')) return;
    try {
      await fetchAPI(`/admin/federation/nodes/${nodeId}`, { method: 'DELETE' });
      showToast('Node removed', 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to remove node', 'error');
    }
  };

  const handleStatusChange = async (nodeId, newStatus) => {
    try {
      await fetchAPI(`/admin/federation/nodes/${nodeId}`, {
        method: 'PUT',
        body: { status: newStatus }
      });
      showToast(`Node ${newStatus}`, 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  // Send federation request to another server
  const handleSendRequest = async () => {
    if (!requestUrl.trim()) {
      showToast('Server URL is required', 'error');
      return;
    }
    setRequestLoading(true);
    try {
      const result = await fetchAPI('/admin/federation/request', {
        method: 'POST',
        body: {
          baseUrl: requestUrl.trim(),
          message: requestMessage.trim() || null
        }
      });
      showToast(result.message || 'Federation request sent!', 'success');
      setRequestUrl('');
      setRequestMessage('');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to send federation request', 'error');
    }
    setRequestLoading(false);
  };

  // Accept incoming federation request
  const handleAcceptRequest = async (requestId) => {
    setAcceptLoading(requestId);
    try {
      const result = await fetchAPI(`/admin/federation/requests/${requestId}/accept`, {
        method: 'POST'
      });
      showToast(result.message || 'Federation request accepted!', 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to accept request', 'error');
    }
    setAcceptLoading(null);
  };

  // Decline incoming federation request
  const handleDeclineRequest = async (requestId) => {
    if (!confirm('Decline this federation request?')) return;
    setAcceptLoading(requestId);
    try {
      await fetchAPI(`/admin/federation/requests/${requestId}/decline`, {
        method: 'POST'
      });
      showToast('Federation request declined', 'success');
      loadFederationData();
    } catch (err) {
      showToast(err.message || 'Failed to decline request', 'error');
    }
    setAcceptLoading(null);
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'active': return 'var(--accent-green)';
      case 'pending': return 'var(--accent-amber)';
      case 'outbound_pending': return 'var(--accent-teal)';
      case 'suspended': return 'var(--accent-orange)';
      case 'blocked': return 'var(--status-error)';
      case 'declined': return 'var(--text-dim)';
      default: return 'var(--text-dim)';
    }
  };

  const getStatusLabel = (s) => {
    switch (s) {
      case 'outbound_pending': return 'AWAITING RESPONSE';
      case 'declined': return 'DECLINED';
      default: return s.toUpperCase();
    }
  };

  return (
    <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-teal)40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--accent-teal)', fontSize: '0.8rem', fontWeight: 500 }}>FEDERATION</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-teal)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</div>
          ) : (
            <>
              {/* Status Overview */}
      <div style={{
        marginTop: '16px',
        padding: isMobile ? '14px' : '16px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>Status</span>
          <span style={{
            padding: '2px 10px',
            background: status?.enabled ? 'var(--accent-green)20' : 'var(--text-dim)20',
            color: status?.enabled ? 'var(--accent-green)' : 'var(--text-dim)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
          }}>
            {status?.enabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        {!status?.enabled && (
          <div style={{
            padding: '12px',
            background: 'var(--accent-amber)10',
            border: '1px solid var(--accent-amber)40',
            color: 'var(--accent-amber)',
            fontSize: isMobile ? '0.85rem' : '0.8rem',
            marginBottom: '16px',
          }}>
            Set FEDERATION_ENABLED=true in server environment to enable federation.
          </div>
        )}

        {/* Server Identity Setup */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            Server Identity
          </div>

          {status?.configured ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--accent-teal)', fontFamily: 'monospace', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                {status.nodeName}
              </span>
              <span style={{
                padding: '2px 8px',
                background: 'var(--accent-green)20',
                color: 'var(--accent-green)',
                fontSize: '0.7rem',
              }}>
                {status.hasKeypair ? 'KEYPAIR OK' : 'NO KEYPAIR'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder="farhold.example.com"
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: isMobile ? '12px' : '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                }}
              />
              <button
                onClick={handleSetupIdentity}
                style={{
                  padding: isMobile ? '12px 20px' : '10px 20px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'var(--accent-teal)20',
                  border: '1px solid var(--accent-teal)',
                  color: 'var(--accent-teal)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                }}
              >
                CONFIGURE
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '24px', color: 'var(--text-dim)', fontSize: isMobile ? '0.85rem' : '0.8rem' }}>
          <span>Trusted Nodes: <span style={{ color: 'var(--text-primary)' }}>{status?.trustedNodes || 0}</span></span>
          <span>Active: <span style={{ color: 'var(--accent-green)' }}>{status?.activeNodes || 0}</span></span>
        </div>
      </div>

      {/* Request Federation Section */}
      {status?.configured && status?.enabled && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '12px' }}>
            Request Federation
          </div>
          <div style={{
            padding: isMobile ? '14px' : '16px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-purple)40',
          }}>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={requestUrl}
                onChange={(e) => setRequestUrl(e.target.value)}
                placeholder="Server URL (e.g., https://other-farhold.com)"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                  marginBottom: '8px',
                }}
              />
              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Optional message (e.g., Hi, we'd like to federate!)"
                rows={2}
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                  resize: 'vertical',
                }}
              />
            </div>
            <button
              onClick={handleSendRequest}
              disabled={requestLoading || !requestUrl.trim()}
              style={{
                padding: isMobile ? '12px 20px' : '10px 20px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-purple)20',
                border: '1px solid var(--accent-purple)',
                color: 'var(--accent-purple)',
                cursor: requestLoading || !requestUrl.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
                opacity: requestLoading || !requestUrl.trim() ? 0.6 : 1,
              }}
            >
              {requestLoading ? 'SENDING...' : 'REQUEST FEDERATION'}
            </button>
            <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Send a federation request to another Farhold server. They will need to accept your request.
            </div>
          </div>
        </div>
      )}

      {/* Incoming Federation Requests */}
      {federationRequests.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              Incoming Requests
            </span>
            <span style={{
              padding: '2px 8px',
              background: 'var(--accent-purple)20',
              color: 'var(--accent-purple)',
              fontSize: '0.7rem',
              borderRadius: '10px',
            }}>
              {federationRequests.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {federationRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  padding: isMobile ? '14px' : '12px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--accent-purple)40',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--accent-purple)', fontFamily: 'monospace', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                      {request.fromNodeName}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {new Date(request.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ color: 'var(--text-dim)', fontSize: isMobile ? '0.8rem' : '0.75rem', marginBottom: '8px' }}>
                  {request.fromBaseUrl}
                </div>

                {request.message && (
                  <div style={{
                    padding: '8px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                    fontStyle: 'italic',
                    marginBottom: '12px',
                  }}>
                    "{request.message}"
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    disabled={acceptLoading === request.id}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 14px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-green)20',
                      border: '1px solid var(--accent-green)',
                      color: 'var(--accent-green)',
                      cursor: acceptLoading === request.id ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.8rem' : '0.75rem',
                      opacity: acceptLoading === request.id ? 0.6 : 1,
                    }}
                  >
                    {acceptLoading === request.id ? 'ACCEPTING...' : 'ACCEPT'}
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(request.id)}
                    disabled={acceptLoading === request.id}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 14px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'transparent',
                      border: '1px solid var(--accent-orange)',
                      color: 'var(--accent-orange)',
                      cursor: acceptLoading === request.id ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.8rem' : '0.75rem',
                      opacity: acceptLoading === request.id ? 0.6 : 1,
                    }}
                  >
                    DECLINE
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trusted Nodes */}
      <div style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Trusted Nodes</span>
          <button
            onClick={() => setShowAddNode(!showAddNode)}
            style={{
              padding: isMobile ? '8px 14px' : '6px 12px',
              background: showAddNode ? 'var(--accent-teal)20' : 'transparent',
              border: `1px solid ${showAddNode ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
              color: showAddNode ? 'var(--accent-teal)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.8rem' : '0.75rem',
            }}
          >
            {showAddNode ? 'CANCEL' : '+ ADD NODE'}
          </button>
        </div>

        {/* Add Node Form */}
        {showAddNode && (
          <div style={{
            padding: isMobile ? '14px' : '16px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-teal)40',
            marginBottom: '12px',
          }}>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="Node name (e.g., other-farhold.com)"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                  marginBottom: '8px',
                }}
              />
              <input
                type="text"
                value={newNodeUrl}
                onChange={(e) => setNewNodeUrl(e.target.value)}
                placeholder="Base URL (e.g., https://other-farhold.com)"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                }}
              />
            </div>
            <button
              onClick={handleAddNode}
              style={{
                padding: isMobile ? '12px 20px' : '10px 20px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-teal)20',
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
              }}
            >
              ADD NODE
            </button>
          </div>
        )}

        {/* Node List */}
        {nodes.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-subtle)',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
          }}>
            No trusted nodes configured
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  padding: isMobile ? '14px' : '12px 16px',
                  background: 'var(--bg-surface)',
                  border: `1px solid ${node.status === 'active' ? 'var(--accent-green)40' : 'var(--border-subtle)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                      {node.nodeName}
                    </span>
                    <span style={{
                      marginLeft: '10px',
                      padding: '2px 8px',
                      background: `${getStatusColor(node.status)}20`,
                      color: getStatusColor(node.status),
                      fontSize: '0.7rem',
                    }}>
                      {getStatusLabel(node.status)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteNode(node.id)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid var(--accent-orange)40',
                      color: 'var(--accent-orange)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ color: 'var(--text-dim)', fontSize: isMobile ? '0.8rem' : '0.75rem', marginBottom: '8px' }}>
                  {node.baseUrl}
                </div>

                {node.lastContactAt && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '8px' }}>
                    Last contact: {new Date(node.lastContactAt).toLocaleString()}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {node.status === 'pending' && (
                    <button
                      onClick={() => handleHandshake(node.id)}
                      disabled={handshakeLoading === node.id}
                      style={{
                        padding: isMobile ? '10px 16px' : '8px 14px',
                        minHeight: isMobile ? '44px' : 'auto',
                        background: 'var(--accent-teal)20',
                        border: '1px solid var(--accent-teal)',
                        color: 'var(--accent-teal)',
                        cursor: handshakeLoading === node.id ? 'wait' : 'pointer',
                        fontFamily: 'monospace',
                        fontSize: isMobile ? '0.8rem' : '0.75rem',
                        opacity: handshakeLoading === node.id ? 0.6 : 1,
                      }}
                    >
                      {handshakeLoading === node.id ? 'CONNECTING...' : 'HANDSHAKE'}
                    </button>
                  )}

                  {node.status === 'outbound_pending' && (
                    <span style={{
                      padding: isMobile ? '10px 16px' : '8px 14px',
                      background: 'var(--accent-teal)10',
                      color: 'var(--accent-teal)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.8rem' : '0.75rem',
                    }}>
                      Waiting for their response...
                    </span>
                  )}

                  {node.status === 'declined' && (
                    <span style={{
                      padding: isMobile ? '10px 16px' : '8px 14px',
                      background: 'var(--text-dim)10',
                      color: 'var(--text-dim)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.8rem' : '0.75rem',
                    }}>
                      Request was declined
                    </span>
                  )}

                  {node.status === 'active' && (
                    <button
                      onClick={() => handleStatusChange(node.id, 'suspended')}
                      style={{
                        padding: isMobile ? '10px 16px' : '8px 14px',
                        minHeight: isMobile ? '44px' : 'auto',
                        background: 'transparent',
                        border: '1px solid var(--accent-orange)',
                        color: 'var(--accent-orange)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: isMobile ? '0.8rem' : '0.75rem',
                      }}
                    >
                      SUSPEND
                    </button>
                  )}

                  {node.status === 'suspended' && (
                    <>
                      <button
                        onClick={() => handleHandshake(node.id)}
                        disabled={handshakeLoading === node.id}
                        style={{
                          padding: isMobile ? '10px 16px' : '8px 14px',
                          minHeight: isMobile ? '44px' : 'auto',
                          background: 'var(--accent-green)20',
                          border: '1px solid var(--accent-green)',
                          color: 'var(--accent-green)',
                          cursor: handshakeLoading === node.id ? 'wait' : 'pointer',
                          fontFamily: 'monospace',
                          fontSize: isMobile ? '0.8rem' : '0.75rem',
                          opacity: handshakeLoading === node.id ? 0.6 : 1,
                        }}
                      >
                        REACTIVATE
                      </button>
                      <button
                        onClick={() => handleStatusChange(node.id, 'blocked')}
                        style={{
                          padding: isMobile ? '10px 16px' : '8px 14px',
                          minHeight: isMobile ? '44px' : 'auto',
                          background: 'transparent',
                          border: '1px solid var(--status-error)',
                          color: 'var(--status-error)',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: isMobile ? '0.8rem' : '0.75rem',
                        }}
                      >
                        BLOCK
                      </button>
                    </>
                  )}

                  {node.publicKey && (
                    <span style={{
                      padding: '4px 8px',
                      background: 'var(--accent-green)10',
                      color: 'var(--accent-green)',
                      fontSize: '0.7rem',
                    }}>
                      KEY OK
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============ HANDLE REQUESTS LIST (ADMIN) ============
const HandleRequestsList = ({ fetchAPI, showToast, isMobile, isOpen: controlledIsOpen, onToggle }) => {
  // Support both controlled (isOpen/onToggle props) and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const handleToggle = isControlled ? onToggle : () => setInternalIsOpen(!internalIsOpen);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/admin/handle-requests');
      setRequests(data);
    } catch (err) {
      showToast(err.message || 'Failed to load requests', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen]);

  const handleApprove = async (requestId) => {
    try {
      await fetchAPI(`/admin/handle-requests/${requestId}/approve`, { method: 'POST' });
      showToast('Handle change approved', 'success');
      loadRequests();
    } catch (err) {
      showToast(err.message || 'Failed to approve', 'error');
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt('Rejection reason (optional):');
    try {
      await fetchAPI(`/admin/handle-requests/${requestId}/reject`, {
        method: 'POST',
        body: { reason }
      });
      showToast('Handle change rejected', 'success');
      loadRequests();
    } catch (err) {
      showToast(err.message || 'Failed to reject', 'error');
    }
  };

  return (
    <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-amber)40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 500 }}>HANDLE REQUESTS</div>
        <button
          onClick={handleToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-amber)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-amber)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <LoadingSpinner />
          ) : requests.length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: isMobile ? '0.9rem' : '0.85rem',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            }}>
              No pending handle change requests
            </div>
          ) : (
            <div>
      {requests.map(req => (
        <div key={req.id} style={{
          padding: isMobile ? '14px' : '16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: isMobile ? '1rem' : '0.9rem', marginBottom: '4px' }}>
                {req.displayName}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.85rem' : '0.75rem', fontFamily: 'monospace' }}>
                @{req.currentHandle} → @{req.newHandle}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: isMobile ? '0.8rem' : '0.7rem', marginTop: '4px' }}>
                Requested: {new Date(req.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => handleApprove(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-green)20',
              border: '1px solid var(--accent-green)', color: 'var(--accent-green)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>APPROVE</button>

            <button onClick={() => handleReject(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-orange)20',
              border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>REJECT</button>
          </div>
        </div>
      ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ PROFILE SETTINGS ============
const ProfileSettings = ({ user, fetchAPI, showToast, onUserUpdate, onLogout, federationRequestsRefresh }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null);
  const [bio, setBio] = useState(user?.bio || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [showBlockedMuted, setShowBlockedMuted] = useState(false);
  // Accordion state - only one top-level section open at a time
  const [openSection, setOpenSection] = useState(null); // 'handle' | 'security' | 'display' | 'crawl' | 'notifications' | 'admin' | 'account' | null
  const toggleSection = (section) => setOpenSection(prev => prev === section ? null : section);
  // Accordion state for Security subsections
  const [openSecuritySection, setOpenSecuritySection] = useState(null); // 'password' | 'mfa' | 'e2ee' | 'sessions' | 'blocked' | null
  const toggleSecuritySection = (section) => setOpenSecuritySection(prev => prev === section ? null : section);
  // Accordion state for Admin Panel subsections
  const [openAdminSection, setOpenAdminSection] = useState(null); // 'users' | 'reports' | 'activity' | 'handles' | 'crawl' | 'alerts' | 'subscriptions' | 'federation' | null
  const toggleAdminSection = (section) => setOpenAdminSection(prev => prev === section ? null : section);
  const [notificationPrefs, setNotificationPrefs] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [mutedUsers, setMutedUsers] = useState([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(storage.getPushEnabled());
  const [crawlBarLocation, setCrawlBarLocation] = useState(user?.preferences?.crawlBar?.locationName || '');
  // MFA state
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaSetupStep, setMfaSetupStep] = useState(null); // 'totp-setup', 'totp-verify', 'email-setup', 'email-verify', 'email-disable'
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [emailChallengeId, setEmailChallengeId] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  // Session management state (v1.18.0)
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsEnabled, setSessionsEnabled] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  // Account management state (v1.18.0)
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  // E2EE Recovery Key state (v1.19.0)
  const [showE2EERecovery, setShowE2EERecovery] = useState(false);
  const [e2eeRecoveryKey, setE2eeRecoveryKey] = useState(null);
  const [e2eeRecoveryLoading, setE2eeRecoveryLoading] = useState(false);
  const [e2eeRecoveryCopied, setE2eeRecoveryCopied] = useState(false);
  const fileInputRef = useRef(null);
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();
  const e2ee = useE2EE();

  // Load blocked/muted users when section is expanded
  useEffect(() => {
    if (showBlockedMuted) {
      Promise.all([
        fetchAPI('/users/blocked'),
        fetchAPI('/users/muted')
      ]).then(([blockedData, mutedData]) => {
        setBlockedUsers(blockedData.blockedUsers || []);
        setMutedUsers(mutedData.mutedUsers || []);
      }).catch(err => {
        console.error('Failed to load blocked/muted users:', err);
      });
    }
  }, [showBlockedMuted, fetchAPI]);

  // Load notification preferences when section is expanded
  useEffect(() => {
    if (openSection === 'notifications' && !notificationPrefs) {
      fetchAPI('/notifications/preferences')
        .then(data => setNotificationPrefs(data.preferences))
        .catch(err => console.error('Failed to load notification preferences:', err));
    }
  }, [openSection, notificationPrefs, fetchAPI]);

  // Load MFA status when section is expanded
  useEffect(() => {
    if (openSecuritySection === 'mfa' && !mfaStatus) {
      fetchAPI('/auth/mfa/status')
        .then(data => setMfaStatus(data))
        .catch(err => console.error('Failed to load MFA status:', err));
    }
  }, [openSecuritySection, mfaStatus, fetchAPI]);

  // Load sessions when section is expanded (v1.18.0)
  useEffect(() => {
    if (openSecuritySection === 'sessions') {
      setSessionsLoading(true);
      fetchAPI('/auth/sessions')
        .then(data => {
          setSessions(data.sessions || []);
          setSessionsEnabled(data.enabled !== false);
        })
        .catch(err => {
          console.error('Failed to load sessions:', err);
          setSessionsEnabled(false);
        })
        .finally(() => setSessionsLoading(false));
    }
  }, [openSecuritySection, fetchAPI]);

  // Sync crawl bar location when user preferences change
  useEffect(() => {
    setCrawlBarLocation(user?.preferences?.crawlBar?.locationName || '');
  }, [user?.preferences?.crawlBar?.locationName]);

  // MFA handler functions
  const loadMfaStatus = async () => {
    try {
      const data = await fetchAPI('/auth/mfa/status');
      setMfaStatus(data);
    } catch (err) {
      console.error('Failed to load MFA status:', err);
    }
  };

  const handleStartTotpSetup = async () => {
    setMfaLoading(true);
    try {
      const data = await fetchAPI('/auth/mfa/totp/setup', { method: 'POST' });
      setTotpSetupData(data);
      setMfaSetupStep('totp-verify');
    } catch (err) {
      showToast(err.message || 'Failed to start TOTP setup', 'error');
    }
    setMfaLoading(false);
  };

  const handleVerifyTotp = async () => {
    setMfaLoading(true);
    try {
      const data = await fetchAPI('/auth/mfa/totp/verify', { method: 'POST', body: { code: totpVerifyCode } });
      setRecoveryCodes(data.recoveryCodes);
      setMfaSetupStep(null);
      setTotpSetupData(null);
      setTotpVerifyCode('');
      loadMfaStatus();
      showToast('TOTP enabled successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Invalid code. Please try again.', 'error');
    }
    setMfaLoading(false);
  };

  const handleDisableTotp = async () => {
    if (!mfaDisablePassword || !mfaDisableCode) {
      showToast('Password and code are required', 'error');
      return;
    }
    setMfaLoading(true);
    try {
      await fetchAPI('/auth/mfa/totp/disable', { method: 'POST', body: { password: mfaDisablePassword, code: mfaDisableCode } });
      setMfaDisablePassword('');
      setMfaDisableCode('');
      loadMfaStatus();
      showToast('TOTP disabled successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to disable TOTP', 'error');
    }
    setMfaLoading(false);
  };

  const handleStartEmailMfa = async () => {
    setMfaLoading(true);
    try {
      const data = await fetchAPI('/auth/mfa/email/enable', { method: 'POST' });
      setEmailChallengeId(data.challengeId);
      setMfaSetupStep('email-verify');
      showToast('Verification code sent to your email', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to start email MFA setup', 'error');
    }
    setMfaLoading(false);
  };

  const handleVerifyEmailMfa = async () => {
    setMfaLoading(true);
    try {
      const data = await fetchAPI('/auth/mfa/email/verify-setup', { method: 'POST', body: { challengeId: emailChallengeId, code: emailVerifyCode } });
      if (data.recoveryCodes) {
        setRecoveryCodes(data.recoveryCodes);
      }
      setMfaSetupStep(null);
      setEmailChallengeId(null);
      setEmailVerifyCode('');
      loadMfaStatus();
      showToast('Email MFA enabled successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Invalid code. Please try again.', 'error');
    }
    setMfaLoading(false);
  };

  const handleRequestDisableEmailMfa = async () => {
    if (!mfaDisablePassword) {
      showToast('Password is required', 'error');
      return;
    }
    setMfaLoading(true);
    try {
      const data = await fetchAPI('/auth/mfa/email/disable/request', { method: 'POST', body: { password: mfaDisablePassword } });
      setEmailChallengeId(data.challengeId);
      setMfaSetupStep('email-disable');
      setMfaDisablePassword('');
      showToast('Verification code sent to your email', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send verification code', 'error');
    }
    setMfaLoading(false);
  };

  const handleConfirmDisableEmailMfa = async () => {
    if (!emailVerifyCode || emailVerifyCode.length !== 6) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }
    setMfaLoading(true);
    try {
      await fetchAPI('/auth/mfa/email/disable', { method: 'POST', body: { challengeId: emailChallengeId, code: emailVerifyCode } });
      setMfaSetupStep(null);
      setEmailChallengeId(null);
      setEmailVerifyCode('');
      loadMfaStatus();
      showToast('Email MFA disabled successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Invalid verification code', 'error');
    }
    setMfaLoading(false);
  };

  const handleRegenerateRecoveryCodes = async () => {
    if (!mfaDisablePassword) {
      showToast('Password is required', 'error');
      return;
    }
    setMfaLoading(true);
    try {
      const body = { password: mfaDisablePassword };
      if (mfaStatus?.totpEnabled) {
        body.mfaMethod = 'totp';
        body.mfaCode = mfaDisableCode;
      }
      const data = await fetchAPI('/auth/mfa/recovery/regenerate', { method: 'POST', body });
      setRecoveryCodes(data.recoveryCodes);
      setMfaDisablePassword('');
      setMfaDisableCode('');
      showToast('Recovery codes regenerated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to regenerate recovery codes', 'error');
    }
    setMfaLoading(false);
  };

  // Session management handlers (v1.18.0)
  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await fetchAPI('/auth/sessions');
      setSessions(data.sessions || []);
      setSessionsEnabled(data.enabled !== false);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
    setSessionsLoading(false);
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await fetchAPI(`/auth/sessions/${sessionId}/revoke`, { method: 'POST' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      showToast('Session revoked', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to revoke session', 'error');
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      const data = await fetchAPI('/auth/sessions/revoke-all', { method: 'POST' });
      showToast(`${data.revoked} session(s) revoked`, 'success');
      loadSessions(); // Refresh the list
    } catch (err) {
      showToast(err.message || 'Failed to revoke sessions', 'error');
    }
  };

  const formatSessionDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const parseDeviceInfo = (userAgent) => {
    if (!userAgent || userAgent === 'Unknown') return { device: 'Unknown', browser: '' };

    let browser = '';
    let device = '';

    // Detect browser
    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Edg/')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else browser = 'Browser';

    // Detect device/OS
    if (userAgent.includes('iPhone')) device = 'iPhone';
    else if (userAgent.includes('iPad')) device = 'iPad';
    else if (userAgent.includes('Android')) device = 'Android';
    else if (userAgent.includes('Windows')) device = 'Windows';
    else if (userAgent.includes('Mac')) device = 'Mac';
    else if (userAgent.includes('Linux')) device = 'Linux';
    else device = 'Device';

    return { device, browser };
  };

  // Account management handlers (v1.18.0)
  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const response = await fetch(`${window.API_URL || ''}/api/account/export`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('farhold_token')}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `farhold-data-export-${user?.handle || 'user'}-${new Date().toISOString().split('T')[0]}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast('Data exported successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to export data', 'error');
    }
    setExportLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('Password required to delete account', 'error');
      return;
    }

    setDeleteLoading(true);
    try {
      await fetchAPI('/account/delete', {
        method: 'POST',
        body: { password: deletePassword }
      });

      showToast('Account deleted. Goodbye!', 'success');

      // Clear storage and logout
      setTimeout(() => {
        onLogout();
      }, 1500);
    } catch (err) {
      showToast(err.message || 'Failed to delete account', 'error');
      setDeleteLoading(false);
    }
  };

  const handleUpdateNotificationPrefs = async (updates) => {
    try {
      const data = await fetchAPI('/notifications/preferences', { method: 'PUT', body: updates });
      setNotificationPrefs(data.preferences);
      showToast('Notification preferences updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update notification preferences', 'error');
    }
  };

  const handleUnblock = async (userId, name) => {
    try {
      await fetchAPI(`/users/${userId}/block`, { method: 'DELETE' });
      setBlockedUsers(prev => prev.filter(u => u.blockedUserId !== userId));
      showToast(`Unblocked ${name}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unblock user', 'error');
    }
  };

  const handleUnmute = async (userId, name) => {
    try {
      await fetchAPI(`/users/${userId}/mute`, { method: 'DELETE' });
      setMutedUsers(prev => prev.filter(u => u.mutedUserId !== userId));
      showToast(`Unmuted ${name}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unmute user', 'error');
    }
  };

  const handleSaveProfile = async () => {
    try {
      const updated = await fetchAPI('/profile', { method: 'PUT', body: { displayName, email, avatar, bio } });
      showToast('Profile updated', 'success');
      onUserUpdate?.(updated);
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Allowed: jpg, png, gif, webp', 'error');
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large. Maximum size is 2MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${API_URL}/profile/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('farhold_token')}`,
        },
        body: formData,
      });

      // Try to parse as JSON, handle non-JSON responses gracefully
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || `Server error (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setAvatarUrl(data.avatarUrl);
      onUserUpdate?.({ ...user, avatarUrl: data.avatarUrl });
      showToast('Profile image uploaded', 'success');
    } catch (err) {
      console.error('Avatar upload error:', err);
      showToast(err.message || 'Failed to upload image', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await fetchAPI('/profile/avatar', { method: 'DELETE' });
      setAvatarUrl(null);
      onUserUpdate?.({ ...user, avatarUrl: null });
      showToast('Profile image removed', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to remove image', 'error');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    try {
      await fetchAPI('/profile/password', { method: 'POST', body: { currentPassword, newPassword } });

      // Re-encrypt E2EE private key with new password
      if (e2ee.isUnlocked && e2ee.reencryptWithPassword) {
        try {
          await e2ee.reencryptWithPassword(newPassword);
          showToast('Password and encryption updated', 'success');
        } catch (e2eeErr) {
          console.error('E2EE re-encryption failed:', e2eeErr);
          showToast('Password changed, but encryption update failed. You may need to use your recovery key on next login.', 'error');
        }
      } else {
        showToast('Password changed', 'success');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    }
  };

  const handleRequestHandleChange = async () => {
    if (!newHandle) return;
    try {
      await fetchAPI('/profile/handle-request', { method: 'POST', body: { newHandle } });
      showToast('Handle change request submitted', 'success');
      setNewHandle('');
    } catch (err) {
      showToast(err.message || 'Failed to request handle change', 'error');
    }
  };

  const handleUpdatePreferences = async (updates) => {
    try {
      const result = await fetchAPI('/profile/preferences', { method: 'PUT', body: updates });
      showToast('Preferences updated', 'success');
      // Update user with new preferences
      onUserUpdate?.({ ...user, preferences: result.preferences });
    } catch (err) {
      showToast(err.message || 'Failed to update preferences', 'error');
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
      <GlowText color="var(--accent-amber)" size="1.1rem">PROFILE SETTINGS</GlowText>

      {/* Profile Info */}
      <div style={{ marginTop: '24px', padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--border-subtle)' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '16px' }}>PROFILE</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <Avatar letter={avatar || displayName?.[0] || '?'} color="var(--accent-amber)" size={60} imageUrl={avatarUrl} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{displayName || user?.displayName}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>@{user?.handle}</div>
          </div>
        </div>

        {/* Profile Image Upload */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PROFILE IMAGE</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => handleAvatarUpload(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-green)20',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                cursor: uploadingAvatar ? 'wait' : 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.8rem',
              }}
            >
              {uploadingAvatar ? 'UPLOADING...' : 'UPLOAD IMAGE'}
            </button>
            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                style={{
                  padding: isMobile ? '10px 16px' : '8px 14px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent',
                  border: '1px solid var(--accent-orange)',
                  color: 'var(--accent-orange)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.85rem' : '0.8rem',
                }}
              >
                REMOVE IMAGE
              </button>
            )}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '4px' }}>
            Max 2MB. Formats: jpg, png, gif, webp. Image will be resized to 256×256.
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>DISPLAY NAME</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>EMAIL</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '4px' }}>
            Used for password recovery and email-based MFA.
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>FALLBACK AVATAR (1-2 characters)</label>
          <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value.slice(0, 2))} maxLength={2} style={inputStyle} />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '4px' }}>
            Shown when no profile image is set or if it fails to load.
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
            BIO <span style={{ color: 'var(--text-muted)' }}>({bio.length}/500)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={4}
            placeholder="Tell others about yourself..."
            style={{
              ...inputStyle,
              minHeight: '80px',
              resize: 'vertical',
            }}
          />
        </div>

        <button onClick={handleSaveProfile} style={{
          padding: '10px 20px', background: 'var(--accent-amber)20', border: '1px solid var(--accent-amber)',
          color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
        }}>SAVE PROFILE</button>
      </div>

      {/* Handle Change */}
      <CollapsibleSection title="HANDLE CHANGE" isOpen={openSection === 'handle'} onToggle={() => toggleSection('handle')} isMobile={isMobile}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
          Handle changes require admin approval. You can change your handle once every 30 days.
        </div>
        <div style={{ marginBottom: '16px' }}>
          <input type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value)}
            placeholder="New handle..." style={inputStyle} />
        </div>
        <button onClick={handleRequestHandleChange} disabled={!newHandle} style={{
          padding: '10px 20px',
          background: newHandle ? 'var(--accent-teal)20' : 'transparent',
          border: `1px solid ${newHandle ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
          color: newHandle ? 'var(--accent-teal)' : 'var(--text-muted)',
          cursor: newHandle ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
        }}>REQUEST CHANGE</button>
      </CollapsibleSection>

      {/* Security Section */}
      <CollapsibleSection title="🔒 SECURITY" isOpen={openSection === 'security'} onToggle={() => toggleSection('security')} isMobile={isMobile} accentColor="var(--accent-orange)">
        {/* Change Password Sub-section */}
        <CollapsibleSection title="CHANGE PASSWORD" isOpen={openSecuritySection === 'password'} onToggle={() => toggleSecuritySection('password')} isMobile={isMobile}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CURRENT PASSWORD</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>NEW PASSWORD</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower, number" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CONFIRM NEW PASSWORD</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password" style={{
                ...inputStyle,
                borderColor: confirmPassword && newPassword !== confirmPassword ? 'var(--accent-orange)' : 'var(--border-subtle)',
              }} />
            {confirmPassword && newPassword !== confirmPassword && (
              <div style={{ color: 'var(--accent-orange)', fontSize: '0.7rem', marginTop: '4px' }}>
                Passwords do not match
              </div>
            )}
          </div>
          <button onClick={handleChangePassword} disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword} style={{
            padding: '10px 20px',
            background: currentPassword && newPassword && confirmPassword && newPassword === confirmPassword ? 'var(--accent-orange)20' : 'transparent',
            border: `1px solid ${currentPassword && newPassword && confirmPassword && newPassword === confirmPassword ? 'var(--accent-orange)' : 'var(--border-primary)'}`,
            color: currentPassword && newPassword && confirmPassword && newPassword === confirmPassword ? 'var(--accent-orange)' : 'var(--text-muted)',
            cursor: currentPassword && newPassword && confirmPassword && newPassword === confirmPassword ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
          }}>CHANGE PASSWORD</button>
        </CollapsibleSection>

        {/* Two-Factor Authentication Sub-section */}
        <CollapsibleSection title="TWO-FACTOR AUTHENTICATION" isOpen={openSecuritySection === 'mfa'} onToggle={() => toggleSecuritySection('mfa')} isMobile={isMobile}>
          {mfaStatus ? (
              <>
                {/* Recovery Codes Modal/Display */}
                {recoveryCodes && (
                  <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)', borderRadius: '4px' }}>
                    <div style={{ color: 'var(--accent-amber)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                      ⚠️ Save Your Recovery Codes
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '12px' }}>
                      Store these codes in a safe place. Each code can only be used once. You won't be able to see them again!
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
                      {recoveryCodes.map((code, i) => (
                        <div key={i} style={{ padding: '8px', background: 'var(--bg-elevated)', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary)', textAlign: 'center' }}>
                          {code}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryCodes.join('\n'));
                          showToast('Recovery codes copied to clipboard', 'success');
                        }}
                        style={{ padding: '8px 16px', background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                      >
                        COPY CODES
                      </button>
                      <button
                        onClick={() => setRecoveryCodes(null)}
                        style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                      >
                        I'VE SAVED THEM
                      </button>
                    </div>
                  </div>
                )}

                {/* TOTP Setup UI */}
                {mfaSetupStep === 'totp-verify' && totpSetupData && (
                  <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                      Setup Authenticator App
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </div>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <img src={totpSetupData.qrCodeDataUrl} alt="TOTP QR Code" style={{ maxWidth: '200px', border: '4px solid white' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '4px' }}>Or enter this key manually:</div>
                      <div style={{ padding: '8px', background: 'var(--bg-base)', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-amber)', wordBreak: 'break-all' }}>
                        {totpSetupData.secret}
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                        Enter the 6-digit code from your app:
                      </label>
                      <input
                        type="text"
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.3em' }}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleVerifyTotp}
                        disabled={totpVerifyCode.length !== 6 || mfaLoading}
                        style={{ padding: '10px 20px', background: totpVerifyCode.length === 6 ? 'var(--accent-green)20' : 'transparent', border: `1px solid ${totpVerifyCode.length === 6 ? 'var(--accent-green)' : 'var(--border-primary)'}`, color: totpVerifyCode.length === 6 ? 'var(--accent-green)' : 'var(--text-muted)', cursor: totpVerifyCode.length === 6 ? 'pointer' : 'not-allowed', fontFamily: 'monospace' }}
                      >
                        {mfaLoading ? 'VERIFYING...' : 'VERIFY & ENABLE'}
                      </button>
                      <button
                        onClick={() => { setMfaSetupStep(null); setTotpSetupData(null); setTotpVerifyCode(''); }}
                        style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace' }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                {/* Email MFA Verify UI */}
                {mfaSetupStep === 'email-verify' && (
                  <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                      Verify Email MFA
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
                      Enter the 6-digit code we sent to your email address.
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <input
                        type="text"
                        value={emailVerifyCode}
                        onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.3em' }}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleVerifyEmailMfa}
                        disabled={emailVerifyCode.length !== 6 || mfaLoading}
                        style={{ padding: '10px 20px', background: emailVerifyCode.length === 6 ? 'var(--accent-green)20' : 'transparent', border: `1px solid ${emailVerifyCode.length === 6 ? 'var(--accent-green)' : 'var(--border-primary)'}`, color: emailVerifyCode.length === 6 ? 'var(--accent-green)' : 'var(--text-muted)', cursor: emailVerifyCode.length === 6 ? 'pointer' : 'not-allowed', fontFamily: 'monospace' }}
                      >
                        {mfaLoading ? 'VERIFYING...' : 'VERIFY & ENABLE'}
                      </button>
                      <button
                        onClick={() => { setMfaSetupStep(null); setEmailChallengeId(null); setEmailVerifyCode(''); }}
                        style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace' }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                {/* Email MFA Disable Verify UI */}
                {mfaSetupStep === 'email-disable' && (
                  <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                      Confirm Email MFA Disable
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
                      Enter the 6-digit code we sent to your email to confirm disabling Email MFA.
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <input
                        type="text"
                        value={emailVerifyCode}
                        onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.3em' }}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleConfirmDisableEmailMfa}
                        disabled={emailVerifyCode.length !== 6 || mfaLoading}
                        style={{ padding: '10px 20px', background: emailVerifyCode.length === 6 ? 'var(--accent-orange)20' : 'transparent', border: `1px solid ${emailVerifyCode.length === 6 ? 'var(--accent-orange)' : 'var(--border-primary)'}`, color: emailVerifyCode.length === 6 ? 'var(--accent-orange)' : 'var(--text-muted)', cursor: emailVerifyCode.length === 6 ? 'pointer' : 'not-allowed', fontFamily: 'monospace' }}
                      >
                        {mfaLoading ? 'DISABLING...' : 'CONFIRM DISABLE'}
                      </button>
                      <button
                        onClick={() => { setMfaSetupStep(null); setEmailChallengeId(null); setEmailVerifyCode(''); }}
                        style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace' }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                {/* MFA Status Display */}
                {!mfaSetupStep && (
                  <>
                    {/* TOTP Section */}
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', border: `1px solid ${mfaStatus.totpEnabled ? 'var(--accent-green)' : 'var(--border-subtle)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          🔑 Authenticator App (TOTP)
                        </div>
                        <div style={{ color: mfaStatus.totpEnabled ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {mfaStatus.totpEnabled ? '✓ ENABLED' : 'NOT SET UP'}
                        </div>
                      </div>
                      {mfaStatus.totpEnabled ? (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <input type="password" value={mfaDisablePassword} onChange={(e) => setMfaDisablePassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, marginBottom: '8px' }} />
                            <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '4px' }}>
                              Enter the 6-digit code from your authenticator app:
                            </div>
                            <input type="text" value={mfaDisableCode} onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.2em' }} />
                          </div>
                          <button onClick={handleDisableTotp} disabled={mfaLoading} style={{ padding: '8px 16px', background: 'var(--accent-orange)20', border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {mfaLoading ? 'DISABLING...' : 'DISABLE TOTP'}
                          </button>
                        </div>
                      ) : (
                        <button onClick={handleStartTotpSetup} disabled={mfaLoading} style={{ padding: '8px 16px', background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {mfaLoading ? 'LOADING...' : 'SETUP AUTHENTICATOR'}
                        </button>
                      )}
                    </div>

                    {/* Email MFA Section */}
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', border: `1px solid ${mfaStatus.emailMfaEnabled ? 'var(--accent-green)' : 'var(--border-subtle)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          ✉️ Email Verification
                        </div>
                        <div style={{ color: mfaStatus.emailMfaEnabled ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {mfaStatus.emailMfaEnabled ? '✓ ENABLED' : 'NOT SET UP'}
                        </div>
                      </div>
                      {mfaStatus.emailMfaEnabled ? (
                        <div style={{ marginTop: '12px' }}>
                          <input type="password" value={mfaDisablePassword} onChange={(e) => setMfaDisablePassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, marginBottom: '8px' }} />
                          <button onClick={handleRequestDisableEmailMfa} disabled={mfaLoading} style={{ padding: '8px 16px', background: 'var(--accent-orange)20', border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {mfaLoading ? 'SENDING CODE...' : 'DISABLE EMAIL MFA'}
                          </button>
                        </div>
                      ) : (
                        <button onClick={handleStartEmailMfa} disabled={mfaLoading || !user?.email} style={{ padding: '8px 16px', background: user?.email ? 'var(--accent-teal)20' : 'transparent', border: `1px solid ${user?.email ? 'var(--accent-teal)' : 'var(--border-primary)'}`, color: user?.email ? 'var(--accent-teal)' : 'var(--text-muted)', cursor: user?.email ? 'pointer' : 'not-allowed', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {mfaLoading ? 'LOADING...' : user?.email ? 'SETUP EMAIL MFA' : 'EMAIL REQUIRED'}
                        </button>
                      )}
                    </div>

                    {/* Recovery Codes Section */}
                    {(mfaStatus.totpEnabled || mfaStatus.emailMfaEnabled) && (
                      <div style={{ padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                            🔐 Recovery Codes
                          </div>
                          <div style={{ color: mfaStatus.hasRecoveryCodes ? 'var(--accent-green)' : 'var(--accent-orange)', fontSize: '0.75rem' }}>
                            {mfaStatus.hasRecoveryCodes ? '✓ AVAILABLE' : '⚠️ NOT SET'}
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                          Recovery codes let you access your account if you lose your authentication device.
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <input type="password" value={mfaDisablePassword} onChange={(e) => setMfaDisablePassword(e.target.value)} placeholder="Password" style={{ ...inputStyle, marginBottom: '8px' }} />
                          {mfaStatus.totpEnabled && (
                            <>
                              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '4px' }}>
                                Enter the 6-digit code from your authenticator app:
                              </div>
                              <input type="text" value={mfaDisableCode} onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" style={{ ...inputStyle, fontFamily: 'monospace', marginBottom: '8px', letterSpacing: '0.2em' }} />
                            </>
                          )}
                          <button onClick={handleRegenerateRecoveryCodes} disabled={mfaLoading} style={{ padding: '8px 16px', background: 'var(--accent-amber)20', border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {mfaLoading ? 'GENERATING...' : 'REGENERATE CODES'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
              Loading MFA settings...
            </div>
          )}
        </CollapsibleSection>

        {/* E2EE Recovery Key Sub-section */}
        {e2ee.isE2EEEnabled && (
          <CollapsibleSection title="E2EE RECOVERY KEY" isOpen={openSecuritySection === 'e2ee'} onToggle={() => toggleSecuritySection('e2ee')} isMobile={isMobile}>
            <div>
              {/* Display regenerated recovery key */}
              {e2eeRecoveryKey && (
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--accent-green)10', border: '2px solid var(--accent-green)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--accent-green)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                    🔐 New Recovery Key Generated
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '12px' }}>
                    Save this key in a safe place. You'll need it to recover access if your password changes.
                  </div>
                  <div style={{ padding: '16px', background: 'var(--bg-base)', border: '1px solid var(--accent-green)', borderRadius: '4px', textAlign: 'center', marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '2px', color: 'var(--accent-green)', wordBreak: 'break-all', userSelect: 'all' }}>
                      {e2eeRecoveryKey}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(e2eeRecoveryKey);
                          setE2eeRecoveryCopied(true);
                          setTimeout(() => setE2eeRecoveryCopied(false), 2000);
                        } catch (err) {
                          console.error('Failed to copy:', err);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: e2eeRecoveryCopied ? 'var(--accent-green)' : 'var(--accent-green)20',
                        border: '1px solid var(--accent-green)',
                        color: e2eeRecoveryCopied ? 'var(--bg-base)' : 'var(--accent-green)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem'
                      }}
                    >
                      {e2eeRecoveryCopied ? '✓ COPIED' : 'COPY KEY'}
                    </button>
                    <button
                      onClick={() => setE2eeRecoveryKey(null)}
                      style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                    >
                      I'VE SAVED IT
                    </button>
                  </div>
                  <div style={{ marginTop: '12px', padding: '8px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)', borderRadius: '4px' }}>
                    <div style={{ color: 'var(--accent-orange)', fontSize: '0.75rem' }}>
                      ⚠️ This key will only be shown once. Your old recovery key is now invalid.
                    </div>
                  </div>
                </div>
              )}

              {/* Main recovery key info */}
              {!e2eeRecoveryKey && (
                <>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>
                    Your recovery key allows you to regain access to your encrypted messages.
                    Your encryption is tied to your login password - if you change your password, the encryption is automatically updated.
                    If you've lost your recovery key, you can generate a new one below.
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ color: 'var(--accent-green)', fontSize: '0.85rem' }}>
                      🔐 End-to-End Encryption Active
                    </span>
                  </div>

                  <button
                    onClick={async () => {
                      if (!e2ee.isUnlocked) {
                        showToast('Please unlock E2EE first', 'error');
                        return;
                      }
                      setE2eeRecoveryLoading(true);
                      try {
                        const result = await e2ee.regenerateRecoveryKey();
                        if (result.success) {
                          setE2eeRecoveryKey(result.recoveryKey);
                          showToast('New recovery key generated', 'success');
                        }
                      } catch (err) {
                        console.error('Failed to regenerate recovery key:', err);
                        showToast(err.message || 'Failed to regenerate recovery key', 'error');
                      } finally {
                        setE2eeRecoveryLoading(false);
                      }
                    }}
                    disabled={!e2ee.isUnlocked || e2eeRecoveryLoading}
                    style={{
                      padding: '10px 20px',
                      background: e2ee.isUnlocked ? 'var(--accent-teal)20' : 'transparent',
                      border: `1px solid ${e2ee.isUnlocked ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
                      color: e2ee.isUnlocked ? 'var(--accent-teal)' : 'var(--text-muted)',
                      cursor: e2ee.isUnlocked ? 'pointer' : 'not-allowed',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem'
                    }}
                  >
                    {e2eeRecoveryLoading ? 'GENERATING...' : '🔑 REGENERATE RECOVERY KEY'}
                  </button>

                  <div style={{ marginTop: '12px', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    Note: Generating a new recovery key will invalidate your previous recovery key.
                  </div>
                </>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Active Sessions Sub-section */}
        <CollapsibleSection title="ACTIVE SESSIONS" isOpen={openSecuritySection === 'sessions'} onToggle={() => toggleSecuritySection('sessions')} isMobile={isMobile}>
          {!sessionsEnabled ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                Session management is not enabled on this server.
              </div>
            ) : sessionsLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                Loading sessions...
              </div>
            ) : (
              <>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '16px' }}>
                  Manage your active login sessions. Revoking a session will log out that device.
                </div>

                {sessions.length > 0 ? (
                  <>
                    {sessions.map(session => {
                      const { device, browser } = parseDeviceInfo(session.deviceInfo);
                      return (
                        <div
                          key={session.id}
                          style={{
                            marginBottom: '12px',
                            padding: '12px',
                            background: session.isCurrent ? 'var(--accent-green)10' : 'var(--bg-elevated)',
                            border: `1px solid ${session.isCurrent ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                  {device} {browser && `• ${browser}`}
                                </span>
                                {session.isCurrent && (
                                  <span style={{
                                    padding: '2px 6px',
                                    background: 'var(--accent-green)20',
                                    border: '1px solid var(--accent-green)',
                                    color: 'var(--accent-green)',
                                    fontSize: '0.65rem',
                                    borderRadius: '3px',
                                  }}>
                                    THIS DEVICE
                                  </span>
                                )}
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {session.ipAddress} • Active {formatSessionDate(session.lastActive)}
                              </div>
                              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: '2px' }}>
                                Created {formatSessionDate(session.createdAt)}
                              </div>
                            </div>
                            {!session.isCurrent && (
                              <button
                                onClick={() => handleRevokeSession(session.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: 'var(--accent-orange)20',
                                  border: '1px solid var(--accent-orange)',
                                  color: 'var(--accent-orange)',
                                  cursor: 'pointer',
                                  fontFamily: 'monospace',
                                  fontSize: '0.7rem',
                                }}
                              >
                                REVOKE
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {sessions.filter(s => !s.isCurrent).length > 0 && (
                      <button
                        onClick={handleRevokeAllSessions}
                        style={{
                          marginTop: '8px',
                          padding: '10px 20px',
                          background: 'var(--accent-orange)20',
                          border: '1px solid var(--accent-orange)',
                          color: 'var(--accent-orange)',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          width: '100%',
                        }}
                      >
                        LOGOUT ALL OTHER DEVICES
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                    No active sessions found.
                  </div>
                )}
              </>
            )}
        </CollapsibleSection>

        {/* Blocked & Muted Users Sub-section */}
        <CollapsibleSection title="BLOCKED & MUTED USERS" isOpen={openSecuritySection === 'blocked'} onToggle={() => toggleSecuritySection('blocked')} isMobile={isMobile}>
          {/* Blocked Users */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--accent-orange)', fontSize: '0.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⊘</span> BLOCKED ({blockedUsers.length})
            </div>
            {blockedUsers.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-hover)' }}>
                No blocked users. Blocked users cannot send you contact requests, invite you to crews, or have their messages shown to you.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {blockedUsers.map(u => (
                  <div key={u.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--accent-orange)10',
                    border: '1px solid var(--accent-orange)30',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar letter={u.avatar || u.displayName?.[0] || '?'} color="var(--accent-orange)" size={28} />
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>{u.displayName}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnblock(u.blockedUserId, u.displayName)}
                      style={{
                        padding: isMobile ? '8px 12px' : '6px 10px',
                        minHeight: isMobile ? '40px' : 'auto',
                        background: 'var(--accent-green)20',
                        border: '1px solid var(--accent-green)',
                        color: 'var(--accent-green)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                      }}
                    >UNBLOCK</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Muted Users */}
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🔇</span> MUTED ({mutedUsers.length})
            </div>
            {mutedUsers.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-hover)' }}>
                No muted users. Muted users can still interact with you, but their messages will be hidden from view.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mutedUsers.map(u => (
                  <div key={u.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar letter={u.avatar || u.displayName?.[0] || '?'} color="var(--text-dim)" size={28} />
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{u.displayName}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnmute(u.mutedUserId, u.displayName)}
                      style={{
                        padding: isMobile ? '8px 12px' : '6px 10px',
                        minHeight: isMobile ? '40px' : 'auto',
                        background: 'var(--accent-green)20',
                        border: '1px solid var(--accent-green)',
                        color: 'var(--accent-green)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                      }}
                    >UNMUTE</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>

      </CollapsibleSection>

      {/* Display Preferences */}
      <CollapsibleSection title="DISPLAY PREFERENCES" isOpen={openSection === 'display'} onToggle={() => toggleSection('display')} isMobile={isMobile}>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>THEME</label>
          <select
            value={user?.preferences?.theme || 'firefly'}
            onChange={(e) => handleUpdatePreferences({ theme: e.target.value })}
            style={{
              ...inputStyle,
              cursor: 'pointer',
            }}
          >
            {Object.entries(THEMES).map(([key, config]) => (
              <option key={key} value={key}>{config.name}</option>
            ))}
          </select>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
            {THEMES[user?.preferences?.theme || 'firefly']?.description}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>FONT SIZE</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(FONT_SIZES).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleUpdatePreferences({ fontSize: key })}
                style={{
                  padding: isMobile ? '10px 16px' : '8px 16px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: (user?.preferences?.fontSize || 'medium') === key ? 'var(--accent-amber)20' : 'transparent',
                  border: `1px solid ${(user?.preferences?.fontSize || 'medium') === key ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                  color: (user?.preferences?.fontSize || 'medium') === key ? 'var(--accent-amber)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: key === 'small' ? '0.75rem' : key === 'large' ? '1rem' : key === 'xlarge' ? '1.1rem' : '0.85rem',
                }}
              >
                {config.name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CRT SCAN LINES</label>
          <button
            onClick={() => handleUpdatePreferences({ scanLines: !(user?.preferences?.scanLines !== false) })}
            style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: (user?.preferences?.scanLines !== false) ? 'var(--accent-amber)20' : 'transparent',
              border: `1px solid ${(user?.preferences?.scanLines !== false) ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
              color: (user?.preferences?.scanLines !== false) ? 'var(--accent-amber)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {(user?.preferences?.scanLines !== false) ? '▣ ENABLED' : '▢ DISABLED'}
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
            Disable for improved readability
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>AUTO-FOCUS PINGS</label>
          <button
            onClick={() => handleUpdatePreferences({ autoFocusDroplets: !(user?.preferences?.autoFocusDroplets === true) })}
            style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: (user?.preferences?.autoFocusDroplets === true) ? 'var(--accent-teal)20' : 'transparent',
              border: `1px solid ${(user?.preferences?.autoFocusDroplets === true) ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
              color: (user?.preferences?.autoFocusDroplets === true) ? 'var(--accent-teal)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {(user?.preferences?.autoFocusDroplets === true) ? '⤢ ENABLED' : '⤢ DISABLED'}
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
            Automatically enter Focus View when clicking pings with replies
          </div>
        </div>

        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          ℹ️ Theme customization will change colors throughout the app (coming soon). Other changes take effect immediately.
        </div>
      </CollapsibleSection>

      {/* Crawl Bar Preferences */}
      <CollapsibleSection title="CRAWL BAR" isOpen={openSection === 'crawl'} onToggle={() => toggleSection('crawl')} isMobile={isMobile}>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>ENABLE CRAWL BAR</label>
          <button
            onClick={() => handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, enabled: !(user?.preferences?.crawlBar?.enabled !== false) } })}
            style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: (user?.preferences?.crawlBar?.enabled !== false) ? 'var(--accent-teal)20' : 'transparent',
              border: `1px solid ${(user?.preferences?.crawlBar?.enabled !== false) ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
              color: (user?.preferences?.crawlBar?.enabled !== false) ? 'var(--accent-teal)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {(user?.preferences?.crawlBar?.enabled !== false) ? '▣ ENABLED' : '▢ DISABLED'}
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
            Show scrolling ticker with stocks, weather, and news
          </div>
        </div>

        {(user?.preferences?.crawlBar?.enabled !== false) && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CONTENT</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, showStocks: !(user?.preferences?.crawlBar?.showStocks !== false) } })}
                  style={{
                    padding: isMobile ? '10px 16px' : '8px 16px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: (user?.preferences?.crawlBar?.showStocks !== false) ? 'var(--accent-green)20' : 'transparent',
                    border: `1px solid ${(user?.preferences?.crawlBar?.showStocks !== false) ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                    color: (user?.preferences?.crawlBar?.showStocks !== false) ? 'var(--accent-green)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.9rem' : '0.85rem',
                  }}
                >
                  📈 STOCKS
                </button>
                <button
                  onClick={() => handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, showWeather: !(user?.preferences?.crawlBar?.showWeather !== false) } })}
                  style={{
                    padding: isMobile ? '10px 16px' : '8px 16px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: (user?.preferences?.crawlBar?.showWeather !== false) ? 'var(--accent-teal)20' : 'transparent',
                    border: `1px solid ${(user?.preferences?.crawlBar?.showWeather !== false) ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                    color: (user?.preferences?.crawlBar?.showWeather !== false) ? 'var(--accent-teal)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.9rem' : '0.85rem',
                  }}
                >
                  🌡️ WEATHER
                </button>
                <button
                  onClick={() => handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, showNews: !(user?.preferences?.crawlBar?.showNews !== false) } })}
                  style={{
                    padding: isMobile ? '10px 16px' : '8px 16px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: (user?.preferences?.crawlBar?.showNews !== false) ? 'var(--accent-purple)20' : 'transparent',
                    border: `1px solid ${(user?.preferences?.crawlBar?.showNews !== false) ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                    color: (user?.preferences?.crawlBar?.showNews !== false) ? 'var(--accent-purple)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.9rem' : '0.85rem',
                  }}
                >
                  ◆ NEWS
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>SCROLL SPEED</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['slow', 'normal', 'fast'].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, scrollSpeed: speed } })}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: (user?.preferences?.crawlBar?.scrollSpeed || 'normal') === speed ? 'var(--accent-amber)20' : 'transparent',
                      border: `1px solid ${(user?.preferences?.crawlBar?.scrollSpeed || 'normal') === speed ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                      color: (user?.preferences?.crawlBar?.scrollSpeed || 'normal') === speed ? 'var(--accent-amber)' : 'var(--text-dim)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  >
                    {speed.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>LOCATION OVERRIDE</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="e.g., New York, NY or Coudersport, US"
                  value={crawlBarLocation}
                  onChange={(e) => setCrawlBarLocation(e.target.value)}
                  style={{
                    flex: 1,
                    padding: isMobile ? '12px' : '10px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.9rem' : '0.85rem',
                  }}
                />
                <button
                  onClick={() => {
                    handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, locationName: crawlBarLocation || null, location: null } });
                  }}
                  disabled={crawlBarLocation === (user?.preferences?.crawlBar?.locationName || '')}
                  style={{
                    padding: isMobile ? '10px 12px' : '8px 12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: crawlBarLocation !== (user?.preferences?.crawlBar?.locationName || '') ? 'var(--accent-amber)20' : 'transparent',
                    border: `1px solid ${crawlBarLocation !== (user?.preferences?.crawlBar?.locationName || '') ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                    color: crawlBarLocation !== (user?.preferences?.crawlBar?.locationName || '') ? 'var(--accent-amber)' : 'var(--text-muted)',
                    cursor: crawlBarLocation !== (user?.preferences?.crawlBar?.locationName || '') ? 'pointer' : 'default',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '0.9rem' : '0.85rem',
                  }}
                >
                  SAVE
                </button>
                {(crawlBarLocation || user?.preferences?.crawlBar?.locationName) && (
                  <button
                    onClick={() => {
                      setCrawlBarLocation('');
                      handleUpdatePreferences({ crawlBar: { ...user?.preferences?.crawlBar, locationName: null, location: null } });
                    }}
                    style={{
                      padding: isMobile ? '10px 12px' : '8px 12px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  >
                    CLEAR
                  </button>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                Enter city name (e.g., "Coudersport, US") then click SAVE
              </div>
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* Notification Preferences */}
      <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 500 }}>NOTIFICATION PREFERENCES</div>
          <button
            onClick={() => toggleSection('notifications')}
            style={{
              padding: isMobile ? '8px 12px' : '6px 10px',
              background: openSection === 'notifications' ? 'var(--accent-amber)20' : 'transparent',
              border: `1px solid ${openSection === 'notifications' ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
              color: openSection === 'notifications' ? 'var(--accent-amber)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
            }}
          >
            {openSection === 'notifications' ? '▼ HIDE' : '▶ SHOW'}
          </button>
        </div>

        {openSection === 'notifications' && notificationPrefs && (
          <div>
            {/* Global Enable */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                NOTIFICATIONS
              </label>
              <button
                onClick={() => handleUpdateNotificationPrefs({ enabled: !notificationPrefs.enabled })}
                style={{
                  padding: isMobile ? '10px 16px' : '8px 16px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: notificationPrefs.enabled ? 'var(--accent-green)20' : 'transparent',
                  border: `1px solid ${notificationPrefs.enabled ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                  color: notificationPrefs.enabled ? 'var(--accent-green)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: isMobile ? '0.9rem' : '0.85rem',
                }}
              >
                {notificationPrefs.enabled ? '🔔 ENABLED' : '🔕 DISABLED'}
              </button>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                Master switch for all in-app notifications
              </div>
            </div>

            {notificationPrefs.enabled && (
              <>
                {/* Notification Type Preferences */}
                {[
                  { key: 'directMentions', label: '@MENTIONS', icon: '@', desc: 'When someone @mentions you' },
                  { key: 'replies', label: 'REPLIES', icon: '↩', desc: 'When someone replies to your ping' },
                  { key: 'waveActivity', label: 'WAVE ACTIVITY', icon: '◎', desc: 'New pings in your waves' },
                  { key: 'rippleEvents', label: 'BURST EVENTS', icon: '◈', desc: 'When pings are burst to new waves' },
                ].map(({ key, label, icon, desc }) => (
                  <div key={key} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                      {icon} {label}
                    </label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { value: 'always', label: 'Always' },
                        { value: 'app_closed', label: 'App Closed' },
                        { value: 'never', label: 'Never' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleUpdateNotificationPrefs({ [key]: opt.value })}
                          style={{
                            padding: isMobile ? '8px 12px' : '6px 12px',
                            minHeight: isMobile ? '40px' : 'auto',
                            background: notificationPrefs[key] === opt.value ? 'var(--accent-amber)20' : 'transparent',
                            border: `1px solid ${notificationPrefs[key] === opt.value ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                            color: notificationPrefs[key] === opt.value ? 'var(--accent-amber)' : 'var(--text-dim)',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                          }}
                        >
                          {opt.label.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem', marginTop: '4px' }}>
                      {desc}
                    </div>
                  </div>
                ))}

                {/* Suppress While Focused */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                    SUPPRESS WHILE VIEWING
                  </label>
                  <button
                    onClick={() => handleUpdateNotificationPrefs({ suppressWhileFocused: !notificationPrefs.suppressWhileFocused })}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: notificationPrefs.suppressWhileFocused ? 'var(--accent-amber)20' : 'transparent',
                      border: `1px solid ${notificationPrefs.suppressWhileFocused ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                      color: notificationPrefs.suppressWhileFocused ? 'var(--accent-amber)' : 'var(--text-dim)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  >
                    {notificationPrefs.suppressWhileFocused ? '▣ ENABLED' : '▢ DISABLED'}
                  </button>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                    Don't show wave activity notifications when you're viewing that wave
                  </div>
                </div>

                {/* Push Notifications */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
                    📲 PUSH NOTIFICATIONS
                  </label>
                  <button
                    onClick={async () => {
                      const token = storage.getToken();
                      if (pushEnabled) {
                        storage.setPushEnabled(false);
                        setPushEnabled(false);
                        await unsubscribeFromPush(token);
                        showToast('Push notifications disabled', 'success');
                      } else {
                        const result = await subscribeToPush(token);
                        if (result.success) {
                          storage.setPushEnabled(true);
                          setPushEnabled(true);
                          showToast('Push notifications enabled', 'success');
                        } else {
                          showToast(result.reason || 'Failed to enable push notifications', 'error');
                        }
                      }
                    }}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: pushEnabled ? 'var(--accent-green)20' : 'transparent',
                      border: `1px solid ${pushEnabled ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                      color: pushEnabled ? 'var(--accent-green)' : 'var(--text-dim)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  >
                    {pushEnabled ? '🔔 ENABLED' : '🔕 DISABLED'}
                  </button>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                    Receive notifications when the app is closed or in background
                  </div>
                  {/iPad|iPhone|iPod/.test(navigator.userAgent) && (
                    <div style={{ color: 'var(--accent-orange)', fontSize: '0.65rem', marginTop: '6px', padding: '6px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>
                      ⚠️ iOS does not support push notifications for web apps. This is a platform limitation by Apple.
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>
              ℹ️ "Always" shows notifications even when viewing the app. "App Closed" only notifies when the app is in background. "Never" disables that notification type.
            </div>
          </div>
        )}

        {openSection === 'notifications' && !notificationPrefs && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '20px', textAlign: 'center' }}>
            Loading preferences...
          </div>
        )}
      </div>

      {/* Admin Panel (visible to moderator+) */}
      {canAccess(user, 'moderator') && (
        <CollapsibleSection title="⚙️ ADMIN PANEL" isOpen={openSection === 'admin'} onToggle={() => toggleSection('admin')} isMobile={isMobile} accentColor="var(--accent-amber)" titleColor="var(--accent-amber)">
          {/* MODERATION SECTION - Available to moderator+ */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Moderation
            </div>

            {/* User Management Panel */}
            <UserManagementPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'users'} onToggle={() => toggleAdminSection('users')} currentUser={user} />

            {/* Admin Reports Dashboard */}
            <AdminReportsPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'reports'} onToggle={() => toggleAdminSection('reports')} />

            {/* Activity Log Panel */}
            <ActivityLogPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'activity'} onToggle={() => toggleAdminSection('activity')} />
          </div>

          {/* SYSTEM CONFIGURATION - Admin only */}
          {canAccess(user, 'admin') && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                System Configuration
              </div>

              {/* Handle Requests Panel */}
              <HandleRequestsList fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'handles'} onToggle={() => toggleAdminSection('handles')} />

              {/* Crawl Bar Admin Panel */}
              <CrawlBarAdminPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'crawl'} onToggle={() => toggleAdminSection('crawl')} />

              {/* Alerts Admin Panel */}
              <AlertsAdminPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'alerts'} onToggle={() => toggleAdminSection('alerts')} />

              {/* Alert Subscriptions Panel */}
              <AlertSubscriptionsPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} isOpen={openAdminSection === 'subscriptions'} onToggle={() => toggleAdminSection('subscriptions')} />

              {/* Federation Admin Panel */}
              <FederationAdminPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} refreshTrigger={federationRequestsRefresh} isOpen={openAdminSection === 'federation'} onToggle={() => toggleAdminSection('federation')} />
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* My Reports Section */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--border-subtle)' }}>
        <MyReportsPanel fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} />
      </div>

      {/* Logout Section */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--border-subtle)' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '16px' }}>SESSION</div>
        <button
          onClick={onLogout}
          style={{
            padding: isMobile ? '14px 24px' : '12px 24px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--accent-orange)',
            color: 'var(--accent-orange)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⏻</span> LOGOUT
        </button>
      </div>

      {/* Account Management (v1.18.0) */}
      <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-orange)40' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', fontWeight: 500 }}>ACCOUNT MANAGEMENT</div>
          <button
            onClick={() => toggleSection('account')}
            style={{
              padding: isMobile ? '8px 12px' : '6px 10px',
              background: openSection === 'account' ? 'var(--accent-orange)20' : 'transparent',
              border: `1px solid ${openSection === 'account' ? 'var(--accent-orange)' : 'var(--border-primary)'}`,
              color: openSection === 'account' ? 'var(--accent-orange)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
            }}
          >
            {openSection === 'account' ? '▼ HIDE' : '▶ SHOW'}
          </button>
        </div>

        {openSection === 'account' && (
          <div style={{ marginTop: '16px' }}>
            {/* Data Export */}
            <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '8px' }}>
                📦 Export Your Data
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                Download a copy of all your personal data including profile, pings, contacts, and settings.
              </div>
              <button
                onClick={handleExportData}
                disabled={exportLoading}
                style={{
                  padding: '10px 20px',
                  background: 'var(--accent-teal)20',
                  border: '1px solid var(--accent-teal)',
                  color: 'var(--accent-teal)',
                  cursor: exportLoading ? 'wait' : 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                }}
              >
                {exportLoading ? 'EXPORTING...' : 'DOWNLOAD MY DATA'}
              </button>
            </div>

            {/* Account Deletion */}
            <div style={{ padding: '16px', background: 'var(--accent-orange)05', border: '1px solid var(--accent-orange)' }}>
              <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '8px' }}>
                ⚠️ Delete Account
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '12px' }}>
                Permanently delete your account and all associated data. This action cannot be undone.
                Your pings will remain visible as "[Deleted User]" for context in conversations.
              </div>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}
                >
                  DELETE MY ACCOUNT
                </button>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 'bold' }}>
                    Are you sure? Enter your password to confirm:
                  </div>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Your password"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--accent-orange)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      marginBottom: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteLoading || !deletePassword}
                      style={{
                        padding: '10px 20px',
                        background: deletePassword ? 'var(--accent-orange)' : 'transparent',
                        border: '1px solid var(--accent-orange)',
                        color: deletePassword ? '#000' : 'var(--accent-orange)',
                        cursor: deleteLoading || !deletePassword ? 'not-allowed' : 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {deleteLoading ? 'DELETING...' : 'CONFIRM DELETE'}
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ NEW WAVE MODAL ============
const NewWaveModal = ({ isOpen, onClose, onCreate, contacts, groups, federationEnabled }) => {
  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [federatedInput, setFederatedInput] = useState('');
  const [federatedParticipants, setFederatedParticipants] = useState([]); // Array of "@handle@server" strings

  if (!isOpen) return null;

  const handleAddFederated = () => {
    const input = federatedInput.trim();
    // Validate format: @handle@server or handle@server
    const match = input.match(/^@?([^@\s]+)@([^@\s]+)$/);
    if (match) {
      const normalized = `@${match[1]}@${match[2]}`;
      if (!federatedParticipants.includes(normalized)) {
        setFederatedParticipants([...federatedParticipants, normalized]);
        // Auto-switch to cross-server privacy when adding federated participant
        if (privacy !== 'crossServer') {
          setPrivacy('crossServer');
        }
      }
      setFederatedInput('');
    }
  };

  const handleRemoveFederated = (fp) => {
    setFederatedParticipants(federatedParticipants.filter(f => f !== fp));
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    if (privacy === 'group' && !selectedGroup) return;
    // Combine local participant IDs with federated participant strings
    const allParticipants = [...selectedParticipants, ...federatedParticipants];
    onCreate({ title, privacy, participants: allParticipants, groupId: privacy === 'group' ? selectedGroup : null });
    setTitle(''); setPrivacy('private'); setSelectedParticipants([]); setSelectedGroup(null);
    setFederatedInput(''); setFederatedParticipants([]);
    onClose();
  };

  const canCreate = title.trim() && (privacy !== 'group' || selectedGroup);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="var(--accent-amber)" size="1.1rem">New Wave</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Wave title..."
            style={{
              width: '100%', padding: '10px', boxSizing: 'border-box',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
            }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PRIVACY LEVEL</div>
          {Object.entries(PRIVACY_LEVELS).map(([key, config]) => (
            <button key={key} onClick={() => { setPrivacy(key); if (key !== 'group') setSelectedGroup(null); }}
              style={{
                width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left',
                background: privacy === key ? config.bgColor : 'var(--bg-elevated)',
                border: `1px solid ${privacy === key ? config.color : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: config.color, fontSize: '1.1rem' }}>{config.icon}</span>
                <div>
                  <div style={{ color: config.color }}>{config.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{config.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {privacy === 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>SELECT CREW</div>
            {groups.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '10px', background: 'var(--bg-elevated)' }}>No crews. Create one first.</div>
            ) : groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
                width: '100%', padding: '10px', marginBottom: '4px', textAlign: 'left',
                background: selectedGroup === g.id ? 'var(--accent-amber)15' : 'var(--bg-elevated)',
                border: `1px solid ${selectedGroup === g.id ? 'var(--accent-amber)' : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
                <div style={{ color: 'var(--text-primary)' }}>{g.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{g.memberCount} members</div>
              </button>
            ))}
          </div>
        )}

        {privacy !== 'group' && privacy !== 'public' && contacts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>LOCAL CONTACTS</div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {contacts.map(c => (
                <button key={c.id} onClick={() => setSelectedParticipants(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}
                  style={{
                    width: '100%', padding: '8px', marginBottom: '4px',
                    background: selectedParticipants.includes(c.id) ? 'var(--accent-amber)15' : 'transparent',
                    border: `1px solid ${selectedParticipants.includes(c.id) ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                  <Avatar letter={c.avatar} color="var(--accent-amber)" size={24} />
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{c.name}</span>
                  {selectedParticipants.includes(c.id) && <span style={{ marginLeft: 'auto', color: 'var(--accent-green)' }}>✔</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Federated participants section */}
        {federationEnabled && privacy !== 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
              FEDERATED PARTICIPANTS <span style={{ color: 'var(--accent-teal)' }}>◇</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={federatedInput}
                onChange={(e) => setFederatedInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFederated()}
                placeholder="@handle@server.com"
                style={{
                  flex: 1, padding: '8px', boxSizing: 'border-box',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem',
                }}
              />
              <button
                onClick={handleAddFederated}
                disabled={!federatedInput.trim()}
                style={{
                  padding: '8px 12px', background: 'var(--accent-teal)20',
                  border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)',
                  cursor: federatedInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
                }}
              >ADD</button>
            </div>
            {federatedParticipants.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {federatedParticipants.map(fp => (
                  <div key={fp} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 8px', background: 'var(--accent-teal)15',
                    border: '1px solid var(--accent-teal)40', fontSize: '0.8rem',
                  }}>
                    <span style={{ color: 'var(--accent-teal)' }}>{fp}</span>
                    <button
                      onClick={() => handleRemoveFederated(fp)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', padding: '0 2px', fontSize: '0.9rem',
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
              Format: @handle@server.com (user on another Farhold server)
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleCreate} disabled={!canCreate} style={{
            flex: 1, padding: '12px',
            background: canCreate ? 'var(--accent-amber)20' : 'transparent',
            border: `1px solid ${canCreate ? 'var(--accent-amber)' : 'var(--text-muted)'}`,
            color: canCreate ? 'var(--accent-amber)' : 'var(--text-muted)',
            cursor: canCreate ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
          }}>CREATE</button>
        </div>
      </div>
    </div>
  );
};

// ============ INVITE FEDERATED MODAL ============
const InviteFederatedModal = ({ isOpen, onClose, wave, fetchAPI, showToast, isMobile }) => {
  const [federatedInput, setFederatedInput] = useState('');
  const [federatedParticipants, setFederatedParticipants] = useState([]);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFederatedInput('');
      setFederatedParticipants([]);
    }
  }, [isOpen]);

  const handleAddFederated = () => {
    const input = federatedInput.trim();
    const match = input.match(/^@?([^@\s]+)@([^@\s]+)$/);
    if (match) {
      const normalized = `@${match[1]}@${match[2]}`;
      if (!federatedParticipants.includes(normalized)) {
        setFederatedParticipants([...federatedParticipants, normalized]);
      }
      setFederatedInput('');
    }
  };

  const handleRemoveFederated = (fp) => {
    setFederatedParticipants(federatedParticipants.filter(x => x !== fp));
  };

  const handleInvite = async () => {
    if (federatedParticipants.length === 0) return;
    setInviting(true);

    try {
      const res = await fetchAPI(`/waves/${wave.id}/invite-federated`, {
        method: 'POST',
        body: JSON.stringify({ participants: federatedParticipants }),
      });

      if (res.ok) {
        const data = await res.json();
        const invited = data.results?.invited || [];
        const failed = data.results?.failed || [];

        if (invited.length > 0) {
          showToast(`Invited: ${invited.join(', ')}`, 'success');
        }
        if (failed.length > 0) {
          showToast(`Failed to invite: ${failed.join(', ')}`, 'error');
        }
        onClose();
      } else {
        const error = await res.json();
        showToast(error.error || 'Failed to invite', 'error');
      }
    } catch (err) {
      showToast('Failed to invite federated participants', 'error');
    } finally {
      setInviting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--overlay-amber)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: isMobile ? '16px' : 0,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-base)', border: '1px solid var(--accent-teal)',
        padding: '24px', width: isMobile ? '100%' : '400px', maxWidth: '90vw',
        maxHeight: '80vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: 'var(--accent-teal)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>◇</span> FEDERATE WAVE
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
          Invite users from other Farhold servers to join "{wave.title || wave.name}".
        </p>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>
            ADD FEDERATED PARTICIPANTS
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={federatedInput}
              onChange={(e) => setFederatedInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFederated()}
              placeholder="@handle@server.com"
              style={{
                flex: 1, padding: '8px', boxSizing: 'border-box',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem',
              }}
            />
            <button
              onClick={handleAddFederated}
              disabled={!federatedInput.trim()}
              style={{
                padding: '8px 12px', background: 'var(--accent-teal)20',
                border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)',
                cursor: federatedInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
              }}
            >ADD</button>
          </div>
          {federatedParticipants.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {federatedParticipants.map(fp => (
                <div key={fp} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 8px', background: 'var(--accent-teal)15',
                  border: '1px solid var(--accent-teal)40', fontSize: '0.8rem',
                }}>
                  <span style={{ color: 'var(--accent-teal)' }}>{fp}</span>
                  <button
                    onClick={() => handleRemoveFederated(fp)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', padding: '0 2px', fontSize: '0.9rem',
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            Format: @handle@server.com (user on another Farhold server)
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleInvite} disabled={federatedParticipants.length === 0 || inviting} style={{
            flex: 1, padding: '12px',
            background: federatedParticipants.length > 0 ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${federatedParticipants.length > 0 ? 'var(--accent-teal)' : 'var(--text-muted)'}`,
            color: federatedParticipants.length > 0 ? 'var(--accent-teal)' : 'var(--text-muted)',
            cursor: federatedParticipants.length > 0 && !inviting ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
          }}>{inviting ? 'INVITING...' : 'INVITE'}</button>
        </div>
      </div>
    </div>
  );
};

// ============ CONNECTION STATUS ============
const ConnectionStatus = ({ wsConnected, apiConnected }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: apiConnected ? 'var(--accent-green)' : 'var(--accent-orange)',
        boxShadow: apiConnected ? '0 0 6px var(--accent-green)' : 'none',
      }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>API</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: wsConnected ? 'var(--accent-green)' : 'var(--accent-orange)',
        boxShadow: wsConnected ? '0 0 6px var(--accent-green)' : 'none',
      }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>LIVE</span>
    </div>
  </div>
);

// ============ MAIN APP ============
function MainApp({ shareDropletId }) {
  const { user, token, logout, updateUser } = useAuth();
  const { fetchAPI } = useAPI();
  const e2ee = useE2EE();
  const [toast, setToast] = useState(null);
  const [activeView, setActiveView] = useState('waves');
  const [apiConnected, setApiConnected] = useState(false);
  const [waves, setWaves] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedWave, setSelectedWave] = useState(null);
  const [scrollToDropletId, setScrollToDropletId] = useState(null); // Droplet to scroll to after wave loads
  const [focusStack, setFocusStack] = useState([]); // Array of { waveId, dropletId, droplet } for Focus View navigation
  const [showNewWave, setShowNewWave] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [waveReloadTrigger, setWaveReloadTrigger] = useState(0); // Increment to trigger WaveView reload
  const [typingUsers, setTypingUsers] = useState({}); // { waveId: { userId: { name, timestamp } } }
  const [contactRequests, setContactRequests] = useState([]); // Received contact requests
  const [sentContactRequests, setSentContactRequests] = useState([]); // Sent contact requests
  const [groupInvitations, setGroupInvitations] = useState([]); // Received group invitations
  const [blockedUsers, setBlockedUsers] = useState([]); // Users blocked by current user
  const [mutedUsers, setMutedUsers] = useState([]); // Users muted by current user
  const [profileUserId, setProfileUserId] = useState(null); // User ID for profile modal
  const [federationEnabled, setFederationEnabled] = useState(false); // Whether federation is enabled on server
  const [federationRequestsRefresh, setFederationRequestsRefresh] = useState(0); // Increment to refresh federation requests
  const [notificationRefreshTrigger, setNotificationRefreshTrigger] = useState(0); // Increment to refresh notifications
  const [waveNotifications, setWaveNotifications] = useState({}); // Notification counts/types by wave ID
  const [selectedAlert, setSelectedAlert] = useState(null); // Alert to show in detail modal
  const typingTimeoutsRef = useRef({});
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();

  // Calculate font scale from user preferences
  const fontSizePreference = user?.preferences?.fontSize || 'medium';
  const fontScale = FONT_SIZES[fontSizePreference]?.multiplier || 1;

  // Apply font scaling to the root HTML element so rem units scale properly
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = '100%';
    };
  }, [fontScale]);

  // Apply theme to document root and persist to localStorage
  useEffect(() => {
    const theme = user?.preferences?.theme || 'firefly';
    document.documentElement.setAttribute('data-theme', theme);
    // Only save to dedicated storage when we have actual user data
    // This prevents overwriting saved theme with 'firefly' on initial load
    if (user?.preferences?.theme) {
      storage.setTheme(theme);
    }
  }, [user?.preferences?.theme]);

  // PWA Badge and Tab Notifications - update based on unread count
  useEffect(() => {
    const totalUnread = waves.reduce((sum, w) => sum + (w.unread_count || 0), 0);

    // Debug: Log unread counts per wave
    if (waves.length > 0) {
      const wavesWithUnread = waves.filter(w => w.unread_count > 0);
      console.log(`[Badge] Total unread: ${totalUnread} across ${waves.length} waves (${wavesWithUnread.length} with unread)`);
      if (wavesWithUnread.length > 0 && wavesWithUnread.length <= 5) {
        wavesWithUnread.forEach(w => console.log(`  - "${w.title}": ${w.unread_count} unread`));
      }
    }

    // Update PWA app badge (shows on installed app icon)
    updateAppBadge(totalUnread);

    // Update document title with unread count
    updateDocumentTitle(totalUnread);

    // Handle favicon flashing based on visibility
    const handleVisibilityChange = () => {
      if (document.hidden && totalUnread > 0) {
        startFaviconFlash();
      } else {
        stopFaviconFlash();
      }
    };

    // Initial check
    handleVisibilityChange();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopFaviconFlash();
    };
  }, [waves]);

  // Handle shared droplet URL parameter - navigate to the wave containing the droplet
  const shareHandledRef = useRef(false);
  useEffect(() => {
    if (shareDropletId && user && !shareHandledRef.current) {
      shareHandledRef.current = true; // Prevent duplicate handling
      console.log('[Share] Handling shared droplet:', shareDropletId);

      fetch(`${API_URL}/share/${shareDropletId}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log('[Share] API response:', data);
          if (data.wave?.id) {
            // Navigate to the wave and scroll to the droplet
            console.log('[Share] Navigating to wave:', data.wave.id);
            setSelectedWave({ id: data.wave.id, title: data.wave.title });
            setScrollToDropletId(shareDropletId);
            setActiveView('waves');
            // Clear the URL (works for both /?share=x and /share/x formats)
            if (window.location.pathname !== '/' || window.location.search) {
              window.history.replaceState({}, '', '/');
            }
          } else if (data.error) {
            setToast({ message: data.error, type: 'error' });
          } else {
            setToast({ message: 'Could not load shared ping', type: 'error' });
          }
        })
        .catch((err) => {
          console.error('[Share] Error:', err);
          setToast({ message: 'Could not find shared ping', type: 'error' });
        });
    }
  }, [shareDropletId, user]);

  const showToastMsg = useCallback((message, type) => setToast({ message, type }), []);

  const loadWaves = useCallback(async () => {
    console.log('🔄 loadWaves called, fetching waves...');
    try {
      const data = await fetchAPI(`/waves?archived=${showArchived}`);
      console.log('🔄 loadWaves received', data.length, 'waves');
      // Log unread counts for debugging
      const wavesWithUnread = data.filter(w => w.unread_count > 0);
      if (wavesWithUnread.length > 0) {
        console.log('🔄 Waves with unread:', wavesWithUnread.map(w => `"${w.title}": ${w.unread_count}`).join(', '));
      }
      setWaves(data);
      setApiConnected(true);
    } catch (err) {
      console.error('loadWaves failed:', err);
      setApiConnected(false);
    }
  }, [fetchAPI, showArchived]);

  const handleWSMessage = useCallback((data) => {
    // Handle droplet read events - refresh wave list to update unread counts
    if (data.type === 'droplet_read' || data.type === 'message_read') {
      console.log(`📖 Droplet marked as read, refreshing wave list...`);
      loadWaves();
      return;
    }

    // Handle both legacy (new_message) and new (new_droplet) event names
    if (data.type === 'new_message' || data.type === 'new_droplet' || data.type === 'message_edited' || data.type === 'droplet_edited' || data.type === 'message_deleted' || data.type === 'droplet_deleted' || data.type === 'wave_created' || data.type === 'wave_updated' || data.type === 'message_reaction' || data.type === 'droplet_reaction' || data.type === 'wave_invite_received' || data.type === 'wave_broadcast_received') {
      loadWaves();
      // If the event is for the currently viewed wave, trigger a reload
      // Extract waveId from different event structures
      const eventWaveId = data.waveId || data.data?.wave_id || data.data?.waveId;
      if (selectedWave && eventWaveId === selectedWave.id) {
        console.log(`🔄 Reloading wave ${selectedWave.id} due to ${data.type} event`);
        setWaveReloadTrigger(prev => prev + 1);
      }

      // Desktop notifications for new messages/droplets
      if ((data.type === 'new_message' || data.type === 'new_droplet') && (data.data || data.droplet)) {
        // Handle both local (data.data) and federated (data.droplet) message structures
        const msgData = data.data || data.droplet;
        const authorId = msgData.author_id || msgData.authorId;
        const senderName = msgData.sender_name || msgData.senderName || 'Unknown';
        const content = msgData.content || '';

        const isViewingDifferentWave = !selectedWave || eventWaveId !== selectedWave.id;
        const isBackgrounded = document.visibilityState === 'hidden';
        const isOwnMessage = authorId === user?.id;

        // Show notification if viewing different wave or tab is in background
        if ((isViewingDifferentWave || isBackgrounded) && !isOwnMessage) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const waveName = waves.find(w => w.id === eventWaveId)?.name || 'Unknown Wave';
            const notification = new Notification(`New ping in ${waveName}`, {
              body: `${senderName}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
              icon: '/favicon.ico',
              tag: eventWaveId, // Group notifications by wave
              requireInteraction: false,
            });

            notification.onclick = () => {
              window.focus();
              const wave = waves.find(w => w.id === eventWaveId);
              if (wave) {
                setSelectedWave(wave);
                setActiveView('waves');
              }
              notification.close();
            };
          }
        }
      }
    } else if (data.type === 'wave_deleted') {
      showToastMsg(`Wave "${data.wave?.title || 'Unknown'}" was deleted`, 'info');
      if (selectedWave?.id === data.waveId) {
        setSelectedWave(null);
        setActiveView('waves');
      }
      loadWaves();
    } else if (data.type === 'wave_key_rotated') {
      // E2EE: Wave key was rotated, invalidate cached key
      if (e2ee.isUnlocked && data.waveId) {
        e2ee.invalidateWaveKey(data.waveId);
        // Reload wave if currently viewing it to re-fetch and re-decrypt with new key
        if (selectedWave?.id === data.waveId) {
          setWaveReloadTrigger(prev => prev + 1);
        }
        showToastMsg('Wave encryption key was rotated', 'info');
      }
    } else if (data.type === 'participant_added') {
      // Someone was added to a wave we're in
      if (selectedWave?.id === data.waveId) {
        setWaveReloadTrigger(prev => prev + 1);
      }
      showToastMsg(`${data.participant?.name || 'Someone'} was added to the wave`, 'info');
    } else if (data.type === 'participant_removed') {
      // Someone was removed from a wave we're in
      if (data.userId === user?.id) {
        // We were removed
        if (selectedWave?.id === data.waveId) {
          setSelectedWave(null);
          setActiveView('waves');
        }
        showToastMsg('You were removed from the wave', 'info');
        loadWaves();
      } else {
        // Someone else was removed
        if (selectedWave?.id === data.waveId) {
          setWaveReloadTrigger(prev => prev + 1);
        }
        showToastMsg(data.wasSelf ? 'A participant left the wave' : 'A participant was removed from the wave', 'info');
      }
    } else if (data.type === 'added_to_wave') {
      // We were added to a wave
      showToastMsg(`You were added to "${data.wave?.title || 'a wave'}"`, 'success');
      loadWaves();
    } else if (data.type === 'removed_from_wave') {
      // We were removed from a wave (by someone else)
      showToastMsg(`You were removed from "${data.wave?.title || 'a wave'}"`, 'info');
      if (selectedWave?.id === data.wave?.id) {
        setSelectedWave(null);
        setActiveView('waves');
      }
      loadWaves();
    } else if (data.type === 'user_typing') {
      // Handle typing indicator
      const { waveId, userId, userName } = data;

      // Clear existing timeout for this user in this wave
      const timeoutKey = `${waveId}-${userId}`;
      if (typingTimeoutsRef.current[timeoutKey]) {
        clearTimeout(typingTimeoutsRef.current[timeoutKey]);
      }

      // Add user to typing list
      setTypingUsers(prev => ({
        ...prev,
        [waveId]: {
          ...(prev[waveId] || {}),
          [userId]: { name: userName, timestamp: Date.now() }
        }
      }));

      // Remove user after 5 seconds
      typingTimeoutsRef.current[timeoutKey] = setTimeout(() => {
        setTypingUsers(prev => {
          const waveTyping = { ...(prev[waveId] || {}) };
          delete waveTyping[userId];
          return {
            ...prev,
            [waveId]: waveTyping
          };
        });
        delete typingTimeoutsRef.current[timeoutKey];
      }, 5000);
    } else if (data.type === 'contact_request_received') {
      // Someone sent us a contact request
      setContactRequests(prev => [data.request, ...prev]);
      showToastMsg(`${data.request.from_user?.displayName || 'Someone'} sent you a contact request`, 'info');
    } else if (data.type === 'contact_request_accepted') {
      // Our request was accepted
      setSentContactRequests(prev => prev.filter(r => r.id !== data.requestId));
      showToastMsg('Your contact request was accepted!', 'success');
      // Reload contacts since we have a new one
      fetchAPI('/contacts').then(setContacts).catch(console.error);
    } else if (data.type === 'contact_request_declined') {
      // Our request was declined
      setSentContactRequests(prev => prev.filter(r => r.id !== data.requestId));
      showToastMsg('Your contact request was declined', 'info');
    } else if (data.type === 'contact_request_cancelled') {
      // Request to us was cancelled
      setContactRequests(prev => prev.filter(r => r.id !== data.requestId));
    } else if (data.type === 'group_invitation_received') {
      // Someone invited us to a crew
      setGroupInvitations(prev => [data.invitation, ...prev]);
      const crewName = data.invitation.group?.name || 'a crew';
      const inviterName = data.invitation.invited_by_user?.displayName || 'Someone';
      showToastMsg(`${inviterName} invited you to join ${crewName}`, 'info');
    } else if (data.type === 'group_invitation_accepted') {
      // Our invitation was accepted - reload crews since someone joined
      showToastMsg('Your crew invitation was accepted!', 'success');
      fetchAPI('/groups').then(setGroups).catch(console.error);
    } else if (data.type === 'group_invitation_declined') {
      // Our invitation was declined
      showToastMsg('Your crew invitation was declined', 'info');
    } else if (data.type === 'group_invitation_cancelled') {
      // Invitation to us was cancelled
      setGroupInvitations(prev => prev.filter(i => i.id !== data.invitationId));
    } else if (data.type === 'notification') {
      // New notification received - refresh wave notification badges
      console.log('🔔 New notification:', data.notification?.type);
      setNotificationRefreshTrigger(prev => prev + 1);
      // Reload wave notifications for updated badges
      fetchAPI('/notifications/by-wave').then(result => {
        setWaveNotifications(result.countsByWave || {});
      }).catch(e => console.error('Failed to update wave notifications:', e));
    } else if (data.type === 'unread_count_update') {
      // Notification count changed - refresh wave notification badges and wave list
      console.log('🔔 Notification count updated');
      setNotificationRefreshTrigger(prev => prev + 1);
      // Reload wave notifications for updated badges
      fetchAPI('/notifications/by-wave').then(result => {
        setWaveNotifications(result.countsByWave || {});
      }).catch(e => console.error('Failed to update wave notifications:', e));
      // Also refresh wave list to update unread counts
      loadWaves();
    } else if (data.type === 'federation_request_received') {
      // New federation request received (admin only)
      console.log('📨 Federation request received:', data.request?.fromNodeName);
      setFederationRequestsRefresh(prev => prev + 1);
      if (user?.isAdmin) {
        showToastMsg(`Federation request from ${data.request?.fromNodeName || 'unknown server'}`, 'info');
      }
    }
  }, [loadWaves, selectedWave, showToastMsg, user, waves, setSelectedWave, setActiveView, fetchAPI]);

  const { connected: wsConnected, sendMessage: sendWSMessage } = useWebSocket(token, handleWSMessage);

  const loadContacts = useCallback(async () => {
    try { setContacts(await fetchAPI('/contacts')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  const loadGroups = useCallback(async () => {
    try { setGroups(await fetchAPI('/groups')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  const loadContactRequests = useCallback(async () => {
    try {
      const [received, sent] = await Promise.all([
        fetchAPI('/contacts/requests'),
        fetchAPI('/contacts/requests/sent')
      ]);
      setContactRequests(received);
      setSentContactRequests(sent);
    } catch (e) { console.error('Failed to load contact requests:', e); }
  }, [fetchAPI]);

  const loadGroupInvitations = useCallback(async () => {
    try {
      const invitations = await fetchAPI('/groups/invitations');
      setGroupInvitations(invitations);
    } catch (e) { console.error('Failed to load group invitations:', e); }
  }, [fetchAPI]);

  const loadWaveNotifications = useCallback(async () => {
    try {
      const data = await fetchAPI('/notifications/by-wave');
      setWaveNotifications(data.countsByWave || {});
    } catch (e) { console.error('Failed to load wave notifications:', e); }
  }, [fetchAPI]);

  const loadBlockedMutedUsers = useCallback(async () => {
    try {
      const [blockedData, mutedData] = await Promise.all([
        fetchAPI('/users/blocked'),
        fetchAPI('/users/muted')
      ]);
      setBlockedUsers(blockedData.blockedUsers || []);
      setMutedUsers(mutedData.mutedUsers || []);
    } catch (e) { console.error('Failed to load blocked/muted users:', e); }
  }, [fetchAPI]);

  const handleBlockUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/block`, { method: 'POST' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to block user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleUnblockUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/block`, { method: 'DELETE' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to unblock user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleMuteUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/mute`, { method: 'POST' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to mute user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleUnmuteUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/mute`, { method: 'DELETE' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to unmute user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  // Dismiss alert handler
  const handleDismissAlert = useCallback(async (alertId) => {
    try {
      await fetchAPI(`/alerts/${alertId}/dismiss`, { method: 'POST' });
      // The crawl bar will refresh on its own interval, but we can show a toast
      showToastMsg('Alert dismissed', 'success');
    } catch (e) {
      console.error('Failed to dismiss alert:', e);
      showToastMsg('Failed to dismiss alert', 'error');
    }
  }, [fetchAPI, showToastMsg]);

  // Focus View handlers
  const handleFocusDroplet = useCallback((waveId, droplet) => {
    // Prevent focusing on the same droplet that's already on the stack
    setFocusStack(prev => {
      const lastFocused = prev[prev.length - 1];
      if (lastFocused?.dropletId === droplet.id) {
        return prev; // Already focused on this droplet
      }
      return [...prev, { waveId, dropletId: droplet.id, droplet }];
    });
  }, []);

  const handleFocusBack = useCallback(() => {
    // Pop the last item from the focus stack
    setFocusStack(prev => prev.slice(0, -1));
  }, []);

  const handleFocusClose = useCallback(() => {
    // When closing focus view, scroll WaveView to the originally focused droplet
    setFocusStack(prev => {
      if (prev.length > 0) {
        // Set scroll target to the first focused droplet so WaveView scrolls to it
        setScrollToDropletId(prev[0].dropletId);
      }
      return [];
    });
  }, []);

  const handleFocusDeeper = useCallback((droplet) => {
    // Focus on a child droplet within the current focus view
    setFocusStack(prev => {
      if (prev.length === 0) return prev;

      // Prevent focusing on the same droplet that's already focused
      const lastFocused = prev[prev.length - 1];
      if (lastFocused?.dropletId === droplet.id) {
        return prev; // Already focused on this droplet
      }

      const currentWaveId = lastFocused.waveId;
      return [...prev, { waveId: currentWaveId, dropletId: droplet.id, droplet }];
    });
  }, []);

  // Navigate to a different wave (used after breakout)
  const handleNavigateToWave = useCallback((wave) => {
    // Clear focus stack and navigate to the new wave
    setFocusStack([]);
    setSelectedWave(wave);
    setActiveView('waves');
    // Reload waves to include the new one
    loadWaves();
  }, [loadWaves]);

  // Navigate to a wave by ID (used by notifications)
  const handleNavigateToWaveById = useCallback(async (waveId, dropletId) => {
    try {
      // Fetch the wave if we don't have it
      let wave = waves.find(w => w.id === waveId);
      if (!wave) {
        wave = await fetchAPI(`/waves/${waveId}`);
      }
      if (wave) {
        setFocusStack([]);
        setSelectedWave(wave);
        setActiveView('waves');

        // If dropletId provided, mark it as read and set it for WaveView to scroll to
        if (dropletId) {
          // Mark the droplet as read since user is navigating to it
          try {
            await fetchAPI(`/pings/${dropletId}/read`, { method: 'POST' });
            // Refresh wave list to update unread counts
            loadWaves();
          } catch (e) {
            // Ignore errors - droplet might not exist or already read
          }

          // Set the target droplet for WaveView to scroll to after loading
          setScrollToDropletId(dropletId);
        }
      }
    } catch (err) {
      console.error('Failed to navigate to wave:', err);
    }
  }, [waves, fetchAPI, loadWaves]);

  useEffect(() => {
    loadWaves();
    loadContacts();
    loadGroups();
    loadContactRequests();
    loadGroupInvitations();
    loadBlockedMutedUsers();
    loadWaveNotifications();
    // Check if federation is enabled (public endpoint returns 404 if disabled)
    fetch(`${API_URL}/federation/identity`)
      .then(res => setFederationEnabled(res.ok))
      .catch(() => setFederationEnabled(false));
  }, [loadWaves, loadContacts, loadGroups, loadContactRequests, loadGroupInvitations, loadBlockedMutedUsers, loadWaveNotifications]);

  // Listen for service worker messages (push notification clicks)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event) => {
      if (event.data?.type === 'navigate-to-wave') {
        console.log('[SW] Received navigate-to-wave:', event.data);
        const { waveId, dropletId } = event.data;
        if (waveId) {
          handleNavigateToWaveById(waveId, dropletId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [handleNavigateToWaveById]);

  // Request notification permission and set up push on first load
  useEffect(() => {
    const token = storage.getToken();
    if (!token) return;

    const setupPushNotifications = async () => {
      // Check if user has push enabled
      if (!storage.getPushEnabled()) {
        console.log('[Push] Push notifications disabled by user');
        return;
      }

      // Request notification permission if not yet granted
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('❌ Desktop notifications denied');
          return;
        }
        console.log('✅ Desktop notifications enabled');
      }

      // If permission granted, subscribe to push (silently fail on startup)
      if ('Notification' in window && Notification.permission === 'granted') {
        const result = await subscribeToPush(token);
        if (!result.success) {
          // Don't show error toast on auto-subscribe - user didn't initiate it
          console.log('[Push] Auto-subscribe failed (this is ok):', result.reason);
        }
      }
    };

    // Delay to avoid interrupting initial page load
    const timer = setTimeout(setupPushNotifications, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleCreateWave = async (data) => {
    try {
      // E2EE: If E2EE is set up, create encrypted wave with keys
      if (e2ee.isUnlocked && e2ee.isE2EEEnabled) {
        // Get participant IDs from the data
        const participantIds = data.participants || [];

        // Set up encryption for this wave
        const { keyDistribution } = await e2ee.createWaveWithEncryption(participantIds);

        // Create wave with encryption enabled
        await fetchAPI('/waves', {
          method: 'POST',
          body: {
            ...data,
            encrypted: true,
            keyDistribution
          }
        });
      } else {
        // Create unencrypted wave
        await fetchAPI('/waves', { method: 'POST', body: data });
      }
      showToastMsg('Wave created', 'success');
      loadWaves();
    } catch (err) {
      console.error('Failed to create wave:', err);
      showToastMsg(err.message || 'Failed to create wave', 'error');
    }
  };

  const handleSearchResultClick = (result) => {
    // Find the wave and open it
    const wave = waves.find(w => w.id === result.waveId);
    if (wave) {
      setSelectedWave(wave);
      setActiveView('waves');
      setShowSearch(false);
      // TODO: Scroll to the specific message (would need to pass messageId to WaveView)
    } else {
      showToastMsg('Wave not found or not accessible', 'error');
    }
  };

  const navItems = ['waves', 'groups', 'contacts', 'profile'];
  const navLabels = { waves: 'WAVES', groups: 'CREWS', contacts: 'CONTACTS', profile: 'PROFILE' };

  const scanLinesEnabled = user?.preferences?.scanLines !== false; // Default to true

  return (
    <div style={{
      height: '100vh', background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
      fontFamily: "'Courier New', monospace", color: 'var(--text-primary)',
      display: 'flex', flexDirection: 'column',
    }}>
      <ScanLines enabled={scanLinesEnabled} />
      <style>{`
        .message-media {
          max-width: 100%;
          max-height: 400px;
          height: auto;
          border: 1px solid var(--border-subtle);
          border-radius: 2px;
          margin: 8px 0;
          display: block;
        }
        /* Search result highlighting */
        mark {
          background: var(--accent-amber)40;
          color: var(--accent-amber);
          font-weight: bold;
          padding: 0 2px;
          border-radius: 2px;
        }
        /* Thread navigation highlight animation */
        @keyframes highlight-pulse {
          0%, 100% { border-color: var(--accent-amber); box-shadow: 0 0 0 0 rgba(255, 210, 63, 0.7); }
          50% { border-color: #ffed4e; box-shadow: 0 0 20px 4px rgba(255, 210, 63, 0.4); }
        }
        .highlight-flash > div {
          animation: highlight-pulse 1.5s ease-out;
          border-left-width: 4px !important;
        }
        /* Thread visual connectors */
        .thread-connector {
          position: relative;
        }
        .thread-connector::before {
          content: '';
          position: absolute;
          left: -12px;
          top: 0;
          bottom: 0;
          width: 1px;
          border-left: 1px dashed var(--border-subtle);
        }
        .thread-connector::after {
          content: '';
          position: absolute;
          left: -12px;
          top: 20px;
          width: 12px;
          height: 1px;
          border-top: 1px dashed var(--border-subtle);
        }
        /* Mobile thread connectors - thinner lines and smaller indent */
        @media (max-width: 768px) {
          .thread-connector::before {
            left: -8px;
          }
          .thread-connector::after {
            left: -8px;
            width: 8px;
          }
        }
        /* Font scaling: base font size is set on root div and scales all content */
        /* Elements with explicit fontSize will maintain their relative proportions */
      `}</style>

      {/* Header */}
      <header style={{
        padding: isMobile ? '8px 10px' : '12px 24px',
        paddingTop: isMobile ? 'calc(8px + env(safe-area-inset-top, 0px))' : '12px',
        borderBottom: '2px solid var(--accent-amber)40',
        background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
        display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px',
      }}>
        {/* Logo and Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <GlowText color="var(--accent-amber)" size={isMobile ? '1.2rem' : '1.5rem'} weight={700}>FARHOLD</GlowText>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>v{VERSION}</span>
          </div>
          {/* Status indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', fontSize: '0.55rem', fontFamily: 'monospace' }}>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--accent-green)' }}>●</span> ENC</span>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: apiConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> API</span>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> WS</span>
          </div>
        </div>

        {/* Nav Items - grows to fill space - hidden on mobile (using bottom nav instead) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
            {navItems.map(view => {
              const totalUnread = view === 'waves' ? waves.reduce((sum, w) => sum + (w.unread_count || 0), 0) : 0;
              const pendingRequests = view === 'contacts' ? contactRequests.length : 0;
              const pendingInvitations = view === 'groups' ? groupInvitations.length : 0;
              const badgeCount = totalUnread || pendingRequests || pendingInvitations;
              return (
                <button key={view} onClick={() => { setActiveView(view); setSelectedWave(null); loadWaves(); loadWaveNotifications(); }} style={{
                  padding: '8px 16px',
                  background: activeView === view ? 'var(--accent-amber)15' : 'transparent',
                  border: `1px solid ${activeView === view ? 'var(--accent-amber)50' : 'var(--border-primary)'}`,
                  color: activeView === view ? 'var(--accent-amber)' : 'var(--text-dim)',
                  cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase',
                  position: 'relative',
                }}>
                  {navLabels[view] || view}
                  {badgeCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: pendingRequests > 0 ? 'var(--accent-teal)' : pendingInvitations > 0 ? 'var(--accent-amber)' : 'var(--accent-orange)',
                      color: pendingInvitations > 0 && !pendingRequests ? '#000' : '#fff',
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      padding: '2px 4px',
                      borderRadius: '10px',
                      minWidth: '16px',
                      textAlign: 'center',
                      boxShadow: pendingRequests > 0 ? '0 0 8px rgba(59, 206, 172, 0.8)' : pendingInvitations > 0 ? '0 0 8px rgba(255, 210, 63, 0.8)' : '0 0 8px rgba(255, 107, 53, 0.8)',
                    }}>{badgeCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Notifications, Search and User - desktop only */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <NotificationBell
              fetchAPI={fetchAPI}
              onNavigateToWave={handleNavigateToWaveById}
              isMobile={false}
              refreshTrigger={notificationRefreshTrigger}
            />
            <button
              onClick={() => setShowSearch(true)}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
              title="Search messages"
            >
              🔍
            </button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem' }}>{user?.displayName}</div>
            </div>
          </div>
        )}
      </header>

      {/* Crawl Bar */}
      {user && (
        <CrawlBar
          fetchAPI={fetchAPI}
          enabled={user?.preferences?.crawlBar?.enabled !== false}
          userPrefs={user?.preferences?.crawlBar || {}}
          isMobile={isMobile}
          onAlertClick={setSelectedAlert}
        />
      )}

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile && selectedWave ? 'column' : 'row', paddingBottom: isMobile ? '60px' : '0' }}>
        {activeView === 'waves' && (
          <>
            {(!isMobile || !selectedWave) && (
              <WaveList waves={waves} selectedWave={selectedWave}
                onSelectWave={setSelectedWave} onNewWave={() => setShowNewWave(true)}
                showArchived={showArchived} onToggleArchived={() => { setShowArchived(!showArchived); loadWaves(); }}
                isMobile={isMobile} waveNotifications={waveNotifications} />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              {selectedWave && focusStack.length > 0 ? (
                // Focus View - showing focused droplet and its replies
                <ErrorBoundary key={`focus-${focusStack[focusStack.length - 1]?.dropletId}`}>
                  <FocusView
                    wave={selectedWave}
                    focusStack={focusStack}
                    onBack={handleFocusBack}
                    onClose={handleFocusClose}
                    onFocusDeeper={handleFocusDeeper}
                    fetchAPI={fetchAPI}
                    showToast={showToastMsg}
                    currentUser={user}
                    isMobile={isMobile}
                    sendWSMessage={sendWSMessage}
                    typingUsers={typingUsers[selectedWave?.id] || {}}
                    reloadTrigger={waveReloadTrigger}
                    onShowProfile={setProfileUserId}
                    blockedUsers={blockedUsers}
                    mutedUsers={mutedUsers}
                    contacts={contacts}
                  />
                </ErrorBoundary>
              ) : selectedWave ? (
                // Normal Wave View
                <ErrorBoundary key={selectedWave.id}>
                  <WaveView wave={selectedWave} onBack={() => { setSelectedWave(null); setFocusStack([]); loadWaves(); loadWaveNotifications(); }}
                    fetchAPI={fetchAPI} showToast={showToastMsg} currentUser={user}
                    groups={groups} onWaveUpdate={loadWaves} isMobile={isMobile}
                    sendWSMessage={sendWSMessage}
                    typingUsers={typingUsers[selectedWave?.id] || {}}
                    reloadTrigger={waveReloadTrigger}
                    contacts={contacts}
                    contactRequests={contactRequests}
                    sentContactRequests={sentContactRequests}
                    onRequestsChange={loadContactRequests}
                    onContactsChange={loadContacts}
                    blockedUsers={blockedUsers}
                    mutedUsers={mutedUsers}
                    onBlockUser={handleBlockUser}
                    onUnblockUser={handleUnblockUser}
                    onMuteUser={handleMuteUser}
                    onUnmuteUser={handleUnmuteUser}
                    onBlockedMutedChange={loadBlockedMutedUsers}
                    onShowProfile={setProfileUserId}
                    onFocusDroplet={handleFocusDroplet}
                    onNavigateToWave={handleNavigateToWave}
                    scrollToDropletId={scrollToDropletId}
                    onScrollToDropletComplete={() => setScrollToDropletId(null)}
                    federationEnabled={federationEnabled} />
                </ErrorBoundary>
              ) : !isMobile && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--border-primary)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>◎</div>
                    <div>Select a wave or create a new one</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeView === 'groups' && (
          <GroupsView
            groups={groups}
            fetchAPI={fetchAPI}
            showToast={showToastMsg}
            onGroupsChange={loadGroups}
            groupInvitations={groupInvitations}
            onInvitationsChange={loadGroupInvitations}
            contacts={contacts}
          />
        )}

        {activeView === 'contacts' && (
          <ContactsView
            contacts={contacts}
            fetchAPI={fetchAPI}
            showToast={showToastMsg}
            onContactsChange={loadContacts}
            contactRequests={contactRequests}
            sentContactRequests={sentContactRequests}
            onRequestsChange={loadContactRequests}
            onShowProfile={setProfileUserId}
          />
        )}

        {activeView === 'profile' && (
          <ProfileSettings user={user} fetchAPI={fetchAPI} showToast={showToastMsg} onUserUpdate={updateUser} onLogout={logout} federationRequestsRefresh={federationRequestsRefresh} />
        )}
      </main>

      {/* Footer - hidden on mobile (using bottom nav instead) */}
      {!isMobile && (
        <footer style={{
          padding: '8px 8px', background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', fontFamily: 'monospace', flexWrap: 'wrap', gap: '4px',
        }}>
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--border-primary)' }}>v{VERSION}</span>
            <span><span style={{ color: 'var(--accent-green)' }}>●</span> ENCRYPTED</span>
            <span><span style={{ color: apiConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> API</span>
            <span><span style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> LIVE</span>
          </div>
          <div style={{ color: 'var(--text-muted)' }}>WAVES: {waves.length} • CREWS: {groups.length} • CONTACTS: {contacts.length}</div>
        </footer>
      )}

      {/* Bottom Navigation - mobile only */}
      {isMobile && (
        <BottomNav
          activeView={activeView}
          onNavigate={(view) => {
            if (view === 'search') {
              setShowSearch(true);
            } else {
              setActiveView(view);
              setSelectedWave(null);
              loadWaves();
              loadWaveNotifications();
            }
          }}
          unreadCount={waves.reduce((sum, w) => sum + (w.unread_count || 0), 0)}
          pendingContacts={contactRequests.length}
          pendingGroups={groupInvitations.length}
        />
      )}

      <NewWaveModal isOpen={showNewWave} onClose={() => setShowNewWave(false)}
        onCreate={handleCreateWave} contacts={contacts} groups={groups} federationEnabled={federationEnabled} />

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          fetchAPI={fetchAPI}
          showToast={showToastMsg}
          onSelectMessage={handleSearchResultClick}
          isMobile={isMobile}
        />
      )}

      <UserProfileModal
        isOpen={!!profileUserId}
        onClose={() => setProfileUserId(null)}
        userId={profileUserId}
        currentUser={user}
        fetchAPI={fetchAPI}
        showToast={showToastMsg}
        contacts={contacts}
        blockedUsers={blockedUsers}
        mutedUsers={mutedUsers}
        onAddContact={async (userId, name) => {
          try {
            await fetchAPI('/contacts/request', { method: 'POST', body: { toUserId: userId } });
            showToastMsg(`Contact request sent to ${name}`, 'success');
            loadContactRequests();
          } catch (e) {
            showToastMsg(e.message || 'Failed to send contact request', 'error');
          }
        }}
        onBlock={async (userId, name) => {
          if (await handleBlockUser(userId)) {
            showToastMsg(`Blocked ${name}`, 'success');
          }
        }}
        onMute={async (userId, name) => {
          if (await handleMuteUser(userId)) {
            showToastMsg(`Muted ${name}`, 'success');
          }
        }}
        onFollow={async (userId, name) => {
          try {
            await fetchAPI('/contacts/follow', { method: 'POST', body: { userId } });
            showToastMsg(`Now following ${name}`, 'success');
            loadContacts();
          } catch (e) {
            showToastMsg(e.message || 'Failed to follow user', 'error');
          }
        }}
        onUnfollow={async (userId, name) => {
          try {
            await fetchAPI(`/contacts/follow/${userId}`, { method: 'DELETE' });
            showToastMsg(`Unfollowed ${name}`, 'success');
            loadContacts();
          } catch (e) {
            showToastMsg(e.message || 'Failed to unfollow user', 'error');
          }
        }}
        isMobile={isMobile}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Alert Detail Modal */}
      <AlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onDismiss={handleDismissAlert}
        isMobile={isMobile}
      />

      {/* PWA Components */}
      <OfflineIndicator />
      <InstallPrompt isMobile={isMobile} />
    </div>
  );
}

// ============ PUBLIC DROPLET VIEW (for shared links) ============
const PublicDropletView = ({ dropletId, onLogin, onRegister }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isMobile } = useWindowSize();

  useEffect(() => {
    fetch(`${API_URL}/share/${dropletId}`)
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          setError(result.error);
        } else {
          setData(result);
        }
      })
      .catch(() => setError('Failed to load shared content'))
      .finally(() => setLoading(false));
  }, [dropletId]);

  const containerStyle = {
    minHeight: '100vh',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontFamily: 'Courier New, monospace',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isMobile ? '20px' : '40px',
  };

  const cardStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: '4px',
    padding: isMobile ? '20px' : '32px',
    maxWidth: '600px',
    width: '100%',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: 'var(--accent-green)' }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--accent-orange)', margin: '0 0 16px 0' }}>Not Found</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button
            onClick={onLogin}
            style={{
              marginTop: '20px',
              padding: '12px 24px',
              background: 'var(--accent-green)',
              border: 'none',
              color: '#000',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '1rem',
            }}
          >
            LOGIN TO FARHOLD
          </button>
        </div>
      </div>
    );
  }

  if (!data.isPublic) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--accent-amber)', margin: '0 0 16px 0' }}>Private Content</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
            This droplet is in a private wave.
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Log in or create an account to view it.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={onLogin}
              style={{
                padding: '12px 24px',
                background: 'var(--accent-green)',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '1rem',
              }}
            >
              LOGIN
            </button>
            <button
              onClick={onRegister}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '1rem',
              }}
            >
              CREATE ACCOUNT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Public droplet - show preview
  // Content is already sanitized by the server, render as HTML
  const dropletContent = data.droplet?.content || '';

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Wave title */}
        <div style={{
          color: 'var(--accent-teal)',
          fontSize: '0.85rem',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>○</span>
          <span>{data.wave?.title || 'Farhold Wave'}</span>
        </div>

        {/* Author and content */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-secondary)',
          borderRadius: '4px',
          padding: '16px',
          marginBottom: '24px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}>
            {/* Avatar */}
            {data.author?.avatarUrl ? (
              <img
                src={data.author.avatarUrl}
                alt=""
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--accent-teal)30',
                color: 'var(--accent-teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
              }}>
                {(data.author?.displayName || '?')[0].toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {data.author?.displayName || 'Unknown'}
              </div>
              {data.author?.handle && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  @{data.author.handle}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              color: 'var(--text-primary)',
              lineHeight: '1.6',
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: dropletContent || '<em>No content</em>' }}
            className="public-droplet-content"
          />
          {data.droplet?.createdAt && (
            <div style={{
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              marginTop: '12px',
            }}>
              {new Date(data.droplet.createdAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{
          textAlign: 'center',
          borderTop: '1px solid var(--border-secondary)',
          paddingTop: '20px',
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Join the conversation on Farhold
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onLogin}
              style={{
                padding: '12px 24px',
                background: 'var(--accent-green)',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '1rem',
              }}
            >
              LOGIN
            </button>
            <button
              onClick={onRegister}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '1rem',
              }}
            >
              CREATE ACCOUNT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ AUTH PROVIDER ============
function AuthProvider({ children }) {
  const [user, setUser] = useState(storage.getUser());
  const [token, setToken] = useState(storage.getToken());
  const [loading, setLoading] = useState(true);
  // Temporary password storage for E2EE unlock (cleared after use)
  const pendingPasswordRef = useRef(null);

  useEffect(() => {
    // Check for browser session timeout (24 hours for non-PWA browser tabs)
    if (token && storage.isSessionExpired()) {
      console.log('⏰ Browser session expired (24 hour limit for non-PWA). Logging out...');
      storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
      setToken(null); setUser(null);
      setLoading(false);
      return;
    }

    if (token) {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(userData => {
          setUser(userData);
          storage.setUser(userData); // Save to localStorage
        })
        .catch(() => { storage.removeToken(); storage.removeUser(); storage.removeSessionStart(); setToken(null); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  // Periodic session expiry check (every 5 minutes) for long-running tabs
  useEffect(() => {
    if (!token) return;

    const checkExpiry = () => {
      if (storage.isSessionExpired()) {
        console.log('⏰ Browser session expired during use. Logging out...');
        storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
        setToken(null); setUser(null);
      }
    };

    const interval = setInterval(checkExpiry, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [token]);

  // Get pending password for E2EE unlock (one-time read, clears after access)
  const getPendingPassword = () => {
    const pwd = pendingPasswordRef.current;
    return pwd;
  };

  // Clear pending password after E2EE has used it
  const clearPendingPassword = () => {
    pendingPasswordRef.current = null;
  };

  const login = async (handle, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    // Check if MFA is required
    if (data.mfaRequired) {
      // Store password for later E2EE unlock after MFA
      pendingPasswordRef.current = password;
      return { mfaRequired: true, mfaChallenge: data.mfaChallenge, mfaMethods: data.mfaMethods };
    }
    // Store password for E2EE unlock
    pendingPasswordRef.current = password;
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(); // Start browser session timer
    setToken(data.token); setUser(data.user);
    return { success: true };
  };

  const completeMfaLogin = async (challengeId, method, code) => {
    const res = await fetch(`${API_URL}/auth/mfa/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, method, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'MFA verification failed');
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(); // Start browser session timer
    setToken(data.token); setUser(data.user);
    return { success: true };
  };

  const register = async (handle, email, password, displayName) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    // Store password for E2EE setup
    pendingPasswordRef.current = password;
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(); // Start browser session timer
    setToken(data.token); setUser(data.user);
  };

  const logout = async () => {
    // Revoke session on server
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout API error:', err);
      }
    }
    // Clear password and local storage
    pendingPasswordRef.current = null;
    storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
    setToken(null); setUser(null);
  };

  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    storage.setUser(updatedUser);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <AuthContext.Provider value={{ user, token, login, completeMfaLogin, register, logout, updateUser, getPendingPassword, clearPendingPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============ APP ============
export default function FarholdApp() {
  return (
    <AuthProvider>
      <E2EEWrapper />
    </AuthProvider>
  );
}

// E2EE wrapper that has access to AuthContext
function E2EEWrapper() {
  const { token } = useAuth();

  return (
    <E2EEProvider token={token} API_URL={API_URL}>
      <AppContent />
    </E2EEProvider>
  );
}

function AppContent() {
  const { user, token, logout } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [showRegisterScreen, setShowRegisterScreen] = useState(false);

  // Check for ?clear=1 URL parameter to force clear all data
  // This runs before anything else so it works even if the app is broken
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('clear') === '1') {
      console.log('[Clear] Clearing all data via URL parameter...');

      (async () => {
        try {
          localStorage.clear();
          sessionStorage.clear();

          // Clear IndexedDB
          const databases = await indexedDB.databases?.() || [];
          for (const db of databases) {
            if (db.name) indexedDB.deleteDatabase(db.name);
          }

          // Unregister service workers
          const registrations = await navigator.serviceWorker?.getRegistrations() || [];
          for (const registration of registrations) {
            await registration.unregister();
          }

          // Clear caches
          const cacheNames = await caches?.keys() || [];
          for (const cacheName of cacheNames) {
            await caches.delete(cacheName);
          }

          // Remove the ?clear=1 param and reload
          window.location.href = window.location.origin + window.location.pathname;
        } catch (err) {
          console.error('[Clear] Failed to clear data:', err);
          alert('Failed to clear some data. Try clearing manually in browser settings.');
        }
      })();
      return;
    }
  }, []);

  // Version check - clear stale data on major version upgrade
  useEffect(() => {
    const storedVersion = localStorage.getItem('farhold_app_version');
    const currentMajor = VERSION.split('.')[0];
    const storedMajor = storedVersion?.split('.')[0];

    if (storedVersion && storedMajor && currentMajor !== storedMajor) {
      console.log(`[Version] Major version change detected: ${storedVersion} → ${VERSION}. Clearing stale data...`);

      // Clear E2EE session data (but not localStorage entirely - that would log them out)
      sessionStorage.clear();

      // Clear service worker caches
      caches?.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });

      // Update stored version
      localStorage.setItem('farhold_app_version', VERSION);

      // Force reload to get fresh assets
      window.location.reload();
      return;
    }

    // Store current version
    localStorage.setItem('farhold_app_version', VERSION);
  }, []);

  // Capture share parameter on mount - check both URL formats:
  // 1. /?share=dropletId (query param style)
  // 2. /share/dropletId (path style - when server redirect doesn't work due to proxy)
  const [shareDropletId] = useState(() => {
    // Check query param first
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('share');
    if (fromQuery) return fromQuery;

    // Check path: /share/:dropletId
    const pathMatch = window.location.pathname.match(/^\/share\/(.+)$/);
    if (pathMatch) return pathMatch[1];

    return null;
  });

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate function for internal links
  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Public routes (accessible without login)
  if (currentPath === '/about') {
    return <AboutServerPage onBack={() => navigate('/')} />;
  }

  if (currentPath === '/reset-password' || currentPath.startsWith('/reset-password?')) {
    return <ResetPasswordPage onBack={() => navigate('/')} />;
  }

  // Handle shared droplet for unauthenticated users
  if (shareDropletId && !user) {
    if (showLoginScreen) {
      return <LoginScreen onAbout={() => navigate('/about')} />;
    }
    if (showRegisterScreen) {
      return <LoginScreen onAbout={() => navigate('/about')} initialView="register" />;
    }
    return (
      <PublicDropletView
        dropletId={shareDropletId}
        onLogin={() => setShowLoginScreen(true)}
        onRegister={() => setShowRegisterScreen(true)}
      />
    );
  }

  // Show login screen for unauthenticated users
  if (!user) {
    return <LoginScreen onAbout={() => navigate('/about')} />;
  }

  // User is authenticated - wrap with E2EE flow
  return <E2EEAuthenticatedApp shareDropletId={shareDropletId} logout={logout} />;
}

// E2EE authenticated app wrapper - handles E2EE setup/unlock before showing main app
function E2EEAuthenticatedApp({ shareDropletId, logout }) {
  const { getPendingPassword, clearPendingPassword } = useAuth();
  const {
    e2eeStatus,
    isUnlocked,
    needsPassphrase,
    needsSetup,
    isUnlocking,
    unlockError,
    checkE2EEStatus,
    setupE2EE,
    unlockE2EE,
    recoverWithPassphrase,
    clearE2EE,
    isCryptoAvailable
  } = useE2EE();

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [autoUnlockAttempted, setAutoUnlockAttempted] = useState(false);
  const [autoUnlockFailed, setAutoUnlockFailed] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false); // True if auto-unlock failed due to wrong password

  // Check E2EE status on mount
  useEffect(() => {
    checkE2EEStatus();
  }, [checkE2EEStatus]);

  // Auto-unlock E2EE with pending password (from login)
  useEffect(() => {
    const pendingPassword = getPendingPassword();
    if (needsPassphrase && pendingPassword && !autoUnlockAttempted && !isUnlocking) {
      setAutoUnlockAttempted(true);
      console.log('E2EE: Auto-unlocking with login password...');
      unlockE2EE(pendingPassword)
        .then(() => {
          console.log('E2EE: Auto-unlock successful');
          clearPendingPassword();
        })
        .catch((err) => {
          console.error('E2EE: Auto-unlock failed:', err);
          setAutoUnlockFailed(true);
          setPasswordMismatch(true); // Login password didn't match E2EE passphrase
          clearPendingPassword();
        });
    }
    // If we need passphrase but there's no pending password (page refresh/PWA reopen),
    // mark auto-unlock as attempted so we show the unlock modal
    if (needsPassphrase && !pendingPassword && !autoUnlockAttempted && !isUnlocking) {
      console.log('E2EE: No pending password, showing unlock modal');
      setAutoUnlockAttempted(true);
      setAutoUnlockFailed(true); // This triggers the unlock modal
      // Don't set passwordMismatch - this is just a reopen, not a failed unlock
    }
  }, [needsPassphrase, autoUnlockAttempted, isUnlocking, getPendingPassword, clearPendingPassword, unlockE2EE]);

  // Auto-setup E2EE with pending password (from registration)
  useEffect(() => {
    const pendingPassword = getPendingPassword();
    if (needsSetup && pendingPassword && !isSettingUp) {
      console.log('E2EE: Auto-setting up with login password...');
      setIsSettingUp(true);
      setupE2EE(pendingPassword, true)
        .then((result) => {
          console.log('E2EE: Auto-setup successful');
          clearPendingPassword();
          // Note: Recovery key is still generated and available, but we don't show the modal
          // Users can regenerate it from Profile Settings if needed
        })
        .catch((err) => {
          console.error('E2EE: Auto-setup failed:', err);
          clearPendingPassword();
        })
        .finally(() => {
          setIsSettingUp(false);
        });
    }
  }, [needsSetup, isSettingUp, getPendingPassword, clearPendingPassword, setupE2EE]);

  // Handle logout (also clears E2EE state)
  const handleLogout = () => {
    clearPendingPassword();
    clearE2EE();
    logout();
  };

  // Check if Web Crypto is available
  if (!isCryptoAvailable) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-primary)' }}>
        <h2 style={{ color: 'var(--accent-orange)' }}>Encryption Not Available</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Your browser does not support the Web Crypto API required for end-to-end encryption.
          Please use a modern browser (Chrome, Firefox, Safari, Edge) with HTTPS.
        </p>
        <button
          onClick={handleLogout}
          style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: 'var(--accent-orange)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Log Out
        </button>
      </div>
    );
  }

  // Show loading while checking E2EE status
  if (e2eeStatus === null) {
    return <LoadingSpinner message="Checking encryption status..." />;
  }

  // Show loading during auto-setup
  if (needsSetup && isSettingUp) {
    return <LoadingSpinner message="Setting up encryption..." />;
  }

  // Show loading during auto-unlock (only if we have a pending password)
  if (needsPassphrase && isUnlocking && !autoUnlockFailed) {
    return <LoadingSpinner message="Unlocking encryption..." />;
  }

  // Show unlock modal - either password mismatch or PWA reopen
  if (needsPassphrase && autoUnlockFailed) {
    return (
      <PassphraseUnlockModal
        onUnlock={async (passphrase, rememberDuration) => {
          const result = await unlockE2EE(passphrase, rememberDuration);
          // After successful unlock, clear the mismatch state
          setPasswordMismatch(false);
          return result;
        }}
        onRecover={recoverWithPassphrase}
        onLogout={handleLogout}
        isLoading={isUnlocking}
        error={unlockError}
        showMigrationNotice={passwordMismatch}
      />
    );
  }

  // Waiting for auto-unlock/setup - shouldn't get here but just in case
  if (needsPassphrase && !autoUnlockAttempted) {
    return <LoadingSpinner message="Preparing encryption..." />;
  }
  if (needsSetup && !isSettingUp) {
    return <LoadingSpinner message="Preparing encryption setup..." />;
  }

  // E2EE is unlocked - render the main app
  return <MainApp shareDropletId={shareDropletId} />;
}
