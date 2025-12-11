# Cortex v1.11.0 - Implementation Plan

## RELEASE STATUS: IN PROGRESS (2/6 Phases)

**Target Scope:** Notification System + Deferred v1.10.0 Items
**Branch:** `v1.11.0`

---

## Overview

Version 1.11.0 implements a comprehensive notification system with smart routing, focus-aware suppression, and ripple activity tracking. It also completes deferred terminology cleanup from v1.10.0.

**Release Type:** Feature Enhancement + Code Cleanup
**Focus Areas:** Notifications, component renaming, API deprecation headers

---

## Phase 1: Core Notification Infrastructure

### 1.1 Database Schema
**Status:** Complete

#### SQLite Schema (`schema.sql`, `database-sqlite.js`)
- [x] Create `notifications` table
  ```sql
  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,  -- direct_mention, reply, wave_activity, ripple, etc.
    wave_id TEXT REFERENCES waves(id) ON DELETE SET NULL,
    droplet_id TEXT REFERENCES droplets(id) ON DELETE SET NULL,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT,
    preview TEXT,
    read INTEGER DEFAULT 0,
    dismissed INTEGER DEFAULT 0,
    push_sent INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    read_at TEXT,
    group_key TEXT
  );
  ```
- [x] Create indexes for notifications
- [x] Add auto-migration for existing databases

#### JSON Database (`server.js` Database class)
- [x] Add `notifications.json` storage
- [x] Implement notification CRUD methods

### 1.2 Notification API Endpoints
**Status:** Complete

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications with filters |
| GET | `/api/notifications/count` | Get unread counts by type |
| POST | `/api/notifications/:id/read` | Mark notification as read |
| POST | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/:id` | Dismiss notification |

- [x] All endpoints implemented with authentication

### 1.3 Notification Creation
**Status:** Complete

- [x] Create `createNotification()` method in both database classes
- [ ] Trigger notifications on:
  - [ ] Direct @mention in droplet content (Phase 3)
  - [ ] Reply to user's droplet (Phase 3)
  - [ ] New droplet in wave (Phase 3)
- [x] Notification deduplication by group_key (field ready, logic in Phase 3)

### 1.4 WebSocket Events
**Status:** Complete

- [ ] `notification` - New notification created (Phase 3)
- [x] `notification_read` - Notification marked as read
- [x] `unread_count_update` - Count changed

---

## Phase 2: Notification UI Components

### 2.1 NotificationBell Component
**Status:** Complete

- [x] Bell icon in header with unread badge
- [x] Click opens notification dropdown/drawer
- [x] Badge shows count (max "99+")

### 2.2 NotificationList Component
**Status:** Complete

- [x] List of notifications with type icons
- [x] Click notification navigates to source
- [x] Mark as read on click
- [x] "Mark all read" button
- [x] Empty state: "No notifications"

### 2.3 NotificationItem Component
**Status:** Complete

- [x] Type-specific icons and colors:
  - `direct_mention`: @ icon, amber
  - `reply`: ↩ icon, teal
  - `wave_activity`: wave icon, green
  - `ripple`: ◈ icon, purple
- [x] Actor display name, preview text, timestamp
- [x] Unread indicator (dot or background)
- [x] Dismiss button (✕)

### 2.4 Mobile Notification Drawer
**Status:** Complete

- [x] Full-screen drawer on mobile
- [ ] Swipe to dismiss individual notifications (deferred)
- [ ] Pull-to-refresh for latest (deferred)

---

## Phase 3: Smart Notification Routing

### 3.1 Focus Context Awareness
**Status:** Pending

- [ ] Track user's current focus chain via WebSocket
- [ ] `viewing_droplet` message from client when focused
- [ ] Suppress notifications for visible content

### 3.2 Notification Decision Logic
**Status:** Pending

```javascript
function shouldNotify(notification, userContext) {
  // Always notify for direct mentions
  if (notification.type === 'direct_mention') return true;

  // Don't notify if user is viewing the droplet
  if (userContext.focusChain?.includes(notification.dropletId)) {
    return false;
  }

  // Don't notify if droplet is visible in current wave view
  if (userContext.currentWaveId === notification.waveId &&
      userContext.visibleDropletIds?.includes(notification.dropletId)) {
    return false;
  }

  return true;
}
```

### 3.3 Real-time Viewing State
**Status:** Pending

- [ ] Client sends `viewing_wave` when wave selected
- [ ] Client sends `viewing_droplet` when in focus view
- [ ] Server tracks user viewing state per connection
- [ ] Auto-mark notifications as read when viewing source

---

## Phase 4: Ripple Notifications

### 4.1 Ripple Event Notifications
**Status:** Pending

- [ ] Notify original wave participants when droplet rippled
- [ ] Notification includes link to new wave
- [ ] Type: `ripple_created`

### 4.2 Link Card Activity Badge
**Status:** Pending

- [ ] Track unread count for rippled waves
- [ ] Show badge on RippledLinkCard: "◈ New Wave (3 new)"
- [ ] Badge clears when user visits the rippled wave

### 4.3 Ripple Chain Subscriptions
**Status:** Pending

- [ ] User preference: `followRipples` (all | participated | none)
- [ ] Participants who contributed to original thread auto-follow
- [ ] Option to unfollow rippled wave

---

## Phase 5: Notification Preferences

### 5.1 User Preferences Schema
**Status:** Pending

Add to user preferences:
```javascript
notifications: {
  enabled: true,
  directMentions: 'always',      // always | app_closed | never
  replies: 'always',
  waveActivity: 'app_closed',
  rippleEvents: 'app_closed',
  soundEnabled: true,
  suppressWhileFocused: true,
  followRipples: 'participated'  // all | participated | none
}
```

### 5.2 Preferences API
**Status:** Pending

- [ ] `PUT /api/notifications/preferences` - Update preferences
- [ ] `GET /api/notifications/preferences` - Get current preferences

### 5.3 Preferences UI
**Status:** Pending

- [ ] Section in Profile Settings: "Notification Preferences"
- [ ] Toggles for each notification type
- [ ] Sound on/off toggle
- [ ] "Suppress while focused" toggle
- [ ] Ripple following preference dropdown

---

## Phase 6: Deferred v1.10.0 Cleanup

### 6.1 Deprecation Headers
**Status:** Pending

- [ ] Add `X-Deprecated` header to `/api/messages/*` endpoints
- [ ] Log usage of deprecated endpoints (warn level)
- [ ] Add deprecation notice to API.md

### 6.2 Component Renaming (Internal)
**Status:** Pending

Note: These are internal code changes, no user-facing impact.

- [ ] Rename `ThreadedMessage` → `Droplet`
- [ ] Rename `MessageInput` → `DropletComposer`
- [ ] Rename `MessageWithEmbeds` → `DropletWithEmbeds`
- [ ] Update all references throughout codebase

### 6.3 State Variable Renaming
**Status:** Pending

- [ ] Rename `messages` state → `droplets` in WaveView
- [ ] Update all message-related props and handlers
- [ ] Ensure no regressions

### 6.4 Auto-Focus User Preference
**Status:** Pending

- [ ] Add `preferences.autoFocusDroplets` (boolean, default: false)
- [ ] When true, clicking any droplet with replies enters focus view
- [ ] UI toggle in Profile Settings

---

## Testing Checklist

### Notification Tests
- [ ] Notifications created for mentions, replies, wave activity
- [ ] Unread count badge displays correctly
- [ ] Click notification navigates to source
- [ ] Mark as read works (single and all)
- [ ] Dismiss notification works
- [ ] WebSocket events fire correctly
- [ ] Notifications suppressed when viewing source

### Ripple Notification Tests
- [ ] Notification sent when droplet rippled
- [ ] Link card shows activity badge
- [ ] Follow ripple preference works
- [ ] Clicking notification opens rippled wave

### Preference Tests
- [ ] All notification preferences save correctly
- [ ] Preferences affect notification behavior
- [ ] Sound toggle works
- [ ] Suppress while focused works

### Component Rename Tests
- [ ] All droplet functionality works after rename
- [ ] No console errors or warnings
- [ ] Build passes successfully

---

## Files to Modify

### Server
- `server/schema.sql` - New notifications table
- `server/database-sqlite.js` - Notification methods
- `server/server.js` - API endpoints, WebSocket events, notification creation

### Client
- `client/CortexApp.jsx` - Components, state, handlers

### Documentation
- `CLAUDE.md` - Update with notification system
- `docs/API.md` - New endpoints, deprecation notices
- `docs/DESIGN-notifications.md` - Mark phases complete
- `README.md` - Changelog entry

---

## Version History Reference

| Version | Focus | Key Features |
|---------|-------|--------------|
| v1.11.0 | Notifications | Notification system, smart routing, component cleanup |
| v1.10.0 | Droplets | Terminology rename, Focus View, Ripple system |
| v1.9.0 | UX & Moderation | Threading, mobile gestures, reports, API docs |
| v1.8.1 | Bug Fixes | Embed fixes, push notification fixes |
| v1.8.0 | Profiles & Scale | Avatar upload, SQLite, push, FTS |

---

*This document will be updated as implementation progresses.*
