import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';

// ============ CONFIGURATION ============
const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

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

// ============ STORAGE ============
const storage = {
  getToken: () => localStorage.getItem('cortex_token'),
  setToken: (token) => localStorage.setItem('cortex_token', token),
  removeToken: () => localStorage.removeItem('cortex_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('cortex_user')); } catch { return null; } },
  setUser: (user) => localStorage.setItem('cortex_user', JSON.stringify(user)),
  removeUser: () => localStorage.removeItem('cortex_user'),
};

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

  useEffect(() => {
    if (!token) return;
    
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'auth_success') setConnected(true);
        else if (data.type === 'auth_error') setConnected(false);
        else onMessage?.(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };
    
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [token, onMessage]);

  return { connected };
}

// ============ UI COMPONENTS ============
const ScanLines = () => (
  <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000, 
    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
);

const GlowText = ({ children, color = '#ffd23f', size = '1rem', weight = 400 }) => (
  <span style={{ color, fontSize: size, fontWeight: weight, textShadow: `0 0 10px ${color}80, 0 0 20px ${color}40` }}>
    {children}
  </span>
);

const Avatar = ({ letter, color = '#ffd23f', size = 40, status }) => (
  <div style={{ position: 'relative' }}>
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
    }}>
      <span style={{ color: config.color }}>{config.icon}</span>
      <span style={{ color: config.color }}>{config.name}</span>
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
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) await register(username, email, password, displayName);
      else await login(username, password);
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
      fontFamily: "'Courier New', monospace",
    }}>
      <ScanLines />
      <div style={{
        width: '400px', padding: '40px',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #ffd23f40',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <GlowText color="#ffd23f" size="2.5rem" weight={700}>CORTEX</GlowText>
          <div style={{ color: '#5a6a5a', fontSize: '0.8rem', marginTop: '8px' }}>SECURE COMMUNICATIONS</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>
              {isRegistering ? 'USERNAME' : 'USERNAME / EMAIL'}
            </label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder={isRegistering ? 'Choose username' : 'Enter username or email'} style={inputStyle} />
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

// ============ THREAD LIST ============
const ThreadList = ({ threads, selectedThread, onSelectThread, onNewThread }) => (
  <div style={{ width: '300px', borderRight: '1px solid #2a3a2a', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ padding: '16px', borderBottom: '1px solid #2a3a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlowText color="#ffd23f" size="0.9rem">THREADS</GlowText>
      <button onClick={onNewThread} style={{
        padding: '6px 12px', background: '#ffd23f20', border: '1px solid #ffd23f50',
        color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem',
      }}>+ NEW</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {threads.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#5a6a5a', fontSize: '0.85rem' }}>
          No threads yet. Create one!
        </div>
      ) : threads.map(thread => {
        const config = PRIVACY_LEVELS[thread.privacy] || PRIVACY_LEVELS.private;
        const isSelected = selectedThread?.id === thread.id;
        return (
          <div key={thread.id} onClick={() => onSelectThread(thread)} style={{
            padding: '14px 16px', cursor: 'pointer',
            background: isSelected ? '#ffd23f10' : 'transparent',
            borderBottom: '1px solid #1a2a1a',
            borderLeft: `3px solid ${isSelected ? config.color : 'transparent'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ color: '#c5d5c5', fontSize: '0.9rem', fontWeight: 500 }}>{thread.title}</div>
              <span style={{ color: config.color }}>{config.icon}</span>
            </div>
            <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>
              {thread.creator_name} • {thread.message_count} msgs
              {thread.group_name && <span> • {thread.group_name}</span>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ============ THREADED MESSAGE ============
const ThreadedMessage = ({ message, depth = 0, onReply, highlightId, playbackIndex, collapsed, onToggleCollapse }) => {
  const config = PRIVACY_LEVELS[message.privacy] || PRIVACY_LEVELS.private;
  const isHighlighted = highlightId === message.id;
  const isVisible = playbackIndex === null || message._index <= playbackIndex;
  const hasChildren = message.children?.length > 0;
  const isCollapsed = collapsed[message.id];
  const indent = Math.min(depth, 6) * 24;

  if (!isVisible) return null;

  return (
    <div style={{ marginLeft: `${indent}px` }}>
      <div style={{
        padding: '12px 16px', marginBottom: '8px',
        background: isHighlighted ? `${config.color}20` : 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: `1px solid ${isHighlighted ? config.color : '#2a3a2a'}`,
        borderLeft: `3px solid ${config.color}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Avatar letter={message.sender_avatar || '?'} color={config.color} size={32} />
            <div>
              <div style={{ color: '#c5d5c5', fontSize: '0.85rem' }}>{message.sender_name}</div>
              <div style={{ color: '#5a6a5a', fontSize: '0.65rem', fontFamily: 'monospace' }}>
                {message.sender_handle} • {new Date(message.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <PrivacyBadge level={message.privacy} compact />
        </div>
        <div style={{ color: '#9bab9b', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '10px' }}>{message.content}</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => onReply(message)} style={{
            padding: '4px 10px', background: 'transparent', border: '1px solid #3a4a3a',
            color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
          }}>↵ REPLY</button>
          {hasChildren && (
            <button onClick={() => onToggleCollapse(message.id)} style={{
              padding: '4px 10px', background: 'transparent', border: '1px solid #3a4a3a',
              color: '#ffd23f', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
            }}>{isCollapsed ? `▶ ${message.children.length} replies` : '▼ collapse'}</button>
          )}
        </div>
      </div>
      {hasChildren && !isCollapsed && (
        <div style={{ borderLeft: '1px solid #3a4a3a', marginLeft: '12px' }}>
          {message.children.map(child => (
            <ThreadedMessage key={child.id} message={child} depth={depth + 1} onReply={onReply}
              highlightId={highlightId} playbackIndex={playbackIndex} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
          ))}
        </div>
      )}
    </div>
  );
};

// ============ PLAYBACK CONTROLS ============
const PlaybackControls = ({ isPlaying, onTogglePlay, currentIndex, totalMessages, onSeek, onReset, playbackSpeed, onSpeedChange }) => (
  <div style={{
    padding: '12px 16px', background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
    borderBottom: '1px solid #2a3a2a', display: 'flex', alignItems: 'center', gap: '16px',
  }}>
    <GlowText color="#3bceac" size="0.8rem">PLAYBACK</GlowText>
    <div style={{ display: 'flex', gap: '8px' }}>
      <button onClick={onReset} style={{ padding: '6px 10px', background: 'transparent', border: '1px solid #3a4a3a', color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace' }}>⟲</button>
      <button onClick={onTogglePlay} style={{
        padding: '6px 16px', background: isPlaying ? '#ff6b3520' : '#0ead6920',
        border: `1px solid ${isPlaying ? '#ff6b35' : '#0ead69'}`,
        color: isPlaying ? '#ff6b35' : '#0ead69', cursor: 'pointer', fontFamily: 'monospace',
      }}>{isPlaying ? '⏸ PAUSE' : '▶ PLAY'}</button>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
      <input type="range" min={0} max={totalMessages - 1} value={currentIndex ?? totalMessages - 1}
        onChange={(e) => onSeek(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#3bceac' }} />
      <span style={{ color: '#6a7a6a', fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {(currentIndex ?? totalMessages - 1) + 1} / {totalMessages}
      </span>
    </div>
    <div style={{ display: 'flex', gap: '4px' }}>
      {[0.5, 1, 2, 4].map(speed => (
        <button key={speed} onClick={() => onSpeedChange(speed)} style={{
          padding: '4px 8px', background: playbackSpeed === speed ? '#3bceac20' : 'transparent',
          border: `1px solid ${playbackSpeed === speed ? '#3bceac' : '#3a4a3a'}`,
          color: playbackSpeed === speed ? '#3bceac' : '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
        }}>{speed}x</button>
      ))}
    </div>
  </div>
);

// ============ THREAD SETTINGS MODAL ============
const ThreadSettingsModal = ({ isOpen, onClose, thread, groups, fetchAPI, showToast, onUpdate }) => {
  const [privacy, setPrivacy] = useState(thread?.privacy || 'private');
  const [selectedGroup, setSelectedGroup] = useState(thread?.groupId || null);
  const [title, setTitle] = useState(thread?.title || '');

  useEffect(() => {
    if (thread) {
      setPrivacy(thread.privacy);
      setSelectedGroup(thread.groupId);
      setTitle(thread.title);
    }
  }, [thread]);

  if (!isOpen || !thread) return null;

  const handleSave = async () => {
    try {
      await fetchAPI(`/threads/${thread.id}`, {
        method: 'PUT',
        body: { title, privacy, groupId: privacy === 'group' ? selectedGroup : null },
      });
      showToast('Thread updated', 'success');
      onUpdate();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update thread', 'error');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #3bceac40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="#3bceac" size="1.1rem">Thread Settings</GlowText>
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

// ============ THREAD VIEW ============
const ThreadView = ({ thread, onBack, fetchAPI, showToast, currentUser, groups, onThreadUpdate }) => {
  const [threadData, setThreadData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const playbackRef = useRef(null);

  useEffect(() => {
    loadThread();
  }, [thread.id]);

  useEffect(() => {
    if (isPlaying && threadData) {
      const total = threadData.all_messages.length;
      playbackRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          const next = (prev ?? -1) + 1;
          if (next >= total) { setIsPlaying(false); return total - 1; }
          return next;
        });
      }, 1500 / playbackSpeed);
    }
    return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
  }, [isPlaying, playbackSpeed, threadData]);

  const loadThread = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI(`/threads/${thread.id}`);
      let idx = 0;
      const addIndices = (msgs) => msgs.forEach(m => { m._index = idx++; if (m.children) addIndices(m.children); });
      addIndices(data.messages);
      setThreadData(data);
    } catch (err) {
      showToast('Failed to load thread', 'error');
    }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      await fetchAPI('/messages', {
        method: 'POST',
        body: { thread_id: thread.id, parent_id: replyingTo?.id || null, content: newMessage },
      });
      setNewMessage('');
      setReplyingTo(null);
      showToast('Message sent', 'success');
      loadThread();
    } catch (err) {
      showToast('Failed to send message', 'error');
    }
  };

  const config = PRIVACY_LEVELS[thread.privacy] || PRIVACY_LEVELS.private;
  if (loading) return <LoadingSpinner />;
  if (!threadData) return <div style={{ padding: '20px', color: '#6a7a6a' }}>Thread not found</div>;

  const total = threadData.all_messages.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
        borderBottom: '1px solid #2a3a2a', display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <button onClick={onBack} style={{
          padding: '6px 12px', background: 'transparent', border: '1px solid #3a4a3a',
          color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace',
        }}>← BACK</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#c5d5c5', fontSize: '1.1rem' }}>{threadData.title}</span>
            {threadData.group_name && <span style={{ color: '#5a6a5a', fontSize: '0.8rem' }}>({threadData.group_name})</span>}
          </div>
          <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>
            {threadData.participants.length} participants • {total} messages
          </div>
        </div>
        <PrivacyBadge level={thread.privacy} />
        {threadData.can_edit && (
          <button onClick={() => setShowSettings(true)} style={{
            padding: '6px 12px', background: 'transparent', border: '1px solid #3bceac50',
            color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem',
          }}>⚙ SETTINGS</button>
        )}
      </div>

      {/* Playback */}
      {total > 0 && (
        <PlaybackControls isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
          currentIndex={playbackIndex} totalMessages={total} onSeek={setPlaybackIndex}
          onReset={() => { setPlaybackIndex(null); setIsPlaying(false); }}
          playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {threadData.messages.map(msg => (
          <ThreadedMessage key={msg.id} message={msg} onReply={setReplyingTo}
            highlightId={replyingTo?.id} playbackIndex={playbackIndex}
            collapsed={collapsed} onToggleCollapse={(id) => setCollapsed(p => ({ ...p, [id]: !p[id] }))} />
        ))}
      </div>

      {/* Compose */}
      <div style={{ padding: '16px 20px', background: 'linear-gradient(0deg, #0d150d, #1a2a1a)', borderTop: '1px solid #2a3a2a' }}>
        {replyingTo && (
          <div style={{
            padding: '8px 12px', marginBottom: '10px', background: '#0a100a',
            border: `1px solid ${config.color}40`, display: 'flex', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>REPLYING TO </span>
              <span style={{ color: config.color, fontSize: '0.75rem' }}>{replyingTo.sender_name}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px' }}>
          <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}...` : 'Type a message...'}
            style={{
              flex: 1, padding: '12px 16px', background: '#0a100a', border: '1px solid #2a3a2a',
              color: '#c5d5c5', fontSize: '0.9rem', fontFamily: 'inherit',
            }} />
          <button onClick={handleSendMessage} disabled={!newMessage.trim()} style={{
            padding: '12px 24px',
            background: newMessage.trim() ? '#ffd23f20' : 'transparent',
            border: `1px solid ${newMessage.trim() ? '#ffd23f' : '#3a4a3a'}`,
            color: newMessage.trim() ? '#ffd23f' : '#5a6a5a',
            cursor: newMessage.trim() ? 'pointer' : 'not-allowed', fontFamily: 'monospace',
          }}>SEND</button>
        </div>
      </div>

      <ThreadSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)}
        thread={threadData} groups={groups} fetchAPI={fetchAPI} showToast={showToast}
        onUpdate={() => { loadThread(); onThreadUpdate?.(); }} />
    </div>
  );
};

// ============ CONTACTS VIEW ============
const ContactsView = ({ contacts, fetchAPI, showToast, onContactsChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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

  const handleAddContact = async (username) => {
    try {
      await fetchAPI('/contacts', { method: 'POST', body: { username } });
      showToast('Contact added', 'success');
      onContactsChange();
      setSearchResults(prev => prev.map(r => r.username === username ? { ...r, isContact: true } : r));
    } catch (err) {
      showToast(err.message || 'Failed to add contact', 'error');
    }
  };

  const handleRemoveContact = async (id) => {
    try {
      await fetchAPI(`/contacts/${id}`, { method: 'DELETE' });
      showToast('Contact removed', 'success');
      onContactsChange();
    } catch (err) {
      showToast(err.message || 'Failed to remove contact', 'error');
    }
  };

  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <GlowText color="#ffd23f" size="1.1rem">CONTACTS</GlowText>
        <button onClick={() => setShowSearch(!showSearch)} style={{
          padding: '8px 16px', background: showSearch ? '#3bceac20' : '#ffd23f20',
          border: `1px solid ${showSearch ? '#3bceac' : '#ffd23f50'}`,
          color: showSearch ? '#3bceac' : '#ffd23f', cursor: 'pointer', fontFamily: 'monospace',
        }}>{showSearch ? '✕ CLOSE' : '+ ADD CONTACT'}</button>
      </div>

      {showSearch && (
        <div style={{ marginBottom: '24px', padding: '20px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)', border: '1px solid #3bceac40' }}>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name..."
            style={{
              width: '100%', padding: '12px', boxSizing: 'border-box', marginBottom: '16px',
              background: '#0a100a', border: '1px solid #2a3a2a', color: '#c5d5c5', fontFamily: 'inherit',
            }} />
          {searching && <div style={{ color: '#5a6a5a' }}>Searching...</div>}
          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div style={{ color: '#5a6a5a' }}>No users found</div>
          )}
          {searchResults.map(user => (
            <div key={user.id} style={{
              padding: '12px', background: '#0a100a', border: '1px solid #2a3a2a',
              marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar letter={user.avatar || user.displayName[0]} color="#ffd23f" size={36} status={user.status} />
                <div>
                  <div style={{ color: '#c5d5c5' }}>{user.displayName}</div>
                  <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{user.username}</div>
                </div>
              </div>
              {user.isContact ? (
                <span style={{ color: '#0ead69', fontSize: '0.75rem' }}>✓ CONTACT</span>
              ) : (
                <button onClick={() => handleAddContact(user.username)} style={{
                  padding: '6px 12px', background: '#3bceac20', border: '1px solid #3bceac',
                  color: '#3bceac', cursor: 'pointer', fontFamily: 'monospace',
                }}>+ ADD</button>
              )}
            </div>
          ))}
        </div>
      )}

      {contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#5a6a5a' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◎</div>
          <div>No contacts yet</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {contacts.map(contact => (
            <div key={contact.id} style={{
              padding: '16px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
              border: '1px solid #2a3a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar letter={contact.avatar || contact.name[0]} color="#ffd23f" size={44} status={contact.status} />
                <div>
                  <div style={{ color: '#c5d5c5' }}>{contact.name}</div>
                  <div style={{ color: '#5a6a5a', fontSize: '0.75rem' }}>@{contact.username}</div>
                </div>
              </div>
              <button onClick={() => handleRemoveContact(contact.id)} style={{
                padding: '6px 10px', background: 'transparent', border: '1px solid #ff6b3550',
                color: '#ff6b35', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
              }}>✕</button>
            </div>
          ))}
        </div>
      )}
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
    <div style={{ flex: 1, display: 'flex', height: '100%' }}>
      {/* Group list */}
      <div style={{ width: '300px', borderRight: '1px solid #2a3a2a', display: 'flex', flexDirection: 'column' }}>
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
            <div key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
              padding: '14px 16px', cursor: 'pointer',
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
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
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar letter={member.avatar || member.name[0]} color={member.role === 'admin' ? '#ffd23f' : '#6a7a6a'} size={36} status={member.status} />
                    <div>
                      <div style={{ color: '#c5d5c5' }}>{member.name}</div>
                      <div style={{ color: '#5a6a5a', fontSize: '0.7rem' }}>@{member.username} • {member.role}</div>
                    </div>
                  </div>
                  {groupDetails.isAdmin && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleToggleAdmin(member.id, member.role)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid #3a4a3a',
                        color: '#6a7a6a', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
                      }}>{member.role === 'admin' ? '↓ MEMBER' : '↑ ADMIN'}</button>
                      <button onClick={() => handleRemoveMember(member.id)} style={{
                        padding: '4px 8px', background: 'transparent', border: '1px solid #ff6b3550',
                        color: '#ff6b35', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace',
                      }}>REMOVE</button>
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
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            width: '400px', background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
            border: '2px solid #ffd23f40', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <GlowText color="#ffd23f" size="1.1rem">New Group</GlowText>
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

// ============ NEW THREAD MODAL ============
const NewThreadModal = ({ isOpen, onClose, onCreate, contacts, groups }) => {
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
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #ffd23f40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="#ffd23f" size="1.1rem">New Thread</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Thread title..."
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
            border: `1px solid ${canCreate ? '#ffd23f' : '#3a4a3a'}`,
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
  const { user, token, logout } = useAuth();
  const { fetchAPI } = useAPI();
  const [toast, setToast] = useState(null);
  const [activeView, setActiveView] = useState('threads');
  const [apiConnected, setApiConnected] = useState(false);
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [showNewThread, setShowNewThread] = useState(false);

  const handleWSMessage = useCallback((data) => {
    if (data.type === 'new_message' || data.type === 'thread_created' || data.type === 'thread_updated') {
      loadThreads();
    }
  }, []);

  const { connected: wsConnected } = useWebSocket(token, handleWSMessage);

  const showToastMsg = useCallback((message, type) => setToast({ message, type }), []);

  const loadThreads = useCallback(async () => {
    try {
      const data = await fetchAPI('/threads');
      setThreads(data);
      setApiConnected(true);
    } catch { setApiConnected(false); }
  }, [fetchAPI]);

  const loadContacts = useCallback(async () => {
    try { setContacts(await fetchAPI('/contacts')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  const loadGroups = useCallback(async () => {
    try { setGroups(await fetchAPI('/groups')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  useEffect(() => {
    loadThreads();
    loadContacts();
    loadGroups();
  }, [loadThreads, loadContacts, loadGroups]);

  const handleCreateThread = async (data) => {
    try {
      await fetchAPI('/threads', { method: 'POST', body: data });
      showToastMsg('Thread created', 'success');
      loadThreads();
    } catch (err) {
      showToastMsg(err.message || 'Failed to create thread', 'error');
    }
  };

  return (
    <div style={{
      height: '100vh', background: 'linear-gradient(180deg, #0d150d, #050805)',
      fontFamily: "'Courier New', monospace", color: '#c5d5c5',
      display: 'flex', flexDirection: 'column',
    }}>
      <ScanLines />

      {/* Header */}
      <header style={{
        padding: '12px 24px', borderBottom: '2px solid #ffd23f40',
        background: 'linear-gradient(90deg, #0d150d, #1a2a1a, #0d150d)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <GlowText color="#ffd23f" size="1.5rem" weight={700}>CORTEX</GlowText>
            <span style={{ color: '#5a6a5a', fontSize: '0.7rem', marginLeft: '8px' }}>v1.2.0</span>
          </div>
          <ConnectionStatus wsConnected={wsConnected} apiConnected={apiConnected} />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {['threads', 'groups', 'contacts'].map(view => (
            <button key={view} onClick={() => setActiveView(view)} style={{
              padding: '8px 16px',
              background: activeView === view ? '#ffd23f15' : 'transparent',
              border: `1px solid ${activeView === view ? '#ffd23f50' : '#3a4a3a'}`,
              color: activeView === view ? '#ffd23f' : '#6a7a6a',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase',
            }}>{view}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#ffd23f', fontSize: '0.8rem' }}>{user?.displayName}</div>
            <div style={{ color: '#5a6a5a', fontSize: '0.65rem' }}>@{user?.username}</div>
          </div>
          <button onClick={logout} style={{
            padding: '6px 12px', background: 'transparent', border: '1px solid #3a4a3a',
            color: '#6a7a6a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
          }}>LOGOUT</button>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeView === 'threads' && (
          <>
            <ThreadList threads={threads} selectedThread={selectedThread}
              onSelectThread={setSelectedThread} onNewThread={() => setShowNewThread(true)} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {selectedThread ? (
                <ThreadView thread={selectedThread} onBack={() => setSelectedThread(null)}
                  fetchAPI={fetchAPI} showToast={showToastMsg} currentUser={user}
                  groups={groups} onThreadUpdate={loadThreads} />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a4a3a' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>◎</div>
                    <div>Select a thread or create a new one</div>
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
          <ContactsView contacts={contacts} fetchAPI={fetchAPI} showToast={showToastMsg} onContactsChange={loadContacts} />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '8px 24px', background: '#050805', borderTop: '1px solid #2a3a2a',
        display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'monospace',
      }}>
        <div style={{ color: '#5a6a5a' }}><span style={{ color: '#0ead69' }}>●</span> ENCRYPTED • LOCAL CACHE</div>
        <div style={{ color: '#5a6a5a' }}>THREADS: {threads.length} • GROUPS: {groups.length} • CONTACTS: {contacts.length}</div>
      </footer>

      <NewThreadModal isOpen={showNewThread} onClose={() => setShowNewThread(false)}
        onCreate={handleCreateThread} contacts={contacts} groups={groups} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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
        .then(setUser)
        .catch(() => { storage.removeToken(); storage.removeUser(); setToken(null); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    storage.setToken(data.token); storage.setUser(data.user);
    setToken(data.token); setUser(data.user);
  };

  const register = async (username, email, password, displayName) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, displayName }),
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

  if (loading) return <LoadingSpinner />;

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
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
