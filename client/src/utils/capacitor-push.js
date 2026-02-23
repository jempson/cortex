// ============ CAPACITOR NATIVE PUSH NOTIFICATIONS ============
// Client-side utility for Capacitor native push (FCM on Android, APNs on iOS).
// Since we use a remote URL wrapper, the @capacitor/* npm packages aren't loaded
// at runtime. We must use Capacitor.registerPlugin() to create JS proxies that
// communicate with the native plugins through the bridge.

import { API_URL } from '../config/constants.js';

const FCM_TOKEN_KEY = 'farhold_fcm_token';
const DEVICE_ID_KEY = 'farhold_device_id';

// Lazy-init plugin proxy — the Capacitor bridge may not be injected yet when
// this module is first evaluated, so we resolve on first call.
let _pushPlugin = null;
function getPushPlugin() {
  if (_pushPlugin) return _pushPlugin;
  if (window.Capacitor?.registerPlugin) {
    _pushPlugin = window.Capacitor.registerPlugin('PushNotifications');
  }
  return _pushPlugin;
}

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getPlatform() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  return 'unknown';
}

/**
 * Request permission and register for native push notifications.
 * Sends the FCM/APNs token to the server.
 */
export async function registerCapacitorPush(authToken) {
  const plugin = getPushPlugin();
  if (!plugin) {
    console.log('[CapPush] PushNotifications plugin not available');
    return { success: false, reason: 'Native push plugin not available' };
  }

  try {
    // Request permission
    const permResult = await plugin.requestPermissions();
    console.log('[CapPush] Permission result:', permResult.receive);

    if (permResult.receive !== 'granted') {
      return { success: false, reason: 'Push notification permission denied' };
    }

    // Register with the native push service (FCM/APNs)
    // The token arrives asynchronously via the 'registration' event
    const token = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Push registration timed out'));
      }, 15000);

      plugin.addListener('registration', (regToken) => {
        clearTimeout(timeout);
        resolve(regToken.value);
      });

      plugin.addListener('registrationError', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.error || 'Registration failed'));
      });

      plugin.register();
    });

    console.log('[CapPush] Got FCM token:', token.substring(0, 20) + '...');

    // Store locally
    localStorage.setItem(FCM_TOKEN_KEY, token);

    // Send to server
    const response = await fetch(`${API_URL}/push/fcm/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: getPlatform(),
        deviceId: getOrCreateDeviceId(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CapPush] Server registration failed:', response.status, errorText);
      return { success: false, reason: `Server rejected token: ${errorText}` };
    }

    console.log('[CapPush] FCM token registered with server');
    return { success: true };
  } catch (error) {
    console.error('[CapPush] Registration error:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Set up listeners for incoming push notifications.
 * @param {function} onNotificationTap - Called with { waveId } when user taps a notification
 */
export function setupCapacitorPushListeners(onNotificationTap) {
  const plugin = getPushPlugin();
  if (!plugin) return;

  // Foreground notification — log it (OS shows nothing by default, our config enables alert)
  plugin.addListener('pushNotificationReceived', (notification) => {
    console.log('[CapPush] Foreground notification:', notification.title, notification.body);
  });

  // User tapped a notification (background or killed state)
  plugin.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[CapPush] Notification tapped:', action.notification?.data);
    const data = action.notification?.data;
    if (data?.waveId && onNotificationTap) {
      onNotificationTap({ waveId: data.waveId });
    }
  });
}

/**
 * Unregister from native push notifications.
 * Removes the FCM token from the server and clears local storage.
 */
export async function unregisterCapacitorPush(authToken) {
  const token = localStorage.getItem(FCM_TOKEN_KEY);

  try {
    await fetch(`${API_URL}/push/fcm/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
    console.log('[CapPush] FCM token unregistered from server');
  } catch (error) {
    console.warn('[CapPush] Server unregister failed:', error.message);
  }

  localStorage.removeItem(FCM_TOKEN_KEY);
}
