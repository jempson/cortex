// ============ CONFIGURATION ============
// Version - keep in sync with package.json
export const VERSION = '2.28.0';

// Auto-detect production vs development
export const isProduction = window.location.hostname !== 'localhost';
export const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
export const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const hostname = isProduction ? window.location.hostname : 'localhost';
export const port = isProduction ? '' : ':3001';

export const BASE_URL = isProduction
  ? `${protocol}//${hostname}`
  : 'http://localhost:3001';
export const API_URL = `${BASE_URL}/api`;
export const WS_URL = isProduction
  ? `${wsProtocol}//${hostname}/ws`
  : 'ws://localhost:3001';

// ============ PRIVACY LEVELS ============
export const PRIVACY_LEVELS = {
  private: { name: 'Private', color: 'var(--accent-orange)', bgColor: 'var(--overlay-orange)', icon: '◉', desc: 'Only invited participants' },
  group: { name: 'Crew', color: 'var(--accent-amber)', bgColor: 'var(--overlay-amber)', icon: '◈', desc: 'All crew members' },
  crossServer: { name: 'Verse-Wide', color: 'var(--accent-teal)', bgColor: 'var(--overlay-teal)', icon: '◇', desc: 'Allied ports in the Verse' },
  public: { name: 'Public', color: 'var(--accent-green)', bgColor: 'var(--overlay-green)', icon: '○', desc: 'Visible to everyone' },
};

// ============ ROLE-BASED ACCESS (v1.20.0) ============
export const ROLE_HIERARCHY = { admin: 3, moderator: 2, user: 1 };

// Check if user has required role level (admin > moderator > user)
export const canAccess = (user, requiredRole) => {
  if (!user) return false;
  const userRole = user.role || (user.isAdmin ? 'admin' : 'user');
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
};

// ============ THREADING DEPTH LIMIT ============
// Maximum nesting depth before prompting user to Focus or Burst
export const THREAD_DEPTH_LIMIT = 3;

// ============ FONT SIZES ============
export const FONT_SIZES = {
  small: { name: 'Small', multiplier: 0.9 },
  medium: { name: 'Medium', multiplier: 1 },
  large: { name: 'Large', multiplier: 1.15 },
  xlarge: { name: 'X-Large', multiplier: 1.3 },
};

// ============ NOTIFICATION BADGE COLORS ============
export const NOTIFICATION_BADGE_COLORS = {
  direct_mention: { bg: 'var(--accent-amber)', shadow: 'var(--glow-amber)', icon: '@' },  // Amber - someone mentioned you
  reply: { bg: 'var(--accent-green)', shadow: 'var(--glow-green)', icon: '↩' },           // Green - reply to your ping
  burst: { bg: 'var(--accent-purple)', shadow: 'var(--glow-purple)', icon: '◈' },          // Purple - burst activity
  wave_activity: { bg: 'var(--accent-orange)', shadow: 'var(--glow-orange)', icon: null },  // Orange - general activity
};
