# CORTEX - Secure Wave Communications

**Version 1.10.0** | A privacy-first, federated communication platform inspired by Google Wave.

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
cp .env.example .env  # Edit with your settings
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
- `zoe`, `wash`, `kaylee`, `jayne`, `inara`, `simon`, `river`

---

## Features

### Core Features
- **Waves** - Conversation containers where droplets create discussions
- **Droplets** - Threaded messages with Focus View and Ripple capabilities
- **Real-Time** - WebSocket-powered instant messaging
- **Groups & Contacts** - Organize connections with request/invitation workflows
- **Search** - Full-text search across all droplets (SQLite FTS)
- **PWA** - Installable app with offline support and push notifications

### Droplets Architecture (v1.10.0)
- **Focus View** - View any droplet with replies as its own wave-like context
- **Ripple** - Spin off deep threads into new waves while maintaining links
- **Threading Depth Limit** - 3-level inline limit, unlimited in Focus View
- **Breadcrumb Navigation** - Navigate focus stack with clickable path

### Rich Media
- **Embeds** - YouTube, Spotify, Vimeo, Twitter, SoundCloud players
- **Images** - Upload or paste image URLs with auto-embedding
- **GIFs** - GIPHY integration for searching and inserting GIFs
- **Emoji** - Quick emoji picker for messages and reactions

### User Features
- **Profiles** - Customizable avatar, display name, and bio
- **Preferences** - Theme selection and font size control
- **Moderation** - Block and mute users
- **Read Receipts** - Per-message read tracking

### Security
- JWT authentication with 7-day tokens
- Rate limiting on all endpoints
- Account lockout after failed attempts
- HTML sanitization for all user content
- Helmet.js security headers

---

## Project Structure

```
cortex/
├── server/
│   ├── server.js              # Express + WebSocket server
│   ├── database-sqlite.js     # SQLite database (optional)
│   ├── schema.sql             # Database schema
│   ├── .env                   # Environment config
│   └── data/                  # Data storage
├── client/
│   ├── CortexApp.jsx          # Main React app
│   ├── public/
│   │   ├── sw.js              # Service worker
│   │   └── manifest.json      # PWA manifest
│   └── package.json
└── README.md
```

---

## Configuration

Create `server/.env`:

```bash
# Required
PORT=3001
JWT_SECRET=your-secret-key  # Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Optional
USE_SQLITE=true                    # SQLite instead of JSON (recommended)
SEED_DEMO_DATA=true                # Create demo accounts
GIPHY_API_KEY=your-key             # For GIF search
ALLOWED_ORIGINS=https://your-domain.com

# Push Notifications (optional)
VAPID_PUBLIC_KEY=your-public-key   # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=your-private-key
VAPID_EMAIL=mailto:admin@example.com

# Rate Limits (defaults shown)
RATE_LIMIT_LOGIN_MAX=30            # Per 15 minutes
RATE_LIMIT_API_MAX=300             # Per minute
RATE_LIMIT_OEMBED_MAX=30           # Per minute
```

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Current user info |

### Waves & Droplets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/waves` | List waves |
| POST | `/api/waves` | Create wave |
| GET | `/api/waves/:id` | Get wave with droplets |
| POST | `/api/waves/:id/droplets` | Send droplet |
| PUT | `/api/droplets/:id` | Edit droplet |
| DELETE | `/api/droplets/:id` | Delete droplet |
| POST | `/api/droplets/:id/ripple` | Ripple to new wave |

### Contacts & Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/request` | Send contact request |
| POST | `/api/contacts/requests/:id/accept` | Accept request |
| POST | `/api/groups/:id/invite` | Invite to group |
| POST | `/api/groups/invitations/:id/accept` | Accept invitation |

### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/users/profile` | Update profile |
| POST | `/api/profile/avatar` | Upload avatar |
| POST | `/api/users/:id/block` | Block user |
| POST | `/api/users/:id/mute` | Mute user |

See `CLAUDE.md` for complete API documentation.

---

## Deployment

### Production Server with PM2

[PM2](https://pm2.keymetrics.io/) is a production process manager for Node.js that keeps your server running, handles restarts, and provides monitoring.

#### Install PM2

```bash
npm install -g pm2
```

#### Start the Server

```bash
cd server

# Start with PM2
pm2 start server.js --name cortex

# Or with environment variables
pm2 start server.js --name cortex --env production
```

#### PM2 Ecosystem File (Recommended)

Create `ecosystem.config.js` in the project root:

```javascript
module.exports = {
  apps: [{
    name: 'cortex',
    script: './server/server.js',
    instances: 1,              // Use 1 for WebSocket compatibility
    exec_mode: 'fork',         // Fork mode required for WebSocket
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      USE_SQLITE: 'true'
    },
    // Restart settings
    max_memory_restart: '500M',
    restart_delay: 1000,
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/cortex-error.log',
    out_file: './logs/cortex-out.log',
    merge_logs: true,
    // Watch (optional, for development)
    watch: false,
    ignore_watch: ['node_modules', 'data', 'logs', 'uploads']
  }]
};
```

Then start with:

```bash
# Development
pm2 start ecosystem.config.js

# Production
pm2 start ecosystem.config.js --env production
```

#### Common PM2 Commands

```bash
pm2 list                    # List all processes
pm2 logs cortex             # View logs (real-time)
pm2 logs cortex --lines 100 # View last 100 lines
pm2 monit                   # Terminal-based monitoring
pm2 restart cortex          # Restart the server
pm2 stop cortex             # Stop the server
pm2 delete cortex           # Remove from PM2
pm2 save                    # Save process list for startup
pm2 startup                 # Generate startup script
```

#### Auto-Start on Boot

```bash
# Generate startup script (run as root or with sudo)
pm2 startup

# Save current process list
pm2 save
```

This ensures Cortex automatically restarts after server reboots.

#### Serving the Client

For production, build the client and serve statically:

```bash
cd client
npm run build
```

Then either:
1. **Nginx**: Serve `client/dist/` directly (recommended)
2. **PM2 + serve**: `pm2 serve client/dist 3000 --name cortex-client --spa`

---

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name cortex.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /uploads {
        proxy_pass http://localhost:3001;
    }
}
```

**Nginx Proxy Manager Note:** Disable "Cache Assets" to prevent profile images from breaking.

---

## Changelog

### v1.10.0 (December 2025)
- **Droplets Architecture**: Messages renamed to Droplets throughout
- **Focus View**: View any droplet with replies as its own wave-like context
  - Desktop: "⤢ FOCUS" button on droplets with children
  - Mobile: Tap droplet content, swipe right to go back
  - Breadcrumb navigation with clickable path items
- **Ripple System**: Spin off droplet threads into new waves
  - "◈ RIPPLE" button creates new wave from droplet tree
  - Link card shows "Rippled to wave..." in original
  - Nested ripple tracking for lineage
- **Threading Depth Limit**: 3-level inline limit in WaveView
  - "FOCUS TO REPLY" button at depth limit
  - Focus View allows unlimited depth
- **Database Schema**: New fields for ripple tracking
- **Backward Compatibility**: Legacy `/messages` endpoints still work

### v1.9.0 (December 2025)
- **Message Threading Improvements**: Collapse/expand threads, jump-to-parent, visual connectors
- **Mobile Gestures**: Bottom navigation bar, swipe navigation, pull-to-refresh
- **Report System**: Users can report content, admin dashboard for moderation
- **Moderation Actions**: Warning system, audit log, content removal
- **API Documentation**: Comprehensive docs/API.md with 70+ endpoints
- Mobile header shows CORTEX logo with status indicators

### v1.8.1 (December 2025)
- Fixed video embeds (YouTube, Spotify, Vimeo)
- TikTok shows as styled link card (embed.js incompatible with React)
- Fixed duplicate image embeds
- Push notification improvements (unique tags, visibility filtering)
- Added version number to footer
- iOS push notification warning

### v1.8.0 (December 2025)
- Profile images with upload and processing
- About Me / Bio section
- User Profile Modal
- SQLite database option
- PWA push notifications
- Rich media embeds (YouTube, Spotify, Twitter, etc.)
- Message image upload
- Full-text search (FTS5)

### v1.7.0 (December 2025)
- Contact request system
- Group invitation system
- User blocking and muting
- GIF search (GIPHY)

### v1.6.0 (December 2025)
- Progressive Web App (PWA)
- Read receipts display
- Offline support

### v1.5.0 (December 2025)
- Typing indicators
- Message reactions
- Message search
- Desktop notifications

See `CHANGELOG.md` for complete history.

---

## Privacy Levels

| Level | Icon | Description |
|-------|------|-------------|
| Private | ◉ | Only invited participants |
| Group | ◈ | All group members |
| Cross-Server | ◇ | Federated servers (future) |
| Public | ○ | Public feeds (future) |

---

## License

MIT License - See LICENSE file for details.
