# Cortex v1.6.0 - Implementation Plan

## 🎯 RELEASE STATUS: COMPLETED ✅

**Release Date:** December 5, 2025
**Selected Scope:** Progressive Web App (PWA) Support
**Actual Time:** ~4 hours

---

## Overview

Version 1.6.0 adds full Progressive Web App support, making Cortex installable on Android and iOS devices with offline capabilities.

**Release Type:** PWA Enhancement
**Focus Areas:** Mobile experience, offline support, app installation

---

## Features Completed in v1.6.0

### ✅ Progressive Web App (PWA) Support
1. ✅ **Web App Manifest** - App metadata, icons, theme colors
2. ✅ **Service Worker** - Offline caching with stale-while-revalidate strategy
3. ✅ **App Icons** - 13 icons for all device sizes (16px-512px)
4. ✅ **Install Prompt** - Custom "Install Cortex" banner component
5. ✅ **Offline Indicator** - Orange banner when network connection lost
6. ✅ **iOS Support** - apple-touch-icon, status bar styling

### Deferred to v1.7.0
- ❌ Basic Moderation System (blocking, muting, reporting)
- ❌ GIF Search Integration (Giphy/Tenor)
- ❌ Read Receipts Display
- ❌ Public REST API Documentation

---

## 1. Basic Moderation System (MEDIUM-HIGH PRIORITY) ⭐⭐⭐

### User Story
> As a user, I want to block or mute other users who are harassing me or spamming, and I want to report inappropriate content so admins can take action.

### Current State
- No blocking or muting functionality
- No way to report inappropriate content
- Admins have no moderation dashboard
- Users are vulnerable to harassment and spam

### Implementation Details

#### Backend Changes (server/server.js)

**1. Update User Schema**
Location: Database constructor (~Line 145)

```javascript
this.users = {
  users: existingUsers || [],
  // Add new fields:
  blocks: [], // { userId, blockedUserId, blockedAt }
  mutes: []   // { userId, mutedUserId, mutedAt }
};

this.reports = {
  reports: existingReports || []
};
```

**2. Add Database Methods**
Location: After existing user methods (~Line 600)

```javascript
// Blocking
blockUser(userId, blockedUserId) {
  // Validate users exist
  const user = this.findUserById(userId);
  const blockedUser = this.findUserById(blockedUserId);
  if (!user || !blockedUser) return false;

  // Check if already blocked
  const existing = this.users.blocks.find(
    b => b.userId === userId && b.blockedUserId === blockedUserId
  );
  if (existing) return false;

  this.users.blocks.push({
    id: uuidv4(),
    userId,
    blockedUserId,
    blockedAt: new Date().toISOString()
  });

  this.saveUsers();
  return true;
}

unblockUser(userId, blockedUserId) {
  const index = this.users.blocks.findIndex(
    b => b.userId === userId && b.blockedUserId === blockedUserId
  );
  if (index === -1) return false;

  this.users.blocks.splice(index, 1);
  this.saveUsers();
  return true;
}

getBlockedUsers(userId) {
  return this.users.blocks
    .filter(b => b.userId === userId)
    .map(b => {
      const user = this.findUserById(b.blockedUserId);
      return {
        ...b,
        handle: user?.handle,
        displayName: user?.displayName
      };
    });
}

isBlocked(userId, otherUserId) {
  return this.users.blocks.some(
    b => (b.userId === userId && b.blockedUserId === otherUserId) ||
         (b.userId === otherUserId && b.blockedUserId === userId)
  );
}

// Muting (same pattern as blocking)
muteUser(userId, mutedUserId) { /* similar to blockUser */ }
unmuteUser(userId, mutedUserId) { /* similar to unblockUser */ }
getMutedUsers(userId) { /* similar to getBlockedUsers */ }
isMuted(userId, otherUserId) { /* similar to isBlocked */ }

// Reports
createReport(data) {
  const report = {
    id: uuidv4(),
    reporterId: data.reporterId,
    type: data.type, // 'message' | 'wave' | 'user'
    targetId: data.targetId,
    reason: data.reason, // 'spam' | 'harassment' | 'inappropriate' | 'other'
    details: data.details || '',
    status: 'pending', // 'pending' | 'resolved' | 'dismissed'
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null
  };

  this.reports.reports.push(report);
  this.saveReports();
  return report;
}

getReports(filters = {}) {
  let reports = this.reports.reports;

  if (filters.status) {
    reports = reports.filter(r => r.status === filters.status);
  }

  if (filters.type) {
    reports = reports.filter(r => r.type === filters.type);
  }

  // Enrich with context
  return reports.map(r => {
    const reporter = this.findUserById(r.reporterId);
    let context = {};

    if (r.type === 'message') {
      const msg = this.messages.messages.find(m => m.id === r.targetId);
      if (msg) {
        const author = this.findUserById(msg.authorId);
        context = {
          content: msg.content,
          authorHandle: author?.handle,
          authorName: author?.displayName,
          createdAt: msg.createdAt
        };
      }
    } else if (r.type === 'wave') {
      const wave = this.getWave(r.targetId);
      if (wave) {
        context = {
          title: wave.title,
          privacy: wave.privacy
        };
      }
    } else if (r.type === 'user') {
      const user = this.findUserById(r.targetId);
      if (user) {
        context = {
          handle: user.handle,
          displayName: user.displayName
        };
      }
    }

    return {
      ...r,
      reporterHandle: reporter?.handle,
      reporterName: reporter?.displayName,
      context
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

resolveReport(reportId, resolution, userId) {
  const report = this.reports.reports.find(r => r.id === reportId);
  if (!report) return false;

  report.status = resolution === 'dismiss' ? 'dismissed' : 'resolved';
  report.resolvedAt = new Date().toISOString();
  report.resolvedBy = userId;
  report.resolution = resolution;

  this.saveReports();
  return true;
}

saveReports() {
  try {
    fs.writeFileSync(this.reportsPath, JSON.stringify(this.reports, null, 2));
  } catch (err) {
    console.error('Failed to save reports:', err);
  }
}
```

**3. Filter Messages from Blocked/Muted Users**
Update `getMessagesForWave()` method (~Line 822):

```javascript
getMessagesForWave(waveId, userId = null) {
  let messages = this.messages.messages.filter(m => m.waveId === waveId);

  // Filter out messages from blocked users
  if (userId) {
    const blockedIds = this.users.blocks
      .filter(b => b.userId === userId)
      .map(b => b.blockedUserId);

    const mutedIds = this.users.mutes
      .filter(m => m.userId === userId)
      .map(m => m.mutedUserId);

    messages = messages.filter(m =>
      !blockedIds.includes(m.authorId) && !mutedIds.includes(m.authorId)
    );
  }

  // ... rest of existing logic
}
```

**4. Add API Endpoints**
Location: After existing endpoints (~Line 1600)

```javascript
// Block user
app.post('/api/users/:id/block', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot block yourself' });
  }

  if (!db.blockUser(userId, targetUserId)) {
    return res.status(400).json({ error: 'User already blocked or not found' });
  }

  res.json({ success: true });
});

// Unblock user
app.delete('/api/users/:id/block', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (!db.unblockUser(userId, targetUserId)) {
    return res.status(404).json({ error: 'Block not found' });
  }

  res.json({ success: true });
});

// Get blocked users
app.get('/api/users/blocked', authenticateToken, (req, res) => {
  const blockedUsers = db.getBlockedUsers(req.user.userId);
  res.json({ blockedUsers });
});

// Mute user (similar endpoints)
app.post('/api/users/:id/mute', authenticateToken, (req, res) => { /* ... */ });
app.delete('/api/users/:id/mute', authenticateToken, (req, res) => { /* ... */ });
app.get('/api/users/muted', authenticateToken, (req, res) => { /* ... */ });

// Create report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { type, targetId, reason, details } = req.body;

  if (!type || !targetId || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['message', 'wave', 'user'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  if (!['spam', 'harassment', 'inappropriate', 'other'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' });
  }

  const report = db.createReport({
    reporterId: req.user.userId,
    type: sanitizeInput(type),
    targetId: sanitizeInput(targetId),
    reason: sanitizeInput(reason),
    details: sanitizeInput(details || '')
  });

  res.json({ success: true, reportId: report.id });
});

// Get reports (admin only)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const status = req.query.status ? sanitizeInput(req.query.status) : null;
  const type = req.query.type ? sanitizeInput(req.query.type) : null;

  const reports = db.getReports({ status, type });
  res.json({ reports, count: reports.length });
});

// Resolve report (admin only)
app.post('/api/admin/reports/:id/resolve', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const reportId = sanitizeInput(req.params.id);
  const { resolution } = req.body; // 'delete_content' | 'warn_user' | 'dismiss'

  if (!db.resolveReport(reportId, resolution, req.user.userId)) {
    return res.status(404).json({ error: 'Report not found' });
  }

  res.json({ success: true });
});
```

**5. Prevent Blocked Users from Adding to Waves**
Update wave creation/participant endpoints to check blocking status.

#### Frontend Changes (client/CortexApp.jsx)

**1. Add Block/Mute/Report Buttons to Message Context Menu**

Add to ThreadedMessage component (~Line 550):

```javascript
{canDelete && (
  <div style={{
    position: 'relative',
    display: 'flex',
    gap: '4px',
    marginTop: '8px'
  }}>
    {/* Existing edit/delete buttons */}

    {/* Add Report button for other users' messages */}
    {message.author_id !== currentUserId && (
      <button
        onClick={() => onReport(message)}
        style={{
          padding: isMobile ? '10px 14px' : '4px 8px',
          background: 'transparent',
          border: '1px solid #ff6b3530',
          color: '#ff6b35',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: isMobile ? '0.85rem' : '0.7rem'
        }}
      >
        ⚠️ REPORT
      </button>
    )}

    {/* Add Block/Mute buttons */}
    {message.author_id !== currentUserId && (
      <button
        onClick={() => onBlockUser(message.author_id)}
        style={{
          padding: isMobile ? '10px 14px' : '4px 8px',
          background: 'transparent',
          border: '1px solid #ff6b3530',
          color: '#ff6b35',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: isMobile ? '0.85rem' : '0.7rem'
        }}
      >
        🚫 BLOCK USER
      </button>
    )}
  </div>
)}
```

**2. Create Report Modal Component**

Add new component (~Line 1000):

```javascript
const ReportModal = ({ isOpen, onClose, target, fetchAPI, showToast, isMobile }) => {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = [
    { value: 'spam', label: 'Spam or unwanted content' },
    { value: 'harassment', label: 'Harassment or bullying' },
    { value: 'inappropriate', label: 'Inappropriate content' },
    { value: 'other', label: 'Other (please explain)' }
  ];

  const handleSubmit = async () => {
    if (!target) return;

    setSubmitting(true);
    try {
      await fetchAPI('/reports', {
        method: 'POST',
        body: {
          type: target.type, // 'message' | 'wave' | 'user'
          targetId: target.id,
          reason,
          details: details.trim()
        }
      });

      showToast('Report submitted. Admins will review it.', 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to submit report', 'error');
    }
    setSubmitting(false);
  };

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
        maxWidth: '500px',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #ff6b35',
        padding: isMobile ? '16px' : '24px'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: '16px' }}>
          <GlowText color="#ff6b35" size="1.1rem">Report {target?.type}</GlowText>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#6a7a6a', fontSize: '0.75rem', display: 'block', marginBottom: '8px' }}>
            REASON
          </label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0a100a',
              border: '1px solid #3a4a3a',
              color: '#c5d5c5',
              fontFamily: 'monospace',
              fontSize: '0.9rem'
            }}
          >
            {reasons.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#6a7a6a', fontSize: '0.75rem', display: 'block', marginBottom: '8px' }}>
            ADDITIONAL DETAILS (OPTIONAL)
          </label>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Provide any additional context..."
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0a100a',
              border: '1px solid #3a4a3a',
              color: '#c5d5c5',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid #3a4a3a',
              color: '#c5d5c5',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace'
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              background: '#ff6b35',
              border: 'none',
              color: '#0a100a',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}
          >
            {submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

**3. Add Admin Reports Panel**

Create new view component for admins to review reports (~Line 2000):

```javascript
const AdminReportsView = ({ fetchAPI, showToast, isMobile }) => {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'resolved' | 'dismissed' | 'all'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [filter]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? '' : `?status=${filter}`;
      const data = await fetchAPI(`/admin/reports${params}`);
      setReports(data.reports || []);
    } catch (err) {
      showToast('Failed to load reports', 'error');
    }
    setLoading(false);
  };

  const handleResolve = async (reportId, resolution) => {
    try {
      await fetchAPI(`/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: { resolution }
      });
      showToast('Report resolved', 'success');
      loadReports();
    } catch (err) {
      showToast('Failed to resolve report', 'error');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <GlowText color="#ff6b35" size="1.5rem">Reports Dashboard</GlowText>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['pending', 'resolved', 'dismissed', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              background: filter === f ? '#ff6b35' : 'transparent',
              border: '1px solid #ff6b35',
              color: filter === f ? '#0a100a' : '#ff6b35',
              cursor: 'pointer',
              fontFamily: 'monospace',
              textTransform: 'uppercase'
            }}
          >
            {f} ({reports.filter(r => f === 'all' || r.status === f).length})
          </button>
        ))}
      </div>

      {/* Reports list */}
      {loading ? (
        <div style={{ color: '#6a7a6a', textAlign: 'center', padding: '40px' }}>
          Loading reports...
        </div>
      ) : reports.length === 0 ? (
        <div style={{ color: '#6a7a6a', textAlign: 'center', padding: '40px' }}>
          No {filter !== 'all' ? filter : ''} reports
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(report => (
            <div
              key={report.id}
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
                border: `1px solid ${report.status === 'pending' ? '#ff6b35' : '#2a3a2a'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <span style={{ color: '#ff6b35', fontWeight: 'bold' }}>
                    {report.type.toUpperCase()} REPORT
                  </span>
                  <span style={{ color: '#6a7a6a', marginLeft: '12px', fontSize: '0.85rem' }}>
                    {report.reason}
                  </span>
                </div>
                <span style={{ color: '#6a7a6a', fontSize: '0.75rem' }}>
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div style={{ marginBottom: '12px', color: '#c5d5c5', fontSize: '0.9rem' }}>
                <strong>Reporter:</strong> {report.reporterName} (@{report.reporterHandle})
              </div>

              {report.context && (
                <div style={{
                  marginBottom: '12px',
                  padding: '12px',
                  background: '#0a100a',
                  border: '1px solid #2a3a2a'
                }}>
                  {report.type === 'message' && (
                    <>
                      <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '4px' }}>
                        From: {report.context.authorName} (@{report.context.authorHandle})
                      </div>
                      <div style={{ color: '#c5d5c5' }} dangerouslySetInnerHTML={{ __html: report.context.content }} />
                    </>
                  )}
                  {report.type === 'wave' && (
                    <div style={{ color: '#c5d5c5' }}>
                      Wave: {report.context.title} ({report.context.privacy})
                    </div>
                  )}
                  {report.type === 'user' && (
                    <div style={{ color: '#c5d5c5' }}>
                      User: {report.context.displayName} (@{report.context.handle})
                    </div>
                  )}
                </div>
              )}

              {report.details && (
                <div style={{ marginBottom: '12px', color: '#c5d5c5', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Details: {report.details}
                </div>
              )}

              {report.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleResolve(report.id, 'delete_content')}
                    style={{
                      padding: '8px 12px',
                      background: '#ff6b35',
                      border: 'none',
                      color: '#0a100a',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem'
                    }}
                  >
                    DELETE CONTENT
                  </button>
                  <button
                    onClick={() => handleResolve(report.id, 'warn_user')}
                    style={{
                      padding: '8px 12px',
                      background: '#ffd23f',
                      border: 'none',
                      color: '#0a100a',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem'
                    }}
                  >
                    WARN USER
                  </button>
                  <button
                    onClick={() => handleResolve(report.id, 'dismiss')}
                    style={{
                      padding: '8px 12px',
                      background: 'transparent',
                      border: '1px solid #3a4a3a',
                      color: '#6a7a6a',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem'
                    }}
                  >
                    DISMISS
                  </button>
                </div>
              )}

              {report.status !== 'pending' && (
                <div style={{ color: '#6a7a6a', fontSize: '0.75rem' }}>
                  {report.status === 'resolved' ? '✅' : '❌'} {report.status.toUpperCase()}
                  - {report.resolution} on {new Date(report.resolvedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

**4. Add Blocked/Muted Users Management to Settings**

Add section to ProfileSettings component:

```javascript
{/* Blocked Users Section */}
<div style={{ marginBottom: '24px' }}>
  <div style={{ color: '#6a7a6a', fontSize: '0.75rem', marginBottom: '12px' }}>
    BLOCKED USERS
  </div>
  {blockedUsers.length === 0 ? (
    <div style={{ color: '#6a7a6a', fontSize: '0.85rem' }}>No blocked users</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {blockedUsers.map(bu => (
        <div key={bu.id} style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px',
          background: '#0a100a',
          border: '1px solid #2a3a2a'
        }}>
          <span style={{ color: '#c5d5c5' }}>
            {bu.displayName} (@{bu.handle})
          </span>
          <button
            onClick={() => handleUnblock(bu.blockedUserId)}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              border: '1px solid #ff6b35',
              color: '#ff6b35',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '0.7rem'
            }}
          >
            UNBLOCK
          </button>
        </div>
      ))}
    </div>
  )}
</div>

{/* Similar section for Muted Users */}
```

### Estimated Time
**12-16 hours** (Backend: 6-8h, Frontend: 4-6h, Testing: 2h)

---

## 2. GIF Search Integration (MEDIUM PRIORITY) ⭐⭐

### User Story
> As a user, I want to search for and insert GIFs into my messages without leaving the app, so I can express myself with animated reactions and responses.

### Current State
- Users can paste GIF URLs manually
- No integrated GIF discovery
- No preview before sending
- Deferred from v1.3.3

### Implementation Details

#### Backend Changes (server/server.js)

**1. Add Environment Variable for API Key**
In `.env` file:
```
GIPHY_API_KEY=your_giphy_api_key_here
```

**2. Add GIF Proxy Endpoint**
Location: After existing endpoints (~Line 1700)

```javascript
app.get('/api/gifs/search', authenticateToken, gifSearchLimiter, async (req, res) => {
  const query = sanitizeInput(req.query.q || '');
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
  if (!GIPHY_API_KEY) {
    return res.status(503).json({ error: 'GIF search not configured' });
  }

  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=pg-13`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error('Giphy API error');
    }

    // Transform to simpler format
    const results = data.data.map(gif => ({
      id: gif.id,
      url: gif.images.fixed_height.url,
      preview: gif.images.fixed_height_small.url,
      width: parseInt(gif.images.fixed_height.width),
      height: parseInt(gif.images.fixed_height.height),
      title: gif.title
    }));

    res.json({
      results,
      total: data.pagination.total_count,
      hasMore: (offset + limit) < data.pagination.total_count
    });
  } catch (err) {
    console.error('GIF search error:', err);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
});

// Rate limiter for GIF search (10 requests per minute)
const gifSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many GIF searches, please try again later'
});
```

**3. Add Trending GIFs Endpoint**

```javascript
app.get('/api/gifs/trending', authenticateToken, gifSearchLimiter, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;

  const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
  if (!GIPHY_API_KEY) {
    return res.status(503).json({ error: 'GIF search not configured' });
  }

  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;

    const response = await fetch(url);
    const data = await response.json();

    const results = data.data.map(gif => ({
      id: gif.id,
      url: gif.images.fixed_height.url,
      preview: gif.images.fixed_height_small.url,
      width: parseInt(gif.images.fixed_height.width),
      height: parseInt(gif.images.fixed_height.height),
      title: gif.title
    }));

    res.json({ results });
  } catch (err) {
    console.error('Trending GIFs error:', err);
    res.status(500).json({ error: 'Failed to load trending GIFs' });
  }
});
```

#### Frontend Changes (client/CortexApp.jsx)

**1. Create GIF Search Modal Component**

Add new component (~Line 1100):

```javascript
const GifSearchModal = ({ isOpen, onClose, onSelectGif, fetchAPI, showToast, isMobile }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTrending, setShowTrending] = useState(true);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen && showTrending) {
      loadTrending();
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.length >= 2) {
      setShowTrending(false);
      // Debounce search
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        searchGifs(query);
      }, 500);
    } else if (query.length === 0) {
      setShowTrending(true);
      loadTrending();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const loadTrending = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/gifs/trending?limit=30');
      setResults(data.results || []);
    } catch (err) {
      showToast('Failed to load trending GIFs', 'error');
    }
    setLoading(false);
  };

  const searchGifs = async (q) => {
    setLoading(true);
    try {
      const data = await fetchAPI(`/gifs/search?q=${encodeURIComponent(q)}&limit=30`);
      setResults(data.results || []);
    } catch (err) {
      showToast('Failed to search GIFs', 'error');
    }
    setLoading(false);
  };

  const handleSelect = (gif) => {
    onSelectGif(gif.url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: '800px',
        maxHeight: '80vh',
        background: 'linear-gradient(135deg, #0d150d, #1a2a1a)',
        border: '2px solid #3bceac',
        padding: isMobile ? '16px' : '24px',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <GlowText color="#3bceac" size="1.1rem">
            {showTrending ? 'Trending GIFs' : 'Search GIFs'}
          </GlowText>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6a7a6a',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search for GIFs..."
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

        {/* Results Grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`,
          gap: '8px',
          minHeight: 0
        }}>
          {loading && (
            <div style={{
              gridColumn: '1 / -1',
              color: '#6a7a6a',
              padding: '40px',
              textAlign: 'center'
            }}>
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div style={{
              gridColumn: '1 / -1',
              color: '#6a7a6a',
              padding: '40px',
              textAlign: 'center'
            }}>
              No GIFs found
            </div>
          )}

          {!loading && results.map(gif => (
            <div
              key={gif.id}
              onClick={() => handleSelect(gif)}
              style={{
                cursor: 'pointer',
                border: '2px solid transparent',
                transition: 'border-color 0.2s ease',
                aspectRatio: '1',
                overflow: 'hidden',
                position: 'relative'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3bceac'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <img
                src={gif.preview}
                alt={gif.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: '12px', color: '#6a7a6a', fontSize: '0.7rem', textAlign: 'center' }}>
          Powered by GIPHY
        </div>
      </div>
    </div>
  );
};
```

**2. Add GIF Button to Message Composer**

In WaveView component, add button next to emoji picker (~Line 1400):

```javascript
{/* GIF Search Button */}
<button
  onClick={() => setShowGifSearch(true)}
  style={{
    padding: isMobile ? '10px' : '6px 12px',
    minHeight: isMobile ? '44px' : 'auto',
    background: 'transparent',
    border: '1px solid #3bceac',
    color: '#3bceac',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: isMobile ? '0.9rem' : '0.75rem'
  }}
>
  🎬 GIF
</button>

{/* GIF Search Modal */}
{showGifSearch && (
  <GifSearchModal
    isOpen={showGifSearch}
    onClose={() => setShowGifSearch(false)}
    onSelectGif={(url) => {
      setNewMessage(prev => prev + (prev ? '\n' : '') + url);
    }}
    fetchAPI={fetchAPI}
    showToast={showToast}
    isMobile={isMobile}
  />
)}
```

### Estimated Time
**6-8 hours** (Backend: 2h, Frontend: 3-4h, Testing: 1-2h)

---

## 3. Read Receipts Display (MEDIUM PRIORITY) ⭐

### User Story
> As a user, I want to see who has read the messages in a wave so I know if my teammates have seen important updates.

### Current State
- v1.4.0 implemented per-message `readBy` arrays
- Backend tracks read status perfectly
- No visual display of who has read messages
- Data exists, just needs UI

### Implementation Details

#### Backend Changes
**None required!** All data already exists from v1.4.0.

The `readBy` arrays are already tracked on every message:
```javascript
{
  id: "msg-123",
  content: "Hello",
  readBy: ["user-1", "user-2", "user-3"]
}
```

#### Frontend Changes (client/CortexApp.jsx)

**1. Add Read Receipts to Wave Header**

In WaveView component, add participant list with read indicators (~Line 1150):

```javascript
{/* Wave Participants with Read Status */}
<div style={{
  padding: isMobile ? '8px 12px' : '8px 20px',
  borderBottom: '1px solid #2a3a2a',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap'
}}>
  <span style={{ color: '#6a7a6a', fontSize: '0.75rem' }}>PARTICIPANTS:</span>
  {waveData.participants.map(p => {
    const hasReadLatest = waveData.messages.length > 0 &&
      waveData.messages[waveData.messages.length - 1].readBy?.includes(p.id);

    return (
      <div
        key={p.id}
        title={`${p.name} - ${hasReadLatest ? 'Read' : 'Unread'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          background: hasReadLatest ? '#0ead6920' : '#2a3a2a',
          border: `1px solid ${hasReadLatest ? '#0ead69' : '#3a4a3a'}`,
          fontSize: '0.75rem',
          color: '#c5d5c5'
        }}
      >
        {hasReadLatest ? '✓' : '○'} {p.name}
      </div>
    );
  })}
</div>
```

**2. Add Read Receipts to Individual Messages (Optional)**

Add expandable "Seen by" section below each message:

```javascript
{/* Read Receipts */}
{message.readBy && message.readBy.length > 0 && (
  <div style={{
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #2a3a2a'
  }}>
    <details style={{ cursor: 'pointer' }}>
      <summary style={{
        color: '#6a7a6a',
        fontSize: '0.7rem',
        userSelect: 'none'
      }}>
        Seen by {message.readBy.length} {message.readBy.length === 1 ? 'person' : 'people'}
      </summary>
      <div style={{
        marginTop: '4px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px'
      }}>
        {message.readBy.map(userId => {
          const user = waveData.participants.find(p => p.id === userId);
          return user ? (
            <span
              key={userId}
              style={{
                padding: '2px 6px',
                background: '#0ead6920',
                border: '1px solid #0ead69',
                color: '#0ead69',
                fontSize: '0.65rem',
                fontFamily: 'monospace'
              }}
            >
              {user.name}
            </span>
          ) : null;
        })}
      </div>
    </details>
  </div>
)}
```

**3. Add "Mark All as Read" Button**

Add convenient button to mark entire wave as read:

```javascript
{/* Mark All Read Button */}
{unreadCount > 0 && (
  <button
    onClick={handleMarkAllRead}
    style={{
      padding: isMobile ? '8px 12px' : '6px 12px',
      background: 'transparent',
      border: '1px solid #ffd23f',
      color: '#ffd23f',
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: '0.75rem'
    }}
  >
    MARK ALL READ ({unreadCount})
  </button>
)}

// Handler function
const handleMarkAllRead = async () => {
  try {
    const unreadMessages = waveData.messages
      .filter(m => m.is_unread && m.author_id !== currentUser.id);

    // Mark all as read in parallel
    await Promise.all(
      unreadMessages.map(m =>
        fetchAPI(`/messages/${m.id}/read`, { method: 'POST' })
      )
    );

    await loadWave();
    onWaveUpdate?.();
    showToast(`Marked ${unreadMessages.length} messages as read`, 'success');
  } catch (err) {
    showToast('Failed to mark messages as read', 'error');
  }
};
```

### Estimated Time
**2-3 hours** (Frontend only: 2h, Testing: 1h)

---

## 4. Public REST API Documentation (MEDIUM PRIORITY) ⭐

### User Story
> As a developer, I want comprehensive API documentation so I can build third-party clients and integrations for Cortex.

### Current State
- API exists and is fully functional
- No formal documentation
- No API versioning
- No developer portal
- Endpoints work but are undocumented

### Implementation Details

#### Backend Changes (server/server.js)

**1. Add API Versioning Prefix**

Add backward-compatible versioning (~Line 990):

```javascript
// API versioning middleware
const API_VERSION = 'v1';

// Helper to create versioned routes
const versionedRoute = (path) => `/api/${API_VERSION}${path}`;

// Update all endpoints (maintain backward compatibility):
app.post(versionedRoute('/auth/register'), registerLimiter, (req, res) => { /* ... */ });
app.post('/api/auth/register', registerLimiter, (req, res) => { /* redirect to v1 */ });

// Or create aliases:
const createVersionedEndpoint = (method, path, ...handlers) => {
  app[method](versionedRoute(path), ...handlers);
  app[method](`/api${path}`, ...handlers); // backward compatibility
};

// Usage:
createVersionedEndpoint('post', '/auth/register', registerLimiter, (req, res) => { /* ... */ });
```

**2. Add API Metadata Endpoint**

```javascript
app.get('/api/v1/meta', (req, res) => {
  res.json({
    version: 'v1',
    serverVersion: '1.6.0',
    apiEndpoints: {
      auth: [
        'POST /api/v1/auth/register',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/logout'
      ],
      users: [
        'GET /api/v1/users/me',
        'PUT /api/v1/users/me',
        'POST /api/v1/users/me/password',
        'GET /api/v1/users/blocked',
        'POST /api/v1/users/:id/block',
        'DELETE /api/v1/users/:id/block'
      ],
      waves: [
        'GET /api/v1/waves',
        'POST /api/v1/waves',
        'GET /api/v1/waves/:id',
        'PUT /api/v1/waves/:id',
        'DELETE /api/v1/waves/:id'
      ],
      messages: [
        'GET /api/v1/waves/:id/messages',
        'POST /api/v1/messages',
        'PUT /api/v1/messages/:id',
        'DELETE /api/v1/messages/:id',
        'POST /api/v1/messages/:id/react',
        'POST /api/v1/messages/:id/read'
      ],
      search: [
        'GET /api/v1/search'
      ],
      gifs: [
        'GET /api/v1/gifs/search',
        'GET /api/v1/gifs/trending'
      ]
    },
    rateLimits: {
      auth: 'register: 3/hour, login: 5/15min',
      api: '100/min',
      gifSearch: '10/min'
    },
    authentication: 'JWT Bearer token in Authorization header'
  });
});
```

**3. Add OpenAPI/Swagger Spec (Optional)**

Create `/api/v1/openapi.json` endpoint serving OpenAPI 3.0 specification.

#### Frontend Changes

**1. Create API Documentation Page**

Create new static HTML file: `client/public/api-docs.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cortex API Documentation</title>
  <style>
    /* Firefly-themed styling similar to main app */
    body {
      background: #050805;
      color: #c5d5c5;
      font-family: 'Courier New', monospace;
      padding: 40px 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    h1, h2, h3 { color: #3bceac; }

    .endpoint {
      background: linear-gradient(135deg, #0d150d, #1a2a1a);
      border: 1px solid #2a3a2a;
      border-left: 3px solid #3bceac;
      padding: 20px;
      margin: 20px 0;
    }

    .method {
      display: inline-block;
      padding: 4px 12px;
      font-weight: bold;
      margin-right: 12px;
      border-radius: 4px;
    }

    .method.get { background: #0ead69; color: #000; }
    .method.post { background: #3bceac; color: #000; }
    .method.put { background: #ffd23f; color: #000; }
    .method.delete { background: #ff6b35; color: #000; }

    code {
      background: #0a100a;
      padding: 2px 6px;
      border: 1px solid #2a3a2a;
      color: #ffd23f;
    }

    pre {
      background: #0a100a;
      border: 1px solid #2a3a2a;
      padding: 16px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>🔷 Cortex API Documentation</h1>
  <p>Version: v1 | Server: v1.6.0</p>

  <h2>Authentication</h2>
  <p>All endpoints (except auth endpoints) require JWT authentication via Bearer token in the Authorization header:</p>
  <pre><code>Authorization: Bearer &lt;your-jwt-token&gt;</code></pre>

  <h3>Get JWT Token</h3>
  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/auth/login</code>

    <h4>Request Body:</h4>
    <pre>{
  "handle": "your_handle",
  "password": "your_password"
}</pre>

    <h4>Response:</h4>
    <pre>{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}</pre>
  </div>

  <h2>Waves</h2>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/api/v1/waves</code>

    <h4>Description:</h4>
    <p>Get all waves accessible to the authenticated user.</p>

    <h4>Query Parameters:</h4>
    <ul>
      <li><code>archived</code> (boolean) - Include archived waves</li>
    </ul>

    <h4>Response:</h4>
    <pre>[
  {
    "id": "wave-uuid",
    "title": "Wave Title",
    "privacy": "private",
    "participants": [...],
    "unread_count": 5,
    "last_message_at": "2025-12-04T10:00:00Z"
  }
]</pre>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/waves</code>

    <h4>Description:</h4>
    <p>Create a new wave.</p>

    <h4>Request Body:</h4>
    <pre>{
  "title": "Wave Title",
  "privacy": "private",
  "participants": ["user-id-1", "user-id-2"]
}</pre>
  </div>

  <h2>Messages</h2>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/api/v1/waves/:id/messages</code>

    <h4>Description:</h4>
    <p>Get all messages in a wave (threaded structure).</p>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/messages</code>

    <h4>Request Body:</h4>
    <pre>{
  "wave_id": "wave-uuid",
  "parent_id": null,
  "content": "Message text with &lt;b&gt;HTML&lt;/b&gt;"
}</pre>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/messages/:id/react</code>

    <h4>Request Body:</h4>
    <pre>{
  "emoji": "👍"
}</pre>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/messages/:id/read</code>

    <h4>Description:</h4>
    <p>Mark a message as read by the authenticated user.</p>
  </div>

  <h2>Search</h2>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/api/v1/search</code>

    <h4>Query Parameters:</h4>
    <ul>
      <li><code>q</code> (required) - Search query (min 2 characters)</li>
      <li><code>wave</code> (optional) - Filter by wave ID</li>
      <li><code>author</code> (optional) - Filter by author ID</li>
      <li><code>from</code> (optional) - From date (ISO 8601)</li>
      <li><code>to</code> (optional) - To date (ISO 8601)</li>
    </ul>

    <h4>Response:</h4>
    <pre>{
  "query": "search term",
  "count": 10,
  "results": [...]
}</pre>
  </div>

  <h2>Moderation</h2>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/users/:id/block</code>

    <h4>Description:</h4>
    <p>Block a user. Blocked users' messages will be hidden.</p>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span>
    <code>/api/v1/reports</code>

    <h4>Request Body:</h4>
    <pre>{
  "type": "message",
  "targetId": "message-uuid",
  "reason": "spam",
  "details": "Optional additional context"
}</pre>

    <h4>Valid types:</h4>
    <ul>
      <li><code>message</code></li>
      <li><code>wave</code></li>
      <li><code>user</code></li>
    </ul>

    <h4>Valid reasons:</h4>
    <ul>
      <li><code>spam</code></li>
      <li><code>harassment</code></li>
      <li><code>inappropriate</code></li>
      <li><code>other</code></li>
    </ul>
  </div>

  <h2>GIF Search</h2>

  <div class="endpoint">
    <span class="method get">GET</span>
    <code>/api/v1/gifs/search</code>

    <h4>Query Parameters:</h4>
    <ul>
      <li><code>q</code> (required) - Search query</li>
      <li><code>limit</code> (optional) - Results limit (max 50, default 20)</li>
      <li><code>offset</code> (optional) - Pagination offset</li>
    </ul>

    <h4>Rate Limit:</h4>
    <p>10 requests per minute</p>
  </div>

  <h2>WebSocket</h2>

  <p>Connect to WebSocket at <code>ws://localhost:3001</code> (or wss:// for production)</p>

  <h3>Authentication:</h3>
  <pre>{
  "type": "auth",
  "token": "your-jwt-token"
}</pre>

  <h3>Events Received:</h3>
  <ul>
    <li><code>auth_success</code> - Authentication successful</li>
    <li><code>new_message</code> - New message posted</li>
    <li><code>message_edited</code> - Message edited</li>
    <li><code>message_deleted</code> - Message deleted</li>
    <li><code>message_reacted</code> - Reaction added/removed</li>
    <li><code>user_typing</code> - User is typing</li>
    <li><code>wave_created</code> - New wave created</li>
    <li><code>wave_updated</code> - Wave modified</li>
  </ul>

  <h2>Rate Limits</h2>
  <ul>
    <li>Registration: 3 requests per hour</li>
    <li>Login: 5 requests per 15 minutes</li>
    <li>API endpoints: 100 requests per minute</li>
    <li>GIF search: 10 requests per minute</li>
  </ul>

  <h2>Error Responses</h2>
  <p>All errors return appropriate HTTP status codes with JSON body:</p>
  <pre>{
  "error": "Error message"
}</pre>

  <h2>Support</h2>
  <p>For questions or issues, please visit: <a href="https://github.com/jempson/cortex" style="color: #3bceac;">GitHub Repository</a></p>

  <footer style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #2a3a2a; color: #6a7a6a; text-align: center;">
    <p>Cortex API v1.6.0 | Privacy-First Federated Communication</p>
  </footer>
</body>
</html>
```

**2. Add Link to API Docs in Main App**

Add button in settings or footer:

```javascript
<a
  href="/api-docs.html"
  target="_blank"
  style={{
    color: '#3bceac',
    textDecoration: 'none',
    fontSize: '0.75rem'
  }}
>
  📚 API Documentation
</a>
```

**3. Add API Docs to README.md**

Update README with section:

```markdown
## API Documentation

Cortex provides a comprehensive REST API for building third-party clients and integrations.

- **Documentation**: See [API Docs](/api-docs.html) for complete reference
- **Version**: v1
- **Authentication**: JWT Bearer tokens
- **Base URL**: `http://localhost:3001/api/v1`
- **WebSocket**: `ws://localhost:3001`

### Quick Start

1. Register/Login to get JWT token
2. Include token in Authorization header: `Bearer <token>`
3. Make API requests
4. Connect to WebSocket for real-time updates

See full documentation for all endpoints, request/response formats, and examples.
```

### Estimated Time
**8-10 hours** (Backend versioning: 3h, Documentation page: 4-5h, Testing: 2h)

---

## Implementation Order

Recommended order based on dependencies and user impact:

### Week 1: Core Moderation & Visual Feedback
**Day 1-2:** Read Receipts Display (2-3h) - Quick win, builds on existing data
**Day 3-5:** Basic Moderation System (12-16h) - Critical for user safety

### Week 2: Content Discovery & Developer Experience
**Day 6-7:** GIF Search Integration (6-8h) - Popular feature, moderate complexity
**Day 8-10:** Public REST API Documentation (8-10h) - Important for ecosystem

**Total:** 28-37 hours across ~10 days

---

## Testing Checklist

### For Each Feature
- [ ] Functionality works in single-user scenario
- [ ] Multi-user testing (real-time updates via WebSocket)
- [ ] Mobile UI is touch-friendly and responsive
- [ ] Error handling for network failures
- [ ] Input sanitization and validation
- [ ] No memory leaks or performance issues

### Read Receipts Display
- [ ] Participant list shows correct read status
- [ ] Green checkmarks for users who read latest message
- [ ] Updates in real-time when users mark as read
- [ ] "Mark all read" button works correctly
- [ ] Individual message read receipts expand/collapse
- [ ] Works with old messages (backward compatible)

### Basic Moderation
- [ ] Block user hides their messages
- [ ] Unblock user restores visibility
- [ ] Mute user hides messages silently
- [ ] Blocked users can't add you to waves
- [ ] Report submission works for messages/waves/users
- [ ] Admin dashboard shows all reports
- [ ] Admin can resolve/dismiss reports
- [ ] Filtering by status works (pending/resolved/dismissed)
- [ ] Report context displays correctly
- [ ] Settings page shows blocked/muted users

### GIF Search
- [ ] Trending GIFs load on modal open
- [ ] Search debounces correctly (500ms)
- [ ] Grid layout responsive on mobile/desktop
- [ ] Click GIF inserts URL into message
- [ ] GIF preview shows on hover
- [ ] Rate limiting works (10/min)
- [ ] API key validation works
- [ ] Error handling for API failures

### API Documentation
- [ ] Documentation page loads and renders correctly
- [ ] All endpoints documented with examples
- [ ] Code samples are accurate
- [ ] WebSocket events documented
- [ ] Rate limits clearly stated
- [ ] Authentication instructions clear
- [ ] API versioning works (/api/v1/...)
- [ ] Backward compatibility maintained
- [ ] Meta endpoint returns correct info

---

## Documentation Updates

### Files to Update
- [ ] README.md - Add v1.6.0 section with all features
- [ ] CHANGELOG.md - Comprehensive v1.6.0 entry
- [ ] CLAUDE.md - Update with new patterns (moderation, GIFs, API docs)
- [ ] OUTSTANDING-FEATURES.md - Mark completed features
- [ ] client/CortexApp.jsx - Update version to v1.6.0
- [ ] server/server.js - Update version banner to v1.6.0
- [ ] client/package.json - Version 1.6.0
- [ ] server/package.json - Version 1.6.0

### New Files
- [ ] client/public/api-docs.html - API documentation page
- [ ] server/data/reports.json - Reports database file (auto-created)

---

## Success Criteria

v1.6.0 is ready when:
- ✅ All 4 features implemented and working
- ✅ No breaking changes or regressions
- ✅ Build successful (bundle size < 70 KB gzipped)
- ✅ All tests passing
- ✅ Documentation complete
- ✅ API documentation published
- ✅ Git tag created: v1.6.0
- ✅ Pushed to master

---

## Risk Assessment

### Low Risk
- Read Receipts Display (uses existing data, UI only)
- API Documentation (organizational work, no code changes)

### Medium Risk
- GIF Search Integration (external API dependency)
- Basic Moderation (database changes, filtering logic)

### Mitigations
- GIF Search: Graceful degradation if API unavailable, rate limiting
- Moderation: Extensive testing of message filtering, backward compatibility
- Test with 100+ messages and multiple blocked users
- Verify no performance degradation with filtering

---

## Environment Variables

New variables required for v1.6.0:

```bash
# GIF Search (required for GIF feature)
GIPHY_API_KEY=your_giphy_api_key_here
```

Get free API key from: https://developers.giphy.com/

---

## Database Schema Changes

### New Files
- `server/data/reports.json` - User reports (auto-created)

### Updated User Schema
```javascript
{
  users: [],
  blocks: [
    { id, userId, blockedUserId, blockedAt }
  ],
  mutes: [
    { id, userId, mutedUserId, mutedAt }
  ]
}
```

### Reports Schema
```javascript
{
  reports: [
    {
      id: "uuid",
      reporterId: "user-id",
      type: "message|wave|user",
      targetId: "target-id",
      reason: "spam|harassment|inappropriate|other",
      details: "string",
      status: "pending|resolved|dismissed",
      createdAt: "ISO 8601",
      resolvedAt: "ISO 8601",
      resolvedBy: "user-id",
      resolution: "delete_content|warn_user|dismiss"
    }
  ]
}
```

---

*Plan Created: December 4, 2025*
*Ready to Begin Implementation*
