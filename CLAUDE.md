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
   - Separated files: `users.json`, `waves.json`, `messages.json`, `groups.json`, `handle-requests.json`
   - Methods grouped by entity: User, Contact, Group, Wave, Message
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
- Database class methods call `saveUsers()`, `saveWaves()`, etc. after mutations
- Atomic writes to individual JSON files
- Demo data seeded if `SEED_DEMO_DATA=true` (password: "Demo123!")

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
```bash
PORT=3001                                           # Server port
JWT_SECRET=your-secret-key                          # REQUIRED in production
JWT_EXPIRES_IN=7d                                   # Token expiration
ALLOWED_ORIGINS=https://your-domain.com             # CORS whitelist (comma-separated)
SEED_DEMO_DATA=true                                 # Seed demo accounts on first run
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
