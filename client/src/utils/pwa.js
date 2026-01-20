// ============ PWA UTILITIES ============

import { API_URL } from '../config/constants.js';

// PWA Badge API - shows unread count on installed app icon
// Note: Only works when installed as PWA (not in browser tab)
export const updateAppBadge = (count) => {
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

// Subscribe to push notifications
export async function subscribeToPush(token) {
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

        // If AbortError (push service error), try aggressive recovery strategies
        if (subError.name === 'AbortError') {
          console.log('[Push] AbortError detected - attempting aggressive recovery...');

          // Strategy 1: Try to get and unsubscribe any stale subscription
          try {
            const staleSubscription = await registration.pushManager.getSubscription();
            if (staleSubscription) {
              console.log('[Push] Found stale subscription, unsubscribing...');
              await staleSubscription.unsubscribe();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (e) {
            console.log('[Push] Could not clear stale subscription:', e.message);
          }

          // Strategy 2: Full service worker reset with cache clearing
          let newReg = null;
          try {
            console.log('[Push] Performing full service worker reset...');

            // Unregister all service workers for this scope
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.unregister();
            }

            // Clear all caches
            if ('caches' in window) {
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name => caches.delete(name)));
              console.log('[Push] Cleared all caches');
            }

            // Clear VAPID key
            localStorage.removeItem('farhold_vapid_key');

            // Wait for push service to fully clear state
            console.log('[Push] Waiting for push service to reset...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Re-register service worker
            console.log('[Push] Re-registering service worker...');
            newReg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[Push] Service worker re-registered');
          } catch (e) {
            console.log('[Push] Service worker reset error:', e.message);
          }

          // Strategy 3: Multiple retry attempts with increasing delays
          const retryDelays = [1000, 2000, 3000];
          let lastError = null;

          for (let i = 0; i < retryDelays.length; i++) {
            try {
              console.log(`[Push] Subscription attempt ${i + 1}/${retryDelays.length}...`);
              const reg = newReg || await navigator.serviceWorker.ready;
              subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
              });
              console.log('[Push] Subscription succeeded on retry');
              break;
            } catch (retryError) {
              lastError = retryError;
              console.log(`[Push] Attempt ${i + 1} failed:`, retryError.message);
              if (i < retryDelays.length - 1) {
                console.log(`[Push] Waiting ${retryDelays[i]}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
              }
            }
          }

          // If all retries failed, provide guidance
          if (!subscription) {
            console.error('[Push] All recovery attempts failed');

            const isFirefox = navigator.userAgent.includes('Firefox');
            const isChrome = navigator.userAgent.includes('Chrome');

            let guidance = 'Push service error. Please try: ';
            if (isFirefox) {
              guidance += 'Click the lock icon → Connection secure → More Information → Permissions → Clear "Receive Notifications" permission, then refresh and try again.';
            } else if (isChrome) {
              guidance += 'Click the lock icon → Site settings → Notifications → Reset, then refresh and try again.';
            } else {
              guidance += 'Reset notification permissions for this site in browser settings, then refresh.';
            }

            return { success: false, reason: guidance };
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
export async function unsubscribeFromPush(token) {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;

      // Unsubscribe locally first
      try {
        await subscription.unsubscribe();
        console.log('[Push] Local subscription removed');
      } catch (unsubError) {
        console.warn('[Push] Local unsubscribe failed:', unsubError.message);
        // Continue anyway to clean up server-side
      }

      // Tell server to remove subscription
      try {
        await fetch(`${API_URL}/push/subscribe`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ endpoint })
        });
        console.log('[Push] Server subscription removed');
      } catch (serverError) {
        console.warn('[Push] Server unsubscribe failed:', serverError.message);
      }
    }

    // Always clear stored VAPID key to ensure clean state for re-enable
    localStorage.removeItem('farhold_vapid_key');
    console.log('[Push] Push subscription cleanup complete');
    return true;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    // Still try to clear VAPID key
    localStorage.removeItem('farhold_vapid_key');
    return false;
  }
}

// Force reset push notification state (for troubleshooting)
export async function forceResetPushState() {
  console.log('[Push] Force resetting push state...');

  try {
    // Clear stored VAPID key
    localStorage.removeItem('farhold_vapid_key');

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      // Try to unsubscribe any existing subscription
      try {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          console.log('[Push] Existing subscription unsubscribed');
        }
      } catch (e) {
        console.log('[Push] Could not unsubscribe:', e.message);
      }

      // Unregister service worker
      try {
        await registration.unregister();
        console.log('[Push] Service worker unregistered');
      } catch (e) {
        console.log('[Push] Could not unregister SW:', e.message);
      }

      // Re-register service worker
      await new Promise(resolve => setTimeout(resolve, 1000));
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      console.log('[Push] Service worker re-registered');
    }

    console.log('[Push] Force reset complete - try enabling notifications again');
    return true;
  } catch (error) {
    console.error('[Push] Force reset failed:', error);
    return false;
  }
}

// Convert base64 VAPID key to Uint8Array
export function urlBase64ToUint8Array(base64String) {
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
