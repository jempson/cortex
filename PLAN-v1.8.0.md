# Cortex v1.8.0 - Implementation Plan

## 🎯 RELEASE STATUS: PLANNING

**Target Scope:** User Profiles, Scale & Organization
**Branch:** `v1.8.0` (create from master after planning)

---

## Overview

Version 1.8.0 focuses on enhanced user profiles and platform scalability. Users get richer profile customization with images and bios, while the backend migrates to SQLite for better performance.

**Release Type:** User Experience + Infrastructure
**Focus Areas:** Profile enhancement, display simplification, database migration

---

## Features for v1.8.0

### User Experience Features
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 1 | Profile Images (Avatar Upload) | High | 8-10h | Pending |
| 2 | About Me / Bio Section | High | 4-6h | Pending |
| 3 | Display Name Only (Hide @handle) | High | 2-3h | Pending |
| 4 | Emoji Picker Button Sizing Fix | Low | 0.5h | Pending |

### Infrastructure Features
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 5 | SQLite Database Migration | High | 12-16h | Pending |
| 6 | Image/File Upload System | High | 8-10h | Pending |
| 7 | Message Pagination | Medium | 6-8h | Pending |
| 8 | Full-Text Search (FTS) | Medium | 4-6h | Pending |

### Moderation Features (Optional)
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 9 | Content Reporting | Low | 6-8h | Pending |
| 10 | Admin Reports Dashboard | Low | 4-6h | Pending |

---

## Implementation Phases

### Phase 1: Profile Images (Avatar Upload)
**Priority:** High | **Estimate:** 8-10h

Replace 1-2 character avatars with uploadable profile images.

#### 1.1 Backend - File Upload Infrastructure
- [ ] Create `uploads/avatars/` directory structure
- [ ] Add multer middleware for file uploads
- [ ] `POST /api/profile/avatar` - Upload avatar image
  - Accept: jpg, png, gif, webp
  - Max size: 2MB
  - Resize to 256x256 max
  - Generate unique filename (userId + timestamp)
- [ ] `DELETE /api/profile/avatar` - Remove avatar (revert to letter)
- [ ] Serve static files from `/uploads/avatars/`
- [ ] Add `avatarUrl` field to user schema (nullable)

#### 1.2 Backend - Image Processing
- [ ] Install `sharp` for image resizing
- [ ] Auto-resize uploads to 256x256 (preserve aspect ratio)
- [ ] Generate thumbnail (64x64) for list views
- [ ] Strip EXIF metadata for privacy

#### 1.3 Frontend - Avatar Upload UI
- [ ] Update ProfileSettings with avatar upload section
- [ ] File picker with drag-and-drop support
- [ ] Preview before upload
- [ ] Upload progress indicator
- [ ] "Remove Image" button to revert to letter avatar
- [ ] Fallback: Show letter avatar if no image uploaded

#### 1.4 Frontend - Avatar Display
- [ ] Update `Avatar` component to handle both image URLs and letters
- [ ] Lazy loading for avatar images
- [ ] Placeholder while loading
- [ ] Graceful fallback on image load error

---

### Phase 2: About Me / Bio Section
**Priority:** High | **Estimate:** 4-6h

Add a bio/about section to user profiles that others can view.

#### 2.1 Backend
- [ ] Add `bio` field to user schema (max 500 characters)
- [ ] `PUT /api/profile` - Update to accept `bio` field
- [ ] `GET /api/users/:id/profile` - Public profile endpoint
  - Returns: displayName, avatar/avatarUrl, bio, handle, createdAt
  - Does NOT return: email, passwordHash, preferences

#### 2.2 Frontend - Edit Bio
- [ ] Add "About Me" textarea in ProfileSettings
- [ ] Character counter (0/500)
- [ ] Save with existing profile save button

#### 2.3 Frontend - View Profile
- [ ] Create `UserProfileModal` component
- [ ] Show avatar (large), display name, bio
- [ ] Clickable avatars/names open profile modal
- [ ] "Add Contact" / "Block" / "Mute" actions in modal
- [ ] Close on backdrop click or X button

---

### Phase 3: Display Name Only (Hide @handle)
**Priority:** High | **Estimate:** 2-3h

Simplify UI by showing only display names in most places.

#### 3.1 Identify All Handle Display Locations
- [ ] Message author display
- [ ] Participant list
- [ ] Contact list
- [ ] Wave creator
- [ ] Search results
- [ ] Typing indicators

#### 3.2 Update Display Logic
- [ ] Show only `displayName` by default
- [ ] Show `@handle` only in:
  - Profile settings (your own handle)
  - User profile modal (when viewing someone's profile)
  - @mention autocomplete
- [ ] Ensure displayName is always set (fallback to handle if empty)

#### 3.3 Hover/Click for Details
- [ ] Clicking a name opens UserProfileModal (from Phase 2)
- [ ] Optional: tooltip showing @handle on hover

---

### Phase 4: Emoji Picker Button Sizing Fix
**Priority:** Low | **Estimate:** 0.5h

Make emoji picker button consistent with GIF button.

#### Current State
- Emoji button: `😀` emoji character, larger font size
- GIF button: `GIF` text, monospace font, smaller

#### 4.1 Fix
- [ ] Change emoji button to text-based: `EMO` or keep emoji but match sizing
- [ ] Match padding, font-size, and styling to GIF button
- [ ] Both buttons should be visually consistent

---

### Phase 5: SQLite Database Migration
**Priority:** High | **Estimate:** 12-16h

Migrate from JSON files to SQLite for better performance and querying.

#### 5.1 Database Setup
- [ ] Install `better-sqlite3` (synchronous, fast)
- [ ] Create `data/cortex.db` database file
- [ ] Design schema:
  ```sql
  users (id, handle, email, passwordHash, displayName, avatar, avatarUrl, bio, ...)
  waves (id, title, privacy, groupId, createdBy, createdAt, ...)
  wave_participants (waveId, odego, archived, joinedAt)
  messages (id, waveId, authorId, parentId, content, createdAt, editedAt, ...)
  message_read_by (messageId, userId, readAt)
  contacts (userId, contactId, addedAt)
  contact_requests (id, fromUserId, toUserId, message, status, ...)
  groups (id, name, description, createdBy, ...)
  group_members (groupId, userId, role, joinedAt)
  group_invitations (id, groupId, invitedBy, invitedUserId, ...)
  moderation (id, type, userId, targetUserId, createdAt)
  handle_requests (id, userId, oldHandle, newHandle, status, ...)
  ```

#### 5.2 Migration Script
- [ ] Create `migrate-json-to-sqlite.js`
- [ ] Read all JSON files
- [ ] Insert into SQLite tables
- [ ] Verify data integrity
- [ ] Backup JSON files before migration

#### 5.3 Database Class Refactor
- [ ] Replace in-memory arrays with SQLite queries
- [ ] Update all CRUD methods
- [ ] Remove JSON file save methods
- [ ] Add proper indexes for common queries

#### 5.4 Testing
- [ ] All existing functionality works
- [ ] Performance benchmarks
- [ ] Data integrity checks

---

### Phase 6: Image/File Upload System
**Priority:** High | **Estimate:** 8-10h

Allow users to upload images directly instead of just pasting URLs.

#### 6.1 Backend
- [ ] Create `uploads/messages/` directory
- [ ] `POST /api/uploads` - Upload file
  - Accept: images (jpg, png, gif, webp)
  - Max size: 10MB
  - Return URL to uploaded file
- [ ] Serve uploaded files from `/uploads/messages/`
- [ ] Cleanup: Delete orphaned uploads periodically

#### 6.2 Frontend
- [ ] Add file upload button in message composer
- [ ] Drag-and-drop file onto message input
- [ ] Paste image from clipboard
- [ ] Upload progress indicator
- [ ] Insert uploaded image URL into message

---

### Phase 7: Message Pagination
**Priority:** Medium | **Estimate:** 6-8h

Virtual scrolling for waves with many messages.

#### 7.1 Backend
- [ ] `GET /api/waves/:id/messages?limit=50&before=messageId`
- [ ] Return messages in batches
- [ ] Include `hasMore` flag

#### 7.2 Frontend
- [ ] Load initial batch of messages
- [ ] "Load older messages" button at top
- [ ] Preserve scroll position when loading older
- [ ] Optional: Infinite scroll with intersection observer

---

### Phase 8: Full-Text Search (FTS)
**Priority:** Medium | **Estimate:** 4-6h

Database-level full-text search using SQLite FTS5.

#### 8.1 Backend
- [ ] Create FTS5 virtual table for messages
- [ ] `GET /api/search?q=query` - Use FTS for searching
- [ ] Highlight matching terms in results

#### 8.2 Frontend
- [ ] Update search to use new endpoint
- [ ] Show highlighted matches

---

## Data Schema Changes

### User Schema Additions
```javascript
{
  // Existing fields...
  avatarUrl: "string | null",  // URL to uploaded avatar image
  bio: "string | null",        // About me text (max 500 chars)
}
```

### New Endpoints Summary
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/profile/avatar` | Upload profile image |
| DELETE | `/api/profile/avatar` | Remove profile image |
| GET | `/api/users/:id/profile` | Get public profile |
| POST | `/api/uploads` | Upload message attachment |

---

## UI/UX Changes

### Display Name Simplification
**Before:**
```
Jared
@jempson
```

**After:**
```
Jared
```
(Click name to see full profile with @handle)

### Button Consistency
```
[ 😀 ] [ GIF ]  →  [ EMO ] [ GIF ]  (or matched sizing)
```

---

## Dependencies to Add

```bash
# Server
npm install multer sharp better-sqlite3
```

---

## Testing Checklist

### Profile Images
- [ ] Upload avatar image
- [ ] Avatar displays in all locations
- [ ] Remove avatar reverts to letter
- [ ] Large files rejected
- [ ] Invalid file types rejected

### About Me
- [ ] Edit and save bio
- [ ] Bio visible in profile modal
- [ ] Character limit enforced

### Display Names
- [ ] Only display name shown in messages
- [ ] Only display name shown in participant list
- [ ] Profile modal shows @handle
- [ ] @mention autocomplete still works

### SQLite Migration
- [ ] All data migrated correctly
- [ ] All features work after migration
- [ ] Performance improved

---

## Progress Log

### [Date TBD]
- Created v1.8.0 implementation plan

---

*Created: December 5, 2025*
