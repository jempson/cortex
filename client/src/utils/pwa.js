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
export async function unsubscribeFromPush(token) {
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
