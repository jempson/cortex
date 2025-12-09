# Cortex v1.4.0 - Implementation Plan

## ✅ RELEASE STATUS: COMPLETED

**Released:** December 4, 2025
**All Features Implemented:** 2/2 ✓
**Build Status:** Passing
**Documentation:** Complete

### Completed Features
1. ✅ **Per-Message Read Tracking** - HIGH PRIORITY
2. ✅ **Scroll Position Preservation** - HIGH PRIORITY

---

## Overview

Version 1.4.0 addresses critical UX issues discovered during production use of v1.3.3. This release focused on granular message read tracking and solving disruptive scroll jumping in long waves.

**Release Type:** User Experience Improvements
**Timeline:** Same-day implementation (December 4, 2025)
**Focus Areas:** Read tracking granularity, scroll position management

---

## 1. Per-Message Read Tracking (HIGH PRIORITY) ⭐

### Problem Statement

**Reported By:** User feedback during v1.3.3 usage
**Priority:** High

In v1.3.3, all messages in a wave were marked as read when the wave was opened, even if messages weren't visible on screen. In waves with 100+ messages, this meant scrolling down would incorrectly mark unseen messages as read.

### User Story

> As a user reading a long wave, I want messages to be marked as read only when I explicitly view them, so that I don't lose track of which messages I've actually read.

### Solution

Implemented click-to-read pattern where users must explicitly click on each unread message to mark it as read.

### Implementation Details

#### Backend Changes (server/server.js)

**1. Message Schema Enhancement**
- Added `readBy: [userId, ...]` array to message schema (Line 859)
- Author automatically added to `readBy` on message creation
- Backward compatible: old messages get `readBy` initialized on first access

**2. Database Method**
```javascript
markMessageAsRead(messageId, userId) {
  const message = this.messages.messages.find(m => m.id === messageId);
  if (!message) return false;

  // Initialize readBy array if it doesn't exist (for old messages)
  if (!message.readBy) {
    message.readBy = [message.authorId];
  }

  // Add user to readBy if not already there
  if (!message.readBy.includes(userId)) {
    message.readBy.push(userId);
    this.saveMessages();
  }

  return true;
}
```
*(Lines 963-979)*

**3. Unread Count Calculation**
Changed from timestamp-based to array-based filtering:
```javascript
// OLD (v1.3.3 and earlier)
unreadCount = messages.filter(m =>
  m.created_at > participant.lastRead
).length;

// NEW (v1.4.0)
unreadCount = messages.filter(m => {
  if (m.waveId !== wave.id) return false;
  if (m.authorId === userId) return false;
  const readBy = m.readBy || [m.authorId];
  return !readBy.includes(userId);
}).length;
```
*(Lines 654-661)*

**4. API Endpoint**
```javascript
app.post('/api/messages/:id/read', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);

  if (!db.markMessageAsRead(messageId, req.user.userId)) {
    return res.status(404).json({ error: 'Message not found' });
  }

  res.json({ success: true });
});
```
*(Lines 1580-1593)*

**5. Enhanced getMessagesForWave()**
Now returns `is_unread` flag per message:
```javascript
getMessagesForWave(waveId, userId = null) {
  return this.messages.messages
    .filter(m => m.waveId === waveId)
    .map(m => {
      const readBy = m.readBy || [m.authorId];
      const isUnread = userId ? !readBy.includes(userId) && m.authorId !== userId : false;

      return {
        ...m,
        is_unread: isUnread,
        // ... other fields
      };
    });
}
```
*(Lines 822-844)*

#### Frontend Changes (client/CortexApp.jsx)

**1. ThreadedMessage Component Enhancement**
- Added `onMessageClick` prop (Line 441)
- Added `isUnread` state detection (Line 453)
- Visual indicators for unread messages:
  - Amber border: `#ffd23f` (3px solid left border)
  - Subtle amber background: `#ffd23f10`
  - Pointer cursor for clickability
  - Hover effect: brightens to `#ffd23f20`

```javascript
const isUnread = message.is_unread && message.author_id !== currentUserId;

const handleMessageClick = () => {
  if (isUnread && onMessageClick) {
    onMessageClick(message.id);
  }
};

// Styling
style={{
  background: isUnread ? '#ffd23f10' : 'linear-gradient(135deg, #0d150d, #1a2a1a)',
  border: `1px solid ${isUnread ? '#ffd23f' : '#2a3a2a'}`,
  borderLeft: `3px solid ${isUnread ? '#ffd23f' : config.color}`,
  cursor: isUnread ? 'pointer' : 'default',
}}
```
*(Lines 453, 459-488)*

**2. WaveView Click Handler**
```javascript
const handleMessageClick = async (messageId) => {
  try {
    await fetchAPI(`/messages/${messageId}/read`, { method: 'POST' });
    await loadWave();  // Reload to update unread status
    onWaveUpdate?.();  // Refresh wave list unread counts
  } catch (err) {
    showToast('Failed to mark message as read', 'error');
  }
};
```
*(Lines 1179-1197)*

**3. Passed handler recursively**
Ensured `onMessageClick` is passed to all child messages in thread:
```javascript
<ThreadedMessage
  key={child.id}
  message={child}
  // ... other props
  onMessageClick={onMessageClick}  // Added
/>
```
*(Line 692)*

### Results

- **User Control:** Users explicitly control what they've read
- **Accurate Counts:** Unread counts reflect actual unread messages
- **Visual Clarity:** Clear visual distinction for unread messages
- **No Breaking Changes:** Backward compatible with old messages

---

## 2. Scroll Position Preservation (HIGH PRIORITY) ⭐

### Problem Statement

**Reported By:** User feedback during v1.4.0 testing
**Priority:** High

When clicking an unread message to mark it as read, or when replying to a message, the wave would reload and the view would jump to the top or bottom, causing disorientation in long waves.

### User Story

> As a user clicking an unread message in a 100+ message wave, I want to stay at my current scroll position so I don't lose my place in the conversation.

### Solution

Implemented scroll position preservation that saves scroll position before reloading and restores it after data updates.

### Implementation Details

#### Frontend Changes (client/CortexApp.jsx)

**1. Scroll Position Ref**
```javascript
const scrollPositionToRestore = useRef(null);
```
*(Line 935)*

**2. Restoration useEffect**
```javascript
useEffect(() => {
  if (scrollPositionToRestore.current !== null && messagesRef.current) {
    setTimeout(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = scrollPositionToRestore.current;
        scrollPositionToRestore.current = null;
      }
    }, 0);
  }
}, [waveData]);
```
*(Lines 942-952)*

**3. Enhanced handleMessageClick**
```javascript
const handleMessageClick = async (messageId) => {
  try {
    // Save current scroll position before reloading
    if (messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    await fetchAPI(`/messages/${messageId}/read`, { method: 'POST' });
    await loadWave();  // Position restored by useEffect
    onWaveUpdate?.();
  } catch (err) {
    showToast('Failed to mark message as read', 'error');
    scrollPositionToRestore.current = null;  // Clear on error
  }
};
```
*(Lines 1179-1197)*

**4. Smart Reply Scrolling**
```javascript
const handleSendMessage = async () => {
  if (!newMessage.trim()) return;
  const isReply = replyingTo !== null;

  try {
    // Save scroll position if replying
    if (isReply && messagesRef.current) {
      scrollPositionToRestore.current = messagesRef.current.scrollTop;
    }

    await fetchAPI('/messages', {
      method: 'POST',
      body: { wave_id: wave.id, parent_id: replyingTo?.id || null, content: newMessage },
    });

    setNewMessage('');
    setReplyingTo(null);
    await loadWave();

    // Only scroll to bottom if posting a root message (not a reply)
    if (!isReply) {
      setTimeout(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 100);
    }
    // If it was a reply, scroll position restored by useEffect
  } catch (err) {
    showToast('Failed to send message', 'error');
    scrollPositionToRestore.current = null;
  }
};
```
*(Lines 1068-1099)*

### Behavior

| Action | Scroll Behavior | Reason |
|--------|----------------|---------|
| Click unread message | Preserve position | User is reading in place |
| Reply to message | Preserve position | Reply appears near parent |
| Send root message | Scroll to bottom | Show new message at end |
| Switch waves | Reset to top | New context |

### Results

- **No Jumping:** Clicking messages or replying doesn't disrupt scroll
- **Context Maintained:** Users stay oriented in long waves
- **Smart Scrolling:** Root messages still show at bottom
- **Smooth UX:** 0-delay setTimeout ensures DOM updates before restoration

---

## Technical Details

### Bundle Size
- **Gzipped:** 61.60 KB (increase from 61.10 KB in v1.3.3)
- **Uncompressed:** 213.43 KB
- **Build Time:** ~587ms

### Performance
- No breaking changes
- Backward compatible with old messages
- Optimized reloads with scroll preservation
- Smooth 0.2s transitions for visual feedback

### Code Quality
- All syntax checks passing
- Build successful without warnings
- Clean implementation following existing patterns
- Enhanced logging for debugging

---

## Migration Notes

### No Migration Required
- Backward compatible
- Old messages auto-initialize `readBy` arrays on first access
- Existing `lastRead` timestamps remain but unused for unread counts
- No database schema changes needed

### Deployment
1. Deploy server.js with new endpoint
2. Deploy client with updated components
3. No data migration script needed
4. Existing data works immediately

---

## Testing Performed

### Manual Testing
- ✅ Click unread messages in waves with 100+ messages
- ✅ Scroll position preserved after marking read
- ✅ Reply to messages at top of long wave
- ✅ Scroll position preserved after sending reply
- ✅ Root messages still scroll to bottom
- ✅ Unread counts update correctly
- ✅ Visual indicators display correctly
- ✅ Mobile touch targets work
- ✅ Hover effects work on desktop

### Edge Cases Tested
- ✅ Old messages without `readBy` arrays
- ✅ Error handling when API fails
- ✅ Multiple rapid clicks on messages
- ✅ Scroll position at very top/bottom
- ✅ Switching between waves

---

## Documentation

### Updated Files
- ✅ README.md - Added v1.4.0 section
- ✅ CHANGELOG.md - Comprehensive v1.4.0 entry
- ✅ CLAUDE.md - Updated data model and patterns
- ✅ CortexApp.jsx - Version display updated to v1.4.0
- ✅ server.js - Startup banner updated to v1.4.0

---

## Future Enhancements

Features identified but not implemented in v1.4.0:

### Read Receipts Display
Building on v1.4.0's `readBy` arrays, add visual display of who has read each message or wave. See `OUTSTANDING-FEATURES.md` for details.

### Bulk Read Operations
Add "Mark all as read" button for waves with many unread messages.

### Read Status Sync
When user reads messages on one device, sync read status to other devices via WebSocket.

---

## Success Criteria

All criteria met for v1.4.0 release:

- ✅ Per-message read tracking working in production
- ✅ Scroll position preserved for all interactions
- ✅ No breaking changes or regressions
- ✅ Build successful (61.60 KB gzipped)
- ✅ Documentation complete
- ✅ Git tag created: v1.4.0
- ✅ Pushed to GitHub

---

## Lessons Learned

### What Went Well
- Quick iteration based on user feedback
- Minimal code changes for maximum UX impact
- Backward compatibility maintained throughout
- Clear visual indicators improve usability

### Improvements for Next Time
- Consider scroll preservation earlier in design
- Add telemetry to measure feature usage
- Plan read status sync for multi-device users

---

*Status Report Generated: December 4, 2025*
*Released: December 4, 2025*
*Next: See OUTSTANDING-FEATURES.md for v1.5.0 planning*
