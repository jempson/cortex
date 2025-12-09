# Cortex - Outstanding Features & Future Roadmap

**Last Updated:** December 9, 2025
**Current Version:** v1.8.1

This document tracks planned but not-yet-implemented features for future releases.

---

## Completed Features (v1.5.0 - v1.8.1)

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

---

## Medium Priority Features

### 1. Message Threading Improvements
**Complexity:** Medium

Enhance message threading with better visualization and navigation.

**Requirements:**
- Collapse/expand entire threads
- Thread summary view (show root + reply count)
- "Jump to parent" button on replies
- Thread depth limit warnings
- Visual thread connectors (lines)

---

### 2. Export Wave as PDF/HTML
**Complexity:** Medium

Export entire waves for archival or sharing.

**Requirements:**
- Export wave with all messages
- Include attachments/media
- Formatted HTML or PDF output
- Preserve threading structure
- Include participant metadata

**Backend:**
- `GET /api/waves/:id/export?format=pdf|html`
- PDF generation library (puppeteer, wkhtmltopdf)

---

### 3. Advanced Search Filters
**Complexity:** Medium

Enhanced search with advanced filters and boolean operators.

**Requirements:**
- Boolean operators: AND, OR, NOT
- Exact phrase matching with quotes
- Filter by: author, date range, wave privacy level, has:media, has:reactions
- Sort by: relevance, date, author
- Save search queries

---

### 4. Mobile Gesture Enhancements
**Complexity:** Medium

Advanced mobile features for better app-like experience.

**Requirements:**
- Swipe gestures for navigation (swipe right to go back)
- Pull-to-refresh on wave list
- Bottom navigation bar for primary actions
- Haptic feedback on actions

---

## Low Priority Features

### 5. Report System
**Complexity:** Medium

User-driven content moderation via reports.

**Requirements:**
- Report messages/waves for review
- Report reasons: spam, harassment, inappropriate, other
- Admin dashboard to view reports
- Mark reports as resolved/dismissed
- Audit log of moderation actions

---

### 6. Public REST API Documentation
**Complexity:** Low-Medium

Document and formalize existing API for third-party clients.

**Requirements:**
- Document all existing endpoints
- Request/response examples
- Authentication guide (JWT)
- Error codes and messages
- Rate limiting policies
- Optional: API keys for applications

---

## Future Considerations (v2.0.0+)

These features require significant architectural changes:

### Federation & Cross-Server Communication
- Connect to other Cortex servers
- Cross-server waves and messaging
- Server discovery and trust system
- End-to-end encryption for federated messages

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

---

## Priority Matrix

| Feature | Priority | Complexity | User Impact |
|---------|----------|------------|-------------|
| Threading Improvements | Medium | Medium | Medium |
| Export Wave | Low | Medium | Low |
| Advanced Search | Low | Medium | Medium |
| Mobile Gestures | Medium | Medium | Medium |
| Report System | Low | Medium | Medium |
| API Documentation | Low | Low-Medium | Low |

---

*This document will be updated as features are implemented and new requests come in.*
