# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cortex is a federated communication platform inspired by Google Wave with a Firefly aesthetic. It uses a client-server architecture with real-time WebSocket communication.

**Tech Stack:**
- **Server:** Node.js + Express + WebSocket (ws)
- **Client:** React (single JSX file) + Vite
- **Storage:** SQLite (default) or JSON files

## Development Commands

### Server Development
```bash
cd server
npm install              # Install dependencies
npm start                # Start production server (port 3001)
npm run dev              # Start with hot-reload (--watch flag)
```

### Client Development
```bash
cd client
npm install              # Install dependencies
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run preview          # Preview production build
```

### Running Both
Start server first (port 3001), then client (port 3000). Client proxies API requests to server.

## Core Architecture

### Server Structure (`server/server.js` - single file, ~1382 lines)

The server is organized into clear sections (marked with `// ============`):

1. **Configuration** (lines 17-38): Environment variables, JWT settings, data file paths
2. **Security Layers:**
   - Rate limiters: login (5/15min), register (3/hour), API (100/min)
   - Account lockout: 5 failed attempts = 15 minute lockout
   - Input sanitization: All user input sanitized with `sanitize-html`
   - Password validation: 8+ chars, uppercase, lowercase, number
3. **Database Class** (lines 130-782): In-memory data with JSON file persistence
   - Separated files: `users.json`, `waves.json`, `messages.json`, `groups.json`, `handle-requests.json`, `contact-requests.json`, `group-invitations.json`
   - Methods grouped by entity: User, Contact, Group, Wave, Message, ContactRequest, GroupInvitation
4. **Express Routes:** RESTful API endpoints with JWT authentication
5. **WebSocket Server** (lines 1274-1356): Real-time event broadcasting

### Client Structure (`client/CortexApp.jsx` - single file, ~1623 lines)

Single-page React app with all components in one file:

1. **Configuration & Contexts** (lines 0-100): API/WS URLs, AuthContext, storage helpers
2. **Custom Hooks:**
   - `useAPI()`: Authenticated fetch wrapper with auto-logout on 401
   - `useWebSocket()`: WebSocket connection manager
   - `useWindowSize()`: Responsive breakpoints (mobile <768px)
3. **UI Components** (lines 100-1380): ScanLines, GlowText, Avatar, Toast, etc.
4. **Main Views:** LoginScreen, WaveList, WaveView, ContactsView, GroupsView, ProfileSettings
5. **App Component** (lines 1380-end): Main layout and state management

### Data Model

**Users (UUID-based identity):**
- `id`: Immutable UUID (used in all references)
- `handle`: Changeable username (admin-approved, 30-day cooldown)
- `displayName`, `avatar`: Freely changeable
- `avatarUrl`: Profile image URL (uploaded via `/api/profile/avatar`)
- `bio`: About me text (max 500 characters)
- `handleHistory[]`: Audit trail of handle changes
- `preferences`: User customization settings (theme, fontSize, colorMode)
  - `theme`: 'firefly' (default), 'highContrast', 'light'
  - `fontSize`: 'small', 'medium', 'large', 'xlarge'
  - `colorMode`: 'default' (future: accessibility modes)
- Old handles reserved for 90 days

**Waves (formerly "Threads"):**
- Privacy levels: private (◉), group (◈), cross-server (◇), public (○)
- Personal archiving: Users can archive waves without affecting others
- Participants tracked separately in `waves.participants[]`
- Waves can be created via "ripple" from droplets (v1.10.0+)
- Ripple chain tracking for nested ripples (`breakout_chain` field)

**Droplets (formerly "Messages"):**
- Threaded structure with `parentId` for replies
- Edit history tracked in `droplets.history[]`
- Content stored with version numbers
- @mentions stored as UUIDs, rendered as current handles
- Read tracking via `readBy[]` array containing user IDs who have read the droplet
- Author automatically added to `readBy` on droplet creation
- Click-to-read UI: Droplets marked as read only when explicitly clicked
- Can be "rippled" to create new waves (v1.10.0+)
- Focus View allows viewing any droplet as its own wave-like context

**Groups:**
- Separate `groups.groups[]` and `groups.members[]` arrays
- Role-based access: admin/member

## Key Patterns

### Authentication Flow
1. Login → JWT token (7-day expiry) stored in localStorage
2. All API calls use `Authorization: Bearer <token>` header
3. WebSocket authenticates via `{"type": "auth", "token": "..."}` message
4. Token validation in middleware: `authenticateToken()` function

### Real-Time Updates (WebSocket Events)
- Server broadcasts: `new_droplet`, `droplet_edited`, `droplet_deleted`, `droplet_rippled`, `wave_created`, `wave_updated`, `wave_deleted`, `handle_request_reviewed`
- Legacy events (`new_message`, `message_edited`, `message_deleted`) still broadcast for backward compatibility
- Client auto-reconnects and re-authenticates on disconnect
- Connected users shown with green status indicators

### Security Practices
- All user input sanitized before storage
- Passwords hashed with bcrypt (12 rounds)
- Rate limiting on auth endpoints
- Account lockout tracking in memory (Map)
- Helmet.js security headers enabled
- CORS configured via `ALLOWED_ORIGINS` env var
- **Media Embedding Security (v1.3.2+):**
  - HTML sanitization with strict whitelist (`sanitize-html`)
  - Allowed tags: img, a, br, p, strong, em, code, pre
  - Allowed protocols: http, https (no data URIs for images)
  - Auto-embedding detects image URLs (jpg, jpeg, png, gif, webp)
  - External images loaded with lazy loading
  - All links open in new tab with `rel="noopener noreferrer"`

### Data Persistence
Two storage backends are available (v1.8.0+):

**JSON Files (default):**
- Database class methods call `saveUsers()`, `saveWaves()`, etc. after mutations
- Atomic writes to individual JSON files
- Simple but slower for large datasets

**SQLite (recommended for production):**
- Enable with `USE_SQLITE=true` environment variable
- Database file: `data/cortex.db`
- Schema: `schema.sql` (14 tables with indexes)
- Better performance and query capabilities
- Migration script: `node migrate-json-to-sqlite.js`
  - Use `--dry-run` to preview without changes
  - Backs up JSON files to `data/json-backup/`
- SQLite class: `database-sqlite.js`

Demo data seeded if `SEED_DEMO_DATA=true` (password: "Demo123!")

## Important Implementation Details

### Handle Change System
- Requests stored in `handle-requests.json` with status: pending/approved/rejected
- Admin endpoints: `GET /api/admin/handle-requests`, `POST /api/admin/handle-requests/:id/review`
- On approval: old handle added to `handleHistory`, `lastHandleChange` timestamp updated
- WebSocket broadcasts `handle_request_reviewed` to affected user

### Wave Archiving
- Per-user archive state in `waves.participants[].archived` boolean
- Archived waves fetched via separate endpoint: `GET /api/waves/archived`
- Archive/unarchive: `POST /api/waves/:id/archive` and `/api/waves/:id/unarchive`

### Wave Deletion (v1.3.2+)
- Only wave creators can delete waves (authorization check)
- Cascade deletes: wave → participants → messages → message history
- WebSocket broadcast `wave_deleted` to all participants
- Endpoint: `DELETE /api/waves/:id`
- Client shows confirmation modal before deletion
- Participants auto-redirected to wave list if viewing deleted wave

### Media Embedding & Rich Content (v1.3.2+)
- **Auto-detection**: Image URLs automatically embedded (jpg, jpeg, png, gif, webp)
- **Emoji Picker**: 16 common emojis in popup picker
- **Media Input Panel**: URL input for inserting images/GIFs
- **Multi-line Messages**: Textarea with Shift+Enter for new lines, Enter to send
- **Content Rendering**: Messages rendered with `dangerouslySetInnerHTML` after sanitization
- **Server-side Processing**: `detectAndEmbedMedia()` function converts URLs to `<img>` tags
- **Security**: All HTML sanitized before storage and display

### User Preferences & Customization (v1.3.2+, updated v1.12.0)
- **Theme Selection**: 5 themes with CSS variable-based styling (v1.12.0)
  - Firefly (default): Classic green terminal aesthetic with enhanced mobile contrast
  - High Contrast: Maximum readability with sharper borders and brighter text
  - AMOLED Black: True black (#000) background for OLED screens
  - Light Mode: Light background for daytime use
  - Ocean Blue: Blue-tinted dark theme alternative
- **CSS Variables**: All colors use CSS custom properties for theme switching
  - Background: `--bg-base`, `--bg-elevated`, `--bg-surface`, `--bg-hover`, `--bg-active`
  - Text: `--text-primary`, `--text-secondary`, `--text-dim`, `--text-muted`
  - Borders: `--border-primary`, `--border-secondary`, `--border-subtle`
  - Accents: `--accent-amber`, `--accent-teal`, `--accent-green`, `--accent-orange`, `--accent-purple`
  - Glows/Overlays: `--glow-*`, `--overlay-*` variants for transparency effects
- **Theme Application**: `data-theme` attribute on `<html>` element
- **Font Size Control**: Small (0.9x), Medium (1x), Large (1.15x), X-Large (1.3x)
- **Preferences API**: `PUT /api/profile/preferences` to update settings
- **Server Validation**: Themes validated against: firefly, highContrast, amoled, light, ocean

### Per-Message Read Tracking (v1.4.0+)
- **Click-to-Read Pattern**: Messages marked as read only when explicitly clicked by user
- **readBy Array**: Each message has `readBy: [userId, ...]` tracking which users have read it
- **Visual Indicators**: Unread messages display with amber border (#ffd23f) and background
- **Backend Endpoint**: `POST /api/messages/:id/read` marks individual message as read
- **Unread Count**: Calculated by filtering messages where `!readBy.includes(userId)`
- **Database Method**: `markMessageAsRead(messageId, userId)` adds user to readBy array
- **Auto-Initialize**: Author automatically added to readBy on message creation
- **Backward Compatible**: Old messages get readBy arrays initialized on first access
- **Scroll Preservation**: Clicking messages or replying preserves scroll position to prevent disruptive jumping in long waves
- **Scroll-to-Unread**: When opening a wave, automatically scrolls to first unread message or bottom if all read
  - Uses `data-message-id` attribute on message elements for scroll targeting
  - `hasScrolledToUnreadRef` prevents re-scrolling on WebSocket updates
  - Smooth scroll animation with `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- **Client Storage**: Theme/font applied via CSS variables and inline styles
- **Future**: Full CSS variable refactoring for complete theme support

### Admin Panel (v1.3.2+)
- **Handle Request Management**: Admins see pending handle change requests
- **UI Location**: ProfileSettings → Admin Panel section (visible to admins only)
- **Actions**: Approve or reject with optional reason
- **Component**: `HandleRequestsList` component
- **Real-time Updates**: WebSocket notification on review

### Progressive Web App (v1.6.0+)
- **Installable**: Add to home screen on Android (Chrome) and iOS (Safari)
- **Service Worker**: `client/public/sw.js` handles caching and offline support
  - Stale-while-revalidate for static assets
  - Network-only for API calls (real-time data)
  - Auto-updates with hourly checks
- **Manifest**: `client/public/manifest.json` defines app metadata
  - Theme color: #0ead69 (Cortex green)
  - Background: #050805 (dark green)
  - Display: standalone (full-screen app)
- **Icons**: 13 PNG icons in `client/public/icons/`
  - Sizes: 16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512
  - Maskable icons for Android adaptive icons
  - Generator script: `generate-icons.cjs`
- **InstallPrompt Component**: Custom install banner
  - Appears after 2nd visit or 30 seconds
  - 7-day cooldown after dismissal
  - Detects standalone mode
- **OfflineIndicator Component**: Orange banner when offline
- **iOS Support**: apple-touch-icon, status bar styling

### PWA Push Notifications (v1.8.0+, updated v1.8.1)
Server-sent push notifications for offline/background users via Web Push API.

- **Server Setup**:
  - `web-push` dependency for sending push notifications
  - VAPID keys (public/private) stored in environment variables
  - `push_subscriptions` table (SQLite) or JSON file for storing subscriptions
- **API Endpoints**:
  - `GET /api/push/vapid-key` - Get public VAPID key for client subscription
  - `POST /api/push/subscribe` - Save user's push subscription (body: `{ subscription }`)
  - `DELETE /api/push/subscribe` - Remove subscription (body: `{ endpoint? }`)
  - `POST /api/push/test` - Send test notification (development)
- **Server Functions**:
  - `sendPushNotification(userId, payload)` - Send push to specific user
  - `broadcastToWaveWithPush()` - Always sends push (v1.8.1: service worker filters by visibility)
  - Automatic cleanup of expired subscriptions (410/404 errors)
- **Client Integration**:
  - `subscribeToPush(token)` - Subscribe to push on login
  - `unsubscribeFromPush(token)` - Unsubscribe when user disables
  - Push toggle in Profile Settings → Display Preferences
  - `cortex_push_enabled` localStorage key for user preference
  - iOS warning displayed (Web Push not supported on iOS)
- **Service Worker** (`sw.js`):
  - Push event handler parses JSON payload
  - Shows notification with title, body, icon, badge, vibration
  - Click-to-open: focuses existing window or opens new
  - `navigate-to-wave` message to open specific wave
  - **v1.8.1**: Checks `visibilityState` - only shows notification when app is backgrounded/closed
  - **v1.8.1**: Unique tags per message (`cortex-msg-{messageId}`) to prevent replacement
- **Payload Format**:
  ```javascript
  {
    title: 'New message in Wave Name',
    body: 'Sender: Message preview...',
    url: '/?wave={waveId}',
    waveId: 'uuid',
    messageId: 'msg-uuid'  // v1.8.1: for unique notification tags
  }
  ```
- **Environment Variables**:
  - `VAPID_PUBLIC_KEY` - Public key for client subscription
  - `VAPID_PRIVATE_KEY` - Private key for signing push messages
  - `VAPID_EMAIL` - Contact email (format: `mailto:admin@domain.com`)
- **Platform Limitations**:
  - **iOS/Safari**: Does NOT support Web Push API for PWAs (Apple limitation)
  - **Android**: Full support in Chrome, Edge, Firefox
  - **Desktop**: Full support in all major browsers

### Read Receipts Display (v1.6.0+, updated v1.8.0)
Visual UI for the per-message read tracking system (builds on v1.4.0 backend).

- **Participant Read Status Bar**: Wave header shows all participants
  - Green ✓ for users who've read latest message
  - Gray ○ for users with unread messages
  - Located below wave title
- **Per-Message Receipts**: Compact "✓N" display (updated v1.8.0)
  - Shows checkmark and count: `✓3` instead of "Seen by 3 people"
  - `<details>` element expands to show names with green badges
  - Located below action buttons row
- **Mark All Read Button**: One-click to mark all unread as read
  - Only appears when unread messages exist
  - Calls `POST /api/messages/:id/read` for each unread message
  - Shows toast with count of messages marked

### Contact Request System (v1.7.0+)
Users must send contact requests that recipients can accept or decline.

- **Data Storage**: `contact-requests.json` with status: pending/accepted/declined
- **API Endpoints**:
  - `POST /api/contacts/request` - Send contact request (body: `{ toUserId, message? }`)
  - `GET /api/contacts/requests` - Get received pending requests
  - `GET /api/contacts/requests/sent` - Get sent pending requests
  - `POST /api/contacts/requests/:id/accept` - Accept (creates mutual contact)
  - `POST /api/contacts/requests/:id/decline` - Decline request
  - `DELETE /api/contacts/requests/:id` - Cancel sent request
- **WebSocket Events**: `contact_request_received`, `contact_request_accepted`, `contact_request_declined`, `contact_request_cancelled`
- **UI Components**: `ContactRequestsPanel`, `SentRequestsPanel`, `SendContactRequestModal`
- **Participant Integration**: Wave participants show contact status with quick-action buttons
- **Badge**: Teal badge on Contacts nav shows pending request count

### Group Invitation System (v1.7.0+)
Users must be invited to groups and can accept or decline.

- **Data Storage**: `group-invitations.json` with status: pending/accepted/declined
- **API Endpoints**:
  - `POST /api/groups/:id/invite` - Invite users (body: `{ userIds: [], message? }`)
  - `GET /api/groups/invitations` - Get pending invitations
  - `GET /api/groups/:id/invitations/sent` - Get sent invitations for a group
  - `POST /api/groups/invitations/:id/accept` - Accept (adds to group)
  - `POST /api/groups/invitations/:id/decline` - Decline invitation
  - `DELETE /api/groups/invitations/:id` - Cancel sent invitation
- **WebSocket Events**: `group_invitation_received`, `group_invitation_accepted`, `group_invitation_declined`, `group_invitation_cancelled`
- **UI Components**: `GroupInvitationsPanel`, `InviteToGroupModal`
- **Leave Group**: All members can leave via "LEAVE GROUP" button
- **Badge**: Amber badge on Groups nav shows pending invitation count

### Group Wave Access Control (v1.7.0+)
Group membership is strictly enforced for group wave access.

- **Access Rules**: Group waves require current group membership (participant status alone is insufficient)
- **Leave Behavior**: Leaving a group immediately revokes access to all group waves
- **Cleanup**: `removeGroupMember()` removes user from wave participants for that group's waves
- **Security Functions**:
  - `canAccessWave()`: Checks group membership before participant status for group waves
  - `getWavesForUser()`: Only returns group waves where user is current member

### User Moderation (Block/Mute) (v1.7.0+)
Users can block or mute other users for privacy control.

- **Data Storage**: `moderation.json` with `blocks[]` and `mutes[]` arrays
- **Block Effects**:
  - Blocked users cannot send contact requests to the blocker
  - Blocked users cannot invite the blocker to groups
  - Messages from blocked users are hidden in waves
  - Block is bidirectional: if A blocks B, B is also effectively blocked from A
- **Mute Effects**:
  - Muted users can still interact, but their messages are hidden from view
  - Mute is one-directional: only the muter's view is affected
- **API Endpoints**:
  - `POST /api/users/:id/block` - Block user
  - `DELETE /api/users/:id/block` - Unblock user
  - `POST /api/users/:id/mute` - Mute user
  - `DELETE /api/users/:id/mute` - Unmute user
  - `GET /api/users/blocked` - Get blocked users list
  - `GET /api/users/muted` - Get muted users list
- **Database Methods**: `blockUser()`, `unblockUser()`, `muteUser()`, `unmuteUser()`, `isBlocked()`, `isMuted()`, `getBlockedUsers()`, `getMutedUsers()`
- **UI Components**:
  - Participant panel ⋮ dropdown menu with MUTE/BLOCK options
  - Visual indicators for blocked (red border, ⊘ BLOCKED label) and muted (gray, 🔇 MUTED label) users
  - Profile Settings → Blocked & Muted Users management section

### GIF Search Integration (v1.7.0+)
GIPHY API integration for searching and inserting GIFs into messages.

- **Configuration**: Set `GIPHY_API_KEY` environment variable (required for GIF search to work)
- **API Endpoints**:
  - `GET /api/gifs/search?q=query&limit=20&offset=0` - Search GIFs by keyword
  - `GET /api/gifs/trending?limit=20&offset=0` - Get trending GIFs
- **Rate Limiting**: 30 searches per minute per user
- **Content Filtering**: PG-13 rating filter applied
- **Response Format**:
  ```javascript
  { gifs: [{ id, title, url, preview, width, height }], pagination: { total_count, count, offset } }
  ```
- **UI Components**:
  - GIF button in message composer (teal color, between emoji and send)
  - `GifSearchModal` component with search input and grid display
  - Trending GIFs shown on modal open
  - Debounced search (500ms delay)
  - Click GIF to insert URL into message (auto-embedded on send)
- **GIPHY Attribution**: Footer in modal as required by GIPHY terms

### Profile Images (v1.8.0+)
Uploadable profile pictures with automatic processing.

- **Upload Endpoint**: `POST /api/profile/avatar`
  - Accepts: jpg, jpeg, png, gif, webp (max 2MB)
  - Processing: Resize to 256×256, convert to webp, strip EXIF metadata
  - Storage: `/uploads/avatars/{userId}-{timestamp}.webp`
- **Delete Endpoint**: `DELETE /api/profile/avatar`
- **Static Serving**: Files served from `/uploads/avatars/`
- **User Schema**: `avatarUrl` field stores URL path
- **Avatar Component**: Supports both `imageUrl` and letter fallback
  - Lazy loading with `loading="lazy"`
  - Error handling falls back to letter avatar
- **Message Display**: Messages include `sender_avatar_url` field
  - Profile images appear next to messages in waves
  - ThreadedMessage passes `imageUrl` to Avatar component
- **Auth Responses**: Login, register, and `/api/auth/me` all return `avatarUrl`
- **Dependencies**: `multer` (file upload), `sharp` (image processing)
- **Nginx/Proxy Requirements**:
  - Must add `/uploads` location proxying to port 3001 (see README.md)
  - **Nginx Proxy Manager**: Must disable "Cache Assets" option, otherwise NPM intercepts image requests and returns cached HTML instead of images

### Message Image Upload (v1.8.0+)
Upload images directly in messages instead of pasting URLs.

- **Upload Endpoint**: `POST /api/uploads`
  - Accepts: jpg, jpeg, png, gif, webp (max 10MB)
  - Processing: Resize to max 1200×1200, convert to webp (except animated GIFs)
  - Storage: `/uploads/messages/{userId}-{timestamp}.{ext}`
  - Returns: `{ success: true, url: "/uploads/messages/..." }`
- **Static Serving**: Files served from `/uploads/messages/`
- **Frontend Features**:
  - **IMG Button**: Orange button in message composer (between GIF and SEND)
  - **Drag-and-Drop**: Drop images onto compose area (visual feedback with dashed border)
  - **Clipboard Paste**: Paste images with Ctrl+V
  - **Progress Indicator**: Button shows "..." during upload
  - **Auto-Embed**: Uploaded URL inserted into message, auto-embeds via `detectAndEmbedMedia()`
- **Display**: Images shown as thumbnails (200×150 max) with click-to-zoom
  - **Thumbnail**: `object-fit: cover` for nice cropping, subtle border
  - **Lightbox**: Click thumbnail to view full-size image in overlay
  - **ImageLightbox Component**: Full-screen overlay with close button
- **Client State**: `uploading` state disables SEND button during upload
- **Dependencies**: Uses same `multer` + `sharp` as avatar uploads
- **Vite Proxy**: `/uploads` proxied to backend in development mode

### About Me / Bio (v1.8.0+)
User bio/about section visible on profiles.

- **User Schema**: `bio` field (max 500 characters, nullable)
- **Update**: `PUT /api/profile` accepts `bio` field
- **Public Profile**: `GET /api/users/:id/profile` returns public fields:
  - `id`, `handle`, `displayName`, `avatar`, `avatarUrl`, `bio`, `createdAt`
  - Does NOT expose: email, passwordHash, preferences
- **UI**: Textarea with character counter in Profile Settings

### User Profile Modal (v1.8.0+)
Modal for viewing other users' public profiles.

- **Component**: `UserProfileModal`
- **Trigger**: Click on user avatar/name in messages, participants, contacts
- **Display**: Large avatar, display name, @handle, bio, join date
- **Actions**: Add Contact, Block, Mute (for non-current user)
- **Props**: `userId`, `currentUser`, `contacts`, `blockedUsers`, `mutedUsers`, handlers

### Display Name Simplification (v1.8.0+)
Cleaner UI showing display names instead of @handles.

- **@handle Hidden In**: Message headers, wave list, participant list, contacts, search results
- **@handle Shown In**: Profile Settings (own handle), User Profile Modal
- **Implementation**: Removed `@{handle}` lines from various components
- **Clickable Names**: Names/avatars open UserProfileModal via `onShowProfile` prop

### Droplet Threading
- Droplets have `parentId` (null for root droplets)
- Client renders recursively with depth tracking
- Playback mode: Shows droplets in chronological order with timeline slider
- **Deleted Droplets**: Only show "[Droplet deleted]" placeholder if droplet has replies
  - Droplets deleted with no children disappear completely
  - Preserves thread context for replies while avoiding clutter
- **Threading Depth Limit (v1.10.0+)**:
  - Inline threading limited to 3 levels in WaveView
  - At depth 3+, Reply button changes to "FOCUS TO REPLY"
  - Visual depth indicator banner: "Thread depth limit reached"
  - Focus View allows unlimited depth

### Focus View (v1.10.0+)
View any droplet with replies as its own wave-like context.

- **Desktop Entry**: Click "⤢ FOCUS" button on droplets with children
- **Mobile Entry**: Tap droplet content area (shows "Tap to focus" hint)
- **Breadcrumb Navigation**: `Wave Name › Droplet 1 › Droplet 2 › Current`
  - Clickable items navigate to any level
  - Truncation at 4+ levels: `Wave › ... › Parent › Current`
  - Mobile uses shorter truncation (3+ levels)
- **Navigation Stack**: Push/pop model for focus depth
  - `handleFocusDroplet()` - enter focus from wave
  - `handleFocusDeeper()` - focus within focus
  - `handleFocusBack()` - pop one level
  - `handleFocusClose()` - return to wave view
- **Compose in Focus**: Replies default to focused droplet
- **Mobile Gestures**: Swipe right to go back (80px threshold)
- **Components**: `FocusView` (main component, ~450 lines)

### Ripple System (v1.10.0+)
Spin off a droplet and its replies into a new wave.

- **User Flow**:
  1. Click "◈ RIPPLE" button on any droplet
  2. RippleModal opens with title input and participant selection
  3. New wave created with droplet tree
  4. Original droplet shows "Rippled to wave..." link card
  5. Click link card to navigate to new wave
- **Database Fields**:
  - `droplets.broken_out_to` - References new wave ID
  - `droplets.original_wave_id` - Tracks source wave
  - `waves.root_droplet_id` - Points to rippled droplet
  - `waves.broken_out_from` - References parent wave
  - `waves.breakout_chain` - JSON array of lineage for nested ripples
- **API Endpoint**: `POST /api/droplets/:id/ripple`
  - Body: `{ title: string, participants: string[] }`
  - Returns: `{ success: true, newWave: {...} }`
- **WebSocket Events**:
  - `droplet_rippled` - Sent to original wave participants
  - `wave_created` - Sent to new wave participants
- **Components**:
  - `RippleModal` - Title input, participant selection, preview
  - `RippledLinkCard` - Visual link card for rippled droplets
- **Nested Ripples**: Rippling a droplet in a rippled wave builds the breakout chain

### Message Pagination (v1.8.0+)
Waves with many messages load in batches for better performance.

- **Initial Load**: `/api/waves/:id` returns 50 most recent messages by default
  - Response includes `hasMoreMessages: true/false` and `total_messages` count
  - `limit` query param to adjust (max 100)
- **Load More Endpoint**: `GET /api/waves/:id/messages?limit=50&before=messageId`
  - `before`: Message ID to fetch messages older than
  - Returns `{ messages, hasMore, total }`
- **Frontend**:
  - "Load older messages" button appears at top when `hasMoreMessages` is true
  - Shows count of remaining messages
  - Scroll position preserved when loading older (calculates offset)
  - Messages merged with existing and tree rebuilt

### Full-Text Search (FTS) (v1.8.0+)
Fast, relevance-ranked message search using SQLite FTS5.

- **FTS5 Virtual Table**: `messages_fts` with external content table
  - Columns: `id` (unindexed), `content` (searchable)
  - Synced via INSERT/UPDATE/DELETE triggers on `messages` table
  - Auto-created on server startup for existing databases
  - Existing messages indexed during FTS table creation
- **Search Endpoint**: `GET /api/search?q=query`
  - Uses FTS5 MATCH with BM25 ranking for relevance
  - Prefix matching: `"term"*` for partial word matches
  - Returns highlighted snippets using `snippet()` function
  - Fallback to LIKE search if FTS query fails (special characters)
- **Response Fields**:
  ```javascript
  {
    id, content, snippet,  // snippet has <mark> tags around matches
    waveId, waveName, authorId, authorName, authorHandle,
    createdAt, parentId
  }
  ```
- **Frontend**:
  - Server-provided `snippet` rendered with `dangerouslySetInnerHTML`
  - `<mark>` tag styled with amber background/text to match theme
  - Falls back to client-side highlighting if no snippet provided

### Rich Media Embeds (v1.8.0+)
Automatic embedding of videos and media from popular platforms.

- **Supported Platforms**:
  - YouTube (`youtube.com/watch?v=`, `youtu.be/`, YouTube Shorts)
  - Vimeo (`vimeo.com/`)
  - Spotify (`open.spotify.com/track/`, `/album/`, `/playlist/`)
  - TikTok (`tiktok.com/@user/video/`)
  - Twitter/X (`twitter.com/`, `x.com/` status URLs)
  - SoundCloud (`soundcloud.com/`)
- **API Endpoints**:
  - `POST /api/embeds/detect` - Detect embed URLs in content
  - `GET /api/embeds/oembed?url=` - oEmbed proxy with 15-min cache
  - `GET /api/embeds/info?url=` - Lightweight embed info (no fetch)
- **Frontend Components**:
  - `RichEmbed` - Click-to-load embed with platform icon/thumbnail
  - `MessageWithEmbeds` - Wrapper that detects and renders embeds in messages
  - `EMBED_PLATFORMS` - Platform icons and brand colors
  - `EMBED_URL_PATTERNS` - Client-side URL detection patterns
- **Security**:
  - CSP `frame-src` directive whitelists embed domains
  - iframe `sandbox` attribute: `allow-scripts allow-same-origin allow-presentation allow-popups`
  - Click-to-load default (privacy: embeds don't auto-load)
  - Rate limiting: 30 oEmbed requests/min per user
- **Implementation**:
  - Client-side detection mirrors server patterns
  - YouTube thumbnails from `img.youtube.com/vi/{id}/hqdefault.jpg`
  - Embeds detected at render time (not stored in DB)
  - URLs stripped from displayed content when embed shown
  - **iframe platforms** (YouTube, Vimeo, Spotify): Direct embed URL in iframe
  - **oEmbed platforms** (Twitter, SoundCloud): Fetch HTML via `/api/embeds/oembed`, inject platform scripts
  - **Link card** (TikTok): Styled link card opens in new tab (embed.js incompatible with React)

### Responsive Design (Updated v1.3.2)
- **Multiple breakpoints:**
  - `isMobile`: width < 600px (phone screens)
  - `isTablet`: 600px ≤ width < 1024px (tablet screens)
  - `isDesktop`: width ≥ 1024px (desktop screens)
- Mobile: Stacked layout with back buttons, 44px minimum touch targets
- Tablet: Optimized spacing and font sizes
- Desktop: Sidebar + main panel layout
- All modals overlay-based
- **Browser Compatibility (v1.3.2):**
  - Font smoothing: `-webkit-font-smoothing: antialiased`
  - Safe area insets: `viewport-fit=cover` for notched devices
  - Custom scrollbar styling for consistent appearance

## Migration & Version History

- v1.2→v1.3 migration script: `migrate-v1.2-to-v1.3.js`
  - Converts `username` → `handle`
  - Renames `threads` → `waves`
  - Adds UUID system and handle history

- **v1.15.0 (December 2025)** - Crawl Bar
  - **Crawl Bar Component**: Horizontal scrolling news ticker
    - Stock quotes from Finnhub API (60s cache, 60 calls/min free tier)
    - Weather data from OpenWeatherMap API (5min cache, 1000 calls/day free)
    - News headlines from NewsAPI.org + GNews.io (3min cache, fallback support)
    - IP geolocation via ip-api.com (free, no key required)
  - **User Preferences** (`user.preferences.crawlBar`):
    - `enabled` - Show/hide crawl bar
    - `showStocks`, `showWeather`, `showNews` - Section toggles
    - `scrollSpeed` - "slow", "normal", "fast"
    - `location` - Custom location override for weather
  - **Admin Configuration** (`crawl_config` table):
    - `stock_symbols` - Configurable stock list
    - `default_location` - Fallback when IP geolocation fails
    - `stocks_enabled`, `weather_enabled`, `news_enabled` - Global toggles
    - Refresh intervals for each data type
  - **API Endpoints**:
    - `GET /api/crawl/stocks` - Stock quotes for configured symbols
    - `GET /api/crawl/weather` - Weather for user's location
    - `GET /api/crawl/news` - News headlines
    - `GET /api/crawl/all` - Combined endpoint (recommended)
    - `PUT /api/profile/crawl-preferences` - Update user preferences
    - `GET/PUT /api/admin/crawl/config` - Admin configuration
  - **Database Schema**:
    - `crawl_config` - Server configuration (singleton)
    - `crawl_cache` - API response caching with TTL
  - **Environment Variables**:
    - `FINNHUB_API_KEY` - Stock quotes
    - `OPENWEATHERMAP_API_KEY` - Weather data
    - `NEWSAPI_KEY` - News (primary)
    - `GNEWS_API_KEY` - News (backup)
    - `RATE_LIMIT_CRAWL_MAX` - Rate limit (default: 60/min)
  - **Graceful Degradation**: Sections hidden when API keys missing

- **v1.13.0 (December 2025)** - Federation
  - **Server-to-Server Federation**: Multiple Cortex instances can exchange waves and droplets
    - HTTP Signature authentication (RSA-SHA256) for server-to-server requests
    - Federated user format: `@handle@server.com`
    - Origin-authoritative model: origin server is source of truth
    - Manual trust model: admin allowlist of federation partners
  - **Federation Endpoints**:
    - `GET /api/federation/identity` - Public: Get server's public key
    - `POST /api/federation/inbox` - Receive signed messages from other servers
    - `GET /api/federation/users/:handle` - Get local user profile for remote servers
    - `GET /api/users/resolve/:identifier` - Resolve local or federated users
    - `GET /api/admin/federation/status` - Admin: Get federation status
    - `GET /api/admin/federation/nodes` - Admin: List trusted nodes
    - `POST /api/admin/federation/nodes` - Admin: Add trusted node
    - `DELETE /api/admin/federation/nodes/:id` - Admin: Remove node
    - `POST /api/admin/federation/nodes/:id/handshake` - Admin: Exchange keys
  - **Database Schema** (new tables):
    - `server_identity` - Server's RSA keypair (singleton)
    - `federation_nodes` - Trusted federation partners
    - `remote_users` - Cached profiles from federated servers
    - `remote_droplets` - Cached droplets from federated waves
    - `wave_federation` - Wave-to-node relationships
    - `federation_queue` - Outbound message queue with retries
    - `federation_inbox_log` - Inbound message deduplication
  - **Wave Federation**:
    - `federation_state` column on waves: 'local', 'origin', 'participant'
    - Wave invites sent when adding `@user@server` participants
    - Participant waves created on receiving `wave_invite`
  - **Droplet Federation**:
    - New droplets forwarded to federated nodes
    - Edits and deletions propagate to all participants
    - Remote droplets cached locally with author info
  - **Message Queue**:
    - Optimistic send with queue fallback on failure
    - Exponential backoff: 1min → 5min → 25min → 2hr → 10hr
    - Background processor runs every 30 seconds
    - Auto-cleanup of old messages after 7 days
  - **Environment Variables**:
    - `FEDERATION_ENABLED` - Enable/disable federation
    - `FEDERATION_NODE_NAME` - Server's public hostname
  - **Client**: FederationAdminPanel in ProfileSettings (admin only)

- **v1.12.0 (December 2025)** - CSS Variable Theme System & Push Notification Fixes
  - **Theme System Refactor**: Complete CSS variable-based theming
    - All colors now use CSS custom properties instead of hardcoded values
    - Theme applied via `data-theme` attribute on `<html>` element
    - Inline script in index.html applies theme before React loads (prevents flash)
    - Theme persisted in dedicated `cortex_theme` localStorage key
  - **5 Themes Available**:
    - Firefly (default): Enhanced green terminal with improved mobile contrast
    - High Contrast: Maximum readability with brighter text/borders
    - AMOLED Black: True #000 background for OLED battery savings
    - Light Mode: Light background for daytime use
    - Ocean Blue: Blue-tinted dark alternative
  - **Mobile Readability Improvements**:
    - Droplet content now uses `--text-primary` for maximum readability
    - Usernames demoted to `--text-secondary`
    - Border colors increased for better definition
  - **CSS Variable Categories**:
    - Background: `--bg-base`, `--bg-elevated`, `--bg-surface`, `--bg-hover`, `--bg-active`
    - Text: `--text-primary`, `--text-secondary`, `--text-dim`, `--text-muted`
    - Borders: `--border-primary`, `--border-secondary`, `--border-subtle`
    - Accents: `--accent-amber`, `--accent-teal`, `--accent-green`, `--accent-orange`, `--accent-purple`
    - Glows: `--glow-amber`, `--glow-teal`, `--glow-green`, `--glow-orange`, `--glow-purple`
    - Overlays: `--overlay-amber`, `--overlay-teal`, `--overlay-green`, `--overlay-orange`, `--overlay-purple`
  - **Push Notification Fixes**:
    - Fixed SQLite `push_subscriptions` table UNIQUE constraint migration
    - Auto-migration recreates table with proper `UNIQUE (user_id, endpoint)` constraint
    - Added VAPID key change detection - auto re-subscribes if server VAPID key changes
    - Stored VAPID key in `cortex_vapid_key` localStorage to detect future changes
    - Improved error handling with detailed failure messages in UI toast
    - Push toggle button now uses proper React state management
  - **Database Fixes**:
    - Added `updateUserPreferences()` method to SQLite class for direct preference updates
    - Fixed preferences not persisting in SQLite (was using no-op `saveUsers()`)
  - **Server Validation**: New themes added to valid theme list

- **v1.10.0 (December 2025)** - Droplets Architecture
  - **Terminology Rename**: Messages → Droplets throughout codebase
    - Database tables renamed (`messages` → `droplets`, `messages_fts` → `droplets_fts`)
    - API endpoints support both `/droplets` and `/messages` (backward compat)
    - WebSocket events renamed (`new_droplet`, etc.) with legacy aliases
    - UI text updated: "No droplets yet", "[Droplet deleted]", etc.
  - **Focus View**: View any droplet with replies as wave-like context
    - Desktop: "⤢ FOCUS" button on droplets with children
    - Mobile: Tap droplet content, swipe right to go back
    - Breadcrumb navigation with clickable path items
    - Navigation stack for nested focus levels
  - **Threading Depth Limit**: 3-level limit in WaveView
    - "FOCUS TO REPLY" button at depth limit
    - Visual depth indicator banner
    - Focus View allows unlimited depth
  - **Ripple System**: Spin off droplet threads into new waves
    - `POST /api/droplets/:id/ripple` endpoint
    - RippleModal for title/participant selection
    - RippledLinkCard shows "Rippled to wave..." in original
    - Nested ripple tracking via `breakout_chain` field
  - **Database Schema Updates**:
    - `droplets.broken_out_to`, `droplets.original_wave_id`
    - `waves.root_droplet_id`, `waves.broken_out_from`, `waves.breakout_chain`
    - Auto-migration for existing SQLite databases

- **v1.8.0 (December 2025)** - User Profiles & UX Polish
  - **Profile Images**: Upload avatar images (jpg, png, gif, webp up to 2MB)
    - `POST /api/profile/avatar` with multer + sharp processing
    - Auto-resize to 256×256, convert to webp
    - `DELETE /api/profile/avatar` to remove image
    - Avatar component supports both image URLs and letter fallback
    - Profile images display in wave messages via `sender_avatar_url`
  - **About Me / Bio**: 500-character bio field viewable by others
    - `GET /api/users/:id/profile` public profile endpoint
    - Bio textarea in Profile Settings
  - **User Profile Modal**: Click on user names/avatars to view profiles
    - Shows avatar (large), display name, @handle, bio, join date
    - Action buttons: Add Contact, Block, Mute
  - **Display Name Simplification**: @handle hidden in most UI
    - Display name only shown in messages, participants, contacts
    - @handle visible in Profile Settings and User Profile Modal
  - **Message Layout Cleanup**: Consolidated message footer from 4 rows to 2
    - Row 1: Reply | Collapse | ✏️ | ✕ | 😀 | reactions inline
    - Row 2: ✓N compact read count (expandable to show names)
    - Edit/Delete buttons shortened to icons only
    - Reactions moved inline with action buttons
  - **Emoji Picker Improvements**:
    - Fixed centering at all font sizes (fixed 32×32px buttons with flexbox)
    - Removed redundant CLOSE button (click EMO to dismiss)
    - 8-column grid on desktop (16 emojis in 2 rows)
  - **Auth Response Updates**: Login/register/me endpoints now return `avatarUrl` and `bio`
  - **SQLite Database** (optional):
    - Enable with `USE_SQLITE=true` environment variable
    - `database-sqlite.js` drop-in replacement for JSON database
    - `schema.sql` with 14+ tables and indexes
    - Migration script: `node migrate-json-to-sqlite.js`
    - Better performance for large datasets
  - **PWA Push Notifications**:
    - Server-sent push when app is closed/backgrounded
    - `web-push` library with VAPID authentication
    - Push subscription management in Profile Settings
    - Service worker handles push display and navigation
    - Auto-cleanup of expired subscriptions
  - **Message Image Upload**:
    - `POST /api/uploads` with multer + sharp processing
    - Max 10MB, resize to 1200×1200, convert to webp (except GIFs)
    - IMG button in composer (orange), drag-and-drop, clipboard paste
    - Uploaded URL auto-embeds via `detectAndEmbedMedia()`
    - Thumbnail display (200×150 max) with click-to-zoom lightbox
  - **Message Pagination**:
    - Initial load limited to 50 most recent messages
    - `GET /api/waves/:id/messages?limit=50&before=messageId` for older
    - "Load older messages" button with scroll position preservation
  - **Full-Text Search (FTS)**:
    - SQLite FTS5 virtual table with BM25 ranking
    - Highlighted snippets with `<mark>` tags
    - Auto-migration creates FTS table and indexes existing messages
    - Fallback to LIKE search for special character queries
  - **Rich Media Embeds**:
    - YouTube, Vimeo, Spotify, TikTok, Twitter/X, SoundCloud
    - Click-to-load privacy (embeds don't load until clicked)
    - oEmbed proxy endpoint with 15-minute cache
    - CSP frame-src directive for secure iframe embedding
    - Platform-specific thumbnails and play buttons

- **v1.9.0 (December 2025)** - Threading, Mobile UX, Moderation & API Documentation
  - **Message Threading Improvements**:
    - Thread collapse/expand with localStorage persistence per wave
    - "Collapse All" / "Expand All" buttons in wave toolbar
    - "↑ Parent" button to jump to parent message with highlight animation
    - Thread depth indicator for deeply nested messages (depth > 3)
    - Visual thread connectors (dashed lines) for reply hierarchy
    - Responsive connector sizing for mobile
  - **Mobile Gesture Enhancements**:
    - `useSwipeGesture` hook for swipe navigation
    - `usePullToRefresh` hook with PullIndicator component
    - `BottomNav` component with 5-tab navigation (Waves, Contacts, Groups, Search, Profile)
    - Haptic feedback on navigation (10ms vibration)
    - Badge indicators for unread counts and pending requests
    - Safe area insets for notched devices
  - **Report System**:
    - Report messages, waves, or users for: spam, harassment, inappropriate, other
    - Rate limit: 10 reports per hour per user
    - `ReportModal` component with reason selection and details textarea
    - Admin `ReportsAdminPanel` with tabs (Pending/Resolved/Dismissed)
    - Resolution options: Warning Issued, Content Removed, User Banned, No Action
    - `MyReportsPanel` for users to view their submitted reports
    - WebSocket `report_resolved` event notifies reporters of resolution
  - **Moderation Actions**:
    - Warning system with `warnings` table and `createWarning()` method
    - Moderation audit log with `moderation_log` table
    - `POST /api/admin/users/:id/warn` - Issue warning to user
    - `GET /api/admin/users/:id/warnings` - Get user's warnings
    - `GET /api/admin/moderation-log` - Get full moderation history
    - WebSocket `warning_received` event notifies warned users
  - **API Documentation**:
    - Comprehensive `docs/API.md` with 70+ endpoints documented
    - All authentication, users, waves, messages, contacts, groups endpoints
    - WebSocket events documentation
    - Rate limiting and error response formats
    - curl examples for key endpoints

- **v1.8.1 (December 2025)** - Bug Fixes: Embeds, Push Notifications & UX
  - **Video Embed Fix**: YouTube, Spotify, Vimeo now properly show embedded players
    - Fixed `detectEmbedUrls()` to only skip image URLs in `<img>` tags
    - Video URLs in `<a>` tags now correctly detected for embed players
    - Added `seenUrls` set to prevent duplicate embeds
  - **TikTok Link Card**: TikTok URLs show styled link card (opens in new tab)
    - TikTok's embed.js incompatible with React's virtual DOM
    - Replaced with branded link card (pink border, music icon)
    - No external scripts or API calls required
  - **Twitter/SoundCloud oEmbed**: Fetch embed HTML via oEmbed API
    - Script tags stripped from oEmbed HTML for security
    - Platform scripts loaded once and re-triggered for new embeds
  - **Duplicate Embed Fix**: Images no longer appear twice in messages
    - Client-side detection skips URLs already in `<img>` tags
    - Prevents double-embedding by server and client
  - **Mobile Push Notification Fixes**:
    - Unique notification tags per message (prevents replacement)
    - Push sent for all messages (service worker filters by visibility)
    - Notifications only shown when app is backgrounded/closed
    - iOS limitation warning added to Profile Settings
  - **iOS Push Limitation**: Documented that iOS/Safari does not support Web Push API for PWAs (Apple platform limitation)
  - **Footer**: Added version number (v1.8.1), tightened padding
  - Service worker version bump to v1.8.1

- **v1.7.0 (December 2025)** - Contact & Invitation Approval System + Moderation + GIF Search
  - Contact Request System: Send/accept/decline contact requests
  - Group Invitation System: Invite users to groups with accept/decline flow
  - Add contact from wave participants with quick-action buttons
  - Leave Group functionality for all members
  - Group wave access control: leaving group revokes wave access
  - WebSocket events for all request/invitation state changes
  - Badge notifications on Contacts (teal) and Groups (amber) nav buttons
  - **User Moderation**: Block and mute users for privacy control
    - Block prevents contact requests, group invitations, hides messages
    - Mute hides messages but allows other interactions
    - Participant panel ⋮ menu for quick block/mute actions
    - Profile Settings section for managing blocked/muted users
  - **GIF Search**: GIPHY API integration for inserting GIFs
    - Search and trending GIF endpoints with rate limiting
    - GIF button in composer opens search modal
    - Debounced search with grid display
    - Requires GIPHY_API_KEY environment variable

- **v1.6.0 (December 2025)** - Progressive Web App (PWA)
  - Full PWA support with service worker and manifest
  - Installable on Android, iOS, and desktop
  - Offline caching for static assets
  - Custom install prompt and offline indicator
  - 13 app icons including maskable icons

- **v1.5.0 (December 2025)** - Real-Time Features
  - Typing indicators with throttled WebSocket events
  - Message reactions with emoji picker
  - Full-text message search
  - Desktop notifications (browser Notification API)
  - WebSocket stability improvements

- **v1.4.0 (December 2025)** - Per-Message Read Tracking & Scroll Preservation
  - Per-message read tracking with click-to-read UI
  - Scroll position preservation during message interactions
  - Granular unread status with readBy arrays
  - Visual indicators for unread messages (amber border/background)
  - Smart scrolling for replies vs root messages

- **v1.3.3 (December 2025)** - Message Editing & UX Polish
  - Message editing with inline edit interface
  - Keyboard shortcuts (Ctrl+Enter save, Esc cancel)
  - Improved wave hover states with transitions
  - Collapsible playback controls
  - Auto-focus on reply

- **v1.3.2 (December 2025)** - Rich Content & UX Improvements
  - Added media embedding (images, GIFs) with auto-detection
  - Added emoji picker and multi-line input (Shift+Enter)
  - Added wave deletion with cascade and participant notification
  - Added user preferences (theme, font size)
  - Added admin panel for handle request management
  - Improved mobile UI with multiple breakpoints and touch targets
  - Enhanced browser compatibility (Chrome, Firefox, Safari)

## Environment Variables

**Server (`server/.env`):**

The server uses `dotenv` to automatically load environment variables from `.env` file on startup.

```bash
PORT=3001                                           # Server port
JWT_SECRET=your-secret-key                          # REQUIRED in production (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_EXPIRES_IN=7d                                   # Token expiration
ALLOWED_ORIGINS=https://your-domain.com             # CORS whitelist (comma-separated)
SEED_DEMO_DATA=true                                 # Seed demo accounts on first run
GIPHY_API_KEY=your-giphy-api-key                    # Required for GIF search (get from developers.giphy.com)
USE_SQLITE=true                                     # Use SQLite instead of JSON files (v1.8.0+)
FEDERATION_ENABLED=false                            # Enable server-to-server federation (v1.13.0+)
FEDERATION_NODE_NAME=cortex.example.com             # Server's public hostname for federation
```

**Client:** Hardcoded to `localhost:3001` for development. Change `API_URL` and `WS_URL` in `CortexApp.jsx` for production.

## Testing Accounts

If demo data seeded (password: `demo123`):
- `mal` - Malcolm Reynolds (Admin)
- `zoe`, `wash`, `kaylee`, `jayne`, `inara`, `simon`, `river`

## Common Development Tasks

### Adding a New API Endpoint
1. Add route in appropriate section of `server/server.js`
2. Use `authenticateToken` middleware for protected routes
3. Call database methods (add new method if needed)
4. Return JSON response with proper error handling
5. Update client's `useAPI()` calls in relevant component

### Adding a New WebSocket Event
1. Server: Broadcast via `broadcast({ type: 'event_name', ...data })`
2. Client: Handle in `handleWebSocketMessage()` function (around line 1400)
3. Update state and trigger re-render

### Modifying Data Schema
1. Update database initialization in `Database.constructor()`
2. Update relevant CRUD methods
3. Update JSON file save methods
4. Create migration script if breaking change
5. Update API responses and client-side interfaces

### Adding Security Rate Limits
Define custom `rateLimit()` instance at top of server file, apply to route:
```javascript
app.post('/api/endpoint', customLimiter, authenticateToken, (req, res) => { ... });
```

### Adding Rich Content Features (v1.3.2+)
When allowing user-generated content with HTML:
1. **Always sanitize input** with `sanitize-html` on the server
2. Define strict `allowedTags` and `allowedAttributes` whitelist
3. Use `transformTags` to enforce security attributes (target="_blank", loading="lazy")
4. Test for XSS vulnerabilities with malicious payloads
5. Client-side: Render with `dangerouslySetInnerHTML` only after server sanitization
6. Add CSS for embedded media (max-width, max-height, borders)

### Working with User Preferences (v1.3.2+)
1. Add new preference fields to user schema with default values
2. Create/update endpoint: `PUT /api/profile/preferences`
3. Validate preference values on server
4. Client: Store in user state, apply via CSS variables or inline styles
5. Persist changes immediately (no separate "Save" button)

## Firefly Aesthetic Theme

The UI uses a dark green terminal aesthetic inspired by Firefly:
- **Colors:** Dark green background (#050805), amber accent (#ffd23f), status green (#0ead69)
- **Typography:** Monospace fonts (Courier New, Monaco)
- **Effects:** CRT scanlines overlay, text glow, phosphor effect
- **Design:** Retro-futuristic, terminal-like interface with minimal decoration
- Always create a new branch before working on a version.