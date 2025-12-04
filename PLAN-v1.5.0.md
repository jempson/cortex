# Cortex v1.5.0 - Implementation Plan

## 🎯 RELEASE STATUS: IN PLANNING

**Target Release:** TBD
**Selected Scope:** Option B (Core 3 + Desktop Notifications)
**Estimated Time:** 19-28 hours (3-4 days focused development)

---

## Overview

Version 1.5.0 focuses on essential communication features that enhance real-time interaction and discoverability. This release builds on v1.4.0's read tracking foundation with features users expect from modern chat applications.

**Release Type:** Feature Enhancement
**Focus Areas:** Reactions, Search, Presence, Notifications

---

## Features Selected for v1.5.0

### Core Features
1. ✅ **Message Reactions** (4-6h) - Emoji reactions on messages
2. ✅ **Message Search** (8-12h) - Full-text search across waves
3. ✅ **Typing Indicators** (3-4h) - Show when users are typing

### Selected Stretch Goal
4. ✅ **Desktop Notifications** (4-6h) - Browser notifications for new messages

### Deferred to v1.6.0+
- ❌ GIF Search Integration → v1.6.0
- ❌ Read Receipts Display → v1.6.0

---

## 1. Message Reactions (HIGH PRIORITY) ⭐

### User Story
> As a user, I want to react to messages with emojis (like Slack/Discord) so I can acknowledge messages without writing a reply.

### Current State
- No reaction capability exists
- Users must reply to acknowledge messages
- No quick feedback mechanism

### Implementation Details

#### Backend Changes (server/server.js)

**1. Message Schema Already Supports Reactions**
The schema already has `reactions: {}` field (Line 867):
```javascript
reactions: {}, // { emoji: [userId1, userId2, ...] }
```

**2. Add Reaction Endpoint**
Location: After message endpoints (~Line 1595)

```javascript
app.post('/api/messages/:id/react', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
    return res.status(400).json({ error: 'Invalid emoji' });
  }

  const message = db.messages.messages.find(m => m.id === messageId);
  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  // Initialize reactions object if needed
  if (!message.reactions) {
    message.reactions = {};
  }

  // Toggle reaction
  if (!message.reactions[emoji]) {
    message.reactions[emoji] = [];
  }

  const userIndex = message.reactions[emoji].indexOf(req.user.userId);
  if (userIndex > -1) {
    // Remove reaction
    message.reactions[emoji].splice(userIndex, 1);
    if (message.reactions[emoji].length === 0) {
      delete message.reactions[emoji];
    }
  } else {
    // Add reaction
    message.reactions[emoji].push(req.user.userId);
  }

  db.saveMessages();

  // Broadcast to all clients in wave
  broadcast({
    type: 'message_reacted',
    messageId: message.id,
    waveId: message.waveId,
    emoji,
    userId: req.user.userId,
    reactions: message.reactions
  });

  res.json({ success: true, reactions: message.reactions });
});
```

**3. Update getMessagesForWave() to Include Reactions**
Already included in current implementation - no changes needed.

#### Frontend Changes (client/CortexApp.jsx)

**1. Add Reaction Picker Component** (~Line 400, before ThreadedMessage)

```javascript
const ReactionPicker = ({ onSelect, onClose, isMobile }) => {
  const quickReactions = ['👍', '❤️', '😂', '🎉', '🤔', '👏', '🔥', '👀'];

  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      marginBottom: '8px',
      background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
      border: '1px solid #3bceac',
      padding: '8px',
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
      maxWidth: isMobile ? '200px' : '240px',
      zIndex: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
    }}>
      {quickReactions.map(emoji => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          style={{
            padding: isMobile ? '8px' : '6px',
            minWidth: isMobile ? '40px' : '32px',
            minHeight: isMobile ? '40px' : '32px',
            background: 'transparent',
            border: '1px solid #3a4a3a',
            cursor: 'pointer',
            fontSize: isMobile ? '1.2rem' : '1rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#3bceac20'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
```

**2. Update ThreadedMessage Component**
The component already has reaction display (Lines 573-611) and showReactionPicker state. Just need to update the handler:

Add after the existing onReact handler in WaveView:
```javascript
const handleReaction = async (messageId, emoji) => {
  try {
    await fetchAPI(`/messages/${messageId}/react`, {
      method: 'POST',
      body: { emoji }
    });
    // Wave will reload via WebSocket message_reacted event
  } catch (err) {
    showToast(err.message || 'Failed to add reaction', 'error');
  }
};
```

**3. Add WebSocket Handler for message_reacted**
In handleWebSocketMessage function (~Line 1850):

```javascript
case 'message_reacted':
  if (currentView === 'wave' && selectedWave?.id === data.waveId) {
    loadWave(); // Refresh current wave
  }
  break;
```

### Estimated Time
**4-6 hours** (Backend: 2h, Frontend: 2-3h, Testing: 1h)

---

## 2. Message Search (HIGH PRIORITY) ⭐

### User Story
> As a user, I want to search through all my messages across all waves so I can find past conversations and important information.

### Current State
- No search functionality exists
- Users must manually scroll through waves to find messages
- No way to find messages by content

### Implementation Details

#### Backend Changes (server/server.js)

**1. Add Search Method to Database Class** (~Line 980)

```javascript
searchMessages(query, filters = {}) {
  const { userId, waveId, authorId, fromDate, toDate } = filters;

  // Get accessible waves for user
  const userWaves = this.getWavesForUser(userId);
  const accessibleWaveIds = new Set(userWaves.map(w => w.id));

  // Filter and search messages
  let results = this.messages.messages.filter(msg => {
    // Security: Only search in accessible waves
    if (!accessibleWaveIds.has(msg.waveId)) return false;

    // Apply filters
    if (waveId && msg.waveId !== waveId) return false;
    if (authorId && msg.authorId !== authorId) return false;
    if (fromDate && new Date(msg.createdAt) < new Date(fromDate)) return false;
    if (toDate && new Date(msg.createdAt) > new Date(toDate)) return false;

    // Search in content (case-insensitive)
    const searchLower = query.toLowerCase();
    const contentLower = msg.content.toLowerCase();

    return contentLower.includes(searchLower);
  });

  // Sort by date (most recent first)
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Limit results
  results = results.slice(0, 100);

  // Enrich with author and wave info
  return results.map(msg => {
    const author = this.findUserById(msg.authorId);
    const wave = this.waves.waves.find(w => w.id === msg.waveId);

    return {
      ...msg,
      sender_name: author?.displayName || 'Unknown',
      sender_handle: author?.handle || 'unknown',
      wave_title: wave?.title || 'Unknown Wave',
      wave_privacy: wave?.privacy || 'private'
    };
  });
}
```

**2. Add Search Endpoint** (~Line 1600)

```javascript
app.get('/api/search', authenticateToken, (req, res) => {
  const query = sanitizeInput(req.query.q || '');

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const filters = {
    userId: req.user.userId,
    waveId: req.query.wave ? sanitizeInput(req.query.wave) : undefined,
    authorId: req.query.author ? sanitizeInput(req.query.author) : undefined,
    fromDate: req.query.from ? sanitizeInput(req.query.from) : undefined,
    toDate: req.query.to ? sanitizeInput(req.query.to) : undefined
  };

  const results = db.searchMessages(query, filters);

  res.json({
    query,
    count: results.length,
    results
  });
});
```

#### Frontend Changes (client/CortexApp.jsx)

**1. Add SearchModal Component** (~Line 850)

```javascript
const SearchModal = ({ isOpen, onClose, fetchAPI, onSelectMessage, isMobile }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});

  const handleSearch = async () => {
    if (query.length < 2) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, ...filters });
      const data = await fetchAPI(`/search?${params}`);
      setResults(data.results);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(handleSearch, 300); // Debounce
      return () => clearTimeout(timer);
    } else {
      setResults([]);
    }
  }, [query, filters]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: '700px',
        maxHeight: '80vh',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #3bceac',
        padding: isMobile ? '16px' : '24px',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <GlowText color="#3bceac" size="1.1rem">Search Messages</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7a6a', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Search Input */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search messages..."
          autoFocus
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            background: '#0a100a',
            border: '1px solid #3bceac',
            color: '#c5d5c5',
            fontSize: '1rem',
            fontFamily: 'monospace'
          }}
        />

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div style={{ color: '#6a7a6a', padding: '20px', textAlign: 'center' }}>Searching...</div>}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div style={{ color: '#6a7a6a', padding: '20px', textAlign: 'center' }}>No results found</div>
          )}

          {!loading && results.map(msg => (
            <div
              key={msg.id}
              onClick={() => {
                onSelectMessage(msg.waveId, msg.id);
                onClose();
              }}
              style={{
                padding: '12px',
                marginBottom: '8px',
                background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
                border: '1px solid #2a3a2a',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3bceac'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#2a3a2a'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#3bceac', fontSize: '0.85rem' }}>{msg.wave_title}</span>
                <span style={{ color: '#6a7a6a', fontSize: '0.75rem' }}>
                  {new Date(msg.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ color: '#c5d5c5', fontSize: '0.9rem', marginBottom: '4px' }}>
                <strong>{msg.sender_name}</strong>: <span dangerouslySetInnerHTML={{ __html: msg.content }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', color: '#6a7a6a', fontSize: '0.75rem' }}>
          {results.length > 0 && `${results.length} result${results.length !== 1 ? 's' : ''} found`}
        </div>
      </div>
    </div>
  );
};
```

**2. Add Search Button to Header** (~Line 2500)

Add search button next to CORTEX title:
```javascript
<button
  onClick={() => setShowSearch(true)}
  style={{
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #3bceac',
    color: '#3bceac',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '0.75rem'
  }}
>
  🔍 SEARCH
</button>
```

**3. Add State and Handler in App Component**

```javascript
const [showSearch, setShowSearch] = useState(false);

const handleSelectMessage = (waveId, messageId) => {
  // Switch to wave and highlight message
  const wave = waves.find(w => w.id === waveId);
  if (wave) {
    setSelectedWave(wave);
    setCurrentView('wave');
    // TODO: Scroll to and highlight message
  }
};
```

### Estimated Time
**8-12 hours** (Backend: 3-4h, Frontend: 4-6h, Testing: 2h)

---

## 3. Typing Indicators (MEDIUM PRIORITY)

### User Story
> As a user, I want to see when others are typing in a wave so I know someone is about to respond.

### Current State
- No typing indicators
- Users don't know if others are composing messages
- Common feature in modern chat apps

### Implementation Details

#### Backend Changes (server/server.js)

**1. Add WebSocket Handler for Typing Events**
In WebSocket message handler (~Line 1650):

```javascript
case 'user_typing':
  // Broadcast typing indicator to other users in the wave
  const typingWaveId = sanitizeInput(message.waveId);

  broadcast({
    type: 'user_typing',
    waveId: typingWaveId,
    userId: ws.userId,
    userName: ws.userName,
    timestamp: Date.now()
  }, ws); // Exclude sender
  break;
```

No database changes needed - typing indicators are ephemeral.

#### Frontend Changes (client/CortexApp.jsx)

**1. Add Typing State in WaveView** (~Line 920)

```javascript
const [typingUsers, setTypingUsers] = useState({}); // { userId: timestamp }
const typingTimeoutRef = useRef({});
```

**2. Add Typing Detection in Textarea**

```javascript
const handleTyping = () => {
  if (!newMessage.trim()) return;

  // Throttle typing events (max 1 per 2 seconds)
  const now = Date.now();
  if (!lastTypingSentRef.current || now - lastTypingSentRef.current > 2000) {
    sendWebSocketMessage({
      type: 'user_typing',
      waveId: wave.id
    });
    lastTypingSentRef.current = now;
  }
};

// Add to textarea onChange
onChange={(e) => {
  setNewMessage(e.target.value);
  handleTyping();
}}
```

**3. Handle Typing WebSocket Events**

```javascript
case 'user_typing':
  if (data.waveId === selectedWave?.id && data.userId !== currentUser.id) {
    setTypingUsers(prev => ({
      ...prev,
      [data.userId]: { name: data.userName, timestamp: Date.now() }
    }));

    // Clear typing indicator after 5 seconds
    if (typingTimeoutRef.current[data.userId]) {
      clearTimeout(typingTimeoutRef.current[data.userId]);
    }
    typingTimeoutRef.current[data.userId] = setTimeout(() => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    }, 5000);
  }
  break;
```

**4. Display Typing Indicator** (~Line 1250, below messages, above compose)

```javascript
{/* Typing Indicator */}
{Object.keys(typingUsers).length > 0 && (
  <div style={{
    padding: '8px 20px',
    color: '#6a7a6a',
    fontSize: '0.85rem',
    fontStyle: 'italic'
  }}>
    {Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
  </div>
)}
```

### Estimated Time
**3-4 hours** (Backend: 1h, Frontend: 2h, Testing: 1h)

---

## 4. Desktop Notifications (STRETCH GOAL) ⭐

### User Story
> As a user with Cortex open in a browser tab, I want to be notified when new messages arrive even when I'm viewing another tab or wave, so I don't miss important conversations.

**Requested By:** Jared Empson

### Current State
- WebSocket provides real-time updates
- Toast notifications only visible in-app
- No notifications when tab in background
- No notifications when viewing different wave

### Implementation Details

#### Backend Changes
**None required** - Uses browser's Notification API

#### Frontend Changes (client/CortexApp.jsx)

**1. Request Notification Permission** (~Line 1800 in App component)

```javascript
const [notificationPermission, setNotificationPermission] = useState(
  typeof Notification !== 'undefined' ? Notification.permission : 'denied'
);

useEffect(() => {
  // Request permission on login
  if (currentUser && notificationPermission === 'default') {
    requestNotificationPermission();
  }
}, [currentUser]);

const requestNotificationPermission = async () => {
  if (typeof Notification === 'undefined') return;

  try {
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  } catch (err) {
    console.error('Failed to request notification permission:', err);
  }
};
```

**2. Add Notification Preferences to User Settings**

In ProfileSettings component, add:
```javascript
<div style={{ marginBottom: '16px' }}>
  <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '8px' }}>DESKTOP NOTIFICATIONS</div>
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#c5d5c5' }}>
    <input
      type="checkbox"
      checked={preferences.notifications?.enabled || false}
      onChange={(e) => setPreferences(p => ({
        ...p,
        notifications: { ...p.notifications, enabled: e.target.checked }
      }))}
    />
    Enable desktop notifications
  </label>
  {notificationPermission === 'denied' && (
    <div style={{ color: '#ff6b35', fontSize: '0.75rem', marginTop: '4px' }}>
      Notifications blocked by browser. Check site settings.
    </div>
  )}
</div>
```

**3. Show Notification on New Messages**

In WebSocket message handler for 'new_message':
```javascript
case 'new_message':
  // Existing logic...

  // Show desktop notification if:
  // 1. User has enabled notifications
  // 2. Browser permission granted
  // 3. Tab is not visible OR viewing different wave
  // 4. Message is not from current user

  if (
    preferences.notifications?.enabled &&
    notificationPermission === 'granted' &&
    data.authorId !== currentUser?.id &&
    (document.visibilityState === 'hidden' || selectedWave?.id !== data.waveId)
  ) {
    showDesktopNotification(data);
  }
  break;
```

**4. Create Notification Function**

```javascript
const showDesktopNotification = (messageData) => {
  const wave = waves.find(w => w.id === messageData.waveId);
  const waveTitle = wave?.title || 'Unknown Wave';

  // Strip HTML and truncate content
  const content = messageData.content
    .replace(/<[^>]*>/g, '')
    .substring(0, 100) + (messageData.content.length > 100 ? '...' : '');

  const notification = new Notification(`${messageData.senderName} in ${waveTitle}`, {
    body: content,
    icon: '/favicon.ico', // Use your Cortex icon
    badge: '/favicon.ico',
    tag: messageData.waveId, // Group by wave
    requireInteraction: false,
    silent: false
  });

  // Click notification to focus wave
  notification.onclick = () => {
    window.focus();
    if (wave) {
      setSelectedWave(wave);
      setCurrentView('wave');
    }
    notification.close();
  };

  // Auto-close after 5 seconds
  setTimeout(() => notification.close(), 5000);
};
```

**5. Add Notification Settings Icon in Header**

Add button near profile settings to configure notifications.

### Estimated Time
**4-6 hours** (Frontend: 3-4h, Testing: 1-2h, No backend work)

---

## Implementation Order

Recommended order based on dependencies and complexity:

### Day 1: Foundation
1. **Typing Indicators** (3-4h) - Simplest, tests WebSocket patterns
2. **Message Reactions** (4-6h) - Core feature, moderate complexity

### Day 2: Search & Notifications
3. **Message Search** (8-12h) - Most complex, takes full day
4. **Desktop Notifications** (4-6h) - Independent, can be done in parallel

**Total:** 19-28 hours across 2-3 days

---

## Testing Checklist

### For Each Feature
- [ ] Functionality works in single-user scenario
- [ ] Real-time updates work across multiple clients (WebSocket)
- [ ] Mobile UI is touch-friendly and responsive
- [ ] Error handling for network failures
- [ ] Input sanitization and validation
- [ ] No memory leaks (WebSocket cleanup, timeouts)

### Specific Tests

#### Message Reactions
- [ ] Can add/remove reactions
- [ ] Reaction counts update correctly
- [ ] Multiple users can react with same emoji
- [ ] Reactions persist after reload
- [ ] WebSocket broadcasts work

#### Message Search
- [ ] Search finds messages by content
- [ ] Only searches accessible waves
- [ ] Filters work (wave, author, date)
- [ ] Results are sorted by date
- [ ] Click result navigates to wave
- [ ] Handles special characters in search

#### Typing Indicators
- [ ] Typing indicator appears when user types
- [ ] Indicator disappears after 5 seconds
- [ ] Throttling works (max 1 event per 2s)
- [ ] Multiple users typing shows correctly
- [ ] Cleans up timeouts on unmount

#### Desktop Notifications
- [ ] Permission request works
- [ ] Notifications show for background tabs
- [ ] Notifications show for different waves
- [ ] Click notification focuses wave
- [ ] Notifications group by wave
- [ ] Settings toggle works
- [ ] Respects browser permission

---

## Documentation Updates

### Files to Update
- [ ] README.md - Add v1.5.0 section
- [ ] CHANGELOG.md - Document all changes
- [ ] CLAUDE.md - Update patterns and features
- [ ] client/CortexApp.jsx - Update version to v1.5.0
- [ ] server/server.js - Update version banner to v1.5.0

---

## Success Criteria

v1.5.0 is ready when:
- ✅ All 4 features implemented and working
- ✅ No breaking changes or regressions
- ✅ Build successful (bundle size < 65 KB gzipped)
- ✅ All tests passing
- ✅ Documentation complete
- ✅ Git tag created: v1.5.0
- ✅ Deployed and monitored for 24 hours

---

## Risk Assessment

### Low Risk
- Typing indicators (simple WebSocket events)
- Desktop notifications (browser API only)

### Medium Risk
- Message reactions (database updates, WebSocket broadcasts)
- Message search (performance with large datasets, security)

### Mitigations
- Test search performance with 1000+ messages
- Add search result limits (100 max)
- Sanitize all search inputs
- Rate limit search endpoint
- Test WebSocket broadcasts with multiple clients

---

*Plan Created: December 4, 2025*
*Ready to Begin Implementation*
