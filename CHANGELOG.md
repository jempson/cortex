# Changelog

All notable changes to Cortex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.18.1] - 2025-12-24

### Fixed

- **MFA Status Display**: Fixed MFA status showing "Not Set Up" when TOTP or Email MFA was actually enabled
  - Root cause: Property name mismatch between `getMfaSettings()` return value (camelCase) and endpoint check (snake_case)
  - `settings.totp_enabled` → `settings.totpEnabled`
  - `settings.email_mfa_enabled` → `settings.emailMfaEnabled`

### Security

- **Email MFA Disable Verification**: Disabling Email MFA now requires email verification code
  - Previously only required password (inconsistent with TOTP disable which requires TOTP code)
  - New two-step flow: enter password → receive email code → confirm disable
  - Prevents unauthorized MFA disable if password is compromised

### Improved

- **MFA Code Input Clarity**: Changed confusing "TOTP Code" placeholder to clear instructions
  - Added label: "Enter the 6-digit code from your authenticator app:"
  - Applies to TOTP disable and recovery code regeneration

## [1.18.0] - 2025-12-24

### Added

#### Session Management
- View all active sessions with device info, IP addresses, and timestamps
- Revoke individual sessions or logout all other devices at once
- Sessions automatically cleaned up when they expire
- Current session clearly marked in the session list

#### GDPR Compliance
- **Download My Data**: Export all personal data as JSON (profile, droplets, wave participation, contacts, and more)
- **Delete Account**: Permanently delete your account with proper data handling
  - Droplets preserved but attributed to "[Deleted User]"
  - Waves transferred to other participants
  - Empty waves and groups automatically cleaned up

### Security
- HSTS (HTTP Strict Transport Security) headers enabled
- Optional HTTPS enforcement via `ENFORCE_HTTPS=true`
- Stricter CORS defaults - `ALLOWED_ORIGINS` required in production
- Session tokens hashed before storage (never stored in plain text)

### Improved
- Logout now properly revokes session on the server
- Better error handling throughout security features
- Rate limiting on account management endpoints

## [1.15.0] - 2025-12-17

### Added

#### Crawl Bar - Live News Ticker
- **Crawl Bar Component**: Horizontal scrolling ticker displaying stocks, weather, and news
- **CSS Animation**: Smooth continuous scroll with configurable speeds (slow/normal/fast)
- **Pause on Interaction**: Ticker pauses on mouse hover or touch
- **Gradient Fade**: Visual fade effect at left/right edges
- **Theme Integration**: Full CSS variable support for all themes
- **Responsive Design**: Adapts height and font size for mobile devices

#### Stock Market Integration (Finnhub)
- **Real-time Quotes**: Current price, change amount, and percent change
- **Multiple Symbols**: Admin-configurable list of stock symbols
- **Visual Indicators**: Green/red arrows for positive/negative changes
- **60-Second Cache**: Respects Finnhub's rate limits (60 calls/min free tier)

#### Weather Integration (OpenWeatherMap)
- **Current Conditions**: Temperature, weather description, location name
- **Weather Alerts**: Severe weather alerts displayed with warning icons
- **IP Geolocation**: Automatic location detection via ip-api.com (free)
- **User Override**: Users can set custom location in preferences
- **Server Default**: Admin-configured fallback location
- **5-Minute Cache**: ~288 calls/day within free tier limits

#### News Integration (NewsAPI.org + GNews.io)
- **Breaking Headlines**: Top news stories from multiple sources
- **Dual Provider Support**: NewsAPI as primary, GNews as fallback
- **3-Minute Cache**: Balances freshness with rate limit compliance
- **Graceful Fallback**: Automatically switches to backup provider on failure

#### User Preferences
- **Enable/Disable Toggle**: Users can hide the crawl bar entirely
- **Section Toggles**: Choose which content types to display (Stocks/Weather/News)
- **Scroll Speed**: Slow (80s), Normal (50s), or Fast (30s) full-width scroll
- **Location Override**: Set custom location name for weather data
- **Preferences API**: `PUT /api/profile/crawl-preferences`

#### Admin Configuration
- **Server-wide Settings**: Global crawl bar configuration for all users
- **Stock Symbols**: Configure which stocks to display (comma-separated)
- **Default Location**: Fallback for IP geolocation failures
- **Feature Toggles**: Enable/disable stocks, weather, or news globally
- **Refresh Intervals**: Configure cache TTL for each data type
- **API Key Status**: Dashboard shows which APIs are configured
- **Admin Endpoints**: `GET/PUT /api/admin/crawl/config`

#### API Endpoints
- `GET /api/crawl/stocks` - Get stock quotes for configured symbols
- `GET /api/crawl/weather` - Get weather for user's location
- `GET /api/crawl/news` - Get news headlines
- `GET /api/crawl/all` - Combined endpoint (recommended for efficiency)
- `PUT /api/profile/crawl-preferences` - Update user crawl settings
- `GET /api/admin/crawl/config` - Get server crawl configuration (admin)
- `PUT /api/admin/crawl/config` - Update server crawl configuration (admin)

### Database
- Added `crawl_config` table - Server-wide crawl bar configuration (singleton)
- Added `crawl_cache` table - External API response caching with TTL

### Environment Variables
- `FINNHUB_API_KEY` - Finnhub API key for stock quotes
- `OPENWEATHERMAP_API_KEY` - OpenWeatherMap API key for weather data
- `NEWSAPI_KEY` - NewsAPI.org API key for news (primary)
- `GNEWS_API_KEY` - GNews.io API key for news (backup)
- `IPINFO_TOKEN` - IPinfo.io token for enhanced geolocation (optional)
- `RATE_LIMIT_CRAWL_MAX` - Crawl endpoint rate limit (default: 60/min)

### Dependencies
- No new dependencies required (uses native `fetch` for API calls)

### Notes
- Crawl bar only displays sections with configured API keys
- No API keys = crawl bar hidden completely (graceful degradation)
- NewsAPI.org free tier only works on localhost (use GNews for production)
- OpenWeatherMap keys take up to 2 hours to activate after creation
- IP geolocation uses ip-api.com (free, no key required, 45 req/min)

---

## [1.14.0] - 2025-12-17

### Added

#### Security Enhancements - Password Recovery
- **Email Service**: Configurable email delivery supporting SMTP, SendGrid, and Mailgun
- **Password Reset Flow**: Forgot password, token verification, and reset endpoints
- **Admin Password Reset**: Admins can reset user passwords with optional email notification
- **Force Logout**: Admin endpoint to force user logout
- **Account Lockout Persistence**: Failed login attempts now stored in database (survives restarts)

#### Password Reset Endpoints
- `POST /api/auth/forgot-password` - Request password reset (rate-limited)
- `GET /api/auth/reset-password/:token` - Verify reset token
- `POST /api/auth/reset-password` - Complete password reset
- `POST /api/auth/clear-password-change` - Clear forced password change flag

#### Admin Security Endpoints
- `POST /api/admin/users/:id/reset-password` - Admin reset user password
- `POST /api/admin/users/:id/force-logout` - Force user logout

#### Multi-Factor Authentication (MFA)
- **TOTP Support**: Setup authenticator apps (Google Authenticator, Authy, etc.) with QR code
- **Email MFA**: Email-based 6-digit verification codes as alternative to TOTP
- **Recovery Codes**: 10 one-time backup codes generated on MFA setup
- **MFA Challenge Flow**: Login returns challenge when MFA is enabled, requiring second factor

#### MFA Endpoints
- `GET /api/auth/mfa/status` - Get MFA status for current user
- `POST /api/auth/mfa/totp/setup` - Begin TOTP setup (returns QR code)
- `POST /api/auth/mfa/totp/verify` - Verify TOTP code and enable
- `POST /api/auth/mfa/totp/disable` - Disable TOTP (requires password + code)
- `POST /api/auth/mfa/email/enable` - Begin email MFA setup
- `POST /api/auth/mfa/email/verify-setup` - Verify email code and enable
- `POST /api/auth/mfa/email/disable` - Disable email MFA
- `POST /api/auth/mfa/recovery/regenerate` - Generate new recovery codes
- `POST /api/auth/mfa/send-email-code` - Send email code during login
- `POST /api/auth/mfa/verify` - Verify MFA during login

#### Client UI
- Forgot password link on login screen
- Password reset page with token validation
- Confirm password field for registration
- MFA challenge screen during login (TOTP, email, or recovery code)
- MFA setup panel in Profile Settings (Two-Factor Authentication section)
- QR code display for authenticator app setup
- Recovery codes display with copy-to-clipboard functionality

### Security
- JWT_SECRET now required in production (server exits if not set)
- CORS production warning when ALLOWED_ORIGINS not configured
- Avatar URL validation to prevent path traversal attacks

### Database
- Added `account_lockouts` table for persistent rate limiting
- Added `password_reset_tokens` table for secure token storage
- Added `require_password_change` flag to users table
- Added `user_mfa` table for MFA settings (TOTP secret, email MFA, recovery codes)
- Added `mfa_challenges` table for login challenge tracking
- Added `activity_log` table for security and content event tracking

#### Activity Tracking & Audit Log
- **Activity Log System**: Track security and content events for auditing
- **90-Day Retention**: Automatic cleanup of old activity log entries
- **Admin Activity Panel**: View and filter activity log in admin dashboard
- **Action Types Tracked**: Logins, failed logins, registrations, password changes, MFA events, admin actions, wave/droplet operations

#### Activity Log Endpoints
- `GET /api/admin/activity-log` - Get paginated activity log with filters
- `GET /api/admin/activity-stats` - Get activity statistics
- `GET /api/admin/activity-log/user/:userId` - Get activity for specific user

#### Encryption at Rest
- **SQLCipher Support**: Database encryption using SQLCipher (optional)
- **Environment Variables**: `DB_ENCRYPTION_KEY` to enable database encryption
- **Production Mode**: `REQUIRE_DB_ENCRYPTION=true` to enforce encryption in production
- **Backward Compatible**: Works with existing better-sqlite3 (encryption disabled)

### Dependencies
- Added `otplib` for TOTP generation/verification
- Added `qrcode` for QR code generation

---

## [1.13.0] - 2025-12-15

### Added

#### Server-to-Server Federation
- **Federation Architecture**: Multiple Cortex servers can now exchange waves and droplets
- **HTTP Signature Authentication**: RSA-SHA256 signed requests for secure server-to-server communication
- **Federated User Format**: Reference users on other servers with `@handle@server.com`
- **Origin-Authoritative Model**: Origin server is the source of truth for wave data
- **Manual Trust Model**: Admin-managed allowlist of trusted federation partners

#### Federation Endpoints
- `GET /api/federation/identity` - Public endpoint for server's public key
- `POST /api/federation/inbox` - Receive signed messages from other servers
- `GET /api/federation/users/:handle` - Get local user profile for remote servers
- `GET /api/users/resolve/:identifier` - Resolve local or federated users

#### Admin Federation Management
- `GET /api/admin/federation/status` - Get federation status and configuration
- `GET /api/admin/federation/nodes` - List trusted federation nodes
- `POST /api/admin/federation/nodes` - Add trusted node
- `DELETE /api/admin/federation/nodes/:id` - Remove trusted node
- `POST /api/admin/federation/nodes/:id/handshake` - Exchange public keys with node

#### Database Schema (New Tables)
- `server_identity` - Server's RSA keypair (singleton)
- `federation_nodes` - Trusted federation partners
- `remote_users` - Cached profiles from federated servers
- `remote_droplets` - Cached droplets from federated waves
- `wave_federation` - Wave-to-node relationships
- `federation_queue` - Outbound message queue with retry logic
- `federation_inbox_log` - Inbound message deduplication

#### Message Queue System
- Optimistic send with automatic queue fallback on failure
- Exponential backoff retries: 1min → 5min → 25min → 2hr → 10hr
- Background processor runs every 30 seconds
- Auto-cleanup of old messages after 7 days

#### Client Updates
- **FederationAdminPanel**: New admin panel in Profile Settings for managing federation
- Generate and view server identity
- Add/remove trusted nodes
- Initiate handshakes with remote servers
- View node status and connection health

### Changed

- Server startup banner now shows federation status
- Updated environment variables section with `FEDERATION_ENABLED` and `FEDERATION_NODE_NAME`

### Technical Details

- RSA-2048 keypair generation for server identity
- HTTP Signature draft-cavage-http-signatures-12 compatible
- Rate limiting: 500 requests/minute per federated node
- Idempotent inbox processing prevents duplicate message handling

---

## [1.12.1] - 2025-12-12

### Fixed

#### SQLite Media Embedding
- **GIF/Image Embedding**: Fixed media embedding not working in SQLite mode
- Added missing `sanitizeMessage()` and `detectAndEmbedMedia()` calls to SQLite database class
- GIPHY URLs now properly converted to embedded `<img>` tags in SQLite mode

---

## [1.12.0] - 2025-12-11

### Added

#### CSS Variable Theme System
- **Complete Theme Refactor**: All colors now use CSS custom properties
- **Theme Application**: `data-theme` attribute on `<html>` element
- **Flash Prevention**: Inline script applies theme before React loads
- **Theme Persistence**: Dedicated `cortex_theme` localStorage key

#### 5 Themes Available
- **Firefly** (default): Classic green terminal with enhanced mobile contrast
- **High Contrast**: Maximum readability with brighter text and borders
- **AMOLED Black**: True #000 background for OLED battery savings
- **Light Mode**: Light background for daytime use
- **Ocean Blue**: Blue-tinted dark alternative

### Fixed

#### Push Notifications
- **VAPID Key Change Detection**: Auto re-subscribe if server VAPID key changes
- **SQLite Constraint Migration**: Auto-migration for `push_subscriptions` UNIQUE constraint
- **Toggle State Management**: Proper React state for push notification toggle
- **Error Feedback**: Detailed failure messages in UI toast

#### Database
- **Preferences Persistence**: Fixed preferences not persisting in SQLite mode
- Added `updateUserPreferences()` method to SQLite class

### Technical Details

- CSS variable categories: Background, Text, Borders, Accents, Glows, Overlays
- Mobile readability: Droplet content uses `--text-primary` for maximum contrast
- Server validates themes against: firefly, highContrast, amoled, light, ocean

---

## [1.11.0] - 2025-12-11

### Added

#### Notification System
- **In-App Notifications**: Comprehensive notification system for all activity types
- **Notification Types**: @mentions, replies to your droplets, wave activity, ripples
- **Smart Routing**: Notifications suppressed when viewing source wave
- **Real-Time Updates**: WebSocket-powered instant notifications

#### Enhanced Wave List Badges
- **Color-Coded Indicators**: Visual distinction for notification types
- **Amber (@)**: Direct @mentions
- **Green (↩)**: Replies to your droplets
- **Purple (◈)**: Ripple activity
- **Orange**: General wave activity

#### Notification Preferences
- Per-type control in Profile Settings
- Options: Always, App Closed Only, Never
- "Suppress while focused" toggle

### Changed

#### API Deprecation
- Legacy `/api/messages/*` endpoints now return deprecation headers
- Migration guide added to docs/API.md
- Sunset date: March 1, 2026

#### Component Updates
- Internal terminology alignment (ThreadedMessage → Droplet)
- Auto-focus preference for Focus View on droplet click

### Fixed

- Notification badges now clear when droplets are read
- Push notification re-enable after disabling
- Droplet creation endpoint uses POST /droplets

---

## [1.10.0] - 2025-12-10

### Added

#### Droplets Architecture
- **Terminology Rename**: Messages → Droplets throughout codebase
- Database tables renamed: `messages` → `droplets`, `messages_fts` → `droplets_fts`
- API endpoints support both `/droplets` and `/messages` (backward compatibility)
- WebSocket events renamed with legacy aliases maintained

#### Focus View
- **Wave-Like Context**: View any droplet with replies as its own wave
- **Desktop Entry**: "⤢ FOCUS" button on droplets with children
- **Mobile Entry**: Tap droplet content area, swipe right to go back
- **Breadcrumb Navigation**: Clickable path items for navigation
- **Navigation Stack**: Push/pop model for nested focus levels

#### Threading Depth Limit
- 3-level inline limit in WaveView
- "FOCUS TO REPLY" button at depth limit
- Visual depth indicator banner
- Focus View allows unlimited depth

#### Ripple System
- **Spin Off Threads**: Create new waves from droplet trees
- **RippleModal**: Title input and participant selection
- **RippledLinkCard**: Visual "Rippled to wave..." link in original
- **Nested Ripples**: `breakout_chain` field tracks lineage
- **API Endpoint**: `POST /api/droplets/:id/ripple`

### Changed

#### Database Schema
- New fields: `droplets.broken_out_to`, `droplets.original_wave_id`
- New fields: `waves.root_droplet_id`, `waves.broken_out_from`, `waves.breakout_chain`
- Auto-migration for existing SQLite databases

---

## [1.9.0] - 2025-12-10

### Added

#### Message Threading Improvements
- **Collapse/Expand**: Thread collapse with localStorage persistence per wave
- **Bulk Actions**: "Collapse All" / "Expand All" buttons in wave toolbar
- **Jump to Parent**: "↑ Parent" button with highlight animation
- **Depth Indicator**: Visual indicator for deeply nested messages (depth > 3)
- **Thread Connectors**: Dashed lines showing reply hierarchy

#### Mobile Gesture Enhancements
- **useSwipeGesture Hook**: Swipe navigation support
- **usePullToRefresh Hook**: Pull-to-refresh with PullIndicator component
- **BottomNav Component**: 5-tab navigation (Waves, Contacts, Groups, Search, Profile)
- **Haptic Feedback**: 10ms vibration on navigation
- **Badge Indicators**: Unread counts and pending requests

#### Report System
- **Report Types**: Spam, harassment, inappropriate content, other
- **Rate Limiting**: 10 reports per hour per user
- **ReportModal**: Reason selection and details textarea
- **Admin Dashboard**: ReportsAdminPanel with tabs (Pending/Resolved/Dismissed)
- **Resolution Options**: Warning Issued, Content Removed, User Banned, No Action
- **MyReportsPanel**: Users can view their submitted reports
- **WebSocket Event**: `report_resolved` notifies reporters

#### Moderation Actions
- **Warning System**: `warnings` table with `createWarning()` method
- **Moderation Audit Log**: `moderation_log` table
- **Admin Endpoints**: Warn user, get warnings, get moderation log
- **WebSocket Event**: `warning_received` notifies warned users

#### API Documentation
- Comprehensive `docs/API.md` with 70+ endpoints documented
- WebSocket events documentation
- Rate limiting and error response formats
- curl examples for key endpoints

---

## [1.8.1] - 2025-12-09

### Fixed

#### Video Embeds
- **YouTube/Spotify/Vimeo Working**: Fixed embed detection to not skip video URLs in anchor tags (only skip image URLs)
- **TikTok Link Card**: Replaced TikTok oEmbed with styled link card (TikTok's embed.js incompatible with React, caused infinite re-renders)
- **Duplicate Image Embeds**: Fixed duplicate embeds by tracking already-embedded image URLs

#### Push Notifications
- **Unique Notification Tags**: Each message now has unique tag (`cortex-msg-{messageId}`) to prevent notification replacement
- **Visibility Filtering**: Push notifications only show when app is not in foreground (client-side `clients.matchAll()` check)
- **iOS Warning**: Added console warning about iOS push notification limitations in PWA

### Added

#### Version Display
- **Footer Version**: Added "v1.8.1" version indicator to application footer
- **Tighter Footer**: Reduced footer padding for cleaner appearance

### Technical Details

- TikTok styled link card with gradient background and platform branding
- Service worker visibility check using `clients.matchAll({ type: 'window', includeUncontrolled: true })`
- Push payload includes `messageId` for unique notification tags

---

## [1.8.0] - 2025-12-08

### Added

#### Scroll-to-Unread Navigation
- **Auto-Scroll on Wave Open**: When clicking into a wave, automatically scrolls to first unread message
- **Fallback to Bottom**: If all messages are read, scrolls to the most recent message at the bottom
- **Smooth Animation**: Uses `scrollIntoView({ behavior: 'smooth', block: 'start' })` for pleasant UX
- **One-Time Scroll**: Only triggers on initial wave load, not on WebSocket updates or refreshes

### Fixed

#### WaveView Crash Fix
- **Missing useMemo Import**: Fixed `ReferenceError: useMemo is not defined` that caused blank screen when clicking into waves
- **ErrorBoundary Added**: New error boundary component catches render errors and displays them gracefully instead of blank screen
- **Defensive Null Checks**: Added fallback defaults for `waveData.messages`, `all_messages`, and `participants`

### Changed

#### Header Cleanup
- **Removed Desktop Status**: API/WebSocket connection status removed from desktop header (now in footer only)

### Technical Details

#### Implementation
- `data-message-id` attribute added to message elements for scroll targeting
- `hasScrolledToUnreadRef` ref prevents duplicate scrolling
- 100ms setTimeout ensures DOM is ready before scroll calculation

---

## [1.6.1] - 2025-12-05

### Changed

#### Mobile Header Improvements
- **App Icon Logo** - Replaced "CORTEX" text with PWA app icon (32x32px) on mobile screens
- **Compact Layout** - Removed header wrapping, flex-centered navigation buttons
- **Reduced Padding** - Tighter spacing on mobile (8px vs 10px)
- **Smaller Nav Buttons** - Reduced font size and padding for better fit

#### Logout Button Relocated
- **Moved to Settings** - Logout button removed from header, added to Profile Settings
- **New SESSION Section** - Orange-bordered LOGOUT button at bottom of settings panel
- **Better UX** - Reduces accidental logouts, more discoverable location

#### Collapsible Wave Toolbar
- **Combined Toolbar** - Participants and Playback merged into single compact bar
- **Toggle Buttons** - "PARTICIPANTS (n)" and "PLAYBACK" buttons expand/collapse panels
- **Collapsed by Default** - Both panels start collapsed to save vertical space
- **Mark All Read** - Button remains visible in toolbar when unread messages exist

### Technical Details

#### Bundle Size
- **Gzipped**: 65.23 KB (slight increase from 65.03 KB)
- **Uncompressed**: 227.05 KB
- **Build Time**: ~617ms

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Service Worker** - Cache version updated to v1.6.1

---

## [1.6.0] - 2025-12-05

### Added

#### Progressive Web App (PWA) Support
Cortex is now a fully installable Progressive Web App that works on Android and iOS devices.

- **Web App Manifest** (`client/public/manifest.json`)
  - App name, description, and theme colors
  - Display mode: standalone (full-screen app experience)
  - Orientation: portrait-primary
  - App shortcuts for quick actions
  - Categories: communication, social

- **Service Worker** (`client/public/sw.js`)
  - Stale-while-revalidate caching strategy for static assets
  - Network-first for API calls (real-time data)
  - Automatic cache cleanup on version updates
  - Push notification handlers (ready for future use)
  - Notification click handling with deep linking

- **App Icons** (`client/public/icons/`)
  - 13 PNG icons for all device sizes (16px to 512px)
  - Maskable icons for Android adaptive icons (192px, 512px)
  - Favicon support (16px, 32px)
  - Icon generator script (`generate-icons.cjs`) for regeneration

- **InstallPrompt Component**
  - Custom "Install Cortex" banner
  - Appears after 2nd visit or 30 seconds
  - 7-day dismissal cooldown
  - Detects if already installed (standalone mode)
  - Handles `beforeinstallprompt` event

- **OfflineIndicator Component**
  - Orange banner when network connection lost
  - Real-time online/offline detection
  - Auto-hides when connection restored

- **iOS PWA Support**
  - `apple-mobile-web-app-capable` meta tag
  - `apple-mobile-web-app-status-bar-style` (black-translucent)
  - `apple-touch-icon` links for home screen icons

- **Service Worker Registration**
  - Automatic registration on page load
  - Hourly update checks
  - Update notification handling

#### Read Receipts Display
Visual UI for the per-message read tracking system (backend from v1.4.0).

- **Participant Read Status Bar**
  - Shows all wave participants in header
  - Green ✓ indicator for users who've read latest message
  - Gray ○ indicator for users with unread messages
  - Hover tooltip shows read/unread status

- **Per-Message Read Receipts**
  - Expandable "Seen by X people" section on each message
  - Lists all users who have read that specific message
  - Green badges with user names
  - Collapses by default to save space

- **Mark All Read Button**
  - One-click button to mark all unread messages as read
  - Appears only when unread messages exist
  - Shows success toast with count of messages marked
  - Real-time update of read status

### Changed

- **index.html** - Added PWA meta tags, manifest link, iOS support tags, favicon links
- **CortexApp.jsx** - Added service worker registration, InstallPrompt, OfflineIndicator components
- **Version** - Updated to 1.6.0 across all files

### Technical Details

#### Bundle Size
- **Gzipped**: 65.03 KB (slight increase from 63.57 KB due to PWA components)
- **Uncompressed**: 226.20 KB
- **Build Time**: ~646ms

#### PWA Compliance
- Passes Lighthouse PWA audit requirements
- Installable on Android Chrome, iOS Safari, Desktop Chrome/Edge
- Offline shell accessible when network unavailable
- Service worker registered and controlling page

#### Files Added
```
client/public/
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── icons/
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-180x180.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    ├── icon-512x512.png
    ├── icon-maskable-192x192.png
    ├── icon-maskable-512x512.png
    └── generate-icons.cjs
```

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Service Worker** - Will register automatically on first visit
- **Icons** - Generated using canvas library, can be regenerated with `node generate-icons.cjs`

### Known Limitations
- **iOS Push Notifications** - Not supported (iOS PWA limitation)
- **iOS Background Sync** - Not supported (iOS PWA limitation)
- **HTTPS Required** - Service workers require HTTPS in production

---

## [1.5.0] - 2025-12-04

### Added

#### Typing Indicators
- **Real-time Typing Detection** - Shows "User is typing..." when users compose messages
- **Throttled WebSocket Events** - Sends typing events max once every 2 seconds to reduce bandwidth
- **Auto-Clear** - Typing indicators disappear after 5 seconds of inactivity
- **Multi-User Support** - Displays multiple typing users: "Alice, Bob are typing..."
- **Wave-Specific** - Only shows typing users in the currently viewed wave
- **Backend WebSocket Handler** - `user_typing` event broadcasts to other wave participants
- **Frontend State Management** - `typingUsers` state with automatic timeout cleanup

#### Message Reactions
- **Emoji Reactions** - Users can react to messages with emojis (👍 ❤️ 😂 🎉 🤔 👏)
- **Quick Reaction Picker** - Click emoji button to show picker overlay
- **Toggle Reactions** - Click same emoji again to remove your reaction
- **Reaction Counts** - Shows count and list of users who reacted
- **Real-time Updates** - WebSocket broadcasts `message_reacted` events
- **Backend API** - `POST /api/messages/:id/react` endpoint toggles reactions
- **Database Schema** - `reactions: { emoji: [userId, ...] }` structure
- **Persistent** - Reactions saved to messages.json file

#### Message Search
- **Full-Text Search** - Search across all accessible waves by message content
- **Security** - Only searches waves user has access to
- **Search Modal** - Overlay UI with search input and results list
- **Result Highlighting** - Search terms highlighted in yellow in results
- **Jump to Message** - Click result to navigate to wave and message
- **Result Metadata** - Shows wave name, author, date for each result
- **Backend Search Method** - `searchMessages(query, filters)` with case-insensitive matching
- **API Endpoint** - `GET /api/search?q=query` returns filtered results

#### Desktop Notifications
- **Browser Notifications** - Native desktop notifications for new messages
- **Permission Request** - Automatic permission request 2 seconds after login
- **Background Detection** - Shows notifications when tab is backgrounded
- **Different Wave Detection** - Shows notifications for messages in other waves
- **Click to Focus** - Clicking notification focuses browser tab and opens wave
- **Notification Grouping** - Groups notifications by wave using tag
- **Auto-Dismiss** - Notifications auto-close after browser default timeout
- **Smart Filtering** - No notifications for your own messages
- **No Backend Changes** - Pure frontend using browser Notification API

### Fixed

#### WebSocket Stability
- **Ref-Based Callback** - Uses `onMessageRef.current` to prevent reconnection on state changes
- **Auto-Reconnect** - Reconnects after 3 seconds if connection drops
- **Heartbeat Ping** - Sends ping every 30 seconds to keep connection alive
- **Intentional Close Tracking** - Prevents reconnect attempts when deliberately closed
- **Better Logging** - Enhanced console logging for connection state debugging

#### Scroll Position Issues
- **Race Condition Fix** - Only saves scroll position if not already pending restoration
- **requestAnimationFrame** - Uses RAF instead of setTimeout(0) for smoother restoration
- **User Actions Preserved** - Posting messages or adding reactions no longer jumps scroll
- **WebSocket Reload Guard** - Prevents scroll position overwrite during rapid reloads
- **Smart Scrolling** - Root messages scroll to bottom, replies preserve position

#### Thread Nesting on Mobile
- **Single-Source Indentation** - Removed double-counting of margins
- **Linear Indentation** - Each level adds exactly 12px (mobile) or 24px (desktop)
- **Removed Message Margin** - Eliminated `marginLeft` from message container
- **Consistent Children Margin** - Uses only children container for indentation
- **Better Deep Thread Support** - 10 levels = 120px (32% of 375px screen, vs 156px before)

#### Real-Time Message Updates
- **waveId Extraction** - Fixed extraction from nested WebSocket event data
- **Multiple Fallbacks** - Tries `data.waveId`, `data.data.wave_id`, `data.data.waveId`
- **Reload Trigger** - Properly triggers wave reload when current wave receives events
- **Viewer Updates** - Watchers now see new messages immediately in real-time

### Changed

#### Backend Updates (server/server.js)
- **WebSocket Handler Enhancement** - Added `user_typing` event handler (Lines 1679-1713)
- **Search Method** - Added `searchMessages(query, filters)` to Database class (Lines 984-1034)
- **Search Endpoint** - Added `GET /api/search` with permission filtering (Lines 1647-1675)
- **React Endpoint** - Message reaction endpoint already existed, no changes needed
- **Version Banner** - Updated to v1.5.0

#### Frontend Updates (CortexApp.jsx)
- **useWebSocket Rewrite** - Complete rewrite with ref-based callbacks (Lines 138-225)
- **SearchModal Component** - New component for search UI (Lines 917-1055)
- **Typing Indicator Display** - Shows below messages, above compose box (Lines 1486-1498)
- **Typing Detection** - handleTyping() function with throttling (Lines 1367-1378)
- **Desktop Notification Handler** - In handleWSMessage WebSocket handler (Lines 2631-2658)
- **Permission Request** - useEffect triggers 2s after mount (Lines 2717-2732)
- **Thread Indentation Fix** - Removed dual marginLeft (Line 530, 750)
- **Version Display** - Updated to v1.5.0

### Technical Details

#### Bundle Size
- **Gzipped**: 63.57 KB (increased from 61.60 KB in v1.4.0)
- **Uncompressed**: 220.30 KB
- **Build Time**: ~575-607ms (excellent)

#### Performance
- **No Breaking Changes** - All v1.4.x features remain fully functional
- **WebSocket Optimized** - Reduced reconnection frequency, added heartbeat
- **Throttled Events** - Typing events throttled to reduce bandwidth
- **Debounced Search** - 300ms debounce on search input
- **Result Limits** - Search capped at 100 results

#### Code Quality
- **Syntax Validated** - Both client and server pass all checks
- **Build Successful** - Vite builds without errors or warnings
- **Clean Implementation** - Follows existing patterns and style
- **Enhanced Logging** - Better debugging for WebSocket and scroll issues

### Developer Notes

#### Feature Implementation Order
1. Typing Indicators (3-4 hours)
2. Message Reactions (4-6 hours, already existed)
3. Message Search (8-12 hours)
4. Desktop Notifications (4-6 hours)
5. Bug Fixes (2-3 hours)

#### Git Commits
- Typing indicators implementation
- Real-time message updates fix
- Message search backend and frontend
- Desktop notifications Phase 1
- WebSocket stability fixes
- Scroll position race condition fix
- Thread nesting indentation fix
- Version updates

#### Testing Performed
- Multi-browser testing (Chrome, Firefox, Edge)
- Multi-user real-time testing
- Mobile responsive testing (< 768px)
- Deep thread nesting (10+ levels)
- WebSocket stability over extended sessions
- Desktop notification permissions and display
- Search with various queries and filters

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Automatic Reaction Init** - Old messages get empty reactions object on first access
- **No Schema Changes** - Reactions field already existed in message schema
- **No Data Loss** - All existing data works immediately

---

## [1.4.0] - 2025-12-04

### Added

#### Per-Message Read Tracking
- **readBy Array** - Each message now has a `readBy: [userId, ...]` array tracking which users have read it
- **Click-to-Read UI** - Messages must be explicitly clicked to mark as read
- **Visual Indicators** - Unread messages display with:
  - Amber left border (`#ffd23f`, 3px solid)
  - Subtle amber background (`#ffd23f10`)
  - Amber outer border (`1px solid #ffd23f`)
  - Pointer cursor for clickability
- **Hover Effects** - Unread messages brighten to `#ffd23f20` on hover
- **New API Endpoint** - `POST /api/messages/:id/read` for marking individual messages
- **Database Method** - `markMessageAsRead(messageId, userId)` adds user to readBy array
- **is_unread Flag** - `getMessagesForWave()` returns `is_unread` boolean per message
- **Auto-Initialize** - Message author automatically added to `readBy` on creation

#### Scroll Position Preservation
- **scrollPositionToRestore Ref** - New ref tracks scroll position during reloads
- **Restoration useEffect** - Automatically restores scroll after wave data updates
- **handleMessageClick** - Saves scroll position before marking message as read
- **Smart Reply Scrolling** - Conditional scrolling behavior:
  - Replies: Preserve current scroll position
  - Root messages: Scroll to bottom (shows new message)
- **Long Wave Support** - Prevents disruptive jumping in waves with 100+ messages

### Changed

#### Backend Updates
- **Unread Count Calculation** - Changed from timestamp-based (`lastRead`) to array-based filtering
  - Old: `m.created_at > participant.lastRead`
  - New: `!m.readBy.includes(userId)`
- **Message Schema** - Added `readBy: [authorId]` to new messages
- **getMessagesForWave()** - Now accepts `userId` parameter and returns `is_unread` flag
- **Backward Compatibility** - Old messages get `readBy` arrays initialized automatically:
  ```javascript
  if (!message.readBy) {
    message.readBy = [message.authorId];
  }
  ```

#### Frontend Updates
- **ThreadedMessage Component** - Enhanced with click-to-read functionality:
  - Added `onMessageClick` prop
  - Added `isUnread` state detection
  - Added click handler for unread messages
  - Added hover effects with inline event handlers
  - Passed `onMessageClick` to child messages recursively
- **WaveView Component** - Added scroll preservation logic:
  - New `scrollPositionToRestore` ref
  - New restoration useEffect hook
  - Updated `handleMessageClick()` with scroll save/restore
  - Updated `handleSendMessage()` with conditional scrolling
- **Visual Transitions** - All scroll restorations use `transition: 'all 0.2s ease'`

### Technical Details

#### Bundle Size
- **Gzip Size**: 61.60 KB (increased from 61.10 KB due to new features)
- **Total Build**: 213.43 KB uncompressed
- **Build Time**: ~587ms (excellent)

#### Performance
- **No Breaking Changes** - All v1.3.x features remain fully functional
- **Backward Compatible** - Old messages automatically get `readBy` arrays
- **Optimized Reloads** - Scroll position preserved prevents unnecessary reorientation
- **Smooth Transitions** - 0-delay setTimeout ensures DOM updates before scroll restoration

#### Code Quality
- **Syntax Validated** - Both client and server pass validation
- **Build Successful** - Vite build completes without errors or warnings
- **Clean Implementation** - Follows existing code patterns and style
- **Logging Enhanced** - Console logging for read tracking debugging

### Developer Notes

#### Frontend Changes (CortexApp.jsx)
- Line 441: Updated `ThreadedMessage` signature with `onMessageClick` prop
- Line 453: Added `isUnread` state detection
- Line 459-463: Added `handleMessageClick` function in component
- Line 467-488: Enhanced message container div with click handling and styling
- Line 692: Passed `onMessageClick` to recursive child messages
- Line 935: Added `scrollPositionToRestore` ref
- Line 942-952: Added scroll restoration useEffect
- Line 1068-1099: Updated `handleSendMessage()` with conditional scrolling
- Line 1179-1197: Added `handleMessageClick()` handler in WaveView
- Line 1283: Passed `onMessageClick` to ThreadedMessage

#### Backend Changes (server.js)
- Line 859: Added `readBy: [data.authorId]` to message creation
- Line 654-661: Updated unread count calculation to use `readBy` filtering
- Line 822-844: Updated `getMessagesForWave()` to accept `userId` and return `is_unread`
- Line 963-979: Added `markMessageAsRead()` database method
- Line 1580-1593: Added `POST /api/messages/:id/read` endpoint

#### Migration Notes
- No migration script needed - backward compatible
- Old messages auto-initialize `readBy` arrays on first access
- Existing `lastRead` timestamps remain in database but unused for unread counts

## [1.3.3] - 2025-12-04

### Added

#### Message Editing & Deletion UI
- **Edit Message Button** - ✏️ EDIT button appears on user's own messages
- **Inline Edit Form** - Textarea replaces message content when editing
- **Edit State Management** - `editingMessageId` and `editContent` state in WaveView
- **Keyboard Shortcuts** - Ctrl+Enter to save, Escape to cancel editing
- **Edit Handlers** - `handleStartEdit()`, `handleSaveEdit()`, `handleCancelEdit()` functions
- **Content Stripping** - HTML tags stripped for plain-text editing
- **Save/Cancel Buttons** - Styled action buttons with keyboard hint text
- **API Integration** - Uses existing `PUT /api/messages/:id` endpoint
- **Delete Message UI** - Delete button already existed, now complemented by edit functionality
- **Real-Time Updates** - WebSocket `message_edited` and `message_deleted` events handled
- **Auto-reload** - Wave data refreshes after edit/delete operations

#### Improved Wave UX
- **Wave Hover States** - Wave list items highlight on mouse hover
  - `onMouseEnter` handler sets background to `#1a2a1a`
  - `onMouseLeave` handler resets to transparent
  - 200ms CSS transition for smooth effect
- **GIF Eager Loading** - GIFs now load immediately instead of lazily
  - Server-side image tag transformation checks for `.gif` extension
  - Also checks for Giphy/Tenor hostnames
  - Sets `loading="eager"` for GIFs, `loading="lazy"` for other images
- **Better Click Feedback** - Enhanced visual feedback for clickable waves

#### Collapsible Playback Controls
- **Playback Toggle State** - New `showPlayback` boolean state (default: false)
- **Toggle Button** - "▶ SHOW" / "▼ HIDE" button in playback header
- **Playback Header Bar** - New wrapper div with "PLAYBACK MODE" label
- **Conditional Rendering** - PlaybackControls only rendered when `showPlayback` is true
- **Space Optimization** - Playback bar hidden by default to save vertical space
- **Session Persistence** - Toggle state persists during current session

#### Auto-Focus on Reply
- **Reply Focus useEffect** - New effect hook triggers on `replyingTo` state change
- **Automatic Focus** - Textarea automatically focused when reply is clicked
- **Cursor Positioning** - Cursor placed at end of existing text with `setSelectionRange()`
- **Smooth Timing** - 150ms setTimeout ensures UI transition completes before focus
- **Mobile Compatibility** - Works with existing mobile scroll-to-compose behavior

### Changed

#### Client-Side Updates
- **ThreadedMessage Component** - Extended with edit/cancel/save props and handlers
- **Message Content Rendering** - Now conditionally shows edit form or static content
- **Button Layout** - Edit and Delete buttons now grouped together for user's messages
- **WaveView State** - Added `editingMessageId` and `editContent` state variables
- **Message Prop Passing** - Edit-related props passed through recursive ThreadedMessage calls
- **Wave List Styling** - Added `transition: 'background 0.2s ease'` to wave items

#### Server-Side Updates
- **Image Transform Function** - Enhanced to detect GIFs and set eager loading
- **GIF Detection Logic** - Checks both file extension and hostname patterns
- **Sanitization Options** - Image loading attribute now dynamic based on content type

### Technical Details

#### Bundle Size
- **Gzip Size**: 61.10 KB (slight increase from 60.43 KB in v1.3.2 due to new features)
- **Total Build**: 211.74 KB uncompressed
- **Build Time**: ~580ms (excellent)

#### Performance
- **No Breaking Changes** - All v1.3.2 features remain fully functional
- **Backward Compatible** - Existing messages work without modification
- **WebSocket Efficiency** - Reuses existing event handling infrastructure

#### Code Quality
- **Syntax Validated** - Both client and server pass `--check` validation
- **Build Successful** - Vite build completes without errors or warnings
- **Clean Implementation** - Follows existing code patterns and style

### Developer Notes

#### Frontend Changes
- **CortexApp.jsx** Lines modified:
  - 829: Added `showPlayback`, `editingMessageId`, `editContent` state
  - 865-877: Added auto-focus useEffect for reply
  - 979-1009: Added edit handler functions
  - 441: Updated ThreadedMessage signature with edit props
  - 478-539: Added conditional edit form rendering
  - 555-570: Added EDIT button and restructured action buttons
  - 604-608, 1132-1137: Passed edit props to ThreadedMessage calls
  - 1048-1081: Added collapsible playback wrapper
  - 392-409: Added wave hover handlers and transition

#### Backend Changes
- **server.js** Lines modified:
  - 126-141: Enhanced img tag transform with GIF detection
  - Existing endpoints already supported editing (no backend changes needed)

## [1.3.2] - 2025-12-04

### Added

#### Rich Content & Media Support
- **Emoji Picker Component** - 16 common emojis in a popup picker with mobile-optimized 4-column grid layout
- **Media URL Input Panel** - Dedicated UI for inserting image and GIF URLs into messages
- **Auto-Detection of Media URLs** - Automatically embeds image URLs (jpg, jpeg, png, gif, webp) in messages
- **Multi-line Message Input** - Replaced single-line input with textarea supporting Shift+Enter for new lines
- **HTML Content Rendering** - Messages now render rich HTML content with embedded media
- **Server-side Media Processing** - `detectAndEmbedMedia()` function automatically converts URLs to `<img>` tags
- **Content Sanitization** - Strict HTML sanitization with `sanitize-html` library
  - Allowed tags: img, a, br, p, strong, em, code, pre
  - Security transforms for links (target="_blank", rel="noopener noreferrer")
  - Lazy loading for images
  - No data URIs allowed (HTTPS/HTTP only)

#### Wave Deletion
- **DELETE Wave API Endpoint** - `DELETE /api/waves/:id` for wave creators
- **Cascade Deletion** - Automatically removes wave, participants, messages, and message history
- **Authorization Check** - Only wave creators can delete their waves
- **Delete Confirmation Modal** - Client-side confirmation before deletion
- **WebSocket Notification** - `wave_deleted` event broadcast to all participants
- **Auto-redirect** - Users viewing deleted waves are automatically redirected to wave list

#### User Preferences & Customization
- **Theme Selection** - Three themes available:
  - Firefly (default) - Classic dark green terminal aesthetic
  - High Contrast - Maximum contrast for accessibility
  - Light Mode - Light background alternative
- **Font Size Control** - Four font sizes:
  - Small (0.9x scale)
  - Medium (1x scale, default)
  - Large (1.15x scale)
  - X-Large (1.3x scale)
- **Preferences API Endpoint** - `PUT /api/profile/preferences` to save user settings
- **Preferences Persistence** - Settings stored in user account and synced across devices
- **Theme Definitions** - THEMES and FONT_SIZES constants in client code
- **Preferences UI** - New section in ProfileSettings for theme and font size selection

#### Admin Panel
- **HandleRequestsList Component** - Dedicated UI for reviewing handle change requests
- **Admin Panel in ProfileSettings** - Visible only to administrators
- **Approve/Reject Actions** - Buttons for each pending request
- **Optional Rejection Reason** - Admins can provide feedback when rejecting
- **Real-time Updates** - WebSocket notifications for request reviews
- **Mobile-responsive Design** - Touch-friendly buttons with 44px minimum height

#### Mobile UX Improvements
- **Multiple Responsive Breakpoints**:
  - isMobile: < 600px (phone screens)
  - isTablet: 600-1024px (tablet screens)
  - isDesktop: ≥ 1024px (desktop screens)
- **Touch-friendly Interface** - 44px minimum touch targets throughout the app
- **Mobile-optimized Components**:
  - EmojiPicker with 4-column grid on mobile (vs 6-column on desktop)
  - Larger buttons and padding on mobile devices
  - Responsive font sizes and spacing
- **Browser Compatibility Enhancements**:
  - Font smoothing: `-webkit-font-smoothing: antialiased`
  - macOS font rendering: `-moz-osx-font-smoothing: grayscale`
  - Text rendering: `text-rendering: optimizeLegibility`
  - Safe area insets: `viewport-fit=cover` for notched devices
  - Custom scrollbar styling for consistent appearance
  - Maximum scale restrictions to prevent zoom issues

### Changed

#### Database Schema
- **User Model** - Added `preferences` field with default values:
  ```javascript
  preferences: {
    theme: 'firefly',
    fontSize: 'medium',
    colorMode: 'default'
  }
  ```

#### Message Input
- Changed from `<input>` to `<textarea>` for multi-line support
- Enter key sends message (default behavior)
- Shift+Enter creates new line
- Auto-resize functionality (up to 200px max height)
- Placeholder text includes instructions: "Type a message... (Shift+Enter for new line)"

#### Message Display
- Messages now render with `dangerouslySetInnerHTML` to support HTML content
- Added `whiteSpace: 'pre-wrap'` to preserve line breaks
- CSS styling for embedded media (max-width, max-height, borders)

#### Server-side Processing
- Enhanced `sanitizeMessage()` with strict HTML whitelist
- Added `detectAndEmbedMedia()` for URL-to-image conversion
- Updated `createMessage()` to process media URLs before storage

#### WebSocket Events
- Added `wave_deleted` event type to broadcast wave deletions

#### Responsive Design
- Updated breakpoint logic from single `isMobile` (<768px) to three-tier system
- Adjusted layouts for tablet-sized screens
- Improved spacing and typography across all screen sizes

### Fixed

- **Chrome Mobile Input Position** - Fixed message input field positioning on mobile Chrome
- **Font Rendering Consistency** - Improved font contrast and readability across browsers
- **Mobile Keyboard Handling** - Better viewport behavior when keyboard is open
- **Scrollbar Appearance** - Consistent custom scrollbar styling across browsers

### Security

- **HTML Sanitization** - Strict whitelist prevents XSS attacks in rich content
- **Media URL Validation** - Only HTTPS/HTTP protocols allowed, no data URIs
- **Authorization Checks** - Wave deletion restricted to creators only
- **Input Validation** - All preference values validated on server
- **Content Security** - All user-generated HTML sanitized before storage and display

### Technical Improvements

- **Code Organization** - Clear component structure for new features
- **Error Handling** - Comprehensive error handling for new API endpoints
- **State Management** - Proper state updates for preferences and media
- **Performance** - Lazy loading for images to improve page load times
- **Accessibility** - Minimum 44px touch targets for better mobile UX

### Documentation

- **CLAUDE.md Updated** - Comprehensive documentation of all v1.3.2 features
  - New "Wave Deletion" section
  - New "Media Embedding & Rich Content" section
  - New "User Preferences & Customization" section
  - New "Admin Panel" section
  - Updated "Responsive Design" section with new breakpoints
  - Updated "Security Practices" with media embedding security
  - Updated "Data Model" with preferences field
  - Added v1.3.2 to version history
  - Updated "Common Development Tasks" sections

- **README.md Updated** - User-facing documentation
  - Updated version number to v1.3.2
  - Added "What's New in v1.3.2" section with all features
  - Updated API endpoints table with new endpoints
  - Updated User Identity Model with preferences
  - Updated Security Features section
  - Updated WebSocket Events with wave_deleted
  - Updated Roadmap with completed items

### Known Limitations

- Theme system infrastructure in place but full CSS variable refactoring deferred to v1.3.3
- Light and High Contrast themes partially implemented (color definitions exist but not all components refactored)
- Media embedding only supports URLs (no file uploads yet, planned for v1.5)
- No image proxy for external URLs (images loaded directly from source)
- No GIF search integration (users must paste URLs)

### Breaking Changes

**None** - All changes are backwards compatible. Existing clients will continue to work with v1.3.2 server.

### Migration Notes

- **Database Migration** - Not required. Default preferences automatically added to users on first login.
- **Server Updates** - No breaking changes to existing API endpoints
- **Client Updates** - Recommended to update client for new features, but old clients remain functional

### Contributors

- Core Development Team
- Community Feedback & Testing

### Performance Metrics

- **Bundle Size**: 60.43 KB gzipped (12% of 500KB target, excellent)
- **Memory Usage**: ~235MB (healthy for production)
- **No Performance Regressions**: Smooth 60fps UI maintained across all features

---

## [1.3.1] - 2025-11-XX

### Fixed
- Minor bug fixes and improvements

---

## [1.3.0] - 2025-11-XX

### Added

#### UUID-Based Identity System
- Immutable user UUIDs for all references
- Changeable handles with admin approval system
- Handle history tracking with audit trail
- Old handle reservation for 90 days
- @mentions stored as UUIDs, rendered as current handles

#### User Account Management
- Profile settings for display name and avatar changes
- Password management with validation
- Handle change request system
- 30-day cooldown between handle changes

#### Wave Features
- Renamed "Threads" to "Waves" throughout platform
- Personal wave archiving (per-user, doesn't affect others)
- Archive/unarchive functionality
- Separate archived waves view

#### Admin Features
- Handle request review endpoints
- Approve/reject handle changes
- Admin authorization checks

### Changed
- Renamed all "thread" references to "wave"
- Renamed "username" to "handle"
- Updated data model to use UUIDs

### Migration
- `migrate-v1.2-to-v1.3.js` script provided
- Converts username → handle
- Converts threads → waves
- Adds UUID system

---

## [1.2.0] - Earlier

### Features
- Thread-based messaging
- Real-time WebSocket communication
- JWT authentication
- Privacy levels (private, group, cross-server, public)
- Message threading with replies
- Edit history tracking
- Playback mode
- Groups and contacts

---

For more details on upcoming features, see the [Roadmap](README.md#roadmap).
