# Cortex - Outstanding Features & Future Roadmap

**Last Updated:** December 5, 2025
**Current Version:** v1.6.1

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

### 5. Push Notifications & Desktop Alerts
**Priority:** Low-Medium
**Complexity:** Low (Desktop) / High (PWA Push)
**Estimated Time:** 4-6 hours (Desktop) / 16-20 hours (Full PWA)

**Description:**
Notify users of new messages even when they're not actively viewing the app or are on a different tab/wave.

**User Story:**
> As a user with Cortex open in a browser tab, I want to be notified when new messages arrive even when I'm viewing another tab or wave, so I don't miss important conversations.

**Requested By:** Jared Empson

**Current State:**
- WebSocket connection provides real-time updates
- Toast notifications show briefly in-app
- No notifications when tab is in background
- No notifications when viewing a different wave

**Solution Phases:**

#### Phase 1: Desktop Notifications (Low Complexity - v1.5.0)
**Estimated Time:** 4-6 hours

Use browser's Notification API for desktop notifications:

```javascript
// Request permission on first use
if (Notification.permission === 'default') {
  await Notification.requestPermission();
}

// When new message arrives via WebSocket
if (Notification.permission === 'granted') {
  new Notification('New message from Alice', {
    body: 'Hey, are you free to chat?',
    icon: '/cortex-icon.png',
    badge: '/cortex-badge.png',
    tag: 'wave-123',  // Group notifications by wave
    requireInteraction: false,  // Auto-dismiss after timeout
  });
}
```

**Requirements:**
- Request notification permission on login or in settings
- Show desktop notification when:
  - New message in any wave (if viewing different wave)
  - New message while tab is in background
  - User is mentioned with @handle
- Notification settings in user preferences:
  - Enable/disable notifications
  - Notify on all messages vs mentions only
  - Do Not Disturb mode
- Click notification to focus wave
- Group notifications by wave (don't spam)
- Mute notifications for archived waves

**Implementation:**
- Add to WebSocket message handler in CortexApp.jsx
- Check if current wave matches message wave
- Check if tab is visible using `document.visibilityState`
- Store notification preferences in user settings
- Respect browser notification permission

#### Phase 2: PWA Push Notifications (High Complexity - v1.7.0+)
**Estimated Time:** 16-20 hours

Full push notifications even when browser is closed (requires PWA):

**Requirements:**
- Service worker registration
- Push subscription management
- Backend push notification service (Web Push API)
- HTTPS required
- User subscription to push endpoint
- Handle push events in service worker
- Show notifications even when app is closed

**Backend Changes:**
- Store push subscriptions per user/device
- Endpoint: `POST /api/push/subscribe` to register subscription
- Endpoint: `POST /api/push/unsubscribe` to remove subscription
- Integrate with Web Push library (e.g., `web-push` npm package)
- Send push notifications on new messages
- VAPID keys for push authentication

**Frontend Changes:**
- Service worker for push event handling
- Push subscription UI in settings
- Handle notification clicks (open wave)
- Background sync for offline messages

**Note:** Phase 2 requires significant PWA infrastructure and HTTPS. Recommend implementing Phase 1 first for quick wins.

---

### 6. GIF Search Integration
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

### 7. Message Threading Improvements
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

### 8. Mobile App Enhancements
**Priority:** Medium
**Complexity:** High
**Estimated Time:** 16-24 hours

**Description:**
Advanced mobile features for better app-like experience.

**Requirements:**
- Swipe gestures for navigation (swipe right to go back)
- Pull-to-refresh on wave list
- Bottom navigation bar for primary actions
- ~~Progressive Web App (PWA) support with offline mode~~ ✅ **COMPLETED v1.6.0**
- Push notifications (requires service worker - see Feature #5 Phase 2)
- ~~Install prompt for "Add to Home Screen"~~ ✅ **COMPLETED v1.6.0**

**Implementation:**
- ~~Add service worker for PWA~~ ✅ **COMPLETED v1.6.0**
- Implement touch gesture handlers
- ~~Create manifest.json for PWA~~ ✅ **COMPLETED v1.6.0**
- Set up Web Push API for notifications (see Feature #5)

**Completed in v1.6.0:**
- Service worker with offline caching
- Web app manifest with icons
- Custom install prompt component
- Offline indicator component
- iOS PWA support

---

### 9. File Upload Support
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

### 10. Export Wave as PDF/HTML
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

### 11. Advanced Search with Filters
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

## 🛡️ Moderation & API Features (v1.6.0)

### 12. Basic Moderation System
**Priority:** Medium-High
**Complexity:** Medium
**Estimated Time:** 12-16 hours

**Description:**
Essential moderation tools for community management.

**Requirements:**
- **User Blocking/Muting:**
  - Block users (hide their messages, prevent DMs)
  - Mute users (hide messages but don't notify them)
  - Manage blocked/muted users in settings
  - Blocked users can't add you to waves
- **Report System:**
  - Report messages/waves for review
  - Report reasons: spam, harassment, inappropriate, other
  - Admin dashboard to view reports
  - Mark reports as resolved/dismissed
- **Admin Actions:**
  - View all reports in admin panel
  - See reported content with context
  - Take action: delete content, warn user, dismiss
  - Audit log of moderation actions

**Backend Changes:**
- Add `blocked: [userId, ...]` and `muted: [userId, ...]` to user schema
- New collection: `reports.json` with report data
- Endpoints:
  - `POST /api/users/:id/block` - Block user
  - `POST /api/users/:id/mute` - Mute user
  - `GET /api/users/blocked` - Get blocked users list
  - `POST /api/reports` - Create report
  - `GET /api/admin/reports` - List all reports (admin only)
  - `POST /api/admin/reports/:id/resolve` - Resolve report
- Filter messages from blocked users in getMessagesForWave()

**Frontend Changes:**
- Block/Mute buttons in user profile/context menu
- Report button on messages
- Report modal with reason selection
- Admin reports panel
- Settings page: Blocked/Muted users management

---

### 13. Public REST API Documentation
**Priority:** Medium
**Complexity:** Low-Medium
**Estimated Time:** 8-10 hours

**Description:**
Document and formalize existing API for third-party clients.

**Requirements:**
- **API Documentation:**
  - Document all existing endpoints
  - Request/response examples
  - Authentication guide (JWT)
  - Error codes and messages
  - Rate limiting policies
- **API Keys (Optional):**
  - Generate API keys for applications
  - API key authentication alongside JWT
  - Per-key rate limiting
  - Revoke API keys
- **API Versioning:**
  - Version prefix: `/api/v1/...`
  - Deprecation notices
- **Developer Portal:**
  - Static documentation page
  - Interactive API explorer (optional)
  - Example code snippets

**Backend Changes:**
- Add API key model to users.json (if implementing keys)
- Middleware for API key authentication
- Update all endpoints with `/api/v1/` prefix (with backward compatibility)
- API rate limiter per key/user

**Frontend Changes:**
- API documentation page (can be static HTML)
- API key management in user settings (if implementing keys)

**Note:** This is mostly organizational work - the API already exists, we're just documenting and formalizing it.

---

### 14. Contact & Invitation Approval System
**Priority:** High
**Complexity:** High
**Estimated Time:** 20-28 hours

**Description:**
Comprehensive approval workflow for contacts, groups, and waves. Users should have control over who can connect with them and what groups/waves they join.

**User Stories:**
> As a user, I want to add someone as a contact from a wave's participant list, so I can easily connect with people I'm communicating with.

> As a user, I want to approve contact requests before someone is added as my contact, so I have control over my connections.

> As a user, I want to be notified when someone invites me to a group, and choose whether to accept or decline.

> As a wave creator, I want to invite my contacts to join a private wave without requiring approval (they're already trusted contacts).

**Requested By:** Jared Empson (December 2025)

#### Feature Components:

**1. Add Contact from Participants List**
- "Add Contact" button appears next to participants who aren't already contacts
- One-click to send contact request
- Visual indicator for pending requests

**2. Contact Request System**
- When User A tries to add User B as contact:
  - Creates a `contact_request` (pending state)
  - User B receives notification (real-time via WebSocket)
  - User B can Accept or Decline
  - On Accept: Both users become contacts
  - On Decline: Request removed, no contact created
- Requests visible in dedicated "Requests" section (similar to handle requests)
- Optional: Add message with request ("Hey, great chatting in the Dev wave!")

**3. Group Invitation System**
- When adding contacts to a group:
  - Creates `group_invitation` for each contact
  - Each invitee receives notification
  - Invitee can Accept or Decline
  - On Accept: User added to group
  - On Decline: Invitation removed
- Group creator sees pending invitations
- Bulk invite with single notification per user

**4. Wave Participant Rules**
- **Private Waves**: Can only add existing contacts (no approval needed - already trusted)
- **Group Waves**: Members of the group are auto-added
- **Public Waves**: Anyone can join (no invitation needed)
- **Cross-Server Waves**: Future federation consideration

#### Backend Changes:

**New Data Files:**
- `contact-requests.json` - Pending contact requests
- `group-invitations.json` - Pending group invitations

**New Schemas:**
```javascript
// Contact Request
{
  id: uuid,
  from_user_id: uuid,
  to_user_id: uuid,
  message: string | null,  // Optional message
  status: 'pending' | 'accepted' | 'declined',
  created_at: timestamp,
  responded_at: timestamp | null
}

// Group Invitation
{
  id: uuid,
  group_id: uuid,
  invited_by: uuid,
  invited_user_id: uuid,
  message: string | null,
  status: 'pending' | 'accepted' | 'declined',
  created_at: timestamp,
  responded_at: timestamp | null
}
```

**New Endpoints:**
```
# Contact Requests
POST   /api/contacts/request          - Send contact request
GET    /api/contacts/requests         - Get pending requests (received)
GET    /api/contacts/requests/sent    - Get sent requests
POST   /api/contacts/requests/:id/accept  - Accept request
POST   /api/contacts/requests/:id/decline - Decline request
DELETE /api/contacts/requests/:id     - Cancel sent request

# Group Invitations
POST   /api/groups/:id/invite         - Invite user(s) to group
GET    /api/groups/invitations        - Get pending invitations (received)
POST   /api/groups/invitations/:id/accept  - Accept invitation
POST   /api/groups/invitations/:id/decline - Decline invitation
```

**WebSocket Events:**
- `contact_request_received` - New contact request
- `contact_request_accepted` - Request was accepted
- `contact_request_declined` - Request was declined
- `group_invitation_received` - New group invitation
- `group_invitation_accepted` - Invitation accepted
- `group_invitation_declined` - Invitation declined

#### Frontend Changes:

**Participants Panel:**
- "Add Contact" button for non-contacts
- Shows "Request Pending" if already requested
- Shows "Contact" badge if already a contact

**New UI Components:**
- `ContactRequestModal` - Send request with optional message
- `RequestsPanel` - View/manage received requests
- `SentRequestsPanel` - View/cancel sent requests
- `GroupInvitationsPanel` - View/respond to group invites
- `InviteToGroupModal` - Select contacts to invite

**Notifications:**
- Badge count for pending requests/invitations
- Toast notifications for real-time events
- Notification center (future) for history

#### Privacy & Security Considerations:
- Users can only request contacts from people they share a wave with
- Rate limiting on contact requests (prevent spam)
- Blocked users cannot send requests
- Declined requests have cooldown before re-requesting
- Group invitations only from existing group admins/members

#### Implementation Order:
1. Contact request system (backend + basic UI)
2. Add contact from participants
3. Group invitation system
4. Polish notifications and UX

---

## 🔮 Future Considerations (v2.0.0+)

These features require significant architectural changes and are planned for future major versions:

### Advanced API & Integrations
- **Webhooks:** Outbound HTTP callbacks for events
- **Bot Framework:** Create automated bots with special permissions
- **OAuth Provider:** Let users auth to third-party apps with Cortex
- **GraphQL API:** Alternative to REST for complex queries

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
- **AI Content Filtering:** Automatic detection of spam/harassment
- **Moderator Roles:** Granular permissions for moderators
- **Auto-moderation Rules:** Regex filters, word blacklists, rate limits
- **Appeal System:** Users can appeal moderation decisions
- **Shadowban:** Hide user's messages from others without notifying them

---

## 📊 Priority Matrix

| Feature | Priority | Complexity | User Impact | Estimated Time |
|---------|----------|------------|-------------|----------------|
| ~~Message Reactions~~ | ~~High~~ | ~~Low-Med~~ | ~~High~~ | ✅ v1.5.0 |
| ~~Message Search~~ | ~~High~~ | ~~Medium~~ | ~~High~~ | ✅ v1.5.0 |
| ~~Typing Indicators~~ | ~~Medium~~ | ~~Low~~ | ~~Medium~~ | ✅ v1.5.0 |
| ~~Read Receipts Display~~ | ~~Medium~~ | ~~Low~~ | ~~Medium~~ | ✅ v1.6.0 |
| ~~Desktop Notifications~~ | ~~Low-Med~~ | ~~Low~~ | ~~High~~ | ✅ v1.5.0 |
| ~~PWA Support~~ | ~~Medium~~ | ~~High~~ | ~~High~~ | ✅ v1.6.0 |
| **Contact & Invitation System** | **High** | **High** | **Very High** | **20-28h** |
| **Basic Moderation** | **Med-High** | **Medium** | **High** | **12-16h** |
| GIF Search | Medium | Medium | Medium | 6-8h |
| Threading Improvements | Medium | Medium | Medium | 6-8h |
| **Public API Docs** | **Medium** | **Low-Med** | **Medium** | **8-10h** |
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
4. **Desktop Notifications - Phase 1** (4-6h) - High user impact, low complexity (Requested by Jared)
5. **GIF Search Integration** (6-8h) - Deferred from v1.3.3
6. **Read Receipts Display** (2-3h) - Complements v1.4.0 read tracking

**Total Estimated Time:** 27-39 hours (3-5 days of focused development)

**Note:** Desktop Notifications (Phase 1) uses browser's Notification API and requires no backend changes - perfect for v1.5.0. Phase 2 (full PWA push) deferred to v1.7.0+ with mobile enhancements.

---

## 🎯 Recommended v1.7.0 Scope (Contact & Invitation System)

For v1.7.0, focus on the comprehensive contact and invitation approval system:

### Core Features
1. **Contact Request System** (8-10h) - Request/approve/decline contact connections
2. **Add Contact from Participants** (4-6h) - One-click contact requests from wave participants
3. **Group Invitation System** (8-12h) - Invite/accept/decline group memberships

### Secondary Features
4. **Basic Moderation** (12-16h) - User blocking, muting (integrates with contact system)
5. **GIF Search Integration** (6-8h) - Quick win for user engagement

**Total Estimated Time:** 38-52 hours

### Why This Order?
- Contact requests provide foundation for all social interactions
- Blocking/muting integrates naturally with contact system
- Group invitations build on contact request patterns
- GIF search is independent and can be done in parallel

---

## 📝 Notes

- All estimates assume familiarity with existing codebase
- Testing and documentation time not included (add ~30%)
- Features can be implemented independently in any order
- Some features may require user configuration/preferences

---

*This document will be updated as features are implemented and new requests come in.*
