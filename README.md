# FARHOLD - Secure Wave Communications

**Version 2.0.0** | A privacy-first, federated communication platform inspired by Google Wave.

> *"Can't stop the signal."* — Farhold (formerly Farhold)

## Terminology

| Term | Description |
|------|-------------|
| **Wave** | A conversation container |
| **Ping** | An individual message (formerly "ping") |
| **Burst** | Breaking a thread into a new wave (formerly "ripple") |
| **Crew** | A user group (formerly "group") |

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
- **Waves** - Conversation containers where pings create discussions
- **Pings** - Threaded messages with Focus View and Burst capabilities
- **Real-Time** - WebSocket-powered instant messaging
- **Crews & Contacts** - Organize connections with request/invitation workflows
- **Search** - Full-text search across all pings (SQLite FTS)
- **PWA** - Installable app with offline support and push notifications
- **E2EE** - End-to-end encryption for private conversations (v1.19.0)
- **Federation** - Connect multiple Farhold servers to share waves (v1.13.0)
- **Crawl Bar** - Live scrolling ticker with stocks, weather, and news (v1.15.0)

### End-to-End Encryption (v1.19.0)
- **Always-On E2EE** - All new waves encrypted by default when enabled
- **Passphrase Protected** - Private keys secured with user passphrase
- **Per-Wave Keys** - Each wave has unique AES-256-GCM encryption key
- **Key Rotation** - Automatic re-encryption when participants removed
- **Recovery System** - Optional recovery passphrase for key backup
- **Zero-Knowledge Server** - Server never sees plaintext content
- **Web Crypto API** - Native browser cryptography, no external libraries

### Federation (v1.13.0)
- **Server-to-Server** - Multiple Farhold instances can exchange pings
- **Federated Users** - Add `@user@other-server.com` as wave participants
- **HTTP Signatures** - RSA-SHA256 signed requests for server authentication
- **Trust Model** - Manual allowlist of trusted federation partners
- **Message Queue** - Reliable delivery with exponential backoff retries
- **Admin Panel** - Manage federation identity and trusted nodes

### Crawl Bar (v1.15.0)
- **Stock Ticker** - Real-time stock quotes from Finnhub API
- **Weather Data** - Current conditions and alerts from OpenWeatherMap
- **Breaking News** - Headlines from NewsAPI.org and GNews.io
- **Auto-Scroll** - CSS animation with configurable speed (slow/normal/fast)
- **Pause on Hover** - Touch or hover to pause scrolling
- **User Preferences** - Toggle sections, customize speed, override location
- **Admin Config** - Set stock symbols, default location, refresh intervals
- **IP Geolocation** - Automatic location detection with user override

### Pings Architecture (v2.0.0, formerly "Pings" v1.10.0)
- **Focus View** - View any ping with replies as its own wave-like context
- **Burst** - Spin off deep threads into new waves while maintaining links
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
- **End-to-End Encryption** - Zero-knowledge message encryption (v1.19.0)
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
│   ├── FarholdApp.jsx          # Main React app
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

# Crawl Bar APIs (optional) - see "Enabling Crawl Bar" below
FINNHUB_API_KEY=your-finnhub-key         # Stock quotes
OPENWEATHERMAP_API_KEY=your-owm-key      # Weather data
NEWSAPI_KEY=your-newsapi-key             # News headlines (primary)
GNEWS_API_KEY=your-gnews-key             # News headlines (backup)
RATE_LIMIT_CRAWL_MAX=60                  # Per minute (default)
```

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Current user info |

### Waves & Pings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/waves` | List waves |
| POST | `/api/waves` | Create wave |
| GET | `/api/waves/:id` | Get wave with pings |
| POST | `/api/waves/:id/pings` | Send ping |
| PUT | `/api/pings/:id` | Edit ping |
| DELETE | `/api/pings/:id` | Delete ping |
| POST | `/api/pings/:id/ripple` | Ripple to new wave |

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

Federation allows multiple Farhold servers to exchange waves and pings. Users can participate in waves hosted on other servers.

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

To connect with another Farhold server:

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

Farhold supports three email providers:
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

Farhold supports two MFA methods:
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

## Enabling Crawl Bar

The Crawl Bar is a horizontal scrolling ticker that displays real-time stock quotes, weather data, and breaking news. Each data source requires its own API key. Missing API keys will simply hide that section - no errors occur.

### Overview

| Data Source | API Provider | Free Tier Limit | Cache Duration |
|-------------|--------------|-----------------|----------------|
| **Stocks** | Finnhub | 60 calls/minute | 60 seconds |
| **Weather** | OpenWeatherMap | 1,000 calls/day | 5 minutes |
| **News** | NewsAPI.org | 100 calls/day (dev) | 3 minutes |
| **News (backup)** | GNews.io | 100 calls/day | 3 minutes |
| **Location** | ip-api.com | 45 calls/minute | Per session |

### Step 1: Get a Finnhub API Key (Stocks)

Finnhub provides real-time stock market data for US exchanges.

1. Go to [https://finnhub.io/](https://finnhub.io/)
2. Click **"Get free API key"** (top right)
3. Sign up with email or OAuth (Google/GitHub/Apple)
4. Verify your email address
5. Go to **Dashboard** → Your API key is displayed
6. Copy the key (looks like: `c1234abcd5678efgh`)

**Free tier limits:**
- 60 API calls per minute
- Real-time US stock quotes
- Basic company profiles

Add to your `server/.env`:
```bash
FINNHUB_API_KEY=your-finnhub-api-key
```

### Step 2: Get an OpenWeatherMap API Key (Weather)

OpenWeatherMap provides current weather conditions and alerts.

1. Go to [https://openweathermap.org/](https://openweathermap.org/)
2. Click **"Sign In"** → **"Create an Account"**
3. Fill out the registration form
4. Verify your email address
5. Go to your profile → **"My API Keys"**
6. Copy your default key or generate a new one (looks like: `abc123def456ghi789`)

**Important:** New API keys take **up to 2 hours** to activate!

**Free tier limits:**
- 1,000 API calls per day
- Current weather data
- 3-hour forecast

Add to your `server/.env`:
```bash
OPENWEATHERMAP_API_KEY=your-openweathermap-api-key
```

### Step 3: Get a NewsAPI.org API Key (News - Primary)

NewsAPI.org aggregates headlines from major news sources.

1. Go to [https://newsapi.org/](https://newsapi.org/)
2. Click **"Get API Key"**
3. Sign up with name, email, and password
4. Select use case: **"I am an individual"**
5. Verify your email
6. Your API key is shown on the dashboard (looks like: `abc123def456ghi789jkl012`)

**Free tier limits:**
- 100 requests per day
- **Development only** - works on localhost but not production domains
- For production, upgrade to paid plan ($449/month) or use GNews as primary

Add to your `server/.env`:
```bash
NEWSAPI_KEY=your-newsapi-api-key
```

### Step 4: Get a GNews.io API Key (News - Backup/Alternative)

GNews.io is a free alternative that works in production.

1. Go to [https://gnews.io/](https://gnews.io/)
2. Click **"Get API Key"**
3. Sign up with email and password
4. Verify your email
5. Go to **Dashboard** to see your API key (looks like: `abc123def456ghi789`)

**Free tier limits:**
- 100 requests per day
- Works in production (unlike NewsAPI free tier)
- 10 articles per request

Add to your `server/.env`:
```bash
GNEWS_API_KEY=your-gnews-api-key
```

**Tip:** Configure both NewsAPI and GNews - Farhold will use NewsAPI first and fall back to GNews if it fails.

### Step 5: Restart Server

Restart your server to load the new API keys. You should see in the logs:

```
📊 Crawl bar APIs: stocks=✓ weather=✓ news=✓
```

If any API is not configured:
```
📊 Crawl bar APIs: stocks=✗ weather=✓ news=✓
```

### Admin Configuration

Admins can configure the crawl bar in **Profile Settings** → **Admin Panel** → **Crawl Bar Config**:

- **Feature Toggles** - Enable/disable stocks, weather, or news globally
- **Stock Symbols** - Comma-separated list of ticker symbols (e.g., `AAPL, GOOGL, MSFT, AMZN, TSLA`)
- **Default Location** - Fallback location when IP geolocation fails (e.g., `New York, NY`)
- **Refresh Intervals** - How often to refresh each data type (in seconds)

### User Preferences

Users can customize their crawl bar experience in **Profile Settings** → **Crawl Bar**:

- **Enable/Disable** - Toggle the crawl bar on or off
- **Content** - Choose which sections to show (Stocks, Weather, News)
- **Scroll Speed** - Slow, Normal, or Fast
- **Location Override** - Set a custom location for weather data

### Location Detection

Farhold automatically detects user location using IP geolocation (ip-api.com):

1. **User Override** - If user sets a location in preferences, that's used
2. **IP Geolocation** - Falls back to detecting location from IP address
3. **Server Default** - If both fail, uses admin-configured default location

### Graceful Degradation

The crawl bar is designed to work with any combination of API keys:

| APIs Configured | Behavior |
|-----------------|----------|
| All APIs | Full crawl bar with stocks, weather, news |
| No Finnhub | Weather and news only, stocks section hidden |
| No Weather API | Stocks and news only, weather section hidden |
| No News APIs | Stocks and weather only, news section hidden |
| No APIs | Crawl bar hidden entirely |

### Rate Limiting

The crawl bar has its own rate limiter (default: 60 requests/minute per user). This can be adjusted:

```bash
RATE_LIMIT_CRAWL_MAX=60  # Requests per minute
```

### Troubleshooting

**"Stock data not configured"**
- Check that `FINNHUB_API_KEY` is set correctly
- Verify the key at [finnhub.io/dashboard](https://finnhub.io/dashboard)

**Weather always shows default location**
- New OpenWeatherMap keys take up to 2 hours to activate
- Check that `OPENWEATHERMAP_API_KEY` is set correctly

**News not loading**
- NewsAPI.org free tier only works on localhost
- For production, use GNews.io or upgrade NewsAPI plan

**Crawl bar not appearing**
- Check that `user.preferences.crawlBar.enabled` is not `false`
- Verify at least one API key is configured
- Check browser console for JavaScript errors

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

This ensures Farhold automatically restarts after server reboots.

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

### v1.19.4 (December 2025)
- **E2EE Unlock Modal Improvement**: Clearer password prompt text
  - Shows "Enter your password to unlock" instead of confusing "Original Encryption Passphrase"
  - Migration notice only shown when password actually mismatches

### v1.19.3 (December 2025)
- **E2EE Unlock Fix**: Fixed stuck spinner when reopening PWA
  - App was stuck on "Preparing encryption..." when reopening PWA or refreshing
  - Now correctly shows unlock modal when no pending password exists

### v1.19.2 (December 2025)
- **PWA Caching Fix**: Service worker now uses network-first for HTML
  - Fixes spinning circle issue where stale cached HTML prevented app loading
  - Hashed assets (JS/CSS) still use cache-first (safe because immutable)
  - Users can navigate to `?clear=1` to force clear all cached data

### v1.19.1 (December 2025)
- **Wave Participant Management**: Invite and remove participants from waves
  - INVITE button in participant panel to add contacts to waves
  - REMOVE button for wave creators to remove participants
  - LEAVE button for participants to leave waves
  - E2EE key distribution when adding participants
  - Key rotation when participants are removed
- **Stale Data Recovery**: Clear cached data on major version upgrade
  - "Clear all data" button on login screen
  - `?clear=1` URL parameter for emergency recovery
  - Automatic data clearing when major version changes

### v1.19.0 (December 2025)
- **End-to-End Encryption**: Zero-knowledge encryption for all waves
  - ECDH P-384 keypairs for each user, protected by passphrase
  - AES-256-GCM encryption for ping content with unique nonces
  - Per-wave symmetric keys distributed via ECDH key exchange
  - Key rotation when participants are removed from waves
  - Optional recovery passphrase for key backup
  - Legacy wave notice for pre-E2EE content
- **E2EE Setup Flow**: First-time passphrase creation with optional recovery
- **Passphrase Unlock**: Private key decryption on login
- **Wave Key Cache**: LRU cache (100 keys) for performance
- **Database Schema**: New encryption tables for keys and metadata

### v1.18.0 (December 2025)
- **Session Management**: View and revoke login sessions from any device
  - List all active sessions with device info and IP addresses
  - Revoke individual sessions or logout all other devices
  - Automatic session cleanup (hourly background job)
- **GDPR Compliance**: User data export and account deletion
  - Download all personal data as JSON
  - Permanently delete account with password confirmation
  - Pings preserved as "[Deleted User]", waves transferred
- **Security Hardening**:
  - HSTS headers enabled (1-year max-age)
  - Optional HTTPS enforcement (`ENFORCE_HTTPS=true`)
  - Restrictive CORS (`ALLOWED_ORIGINS` required in production)
  - Session tokens hashed before storage

### v1.17.0 - v1.17.7 (December 2025)
- **v1.17.7**: WebSocket rate limiting (60 msg/min, 20 typing/min)
- **v1.17.6**: Server version fix (uses package.json VERSION)
- **v1.17.5**: Activity log filter fix
- **v1.17.4**: PWA app badge, tab title unread count, favicon flashing
- **v1.17.3**: Collapsible sections, password confirmation, wave rename fix
- **v1.17.2**: @ mention autocomplete, styled mentions, alert expiration fix
- **v1.17.1**: Compact ping display, inline action buttons, reduced nesting
- **v1.17.0**: Share public pings with Open Graph meta tags

### v1.16.0 (December 2025)
- **Alert Pings**: Admin-created system alerts in crawl bar
  - Priority levels: Critical, Warning, Info
  - Scheduled start/end times
  - Per-user dismissal tracking
  - Federation: Subscribe to alerts from other servers

### v1.15.0 (December 2025)
- **Crawl Bar**: Live scrolling news ticker with stocks, weather, and news
  - Finnhub integration for real-time stock quotes
  - OpenWeatherMap integration for weather data and alerts
  - NewsAPI.org and GNews.io for breaking news headlines
  - IP geolocation with user override option
  - CSS animation with configurable scroll speed (slow/normal/fast)
  - Pause on hover/touch interaction
  - Graceful degradation when APIs unavailable
- **User Preferences**: Customize crawl bar in Profile Settings
  - Enable/disable crawl bar
  - Toggle individual sections (Stocks, Weather, News)
  - Adjust scroll speed
  - Override location for weather
- **Admin Configuration**: Server-wide crawl bar settings
  - Configure stock symbols to display
  - Set default location fallback
  - Enable/disable features globally
  - Adjust refresh intervals
  - View API key status
- **Database Schema**: New crawl bar tables
  - `crawl_config` - Server configuration (singleton)
  - `crawl_cache` - API response caching
- **Environment Variables**:
  - `FINNHUB_API_KEY` - Stock quote API
  - `OPENWEATHERMAP_API_KEY` - Weather data API
  - `NEWSAPI_KEY` - News headlines (primary)
  - `GNEWS_API_KEY` - News headlines (backup)
  - `RATE_LIMIT_CRAWL_MAX` - Rate limit for crawl endpoints

### v1.13.0 (December 2025)
- **Federation**: Server-to-server communication for cross-instance waves
  - HTTP Signature authentication (RSA-SHA256) between servers
  - Federated user resolution (`@user@server.com` format)
  - Wave invitations propagate to remote servers
  - Pings sync in real-time across federated nodes
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
  - `remote_pings` - Cached pings from federated waves
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
  - Green (↩) for replies to your pings
  - Purple (◈) for ripple activity
  - Orange for general wave activity
- **Notification Preferences**: Per-type control in Profile Settings
  - Configure: always, app closed only, or never
  - "Suppress while focused" option
- **API Deprecation**: Legacy `/api/messages/*` endpoints now return deprecation headers
  - Migration guide in docs/API.md
  - Sunset date: March 1, 2026
- **Component Cleanup**: Internal terminology alignment (ThreadedMessage → Ping)
- **Auto-Focus Preference**: Optional auto-enter Focus View on ping click
- **Bug Fixes**:
  - Notification badges now clear when pings are read
  - Push notification re-enable after disabling

### v1.10.0 (December 2025)
- **Pings Architecture**: Messages renamed to Pings throughout
- **Focus View**: View any ping with replies as its own wave-like context
  - Desktop: "⤢ FOCUS" button on pings with children
  - Mobile: Tap ping content, swipe right to go back
  - Breadcrumb navigation with clickable path items
- **Ripple System**: Spin off ping threads into new waves
  - "◈ RIPPLE" button creates new wave from ping tree
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
