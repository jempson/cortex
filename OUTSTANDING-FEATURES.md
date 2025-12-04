# Cortex - Outstanding Features & Future Roadmap

**Last Updated:** December 4, 2025
**Current Version:** v1.4.0

This document consolidates all planned but not-yet-implemented features from previous planning documents and community requests.

---

## 🔥 High Priority Features

### 1. Message Reactions
**Priority:** High
**Complexity:** Low-Medium
**Estimated Time:** 4-6 hours

**Description:**
Add emoji reactions to messages (similar to Slack, Discord).

**Requirements:**
- Click emoji picker to react to any message
- Show reaction counts with user list on hover
- Toggle your own reactions on/off
- Backend: Add `reactions: { emoji: [userId, ...] }` to message schema
- Real-time WebSocket updates for reactions
- Mobile-friendly reaction picker

**Backend Changes:**
- Add `reactions` field to message schema
- `POST /api/messages/:id/react` endpoint
- WebSocket event: `message_reacted`

**Frontend Changes:**
- Reaction picker UI component
- Display reactions below messages
- Handle WebSocket reaction updates

---

### 2. Message Search
**Priority:** High
**Complexity:** Medium
**Estimated Time:** 8-12 hours

**Description:**
Search through all messages across all waves.

**Requirements:**
- Full-text search across message content
- Filter by wave, author, date range
- Highlight search terms in results
- Jump to message in context when clicked
- Search history/recent searches

**Backend Changes:**
- `GET /api/search?q=query&wave=id&author=id&from=date&to=date`
- Implement simple in-memory text search (or SQLite FTS later)
- Return message results with wave context

**Frontend Changes:**
- Search bar in main header
- Search results modal/panel
- Result highlighting
- Jump-to-message functionality

---

### 3. Typing Indicators
**Priority:** Medium
**Complexity:** Low
**Estimated Time:** 3-4 hours

**Description:**
Show when other users are typing in a wave.

**Requirements:**
- Display "User is typing..." below compose box
- Timeout after 5 seconds of inactivity
- Only show in current wave
- Throttle typing events to reduce WebSocket traffic

**Backend Changes:**
- WebSocket event: `user_typing` with waveId and userId
- Throttle to max 1 event per 2 seconds per user

**Frontend Changes:**
- Detect typing in textarea
- Send throttled typing events via WebSocket
- Display typing indicators for other users

---

## 💡 Medium Priority Features

### 4. Read Receipts (Per-Wave)
**Priority:** Medium
**Complexity:** Low
**Estimated Time:** 2-3 hours

**Description:**
Show who has read all messages in a wave (wave-level, not per-message).

**Status:**
*NOTE: Per-message read tracking exists in v1.4.0. This would add a visual display of who has read the wave.*

**Requirements:**
- Show participant avatars with read/unread status
- Display in wave header or sidebar
- Real-time updates when users read messages

**Implementation:**
- Use existing `readBy` arrays from v1.4.0
- Add visual indicator in wave participants list
- Green checkmark for users who have read latest message

---

### 5. GIF Search Integration
**Priority:** Medium
**Complexity:** Medium
**Estimated Time:** 6-8 hours

**Description:**
Integrate Giphy or Tenor API for GIF search within message composer.

**Requirements:**
- GIF search modal/panel
- Grid display of GIF results
- Preview on hover
- Click to insert GIF URL into message
- API key configuration

**Backend Changes:**
- Add environment variable for Giphy/Tenor API key
- Proxy endpoint: `GET /api/gifs/search?q=query`
- Rate limiting for GIF search

**Frontend Changes:**
- GIF search button in composer
- Search modal with grid layout
- Insert GIF URL on selection

---

### 6. Message Threading Improvements
**Priority:** Medium
**Complexity:** Medium
**Estimated Time:** 6-8 hours

**Description:**
Enhance message threading with better visualization and navigation.

**Requirements:**
- Collapse/expand entire threads
- Thread summary view (show root + count)
- "Jump to parent" button on replies
- Thread depth limit warnings
- Thread highlighting on hover

**Frontend Changes:**
- Enhanced ThreadedMessage component
- Thread navigation controls
- Visual thread connectors (lines)

---

## 🚀 Advanced Features (v1.5.0+)

### 7. Mobile App Enhancements
**Priority:** Medium
**Complexity:** High
**Estimated Time:** 16-24 hours

**Description:**
Advanced mobile features for better app-like experience.

**Requirements:**
- Swipe gestures for navigation (swipe right to go back)
- Pull-to-refresh on wave list
- Bottom navigation bar for primary actions
- Progressive Web App (PWA) support with offline mode
- Push notifications (requires service worker)
- Install prompt for "Add to Home Screen"

**Implementation:**
- Add service worker for PWA
- Implement touch gesture handlers
- Create manifest.json for PWA
- Set up Web Push API for notifications

---

### 8. File Upload Support
**Priority:** Medium
**Complexity:** High
**Estimated Time:** 20-30 hours

**Description:**
Upload images and files directly (not just URLs).

**Requirements:**
- Drag-and-drop file upload
- Image preview before sending
- File type validation (images, PDFs, documents)
- File size limits (e.g., 10MB max)
- Image compression/thumbnails
- File storage (local filesystem or S3-compatible)
- Secure file access with authentication

**Backend Changes:**
- File upload endpoint: `POST /api/files/upload`
- File storage system (local or cloud)
- File metadata in database
- File cleanup for deleted messages

**Frontend Changes:**
- File upload UI component
- Drag-and-drop zone
- Upload progress indicator
- Image preview/lightbox

---

### 9. Export Wave as PDF/HTML
**Priority:** Low
**Complexity:** Medium
**Estimated Time:** 8-12 hours

**Description:**
Export entire waves for archival or sharing.

**Requirements:**
- Export wave with all messages
- Include attachments/media
- Formatted HTML or PDF output
- Preserve threading structure
- Include participant metadata

**Backend Changes:**
- `GET /api/waves/:id/export?format=pdf|html`
- PDF generation library (e.g., puppeteer, wkhtmltopdf)
- Template rendering for export

---

### 10. Advanced Search with Filters
**Priority:** Low
**Complexity:** Medium
**Estimated Time:** 6-8 hours

**Description:**
Enhanced search with advanced filters and boolean operators.

**Requirements:**
- Boolean operators: AND, OR, NOT
- Exact phrase matching with quotes
- Filter by: author, date range, wave privacy level, has:media, has:reactions
- Sort by: relevance, date, author
- Save search queries

**Implementation:**
- Enhanced search parser
- Query builder UI
- Saved searches storage

---

## 🔮 Future Considerations (v2.0.0+)

These features require significant architectural changes and are planned for future major versions:

### Federation & Cross-Server Communication
- Connect to other Cortex servers
- Cross-server waves and messaging
- Server discovery and trust system
- End-to-end encryption for federated messages

### SQLite/PostgreSQL Migration
- Migrate from JSON files to proper database
- Improved performance for large datasets
- Full-text search with database FTS
- Transaction support

### Voice & Video
- Voice messages
- Video messages
- Real-time voice/video calls
- Screen sharing

### Advanced Moderation
- User blocking/muting
- Report system for inappropriate content
- Moderator roles with permissions
- Content filtering rules

### API & Integrations
- Public REST API for third-party clients
- Webhooks for external integrations
- Bot framework for automation
- OAuth for external authentication

---

## 📊 Priority Matrix

| Feature | Priority | Complexity | User Impact | Estimated Time |
|---------|----------|------------|-------------|----------------|
| Message Reactions | High | Low-Med | High | 4-6h |
| Message Search | High | Medium | High | 8-12h |
| Typing Indicators | Medium | Low | Medium | 3-4h |
| Read Receipts Display | Medium | Low | Medium | 2-3h |
| GIF Search | Medium | Medium | Medium | 6-8h |
| Threading Improvements | Medium | Medium | Medium | 6-8h |
| Mobile PWA | Medium | High | High | 16-24h |
| File Upload | Medium | High | Very High | 20-30h |
| Export Wave | Low | Medium | Low | 8-12h |
| Advanced Search | Low | Medium | Medium | 6-8h |

---

## 🎯 Recommended v1.5.0 Scope

For the next minor release (v1.5.0), we recommend focusing on high-impact, lower-complexity features:

### Core Features
1. **Message Reactions** (4-6h) - High user demand, low complexity
2. **Message Search** (8-12h) - Critical usability feature
3. **Typing Indicators** (3-4h) - Nice UX improvement, quick win

### Stretch Goals
4. **GIF Search Integration** (6-8h) - Deferred from v1.3.3
5. **Read Receipts Display** (2-3h) - Complements v1.4.0 read tracking

**Total Estimated Time:** 23-33 hours (3-5 days of focused development)

---

## 📝 Notes

- All estimates assume familiarity with existing codebase
- Testing and documentation time not included (add ~30%)
- Features can be implemented independently in any order
- Some features may require user configuration/preferences

---

*This document will be updated as features are implemented and new requests come in.*
