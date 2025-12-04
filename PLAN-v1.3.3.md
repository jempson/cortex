# Cortex v1.3.3 - Implementation Plan

## ✅ RELEASE STATUS: COMPLETED

**Released:** December 4, 2025
**All Features Implemented:** 4/4 ✓
**Build Status:** Passing
**Documentation:** Complete

### Completed Features
1. ✅ **Message Editing & Deletion UI** - HIGH PRIORITY
2. ✅ **Wave Activation & Click Target Improvements** - MEDIUM PRIORITY
3. ✅ **Collapsible Playback Bar** - LOW PRIORITY
4. ✅ **Auto-Focus Input on Reply** - MEDIUM PRIORITY

### Deferred to v1.4
- 🔮 **GIF Search Integration** - Requires external API setup

---

## Overview
This document outlines the implementation plan for version 1.3.3, focusing on polish, quick wins, and completing infrastructure started in v1.3.2. This release emphasizes user-requested features that leverage existing backend capabilities.

**Release Type:** Polish & Quick Wins
**Actual Timeline:** Same day implementation
**Focus Areas:** Message management, UX refinements, playback controls

---

## 1. Message Editing & Deletion UI (HIGH PRIORITY) ⭐

### Current State
- ✅ **Backend FULLY implemented**:
  - `PUT /api/messages/:id` - Edit message endpoint (server.js:1485)
  - `DELETE /api/messages/:id` - Delete message endpoint (server.js:1499)
  - Authorization: Only message author can edit/delete
  - Edit history tracking in `messages.history[]`
  - WebSocket broadcasts: `message_edited`, `message_deleted`
  - Content validation and sanitization
- ❌ **Frontend MISSING**:
  - No edit button on messages
  - No delete button on messages
  - No inline edit form
  - No edit history viewer
  - Partial WebSocket event handling

### User Story
**Requested By:** Jared Empson
**Priority:** High

> As a message author, I want to edit my messages to correct spelling and formatting mistakes, so that I can maintain clear communication without sending corrections as new messages.

### Required Changes

#### Client Side (`client/CortexApp.jsx`)

**1. Add State Management for Editing** (Lines ~850-900, in WaveView component)

```javascript
// Add to WaveView component state
const [editingMessageId, setEditingMessageId] = useState(null);
const [editContent, setEditContent] = useState('');
const [showEditHistory, setShowEditHistory] = useState(null);
```

**2. Add Message Action Buttons** (In MessageItem render, around line 450)

Add edit/delete buttons for message authors:

```javascript
// After message content display, add action buttons
{message.is_author && (
  <div style={{
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    padding: '4px 0',
    borderTop: '1px solid #2a3a2a',
    paddingTop: '8px'
  }}>
    <button
      onClick={() => handleStartEdit(message)}
      disabled={editingMessageId !== null}
      style={{
        padding: isMobile ? '8px 12px' : '6px 10px',
        minHeight: '44px',
        background: 'transparent',
        border: '1px solid #3bceac40',
        color: '#3bceac',
        cursor: editingMessageId !== null ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        opacity: editingMessageId !== null ? 0.5 : 1
      }}
    >
      ✏️ <span>EDIT</span>
    </button>

    <button
      onClick={() => handleDeleteMessage(message)}
      disabled={editingMessageId !== null}
      style={{
        padding: isMobile ? '8px 12px' : '6px 10px',
        minHeight: '44px',
        background: 'transparent',
        border: '1px solid #ff6b3540',
        color: '#ff6b35',
        cursor: editingMessageId !== null ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        opacity: editingMessageId !== null ? 0.5 : 1
      }}
    >
      🗑️ <span>DELETE</span>
    </button>

    {message.version > 1 && (
      <button
        onClick={() => setShowEditHistory(message.id)}
        style={{
          padding: isMobile ? '8px 12px' : '6px 10px',
          minHeight: '44px',
          background: 'transparent',
          border: '1px solid #6a7a6a40',
          color: '#6a7a6a',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        📜 <span>HISTORY</span>
      </button>
    )}
  </div>
)}
```

**3. Add Inline Edit Form** (Replace message content when editing)

Replace message content display with edit form when in edit mode:

```javascript
// In message content area (around line 463)
{editingMessageId === message.id ? (
  // EDIT MODE
  <div style={{ marginTop: '12px' }}>
    <textarea
      ref={editTextareaRef}
      value={editContent}
      onChange={(e) => setEditContent(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && e.ctrlKey) {
          e.preventDefault();
          handleSaveEdit(message.id);
        }
        if (e.key === 'Escape') {
          handleCancelEdit();
        }
      }}
      placeholder="Edit your message... (Shift+Enter for new line)"
      style={{
        width: '100%',
        minHeight: '80px',
        maxHeight: '300px',
        padding: '12px',
        background: '#0a100a',
        border: '2px solid #3bceac',
        color: '#c5d5c5',
        fontSize: '0.9rem',
        fontFamily: 'inherit',
        resize: 'vertical',
        boxSizing: 'border-box'
      }}
    />

    <div style={{
      display: 'flex',
      gap: '8px',
      marginTop: '8px',
      justifyContent: 'flex-end',
      flexWrap: 'wrap'
    }}>
      <button
        onClick={() => handleSaveEdit(message.id)}
        disabled={!editContent.trim() || editContent === message.content}
        style={{
          padding: isMobile ? '10px 16px' : '8px 14px',
          minHeight: '44px',
          background: editContent.trim() && editContent !== message.content ? '#3bceac20' : 'transparent',
          border: '1px solid #3bceac',
          color: '#3bceac',
          cursor: editContent.trim() && editContent !== message.content ? 'pointer' : 'not-allowed',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          opacity: editContent.trim() && editContent !== message.content ? 1 : 0.5
        }}
      >
        💾 SAVE (Ctrl+Enter)
      </button>

      <button
        onClick={handleCancelEdit}
        style={{
          padding: isMobile ? '10px 16px' : '8px 14px',
          minHeight: '44px',
          background: 'transparent',
          border: '1px solid #6a7a6a',
          color: '#6a7a6a',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.8rem'
        }}
      >
        ❌ CANCEL (Esc)
      </button>
    </div>

    <div style={{
      fontSize: '0.7rem',
      color: '#6a7a6a',
      marginTop: '8px',
      fontStyle: 'italic'
    }}>
      💡 Tip: Supports emojis, multi-line text, and image URLs
    </div>
  </div>
) : (
  // NORMAL DISPLAY MODE
  <>
    <div
      style={{
        color: '#9bab9b',
        fontSize: isMobile ? '0.8rem' : '0.85rem',
        lineHeight: 1.6,
        marginBottom: '10px',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap'
      }}
      dangerouslySetInnerHTML={{ __html: message.content }}
    />

    {/* Show edited indicator */}
    {message.editedAt && (
      <div style={{
        fontSize: '0.7rem',
        color: '#6a7a6a',
        fontStyle: 'italic',
        marginTop: '4px'
      }}>
        ✏️ Edited {new Date(message.editedAt).toLocaleString()}
      </div>
    )}
  </>
)}
```

**4. Add Handler Functions** (In WaveView component)

```javascript
// Edit handlers
const editTextareaRef = useRef(null);

const handleStartEdit = (message) => {
  setEditingMessageId(message.id);
  setEditContent(message.content);
  // Focus textarea after render
  setTimeout(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.focus();
      // Move cursor to end
      editTextareaRef.current.selectionStart = editTextareaRef.current.value.length;
      editTextareaRef.current.selectionEnd = editTextareaRef.current.value.length;
    }
  }, 100);
};

const handleCancelEdit = () => {
  setEditingMessageId(null);
  setEditContent('');
};

const handleSaveEdit = async (messageId) => {
  if (!editContent.trim()) {
    showToast('Message cannot be empty', 'error');
    return;
  }

  if (editContent === messages.find(m => m.id === messageId)?.content) {
    // No changes made
    handleCancelEdit();
    return;
  }

  try {
    const updated = await fetchAPI(`/messages/${messageId}`, {
      method: 'PUT',
      body: { content: editContent }
    });

    // Update local state
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, ...updated } : m
    ));

    setEditingMessageId(null);
    setEditContent('');
    showToast('Message updated successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update message', 'error');
  }
};

const handleDeleteMessage = async (message) => {
  // Confirmation dialog
  const confirmMsg = `Delete this message?\n\n"${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}"\n\nThis action cannot be undone.`;

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    await fetchAPI(`/messages/${message.id}`, {
      method: 'DELETE'
    });

    // Remove from local state
    setMessages(prev => prev.filter(m => m.id !== message.id));

    showToast('Message deleted', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to delete message', 'error');
  }
};
```

**5. Update WebSocket Handler** (In handleWebSocketMessage, around line 2162)

Enhance existing WebSocket event handling:

```javascript
// In handleWebSocketMessage callback
const handleWebSocketMessage = useCallback((data) => {
  // ... existing handlers ...

  // Enhanced message_edited handler
  if (data.type === 'message_edited') {
    // Update message in current wave view
    if (selectedWave?.id === data.data.waveId) {
      setMessages(prev => prev.map(m =>
        m.id === data.data.id ? {
          ...m,
          content: data.data.content,
          editedAt: data.data.edited_at,
          version: data.data.version
        } : m
      ));
    }

    // Show toast if not the editor
    if (data.data.authorId !== user?.id) {
      showToast(`Message edited by ${data.data.author_name}`, 'info');
    }
  }

  // Enhanced message_deleted handler
  if (data.type === 'message_deleted') {
    // Remove message from current wave view
    if (selectedWave?.id === data.waveId) {
      setMessages(prev => prev.filter(m => m.id !== data.messageId));
    }

    // Cancel edit if this message was being edited
    if (editingMessageId === data.messageId) {
      handleCancelEdit();
    }

    // Show toast if not the deleter
    if (data.deletedBy !== user?.id) {
      showToast('A message was deleted', 'info');
    }
  }

  // ... existing handlers ...
}, [selectedWave, user, editingMessageId, handleCancelEdit]);
```

**6. Add Edit History Viewer Modal** (Optional - Phase 2)

Create a modal component to show edit history:

```javascript
const EditHistoryModal = ({ messageId, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await fetchAPI(`/messages/${messageId}/history`);
        setHistory(data);
      } catch (err) {
        showToast('Failed to load edit history', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [messageId]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', display: 'flex',
      justifyContent: 'center', alignItems: 'center',
      zIndex: 1000, padding: '20px'
    }}>
      <div style={{
        background: '#0d150d', border: '2px solid #3bceac',
        padding: '24px', maxWidth: '600px', width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
        borderRadius: '4px'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px'
        }}>
          <h3 style={{ color: '#3bceac', margin: 0, fontSize: '1.1rem' }}>
            📜 Edit History
          </h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #6a7a6a',
            color: '#6a7a6a', cursor: 'pointer', padding: '6px 12px',
            fontFamily: 'monospace', fontSize: '0.8rem'
          }}>✕ CLOSE</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#6a7a6a', padding: '40px' }}>
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6a7a6a', padding: '40px' }}>
            No edit history available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {history.map((entry, index) => (
              <div key={index} style={{
                padding: '12px',
                background: '#0a100a',
                border: '1px solid #2a3a2a',
                borderRadius: '2px'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginBottom: '8px', fontSize: '0.75rem', color: '#6a7a6a'
                }}>
                  <span>Version {entry.version}</span>
                  <span>{new Date(entry.edited_at).toLocaleString()}</span>
                </div>
                <div style={{
                  color: '#9bab9b', fontSize: '0.85rem',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap'
                }}
                  dangerouslySetInnerHTML={{ __html: entry.content }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Add to WaveView render, conditionally show modal
{showEditHistory && (
  <EditHistoryModal
    messageId={showEditHistory}
    onClose={() => setShowEditHistory(null)}
  />
)}
```

### Server Side Changes

**No server changes required** - all endpoints already exist and functional!

**Existing Server Endpoints:**
- `PUT /api/messages/:id` - Edit message (server.js:1485)
- `DELETE /api/messages/:id` - Delete message (server.js:1499)
- `GET /api/messages/:id/history` - Get edit history (server.js:1277)

**Existing Database Methods:**
- `updateMessage(messageId, content)` - Updates message and saves history (server.js:871)
- `deleteMessage(messageId, userId)` - Deletes message (server.js:907)

**Existing WebSocket Events:**
- `message_edited` - Broadcast when message edited (server.js:1495)
- `message_deleted` - Broadcast when message deleted (server.js:1512)

### UI/UX Considerations

**Edit Mode Indicators:**
- Only one message can be edited at a time
- Other edit/delete buttons disabled during edit
- Clear visual distinction (border color) when editing
- Keyboard shortcuts (Ctrl+Enter to save, Esc to cancel)

**Confirmation Dialogs:**
- Delete requires confirmation with message preview
- Warn if navigating away during edit (optional)

**Mobile Optimizations:**
- Touch-friendly button sizes (44px minimum)
- Larger textarea for editing on mobile
- Simplified button labels on small screens

**Accessibility:**
- Focus management (auto-focus textarea on edit start)
- Keyboard navigation (Tab, Enter, Esc)
- Screen reader labels for buttons
- Clear error messages

### Testing Checklist

#### Functional Tests
- [ ] Edit own message - content updates locally and broadcasts
- [ ] Edit with plain text
- [ ] Edit with multi-line content (Shift+Enter preserved)
- [ ] Edit with emojis (from picker)
- [ ] Edit with image URLs (auto-embedding works)
- [ ] Edit with mixed content (text + images + emojis)
- [ ] Save with no changes - cancels edit mode
- [ ] Save with empty content - shows error
- [ ] Cancel edit - restores original content
- [ ] Cannot edit other users' messages (no buttons shown)
- [ ] Delete own message - removed locally and broadcasts
- [ ] Delete confirmation shows message preview
- [ ] Cannot delete other users' messages (no buttons shown)
- [ ] "Edited" indicator shows timestamp correctly
- [ ] Edit history button shows for edited messages (version > 1)

#### WebSocket Tests
- [ ] User A edits message, User B sees update in real-time
- [ ] User A deletes message, User B sees removal in real-time
- [ ] Toast notifications show for remote edits/deletes
- [ ] No toast for own edits/deletes
- [ ] Message updates preserve threading structure
- [ ] Edit during slow network - handles gracefully

#### Edge Cases
- [ ] Edit message while reply is being composed
- [ ] Delete message that has replies (should work)
- [ ] Edit message in archived wave
- [ ] Network error during save - shows error, keeps edit mode
- [ ] Network error during delete - shows error, keeps message
- [ ] Concurrent edits (User A edits, User B edits same message)
- [ ] Very long message (>10000 chars) - validation error
- [ ] Special characters and HTML entities

#### Mobile Tests
- [ ] Touch edit button - enters edit mode
- [ ] Touch delete button - shows confirmation
- [ ] Textarea expands properly on mobile keyboard
- [ ] Buttons are easy to tap (44px minimum)
- [ ] Keyboard shortcuts work on mobile (if supported)
- [ ] Cancel button accessible when keyboard open

#### Performance Tests
- [ ] Edit/delete in wave with 100+ messages
- [ ] Rapid edit/cancel cycles - no memory leaks
- [ ] Multiple users editing different messages
- [ ] History modal with many edits loads quickly

### Estimated Complexity

**Total Implementation Time:** 8-12 hours

**Breakdown:**
- State management and handlers: 2 hours
- Action buttons UI: 1 hour
- Inline edit form: 2 hours
- WebSocket integration: 2 hours
- Edit indicator and polish: 1 hour
- Testing and bug fixes: 2-4 hours
- **Optional Edit History Modal:** +2-3 hours (can defer to Phase 2)

---

## 2. Wave Activation & Click Target Improvements (MEDIUM PRIORITY)

### Current State
- ✅ **Wave selection WORKS**:
  - Wave list items are clickable (CortexApp.jsx:392)
  - `onClick={() => onSelectWave(wave)}` activates wave
  - Clicking anywhere on wave item opens it
- ⚠️ **UX Issues**:
  - No hover feedback to indicate clickability
  - GIFs use lazy loading (`loading: 'lazy'`) - don't load until visible
  - No visual indication that wave item is interactive
  - Touch feedback on mobile could be improved
  - No message preview in wave list

### User Story
**Requested By:** Jared Empson
**Priority:** Medium

> As a user, I want to click anywhere on a wave to open it without having to click a specific "Reply" button, so that I can view content (especially GIFs and media) more intuitively.

**Current Problem:** GIFs and media don't load/play until the wave is activated. User may not realize the entire wave item is clickable.

### Required Changes

#### Client Side (`client/CortexApp.jsx`)

**1. Add Hover States to Wave Items** (WaveList component, line 392)

Enhance wave item with clear hover feedback:

```javascript
// In WaveList component, update wave item
<div
  key={wave.id}
  onClick={() => onSelectWave(wave)}
  onMouseEnter={(e) => {
    if (!isSelected) {
      e.currentTarget.style.background = '#1a2a1a';
      e.currentTarget.style.borderLeftWidth = '3px';
      e.currentTarget.style.borderLeftColor = config.color + '40';
    }
  }}
  onMouseLeave={(e) => {
    if (!isSelected) {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.borderLeftColor = 'transparent';
    }
  }}
  onTouchStart={(e) => {
    // Mobile touch feedback
    if (!isSelected) {
      e.currentTarget.style.background = '#1a2a1a';
    }
  }}
  onTouchEnd={(e) => {
    if (!isSelected) {
      setTimeout(() => {
        e.currentTarget.style.background = 'transparent';
      }, 150);
    }
  }}
  style={{
    padding: '12px 16px',
    cursor: 'pointer',
    background: isSelected ? '#ffd23f10' : 'transparent',
    borderBottom: '1px solid #1a2a1a',
    borderLeft: `3px solid ${isSelected ? config.color : 'transparent'}`,
    transition: 'all 0.2s ease',  // Smooth transitions
    position: 'relative',
  }}>
  {/* Wave content */}
</div>
```

**2. Change GIF Loading Strategy** (server/server.js, line 131)

Update image transformation to eager-load GIFs:

```javascript
// In detectAndEmbedMedia, update img transform
'img': (tagName, attribs) => {
  const isGif = attribs.src?.match(/\.gif(\?|$)/i);
  return {
    tagName: 'img',
    attribs: {
      ...attribs,
      style: 'max-width: 100%; height: auto;',
      loading: isGif ? 'eager' : 'lazy',  // GIFs eager, others lazy
      class: 'message-media'
    }
  };
}
```

**3. Add Message Preview in Wave List** (Optional, enhances UX)

Show last message preview with media indicator:

```javascript
// In WaveList, after the existing metadata line
<div style={{ color: '#5a6a5a', fontSize: isMobile ? '0.85rem' : '0.7rem' }}>
  @{wave.creator_handle || 'unknown'} • {wave.message_count} msgs
  {wave.group_name && <span> • {wave.group_name}</span>}
</div>

{/* ADD: Last message preview */}
{wave.last_message_preview && (
  <div style={{
    color: '#6a7a6a',
    fontSize: '0.7rem',
    marginTop: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  }}>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {wave.last_message_preview}
    </span>
    {wave.has_media && (
      <span style={{ flexShrink: 0, fontSize: '0.9rem' }}>🖼️</span>
    )}
  </div>
)}
```

**4. Add Visual Click Indicator** (Optional enhancement)

Add a subtle "click to open" hint on hover:

```javascript
// Add after wave content, shows on hover
{!isSelected && (
  <div style={{
    position: 'absolute',
    top: '50%',
    right: '12px',
    transform: 'translateY(-50%)',
    opacity: 0,
    transition: 'opacity 0.2s',
    color: config.color,
    fontSize: '1.2rem',
    pointerEvents: 'none',
    className: 'wave-open-hint'
  }}>
    →
  </div>
)}

// Add hover effect with CSS or inline
// On hover, set opacity to 0.6
```

#### Server Side Changes (Optional)

**1. Add last_message_preview to Wave API Response** (server/server.js)

Update wave response to include preview:

```javascript
// In getWaves or similar function
waves: this.waves.waves.map(wave => {
  const participants = this.getWaveParticipants(wave.id);
  const participant = participants.find(p => p.userId === userId);
  const messages = this.messages.messages.filter(m => m.waveId === wave.id);
  const lastMessage = messages.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  )[0];

  return {
    ...wave,
    is_archived: participant?.archived || false,
    message_count: messages.length,
    // ADD: Last message preview
    last_message_preview: lastMessage ?
      lastMessage.content.replace(/<[^>]*>/g, '').substring(0, 100) : null,
    has_media: lastMessage ? /<img/i.test(lastMessage.content) : false,
  };
})
```

### UI/UX Considerations

**Visual Feedback:**
- Hover state with background color change
- Border color hint on hover
- Smooth transitions (0.2s)
- Touch feedback for mobile

**Accessibility:**
- Clear cursor: pointer
- Keyboard navigation support (Tab key)
- Focus states
- Screen reader labels

**Mobile Optimizations:**
- Touch feedback (highlight on touch)
- Larger touch target (already 44px+)
- Prevent scroll during touch feedback

**Performance:**
- CSS transitions for smooth UX
- GIF eager loading only for GIFs (not all media)
- Lazy loading still applies to JPG/PNG

### Testing Checklist

#### Functional Tests
- [ ] Click anywhere on wave item opens wave
- [ ] Hover shows background change (desktop)
- [ ] Touch shows feedback (mobile)
- [ ] GIFs load and animate when wave opens
- [ ] Other images still lazy load
- [ ] Selected wave shows highlight
- [ ] Message preview displays correctly (if implemented)
- [ ] Media indicator shows for waves with images/GIFs

#### UX Tests
- [ ] Hover feedback is obvious and smooth
- [ ] Touch feedback appears instantly (<50ms)
- [ ] Transitions are smooth (no jank)
- [ ] Clear visual indication of clickability
- [ ] Mobile: No accidental activations during scroll

#### Cross-Browser Tests
- [ ] Chrome: Hover and click work
- [ ] Firefox: Hover and click work
- [ ] Safari: Hover and click work
- [ ] Mobile Chrome: Touch feedback works
- [ ] Mobile Safari: Touch feedback works

#### Performance Tests
- [ ] GIF eager loading doesn't slow page load
- [ ] Hover transitions are smooth (60fps)
- [ ] No memory leaks with repeated hover
- [ ] Touch feedback doesn't delay tap response

### Estimated Complexity

**Total Implementation Time:** 2-4 hours

**Minimal Implementation (2 hours):**
- Hover states and transitions: 0.5 hour
- Touch feedback for mobile: 0.5 hour
- GIF eager loading change: 0.5 hour
- Testing and polish: 0.5 hour

**Enhanced Implementation (4 hours):**
- Hover states and transitions: 0.5 hour
- Touch feedback: 0.5 hour
- GIF eager loading: 0.5 hour
- Message preview in wave list: 1.5 hours
- Server API updates: 0.5 hour
- Testing and polish: 0.5 hour

### Priority Assessment

**Recommended:** Minimal implementation in v1.3.3 (2 hours)
- Quick win, improves UX significantly
- Minimal code changes
- No backend changes required (except GIF loading)
- Enhances discoverability

**Optional:** Message preview enhancement can be deferred to v1.4

---

## 3. Complete Theme System Refactoring (MEDIUM PRIORITY)

### Current State
- ✅ Theme infrastructure exists (v1.3.2)
  - THEMES definitions (Firefly, High Contrast, Light Mode)
  - FONT_SIZES definitions
  - Preferences API endpoint
  - Theme selector UI in ProfileSettings
- ⚠️ **Partial implementation**
  - Theme definitions exist but not fully applied
  - Most colors still hardcoded in inline styles
  - CSS variables not yet implemented
  - Theme switching doesn't change all colors

### Required Changes

#### Overview
Refactor all inline styles to use CSS variables, enabling full theme support.

#### Implementation Approach

**1. Add CSS Variable System** (client/index.html or App component)

```css
:root {
  /* Theme colors - default to Firefly */
  --color-bg: #050805;
  --color-bg-secondary: #0d150d;
  --color-bg-tertiary: #1a2a1a;
  --color-primary: #ffd23f;
  --color-secondary: #0ead69;
  --color-accent: #3bceac;
  --color-danger: #ff6b35;
  --color-text: #c5d5c5;
  --color-text-secondary: #9bab9b;
  --color-text-muted: #6a7a6a;
  --color-text-dim: #5a6a5a;
  --color-border: #2a3a2a;
  --color-border-light: #3a4a3a;

  /* Font sizes - default to medium */
  --font-size-base: 1rem;
  --font-scale: 1;
}

body[data-theme="highContrast"] {
  --color-bg: #000000;
  --color-bg-secondary: #0a0a0a;
  --color-bg-tertiary: #1a1a1a;
  --color-primary: #ffff00;
  --color-secondary: #00ff00;
  --color-accent: #00ffff;
  --color-danger: #ff0000;
  --color-text: #ffffff;
  --color-text-secondary: #e0e0e0;
  --color-text-muted: #b0b0b0;
  --color-text-dim: #808080;
  --color-border: #ffffff;
  --color-border-light: #808080;
}

body[data-theme="light"] {
  --color-bg: #f5f5f5;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #e8e8e8;
  --color-primary: #0066cc;
  --color-secondary: #00aa44;
  --color-accent: #0088aa;
  --color-danger: #cc3300;
  --color-text: #333333;
  --color-text-secondary: #555555;
  --color-text-muted: #777777;
  --color-text-dim: #999999;
  --color-border: #cccccc;
  --color-border-light: #e0e0e0;
}

body[data-font-size="small"] {
  --font-size-base: 0.875rem;
  --font-scale: 0.9;
}

body[data-font-size="large"] {
  --font-size-base: 1.125rem;
  --font-scale: 1.15;
}

body[data-font-size="xlarge"] {
  --font-size-base: 1.25rem;
  --font-scale: 1.3;
}
```

**2. Apply Theme via Body Attributes** (in App component useEffect)

```javascript
useEffect(() => {
  if (user?.preferences) {
    document.body.setAttribute('data-theme', user.preferences.theme || 'firefly');
    document.body.setAttribute('data-font-size', user.preferences.fontSize || 'medium');
  }
}, [user]);
```

**3. Refactor All Inline Styles** (Throughout CortexApp.jsx)

Replace hardcoded colors with CSS variables:

```javascript
// Before:
style={{ background: '#0d150d', color: '#c5d5c5', border: '1px solid #2a3a2a' }}

// After:
style={{
  background: 'var(--color-bg-secondary)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)'
}}
```

**Components to Refactor** (~200+ inline styles):
- LoginScreen
- WaveList
- WaveView
- MessageItem
- ContactsView
- GroupsView
- ProfileSettings
- All modals and popups
- Buttons and inputs
- EmojiPicker
- All UI components

**4. Test All Themes**

Create theme preview in ProfileSettings:

```javascript
const ThemePreview = ({ themeName }) => {
  const theme = THEMES[themeName];
  return (
    <div style={{
      padding: '12px',
      background: theme.colors.bg,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: '2px',
      marginBottom: '8px'
    }}>
      <div style={{ color: theme.colors.primary, fontSize: '0.9rem', marginBottom: '4px' }}>
        {theme.name}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {['primary', 'secondary', 'accent', 'danger'].map(colorKey => (
          <div key={colorKey} style={{
            width: '30px', height: '30px',
            background: theme.colors[colorKey],
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '2px'
          }} />
        ))}
      </div>
    </div>
  );
};
```

### Estimated Complexity

**Total Implementation Time:** 16-24 hours

**Breakdown:**
- CSS variable system setup: 2 hours
- Refactor ~200 inline styles: 10-14 hours
- Theme preview component: 2 hours
- Testing all themes: 4-6 hours
- Bug fixes and polish: 2-4 hours

### Priority Assessment

**Can be deferred** - While important for full theme support, the basic infrastructure works. Consider:
- **v1.3.3**: Focus on message editing (high user priority)
- **v1.3.4 or v1.4**: Complete theme system refactoring

---

## 3. Collapsible Playback Bar (LOW PRIORITY)

### Current State
- ✅ **Playback controls FULLY functional**:
  - PlaybackControls component exists (CortexApp.jsx:603)
  - Timeline slider, play/pause, reset, speed controls (0.5x, 1x, 2x, 4x)
  - Plays back messages in chronological order
  - Auto-play functionality works
- ⚠️ **UX Issue**:
  - Always visible when messages exist (CortexApp.jsx:1032)
  - Takes up vertical UI space (~60-80px)
  - Used infrequently but always displayed

### User Story
**Requested By:** Jared Empson
**Priority:** Low

> As a user, I want the playback bar to be hidden by default and only shown when I need it, so that it doesn't take up valuable UI space when I'm not using the playback feature.

**Current Problem:** Playback controls are always visible, consuming vertical space even when not being used.

### Required Changes

#### Client Side (`client/CortexApp.jsx`)

**1. Add Toggle State** (WaveView component, around line 821)

Add state to control playback visibility:

```javascript
// Add to WaveView component state
const [showPlayback, setShowPlayback] = useState(false);
```

**2. Add Toggle Button** (Wave header, around line 1010)

Add button near other wave action buttons:

```javascript
// In wave header (after DELETE WAVE button, if present)
{total > 0 && (
  <button
    onClick={() => setShowPlayback(!showPlayback)}
    style={{
      padding: isMobile ? '10px 12px' : '6px 12px',
      minHeight: isMobile ? '44px' : 'auto',
      background: showPlayback ? '#3bceac20' : 'transparent',
      border: `1px solid ${showPlayback ? '#3bceac' : '#3a4a3a'}`,
      color: showPlayback ? '#3bceac' : '#6a7a6a',
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: isMobile ? '0.85rem' : '0.75rem',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }}
  >
    {showPlayback ? '📼' : '▶'} <span>PLAYBACK</span>
  </button>
)}
```

**3. Conditional Rendering** (Update PlaybackControls render, line 1031)

Change from always visible to conditionally visible:

```javascript
// BEFORE:
{total > 0 && (
  <PlaybackControls ... />
)}

// AFTER:
{total > 0 && showPlayback && (
  <PlaybackControls
    isPlaying={isPlaying}
    onTogglePlay={() => setIsPlaying(!isPlaying)}
    currentIndex={playbackIndex}
    totalMessages={total}
    onSeek={setPlaybackIndex}
    onReset={() => {
      setPlaybackIndex(null);
      setIsPlaying(false);
      setShowPlayback(false);  // Optional: auto-hide on reset
    }}
    playbackSpeed={playbackSpeed}
    onSpeedChange={setPlaybackSpeed}
    isMobile={isMobile}
  />
)}
```

**4. Optional: Smooth Animation** (Enhanced UX)

Add slide-in/out animation:

```javascript
{total > 0 && (
  <div style={{
    maxHeight: showPlayback ? '80px' : '0',
    overflow: 'hidden',
    transition: 'max-height 0.3s ease-in-out',
    opacity: showPlayback ? 1 : 0,
    transition: 'all 0.3s ease-in-out',
  }}>
    {showPlayback && <PlaybackControls ... />}
  </div>
)}
```

**5. Optional: Preference Persistence** (Remember user choice)

Save preference to localStorage:

```javascript
// On mount, restore preference
useEffect(() => {
  const savedPreference = localStorage.getItem('cortex_showPlayback');
  if (savedPreference !== null) {
    setShowPlayback(savedPreference === 'true');
  }
}, []);

// On change, save preference
useEffect(() => {
  localStorage.setItem('cortex_showPlayback', showPlayback);
}, [showPlayback]);
```

### UI/UX Considerations

**Button Placement Options:**
- **Option A** (Recommended): In wave header with other action buttons
- **Option B**: Floating button on right side of screen
- **Option C**: In compose area with emoji/media buttons

**Visual Design:**
- Icon: 📼 (video cassette) or ▶ (play) when hidden, ⏸ (pause) or ✕ when visible
- Highlight when active (background color + border)
- Clear label: "PLAYBACK" or "TIMELINE"
- Touch-friendly size (44px minimum on mobile)

**Behavioral Options:**
1. **Reset to hidden** each time wave is opened (simple, clean)
2. **Remember preference** across waves (more user control)
3. **Auto-hide on reset** when user clicks reset button

**Animation:**
- Smooth slide-in/out (0.3s ease)
- Or instant show/hide (faster, simpler)
- No layout shift (reserve space or smooth transition)

### Testing Checklist

#### Functional Tests
- [ ] Toggle button shows/hides playback controls
- [ ] Playback still works when visible
- [ ] Button state reflects visibility (icon, color)
- [ ] Works on desktop (mouse click)
- [ ] Works on mobile (touch)
- [ ] Auto-hide on reset (if implemented)
- [ ] Preference persistence (if implemented)

#### UX Tests
- [ ] Button is easy to find and understand
- [ ] Toggle is instant (<100ms)
- [ ] Animation is smooth (if implemented)
- [ ] No UI jank or layout shift
- [ ] Touch target is adequate (44px+)
- [ ] Visual feedback is clear

#### Edge Cases
- [ ] Toggle while playback is running
- [ ] Toggle during autoplay
- [ ] Rapid repeated toggles (no flickering)
- [ ] Navigate away and back to wave
- [ ] Refresh page (preference persists if implemented)
- [ ] First-time users see hidden by default

#### Performance Tests
- [ ] Toggle doesn't affect message rendering
- [ ] Animation is smooth (60fps)
- [ ] No memory leaks with repeated toggles

### Estimated Complexity

**Total Implementation Time:** 1-2 hours

**Minimal Implementation (1 hour):**
- Add state variable: 5 minutes
- Add toggle button in header: 20 minutes
- Conditional rendering: 5 minutes
- Mobile touch optimization: 15 minutes
- Testing and polish: 15 minutes

**Enhanced Implementation (2 hours):**
- Everything above
- Smooth slide animation: 30 minutes
- Auto-hide on reset: 5 minutes
- Preference persistence (localStorage): 20 minutes
- Additional testing: 10 minutes

### Priority Assessment

**Recommended:** Minimal implementation in v1.3.3 (1 hour)
- Quick win, improves UI cleanliness
- Minimal code changes (3 small edits)
- No breaking changes
- User-requested feature

**Optional Enhancements:**
- Animation can be added later if desired
- Preference persistence can be deferred to v1.4
- Focus on core functionality first

### Alternative Approaches

**1. Collapse Button (Alternative Design)**
Show controls but allow collapse:
- Controls visible by default
- Small collapse button (▲/▼) on the right
- Collapses to thin bar with just the button
- Pros: More discoverable
- Cons: Still takes some space

**2. Floating Action Button**
Floating circular button in corner:
- FAB with playback icon
- Expands to full controls when clicked
- Pros: Doesn't affect layout
- Cons: Harder to discover

**3. Context Menu**
Access via right-click or long-press:
- No button in main UI
- Appears in wave context menu
- Pros: Zero UI clutter
- Cons: Very hard to discover

**Recommendation:** Stick with toggle button (Option 1 from main plan) - best balance of discoverability and space efficiency.

---

## 4. Auto-Focus Input on Reply (MEDIUM PRIORITY)

### Current State
- ✅ **Reply functionality works**:
  - Clicking reply sets `replyingTo` state (CortexApp.jsx:1042)
  - Shows reply indicator above input (CortexApp.jsx:1057)
  - Mobile: Scrolls compose area into view (CortexApp.jsx:857)
- ✅ **Infrastructure exists**:
  - `textareaRef` already created (CortexApp.jsx:832)
  - Ref attached to textarea (CortexApp.jsx:1078)
- ❌ **Missing behavior**:
  - Input field does NOT auto-focus when clicking reply
  - User must manually click input or tab through messages

### User Story
**Requested By:** Jared Empson
**Priority:** Medium

> As a user, when I click the reply button, I want the cursor to automatically be placed in the input field, so that I can immediately start typing my reply without additional clicks or tab navigation.

**Current Problem:** After clicking reply, user must manually click in the input field or tab through all messages to reach it before they can type.

### Required Changes

#### Client Side (`client/CortexApp.jsx`)

**1. Add Auto-Focus Effect** (After line 863, in WaveView component)

Add a new useEffect hook to focus the textarea when replying:

```javascript
// Existing mobile scroll effect (lines 857-863)
useEffect(() => {
  if (replyingTo && isMobile && composeRef.current) {
    setTimeout(() => {
      composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  }
}, [replyingTo, isMobile]);

// ADD: Auto-focus input when replying (works for desktop and mobile)
useEffect(() => {
  if (replyingTo && textareaRef.current) {
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        // Optional: Move cursor to end of existing text
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
        // Optional: Scroll textarea to show cursor
        textarea.scrollTop = textarea.scrollHeight;
      }
    }, 150); // Slightly after scroll completes on mobile
  }
}, [replyingTo]);
```

**That's the entire implementation!** Just one useEffect hook leveraging existing refs.

### Alternative Approaches

**Approach A: Minimal (Recommended)**
Just focus, no cursor positioning:
```javascript
useEffect(() => {
  if (replyingTo && textareaRef.current) {
    setTimeout(() => textareaRef.current?.focus(), 150);
  }
}, [replyingTo]);
```

**Approach B: Enhanced**
Focus + cursor positioning + scroll (shown above)

**Approach C: Immediate (No Delay)**
Remove setTimeout for instant focus:
```javascript
useEffect(() => {
  if (replyingTo && textareaRef.current) {
    textareaRef.current.focus();
  }
}, [replyingTo]);
```
- Pros: Instant response
- Cons: May conflict with mobile scroll on slower devices

**Recommendation:** Use Approach B (enhanced) with 150ms delay to work smoothly with mobile scroll behavior.

### UI/UX Considerations

**Focus Timing:**
- 150ms delay ensures mobile scroll completes first
- Prevents focus-scroll conflicts
- Still feels instant to users

**Mobile Behavior:**
- Keyboard automatically appears on focus
- Works alongside existing scroll-into-view
- Smooth combined transition

**Desktop Behavior:**
- Instant focus (150ms imperceptible)
- Cursor blinks, ready for typing
- No scroll needed (already visible)

**Edge Cases:**
- Reply while typing: Cursor moves to end (preserves text)
- Rapid reply clicks: Focus updates each time
- Cancel reply: Focus remains (allows continued typing)

**Accessibility:**
- Clear focus indicator (browser default)
- Screen reader announces: "Text area, focused"
- Keyboard navigation still works

### Testing Checklist

#### Functional Tests
- [ ] Click reply → cursor appears in input
- [ ] Reply on different messages → focus each time
- [ ] Reply with text in input → cursor at end
- [ ] Cancel reply (X button) → focus persists
- [ ] Send message → focus remains for next message
- [ ] Desktop: All browsers (Chrome, Firefox, Safari)
- [ ] Mobile: iOS Safari and Android Chrome

#### UX Tests
- [ ] Focus is immediate (<200ms perceived)
- [ ] No jarring jumps or flicker
- [ ] Mobile: Keyboard appears smoothly
- [ ] Mobile: Scroll then focus works well
- [ ] Cursor is visible and blinking
- [ ] Can start typing immediately

#### Integration Tests
- [ ] Works with emoji picker (doesn't steal focus)
- [ ] Works with media panel (doesn't steal focus)
- [ ] Works during playback mode
- [ ] Works with message editing (if both implemented)
- [ ] Works after sending a message

#### Edge Cases
- [ ] Rapid reply button clicks (no flickering)
- [ ] Reply while another reply active
- [ ] Reply on first vs last message
- [ ] Reply after archiving wave
- [ ] Reply after deleting a message
- [ ] Multiple reply/cancel cycles

#### Performance Tests
- [ ] No performance impact (it's one focus call)
- [ ] Works smoothly on slow devices
- [ ] No memory leaks with repeated use

### Estimated Complexity

**Total Implementation Time:** 15-30 minutes

**Minimal Implementation (15 minutes):**
- Add useEffect hook: 5 minutes
- Test on desktop: 5 minutes
- Test on mobile: 5 minutes

**Enhanced Implementation (30 minutes):**
- Add useEffect with cursor positioning: 10 minutes
- Test all scenarios: 10 minutes
- Fine-tune delay timing: 10 minutes

### Priority Assessment

**Recommended:** Enhanced implementation in v1.3.3 (30 minutes)
- **Extremely quick win** - less than an hour
- **High impact** - significantly improves reply UX
- **Zero risk** - no breaking changes, additive only
- **Universal benefit** - helps all users, especially mobile
- **User-requested** - direct user feedback

**This is the easiest feature in the entire v1.3.3 plan!**

### Benefits

**User Experience:**
- ✅ Eliminates extra click/tap
- ✅ Reduces cognitive load
- ✅ Speeds up reply workflow
- ✅ Matches user expectations (common pattern)
- ✅ Especially helpful on mobile

**Development:**
- ✅ Minimal code (5-10 lines)
- ✅ Uses existing infrastructure
- ✅ Zero dependencies
- ✅ Easy to test
- ✅ Easy to maintain

**Risk:**
- ⚠️ Very low - additive feature only
- ⚠️ No breaking changes
- ⚠️ Doesn't affect existing functionality

---

## 5. GIF Search Integration (LOW PRIORITY - Deferred to v1.4) 🔮

### Current State
- ✅ **Media embedding works**:
  - Direct GIF URLs embed correctly (server.js:143-162)
  - Supports Giphy and Tenor direct URLs (media.giphy.com, media.tenor.com)
  - Auto-detects and embeds GIFs in messages
- ❌ **No search interface**:
  - Users must manually find direct GIF URLs
  - Share URLs (giphy.com/xyz, tenor.com/xyz) don't work (they're HTML pages with ads)
- ⚠️ **Manual process is tedious**:
  - Go to Giphy/Tenor website
  - Search for GIF
  - Right-click → Copy image address
  - Paste into Cortex

### User Story
**Requested By:** Jared Empson
**Priority:** Low

> As a user, I want to search for GIFs directly within Cortex using Giphy or Tenor, so that I can quickly find and insert GIFs without leaving the app or manually copying direct URLs.

**Current Problem:** Share URLs from Giphy/Tenor show embedded images with ads instead of direct GIFs. Users must manually extract direct GIF URLs, which is cumbersome.

### Why Deferred to v1.4

**Better fit for media-focused release:**
- Groups well with other media features (image upload, video embedding, link previews)
- Requires external setup (Giphy API key)
- More complex than v1.3.3 quick wins (8-13 hours vs 0.5-12 hours)
- Low priority - nice-to-have enhancement

**v1.4 Theme:** Media & Content Enhancements
- Image upload (not just URL embedding)
- Video embedding
- **GIF search** ← fits here perfectly
- Link preview cards
- Message attachments

### Implementation Overview

#### High-Level Approach

**Server-Side (3-4 hours):**
1. Add `/api/gifs/search` proxy endpoint (hides API key from client)
2. Add `/api/gifs/trending` endpoint (for initial modal display)
3. Add `GIPHY_API_KEY` environment variable
4. Rate limiting and error handling

**Client-Side (5-7 hours):**
1. Create `GifSearchModal` component with search and grid
2. Add search button (🔍) in compose area
3. Debounced search (500ms)
4. Grid layout: responsive, hover effects
5. Click to insert direct GIF URL

**Total Time:** 8-13 hours

#### API Choice: Giphy (Recommended)

**Giphy API:**
- Free tier: 100 calls/hour, 1000 calls/day
- No credit card required
- Simple API, good documentation
- Returns direct GIF URLs
- Content-rated (G, PG, PG-13, R)

**Alternative: Tenor API (Google-owned):**
- Unlimited free tier
- More complex API
- Different URL format

**Recommendation:** Start with Giphy, add Tenor later if needed

### Required Changes (Summary)

#### Server Side (`server/server.js`)

**Add API Proxy Endpoints:**
```javascript
// Search GIFs
app.get('/api/gifs/search', authenticateToken, async (req, res) => {
  const query = sanitizeInput(req.query.q);
  const apiKey = process.env.GIPHY_API_KEY;

  // Fetch from Giphy API
  const response = await fetch(
    `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${query}&limit=30&rating=g`
  );

  const data = await response.json();

  // Return direct GIF URLs
  res.json({
    results: data.data.map(gif => ({
      id: gif.id,
      title: gif.title,
      url: gif.images.fixed_height.url,  // Direct GIF URL
      preview: gif.images.fixed_height_small.url,
      width: gif.images.fixed_height.width,
      height: gif.images.fixed_height.height,
    }))
  });
});

// Trending GIFs (for initial display)
app.get('/api/gifs/trending', authenticateToken, async (req, res) => {
  // Similar implementation
});
```

**Environment Variable:**
```bash
# server/.env
GIPHY_API_KEY=your-api-key-here  # Get free key at developers.giphy.com
```

#### Client Side (`client/CortexApp.jsx`)

**Add GIF Search Modal Component:**
- Full-screen modal on mobile, centered on desktop
- Search input with 500ms debounce
- Responsive grid (2-3 cols mobile, 4-5 cols desktop)
- Shows trending GIFs by default
- Click to insert direct URL
- Loading states, error handling

**Add Search Button:**
```javascript
// In compose area, after emoji and media buttons
<button onClick={() => setShowGifSearch(true)} style={{...}}>
  🔍 {/* Search icon for GIFs */}
</button>
```

**Integration:**
```javascript
const [showGifSearch, setShowGifSearch] = useState(false);

const handleGifSelect = (gifUrl) => {
  setNewMessage(prev => prev + '\n' + gifUrl);
  setShowGifSearch(false);
};
```

### UI/UX Design

**Modal Layout:**
```
┌────────────────────────────────────┐
│  [Search GIFs...]        [X Close] │
├────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │GIF │ │GIF │ │GIF │ │GIF │       │
│ └────┘ └────┘ └────┘ └────┘       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │GIF │ │GIF │ │GIF │ │GIF │       │
│ └────┘ └────┘ └────┘ └────┘       │
│ [Scrollable grid...]               │
├────────────────────────────────────┤
│     Powered by GIPHY • Click to    │
│              insert                │
└────────────────────────────────────┘
```

**Features:**
- Auto-focus search input
- Debounced search (no API spam)
- Hover effects (border highlight, scale)
- Loading spinner
- Empty state handling
- Mobile-optimized grid

### Technical Considerations

**Security:**
- ✅ API key hidden on server (not exposed to client)
- ✅ Proxy endpoint prevents key leakage
- ✅ Search query sanitized
- ✅ Content rating set to 'g' (general audiences)

**Performance:**
- Debounced search (500ms)
- Limit 30 results per query
- Lazy load thumbnails
- Cache trending GIFs (5 min)
- Cancel pending requests on new search

**Error Handling:**
- API key missing → graceful error message
- Rate limit exceeded → show message
- Network timeout → retry option
- Zero results → "No GIFs found"

### Testing Requirements

**Functional:**
- [ ] Search returns relevant results
- [ ] Trending loads on modal open
- [ ] Click inserts direct URL
- [ ] Inserted URL embeds correctly
- [ ] Debounce prevents API spam
- [ ] Works within free tier limits

**Integration:**
- [ ] Works with emoji picker
- [ ] Works with media input panel
- [ ] Works in reply mode
- [ ] Multiple GIFs can be inserted

**API:**
- [ ] Valid API key works
- [ ] Invalid key shows error
- [ ] Rate limit handling
- [ ] Network error handling

### Dependencies

**External:**
- Giphy API account (free): https://developers.giphy.com/
- API key (no credit card required)
- Free tier limits:
  - 100 API calls/hour
  - 1,000 API calls/day
  - Sufficient for small teams (<10 users)

**Code:**
- Node.js `fetch` (built-in Node 18+)
- Existing media embedding ✅
- Existing modal patterns ✅
- Existing `fetchAPI` helper ✅

### Estimated Complexity

**Total: 8-13 hours**

**Server (3-4 hours):**
- Search proxy endpoint: 1.5 hours
- Trending endpoint: 1 hour
- Error handling: 30 minutes
- Documentation: 30 minutes
- Testing: 30 minutes

**Client (5-7 hours):**
- GIF search modal: 3 hours
- Search & state management: 1 hour
- Grid layout: 1 hour
- Button integration: 30 minutes
- Mobile optimization: 1 hour
- Testing: 1.5 hours

**Documentation (1 hour):**
- README update: 30 minutes
- Setup guide: 30 minutes

### Future Enhancements (v1.5+)

**Advanced Search:**
- GIF categories/tags
- Favorite GIFs
- Recent GIF history
- Provider selection (Giphy vs Tenor)

**Content:**
- Sticker support
- Animated emoji
- Custom GIF upload

**UX:**
- Infinite scroll
- Keyboard navigation
- Multi-select

### Why This is a Good v1.4 Feature

**Fits v1.4 Theme:**
- Groups with image upload, video, link previews
- Cohesive "Media & Content" release
- All require similar UI patterns (modals, grids, previews)

**Better Timing:**
- After v1.3.3 quick wins proven stable
- More setup time acceptable for feature release
- Can bundle with other API integrations

**User Expectations:**
- v1.3.3: Polish & UX fixes (quick wins)
- v1.4: New content features (media-rich)
- Users expect setup steps in feature releases

### Recommendation

**✅ Defer to v1.4** as part of "Media & Content Enhancements" release

**v1.3.3 Focus:** Quick UX wins (11.5-18.5 hours total)
1. Message editing ⭐
2. Wave activation UX
3. Collapsible playback
4. Auto-focus on reply

**v1.4 Focus:** Media features (35-50 hours estimated)
1. **GIF search** (8-13 hours)
2. Image upload (10-15 hours)
3. Video embedding (8-12 hours)
4. Link previews (10-15 hours)

---

## 6. Complete Theme System Refactoring (MEDIUM PRIORITY - Deferred)

*[Content remains the same, just renumbered from 5 to 6]*

---

## 7. Additional Quick Wins for v1.3.3

### 7.1 Message Timestamps Improvement
**Complexity:** Low (2 hours)
**Description:** Show relative timestamps (e.g., "2 minutes ago", "yesterday")

### 7.2 Keyboard Shortcuts Documentation
**Complexity:** Low (1 hour)
**Description:** Add keyboard shortcuts help modal (Ctrl+/, ?)

### 7.3 Unread Message Indicator
**Complexity:** Medium (4-6 hours)
**Description:** Track and display unread message counts per wave

### 7.4 Mobile Pull-to-Refresh
**Complexity:** Medium (4-6 hours)
**Description:** Add pull-to-refresh gesture on wave list (mobile only)

### 7.5 Message Link Previews
**Complexity:** Medium (6-8 hours)
**Description:** Generate preview cards for URLs in messages

---

## Implementation Roadmap

### Phase 1: Core Features (Week 1)
**Priority:** All user-requested features

**Days 1-2:**
- [ ] Add message edit/delete buttons UI
- [ ] Implement inline edit form
- [ ] Add handler functions
- [ ] Add wave hover states and touch feedback (2 hours)
- [ ] Add playback toggle button (1 hour)
- [ ] Add auto-focus on reply (30 minutes)

**Days 3-4:**
- [ ] Integrate WebSocket updates
- [ ] Add edit indicator
- [ ] Update GIF loading strategy (eager load)
- [ ] Testing and bug fixes

**Day 5:**
- [ ] Polish and UX improvements
- [ ] Mobile optimization
- [ ] Documentation updates

### Phase 2: Optional Features (Week 2)
**Priority:** Edit history viewer, additional improvements

**Days 6-7:**
- [ ] Edit history modal (optional)
- [ ] OR start theme system refactoring
- [ ] OR implement quick wins (timestamps, shortcuts)

**Days 8-10:**
- [ ] Final testing
- [ ] Documentation
- [ ] Release preparation

---

## Testing Strategy

### Unit Tests
- Message edit validation
- Delete confirmation logic
- WebSocket event handling
- State management

### Integration Tests
- Edit message end-to-end
- Delete message end-to-end
- Real-time updates across clients
- Authorization checks

### E2E Tests
- User workflow: login → edit message → verify update
- User workflow: login → delete message → verify removal
- Multi-user: User A edits, User B sees update

### Manual Testing Checklist
- [ ] Desktop: Chrome, Firefox, Safari
- [ ] Mobile: iOS Safari, Android Chrome
- [ ] Tablet: iPad Safari
- [ ] Edge cases and error scenarios

---

## Performance Considerations

### Optimization Targets
- Edit form render: <50ms
- WebSocket update propagation: <100ms
- History modal load: <500ms
- No memory leaks during edit cycles

### Monitoring
- Track edit/delete API response times
- Monitor WebSocket message frequency
- Check for state update performance issues

---

## Security Considerations

### Input Validation
- ✅ Server-side content length validation (10,000 chars)
- ✅ HTML sanitization on edit
- ✅ Authorization checks (author only)

### Additional Checks
- Rate limiting on edit endpoint (consider adding)
- Prevent edit spam (consider cooldown)
- Audit log for deletions (consider tracking)

---

## Documentation Updates

### Files to Update
- [x] PLAN-v1.3.3.md (this file)
- [ ] CLAUDE.md - Add message editing patterns
- [ ] README.md - Update roadmap with v1.3.3
- [ ] CHANGELOG.md - Document v1.3.3 changes (when released)

### User Documentation
- [ ] Create user guide for message editing
- [ ] Document keyboard shortcuts
- [ ] Add FAQ entries

---

## Success Criteria

v1.3.3 release is ready when:

### Technical Criteria
- [ ] Message editing works on desktop and mobile
- [ ] Message deletion works with confirmation
- [ ] WebSocket updates propagate in real-time
- [ ] No console errors or warnings
- [ ] All authorization checks pass
- [ ] Edit history tracking works correctly

### User Experience Criteria
- [ ] Edit UI is intuitive and discoverable
- [ ] Confirmation dialogs are clear
- [ ] Keyboard shortcuts work smoothly
- [ ] Mobile touch targets are adequate
- [ ] Performance is acceptable (<300ms response)

### Quality Criteria
- [ ] All tests pass
- [ ] Cross-browser compatibility verified
- [ ] No critical bugs
- [ ] Documentation complete
- [ ] Code reviewed

---

## Estimated Timeline

### Minimal Release (Message Editing Only)
**Timeline:** 5-7 days
**Scope:** Message edit/delete UI, no history viewer

### Standard Release (With History Viewer)
**Timeline:** 8-10 days
**Scope:** Message edit/delete UI + edit history modal

### Extended Release (With Theme System)
**Timeline:** 12-15 days
**Scope:** Message editing + theme system refactoring

---

## Risk Assessment

### Low Risk
- ✅ Backend fully implemented and tested
- ✅ No database migrations required
- ✅ No breaking changes
- ✅ Incremental UI additions

### Medium Risk
- ⚠️ Concurrent editing conflicts (mitigated by last-write-wins)
- ⚠️ WebSocket synchronization edge cases
- ⚠️ Mobile keyboard UX variations

### Mitigation Strategies
- Thorough testing of concurrent scenarios
- Clear error messages for conflicts
- Fallback to page refresh if sync issues
- Progressive enhancement (works without WebSocket)

---

## Future Enhancements (Post v1.3.3)

### v1.4 Candidates
- Message reactions (emoji reactions on messages)
- Typing indicators
- Read receipts
- Message threading improvements
- Pinned messages

### v1.5 Candidates
- Message search
- Advanced edit history (diff view)
- Bulk message operations
- Message templates
- Draft messages

---

## Notes

### Design Decisions
- **Last-write-wins** for concurrent edits (simple, acceptable for small teams)
- **Soft-delete consideration** deferred (hard delete for now)
- **Edit time limit** not implemented (users can edit anytime)
- **Edit count limit** not implemented (unlimited edits)

### Community Feedback

**Feature Request #1: Message Editing/Deletion**
- Requested by: Jared Empson (owner/admin)
- Use case: Correct typos and formatting mistakes
- Priority: High (basic expectation for messaging platform)

**Feature Request #2: Wave Activation UX**
- Requested by: Jared Empson (owner/admin)
- Use case: Make wave clickability more obvious, especially for viewing GIFs/media
- Priority: Medium (UX improvement, GIF playback issue)

**Feature Request #3: Collapsible Playback Bar**
- Requested by: Jared Empson (owner/admin)
- Use case: Hide playback controls when not in use to save UI space
- Priority: Low (nice-to-have, UI cleanup)

**Feature Request #4: Auto-Focus Input on Reply**
- Requested by: Jared Empson (owner/admin)
- Use case: Eliminate extra click/tap when replying to messages
- Priority: Medium (UX improvement, workflow optimization)

---

**Status:** Planning in Progress (Collecting Feature Requests)
**Features Planned:** 4 user requests + optional enhancements
**Estimated Total:** 11.5-18.5 hours (minimal implementations)

**Feature Breakdown:**
1. Message Editing/Deletion: 8-12 hours (High Priority) ⭐
2. Wave Activation UX: 2-4 hours (Medium Priority)
3. Collapsible Playback Bar: 1-2 hours (Low Priority)
4. Auto-Focus on Reply: 0.5 hour (Medium Priority) ⚡ **Easiest!**

**Next Step:** Wait for additional feature requests, then finalize scope and begin implementation
**Target Release Date:** TBD (will determine after finalizing feature set)
