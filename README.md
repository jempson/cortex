# CORTEX - Secure Wave Communications v1.3.3

A privacy-first, federated communication platform inspired by Google Wave with a Firefly aesthetic.

## What's New in v1.3.3

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
cortex-v1.3/
├── server/
│   ├── server.js           # Express + WebSocket server
│   ├── package.json        # Server dependencies
│   └── data/               # JSON data files (auto-created)
│       ├── users.json
│       ├── waves.json
│       ├── messages.json
│       ├── groups.json
│       └── handle-requests.json
├── client/
│   ├── CortexApp.jsx       # Main React application
│   ├── main.jsx            # Entry point
│   ├── index.html          # HTML template
│   ├── vite.config.js      # Vite configuration
│   └── package.json        # Client dependencies
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
| PUT | `/api/users/profile` | Update display name, avatar |
| PUT | `/api/users/password` | Change password |
| PUT | `/api/profile/preferences` | Update theme, font size (v1.3.2+) |
| POST | `/api/users/handle/request` | Request handle change |
| GET | `/api/users/handle/requests` | Get user's handle requests |
| GET | `/api/users/handle/history` | Get handle change history |

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

## User Identity Model

```javascript
{
  id: "uuid-7a8b9c...",           // Immutable, used in all references
  handle: "mal",                   // Changeable (admin-approved)
  displayName: "Malcolm Reynolds", // Freely changeable
  avatar: "M",                     // Freely changeable (1-2 chars)
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

```bash
# Server
PORT=3001                          # Server port
JWT_SECRET=your-secret-key         # JWT signing key (required in production)
JWT_EXPIRES_IN=7d                  # Token expiration
ALLOWED_ORIGINS=https://your-domain.com  # CORS whitelist
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
}
```

## Roadmap

### v1.3.3 - Theme System Polish
- [ ] Full CSS variable refactoring for complete theme support
- [ ] Additional accessibility themes (deuteranopia, protanopia)
- [ ] Theme preview in preferences
- [ ] Custom theme creation

### v1.4 - Wave Management
- [x] Wave deletion (completed in v1.3.2)
- [ ] Wave sharing with privacy escalation
- [ ] Collapsible sidebar sections
- [ ] Starred/pinned waves
- [ ] Message reactions (emoji reactions)

### v1.5 - Scale & Organization
- [ ] Wave search and filtering
- [ ] Smart groups (unread, active)
- [ ] SQLite migration
- [ ] Image upload (not just URL embedding)
- [ ] Message pagination/virtual scrolling

### v2.0 - Federation & Alerts
- [ ] Federated alert system
- [ ] Ticker bar for notifications
- [ ] Alert promotion (admin feature)
- [ ] Cross-server communication

## License

MIT License - See LICENSE file for details.
