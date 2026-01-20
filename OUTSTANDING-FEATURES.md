# Cortex - Outstanding Features & Future Roadmap

**Last Updated:** January 7, 2026
**Current Version:** v2.2.2

This document tracks planned but not-yet-implemented features for future releases.

---

## Completed Features (v1.5.0 - v1.18.0)

The following features have been implemented and are no longer outstanding:

| Feature | Version | Notes |
|---------|---------|-------|
| Message Reactions | v1.5.0 | Emoji picker, toggle reactions |
| Message Search | v1.5.0 | Full-text search with FTS5 (v1.8.0) |
| Typing Indicators | v1.5.0 | Real-time via WebSocket |
| Desktop Notifications | v1.5.0 | Browser Notification API |
| PWA Support | v1.6.0 | Service worker, offline mode, install prompt |
| Read Receipts | v1.6.0 | Per-message tracking with UI |
| Contact Requests | v1.7.0 | Send/accept/decline workflow |
| Group Invitations | v1.7.0 | Invite/accept/decline workflow |
| User Blocking/Muting | v1.7.0 | Hide messages, prevent interactions |
| GIF Search | v1.7.0 | GIPHY integration |
| Profile Images | v1.8.0 | Avatar upload with processing |
| About Me / Bio | v1.8.0 | User bio field |
| User Profile Modal | v1.8.0 | View other users' profiles |
| Message Image Upload | v1.8.0 | Direct file upload, drag-and-drop |
| Rich Media Embeds | v1.8.0 | YouTube, Spotify, Vimeo, Twitter, SoundCloud |
| SQLite Database | v1.8.0 | Optional SQLite backend with FTS |
| PWA Push Notifications | v1.8.0 | Server-sent push for offline users |
| Message Pagination | v1.8.0 | Load older messages on demand |
| Threading Improvements | v1.9.0 | Collapse/expand, visual connectors, jump-to-parent |
| Mobile Gestures | v1.9.0 | Swipe navigation, pull-to-refresh, bottom nav |
| Report System | v1.9.0 | Content moderation with admin dashboard |
| API Documentation | v1.9.0 | Comprehensive docs/API.md with 70+ endpoints |
| Moderation Actions | v1.9.0 | Warning system, audit log |
| Pings Architecture | v1.10.0 | Messages → Pings terminology rename |
| Focus View | v1.10.0 | View any ping as its own wave-like context |
| Burst System | v1.10.0 | Spin off threads into new waves |
| Threading Depth Limit | v1.10.0 | 3-level inline limit, unlimited in Focus View |
| Notification System | v1.11.0 | In-app notifications with smart routing |
| Wave List Badges | v1.11.0 | Color-coded notification indicators |
| Notification Preferences | v1.11.0 | Per-type control in settings |
| CSS Variable Themes | v1.12.0 | 5 themes with CSS custom properties |
| VAPID Key Detection | v1.12.0 | Auto re-subscribe on key change |
| SQLite GIF Fix | v1.12.1 | Media embedding in SQLite mode |
| **Federation** | v1.13.0 | Server-to-server communication |
| **HTTP Signatures** | v1.13.0 | RSA-SHA256 server authentication |
| **Federated Users** | v1.13.0 | @handle@server.com format |
| **Message Queue** | v1.13.0 | Exponential backoff retries |
| **Federation Admin** | v1.13.0 | Node management panel |
| **Email Service** | v1.14.0 | SMTP, SendGrid, Mailgun support |
| **Password Reset** | v1.14.0 | Token-based recovery flow |
| **Admin Password Reset** | v1.14.0 | Admin can reset user passwords |
| **Persistent Lockouts** | v1.14.0 | Database-backed rate limiting |
| **TOTP MFA** | v1.14.0 | Authenticator app support (Google Authenticator, Authy) |
| **Email MFA** | v1.14.0 | Email-based verification codes |
| **Recovery Codes** | v1.14.0 | 10 one-time backup codes |
| **MFA Login Flow** | v1.14.0 | Challenge-response during login |
| **Activity Log** | v1.14.0 | Security and content event tracking with admin UI |
| **Encryption at Rest** | v1.14.0 | SQLCipher database encryption support |
| **Alert Pings** | v1.15.0 | Scheduled alerts with start/end times |
| **Web Crawl Feature** | v1.15.0 | Public info endpoint for web crawlers |
| **Alert Banner** | v1.16.0 | Alert display in wave UI |
| **Ping Sharing** | v1.17.0 | Share public pings via Web Share API |
| **Social Previews** | v1.17.0 | Open Graph and Twitter Card meta tags |
| **Public Ping View** | v1.17.0 | Unauthenticated viewing of shared pings |
| **Compact UI** | v1.17.1 | Cleaner message layout, inline actions |
| **Reduced Nesting** | v1.17.1 | Better deep thread readability |
| **@ Mention Autocomplete** | v1.17.2 | Type @ to mention users with dropdown picker |
| **Styled Mentions** | v1.17.2 | Teal colored, clickable to open profile |
| **Alert Time Fix** | v1.17.2 | Proper timezone handling for alert expiration |
| **Deleted Ping Fix** | v1.17.2 | Fully deleted threads now disappear |
| **Collapsible Sections** | v1.17.3 | Profile Settings and Admin Panel sections collapse |
| **Password Confirmation** | v1.17.3 | Password change requires current + matching confirmation |
| **Lazy Loading Admin** | v1.17.3 | Admin panels load data only when expanded |
| **Wave Rename Fix** | v1.17.3 | Wave title changes now persist in SQLite mode |
| **PWA App Badge** | v1.17.4 | Unread count on installed app icon (Windows, macOS, iOS) |
| **Tab Title Unread** | v1.17.4 | Document title shows unread count: "(3) Cortex" |
| **Favicon Flashing** | v1.17.4 | Favicon flashes with notification dot when tab inactive |
| **Activity Log Filter Fix** | v1.17.5 | Filter dropdown now properly fetches filtered results |
| **Server Version Fix** | v1.17.6 | Health/info endpoints now use VERSION constant from package.json |
| **WebSocket Rate Limiting** | v1.17.7 | Per-user rate limits on WebSocket messages (60/min) and typing indicators (20/min) |
| **Session Management** | v1.18.0 | View and revoke login sessions from any device |
| **Token Revocation** | v1.18.0 | Invalidate JWT tokens server-side via session tracking |
| **User Data Export** | v1.18.0 | GDPR-compliant personal data download (JSON) |
| **Account Deletion** | v1.18.0 | GDPR-compliant account deletion with password confirmation |
| **HSTS Headers** | v1.18.0 | HTTP Strict Transport Security with 1-year max-age |
| **HTTPS Enforcement** | v1.18.0 | Optional redirect HTTP to HTTPS in production |
| **Restrictive CORS** | v1.18.0 | Strict CORS by default, requires ALLOWED_ORIGINS in production |
| **Cortex Rebrand** | v2.0.0 | Complete nomenclature overhaul: Cortex→Cortex, Droplet→Ping, Ripple→Burst, Group→Crew |
| **API Aliases** | v2.0.0 | /api/pings/* and /api/crews/* endpoints with backward compatibility |
| **End-to-End Encryption** | v2.1.0 | ECDH P-384 + AES-256-GCM for wave and ping encryption |
| **Encryption Keys UI** | v2.1.0 | Key management interface with generation and rotation |
| **Encrypted Waves** | v2.1.0 | Per-wave encryption with key distribution |
| **Encrypted Pings** | v2.1.0 | Client-side encryption/decryption with nonce and keyVersion |
| **Encrypted Burst Waves** | v2.1.2 | Burst waves inherit parent encryption keys |
| **Bot System** | v2.1.0 | Create bots with API keys for automated posting |
| **Bot Permissions** | v2.1.0 | Per-wave access control for bots |
| **Bot Rate Limiting** | v2.1.0 | Separate rate limits for bot API calls |
| **Wave Categories** | v2.2.0 | User-defined categories to organize waves |
| **Pinned Waves** | v2.2.0 | Pin important waves to top of wave list |
| **Collapsible Groups** | v2.2.0 | Collapse/expand categories with persistent state |
| **Group-Level Notifications** | v2.2.0 | Unread count badges at category level |
| **Drag-and-Drop Organization** | v2.2.0 | Move waves between categories (desktop) |
| **Mobile Wave Organization** | v2.2.1 | 3-dot menu for mobile/PWA wave management |
| **Read/Unread Sync Fix** | v2.2.2 | Fixed critical synchronization issues |

---

## In Progress

No features currently in active development.

---

## Medium Priority Features

### 1. Export Wave as PDF/HTML
**Complexity:** Medium

Export entire waves for archival or sharing.

**Requirements:**
- Export wave with all pings
- Include attachments/media
- Formatted HTML or PDF output
- Preserve threading structure
- Include participant metadata

**Backend:**
- `GET /api/waves/:id/export?format=pdf|html`
- PDF generation library (puppeteer, wkhtmltopdf)

---

### 2. Advanced Search Filters
**Complexity:** Medium

Enhanced search with advanced filters and boolean operators.

**Requirements:**
- Boolean operators: AND, OR, NOT
- Exact phrase matching with quotes
- Filter by: author, date range, wave privacy level, has:media, has:reactions
- Sort by: relevance, date, author
- Save search queries

---

### 3. End-to-End Encryption for Federation
**Complexity:** High
**Status:** Partially Complete (v2.1.0 - local E2E encryption implemented)

Extend E2E encryption to federated messages between servers.

**Requirements:**
- Key exchange between federated users across different servers
- Secure key distribution via federation protocol
- Maintain encryption across server boundaries
- Handle key rotation for multi-server participants

**Current Status:**
- ✅ Local E2E encryption working (v2.1.0)
- ❌ Federated E2E encryption not yet implemented
- Note: Federated waves currently send encrypted content but keys are not exchanged between servers

---

## Future Considerations (v2.0.0+)

These features require significant architectural changes:

### Advanced API & Integrations
- Webhooks: Outbound HTTP callbacks for events
- Bot Framework: Create automated bots
- OAuth Provider: Third-party app authentication
- GraphQL API: Alternative to REST

### Voice & Video
- Voice messages
- Video messages
- Real-time voice/video calls
- Screen sharing

### Advanced Moderation
- AI Content Filtering: Automatic spam/harassment detection
- Moderator Roles: Granular permissions
- Auto-moderation Rules: Regex filters, word blacklists
- Appeal System: Users can appeal moderation decisions

### Federation Enhancements
- Server Discovery: Automatic discovery of federation partners
- Public Directory: Opt-in public server listing
- Federation Statistics: Cross-server analytics
- Relay Servers: Message delivery through intermediaries

---

## Priority Matrix

| Feature | Priority | Complexity | User Impact | Status |
|---------|----------|------------|-------------|--------|
| Export Wave | Low | Medium | Low | Backlog |
| Advanced Search | Low | Medium | Medium | Backlog |
| E2E Encryption | Medium | High | High | Backlog |
| Webhooks | Low | Medium | Medium | Backlog |
| Voice Messages | Low | High | Medium | Backlog |

---

*This document will be updated as features are implemented and new requests come in.*
