# CORTEX - Secure Wave Communications v1.8.0-alpha

A privacy-first, federated communication platform inspired by Google Wave with a Firefly aesthetic.

## What's New in v1.8.0

### 🖼️ Profile Images
Upload custom profile pictures to replace letter avatars.

- **Image Upload**: Upload jpg, png, gif, or webp images (up to 2MB)
- **Auto-Processing**: Images resized to 256×256 and converted to efficient webp format
- **Privacy**: EXIF metadata automatically stripped from uploads
- **Fallback**: Letter avatar shown if no image set or if image fails to load
- **Message Display**: Profile images appear next to your messages in waves

### 📝 About Me / Bio
Add a bio to your profile that others can view.

- **500 Characters**: Express yourself with a generous character limit
- **Public Profile**: Bio visible when others view your profile
- **Character Counter**: Real-time count shows remaining characters

### 👤 User Profile Modal
Click on any user's name or avatar to view their profile.

- **Profile Display**: Large avatar, display name, @handle, bio, join date
- **Quick Actions**: Add Contact, Block, or Mute directly from profile
- **Universal**: Works in messages, participants list, and contacts

### 🎨 Cleaner UI
Display names now shown instead of @handles in most places.

- **Simplified Display**: Only display names shown in messages, participants, wave list
- **@handle Preserved**: Still visible in Profile Settings and User Profile Modal
- **Clickable**: Names/avatars open the profile modal

### 📦 Message Layout Cleanup
Consolidated message footer for a more compact view.

- **Before**: 4 rows (Reply/Edit/Delete → Reactions → Emoji picker → Seen by)
- **After**: 2 rows (Actions + reactions inline → Compact read count)
- **Icon Buttons**: Edit (✏️) and Delete (✕) shortened to icons only
- **Inline Reactions**: Reactions now appear on same row as action buttons
- **Compact Read Count**: "✓3" instead of "Seen by 3 people" (expandable)

### 😀 Emoji Picker Improvements
Fixed and improved the message composer emoji picker.

- **Centering Fix**: Emojis properly centered at all font sizes
- **Cleaner UI**: Removed redundant CLOSE button (click EMO to dismiss)
- **Compact Grid**: 8-column layout on desktop (16 emojis in 2 rows)

---

## What Was New in v1.7.0

### 📬 Contact Request System
Users must send and accept contact requests before becoming contacts.

- **Request Workflow**: Send contact requests with optional messages
- **Accept/Decline**: Recipients can accept or decline requests
- **Participant Quick Actions**: Add contacts directly from wave participants
- **Real-Time Updates**: WebSocket notifications for all request events
- **Badge Count**: Teal badge on Contacts nav shows pending requests

### 👥 Group Invitation System
Users must be invited to groups and can accept or decline.

- **Invite Contacts**: Send invitations to multiple contacts at once
- **Accept/Decline**: View and respond to pending invitations
- **Leave Group**: Any member can leave a group voluntarily
- **Access Control**: Leaving a group immediately revokes wave access
- **Badge Count**: Amber badge on Groups nav shows pending invitations

### 🚫 User Moderation (Block/Mute)
Privacy controls for managing interactions with other users.

- **Block Users**: Prevents contact requests, group invitations, and hides messages
- **Mute Users**: Hides messages without blocking other interactions
- **Participant Menu**: Quick block/mute from ⋮ dropdown in wave participants
- **Management UI**: View and manage blocked/muted users in Profile Settings

### 🎬 GIF Search Integration
GIPHY-powered GIF search and embedding.

- **Search GIFs**: Search GIPHY database directly from message composer
- **Trending GIFs**: Browse trending GIFs when opening the modal
- **One-Click Insert**: Click a GIF to insert it into your message
- **Requires API Key**: Set `GIPHY_API_KEY` in server `.env` file

---

## What Was New in v1.6.1

### Mobile Header Improvements
- **App Icon Logo** - PWA icon replaces "CORTEX" text on mobile for compact header
- **Compact Layout** - No more header wrapping on small screens
- **Logout Relocated** - Moved to Profile Settings under new "SESSION" section

### Collapsible Wave Toolbar
- **Combined Toolbar** - Participants and Playback merged into single compact bar
- **Toggle Buttons** - Click "PARTICIPANTS (n)" or "PLAYBACK" to expand/collapse
- **Collapsed by Default** - Saves vertical space, especially on mobile
- **Mark All Read** - Stays visible in toolbar when unread messages exist

---

## What Was New in v1.6.0

### Progressive Web App (PWA) Support
Cortex is now a fully installable Progressive Web App that works on Android and iOS devices.

- **Installable App** - Add Cortex to your home screen on Android (Chrome) and iOS (Safari)
- **Offline Support** - Service worker caches static assets for offline shell access
- **Install Prompt** - Custom "Install Cortex" banner appears after 2nd visit
- **Offline Indicator** - Orange banner shows when network connection is lost
- **App Icons** - 13 custom icons for all device sizes including maskable icons for Android
- **iOS Optimized** - Full iOS PWA support with apple-touch-icon and status bar styling

#### PWA Technical Details
- **Service Worker** - Stale-while-revalidate caching strategy for static assets
- **Web App Manifest** - Complete manifest with shortcuts, theme colors, and display mode
- **Auto-Updates** - Service worker checks for updates hourly
- **Network Detection** - Real-time online/offline status monitoring

#### How to Install
- **Android**: Open in Chrome → Menu → "Add to Home Screen" or use the install prompt
- **iOS**: Open in Safari → Share → "Add to Home Screen"
- **Desktop**: Chrome/Edge address bar → Install icon

### Read Receipts Display
Visual display of who has read messages in a wave.

- **Participant Read Status** - Wave header shows all participants with ✓ (read) or ○ (unread) indicators
- **Per-Message Receipts** - Expandable "Seen by X people" section on each message
- **Mark All Read** - One-click button to mark all unread messages as read
- **Real-Time Updates** - Read status updates live as participants read messages
- **Visual Feedback** - Green highlighting for users who've read the latest message

## What Was New in v1.5.0

### ⌨️ Typing Indicators
- **Real-Time Awareness**: See when others are typing in a wave
- **Multi-User Display**: Shows "Alice, Bob are typing..." for multiple users
- **Auto-Clear**: Indicators disappear after 5 seconds of inactivity
- **Throttled Events**: Optimized to send max 1 event per 2 seconds
- **Wave-Specific**: Only shows typing users in your current wave

### 🎭 Message Reactions
- **Emoji Support**: React to messages with 6 quick emojis (👍 ❤️ 😂 🎉 🤔 👏)
- **Toggle Reactions**: Click same emoji again to remove your reaction
- **Reaction Counts**: See count and list of users who reacted
- **Real-Time Updates**: Reactions appear instantly across all clients
- **Persistent**: Reactions saved and displayed after reload

### 🔍 Message Search
- **Full-Text Search**: Search across all your messages in all accessible waves
- **Smart Security**: Only searches waves you have permission to view
- **Search Modal**: Clean overlay UI with live search results
- **Result Highlighting**: Search terms highlighted in yellow
- **Jump to Message**: Click result to navigate directly to wave and message
- **Rich Metadata**: Shows wave name, author, and date for each result

### 🔔 Desktop Notifications
- **Browser Notifications**: Native desktop notifications for new messages
- **Smart Triggers**: Notifies when tab backgrounded or viewing different wave
- **Click to Focus**: Clicking notification opens browser and focuses wave
- **Auto-Permissions**: Requests permission automatically after login
- **Privacy-Aware**: Never shows notifications for your own messages
- **No Backend Needed**: Uses browser Notification API

### 🐛 Critical Fixes
- **WebSocket Stability**: Fixed disconnection issues with auto-reconnect and heartbeat ping
- **Scroll Position**: Fixed race conditions causing scroll jumps on user actions
- **Thread Nesting**: Fixed deep thread indentation going off-screen on mobile
- **Real-Time Updates**: Fixed waveId extraction for proper message delivery

## What Was New in v1.4.0

### 📖 Per-Message Read Tracking
- **Click-to-Read**: Messages marked as read only when explicitly clicked
- **Visual Indicators**: Unread messages have amber border (#ffd23f) and background
- **Hover Effects**: Pointer cursor and brightening effect on unread messages
- **Granular Tracking**: Each message tracks which users have read it via `readBy` array
- **Backend Enhancement**: New `/api/messages/:id/read` endpoint for marking individual messages
- **Backward Compatible**: Old messages automatically initialized with `readBy` arrays

### 🔄 Scroll Position Preservation
- **Click Stability**: Clicking unread messages preserves your scroll position
- **Reply Stability**: Replying to messages maintains current scroll position
- **Smart Scrolling**: Root messages still scroll to bottom (expected behavior)
- **Long Wave Support**: No more disruptive jumping in waves with 100+ messages
- **Seamless UX**: Scroll restoration happens automatically and smoothly

## What Was New in v1.3.3

### ✏️ Message Editing & Deletion
- **Edit Messages**: Edit your own messages with inline editing interface
- **Keyboard Shortcuts**: Ctrl+Enter to save, Escape to cancel
- **Edit History**: Server tracks edit history with timestamps
- **Delete Messages**: Delete your own messages with confirmation
- **Real-Time Updates**: All participants see edits/deletions instantly via WebSocket

### 🎯 Improved Wave UX
- **Hover States**: Waves highlight on hover for better discoverability
- **Smooth Transitions**: Polished 200ms transitions for visual feedback
- **GIF Animation**: GIFs now load eagerly and animate immediately
- **Clickable Clarity**: Enhanced visual feedback makes waves obviously interactive

### 📊 Collapsible Playback Controls
- **Space Saving**: Playback bar now hides by default
- **Toggle Control**: Show/hide playback controls with one click
- **Persistent State**: Remembers your preference during session
- **Clean Interface**: Reduces clutter when not using playback mode

### ⌨️ Auto-Focus on Reply
- **Instant Focus**: Cursor automatically moves to input when clicking reply
- **Smart Positioning**: Cursor placed at end of existing text
- **Smooth Experience**: 150ms delay ensures smooth UI transition
- **Works Everywhere**: Functions on mobile and desktop devices

## What Was New in v1.3.2

### 🎨 Rich Content & Media Support
- **Emoji Picker**: 16 common emojis in a convenient popup picker
- **Media Embedding**: Paste image/GIF URLs to embed them inline
- **Auto-Detection**: Image URLs automatically converted to embedded images
- **Multi-line Input**: Use Shift+Enter for new lines, Enter to send
- **Security**: All HTML content sanitized with strict whitelist

### 🗑️ Wave Deletion
- Wave creators can delete waves with confirmation
- Cascade deletion: removes wave, participants, messages, and history
- Real-time notification to all participants
- Auto-redirect for users viewing deleted wave

### ⚙️ User Preferences
- **Theme Selection**: Choose from Firefly (default), High Contrast, or Light Mode
- **Font Size Control**: Adjust from Small to X-Large (4 sizes)
- **Persistent Settings**: Preferences saved to your account

### 👨‍💼 Admin Panel
- **Handle Request Management**: Admins can approve/reject handle changes
- **Centralized Review**: All pending requests in one place
- **Optional Rejection Reason**: Provide feedback when rejecting

### 📱 Mobile UX Improvements
- **Multiple Breakpoints**: Optimized for phones (<600px), tablets (600-1024px), and desktops (≥1024px)
- **Touch-Friendly**: 44px minimum touch targets throughout
- **Better Fonts**: Improved font smoothing and rendering
- **Browser Compatibility**: Enhanced support for Chrome, Firefox, and Safari

## What Was New in v1.3.0

### 🆔 UUID-Based Identity System
- Users now have immutable UUIDs with changeable handles
- Handle history tracking for audit trails
- Old handles are reserved for 90 days after change
- @mentions are stored as UUIDs, rendered as current handles

### 👤 User Account Management
- **Profile Settings**: Change display name and avatar
- **Password Management**: Secure password change with validation
- **Handle Change Requests**: Request handle changes (admin-approved)
- Handle change cooldown: 30 days between changes

### 📝 Terminology Update
- "Threads" are now called "Waves" throughout the platform

### 📁 Personal Wave Archiving
- Archive waves without affecting other participants
- View archived waves separately
- Restore waves from archive

## Project Structure

```
cortex/
├── server/
│   ├── server.js           # Express + WebSocket server
│   ├── package.json        # Server dependencies
│   ├── .env                # Environment variables (create this)
│   └── data/               # JSON data files (auto-created)
│       ├── users.json
│       ├── waves.json
│       ├── messages.json
│       ├── groups.json
│       ├── handle-requests.json
│       ├── contact-requests.json  # v1.7.0+
│       ├── group-invitations.json # v1.7.0+
│       └── moderation.json        # v1.7.0+
├── client/
│   ├── CortexApp.jsx       # Main React application
│   ├── main.jsx            # Entry point
│   ├── index.html          # HTML template with PWA meta tags
│   ├── vite.config.js      # Vite configuration
│   ├── package.json        # Client dependencies
│   └── public/
│       ├── manifest.json   # PWA manifest
│       ├── sw.js           # Service worker
│       └── icons/          # PWA icons (13 files)
└── README.md
```

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
npm start
```

Server runs at `http://localhost:3001`

### 2. Start the Client

```bash
cd client
npm install
npm run dev
```

Client runs at `http://localhost:3000`

### 3. Login

Demo accounts (password: `demo123`):
- `mal` - Malcolm Reynolds (Admin)
- `zoe` - Zoe Washburne
- `wash` - Hoban Washburne
- `kaylee` - Kaylee Frye
- `jayne` - Jayne Cobb
- `inara` - Inara Serra
- `simon` - Simon Tam
- `river` - River Tam

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login and receive JWT |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/logout` | Logout |

### User Account Management (New in v1.3)
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/users/profile` | Update display name, avatar, bio |
| PUT | `/api/users/password` | Change password |
| PUT | `/api/profile/preferences` | Update theme, font size (v1.3.2+) |
| POST | `/api/users/handle/request` | Request handle change |
| GET | `/api/users/handle/requests` | Get user's handle requests |
| GET | `/api/users/handle/history` | Get handle change history |

### Profile Images (v1.8.0+)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/profile/avatar` | Upload profile image (jpg, png, gif, webp, max 2MB) |
| DELETE | `/api/profile/avatar` | Remove profile image (revert to letter) |
| GET | `/api/users/:id/profile` | Get user's public profile (avatar, bio, etc.) |

### Admin Endpoints (New in v1.3)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/handle-requests` | List pending handle requests |
| POST | `/api/admin/handle-requests/:id/review` | Approve/reject request |

### Waves (renamed from Threads)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/waves` | List user's active waves |
| GET | `/api/waves/archived` | List user's archived waves |
| GET | `/api/waves/:id` | Get wave with messages |
| POST | `/api/waves` | Create new wave |
| PUT | `/api/waves/:id` | Update wave |
| DELETE | `/api/waves/:id` | Delete wave (creator only, v1.3.2+) |
| POST | `/api/waves/:id/archive` | Archive wave for user |
| POST | `/api/waves/:id/unarchive` | Restore wave from archive |
| GET | `/api/waves/:id/playback` | Get playback timeline |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/waves/:waveId/messages` | Send a message |
| PUT | `/api/messages/:id` | Edit a message |
| GET | `/api/messages/:id/history` | Get edit history |

### Contacts & Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List contacts |
| GET | `/api/groups` | List groups |
| POST | `/api/groups` | Create group |
| POST | `/api/groups/:id/members` | Add member |
| DELETE | `/api/groups/:id/members/:userId` | Remove member |

### Contact Requests (v1.7.0+)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/request` | Send contact request |
| GET | `/api/contacts/requests` | Get received requests |
| GET | `/api/contacts/requests/sent` | Get sent requests |
| POST | `/api/contacts/requests/:id/accept` | Accept request |
| POST | `/api/contacts/requests/:id/decline` | Decline request |
| DELETE | `/api/contacts/requests/:id` | Cancel sent request |

### Group Invitations (v1.7.0+)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/groups/:id/invite` | Invite users to group |
| GET | `/api/groups/invitations` | Get pending invitations |
| POST | `/api/groups/invitations/:id/accept` | Accept invitation |
| POST | `/api/groups/invitations/:id/decline` | Decline invitation |
| DELETE | `/api/groups/invitations/:id` | Cancel sent invitation |

### User Moderation (v1.7.0+)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/:id/block` | Block user |
| DELETE | `/api/users/:id/block` | Unblock user |
| POST | `/api/users/:id/mute` | Mute user |
| DELETE | `/api/users/:id/mute` | Unmute user |
| GET | `/api/users/blocked` | Get blocked users |
| GET | `/api/users/muted` | Get muted users |

### GIF Search (v1.7.0+)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gifs/search?q=query` | Search GIFs (requires GIPHY_API_KEY) |
| GET | `/api/gifs/trending` | Get trending GIFs |

## User Identity Model

```javascript
{
  id: "uuid-7a8b9c...",           // Immutable, used in all references
  handle: "mal",                   // Changeable (admin-approved)
  displayName: "Malcolm Reynolds", // Freely changeable
  avatar: "M",                     // Freely changeable (1-2 chars)
  avatarUrl: "/uploads/avatars/user-xxx.webp", // v1.8.0+ Profile image URL
  bio: "Captain of the Serenity",  // v1.8.0+ About me (max 500 chars)
  handleHistory: [
    { handle: "mal", from: "2025-01-01", to: null }
  ],
  preferences: {                   // v1.3.2+
    theme: "firefly",              // firefly, highContrast, light
    fontSize: "medium",            // small, medium, large, xlarge
    colorMode: "default"           // Future: accessibility modes
  }
}
```

### Handle Change Rules
- Changes require admin approval
- 30-day cooldown between changes
- Old handles reserved for 90 days
- Mentions stored as UUIDs (always resolve to current handle)

## Privacy Levels

| Level | Icon | Description |
|-------|------|-------------|
| Private | ◉ | End-to-end encrypted, only participants |
| Group | ◈ | Visible to local group members |
| Cross-Server | ◇ | Shared across federated servers |
| Public | ○ | Visible on federated public feeds |

## Security Features

- **Password Requirements**: 8+ chars, uppercase, lowercase, number
- **Rate Limiting**: Login (5/15min), Register (3/hour), API (100/min)
- **Account Lockout**: 5 failed attempts = 15 minute lockout
- **XSS Protection**: All inputs sanitized
- **Security Headers**: Helmet.js enabled
- **JWT Authentication**: 7-day token expiry
- **Media Embedding Security** (v1.3.2+):
  - HTML sanitization with strict whitelist
  - Only safe tags allowed: img, a, br, p, strong, em, code, pre
  - HTTPS/HTTP protocols only (no data URIs)
  - Auto-embedding with security transforms
  - Lazy loading for external images

## Environment Variables

Create a `.env` file in the `server/` directory:

```bash
# Server Configuration
PORT=3001                          # Server port
JWT_SECRET=your-secret-key         # JWT signing key (required in production)
JWT_EXPIRES_IN=7d                  # Token expiration
ALLOWED_ORIGINS=https://your-domain.com  # CORS whitelist
SEED_DEMO_DATA=true                # Seed demo accounts on first run

# GIF Search (v1.7.0+)
GIPHY_API_KEY=your-giphy-api-key   # Get from developers.giphy.com
```

Generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## WebSocket Events

### Client → Server
```json
{ "type": "auth", "token": "jwt-token" }
```

### Server → Client
```json
{ "type": "auth_success" }
{ "type": "new_message", "waveId": "...", "message": {...} }
{ "type": "wave_created", "wave": {...} }
{ "type": "wave_deleted", "waveId": "...", "deletedBy": "..." }
{ "type": "handle_request_reviewed", "request": {...}, "newHandle": "..." }
```

## Deployment with Nginx

Example nginx configuration for reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name cortex.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/cortex.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cortex.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Uploaded files (avatars, etc.) - added in v1.8.0
    location /uploads {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

## Roadmap

### Completed in v1.7.0
- [x] Contact Request System (send/accept/decline)
- [x] Group Invitation System (invite/accept/decline)
- [x] Add contacts from wave participants
- [x] Leave group functionality
- [x] User blocking and muting
- [x] GIF search integration (GIPHY)
- [x] Environment variable loading (dotenv)

### Completed in v1.6.0
- [x] Progressive Web App (PWA) support
- [x] Service worker with offline caching
- [x] App icons and manifest
- [x] Install prompt and offline indicator

### Completed in v1.8.0
- [x] Profile images (avatar upload with sharp processing)
- [x] About Me / Bio section (500 char)
- [x] User Profile Modal (view other users' profiles)
- [x] Display name simplification (hide @handle in most UI)
- [x] Profile images in wave messages
- [x] Message layout cleanup (compact 2-row footer)
- [x] Emoji picker improvements (centering, no close button)

### v1.8 - Remaining (Scale & Organization)
- [ ] SQLite migration
- [ ] Image/file upload for messages (not just URL embedding)
- [ ] Message pagination/virtual scrolling
- [ ] Full-text search with database FTS
- [ ] Content reporting system
- [ ] Admin reports dashboard

### v2.0 - Federation
- [ ] Cross-server communication protocol
- [ ] Server discovery and trust system
- [ ] End-to-end encryption for federated messages
- [ ] Federated alert system

## License

MIT License - See LICENSE file for details.
