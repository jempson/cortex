// ============ STORAGE UTILITIES ============

// Check if running as installed PWA (standalone mode)
export const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true || // iOS Safari
         document.referrer.includes('android-app://'); // Android TWA
};

export const storage = {
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
  setSessionStart: (duration = '24h') => {
    localStorage.setItem('farhold_session_start', Date.now().toString());
    localStorage.setItem('farhold_session_duration', duration);
  },
  removeSessionStart: () => {
    localStorage.removeItem('farhold_session_start');
    localStorage.removeItem('farhold_session_duration');
  },
  getSessionDuration: () => localStorage.getItem('farhold_session_duration') || '24h',
  // Check if browser session has expired (respects user-selected duration)
  isSessionExpired: () => {
    // PWA sessions don't expire based on time (they use device session)
    if (isPWA()) return false;

    const sessionStart = storage.getSessionStart();
    if (!sessionStart) return false; // No session start = legacy session, let it continue

    // Use the user's selected session duration instead of hardcoded 24h
    const duration = storage.getSessionDuration();
    const durationMs = duration === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                       duration === '30d' ? 30 * 24 * 60 * 60 * 1000 :
                       24 * 60 * 60 * 1000; // Default 24h

    const elapsed = Date.now() - sessionStart;
    return elapsed > durationMs;
  },
};
