# CORTEX - Secure Wave Communications

**Version 1.14.0** | A privacy-first, federated communication platform inspired by Google Wave.

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
- **Federation** - Connect multiple Cortex servers to share waves (v1.13.0)

### Federation (v1.13.0)
- **Server-to-Server** - Multiple Cortex instances can exchange droplets
- **Federated Users** - Add `@user@other-server.com` as wave participants
- **HTTP Signatures** - RSA-SHA256 signed requests for server authentication
- **Trust Model** - Manual allowlist of trusted federation partners
- **Message Queue** - Reliable delivery with exponential backoff retries
- **Admin Panel** - Manage federation identity and trusted nodes

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
- **Multi-Factor Authentication** - TOTP and email-based 2FA (v1.14.0)
- **Password Recovery** - Email-based password reset (v1.14.0)
- **Activity Logging** - Security audit trail with 90-day retention (v1.14.0)
- Rate limiting on all endpoints
- Account lockout after failed attempts (persisted to database)
- HTML sanitization for all user content
- Helmet.js security headers
- HTTP Signature verification for federation
- Optional database encryption (SQLCipher)

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

# Push Notifications (optional) - see "Enabling Push Notifications" below
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_EMAIL=mailto:admin@example.com

# Federation (optional) - see "Enabling Federation" below
FEDERATION_ENABLED=false           # Enable server-to-server federation
FEDERATION_NODE_NAME=cortex.example.com  # Your server's federation name

# Email Service (optional) - see "Enabling Email Service" below
EMAIL_PROVIDER=smtp                # smtp, sendgrid, or mailgun
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Database Encryption (optional)
DB_ENCRYPTION_KEY=your-32-byte-hex-key  # Requires SQLCipher build

# Activity Log Retention
ACTIVITY_LOG_RETENTION_DAYS=90     # Days to keep activity logs (default: 90)

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

## Enabling Push Notifications

Push notifications require VAPID (Voluntary Application Server Identification) keys. Without these, users will see "Failed to enable push notifications" when trying to enable them.

### Step 1: Generate VAPID Keys

Run one of these commands in the `server/` directory:

```bash
# Option A: Using npx (no install needed)
npx web-push generate-vapid-keys

# Option B: Using node directly (if web-push is installed)
node -e "const wp = require('web-push'); const k = wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + k.publicKey); console.log('VAPID_PRIVATE_KEY=' + k.privateKey);"
```

This outputs something like:
```
VAPID_PUBLIC_KEY=BLJ71vohV-asH9cGFHa9d0EbMFW78y9OsA8crl25u0cwRX6i1n2CZBsREvcXqjTKsiDtTWIWuEc63Zv_AxDs8DU
VAPID_PRIVATE_KEY=9OnEq6IyA4Q-B9UX7stt-QMizElvfvZxAOe1miE8Lik
```

### Step 2: Add to .env

Add these lines to your `server/.env` file:

```bash
VAPID_PUBLIC_KEY=your-generated-public-key
VAPID_PRIVATE_KEY=your-generated-private-key
VAPID_EMAIL=mailto:admin@yourdomain.com
```

### Step 3: Restart Server

Restart your server. You should see this in the logs:
```
🔔 Web Push notifications enabled
```

### Important Notes

- **Generate keys ONCE** - Changing keys invalidates all existing push subscriptions
- **Keep private key secret** - Never commit `VAPID_PRIVATE_KEY` to version control
- **iOS limitation** - Push notifications are not supported on iOS/Safari PWAs (Apple platform limitation)

---

## Enabling Federation

Federation allows multiple Cortex servers to exchange waves and droplets. Users can participate in waves hosted on other servers.

### Step 1: Enable Federation

Add to your `server/.env` file:

```bash
FEDERATION_ENABLED=true
FEDERATION_NODE_NAME=cortex.example.com  # Your server's public hostname
```

### Step 2: Restart Server

Restart your server. You should see:
```
🌐 Federation enabled as: cortex.example.com
📤 Federation queue processor started (30s interval)
```

### Step 3: Generate Server Identity

1. Log in as an admin user
2. Go to **Profile Settings** → **Federation** (admin only)
3. Click **"Generate Identity"** to create RSA keypair
4. Your server's public key will be displayed

### Step 4: Add Trusted Nodes

To connect with another Cortex server:

1. In the Federation panel, click **"Add Node"**
2. Enter the other server's:
   - **Node Name**: e.g., `other-cortex.example.com`
   - **Base URL**: e.g., `https://other-cortex.example.com`
3. Click **"Initiate Handshake"** to exchange public keys
4. The other server's admin must also add your server

### Step 5: Create Federated Waves

Once nodes are connected (status: "active"), users can:

1. Create a new wave
2. Add participants using `@username@other-server.com` format
3. The wave will be shared with the remote server
4. Remote users will see it in their wave list

### Federation Architecture

- **Origin Server**: Where the wave was created (authoritative)
- **Participant Server**: Servers with users in the wave (cached copy)
- **HTTP Signatures**: RSA-SHA256 signed requests between servers
- **Message Queue**: Failed deliveries retry with exponential backoff (1min → 5min → 25min → 2hr → 10hr)

### Important Notes

- **Trust is manual** - Only add servers you trust as federation partners
- **Origin is authoritative** - The server where a wave was created is the source of truth
- **Keys are permanent** - Regenerating your identity breaks existing federation relationships

---

## Enabling Email Service

Email service is required for password recovery and email-based MFA. Without it, users cannot reset forgotten passwords.

### Supported Providers

Cortex supports three email providers:
- **SMTP** - Any standard SMTP server (Gmail, Outlook, custom)
- **SendGrid** - SendGrid API
- **Mailgun** - Mailgun API

### Option A: SMTP Configuration

Add to your `server/.env`:

```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com           # Your SMTP server
SMTP_PORT=587                      # Usually 587 (TLS) or 465 (SSL)
SMTP_SECURE=false                  # true for port 465, false for 587
SMTP_USER=your-email@gmail.com     # SMTP username
SMTP_PASS=your-app-password        # SMTP password or app password
EMAIL_FROM=noreply@yourdomain.com  # Sender address
```

**Gmail Notes:**
- Use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password
- Enable "Less secure app access" or use App Passwords with 2FA

### Option B: SendGrid Configuration

```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your-api-key-here
EMAIL_FROM=noreply@yourdomain.com
```

Get your API key from [SendGrid Dashboard](https://app.sendgrid.com/settings/api_keys).

### Option C: Mailgun Configuration

```bash
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=your-api-key
MAILGUN_DOMAIN=mg.yourdomain.com   # Your Mailgun domain
EMAIL_FROM=noreply@yourdomain.com
```

### Verify Email is Working

Restart the server. You should see:
```
✉️  Email service configured (smtp)
```

If email is not configured, you'll see:
```
⚠️  Email service not configured - password reset will not work
```

### Important Notes

- **EMAIL_FROM must be verified** - SendGrid and Mailgun require sender verification
- **Test with password reset** - Use "Forgot Password" to verify email delivery
- **Check spam folders** - First emails may land in spam until reputation is established

---

## Multi-Factor Authentication (MFA)

Cortex supports two MFA methods:
- **TOTP** - Time-based codes from authenticator apps (Google Authenticator, Authy, etc.)
- **Email** - 6-digit codes sent to user's email address

### Requirements

- **TOTP**: No additional server configuration required
- **Email MFA**: Requires email service to be configured (see above)

### User Setup

Users can enable MFA in **Profile Settings** → **Two-Factor Authentication**:

1. **TOTP Setup**:
   - Click "Setup TOTP"
   - Scan QR code with authenticator app
   - Enter 6-digit code to verify
   - Save recovery codes (10 one-time backup codes)

2. **Email MFA Setup**:
   - Must have email address in profile
   - Click "Enable Email MFA"
   - Enter code sent to email
   - Save recovery codes

### Login with MFA

When MFA is enabled, login requires:
1. Enter handle/email and password
2. Choose MFA method (if multiple enabled)
3. Enter code from authenticator app, email, or recovery code

### Recovery Codes

- 10 one-time backup codes generated on MFA setup
- Each code can only be used once
- Users can regenerate codes in Profile Settings (requires current password + MFA code)
- **Store securely** - these are the only way to recover access if authenticator is lost

### Admin Password Reset

Admins can reset user passwords from the admin panel:
1. Go to **Profile Settings** → **Admin Panel**
2. Use "Reset Password" for the user
3. Option to send temporary password via email
4. User will be prompted to change password on next login

### Important Notes

- **Email MFA requires email service** - Users without email configured cannot use email MFA
- **Recovery codes are critical** - Users who lose their authenticator AND recovery codes will need admin help
- **MFA is per-user** - Each user manages their own MFA settings

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

### v1.13.0 (December 2025)
- **Federation**: Server-to-server communication for cross-instance waves
  - HTTP Signature authentication (RSA-SHA256) between servers
  - Federated user resolution (`@user@server.com` format)
  - Wave invitations propagate to remote servers
  - Droplets sync in real-time across federated nodes
  - Message queue with exponential backoff retries
- **Admin Federation Panel**: Manage server identity and trusted nodes
  - Generate/view server RSA keypair
  - Add/remove federation partners
  - Initiate handshakes to exchange public keys
  - View node status and connection health
- **Database Schema**: New federation tables
  - `server_identity` - Server's RSA keypair
  - `federation_nodes` - Trusted server allowlist
  - `remote_users` - Cached profiles from other servers
  - `remote_droplets` - Cached droplets from federated waves
  - `wave_federation` - Wave-to-node relationships
  - `federation_queue` - Outbound message queue
  - `federation_inbox_log` - Inbound message deduplication
- **Environment Variables**:
  - `FEDERATION_ENABLED` - Enable/disable federation
  - `FEDERATION_NODE_NAME` - Server's public hostname

### v1.12.1 (December 2025)
- **Bug Fix**: GIF and image embedding now works correctly in SQLite mode
  - Added missing `sanitizeMessage()` and `detectAndEmbedMedia()` calls to SQLite database class
  - GIPHY URLs are now properly converted to embedded `<img>` tags

### v1.12.0 (December 2025)
- **CSS Variable Theme System**: Complete theme overhaul using CSS variables
  - 5 themes: Firefly (default), High Contrast, Light, Amber CRT, Matrix
  - Theme persistence via localStorage
  - Consistent styling across all components
- **Push Notification Fixes**: VAPID key change detection and auto-resubscribe
- **Service Worker Improvements**: Better cache management and update handling

### v1.11.0 (December 2025)
- **Notification System**: Comprehensive in-app notifications
  - Notifications for @mentions, replies, wave activity, and ripples
  - Smart routing: notifications suppressed when viewing source wave
  - Real-time WebSocket updates
- **Enhanced Wave List Badges**: Color-coded notification indicators
  - Amber (@) for direct mentions
  - Green (↩) for replies to your droplets
  - Purple (◈) for ripple activity
  - Orange for general wave activity
- **Notification Preferences**: Per-type control in Profile Settings
  - Configure: always, app closed only, or never
  - "Suppress while focused" option
- **API Deprecation**: Legacy `/api/messages/*` endpoints now return deprecation headers
  - Migration guide in docs/API.md
  - Sunset date: March 1, 2026
- **Component Cleanup**: Internal terminology alignment (ThreadedMessage → Droplet)
- **Auto-Focus Preference**: Optional auto-enter Focus View on droplet click
- **Bug Fixes**:
  - Notification badges now clear when droplets are read
  - Push notification re-enable after disabling

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
| Cross-Server | ◇ | Federated servers (v1.13.0) |
| Public | ○ | Public feeds (future) |

---

## License

MIT License - See LICENSE file for details.
