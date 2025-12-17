# Cortex - Outstanding Features & Future Roadmap

**Last Updated:** December 17, 2025
**Current Version:** v1.14.0

This document tracks planned but not-yet-implemented features for future releases.

---

## Completed Features (v1.5.0 - v1.14.0)

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
| Droplets Architecture | v1.10.0 | Messages → Droplets terminology rename |
| Focus View | v1.10.0 | View any droplet as its own wave-like context |
| Ripple System | v1.10.0 | Spin off threads into new waves |
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

---

## In Progress

No features currently in active development.

---

## Medium Priority Features

### 1. Export Wave as PDF/HTML
**Complexity:** Medium

Export entire waves for archival or sharing.

**Requirements:**
- Export wave with all droplets
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

Encrypt federated messages so only participants can read them.

**Requirements:**
- Key exchange between federated users
- Client-side encryption/decryption
- Key rotation and recovery
- Backward compatibility with non-E2E waves

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
