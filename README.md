# CORTEX - Secure Wave Communications

**Version 2.28.1** | A privacy-first, federated communication platform inspired by Google Wave.

> *"Can't stop the signal."*

## Terminology

| Term | Description |
|------|-------------|
| **Wave** | A conversation container |
| **Ping** | An individual message |
| **Burst** | Breaking a thread into a new wave |
| **Crew** | A user group |

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

Demo accounts (password: `Demo123!`, requires `SEED_DEMO_DATA=true`):
- `mal` - Malcolm Reynolds (Admin)
- `zoe`, `wash`, `kaylee`, `jayne`, `inara`, `simon`, `river`

---

## Features

### Core
- **Waves** — Conversation containers with threaded pings
- **Focus View** — View any ping with replies as its own wave-like context
- **Burst** — Spin off threads into new waves while maintaining links
- **Crews & Contacts** — Organize connections with request/invitation workflows
- **Wave Categories** — User-defined categories with drag-and-drop organization
- **Search** — Full-text search across all pings (SQLite FTS5)
- **PWA** — Installable app with offline support and push notifications
- **Collapsible Messages** — Collapse long messages to compact previews

### End-to-End Encryption
- **ECDH P-384 + AES-256-GCM** — Per-wave symmetric keys distributed via key exchange
- **Zero-knowledge server** — Server never sees plaintext message content
- **Key rotation** — Automatic re-encryption when participants are removed
- **Web Crypto API** — Native browser cryptography, no external libraries

### Privacy Hardening
- **Email protection** — Hashed (SHA-256) + encrypted (AES-256-GCM), never stored in plaintext
- **IP anonymization** — Truncated to /24 subnet before storage
- **User-Agent truncation** — Only browser and OS retained
- **Timestamp rounding** — Activity rounded to 15-min windows, sessions to 5-min
- **Encrypted metadata** — Wave participation, crew membership, push subscriptions encrypted at rest
- **Client-encrypted contacts** — Only the user can decrypt their own contact list
- **Ghost Protocol** — PIN-protected hidden waves with cryptographic participation deniability
- **Data retention** — Activity logs and sessions auto-deleted after 30 days (configurable)
- **No third-party tracking** — No analytics, no ads, no third-party cookies

See [docs/PRIVACY.md](docs/PRIVACY.md) for the full privacy policy.

### Federation
- **Server-to-server** — Multiple Cortex instances exchange pings across the Verse
- **Federated users** — Add `@user@other-server.com` as wave participants
- **HTTP Signatures** — RSA-SHA256 signed requests for server authentication
- **Cover traffic** — Decoy messages, message padding, and queue jitter resist traffic analysis
- **Trust model** — Manual allowlist of trusted federation partners (Allied Ports)

### Media
- **Voice/Video messages** — Record and send audio (5 min) and video messages
- **Voice/Video calls** — Real-time calls via LiveKit with screen sharing
- **Rich embeds** — YouTube, Spotify, Vimeo, Twitter, SoundCloud
- **Images & GIFs** — Upload, paste, or search via Tenor/GIPHY
- **Media server integration** — Jellyfin, Emby, and Plex with OAuth and HLS transcoding
- **S3-compatible storage** — Optional S3/MinIO backend for uploads

### Crawl Bar
- **Stock ticker** — Real-time quotes from Finnhub API
- **Weather data** — Current conditions from OpenWeatherMap
- **Breaking news** — Headlines from NewsAPI.org and GNews.io
- **Admin alerts** — Scheduled system alerts with priority levels

### Customization
- **Custom themes** — Visual theme editor, gallery, create/share/install themes
- **Holiday effects** — Automatic seasonal visual effects (toggleable)
- **Firefly personality** — Easter eggs and themed UI throughout
- **Outgoing webhooks** — Forward wave messages to Discord, Slack, Teams

### Security
- JWT authentication with session management and token revocation
- End-to-end encryption (ECDH P-384 + AES-256-GCM)
- Multi-factor authentication (TOTP and email-based 2FA)
- Role-based access control (Admin / Moderator / User)
- Password recovery via email
- Rate limiting on all endpoints with persistent account lockout
- HTML sanitization, Helmet.js security headers, HSTS
- HTTP Signature verification for federation
- GDPR compliance — data export ("Ship's Manifest") and account deletion ("Abandon Ship")

---

## Project Structure

```
cortex/
├── server/
│   ├── server.js              # Express + WebSocket server
│   ├── database-sqlite.js     # SQLite database layer
│   ├── email-service.js       # Email provider abstraction
│   ├── storage.js             # File/S3 storage abstraction
│   ├── schema.sql             # Database schema
│   ├── migrations/            # Database migrations
│   └── data/                  # Data storage
├── client/
│   ├── CortexApp.jsx          # Root React component
│   ├── messages.js            # UI strings and Firefly messages
│   └── src/
│       ├── views/             # Page-level components
│       ├── components/        # Feature components (admin, calls, media, etc.)
│       ├── hooks/             # Custom React hooks (API, WebSocket, etc.)
│       ├── services/          # Voice call service
│       ├── config/            # Constants, holidays, theme config
│       └── utils/             # Shared utilities
├── tools/                     # Migration utilities
└── docs/                      # API docs, privacy policy, backlog
```

---

## Configuration

Create `server/.env` (see `.env.example` for full list):

```bash
# Required
PORT=3001
JWT_SECRET=your-secret-key  # Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Database
USE_SQLITE=true                    # SQLite (recommended)
SEED_DEMO_DATA=true                # Create demo accounts

# Security
ALLOWED_ORIGINS=https://your-domain.com

# Privacy encryption keys (generate each: openssl rand -hex 32)
EMAIL_ENCRYPTION_KEY=<32-byte-hex>
WAVE_PARTICIPATION_KEY=<32-byte-hex>
PUSH_SUBSCRIPTION_KEY=<32-byte-hex>
CREW_MEMBERSHIP_KEY=<32-byte-hex>

# GIF Search
GIF_PROVIDER=tenor                 # giphy, tenor, or both
TENOR_API_KEY=your-key
GIPHY_API_KEY=your-key

# Push Notifications (optional)
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_EMAIL=mailto:admin@example.com

# Federation (optional)
FEDERATION_ENABLED=false
FEDERATION_NODE_NAME=cortex.example.com

# Email Service (optional — required for password reset and email MFA)
EMAIL_PROVIDER=smtp                # smtp, sendgrid, or mailgun
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Crawl Bar APIs (optional)
FINNHUB_API_KEY=your-key           # Stock quotes
OPENWEATHERMAP_API_KEY=your-key    # Weather data
NEWSAPI_KEY=your-key               # News headlines
GNEWS_API_KEY=your-key             # News headlines (backup)
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
| POST | `/api/pings/:id/burst` | Burst to new wave |

### Crews & Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/request` | Send contact request |
| POST | `/api/contacts/requests/:id/accept` | Accept request |
| POST | `/api/crews/:id/invite` | Invite to crew |
| POST | `/api/crews/invitations/:id/accept` | Accept invitation |

### Bot API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bot/ping` | Post a ping as bot |
| GET | `/api/bot/waves` | List bot's accessible waves |
| GET | `/api/bot/waves/:id` | Get wave details |

See [docs/API.md](docs/API.md) for complete API documentation.

---

## Deployment

### Production with PM2

```bash
# Install PM2
npm install -g pm2

# Build client
cd client && npm run build

# Start server
cd server && pm2 start server.js --name cortex-api

# Auto-start on boot
pm2 startup && pm2 save
```

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

## Privacy Levels

| Level | Icon | Description |
|-------|------|-------------|
| Private | &#9673; | Only invited participants |
| Crew | &#9672; | All crew members |
| Cross-Server | &#9671; | Federated across the Verse |
| Public | &#9675; | Public waves |

---

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — Complete version history
- [docs/API.md](docs/API.md) — API endpoint documentation
- [docs/PRIVACY.md](docs/PRIVACY.md) — Privacy policy
- [OUTSTANDING-FEATURES.md](OUTSTANDING-FEATURES.md) — Future roadmap

---

## License

MIT License — See LICENSE file for details.
