# Cortex v1.10.0 - Implementation Plan

## RELEASE STATUS: IN PROGRESS (1/7 Phases)

**Target Scope:** Droplets Architecture - Phase 1 (Terminology Rename)
**Branch:** `v1.10.0`

---

## Overview

Version 1.10.0 begins the Droplets architecture implementation, starting with the terminology rename from "messages" to "droplets" throughout the codebase. This is a foundational change that prepares for Focus View and Break Out features.

**Release Type:** Architecture Foundation
**Focus Areas:** Terminology rename, backward compatibility

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
