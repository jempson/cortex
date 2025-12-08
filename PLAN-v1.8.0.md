# Cortex v1.8.0 - Implementation Plan

## 🎯 RELEASE STATUS: IN PROGRESS (9/10 Phases Complete)

**Target Scope:** User Profiles, Scale & Organization
**Branch:** `v1.8.0`

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
| 5 | SQLite Database Migration | High | 12-16h | ✅ Complete |
| 6 | PWA Push Notifications | High | 8-10h | ✅ Complete |
| 7 | Image/File Upload System | High | 8-10h | ✅ Complete |
| 8 | Message Pagination | Medium | 6-8h | ✅ Complete |
| 9 | Full-Text Search (FTS) | Medium | 4-6h | ✅ Complete |
| 10 | Rich Media Embeds (YouTube, TikTok, etc.) | Medium | 10-14h | Pending |

### Moderation Features (Deferred)
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| - | Content Reporting | Low | 6-8h | Deferred to v1.9 |
| - | Admin Reports Dashboard | Low | 4-6h | Deferred to v1.9 |

---

## Implementation Phases

### Phase 1: Profile Images (Avatar Upload) ✅
**Priority:** High | **Estimate:** 8-10h | **Status:** Complete

Replace 1-2 character avatars with uploadable profile images.

#### 1.1 Backend - File Upload Infrastructure
- [x] Create `uploads/avatars/` directory structure
- [x] Add multer middleware for file uploads
- [x] `POST /api/profile/avatar` - Upload avatar image
  - Accept: jpg, png, gif, webp
  - Max size: 2MB
  - Resize to 256x256 max
  - Generate unique filename (userId + timestamp)
- [x] `DELETE /api/profile/avatar` - Remove avatar (revert to letter)
- [x] Serve static files from `/uploads/avatars/`
- [x] Add `avatarUrl` field to user schema (nullable)

#### 1.2 Backend - Image Processing
- [x] Install `sharp` for image resizing
- [x] Auto-resize uploads to 256x256 (preserve aspect ratio)
- [x] Convert to webp format for efficiency
- [x] Strip EXIF metadata for privacy (sharp default behavior)

#### 1.3 Frontend - Avatar Upload UI
- [x] Update ProfileSettings with avatar upload section
- [x] File picker button
- [x] Upload progress indicator
- [x] "Remove Image" button to revert to letter avatar
- [x] Fallback: Show letter avatar if no image uploaded

#### 1.4 Frontend - Avatar Display
- [x] Update `Avatar` component to handle both image URLs and letters
- [x] Lazy loading for avatar images
- [x] Graceful fallback on image load error

---

### Phase 2: About Me / Bio Section ✅
**Priority:** High | **Estimate:** 4-6h | **Status:** Complete

Add a bio/about section to user profiles that others can view.

#### 2.1 Backend
- [x] Add `bio` field to user schema (max 500 characters)
- [x] `PUT /api/profile` - Update to accept `bio` field
- [x] `GET /api/users/:id/profile` - Public profile endpoint
  - Returns: displayName, avatar/avatarUrl, bio, handle, createdAt
  - Does NOT return: email, passwordHash, preferences

#### 2.2 Frontend - Edit Bio
- [x] Add "About Me" textarea in ProfileSettings
- [x] Character counter (0/500)
- [x] Save with existing profile save button

#### 2.3 Frontend - View Profile
- [x] Create `UserProfileModal` component
- [x] Show avatar (large), display name, bio
- [x] Clickable avatars/names open profile modal
- [x] "Add Contact" / "Block" / "Mute" actions in modal
- [x] Close on backdrop click or X button

---

### Phase 3: Display Name Only (Hide @handle) ✅
**Priority:** High | **Estimate:** 2-3h | **Status:** Complete

Simplify UI by showing only display names in most places.

#### 3.1 Identify All Handle Display Locations
- [x] Message author display
- [x] Participant list
- [x] Contact list
- [x] Wave creator
- [x] Search results
- [x] Typing indicators

#### 3.2 Update Display Logic
- [x] Show only `displayName` by default
- [x] Show `@handle` only in:
  - Profile settings (your own handle)
  - User profile modal (when viewing someone's profile)
  - @mention autocomplete
- [x] Ensure displayName is always set (fallback to handle if empty)

#### 3.3 Hover/Click for Details
- [x] Clicking a name opens UserProfileModal (from Phase 2)
- [x] Optional: tooltip showing @handle on hover

---

### Phase 4: Emoji Picker Button Sizing Fix ✅
**Priority:** Low | **Estimate:** 0.5h | **Status:** Complete

Make emoji picker button consistent with GIF button.

#### Current State
- Emoji button: `😀` emoji character, larger font size
- GIF button: `GIF` text, monospace font, smaller

#### 4.1 Fix
- [x] Change emoji button to text-based: `EMO` or keep emoji but match sizing
- [x] Match padding, font-size, and styling to GIF button
- [x] Both buttons should be visually consistent

---

### Phase 5: SQLite Database Migration ✅
**Priority:** High | **Estimate:** 12-16h | **Status:** Complete

Migrate from JSON files to SQLite for better performance and querying.

#### 5.1 Database Setup
- [x] Install `better-sqlite3` (synchronous, fast)
- [x] Create `data/cortex.db` database file
- [x] Design schema: `schema.sql` with 14 tables
  - users, handle_history, contacts
  - waves, wave_participants
  - messages, message_read_by, message_history
  - groups, group_members
  - handle_requests, contact_requests, group_invitations
  - blocks, mutes, reports

#### 5.2 Migration Script
- [x] Create `migrate-json-to-sqlite.js`
- [x] Read all JSON files
- [x] Insert into SQLite tables with transaction
- [x] Verify data integrity with count comparison
- [x] Backup JSON files to `data/json-backup/`

#### 5.3 Database Class Refactor
- [x] Created `database-sqlite.js` with SQLite implementation
- [x] All CRUD methods using prepared statements
- [x] Environment variable `USE_SQLITE=true` to enable
- [x] Added 30+ indexes for common queries

#### 5.4 Testing
- [x] Migration script tested with dry-run mode
- [x] All data migrated successfully
- [x] Server starts and responds to API requests

---

### Phase 6: PWA Push Notifications
**Priority:** High | **Estimate:** 8-10h | **Status:** ✅ Complete

Enable real push notifications when the app is closed/backgrounded. Currently, notifications only work when the app is open (using browser Notification API). This phase adds server-sent push notifications via the Web Push API.

#### 6.1 Server - VAPID Keys & Web Push
- [x] Install `web-push` dependency
- [x] Generate VAPID keys (public/private key pair)
- [x] Store VAPID keys in environment variables
- [x] Create `push_subscriptions` table (SQLite) or JSON file
- [x] `POST /api/push/subscribe` - Save user's push subscription
- [x] `DELETE /api/push/subscribe` - Remove subscription
- [x] `POST /api/push/test` - Send test notification (dev only)
- [x] `GET /api/push/vapid-key` - Get public key for client

#### 6.2 Server - Sending Push Notifications
- [x] Create `sendPushNotification(userId, payload)` function
- [x] Create `broadcastToWaveWithPush()` function
- [x] Integrate with `new_message` WebSocket events
- [x] Send push when user is not connected via WebSocket
- [x] Handle expired/invalid subscriptions (auto-cleanup on 410/404)
- [ ] Rate limit push notifications (max 1 per wave per minute) - TODO

#### 6.3 Client - Subscription Management
- [x] Request notification permission (if not already granted)
- [x] Get push subscription from service worker: `registration.pushManager.subscribe()`
- [x] Send subscription to server on login
- [x] `subscribeToPush()` and `unsubscribeFromPush()` helper functions
- [x] `urlBase64ToUint8Array()` for VAPID key conversion
- [x] UI toggle in Profile Settings to enable/disable push
- [x] Push enabled state persisted in localStorage

#### 6.4 Service Worker - Push Handling
- [x] `sw.js` push event handler parses JSON payload
- [x] Shows notification with title, body, icon, badge
- [x] Click-to-open: Focus existing window or open new
- [x] `navigate-to-wave` message to navigate to specific wave
- [x] Dismiss action support
- [x] Updated to v1.8.0

#### 6.5 Testing Checklist
- [x] Push works when app is closed (verified on desktop)
- [x] Push works when app is backgrounded (verified on desktop)
- [ ] Push works on Android PWA (not tested - no proxy routing)
- [ ] Push works on iOS (not tested - limited iOS push support)
- [x] Push works on desktop browsers (verified)
- [x] Clicking notification opens correct wave
- [x] Toggle in settings works

---

### Phase 7: Image/File Upload System
**Priority:** High | **Estimate:** 8-10h | **Status:** ✅ Complete

Allow users to upload images directly instead of just pasting URLs.

#### 7.1 Backend
- [x] Create `uploads/messages/` directory
- [x] `POST /api/uploads` - Upload file
  - Accept: images (jpg, png, gif, webp)
  - Max size: 10MB
  - Processing: Resize to max 1200×1200, convert to webp (except GIFs)
  - Return URL to uploaded file
- [x] Serve uploaded files from `/uploads/messages/` (via existing static middleware)
- [ ] Cleanup: Delete orphaned uploads periodically (deferred - manual for now)

#### 7.2 Frontend
- [x] Add file upload button in message composer (IMG button, orange color)
- [x] Drag-and-drop file onto compose area (visual feedback with dashed border)
- [x] Paste image from clipboard (Ctrl+V with image)
- [x] Upload progress indicator (button shows "..." during upload)
- [x] Insert uploaded image URL into message (auto-embeds via detectAndEmbedMedia)

---

### Phase 8: Message Pagination
**Priority:** Medium | **Estimate:** 6-8h | **Status:** ✅ Complete

Virtual scrolling for waves with many messages.

#### 8.1 Backend
- [x] `GET /api/waves/:id/messages?limit=50&before=messageId` - New paginated endpoint
- [x] Return messages in batches (default 50, max 100)
- [x] Include `hasMore` flag
- [x] Modified `/api/waves/:id` to limit initial messages and return `hasMoreMessages`, `total_messages`

#### 8.2 Frontend
- [x] Initial load limited to 50 most recent messages
- [x] "Load older messages" button at top (shows count remaining)
- [x] Preserve scroll position when loading older (calculates scroll offset)
- [x] Merges older messages with existing and rebuilds message tree

---

### Phase 9: Full-Text Search (FTS)
**Priority:** Medium | **Estimate:** 4-6h | **Status:** ✅ Complete

Database-level full-text search using SQLite FTS5.

#### 9.1 Backend
- [x] Create FTS5 virtual table for messages (`messages_fts`)
- [x] Add triggers to keep FTS index in sync (insert, update, delete)
- [x] `GET /api/search?q=query` - Use FTS for searching with BM25 ranking
- [x] `snippet()` function for highlighted snippets with `<mark>` tags
- [x] Fallback to LIKE search if FTS query fails

#### 9.2 Frontend
- [x] Display server-provided snippets with HTML highlighting
- [x] CSS styling for `<mark>` tags (amber background, amber text)
- [x] Show author display name instead of @handle in results

#### 9.3 Implementation Details
- FTS5 virtual table with external content (synced via triggers)
- Prefix matching: `"term"*` for partial word matches
- BM25 scoring for relevance-ranked results
- Auto-migration: FTS table created on existing databases at startup
- Existing messages indexed on first FTS initialization

---

### Phase 10: Rich Media Embeds (YouTube, TikTok, etc.)
**Priority:** Medium | **Estimate:** 10-14h

Embed videos and rich content from popular platforms directly in messages.

#### 10.1 Supported Platforms
| Platform | Embed Type | URL Pattern |
|----------|------------|-------------|
| YouTube | iframe | `youtube.com/watch?v=`, `youtu.be/` |
| TikTok | iframe/oEmbed | `tiktok.com/@user/video/` |
| Twitter/X | oEmbed | `twitter.com/`, `x.com/` |
| Vimeo | iframe | `vimeo.com/` |
| Spotify | iframe | `open.spotify.com/track/`, `/album/`, `/playlist/` |
| Instagram | oEmbed | `instagram.com/p/`, `/reel/` |
| SoundCloud | oEmbed | `soundcloud.com/` |

#### 10.2 Backend Implementation
- [ ] Create `detectAndEmbedRichMedia()` function
- [ ] URL pattern matching for each platform
- [ ] Extract video/content IDs from URLs
- [ ] Generate secure iframe HTML with sandbox attributes
- [ ] `GET /api/oembed?url=` - Proxy endpoint for oEmbed requests
  - Cache oEmbed responses (15 min TTL)
  - Rate limit: 30 requests/min per user
- [ ] Whitelist approach: Only allow known-safe embed domains
- [ ] Store embed metadata in message (platform, contentId, thumbnail)

#### 10.3 Security Considerations
- [ ] **iframe Sandboxing**: `sandbox="allow-scripts allow-same-origin allow-presentation"`
- [ ] **CSP Headers**: Update Content-Security-Policy for embed domains
  ```
  frame-src 'self' https://www.youtube.com https://player.vimeo.com
            https://www.tiktok.com https://open.spotify.com
            https://platform.twitter.com https://www.instagram.com;
  ```
- [ ] **No auto-play**: Embeds should not auto-play audio/video
- [ ] **Size limits**: Max embed dimensions (560x315 for video)
- [ ] **Fallback**: Link preview card if embed fails or is blocked

#### 10.4 Frontend Implementation
- [ ] `RichEmbed` component for rendering embeds
- [ ] Lazy loading: Only load iframe when scrolled into view
- [ ] Loading state with platform icon and "Loading embed..."
- [ ] Error state: "Embed unavailable" with link fallback
- [ ] Click-to-load option for privacy-conscious users
- [ ] Responsive sizing (100% width, aspect ratio preserved)

#### 10.5 Link Preview Cards (Fallback)
When embed is unavailable or user prefers link cards:
- [ ] Fetch Open Graph metadata (title, description, image)
- [ ] Display as clickable card with thumbnail
- [ ] Cache OG metadata server-side

#### 10.6 Message Composer UX
- [ ] Auto-detect embeddable URLs as user types
- [ ] Show preview of embed before sending
- [ ] Option to send as plain link vs embed
- [ ] "Embed" badge on URLs that will be embedded

#### 10.7 Database Changes
```sql
-- Optional: Store embed metadata for faster rendering
ALTER TABLE messages ADD COLUMN embed_data TEXT;
-- JSON: { "platform": "youtube", "contentId": "dQw4w9WgXcQ", "thumbnail": "...", "title": "..." }
```

#### 10.8 Testing Checklist
- [ ] YouTube video embed (various URL formats)
- [ ] TikTok video embed
- [ ] Twitter/X post embed
- [ ] Spotify track/playlist embed
- [ ] Invalid/private content handling
- [ ] CSP not blocking embeds
- [ ] Mobile responsiveness
- [ ] Fallback when embed blocked by browser

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

### December 5, 2025
- Created v1.8.0 implementation plan
- ✅ Updated package versions to 1.8.0-alpha
- ✅ **Phase 4**: Fixed emoji picker button sizing (changed to "EMO" text, matched GIF button styling)
- ✅ **Phase 3**: Display name only - removed @handle from messages, participants, contacts, wave list
- ✅ **Phase 2**: About Me / Bio section
  - Backend: `bio` field in user schema, `PUT /api/profile` accepts bio, `GET /api/users/:id/profile`
  - Frontend: Bio textarea with 500 char limit, `UserProfileModal` component
  - Clickable names/avatars open profile modal with Add Contact/Block/Mute actions
- ✅ **Phase 1**: Profile images (avatar upload)
  - Backend: Installed multer + sharp, `POST /api/profile/avatar`, `DELETE /api/profile/avatar`
  - Image processing: 256×256 resize, webp conversion, EXIF stripping
  - Frontend: Avatar component supports imageUrl with lazy loading and error fallback
  - ProfileSettings: Upload button, remove button, progress indicator

- ✅ **Message Layout Cleanup** (UX improvement)
  - Consolidated 4-row message footer into 2 rows:
    - Row 1: Reply | Collapse | ✏️ | ✕ | 😀 | reactions inline
    - Row 2: ✓N compact read count (expandable)
  - Edit/Delete buttons shortened to icon-only (✏️, ✕)
  - Reactions moved inline with action buttons (separated by │)
  - Read receipts simplified: "✓3" instead of "Seen by 3 people"

- ✅ **Emoji Picker Improvements** (UX polish)
  - Removed redundant CLOSE button (click EMO button to dismiss)
  - Fixed centering at all font sizes using fixed-size buttons with flexbox
  - Changed to 8-column grid on desktop (16 emojis, 2 rows)
  - Button size: 32×32px desktop, 44×44px mobile

- ✅ **Profile Pictures in Messages**
  - Server: Added `sender_avatar_url` to message responses
  - Client: ThreadedMessage passes `imageUrl` to Avatar component
  - Users with uploaded avatars now show their picture in wave messages

- ✅ **Auth Response Fix** (bug fix)
  - Added `avatarUrl` and `bio` to login response (`POST /api/auth/login`)
  - Added `avatarUrl` and `bio` to register response (`POST /api/auth/register`)
  - Added `avatarUrl` and `bio` to me endpoint (`GET /api/auth/me`)
  - Added `avatarUrl` to profile update response (`PUT /api/profile`)
  - **Issue**: Profile image/bio not persisting after logout/login
  - **Fix**: Auth endpoints now return all user fields consistently

### Remaining
- ~~Phase 5: SQLite Database Migration~~ ✅
- ~~Phase 6: PWA Push Notifications~~ ✅
- ~~Phase 7: Image/File Upload System~~ ✅
- ~~Phase 8: Message Pagination~~ ✅
- ~~Phase 9: Full-Text Search (FTS)~~ ✅
- **Phase 10: Rich Media Embeds** ⏳ (NEXT)

- ✅ **Phase 8**: Message Pagination
  - Backend: New `GET /api/waves/:id/messages?limit=50&before=messageId` endpoint
  - Modified existing wave endpoint to limit initial load to 50 messages
  - Added `hasMoreMessages` and `total_messages` to wave response
  - Frontend: "Load older messages" button at top of wave
  - Scroll position preserved when loading older messages
  - Messages merged and tree rebuilt on load more

- ✅ **Phase 7**: Image/File Upload System
  - Backend: `POST /api/uploads` endpoint with multer + sharp
    - 10MB max file size
    - Accepts: jpg, png, gif, webp
    - Resizes to max 1200×1200, converts to webp (except GIFs)
    - Serves from `/uploads/messages/`
  - Frontend: IMG button in message composer (orange, matches EMO/GIF style)
    - Drag-and-drop onto compose area with visual feedback
    - Paste image from clipboard (Ctrl+V)
    - Progress indicator (button shows "...")
    - Uploaded URL inserted into message (auto-embeds on send)

- ✅ **Phase 9**: Full-Text Search (FTS)
  - Backend: FTS5 virtual table `messages_fts` for fast full-text search
  - Triggers: Auto-sync FTS index on message insert/update/delete
  - Search: BM25 ranking for relevance-ordered results
  - Snippets: `snippet()` function with `<mark>` tag highlighting
  - Fallback: LIKE search if FTS query fails (special characters)
  - Migration: Auto-creates FTS table and indexes existing messages
  - Frontend: Server-provided snippets rendered with HTML highlighting
  - Styling: CSS `mark` tag styled to match Firefly theme

### December 8, 2025
- ✅ **Phase 5**: SQLite Database Migration
  - Installed `better-sqlite3` dependency
  - Created `schema.sql` with 14 tables and 30+ indexes
  - Created `migrate-json-to-sqlite.js` migration script
    - Dry-run mode (`--dry-run`) for testing
    - Auto-backup of JSON files to `data/json-backup/`
    - Transaction-based migration for data integrity
    - Verification step compares record counts
  - Created `database-sqlite.js` with SQLite implementation
    - Drop-in replacement for JSON database
    - All CRUD methods using prepared statements
    - Same API as original Database class
  - Environment variable `USE_SQLITE=true` to switch databases
  - Migration tested successfully (5 users, 5 waves, 67 messages, 3 groups)

---

*Created: December 5, 2025*
