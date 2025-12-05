import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';

// ============ CONFIGURATION ============
// Auto-detect production vs development
const isProduction = window.location.hostname !== 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const hostname = isProduction ? window.location.hostname : 'localhost';
const port = isProduction ? '' : ':3001';

const API_URL = isProduction
  ? `${protocol}//${hostname}/api`
  : 'http://localhost:3001/api';
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
  private: { name: 'Private', color: '#ff6b35', bgColor: 'rgba(255, 107, 53, 0.15)', icon: '◉', desc: 'Only invited participants' },
  group: { name: 'Group', color: '#ffd23f', bgColor: 'rgba(255, 210, 63, 0.15)', icon: '◈', desc: 'All group members' },
  crossServer: { name: 'Cross-Server', color: '#3bceac', bgColor: 'rgba(59, 206, 172, 0.15)', icon: '◇', desc: 'Federated servers' },
  public: { name: 'Public', color: '#0ead69', bgColor: 'rgba(14, 173, 105, 0.15)', icon: '○', desc: 'Visible to everyone' },
};

// ============ THEMES ============
const THEMES = {
  firefly: {
    name: 'Firefly (Default)',
    baseFontSize: '16px',
  },
  highContrast: {
    name: 'High Contrast',
    baseFontSize: '16px',
  },
  light: {
    name: 'Light Mode',
    baseFontSize: '16px',
  },
};

const FONT_SIZES = {
  small: { name: 'Small', multiplier: 0.9 },
  medium: { name: 'Medium', multiplier: 1 },
  large: { name: 'Large', multiplier: 1.15 },
  xlarge: { name: 'X-Large', multiplier: 1.3 },
};

// ============ STORAGE ============
const storage = {
  getToken: () => localStorage.getItem('cortex_token'),
  setToken: (token) => localStorage.setItem('cortex_token', token),
  removeToken: () => localStorage.removeItem('cortex_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('cortex_user')); } catch { return null; } },
  setUser: (user) => localStorage.setItem('cortex_user', JSON.stringify(user)),
  removeUser: () => localStorage.removeItem('cortex_user'),
};

// ============ EMOJI PICKER COMPONENT ============
const EmojiPicker = ({ onSelect, onClose, isMobile }) => {
  const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '💯', '❤️', '😎', '🚀', '✨', '💪', '👏', '🙌'];
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
      background: '#0d150d', border: '1px solid #2a3a2a',
      padding: isMobile ? '12px' : '8px', display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(6, 1fr)',
      gap: isMobile ? '8px' : '4px',
      zIndex: 10,
      maxWidth: isMobile ? '100%' : '300px',
    }}>
      {emojis.map(emoji => (
        <button key={emoji} onClick={() => onSelect(emoji)} style={{
          padding: isMobile ? '12px' : '8px',
          minHeight: isMobile ? '44px' : 'auto',
          background: 'transparent', border: '1px solid #2a3a2a',
          cursor: 'pointer', fontSize: isMobile ? '1.5rem' : '1.2rem',
        }}>{emoji}</button>
      ))}
      <button onClick={onClose} style={{
        gridColumn: 'span 2', padding: isMobile ? '12px' : '8px',
        minHeight: isMobile ? '44px' : 'auto',
        background: 'transparent',
        border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer',
        fontSize: isMobile ? '0.85rem' : '0.7rem', fontFamily: 'monospace',
      }}>CLOSE</button>
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
    const dismissedAt = localStorage.getItem('cortex_install_dismissed');
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
    localStorage.setItem('cortex_install_dismissed', Date.now().toString());
  };

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
        <div style={{ color: '#0ead69', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'monospace' }}>
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
          x
        </button>
      </div>

      <p style={{
        color: '#c5d5c5',
        fontSize: '0.85rem',
        marginBottom: '16px',
        lineHeight: 1.4,
        fontFamily: 'monospace'
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

const GlowText = ({ children, color = '#ffd23f', size = '1rem', weight = 400 }) => (
  <span style={{ color, fontSize: size, fontWeight: weight, textShadow: `0 0 10px ${color}80, 0 0 20px ${color}40` }}>
    {children}
  </span>
);

const Avatar = ({ letter, color = '#ffd23f', size = 40, status }) => (
  <div style={{ position: 'relative', flexShrink: 0 }}>
    <div style={{
      width: size, height: size,
      background: `linear-gradient(135deg, ${color}40, ${color}10)`,
      border: `1px solid ${color}60`, borderRadius: '2px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color, fontSize: size * 0.4,
    }}>
      {letter}
    </div>
    {status && (
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: '8px', height: '8px', borderRadius: '50%',
        background: status === 'online' ? '#0ead69' : status === 'away' ? '#ffd23f' : '#5a6a5a',
        boxShadow: status === 'online' ? '0 0 6px #0ead69' : 'none',
      }} />
    )}
  </div>
);

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
  const colors = { success: '#0ead69', error: '#ff6b35', info: '#ffd23f' };
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      padding: '12px 24px', background: '#0d150d',
      border: `1px solid ${colors[type]}`, color: colors[type],
      fontFamily: 'monospace', fontSize: '0.85rem', zIndex: 200,
      maxWidth: '90vw', textAlign: 'center',
    }}>
      {message}
    </div>
  );
};

const LoadingSpinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
    <div style={{
      width: '40px', height: '40px', border: '3px solid #2a3a2a',
      borderTop: '3px solid #ffd23f', borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ============ LOGIN SCREEN ============
const LoginScreen = () => {
  const { login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { isMobile, isTablet, isDesktop } = useWindowSize();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) await register(handle, email, password, displayName);
      else await login(handle, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', boxSizing: 'border-box',
    background: '#0a100a', border: '1px solid #2a3a2a',
    color: '#c5d5c5', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, #0d150d, #050805)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace", padding: isMobile ? '20px' : '0',
    }}>
      <ScanLines />
      <div style={{
        width: '100%', maxWidth: '400px', padding: isMobile ? '24px' : '40px',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #ffd23f40',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <GlowText color="#ffd23f" size={isMobile ? '2rem' : '2.5rem'} weight={700}>CORTEX</GlowText>
          <div style={{ color: '#5a6a5a', fontSize: '0.8rem', marginTop: '8px' }}>SECURE COMMUNICATIONS</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>
              {isRegistering ? 'HANDLE' : 'HANDLE / EMAIL'}
            </label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
              placeholder={isRegistering ? 'Choose handle' : 'Enter handle or email'} style={inputStyle} />
          </div>

          {isRegistering && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>EMAIL</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>DISPLAY NAME</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you" style={inputStyle} />
              </div>
            </>
          )}

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>PASSWORD</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegistering ? 'Min 8 chars, upper, lower, number' : 'Enter password'} style={inputStyle} />
          </div>

          {error && <div style={{ color: '#ff6b35', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: '#ff6b3510', border: '1px solid #ff6b3530' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px',
            background: loading ? '#2a3a2a' : '#ffd23f20',
            border: `1px solid ${loading ? '#3a4a3a' : '#ffd23f'}`,
            color: loading ? '#5a6a5a' : '#ffd23f',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace', fontSize: '0.9rem',
          }}>
            {loading ? 'PROCESSING...' : isRegistering ? 'CREATE ACCOUNT' : 'LOGIN'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={{ background: 'none', border: 'none', color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {isRegistering ? '← BACK TO LOGIN' : 'NEW USER? CREATE ACCOUNT →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ WAVE LIST (Mobile Responsive) ============
const WaveList = ({ waves, selectedWave, onSelectWave, onNewWave, showArchived, onToggleArchived, isMobile }) => (
  <div style={{ 
    width: isMobile ? '100%' : '300px', 
    minWidth: isMobile ? 'auto' : '280px',
    borderRight: isMobile ? 'none' : '1px solid #2a3a2a', 
    display: 'flex', flexDirection: 'column', height: '100%',
    borderBottom: isMobile ? '1px solid #2a3a2a' : 'none',
  }}>
    <div style={{ padding: isMobile ? '14px 16px' : '12px 16px', borderBottom: '1px solid #2a3a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
      <GlowText color="#ffd23f" size={isMobile ? '1rem' : '0.9rem'}>WAVES</GlowText>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onToggleArchived} style={{
          padding: isMobile ? '12px 14px' : '6px 10px',
          minHeight: isMobile ? '44px' : 'auto',
          minWidth: isMobile ? '44px' : 'auto',
          background: showArchived ? '#3bceac20' : 'transparent',
          border: `1px solid ${showArchived ? '#3bceac' : '#3a4a3a'}`,
          color: showArchived ? '#3bceac' : '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
        }}>{showArchived ? '📦' : '📬'}</button>
        <button onClick={onNewWave} style={{
          padding: isMobile ? '12px 16px' : '6px 12px',
          minHeight: isMobile ? '44px' : 'auto',
          background: '#ffd23f20', border: '1px solid #ffd23f50',
          color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
        }}>+ NEW</button>
      </div>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {waves.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#5a6a5a', fontSize: '0.85rem' }}>
          {showArchived ? 'No archived waves' : 'No waves yet. Create one!'}
        </div>
      ) : waves.map(wave => {
        const config = PRIVACY_LEVELS[wave.privacy] || PRIVACY_LEVELS.private;
        const isSelected = selectedWave?.id === wave.id;
        return (
          <div key={wave.id} onClick={() => onSelectWave(wave)}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = '#1a2a1a';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
            style={{
            padding: '12px 16px', cursor: 'pointer',
            background: isSelected ? '#ffd23f10' : 'transparent',
            borderBottom: '1px solid #1a2a1a',
            borderLeft: `3px solid ${isSelected ? config.color : 'transparent'}`,
            transition: 'background 0.2s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
              <div style={{ color: '#c5d5c5', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                {wave.is_archived && '📦 '}{wave.title}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {wave.unread_count > 0 && (
                  <span style={{
                    background: '#ff6b35',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    boxShadow: '0 0 8px rgba(255, 107, 53, 0.6)',
                  }}>{wave.unread_count}</span>
                )}
                <span style={{ color: config.color }}>{config.icon}</span>
              </div>
            </div>
            <div style={{ color: '#5a6a5a', fontSize: isMobile ? '0.85rem' : '0.7rem' }}>
              @{wave.creator_handle || 'unknown'} • {wave.message_count} msgs
              {wave.group_name && <span> • {wave.group_name}</span>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ============ THREADED MESSAGE ============
const ThreadedMessage = ({ message, depth = 0, onReply, onDelete, onEdit, onSaveEdit, onCancelEdit, editingMessageId, editContent, setEditContent, currentUserId, highlightId, playbackIndex, collapsed, onToggleCollapse, isMobile, onReact, onMessageClick, participants = [] }) => {
  const config = PRIVACY_LEVELS[message.privacy] || PRIVACY_LEVELS.private;
  const isHighlighted = highlightId === message.id;
  const isVisible = playbackIndex === null || message._index <= playbackIndex;
  const hasChildren = message.children?.length > 0;
  const isCollapsed = collapsed[message.id];
  const indentSize = isMobile ? 12 : 24;
  const isDeleted = message.deleted;
  const canDelete = !isDeleted && message.author_id === currentUserId;
  const isEditing = !isDeleted && editingMessageId === message.id;
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const isUnread = !isDeleted && message.is_unread && message.author_id !== currentUserId;

  const quickReactions = ['👍', '❤️', '😂', '🎉', '🤔', '👏'];

  if (!isVisible) return null;

  const handleMessageClick = () => {
    if (isUnread && onMessageClick) {
      onMessageClick(message.id);
    }
  };

  return (
    <div>
      <div
        onClick={handleMessageClick}
        style={{
          padding: isMobile ? '10px 12px' : '12px 16px', marginBottom: '8px',
          background: isDeleted ? '#0a0f0a' : isHighlighted ? `${config.color}20` : isUnread ? '#ffd23f10' : 'linear-gradient(135deg, #0d150d, #1a2a1a)',
          border: `1px solid ${isDeleted ? '#1a1f1a' : isHighlighted ? config.color : isUnread ? '#ffd23f' : '#2a3a2a'}`,
          borderLeft: `3px solid ${isDeleted ? '#3a3a3a' : isUnread ? '#ffd23f' : config.color}`,
          cursor: isUnread ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          opacity: isDeleted ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (isUnread) {
            e.currentTarget.style.background = '#ffd23f20';
            e.currentTarget.style.borderColor = '#ffd23f';
          }
        }}
        onMouseLeave={(e) => {
          if (isUnread) {
            e.currentTarget.style.background = '#ffd23f10';
            e.currentTarget.style.borderColor = isHighlighted ? config.color : '#ffd23f';
          }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <Avatar letter={message.sender_avatar || '?'} color={config.color} size={isMobile ? 32 : 32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#c5d5c5', fontSize: isMobile ? '0.9rem' : '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message.sender_name}</div>
              <div style={{ color: '#5a6a5a', fontSize: isMobile ? '0.85rem' : '0.65rem', fontFamily: 'monospace' }}>
                @{message.sender_handle} • {new Date(message.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <PrivacyBadge level={message.privacy} compact />
        </div>
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
                background: '#0a100a',
                border: '1px solid #ffd23f',
                color: '#9bab9b',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.95rem' : '0.85rem',
                resize: 'vertical',
              }}
              placeholder="Edit your message..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => onSaveEdit(message.id)} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: '#0ead6920',
                border: '1px solid #0ead69',
                color: '#0ead69',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>💾 SAVE (Ctrl+Enter)</button>
              <button onClick={onCancelEdit} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid #6a7a6a',
                color: '#6a7a6a',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>✕ CANCEL (Esc)</button>
            </div>
          </div>
        ) : isDeleted ? (
          <div
            style={{
              color: '#5a5a5a',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              fontStyle: 'italic',
            }}
          >
            [Message deleted]
          </div>
        ) : (
          <div
            style={{
              color: '#9bab9b',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
            dangerouslySetInnerHTML={{ __html: message.content }}
          />
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => onReply(message)} style={{
            padding: isMobile ? '10px 14px' : '4px 8px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent', border: '1px solid #3a4a3a',
            color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
          }}>↵ REPLY</button>
          {hasChildren && (
            <button onClick={() => onToggleCollapse(message.id)} style={{
              padding: isMobile ? '10px 14px' : '4px 8px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'transparent', border: '1px solid #3a4a3a',
              color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
            }}>{isCollapsed ? `▶ ${message.children.length}` : '▼'}</button>
          )}
          {canDelete && !isEditing && (
            <>
              <button onClick={() => onEdit(message)} style={{
                padding: isMobile ? '10px 14px' : '4px 8px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent', border: '1px solid #ffd23f30',
                color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>✏️ EDIT</button>
              <button onClick={() => onDelete(message)} style={{
                padding: isMobile ? '10px 14px' : '4px 8px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent', border: '1px solid #ff6b3530',
                color: '#ff6b35', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>✕ DELETE</button>
            </>
          )}
        </div>

        {/* Reactions Display - hidden for deleted messages */}
        {!isDeleted && message.reactions && Object.keys(message.reactions).length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', marginBottom: '8px' }}>
            {Object.entries(message.reactions).map(([emoji, userIds]) => {
              const hasReacted = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  style={{
                    padding: isMobile ? '6px 10px' : '4px 8px',
                    minHeight: isMobile ? '38px' : 'auto',
                    background: hasReacted ? '#ffd23f20' : 'transparent',
                    border: `1px solid ${hasReacted ? '#ffd23f' : '#3a4a3a'}`,
                    color: hasReacted ? '#ffd23f' : '#6a7a6a',
                    cursor: 'pointer',
                    fontSize: isMobile ? '1.1rem' : '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: isMobile ? '0.8rem' : '0.7rem', fontFamily: 'monospace' }}>
                    {userIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick React Buttons - hidden for deleted messages */}
        {!isDeleted && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px', position: 'relative' }}>
          <button
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            style={{
              padding: isMobile ? '6px 10px' : '4px 8px',
              minHeight: isMobile ? '38px' : 'auto',
              background: 'transparent',
              border: '1px solid #3a4a3a',
              color: '#6a7a6a',
              cursor: 'pointer',
              fontSize: isMobile ? '1rem' : '0.9rem',
            }}
          >
            {showReactionPicker ? '✕' : '😀+'}
          </button>

          {showReactionPicker && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: '#0d150d',
              border: '1px solid #2a3a2a',
              padding: '8px',
              display: 'flex',
              gap: '4px',
              zIndex: 10,
              flexWrap: 'wrap',
              maxWidth: isMobile ? '200px' : '250px',
            }}>
              {quickReactions.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(message.id, emoji);
                    setShowReactionPicker(false);
                  }}
                  style={{
                    padding: isMobile ? '8px' : '6px',
                    minHeight: isMobile ? '38px' : 'auto',
                    minWidth: isMobile ? '38px' : 'auto',
                    background: 'transparent',
                    border: '1px solid #2a3a2a',
                    cursor: 'pointer',
                    fontSize: isMobile ? '1.3rem' : '1.1rem',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Read Receipts - hidden for deleted messages */}
        {!isDeleted && message.readBy && message.readBy.length > 0 && (
          <details style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #2a3a2a',
            cursor: 'pointer'
          }}>
            <summary style={{
              color: '#6a7a6a',
              fontSize: isMobile ? '0.7rem' : '0.65rem',
              userSelect: 'none',
              fontFamily: 'monospace',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ color: '#0ead69' }}>✓</span>
              Seen by {message.readBy.length} {message.readBy.length === 1 ? 'person' : 'people'}
            </summary>
            <div style={{
              marginTop: '6px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px'
            }}>
              {message.readBy.map(userId => {
                const participant = participants.find(p => p.id === userId);
                const displayName = participant ? participant.name : userId;
                return (
                  <span
                    key={userId}
                    title={participant?.handle || ''}
                    style={{
                      padding: '2px 6px',
                      background: '#0ead6920',
                      border: '1px solid #0ead69',
                      color: '#0ead69',
                      fontSize: isMobile ? '0.65rem' : '0.6rem',
                      fontFamily: 'monospace'
                    }}
                  >
                    {displayName}
                  </span>
                );
              })}
            </div>
          </details>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <div style={{ borderLeft: '1px solid #3a4a3a', marginLeft: `${indentSize}px` }}>
          {message.children.map(child => (
            <ThreadedMessage key={child.id} message={child} depth={depth + 1} onReply={onReply} onDelete={onDelete}
              onEdit={onEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
              editingMessageId={editingMessageId} editContent={editContent} setEditContent={setEditContent}
              currentUserId={currentUserId} highlightId={highlightId} playbackIndex={playbackIndex} collapsed={collapsed}
              onToggleCollapse={onToggleCollapse} isMobile={isMobile} onReact={onReact} onMessageClick={onMessageClick}
              participants={participants} />
          ))}
        </div>
      )}
    </div>
  );
};

// ============ PLAYBACK CONTROLS (Mobile Responsive) ============
const PlaybackControls = ({ isPlaying, onTogglePlay, currentIndex, totalMessages, onSeek, onReset, playbackSpeed, onSpeedChange, isMobile }) => (
  <div style={{
    flexShrink: 0,
    padding: isMobile ? '8px 12px' : '12px 16px', background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
    borderBottom: '1px solid #2a3a2a', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap',
  }}>
    <GlowText color="#3bceac" size="0.8rem">PLAYBACK</GlowText>
    <div style={{ display: 'flex', gap: '4px' }}>
      <button onClick={onReset} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem' }}>⟲</button>
      <button onClick={onTogglePlay} style={{
        padding: '4px 12px', background: isPlaying ? '#ff6b3520' : '#0ead6920',
        border: `1px solid ${isPlaying ? '#ff6b35' : '#0ead69'}`,
        color: isPlaying ? '#ff6b35' : '#0ead69', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
      }}>{isPlaying ? '⏸' : '▶'}</button>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '100px' }}>
      <input type="range" min={0} max={totalMessages - 1} value={currentIndex ?? totalMessages - 1}
        onChange={(e) => onSeek(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#3bceac', minWidth: '60px' }} />
      <span style={{ color: '#6a7a6a', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {(currentIndex ?? totalMessages - 1) + 1}/{totalMessages}
      </span>
    </div>
    {!isMobile && (
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0.5, 1, 2, 4].map(speed => (
          <button key={speed} onClick={() => onSpeedChange(speed)} style={{
            padding: '4px 6px', background: playbackSpeed === speed ? '#3bceac20' : 'transparent',
            border: `1px solid ${playbackSpeed === speed ? '#3bceac' : '#3a4a3a'}`,
            color: playbackSpeed === speed ? '#3bceac' : '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem',
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
        background: 'linear-gradient(135deg, #1a0a0a, #0d150d)',
        border: '2px solid #ff6b3580', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: '20px' }}>
          <GlowText color="#ff6b35" size={isMobile ? '1rem' : '1.1rem'}>Delete Wave</GlowText>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{
            color: '#c5d5c5',
            fontSize: isMobile ? '0.9rem' : '0.95rem',
            lineHeight: 1.6,
            marginBottom: '12px'
          }}>
            Are you sure you want to delete <span style={{ color: '#ffd23f', fontWeight: 600 }}>"{waveTitle}"</span>?
          </div>
          <div style={{
            color: '#ff6b35',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
            lineHeight: 1.5,
            background: '#ff6b3515',
            padding: '12px',
            border: '1px solid #ff6b3530',
          }}>
            ⚠ This action cannot be undone. All messages will be permanently deleted and all participants will be notified.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid #3a4a3a',
            color: '#6a7a6a',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
          }}>CANCEL</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: '#ff6b35',
            border: '1px solid #ff6b35',
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

// ============ WAVE SETTINGS MODAL ============
const WaveSettingsModal = ({ isOpen, onClose, wave, groups, fetchAPI, showToast, onUpdate }) => {
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
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #3bceac40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="#3bceac" size="1.1rem">Wave Settings</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            background: '#0a100a', border: '1px solid #2a3a2a',
            color: '#c5d5c5', fontSize: '0.9rem', fontFamily: 'inherit',
          }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>PRIVACY LEVEL</div>
          {Object.entries(PRIVACY_LEVELS).map(([key, config]) => (
            <button key={key} onClick={() => { setPrivacy(key); if (key !== 'group') setSelectedGroup(null); }}
              style={{
                width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left',
                background: privacy === key ? config.bgColor : '#0a100a',
                border: `1px solid ${privacy === key ? config.color : '#2a3a2a'}`, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: config.color, fontSize: '1.1rem' }}>{config.icon}</span>
                <div>
                  <div style={{ color: config.color }}>{config.name}</div>
                  <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>{config.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {privacy === 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>SELECT GROUP</div>
            {groups.length === 0 ? (
              <div style={{ color: '#5a6a5a', padding: '10px', background: '#0a100a' }}>No groups available</div>
            ) : groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
                width: '100%', padding: '10px', marginBottom: '4px', textAlign: 'left',
                background: selectedGroup === g.id ? '#ffd23f15' : '#0a100a',
                border: `1px solid ${selectedGroup === g.id ? '#ffd23f' : '#2a3a2a'}`, cursor: 'pointer',
              }}>
                <div style={{ color: '#c5d5c5' }}>{g.name}</div>
                <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>{g.memberCount} members</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleSave} style={{
            flex: 1, padding: '12px', background: '#3bceac20',
            border: '1px solid #3bceac', color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace',
          }}>SAVE</button>
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
        ? <span key={i} style={{ background: '#ffd23f40', color: '#ffd23f', fontWeight: 'bold' }}>{part}</span>
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
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #3bceac',
        padding: isMobile ? '20px' : '24px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#3bceac', margin: 0, fontSize: isMobile ? '1.2rem' : '1.5rem' }}>SEARCH MESSAGES</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer', fontSize: '1.5rem',
            minHeight: isMobile ? '44px' : 'auto', minWidth: isMobile ? '44px' : 'auto',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search messages..."
            style={{
              flex: 1,
              padding: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto',
              background: '#0a100a',
              border: '1px solid #2a3a2a',
              color: '#c5d5c5',
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
              background: '#3bceac20',
              border: '1px solid #3bceac',
              color: '#3bceac',
              cursor: searching ? 'wait' : 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {searching ? 'SEARCHING...' : 'SEARCH'}
          </button>
        </div>

        {hasSearched && (
          <div style={{ color: '#6a7a6a', fontSize: '0.85rem', marginBottom: '16px' }}>
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
                background: '#0a100a',
                border: '1px solid #2a3a2a',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3bceac'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#2a3a2a'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.75rem' }}>
                <span style={{ color: '#3bceac' }}>{result.waveName}</span>
                <span style={{ color: '#6a7a6a' }}>
                  {new Date(result.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ color: '#8a9a8a', fontSize: '0.8rem', marginBottom: '4px' }}>
                @{result.authorHandle}
              </div>
              <div style={{ color: '#c5d5c5', fontSize: isMobile ? '0.95rem' : '0.9rem', lineHeight: '1.5' }}>
                {highlightMatch(result.content, searchQuery)}
              </div>
            </div>
          ))}
        </div>

        {hasSearched && results.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6a7a6a', padding: '40px 20px' }}>
            No messages found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

// ============ WAVE VIEW (Mobile Responsive) ============
const WaveView = ({ wave, onBack, fetchAPI, showToast, currentUser, groups, onWaveUpdate, isMobile, sendWSMessage, typingUsers, reloadTrigger, contacts, contactRequests, sentContactRequests, onRequestsChange, onContactsChange }) => {
  const [waveData, setWaveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPlayback, setShowPlayback] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [requestModalParticipant, setRequestModalParticipant] = useState(null);
  const playbackRef = useRef(null);

  // Helper functions for participant contact status
  const isContact = (userId) => contacts?.some(c => c.id === userId) || false;
  const hasSentRequestTo = (userId) => sentContactRequests?.some(r => r.to_user_id === userId) || false;
  const hasReceivedRequestFrom = (userId) => contactRequests?.some(r => r.from_user_id === userId) || false;

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
  const composeRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const hasMarkedAsReadRef = useRef(false);
  const scrollPositionToRestore = useRef(null);
  const lastTypingSentRef = useRef(null);

  useEffect(() => {
    loadWave();
    hasMarkedAsReadRef.current = false; // Reset when switching waves
  }, [wave.id]);

  // Reload wave when reloadTrigger changes (from WebSocket events)
  useEffect(() => {
    if (reloadTrigger > 0) {
      // Only save scroll position if not already pending restoration
      // (prevents overwriting correct position during race conditions)
      if (messagesRef.current && scrollPositionToRestore.current === null) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }
      loadWave();
    }
  }, [reloadTrigger]);

  // Restore scroll position after wave data updates (for click-to-read and similar actions)
  useEffect(() => {
    if (scrollPositionToRestore.current !== null && messagesRef.current) {
      // Use requestAnimationFrame for smoother restoration without visible jump
      requestAnimationFrame(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = scrollPositionToRestore.current;
          scrollPositionToRestore.current = null;
        }
      });
    }
  }, [waveData]);

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
    if (isPlaying && waveData) {
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

  const loadWave = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI(`/waves/${wave.id}`);
      let idx = 0;
      const addIndices = (msgs) => msgs.forEach(m => { m._index = idx++; if (m.children) addIndices(m.children); });
      addIndices(data.messages);
      console.log('Wave data loaded:', {
        title: data.title,
        privacy: data.privacy,
        can_edit: data.can_edit,
        createdBy: data.createdBy,
        currentUserId: currentUser?.id
      });
      setWaveData(data);
    } catch (err) {
      showToast('Failed to load wave', 'error');
    }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    const isReply = replyingTo !== null;
    try {
      // Save scroll position if replying (so we don't jump around)
      if (isReply && messagesRef.current) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }

      await fetchAPI('/messages', {
        method: 'POST',
        body: { wave_id: wave.id, parent_id: replyingTo?.id || null, content: newMessage },
      });
      setNewMessage('');
      setReplyingTo(null);
      showToast('Message sent', 'success');
      await loadWave();

      // Only scroll to bottom if posting a root message (not a reply)
      if (!isReply) {
        setTimeout(() => {
          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        }, 100);
      }
      // If it was a reply, scroll position will be restored by the useEffect
    } catch (err) {
      showToast('Failed to send message', 'error');
      scrollPositionToRestore.current = null; // Clear on error
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
      showToast('Message cannot be empty', 'error');
      return;
    }
    try {
      await fetchAPI(`/messages/${messageId}`, {
        method: 'PUT',
        body: { content: editContent },
      });
      showToast('Message updated', 'success');
      setEditingMessageId(null);
      setEditContent('');
      await loadWave();
    } catch (err) {
      showToast(err.message || 'Failed to update message', 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      // Save scroll position before reloading
      if (messagesRef.current) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }

      await fetchAPI(`/messages/${messageId}/react`, {
        method: 'POST',
        body: { emoji },
      });
      // Reload wave data immediately to show the reaction
      await loadWave();
    } catch (err) {
      showToast(err.message || 'Failed to add reaction', 'error');
      scrollPositionToRestore.current = null; // Clear on error
    }
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    try {
      await fetchAPI(`/messages/${messageToDelete.id}`, { method: 'DELETE' });
      showToast('Message deleted', 'success');
      loadWave();
    } catch (err) {
      showToast(err.message || 'Failed to delete message', 'error');
    }
  };

  const handleMessageClick = async (messageId) => {
    try {
      console.log(`📖 Marking message ${messageId} as read...`);
      // Save current scroll position before reloading
      if (messagesRef.current) {
        scrollPositionToRestore.current = messagesRef.current.scrollTop;
      }
      await fetchAPI(`/messages/${messageId}/read`, { method: 'POST' });
      console.log(`✅ Message ${messageId} marked as read, refreshing wave`);
      // Reload wave to update unread status
      await loadWave();
      // Also refresh wave list to update unread counts
      onWaveUpdate?.();
    } catch (err) {
      console.error(`❌ Failed to mark message ${messageId} as read:`, err);
      showToast('Failed to mark message as read', 'error');
      scrollPositionToRestore.current = null; // Clear on error
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
  if (!waveData) return <div style={{ padding: '20px', color: '#6a7a6a' }}>Wave not found</div>;

  const total = waveData.all_messages.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px' : '16px 20px', background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
        borderBottom: '1px solid #2a3a2a', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          padding: '6px 10px', background: 'transparent', border: '1px solid #3a4a3a',
          color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#c5d5c5', fontSize: isMobile ? '0.9rem' : '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{waveData.title}</span>
            {waveData.group_name && <span style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>({waveData.group_name})</span>}
          </div>
          <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>
            {waveData.participants.length} participants • {total} messages
          </div>
        </div>
        <PrivacyBadge level={wave.privacy} compact={isMobile} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleArchive} style={{
            padding: isMobile ? '10px 12px' : '6px 10px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent', border: '1px solid #3a4a3a',
            color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
          }}>{waveData.is_archived ? '📬' : '📦'}</button>
          {/* Settings and Delete buttons only show for wave creator (all privacy levels) */}
          {waveData.can_edit && (
            <>
              <button onClick={() => setShowSettings(true)} style={{
                padding: isMobile ? '10px 12px' : '6px 10px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent', border: '1px solid #3bceac50',
                color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>⚙</button>
              <button onClick={handleDeleteWave} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: '#ff6b3520',
                border: '1px solid #ff6b35',
                color: '#ff6b35', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>DELETE</button>
            </>
          )}
        </div>
      </div>

      {/* Wave Toolbar - Participants & Playback */}
      {(waveData.participants?.length > 0 || total > 0) && (
        <div style={{
          padding: isMobile ? '6px 12px' : '6px 20px',
          borderBottom: '1px solid #2a3a2a',
          background: '#0a100a',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          flexShrink: 0
        }}>
          {/* Participants Toggle */}
          {waveData.participants?.length > 0 && (
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                background: showParticipants ? '#0ead6920' : 'transparent',
                border: `1px solid ${showParticipants ? '#0ead69' : '#3a4a3a'}`,
                color: showParticipants ? '#0ead69' : '#6a7a6a',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.7rem' : '0.65rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{showParticipants ? '▼' : '▶'}</span>
              PARTICIPANTS ({waveData.participants.length})
            </button>
          )}

          {/* Playback Toggle */}
          {total > 0 && (
            <button
              onClick={() => setShowPlayback(!showPlayback)}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                background: showPlayback ? `${config.color}20` : 'transparent',
                border: `1px solid ${showPlayback ? config.color : '#3a4a3a'}`,
                color: showPlayback ? config.color : '#6a7a6a',
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

          {/* Mark All Read Button - always visible if unread */}
          {waveData.messages.some(m => m.is_unread && m.author_id !== currentUser.id) && (
            <button
              onClick={async () => {
                try {
                  const unreadMessages = waveData.all_messages
                    .filter(m => (m.readBy || [m.author_id]).includes(currentUser.id) === false && m.author_id !== currentUser.id);
                  if (unreadMessages.length === 0) return;
                  await Promise.all(unreadMessages.map(m => fetchAPI(`/messages/${m.id}/read`, { method: 'POST' })));
                  await loadWave();
                  onWaveUpdate?.();
                  showToast(`Marked ${unreadMessages.length} message${unreadMessages.length !== 1 ? 's' : ''} as read`, 'success');
                } catch (err) {
                  showToast('Failed to mark messages as read', 'error');
                }
              }}
              style={{
                padding: isMobile ? '8px 12px' : '6px 10px',
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid #ffd23f',
                color: '#ffd23f',
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
      {showParticipants && waveData.participants?.length > 0 && (
        <div style={{
          padding: isMobile ? '12px' : '12px 20px',
          borderBottom: '1px solid #2a3a2a',
          background: '#0d150d',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flexShrink: 0
        }}>
          {waveData.participants.map(p => {
            const latestMessage = waveData.all_messages.length > 0 ? waveData.all_messages[waveData.all_messages.length - 1] : null;
            const hasReadLatest = latestMessage ? (latestMessage.readBy || [latestMessage.author_id]).includes(p.id) : true;
            const isCurrentUser = p.id === currentUser?.id;
            const isAlreadyContact = isContact(p.id);
            const hasSentRequest = hasSentRequestTo(p.id);
            const hasReceivedRequest = hasReceivedRequestFrom(p.id);

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  background: '#0a100a',
                  border: '1px solid #2a3a2a',
                }}
              >
                {/* Participant Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <Avatar letter={p.avatar || p.name?.[0] || '?'} color={isCurrentUser ? '#ffd23f' : '#3bceac'} size={isMobile ? 32 : 28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      color: '#c5d5c5',
                      fontSize: isMobile ? '0.85rem' : '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.name}{isCurrentUser && <span style={{ color: '#ffd23f', marginLeft: '4px' }}>(you)</span>}
                    </div>
                    <div style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>@{p.handle}</div>
                  </div>
                </div>

                {/* Read Status */}
                <div style={{
                  padding: '2px 6px',
                  background: hasReadLatest ? '#0ead6920' : '#2a3a2a',
                  border: `1px solid ${hasReadLatest ? '#0ead6950' : '#3a4a3a'}`,
                  fontSize: '0.6rem',
                  color: hasReadLatest ? '#0ead69' : '#6a7a6a',
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
                        background: '#0ead6920',
                        border: '1px solid #0ead6950',
                        fontSize: '0.6rem',
                        color: '#0ead69',
                        fontFamily: 'monospace',
                      }}>✓ CONTACT</span>
                    ) : hasSentRequest ? (
                      <span style={{
                        padding: '2px 8px',
                        background: '#ffd23f20',
                        border: '1px solid #ffd23f50',
                        fontSize: '0.6rem',
                        color: '#ffd23f',
                        fontFamily: 'monospace',
                      }}>PENDING</span>
                    ) : hasReceivedRequest ? (
                      <button
                        onClick={() => handleAcceptRequest(p)}
                        style={{
                          padding: isMobile ? '6px 10px' : '4px 8px',
                          minHeight: isMobile ? '36px' : 'auto',
                          background: '#3bceac20',
                          border: '1px solid #3bceac',
                          color: '#3bceac',
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
                          border: '1px solid #3bceac50',
                          color: '#3bceac',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.6rem',
                        }}
                      >+ ADD</button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Playback Panel */}
      {showPlayback && total > 0 && (
        <PlaybackControls isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
          currentIndex={playbackIndex} totalMessages={total} onSeek={setPlaybackIndex}
          onReset={() => { setPlaybackIndex(null); setIsPlaying(false); }}
          playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed} isMobile={isMobile} />
      )}

      {/* Messages */}
      <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '12px' : '20px' }}>
        {waveData.messages.map(msg => (
          <ThreadedMessage key={msg.id} message={msg} onReply={setReplyingTo} onDelete={handleDeleteMessage}
            onEdit={handleStartEdit} onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
            editingMessageId={editingMessageId} editContent={editContent} setEditContent={setEditContent}
            currentUserId={currentUser?.id} highlightId={replyingTo?.id} playbackIndex={playbackIndex}
            collapsed={collapsed} onToggleCollapse={(id) => setCollapsed(p => ({ ...p, [id]: !p[id] }))} isMobile={isMobile}
            onReact={handleReaction} onMessageClick={handleMessageClick} participants={waveData.participants || []} />
        ))}
      </div>

      {/* Typing Indicator */}
      {typingUsers && Object.keys(typingUsers).length > 0 && (
        <div style={{
          padding: isMobile ? '8px 12px' : '6px 20px',
          color: '#6a7a6a',
          fontSize: isMobile ? '0.85rem' : '0.75rem',
          fontStyle: 'italic',
          borderTop: '1px solid #1a2a1a',
          background: '#0a100a',
        }}>
          {Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Compose */}
      <div ref={composeRef} style={{
        flexShrink: 0,
        padding: isMobile ? '12px' : '16px 20px',
        paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : '16px',
        background: 'linear-gradient(0deg, #0d150d, #1a2a1a)',
        borderTop: '1px solid #2a3a2a'
      }}>
        {replyingTo && (
          <div style={{
            padding: isMobile ? '10px 14px' : '8px 12px',
            marginBottom: '10px', background: '#0a100a',
            border: `1px solid ${config.color}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#5a6a5a', fontSize: isMobile ? '0.85rem' : '0.7rem' }}>REPLYING TO </span>
              <span style={{ color: config.color, fontSize: isMobile ? '0.9rem' : '0.75rem' }}>{replyingTo.sender_name}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{
              background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer',
              minHeight: isMobile ? '44px' : 'auto',
              minWidth: isMobile ? '44px' : 'auto',
              padding: isMobile ? '12px' : '4px',
              fontSize: isMobile ? '1.2rem' : '1rem',
            }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}... (Shift+Enter for new line)` : 'Type a message... (Shift+Enter for new line)'}
            rows={1}
            style={{
              flex: 1,
              padding: isMobile ? '14px 16px' : '12px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              maxHeight: '200px',
              background: '#0a100a',
              border: '1px solid #2a3a2a',
              color: '#c5d5c5',
              fontSize: isMobile ? '1rem' : '0.9rem',
              fontFamily: 'inherit',
              resize: 'none',
              overflowY: 'auto',
            }}
          />
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={{
              padding: isMobile ? '8px 10px' : '10px 12px',
              minHeight: isMobile ? '44px' : 'auto',
              background: showEmojiPicker ? '#ffd23f20' : 'transparent',
              border: `1px solid ${showEmojiPicker ? '#ffd23f' : '#2a3a2a'}`,
              color: '#ffd23f',
              cursor: 'pointer',
              fontSize: isMobile ? '1.1rem' : '1.2rem',
            }}
          >
            😀
          </button>
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            style={{
              padding: isMobile ? '14px 20px' : '12px 24px',
              minHeight: isMobile ? '44px' : 'auto',
              background: newMessage.trim() ? '#ffd23f20' : 'transparent',
              border: `1px solid ${newMessage.trim() ? '#ffd23f' : '#3a4a3a'}`,
              color: newMessage.trim() ? '#ffd23f' : '#5a6a5a',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
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
              onClose={() => setShowEmojiPicker(false)}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      <WaveSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)}
       wave={waveData} groups={groups} fetchAPI={fetchAPI} showToast={showToast}
        onUpdate={() => { loadWave(); onWaveUpdate?.(); }} />

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
      background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
      border: '1px solid #3bceac40',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ color: '#3bceac', fontSize: '1rem' }}>INCOMING REQUESTS</span>
        <span style={{
          background: '#3bceac', color: '#000', fontSize: '0.65rem',
          padding: '2px 6px', borderRadius: '10px', fontWeight: 700,
        }}>{requests.length}</span>
      </div>
      {requests.map(request => (
        <div key={request.id} style={{
          padding: '12px', background: '#0a100a', border: '1px solid #2a3a2a',
          marginBottom: '8px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <Avatar letter={request.from_user_avatar || request.from_user_name?.[0] || '?'} color="#3bceac" size={isMobile ? 40 : 36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#c5d5c5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {request.from_user_name}
              </div>
              <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{request.from_user_handle}</div>
              {request.message && (
                <div style={{ color: '#7a8a7a', fontSize: '0.8rem', marginTop: '4px', fontStyle: 'italic' }}>
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
                background: '#0ead6920', border: '1px solid #0ead69',
                color: '#0ead69', cursor: processing[request.id] ? 'wait' : 'pointer',
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
                background: 'transparent', border: '1px solid #ff6b3550',
                color: '#ff6b35', cursor: processing[request.id] ? 'wait' : 'pointer',
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
      marginBottom: '24px', padding: '16px',
      background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
      border: '1px solid #ffd23f30',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, fontFamily: 'monospace',
        }}>
        <span style={{ color: '#ffd23f', fontSize: '0.85rem' }}>
          {expanded ? '▼' : '▶'} PENDING SENT REQUESTS
        </span>
        <span style={{
          background: '#ffd23f', color: '#000', fontSize: '0.65rem',
          padding: '2px 6px', borderRadius: '10px', fontWeight: 700,
        }}>{requests.length}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {requests.map(request => (
            <div key={request.id} style={{
              padding: '12px', background: '#0a100a', border: '1px solid #2a3a2a',
              marginBottom: '8px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <Avatar letter={request.to_user_avatar || request.to_user_name?.[0] || '?'} color="#ffd23f" size={isMobile ? 40 : 36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#c5d5c5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {request.to_user_name}
                  </div>
                  <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{request.to_user_handle}</div>
                </div>
              </div>
              <button
                onClick={() => handleCancel(request.id)}
                disabled={cancelling[request.id]}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 10px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent', border: '1px solid #ff6b3550',
                  color: '#ff6b35', cursor: cancelling[request.id] ? 'wait' : 'pointer',
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
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '1px solid #3bceac', padding: isMobile ? '20px' : '24px',
        width: '100%', maxWidth: '400px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <GlowText color="#3bceac" size="1rem">SEND CONTACT REQUEST</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#5a6a5a',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
          }}>×</button>
        </div>

        <div style={{
          padding: '12px', background: '#0a100a', border: '1px solid #2a3a2a',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <Avatar letter={toUser.avatar || toUser.displayName?.[0] || '?'} color="#3bceac" size={44} />
          <div>
            <div style={{ color: '#c5d5c5' }}>{toUser.displayName}</div>
            <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{toUser.handle}</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#7a8a7a', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>
            Message (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to your request..."
            maxLength={200}
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box',
              background: '#0a100a', border: '1px solid #2a3a2a',
              color: '#c5d5c5', fontFamily: 'inherit', resize: 'vertical',
              minHeight: '80px',
            }}
          />
          <div style={{ color: '#5a6a5a', fontSize: '0.65rem', textAlign: 'right', marginTop: '4px' }}>
            {message.length}/200
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: isMobile ? '12px 20px' : '10px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent', border: '1px solid #3a4a3a',
            color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleSend} disabled={sending} style={{
            padding: isMobile ? '12px 20px' : '10px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            background: '#3bceac20', border: '1px solid #3bceac',
            color: '#3bceac', cursor: sending ? 'wait' : 'pointer',
            fontFamily: 'monospace', opacity: sending ? 0.6 : 1,
          }}>{sending ? 'SENDING...' : 'SEND REQUEST'}</button>
        </div>
      </div>
    </div>
  );
};

// ============ CONTACTS VIEW ============
const ContactsView = ({
  contacts, fetchAPI, showToast, onContactsChange,
  contactRequests, sentContactRequests, onRequestsChange
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
        <GlowText color="#ffd23f" size="1.1rem">CONTACTS</GlowText>
        <button onClick={() => setShowSearch(!showSearch)} style={{
          padding: isMobile ? '10px 16px' : '8px 16px',
          minHeight: isMobile ? '44px' : 'auto',
          background: showSearch ? '#3bceac20' : '#ffd23f20',
          border: `1px solid ${showSearch ? '#3bceac' : '#ffd23f50'}`,
          color: showSearch ? '#3bceac' : '#ffd23f', cursor: 'pointer', fontFamily: 'monospace',
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
        <div style={{ marginBottom: '24px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #3bceac40' }}>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by handle or name..."
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box', marginBottom: '16px',
              background: '#0a100a', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
            }} />
          {searching && <div style={{ color: '#5a6a5a' }}>Searching...</div>}
          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div style={{ color: '#5a6a5a' }}>No users found</div>
          )}
          {searchResults.map(user => {
            const sentRequest = hasSentRequestTo(user.id);
            const receivedRequest = hasReceivedRequestFrom(user.id);
            return (
              <div key={user.id} style={{
                padding: '12px', background: '#0a100a', border: '1px solid #2a3a2a',
                marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Avatar letter={user.avatar || user.displayName[0]} color="#ffd23f" size={isMobile ? 40 : 36} status={user.status} />
                  <div>
                    <div style={{ color: '#c5d5c5' }}>{user.displayName}</div>
                    <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{user.handle}</div>
                  </div>
                </div>
                {user.isContact ? (
                  <span style={{ color: '#0ead69', fontSize: '0.75rem' }}>✓ CONTACT</span>
                ) : sentRequest ? (
                  <span style={{ color: '#ffd23f', fontSize: '0.75rem' }}>REQUEST SENT</span>
                ) : receivedRequest ? (
                  <span style={{ color: '#3bceac', fontSize: '0.75rem' }}>RESPOND ABOVE</span>
                ) : (
                  <button onClick={() => setRequestModalUser(user)} style={{
                    padding: isMobile ? '10px 14px' : '6px 12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: '#3bceac20', border: '1px solid #3bceac',
                    color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace',
                  }}>SEND REQUEST</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {contacts.length === 0 && contactRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#5a6a5a' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◎</div>
          <div>No contacts yet</div>
          <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>Use "Find People" to send contact requests</div>
        </div>
      ) : contacts.length > 0 && (
        <>
          <div style={{ color: '#7a8a7a', fontSize: '0.8rem', marginBottom: '12px', marginTop: '8px' }}>
            YOUR CONTACTS ({contacts.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '280px'}, 1fr))`, gap: '12px' }}>
            {contacts.map(contact => (
              <div key={contact.id} style={{
                padding: '16px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
                border: '1px solid #2a3a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <Avatar letter={contact.avatar || contact.name[0]} color="#ffd23f" size={44} status={contact.status} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#c5d5c5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</div>
                    <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{contact.handle}</div>
                  </div>
                </div>
                <button onClick={() => handleRemoveContact(contact.id)} style={{
                  padding: isMobile ? '10px' : '6px 10px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: 'transparent', border: '1px solid #ff6b3550',
                  color: '#ff6b35', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0,
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
const GroupsView = ({ groups, fetchAPI, showToast, onGroupsChange }) => {
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();

  useEffect(() => {
    if (selectedGroup) {
      fetchAPI(`/groups/${selectedGroup}`)
        .then(setGroupDetails)
        .catch(() => showToast('Failed to load group', 'error'));
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
      showToast('Group created', 'success');
      setNewGroupName('');
      setNewGroupDesc('');
      setShowNewGroup(false);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to create group', 'error');
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Delete this group?')) return;
    try {
      await fetchAPI(`/groups/${selectedGroup}`, { method: 'DELETE' });
      showToast('Group deleted', 'success');
      setSelectedGroup(null);
      setGroupDetails(null);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to delete group', 'error');
    }
  };

  const handleAddMember = async (userId) => {
    try {
      await fetchAPI(`/groups/${selectedGroup}/members`, { method: 'POST', body: { userId } });
      showToast('Member added', 'success');
      setMemberSearch('');
      const updated = await fetchAPI(`/groups/${selectedGroup}`);
      setGroupDetails(updated);
      onGroupsChange();
    } catch (err) {
      showToast(err.message || 'Failed to add member', 'error');
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
        borderRight: isMobile ? 'none' : '1px solid #2a3a2a', 
        borderBottom: isMobile ? '1px solid #2a3a2a' : 'none',
        display: 'flex', flexDirection: 'column',
        maxHeight: isMobile ? '250px' : 'none',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2a3a2a' }}>
          <button onClick={() => setShowNewGroup(true)} style={{
            width: '100%', padding: '10px', background: '#ffd23f15', border: '1px solid #ffd23f50',
            color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace',
          }}>+ NEW GROUP</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#5a6a5a' }}>No groups yet</div>
          ) : groups.map(g => (
            <div key={g.id} onClick={() => setSelectedGroup(g.id)} style={{ padding: '14px 16px', cursor: 'pointer',
              background: selectedGroup === g.id ? '#ffd23f10' : 'transparent',
              borderBottom: '1px solid #1a2a1a',
              borderLeft: `3px solid ${selectedGroup === g.id ? '#ffd23f' : 'transparent'}`,
            }}>
              <div style={{ color: '#c5d5c5', fontSize: '0.9rem' }}>{g.name}</div>
              <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>{g.memberCount} members • {g.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Group details */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!selectedGroup ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a4a3a' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◈</div>
              <div>Select a group or create a new one</div>
            </div>
          </div>
        ) : !groupDetails ? (
          <LoadingSpinner />
        ) : (
          <>
            <div style={{
              padding: '20px', borderBottom: '1px solid #2a3a2a',
              background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ color: '#c5d5c5', fontSize: '1.2rem', marginBottom: '4px' }}>{groupDetails.name}</div>
                  {groupDetails.description && (
                    <div style={{ color: '#6a7a6a', fontSize: '0.85rem' }}>{groupDetails.description}</div>
                  )}
                  <div style={{ color: '#5a6a5a', fontSize: '0.75rem', marginTop: '8px' }}>
                    {groupDetails.members?.length} members
                  </div>
                </div>
                {groupDetails.isAdmin && (
                  <button onClick={handleDeleteGroup} style={{
                    padding: '6px 12px', background: '#ff6b3520', border: '1px solid #ff6b35',
                    color: '#ff6b35', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                  }}>DELETE GROUP</button>
                )}
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid #2a3a2a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <GlowText color="#ffd23f" size="0.9rem">MEMBERS</GlowText>
                {groupDetails.isAdmin && (
                  <button onClick={() => setShowAddMember(!showAddMember)} style={{
                    padding: '6px 12px', background: showAddMember ? '#3bceac20' : 'transparent',
                    border: `1px solid ${showAddMember ? '#3bceac' : '#3a4a3a'}`,
                    color: showAddMember ? '#3bceac' : '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
                  }}>{showAddMember ? '✕ CLOSE' : '+ ADD MEMBER'}</button>
                )}
              </div>

              {showAddMember && (
                <div style={{ marginBottom: '16px', padding: '12px', background: '#0a100a', border: '1px solid #3bceac40' }}>
                  <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search users..."
                    style={{
                      width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: '8px',
                      background: 'transparent', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
                    }} />
                  {searchResults.map(user => (
                    <div key={user.id} style={{
                      padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#0d150d', marginBottom: '4px',
                    }}>
                      <span style={{ color: '#c5d5c5' }}>{user.displayName}</span>
                      <button onClick={() => handleAddMember(user.id)} style={{
                        padding: '4px 8px', background: '#3bceac20', border: '1px solid #3bceac',
                        color: '#3bceac', cursor: 'pointer', fontSize: '0.7rem',
                      }}>ADD</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
              {groupDetails.members?.map(member => (
                <div key={member.id} style={{
                  padding: '12px', marginTop: '8px',
                  background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
                  border: '1px solid #2a3a2a',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar letter={member.avatar || member.name[0]} color={member.role === 'admin' ? '#ffd23f' : '#6a7a6a'} size={36} status={member.status} />
                    <div>
                      <div style={{ color: '#c5d5c5' }}>{member.name}</div>
                      <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>@{member.handle} • {member.role}</div>
                    </div>
                  </div>
                  {groupDetails.isAdmin && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleToggleAdmin(member.id, member.role)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid #3a4a3a',
                        color: '#6a7a6a', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
                      }}>{member.role === 'admin' ? '↓' : '↑'}</button>
                      <button onClick={() => handleRemoveMember(member.id)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid #ff6b3550',
                        color: '#ff6b35', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
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
            width: '100%', maxWidth: '400px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
            border: '2px solid #ffd23f40', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <GlowText color="#ffd23f" size="1.1rem">Create Group</GlowText>
              <button onClick={() => setShowNewGroup(false)} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>NAME</div>
              <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                style={{
                  width: '100%', padding: '10px', boxSizing: 'border-box',
                  background: '#0a100a', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
                }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>DESCRIPTION (optional)</div>
              <textarea value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="What's this group for?"
                style={{
                  width: '100%', padding: '10px', boxSizing: 'border-box', height: '80px', resize: 'none',
                  background: '#0a100a', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
                }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowNewGroup(false)} style={{
                flex: 1, padding: '12px', background: 'transparent',
                border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace',
              }}>CANCEL</button>
              <button onClick={handleCreateGroup} disabled={!newGroupName.trim()} style={{
                flex: 1, padding: '12px',
                background: newGroupName.trim() ? '#ffd23f20' : 'transparent',
                border: `1px solid ${newGroupName.trim() ? '#ffd23f' : '#3a4a3a'}`,
                color: newGroupName.trim() ? '#ffd23f' : '#5a6a5a',
                cursor: newGroupName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
              }}>CREATE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ HANDLE REQUESTS LIST (ADMIN) ============
const HandleRequestsList = ({ fetchAPI, showToast, isMobile }) => {
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
    loadRequests();
  }, []);

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

  if (loading) return <LoadingSpinner />;

  if (requests.length === 0) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center',
        color: '#5a6a5a', fontSize: isMobile ? '0.9rem' : '0.85rem',
        background: '#0a100a', border: '1px solid #2a3a2a',
        marginTop: '16px',
      }}>
        No pending handle change requests
      </div>
    );
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {requests.map(req => (
        <div key={req.id} style={{
          padding: isMobile ? '14px' : '16px',
          background: '#0a100a',
          border: '1px solid #2a3a2a',
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
              <div style={{ color: '#c5d5c5', fontSize: isMobile ? '1rem' : '0.9rem', marginBottom: '4px' }}>
                {req.displayName}
              </div>
              <div style={{ color: '#5a6a5a', fontSize: isMobile ? '0.85rem' : '0.75rem', fontFamily: 'monospace' }}>
                @{req.currentHandle} → @{req.newHandle}
              </div>
              <div style={{ color: '#6a7a6a', fontSize: isMobile ? '0.8rem' : '0.7rem', marginTop: '4px' }}>
                Requested: {new Date(req.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => handleApprove(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: '#0ead6920',
              border: '1px solid #0ead69', color: '#0ead69',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>APPROVE</button>

            <button onClick={() => handleReject(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: '#ff6b3520',
              border: '1px solid #ff6b35', color: '#ff6b35',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>REJECT</button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ PROFILE SETTINGS ============
const ProfileSettings = ({ user, fetchAPI, showToast, onUserUpdate, onLogout }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [showHandleRequests, setShowHandleRequests] = useState(false);
  const { width, isMobile, isTablet, isDesktop } = useWindowSize();

  const handleSaveProfile = async () => {
    try {
      const updated = await fetchAPI('/profile', { method: 'PUT', body: { displayName, avatar } });
      showToast('Profile updated', 'success');
      onUserUpdate?.(updated);
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      await fetchAPI('/profile/password', { method: 'POST', body: { currentPassword, newPassword } });
      showToast('Password changed', 'success');
      setCurrentPassword('');
      setNewPassword('');
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
    background: '#0a100a', border: '1px solid #2a3a2a',
    color: '#c5d5c5', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '20px', overflowY: 'auto' }}>
      <GlowText color="#ffd23f" size="1.1rem">PROFILE SETTINGS</GlowText>

      {/* Profile Info */}
      <div style={{ marginTop: '24px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #2a3a2a' }}>
        <div style={{ color: '#6a7a6a', fontSize: '0.8rem', marginBottom: '16px' }}>PROFILE</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <Avatar letter={avatar || displayName?.[0] || '?'} color="#ffd23f" size={60} />
          <div>
            <div style={{ color: '#c5d5c5', fontSize: '1.1rem' }}>{displayName || user?.displayName}</div>
            <div style={{ color: '#5a6a5a', fontSize: '0.8rem' }}>@{user?.handle}</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>DISPLAY NAME</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>AVATAR (1-2 characters)</label>
          <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value.slice(0, 2))} maxLength={2} style={inputStyle} />
        </div>

        <button onClick={handleSaveProfile} style={{
          padding: '10px 20px', background: '#ffd23f20', border: '1px solid #ffd23f',
          color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace',
        }}>SAVE PROFILE</button>
      </div>

      {/* Handle Change */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #2a3a2a' }}>
        <div style={{ color: '#6a7a6a', fontSize: '0.8rem', marginBottom: '16px' }}>HANDLE CHANGE</div>
        <div style={{ color: '#5a6a5a', fontSize: '0.75rem', marginBottom: '12px' }}>
          Handle changes require admin approval. You can change your handle once every 30 days.
        </div>
        <div style={{ marginBottom: '16px' }}>
          <input type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value)}
            placeholder="New handle..." style={inputStyle} />
        </div>
        <button onClick={handleRequestHandleChange} disabled={!newHandle} style={{
          padding: '10px 20px',
          background: newHandle ? '#3bceac20' : 'transparent',
          border: `1px solid ${newHandle ? '#3bceac' : '#3a4a3a'}`,
          color: newHandle ? '#3bceac' : '#5a6a5a',
          cursor: newHandle ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
        }}>REQUEST CHANGE</button>
      </div>

      {/* Password Change */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #2a3a2a' }}>
        <div style={{ color: '#6a7a6a', fontSize: '0.8rem', marginBottom: '12px' }}>CHANGE PASSWORD</div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>CURRENT PASSWORD</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>NEW PASSWORD</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 chars, upper, lower, number" style={inputStyle} />
        </div>
        <button onClick={handleChangePassword} disabled={!currentPassword || !newPassword} style={{
          padding: '10px 20px',
          background: currentPassword && newPassword ? '#ff6b3520' : 'transparent',
          border: `1px solid ${currentPassword && newPassword ? '#ff6b35' : '#3a4a3a'}`,
          color: currentPassword && newPassword ? '#ff6b35' : '#5a6a5a',
          cursor: currentPassword && newPassword ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
        }}>CHANGE PASSWORD</button>
      </div>

      {/* Display Preferences */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #2a3a2a' }}>
        <div style={{ color: '#6a7a6a', fontSize: '0.8rem', marginBottom: '12px' }}>DISPLAY PREFERENCES</div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>THEME</label>
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
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>FONT SIZE</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(FONT_SIZES).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleUpdatePreferences({ fontSize: key })}
                style={{
                  padding: isMobile ? '10px 16px' : '8px 16px',
                  minHeight: isMobile ? '44px' : 'auto',
                  background: (user?.preferences?.fontSize || 'medium') === key ? '#ffd23f20' : 'transparent',
                  border: `1px solid ${(user?.preferences?.fontSize || 'medium') === key ? '#ffd23f' : '#2a3a2a'}`,
                  color: (user?.preferences?.fontSize || 'medium') === key ? '#ffd23f' : '#6a7a6a',
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
          <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>CRT SCAN LINES</label>
          <button
            onClick={() => handleUpdatePreferences({ scanLines: !(user?.preferences?.scanLines !== false) })}
            style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: (user?.preferences?.scanLines !== false) ? '#ffd23f20' : 'transparent',
              border: `1px solid ${(user?.preferences?.scanLines !== false) ? '#ffd23f' : '#2a3a2a'}`,
              color: (user?.preferences?.scanLines !== false) ? '#ffd23f' : '#6a7a6a',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.85rem',
            }}
          >
            {(user?.preferences?.scanLines !== false) ? '▣ ENABLED' : '▢ DISABLED'}
          </button>
          <div style={{ color: '#5a6a5a', fontSize: '0.65rem', marginTop: '6px' }}>
            Disable for improved readability
          </div>
        </div>

        <div style={{ color: '#5a6a5a', fontSize: '0.7rem', padding: '10px', background: '#0a100a', border: '1px solid #2a3a2a' }}>
          ℹ️ Theme customization will change colors throughout the app (coming soon). Other changes take effect immediately.
        </div>
      </div>

      {/* Admin Panel */}
      {user?.isAdmin && (
        <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #1a2a1a, #0d150d)', border: '2px solid #ffd23f40' }}>
          <GlowText color="#ffd23f" size={isMobile ? '1rem' : '0.9rem'}>ADMIN PANEL</GlowText>

          <div style={{ marginTop: '16px' }}>
            <button
              onClick={() => setShowHandleRequests(!showHandleRequests)}
              style={{
                padding: isMobile ? '12px 20px' : '10px 20px',
                minHeight: isMobile ? '44px' : 'auto',
                background: showHandleRequests ? '#ffd23f20' : 'transparent',
                border: `1px solid ${showHandleRequests ? '#ffd23f' : '#3a4a3a'}`,
                color: showHandleRequests ? '#ffd23f' : '#6a7a6a',
                cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.9rem' : '0.85rem',
              }}
            >
              {showHandleRequests ? 'HIDE' : 'SHOW'} HANDLE REQUESTS
            </button>
          </div>

          {showHandleRequests && <HandleRequestsList fetchAPI={fetchAPI} showToast={showToast} isMobile={isMobile} />}
        </div>
      )}

      {/* Logout Section */}
      <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #2a3a2a' }}>
        <div style={{ color: '#6a7a6a', fontSize: '0.8rem', marginBottom: '16px' }}>SESSION</div>
        <button
          onClick={onLogout}
          style={{
            padding: isMobile ? '14px 24px' : '12px 24px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid #ff6b35',
            color: '#ff6b35',
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
    </div>
  );
};

// ============ NEW WAVE MODAL ============
const NewWaveModal = ({ isOpen, onClose, onCreate, contacts, groups }) => {
  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!title.trim()) return;
    if (privacy === 'group' && !selectedGroup) return;
    onCreate({ title, privacy, participants: selectedParticipants, groupId: privacy === 'group' ? selectedGroup : null });
    setTitle(''); setPrivacy('private'); setSelectedParticipants([]); setSelectedGroup(null);
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
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #ffd23f40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="#ffd23f" size="1.1rem">New Wave</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Wave title..."
            style={{
              width: '100%', padding: '10px', boxSizing: 'border-box',
              background: '#0a100a', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
            }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>PRIVACY LEVEL</div>
          {Object.entries(PRIVACY_LEVELS).map(([key, config]) => (
            <button key={key} onClick={() => { setPrivacy(key); if (key !== 'group') setSelectedGroup(null); }}
              style={{
                width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left',
                background: privacy === key ? config.bgColor : '#0a100a',
                border: `1px solid ${privacy === key ? config.color : '#2a3a2a'}`, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: config.color, fontSize: '1.1rem' }}>{config.icon}</span>
                <div>
                  <div style={{ color: config.color }}>{config.name}</div>
                  <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>{config.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {privacy === 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>SELECT GROUP</div>
            {groups.length === 0 ? (
              <div style={{ color: '#5a6a5a', padding: '10px', background: '#0a100a' }}>No groups. Create one first.</div>
            ) : groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
                width: '100%', padding: '10px', marginBottom: '4px', textAlign: 'left',
                background: selectedGroup === g.id ? '#ffd23f15' : '#0a100a',
                border: `1px solid ${selectedGroup === g.id ? '#ffd23f' : '#2a3a2a'}`, cursor: 'pointer',
              }}>
                <div style={{ color: '#c5d5c5' }}>{g.name}</div>
                <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>{g.memberCount} members</div>
              </button>
            ))}
          </div>
        )}

        {privacy !== 'group' && privacy !== 'public' && contacts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>ADD PARTICIPANTS</div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {contacts.map(c => (
                <button key={c.id} onClick={() => setSelectedParticipants(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}
                  style={{
                    width: '100%', padding: '8px', marginBottom: '4px',
                    background: selectedParticipants.includes(c.id) ? '#ffd23f15' : 'transparent',
                    border: `1px solid ${selectedParticipants.includes(c.id) ? '#ffd23f' : '#2a3a2a'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                  <Avatar letter={c.avatar} color="#ffd23f" size={24} />
                  <span style={{ color: '#c5d5c5', fontSize: '0.85rem' }}>{c.name}</span>
                  {selectedParticipants.includes(c.id) && <span style={{ marginLeft: 'auto', color: '#0ead69' }}>✔</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleCreate} disabled={!canCreate} style={{
            flex: 1, padding: '12px',
            background: canCreate ? '#ffd23f20' : 'transparent',
            border: `1px solid ${canCreate ? '#ffd23f' : '#5a6a5a'}`,
            color: canCreate ? '#ffd23f' : '#5a6a5a',
            cursor: canCreate ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
          }}>CREATE</button>
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
        background: apiConnected ? '#0ead69' : '#ff6b35',
        boxShadow: apiConnected ? '0 0 6px #0ead69' : 'none',
      }} />
      <span style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>API</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: wsConnected ? '#0ead69' : '#ff6b35',
        boxShadow: wsConnected ? '0 0 6px #0ead69' : 'none',
      }} />
      <span style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>LIVE</span>
    </div>
  </div>
);

// ============ MAIN APP ============
function MainApp() {
  const { user, token, logout, updateUser } = useAuth();
  const { fetchAPI } = useAPI();
  const [toast, setToast] = useState(null);
  const [activeView, setActiveView] = useState('waves');
  const [apiConnected, setApiConnected] = useState(false);
  const [waves, setWaves] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedWave, setSelectedWave] = useState(null);
  const [showNewWave, setShowNewWave] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [waveReloadTrigger, setWaveReloadTrigger] = useState(0); // Increment to trigger WaveView reload
  const [typingUsers, setTypingUsers] = useState({}); // { waveId: { userId: { name, timestamp } } }
  const [contactRequests, setContactRequests] = useState([]); // Received contact requests
  const [sentContactRequests, setSentContactRequests] = useState([]); // Sent contact requests
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

  const showToastMsg = useCallback((message, type) => setToast({ message, type }), []);

  const loadWaves = useCallback(async () => {
    try {
      const data = await fetchAPI(`/waves?archived=${showArchived}`);
      setWaves(data);
      setApiConnected(true);
    } catch (err) {
      console.error('loadWaves failed:', err);
      setApiConnected(false);
    }
  }, [fetchAPI, showArchived]);

  const handleWSMessage = useCallback((data) => {
    if (data.type === 'new_message' || data.type === 'message_edited' || data.type === 'message_deleted' || data.type === 'wave_created' || data.type === 'wave_updated' || data.type === 'message_reaction') {
      loadWaves();
      // If the event is for the currently viewed wave, trigger a reload
      // Extract waveId from different event structures
      const eventWaveId = data.waveId || data.data?.wave_id || data.data?.waveId;
      if (selectedWave && eventWaveId === selectedWave.id) {
        console.log(`🔄 Reloading wave ${selectedWave.id} due to ${data.type} event`);
        setWaveReloadTrigger(prev => prev + 1);
      }

      // Desktop notifications for new messages
      if (data.type === 'new_message' && data.data) {
        const isViewingDifferentWave = !selectedWave || eventWaveId !== selectedWave.id;
        const isBackgrounded = document.visibilityState === 'hidden';
        const isOwnMessage = data.data.author_id === user?.id;

        // Show notification if viewing different wave or tab is in background
        if ((isViewingDifferentWave || isBackgrounded) && !isOwnMessage) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const waveName = waves.find(w => w.id === eventWaveId)?.name || 'Unknown Wave';
            const notification = new Notification(`New message in ${waveName}`, {
              body: `${data.data.sender_name}: ${data.data.content.substring(0, 100)}${data.data.content.length > 100 ? '...' : ''}`,
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
      showToastMsg(`${data.request.from_user_name || 'Someone'} sent you a contact request`, 'info');
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

  useEffect(() => {
    loadWaves();
    loadContacts();
    loadGroups();
    loadContactRequests();
  }, [loadWaves, loadContacts, loadGroups, loadContactRequests]);

  // Request notification permission on first load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      // Request permission after a brief delay to avoid interrupting initial page load
      const timer = setTimeout(() => {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            console.log('✅ Desktop notifications enabled');
          } else {
            console.log('❌ Desktop notifications denied');
          }
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleCreateWave = async (data) => {
    try {
      await fetchAPI('/waves', { method: 'POST', body: data });
      showToastMsg('Wave created', 'success');
      loadWaves();
    } catch (err) {
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

  const scanLinesEnabled = user?.preferences?.scanLines !== false; // Default to true

  return (
    <div style={{
      height: '100vh', background: 'linear-gradient(180deg, #0d150d, #050805)',
      fontFamily: "'Courier New', monospace", color: '#c5d5c5',
      display: 'flex', flexDirection: 'column',
    }}>
      <ScanLines enabled={scanLinesEnabled} />
      <style>{`
        .message-media {
          max-width: 100%;
          max-height: 400px;
          height: auto;
          border: 1px solid #2a3a2a;
          border-radius: 2px;
          margin: 8px 0;
          display: block;
        }
        /* Font scaling: base font size is set on root div and scales all content */
        /* Elements with explicit fontSize will maintain their relative proportions */
      `}</style>

      {/* Header */}
      <header style={{
        padding: isMobile ? '8px 10px' : '12px 24px',
        paddingTop: isMobile ? 'calc(8px + env(safe-area-inset-top, 0px))' : '12px',
        borderBottom: '2px solid #ffd23f40',
        background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
        display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {isMobile ? (
            <img
              src="/icons/icon-72x72.png"
              alt="Cortex"
              style={{ width: '32px', height: '32px', borderRadius: '4px' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <GlowText color="#ffd23f" size="1.5rem" weight={700}>CORTEX</GlowText>
              <span style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>v1.7.0</span>
            </div>
          )}
        </div>

        {/* Connection Status - desktop only */}
        {!isMobile && <ConnectionStatus wsConnected={wsConnected} apiConnected={apiConnected} />}

        {/* Nav Items - grows to fill space */}
        <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
          {navItems.map(view => {
            const totalUnread = view === 'waves' ? waves.reduce((sum, w) => sum + (w.unread_count || 0), 0) : 0;
            const pendingRequests = view === 'contacts' ? contactRequests.length : 0;
            const badgeCount = totalUnread || pendingRequests;
            return (
              <button key={view} onClick={() => { setActiveView(view); setSelectedWave(null); }} style={{
                padding: isMobile ? '10px 12px' : '8px 16px',
                minHeight: isMobile ? '44px' : 'auto',
                background: activeView === view ? '#ffd23f15' : 'transparent',
                border: `1px solid ${activeView === view ? '#ffd23f50' : '#3a4a3a'}`,
                color: activeView === view ? '#ffd23f' : '#6a7a6a',
                cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.75rem' : '0.8rem', textTransform: 'uppercase',
                position: 'relative',
              }}>
                {view === 'profile' ? '⚙' : view.slice(0, isMobile ? 3 : 10)}
                {badgeCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: pendingRequests > 0 ? '#3bceac' : '#ff6b35',
                    color: '#fff',
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    padding: '2px 4px',
                    borderRadius: '10px',
                    minWidth: '16px',
                    textAlign: 'center',
                    boxShadow: pendingRequests > 0 ? '0 0 8px rgba(59, 206, 172, 0.8)' : '0 0 8px rgba(255, 107, 53, 0.8)',
                  }}>{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => setShowSearch(true)}
            style={{
              padding: isMobile ? '10px' : '8px 12px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'transparent',
              border: '1px solid #3bceac',
              color: '#3bceac',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.9rem' : '0.8rem',
            }}
            title="Search messages"
          >
            🔍
          </button>
          {!isMobile && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#ffd23f', fontSize: '0.8rem' }}>{user?.displayName}</div>
              <div style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>@{user?.handle}</div>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile && selectedWave ? 'column' : 'row' }}>
        {activeView === 'waves' && (
          <>
            {(!isMobile || !selectedWave) && (
              <WaveList waves={waves} selectedWave={selectedWave}
                onSelectWave={setSelectedWave} onNewWave={() => setShowNewWave(true)}
                showArchived={showArchived} onToggleArchived={() => { setShowArchived(!showArchived); loadWaves(); }}
                isMobile={isMobile} />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              {selectedWave ? (
                <WaveView wave={selectedWave} onBack={() => setSelectedWave(null)}
                  fetchAPI={fetchAPI} showToast={showToastMsg} currentUser={user}
                  groups={groups} onWaveUpdate={loadWaves} isMobile={isMobile}
                  sendWSMessage={sendWSMessage}
                  typingUsers={typingUsers[selectedWave?.id] || {}}
                  reloadTrigger={waveReloadTrigger}
                  contacts={contacts}
                  contactRequests={contactRequests}
                  sentContactRequests={sentContactRequests}
                  onRequestsChange={loadContactRequests}
                  onContactsChange={loadContacts} />
              ) : !isMobile && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a4a3a' }}>
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
          <GroupsView groups={groups} fetchAPI={fetchAPI} showToast={showToastMsg} onGroupsChange={loadGroups} />
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
          />
        )}

        {activeView === 'profile' && (
          <ProfileSettings user={user} fetchAPI={fetchAPI} showToast={showToastMsg} onUserUpdate={updateUser} onLogout={logout} />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '8px 12px', background: '#050805', borderTop: '1px solid #2a3a2a',
        display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'monospace', flexWrap: 'wrap', gap: '4px',
      }}>
        <div style={{ color: '#5a6a5a' }}><span style={{ color: '#0ead69' }}>●</span> ENCRYPTED</div>
        <div style={{ color: '#5a6a5a' }}>WAVES: {waves.length} • GROUPS: {groups.length} • CONTACTS: {contacts.length}</div>
      </footer>

      <NewWaveModal isOpen={showNewWave} onClose={() => setShowNewWave(false)}
        onCreate={handleCreateWave} contacts={contacts} groups={groups} />

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          fetchAPI={fetchAPI}
          showToast={showToastMsg}
          onSelectMessage={handleSearchResultClick}
          isMobile={isMobile}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* PWA Components */}
      <OfflineIndicator />
      <InstallPrompt isMobile={isMobile} />
    </div>
  );
}

// ============ AUTH PROVIDER ============
function AuthProvider({ children }) {
  const [user, setUser] = useState(storage.getUser());
  const [token, setToken] = useState(storage.getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(userData => {
          setUser(userData);
          storage.setUser(userData); // Save to localStorage
        })
        .catch(() => { storage.removeToken(); storage.removeUser(); setToken(null); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (handle, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    storage.setToken(data.token); storage.setUser(data.user);
    setToken(data.token); setUser(data.user);
  };

  const register = async (handle, email, password, displayName) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    storage.setToken(data.token); storage.setUser(data.user);
    setToken(data.token); setUser(data.user);
  };

  const logout = () => {
    storage.removeToken(); storage.removeUser();
    setToken(null); setUser(null);
  };

  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    storage.setUser(updatedUser);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============ APP ============
export default function CortexApp() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user } = useAuth();
  return user ? <MainApp /> : <LoginScreen />;
}
