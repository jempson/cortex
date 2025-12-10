# Cortex v1.10.0 - Implementation Plan

## RELEASE STATUS: IN PROGRESS (3/7 Phases)

**Target Scope:** Droplets Architecture - Phases 1, 2 & 3 (Terminology + Focus View Desktop & Mobile)
**Branch:** `v1.10.0`

---

## Overview

Version 1.10.0 implements the Droplets architecture including terminology rename and Focus View for both desktop and mobile. Users can click "Focus" on desktop or tap droplet content on mobile to view any droplet with replies in a full wave-like presentation with breadcrumb navigation.

**Release Type:** Architecture Foundation + UX Enhancement
**Focus Areas:** Terminology rename, Focus View, mobile gestures, breadcrumb navigation

---

## Phase 1: Terminology Rename (messages → droplets)

### 1.1 Database Layer Changes
**Status:** Complete ✓

#### SQLite Schema (`schema.sql`, `database-sqlite.js`)
- [x] Rename `messages` table to `droplets`
- [x] Rename `messages_fts` to `droplets_fts`
- [x] Update all indexes (idx_messages_* → idx_droplets_*)
- [x] Update foreign key references
- [x] Create migration for existing databases
- [x] Backward compatibility: Keep `messages` as view/alias during transition

#### JSON Database (`server.js` Database class)
- [x] Rename `messages.json` → `droplets.json`
- [x] Update all method names (getMessage → getDroplet, etc.)
- [x] Backward compatibility: Auto-migrate old file on startup

### 1.2 Server API Changes
**Status:** Complete ✓

#### Endpoint Renames (with backward compatibility)
| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `POST /api/waves/:id/messages` | `POST /api/waves/:id/droplets` | Create droplet |
| `GET /api/waves/:id/messages` | `GET /api/waves/:id/droplets` | List droplets |
| `PUT /api/messages/:id` | `PUT /api/droplets/:id` | Edit droplet |
| `DELETE /api/messages/:id` | `DELETE /api/droplets/:id` | Delete droplet |
| `POST /api/messages/:id/read` | `POST /api/droplets/:id/read` | Mark read |
| `POST /api/messages/:id/react` | `POST /api/droplets/:id/react` | Add reaction |

#### Backward Compatibility Strategy
- [x] Keep old endpoints as aliases (redirect to new)
- [ ] Add deprecation header: `X-Deprecated: Use /api/droplets instead` (deferred)
- [ ] Log usage of deprecated endpoints (deferred)
- [ ] Remove in v2.0.0

#### WebSocket Events
| Old Event | New Event |
|-----------|-----------|
| `new_message` | `new_droplet` |
| `message_edited` | `droplet_edited` |
| `message_deleted` | `droplet_deleted` |

- [x] New events broadcast alongside legacy events for compatibility

### 1.3 Client Changes
**Status:** Complete ✓

#### State and Props Renaming (Deferred to Phase 2)
- [ ] `messages` state → `droplets` (keeping internal names for now)
- [ ] `MessageInput` → `DropletComposer` (deferred)
- [ ] `ThreadedMessage` → `Droplet` component (deferred)
- [ ] `MessageWithEmbeds` → `DropletWithEmbeds` (deferred)
- [ ] All message-related props and handlers (deferred)

#### UI Text Updates
- [x] "No messages yet" → "No droplets yet" (in search)
- [x] "New message" → "New droplet" (in notifications)
- [x] "Reply to message" → "Reply to droplet" (placeholder unchanged - still says "Reply to {name}")
- [x] "Delete message" → "Delete droplet" (toast messages)
- [x] "[Message deleted]" → "[Droplet deleted]"
- [ ] "[Content removed by moderator]" → "[Droplet removed by moderator]" (deferred)

### 1.4 Documentation Updates
**Status:** Pending

- [ ] Update CLAUDE.md terminology throughout
- [ ] Update API.md with new endpoints
- [ ] Update README.md
- [ ] Update DESIGN-droplets.md to mark Phase 1 complete

---

## Phase 2: Focus View - Desktop
**Status:** Complete ✓

### 2.1 Focus Button on Droplets
- [x] Added `onFocus` prop to `ThreadedMessage` component
- [x] Focus button (`⤢ FOCUS`) appears on droplets with children
- [x] Button styled with teal color (#3bceac) to match focus theme

### 2.2 FocusView Component
- [x] Created `FocusView` component (450+ lines)
- [x] Displays focused droplet as root with all replies
- [x] Full compose functionality (reply to focused droplet or any child)
- [x] Supports editing, deleting, reactions
- [x] Filters blocked/muted users
- [x] Typing indicator integration

### 2.3 Breadcrumb Navigation
- [x] Shows navigation path: `Wave Name › Droplet 1 › Droplet 2 › Current`
- [x] Clickable breadcrumb items to navigate back to any level
- [x] Truncation for deep nesting (4+ levels): `Wave › ... › Parent › Current`
- [x] Wave name colored with wave's privacy color
- [x] Current droplet highlighted in teal

### 2.4 Navigation Stack State Management
- [x] `focusStack` state in MainApp - array of `{ waveId, dropletId, droplet }`
- [x] `handleFocusDroplet(waveId, droplet)` - push to stack from WaveView
- [x] `handleFocusBack()` - pop one level from stack
- [x] `handleFocusClose()` - clear stack, return to wave view
- [x] `handleFocusDeeper(droplet)` - focus on child within focus view

### 2.5 Compose in Focus Context
- [x] Default parent is the focused droplet
- [x] Can reply to any visible droplet within focus view
- [x] Reply indicator shows who you're replying to
- [x] Typing indicator broadcasts to the wave

### 2.6 UI Polish
- [x] Focus indicator bar showing "⤢ FOCUS VIEW" with reply count
- [x] Back button shows "← BACK" (to parent focus) or "← WAVE" (to wave)
- [x] Close button (✕) returns directly to wave view
- [x] Responsive design for mobile

---

## Phase 3: Focus View - Mobile
**Status:** Complete ✓

### 3.1 Tap-to-Focus on Droplet Content
- [x] Tapping droplet content area enters focus view (when droplet has replies)
- [x] Visual hint shows "⤢ Tap to focus (N replies)" on mobile
- [x] Hint styled with teal dashed border to indicate interactivity
- [x] Image clicks still work for lightbox (handled before tap-to-focus)

### 3.2 Swipe-Back Navigation
- [x] Swipe right to go back one focus level
- [x] From first focus level, swipe returns to wave view
- [x] Uses `useSwipeGesture` hook with 80px threshold
- [x] Swipe hint bar shown at top: "← Swipe right to go back"

### 3.3 Compact Breadcrumb Header
- [x] Shorter truncation on mobile (15 chars vs 30 on desktop)
- [x] Wave name truncated to 12 chars on mobile
- [x] Earlier truncation threshold (3 levels vs 4 on desktop)
- [x] On mobile, deep paths show: `Wave … Current`
- [x] No-wrap breadcrumb with overflow hidden

### 3.4 Gesture Conflict Testing
- [x] Verified swipe gesture is horizontal-only (deltaY < 100)
- [x] No conflict with pull-to-refresh (vertical, not currently active)
- [x] Tap-to-focus only fires on content area, not buttons
- [x] Build passes with no errors

---

## Migration Strategy

### For SQLite Databases

```sql
-- Migration script: migrate-messages-to-droplets.sql

-- 1. Rename table
ALTER TABLE messages RENAME TO droplets;

-- 2. Rename FTS table
ALTER TABLE messages_fts RENAME TO droplets_fts;

-- 3. Update triggers for FTS
DROP TRIGGER IF EXISTS messages_ai;
DROP TRIGGER IF EXISTS messages_ad;
DROP TRIGGER IF EXISTS messages_au;

CREATE TRIGGER droplets_ai AFTER INSERT ON droplets BEGIN
  INSERT INTO droplets_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

CREATE TRIGGER droplets_ad AFTER DELETE ON droplets BEGIN
  INSERT INTO droplets_fts(droplets_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
END;

CREATE TRIGGER droplets_au AFTER UPDATE ON droplets BEGIN
  INSERT INTO droplets_fts(droplets_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
  INSERT INTO droplets_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

-- 4. Rename indexes
ALTER INDEX idx_messages_wave RENAME TO idx_droplets_wave;
ALTER INDEX idx_messages_author RENAME TO idx_droplets_author;
ALTER INDEX idx_messages_parent RENAME TO idx_droplets_parent;
ALTER INDEX idx_messages_created RENAME TO idx_droplets_created;
```

### For JSON Databases

```javascript
// Auto-migration in Database constructor
if (fs.existsSync('data/messages.json') && !fs.existsSync('data/droplets.json')) {
  console.log('📝 Migrating messages.json → droplets.json...');
  fs.renameSync('data/messages.json', 'data/droplets.json');
  console.log('✅ Migration complete');
}
```

---

## Testing Checklist

### API Tests
- [ ] New `/api/droplets` endpoints return correct data
- [ ] Old `/api/messages` endpoints still work (backward compat)
- [ ] WebSocket `new_droplet` event fires correctly
- [ ] WebSocket `new_message` still works for old clients

### UI Tests
- [ ] Create new droplet in wave
- [ ] Reply to droplet
- [ ] Edit droplet
- [ ] Delete droplet
- [ ] Reactions work
- [ ] Read tracking works
- [ ] Search returns droplets
- [ ] Embeds display correctly

### Focus View Tests (Desktop)
- [ ] Focus button appears on droplets with replies
- [ ] Clicking Focus enters FocusView with correct droplet
- [ ] Breadcrumb shows correct navigation path
- [ ] Back button navigates to previous focus level
- [ ] Close button returns to wave view
- [ ] Compose sends to correct parent (focused droplet by default)
- [ ] Reply to child works correctly
- [ ] Nested focus (Focus within FocusView) works
- [ ] Breadcrumb truncation at 4+ levels works

### Focus View Tests (Mobile)
- [ ] Tap-to-focus hint appears on droplets with replies
- [ ] Tapping content area enters FocusView
- [ ] Swipe right navigates back one level
- [ ] Swipe from first level returns to wave
- [ ] Swipe hint bar displayed at top of FocusView
- [ ] Compact breadcrumb fits on mobile screen
- [ ] Deep breadcrumb truncates to "Wave … Current"
- [ ] Image lightbox still works (not intercepted by tap-to-focus)

### Migration Tests
- [ ] Fresh install works with new schema
- [ ] Existing SQLite database migrates correctly
- [ ] Existing JSON database migrates correctly
- [ ] No data loss during migration

---

## Breaking Changes

### v1.10.0 (This Release)
- None - full backward compatibility maintained

### v2.0.0 (Future)
- Remove `/api/messages/*` endpoint aliases
- Remove `new_message` WebSocket event alias
- Remove `messages.json` auto-migration

---

## Files to Modify

### Server
- `server/schema.sql` - Table and index renames
- `server/database-sqlite.js` - Method renames, migration
- `server/server.js` - Database class, API endpoints, WebSocket events

### Client
- `client/CortexApp.jsx` - Components, state, handlers

### Documentation
- `CLAUDE.md` - Terminology updates
- `docs/API.md` - Endpoint documentation
- `docs/DESIGN-droplets.md` - Mark phase complete
- `README.md` - User-facing terminology

---

## Version History Reference

| Version | Focus | Key Features |
|---------|-------|--------------|
| v1.10.0 | Droplets Phase 1 | Terminology rename (messages → droplets) |
| v1.9.0 | UX & Moderation | Threading, mobile gestures, reports, API docs |
| v1.8.1 | Bug Fixes | Embed fixes, push notification fixes |
| v1.8.0 | Profiles & Scale | Avatar upload, SQLite, push, FTS |

---

*This document will be updated as implementation progresses.*
