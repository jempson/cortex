# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cortex is a privacy-first, federated communication platform inspired by Google Wave with a Firefly aesthetic. It uses a client-server architecture with real-time WebSocket communication.

**Tech Stack:**
- **Server:** Node.js + Express + WebSocket (ws)
- **Client:** React (single JSX file) + Vite
- **Storage:** JSON files (migration to SQLite planned)

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

**Messages:**
- Threaded structure with `parentId` for replies
- Edit history tracked in `messages.history[]`
- Content stored with version numbers
- @mentions stored as UUIDs, rendered as current handles
- Read tracking via `readBy[]` array containing user IDs who have read the message
- Author automatically added to `readBy` on message creation
- Click-to-read UI: Messages marked as read only when explicitly clicked

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
- Server broadcasts: `new_message`, `message_edited`, `wave_created`, `wave_updated`, `wave_deleted`, `handle_request_reviewed`
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

### User Preferences & Customization (v1.3.2+)
- **Theme Selection**: Firefly (default), High Contrast, Light Mode
- **Font Size Control**: Small (0.9x), Medium (1x), Large (1.15x), X-Large (1.3x)
- **Preferences API**: `PUT /api/profile/preferences` to update settings

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

### Message Threading
- Messages have `parentId` (null for root messages)
- Client renders recursively with depth tracking
- Playback mode: Shows messages in chronological order with timeline slider

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