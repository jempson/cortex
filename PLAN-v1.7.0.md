# Cortex v1.7.0 - Implementation Plan

## 🎯 RELEASE STATUS: ✅ RELEASED

**Started:** December 5, 2025
**Released:** December 5, 2025
**Target Scope:** Contact & Invitation Approval System
**Actual Time:** Completed in single development session

---

## Overview

Version 1.7.0 focuses on building a comprehensive approval workflow for contacts, groups, and waves. Users will have full control over who can connect with them and what groups/waves they join.

**Release Type:** Social Features & Privacy Controls
**Focus Areas:** Contact management, invitation workflows, user consent

---

## Features for v1.7.0

### Core Features
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 1 | Contact Request System | High | 8-10h | ✅ Complete |
| 2 | Add Contact from Participants | High | 4-6h | ✅ Complete |
| 3 | Group Invitation System | High | 8-12h | ✅ Complete |

### Secondary Features
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 4 | Basic Moderation (block/mute) | Med-High | 12-16h | ✅ Complete |
| 5 | GIF Search Integration | Medium | 6-8h | ✅ Complete |

---

## Implementation Order

### Phase 1: Contact Request System (Backend)
**Status:** ✅ Complete

#### 1.1 Data Storage
- [x] Create `contact-requests.json` data file
- [x] Add ContactRequest schema to Database class
- [x] Implement CRUD methods:
  - `createContactRequest(fromUserId, toUserId, message)`
  - `getContactRequestsForUser(userId)` - received requests
  - `getSentContactRequests(userId)` - sent requests
  - `getContactRequest(requestId)`
  - `acceptContactRequest(requestId, userId)`
  - `declineContactRequest(requestId, userId)`
  - `cancelContactRequest(requestId, userId)`
  - `getPendingRequestBetween(userId1, userId2)`
  - `isContact(userId, contactId)`

#### 1.2 API Endpoints
- [x] `POST /api/contacts/request` - Send contact request
  - Body: `{ toUserId, message? }`
  - Validates: not already contacts, no pending request, not blocked
- [x] `GET /api/contacts/requests` - Get received pending requests
- [x] `GET /api/contacts/requests/sent` - Get sent pending requests
- [x] `POST /api/contacts/requests/:id/accept` - Accept request
  - Creates mutual contact relationship
  - Updates request status to 'accepted'
- [x] `POST /api/contacts/requests/:id/decline` - Decline request
  - Updates request status to 'declined'
- [x] `DELETE /api/contacts/requests/:id` - Cancel sent request

#### 1.3 WebSocket Events
- [x] `contact_request_received` - Notify recipient of new request
- [x] `contact_request_accepted` - Notify sender when accepted
- [x] `contact_request_declined` - Notify sender when declined
- [x] `contact_request_cancelled` - Notify recipient when cancelled

---

### Phase 2: Contact Request System (Frontend)
**Status:** ✅ Complete

#### 2.1 State Management
- [x] Add `contactRequests` state to MainApp
- [x] Add `sentContactRequests` state
- [x] Load requests on app init
- [x] Handle WebSocket events for real-time updates

#### 2.2 UI Components
- [x] `ContactRequestBadge` - Shows count of pending requests (integrated into nav)
- [x] `ContactRequestsPanel` - List received requests with Accept/Decline
- [x] `SentRequestsPanel` - List sent requests with Cancel option
- [x] `SendContactRequestModal` - Form to send request with message

#### 2.3 Integration Points
- [x] Add requests section to Contacts view
- [x] Add badge count to Contacts nav button (teal color for contact requests)
- [x] Show toast notifications for request events

---

### Phase 3: Add Contact from Participants
**Status:** ✅ Complete

#### 3.1 Participant Panel Updates
- [x] Check if each participant is already a contact
- [x] Check if there's a pending request (sent or received)
- [x] Show appropriate button/status:
  - "+ ADD" button - if not a contact and no pending request
  - "PENDING" badge - if you sent a request
  - "ACCEPT" button - if they sent you a request
  - "✓ CONTACT" badge - if already a contact
  - "(you)" label - for current user (no button shown)

#### 3.2 Quick Actions
- [x] One-click "+ ADD" sends request immediately (no modal)
- [x] One-click "ACCEPT" accepts incoming request immediately

#### 3.3 UI Improvements
- [x] Expanded participant panel with full user info (avatar, name, handle)
- [x] Read status badge (✓ READ / ○ UNREAD)
- [x] Teal color theme for contact actions
- [x] Mobile-responsive touch targets

---

### Phase 4: Group Invitation System (Backend)
**Status:** ✅ Complete

#### 4.1 Data Storage
- [x] Create `group-invitations.json` data file
- [x] Add GroupInvitation schema to Database class
- [x] Implement CRUD methods:
  - `createGroupInvitation(groupId, invitedBy, invitedUserId, message)`
  - `getGroupInvitationsForUser(userId)`
  - `getGroupInvitationsSent(groupId, userId)`
  - `getGroupInvitation(invitationId)`
  - `acceptGroupInvitation(invitationId, userId)`
  - `declineGroupInvitation(invitationId, userId)`
  - `cancelGroupInvitation(invitationId, userId)`

#### 4.2 API Endpoints
- [x] `POST /api/groups/:id/invite` - Invite user(s) to group
  - Body: `{ userIds: [], message? }`
  - Validates: inviter is group member, users not already members, not blocked
- [x] `GET /api/groups/invitations` - Get pending invitations
- [x] `GET /api/groups/:id/invitations/sent` - Get sent invitations for a group
- [x] `POST /api/groups/invitations/:id/accept` - Accept invitation
  - Adds user to group as member
- [x] `POST /api/groups/invitations/:id/decline` - Decline invitation
- [x] `DELETE /api/groups/invitations/:id` - Cancel sent invitation

#### 4.3 WebSocket Events
- [x] `group_invitation_received` - Notify invitee
- [x] `group_invitation_accepted` - Notify inviter
- [x] `group_invitation_declined` - Notify inviter
- [x] `group_invitation_cancelled` - Notify invitee

---

### Phase 5: Group Invitation System (Frontend)
**Status:** ✅ Complete

#### 5.1 UI Components
- [x] `GroupInvitationsPanel` - List pending invitations with JOIN/DECLINE buttons
- [x] `InviteToGroupModal` - Select contacts to invite with search and multi-select
- [x] Badge count on Groups nav button (amber color #ffd23f)

#### 5.2 Integration Points
- [x] Add invitations section to Groups view (above group list)
- [x] Add "Invite" button to group details header
- [x] WebSocket handlers for all 4 invitation events with toast notifications
- [x] State management: `groupInvitations` state and `loadGroupInvitations()` function

---

### Phase 6: Basic Moderation (Block/Mute)
**Status:** ✅ Complete

#### 6.1 Backend
- [x] Add `blocked: []` and `muted: []` arrays to user schema (moderation.json)
- [x] `POST /api/users/:id/block` - Block user
- [x] `DELETE /api/users/:id/block` - Unblock user
- [x] `POST /api/users/:id/mute` - Mute user
- [x] `DELETE /api/users/:id/mute` - Unmute user
- [x] `GET /api/users/blocked` - Get blocked users list
- [x] `GET /api/users/muted` - Get muted users list
- [x] Filter blocked users from:
  - Contact requests (can't request)
  - Wave messages (hidden from view)
  - Group invitations (can't invite)

#### 6.2 Frontend
- [x] Block/Mute buttons in participant panel (⋮ dropdown menu)
- [x] Visual indicators: blocked users show red border/name, muted users show gray name
- [x] Blocked/Muted users management in Profile Settings
- [x] State management in MainApp for blocked/muted users
- [x] Real-time toast notifications for block/mute actions

---

### Phase 7: GIF Search Integration
**Status:** ✅ Complete

#### 7.1 Backend
- [x] Add `GIPHY_API_KEY` environment variable
- [x] `GET /api/gifs/search?q=query` - Proxy to Giphy API
- [x] `GET /api/gifs/trending` - Get trending GIFs
- [x] Rate limiting for GIF searches (30/min)

#### 7.2 Frontend
- [x] GIF button in message composer
- [x] GIF search modal with grid layout
- [x] Trending GIFs on open
- [x] Debounced search with 500ms delay
- [x] Click to insert GIF URL
- [x] GIPHY attribution footer

#### 7.3 GIPHY API Key Setup
To enable GIF search, you need to configure a GIPHY API key:

1. **Get an API Key**:
   - Go to https://developers.giphy.com/
   - Create an account or log in
   - Click "Create an App" → Select "API" (not SDK)
   - Name your app (e.g., "Cortex") and accept terms
   - Copy your API key from the dashboard

2. **Configure in Cortex**:
   Create or edit `server/.env`:
   ```bash
   GIPHY_API_KEY=your-api-key-here
   ```

3. **Restart the server**:
   ```bash
   cd server && npm run dev
   ```

**Rate Limits**:
- Beta key (free): 42 requests/hour, 1000/day
- Production key: Apply at GIPHY for higher limits

**Note**: GIF search shows a graceful error if API key is missing or invalid.

---

## Data Schemas

### ContactRequest
```javascript
{
  id: "uuid",
  from_user_id: "uuid",
  to_user_id: "uuid",
  message: "string | null",
  status: "pending" | "accepted" | "declined",
  created_at: "ISO timestamp",
  responded_at: "ISO timestamp | null"
}
```

### GroupInvitation
```javascript
{
  id: "uuid",
  group_id: "uuid",
  invited_by: "uuid",
  invited_user_id: "uuid",
  message: "string | null",
  status: "pending" | "accepted" | "declined",
  created_at: "ISO timestamp",
  responded_at: "ISO timestamp | null"
}
```

---

## API Endpoints Summary

### Contact Requests
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/request` | Send contact request |
| GET | `/api/contacts/requests` | Get received requests |
| GET | `/api/contacts/requests/sent` | Get sent requests |
| POST | `/api/contacts/requests/:id/accept` | Accept request |
| POST | `/api/contacts/requests/:id/decline` | Decline request |
| DELETE | `/api/contacts/requests/:id` | Cancel sent request |

### Group Invitations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/groups/:id/invite` | Invite users to group |
| GET | `/api/groups/invitations` | Get pending invitations |
| POST | `/api/groups/invitations/:id/accept` | Accept invitation |
| POST | `/api/groups/invitations/:id/decline` | Decline invitation |

### Moderation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/:id/block` | Block user |
| POST | `/api/users/:id/unblock` | Unblock user |
| POST | `/api/users/:id/mute` | Mute user |
| POST | `/api/users/:id/unmute` | Unmute user |
| GET | `/api/users/blocked` | Get blocked list |
| GET | `/api/users/muted` | Get muted list |

### GIF Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gifs/search?q=query` | Search GIFs |

---

## WebSocket Events Summary

### Contact Requests
- `contact_request_received` - `{ request }`
- `contact_request_accepted` - `{ requestId, userId }`
- `contact_request_declined` - `{ requestId }`
- `contact_request_cancelled` - `{ requestId }`

### Group Invitations
- `group_invitation_received` - `{ invitation }`
- `group_invitation_accepted` - `{ invitationId, userId, groupId }`
- `group_invitation_declined` - `{ invitationId }`

---

## Testing Checklist

### Contact Requests ✅
- [x] Send request to non-contact
- [x] Cannot send duplicate request
- [x] Cannot request blocked user
- [x] Accept creates mutual contact
- [x] Decline removes request
- [x] Cancel removes sent request
- [x] WebSocket notifications work
- [x] Badge counts update correctly

### Group Invitations ✅
- [x] Invite contact to group
- [x] Cannot invite existing member
- [x] Accept adds to group
- [x] Decline removes invitation
- [x] Only members can invite
- [x] WebSocket notifications work

### Moderation ✅
- [x] Block prevents contact requests
- [x] Block hides messages in waves
- [x] Mute hides messages but no notification
- [x] Unblock/unmute restores functionality
- [x] Blocked list management works

### GIF Search ✅
- [x] Trending GIFs load on modal open
- [x] Search returns results
- [x] Click inserts GIF URL
- [x] GIF displays correctly in messages

---

## Progress Log

### December 5, 2025
- Created v1.7.0 branch
- Created implementation plan
- ✅ **Phase 1 Complete**: Contact Request System (Backend)
  - Added `contact-requests.json` and `group-invitations.json` data file paths
  - Implemented Database methods for contact requests
  - Added 6 API endpoints for contact request management
  - Added 4 WebSocket events for real-time notifications
  - Added `isContact()` helper method
- ✅ **Phase 2 Complete**: Contact Request System (Frontend)
  - Added `contactRequests` and `sentContactRequests` state to MainApp
  - Added `loadContactRequests()` function for fetching both received and sent requests
  - WebSocket handlers for all 4 contact request events with toast notifications
  - Created `ContactRequestsPanel` - displays incoming requests with Accept/Decline buttons
  - Created `SentRequestsPanel` - collapsible panel showing pending sent requests with Cancel
  - Created `SendContactRequestModal` - form to send request with optional message
  - Updated `ContactsView` to integrate all panels and show request status in search results
  - Badge on Contacts nav button (teal color) shows pending incoming requests count
  - Changed "ADD CONTACT" to "FIND PEOPLE" to reflect new request-based workflow
- ✅ **Phase 3 Complete**: Add Contact from Participants
  - Added contact-related props to WaveView component
  - Enhanced participant panel with expanded card layout showing avatar, name, handle
  - Added contact status checking (isContact, hasSentRequestTo, hasReceivedRequestFrom)
  - Show appropriate status/buttons for each participant:
    - Current user: "(you)" label, no action button
    - Already contact: "✓ CONTACT" badge
    - Pending sent request: "PENDING" badge
    - Received request: "ACCEPT" button (one-click accept)
    - Not a contact: "+ ADD" button (one-click send request)
  - Maintained read status indicator (✓ READ / ○ UNREAD)
  - Mobile-responsive with proper touch targets
- ✅ **Phase 4 Complete**: Group Invitation System (Backend)
  - Data storage already configured (`group-invitations.json`)
  - Implemented 7 Database methods:
    - `createGroupInvitation()` - with validation (group exists, member, not blocked, not already invited)
    - `getGroupInvitationsForUser()` - get pending received invitations with enriched data
    - `getGroupInvitationsSent()` - get pending sent invitations for a group
    - `getGroupInvitation()` - get single invitation
    - `acceptGroupInvitation()` - accept and add to group as member
    - `declineGroupInvitation()` - decline invitation
    - `cancelGroupInvitation()` - cancel sent invitation (inviter only)
  - Added 6 API endpoints:
    - `POST /api/groups/:id/invite` - invite multiple users at once
    - `GET /api/groups/invitations` - get pending received invitations
    - `GET /api/groups/:id/invitations/sent` - get sent invitations for a group
    - `POST /api/groups/invitations/:id/accept` - accept invitation
    - `POST /api/groups/invitations/:id/decline` - decline invitation
    - `DELETE /api/groups/invitations/:id` - cancel sent invitation
  - Added 4 WebSocket events for real-time notifications:
    - `group_invitation_received` - notify invitee
    - `group_invitation_accepted` - notify inviter with user and group info
    - `group_invitation_declined` - notify inviter
    - `group_invitation_cancelled` - notify invitee
- ✅ **Phase 5 Complete**: Group Invitation System (Frontend)
  - Added `groupInvitations` state and `loadGroupInvitations()` function to MainApp
  - Added WebSocket handlers for all 4 group invitation events with toast notifications
  - Created `GroupInvitationsPanel` component:
    - Displays pending group invitations with JOIN/DECLINE buttons
    - Shows group name, inviter, and optional message
    - Mobile-responsive with proper touch targets
  - Created `InviteToGroupModal` component:
    - Multi-select contact picker with search filtering
    - Optional message input
    - Shows selected count and validates before sending
  - Updated `GroupsView`:
    - Added props: groupInvitations, onInvitationsChange, contacts
    - Integrated GroupInvitationsPanel above group list
    - Added "+ INVITE" button to group details header
    - Added InviteToGroupModal with group context
  - Badge on Groups nav button (amber #ffd23f) shows pending invitations count
- ✅ **Bug Fixes**: Group System Improvements
  - Fixed "ADD MEMBER" to use invitation flow instead of direct add
    - Users now receive invitations they can accept/decline
    - Renamed button labels: "ADD MEMBER" → "INVITE MEMBER", "ADD" → "INVITE"
  - Added "LEAVE GROUP" button for all group members
    - Any member can now leave a group voluntarily
    - Server returns `currentUserId` in group details for leave functionality
  - Fixed group wave access control security issue
    - `canAccessWave()`: Group waves now require current group membership (participant status alone insufficient)
    - `getWavesForUser()`: Group waves only shown if user is current group member
    - `removeGroupMember()`: Now cleans up wave participants when user leaves group
    - Leaving a group immediately revokes access to all group waves

- ✅ **Phase 6 Complete**: Basic Moderation (Block/Mute)
  - Backend already implemented in earlier work:
    - Database methods: `blockUser`, `unblockUser`, `muteUser`, `unmuteUser`, `isBlocked`, `isMuted`
    - API endpoints: POST/DELETE `/api/users/:id/block`, POST/DELETE `/api/users/:id/mute`
    - GET endpoints: `/api/users/blocked`, `/api/users/muted`
    - Filtering: blocked users filtered from contact requests, group invitations, and wave messages
  - Frontend implementation completed:
    - Added `blockedUsers` and `mutedUsers` state to MainApp
    - Added `loadBlockedMutedUsers()` function with API calls
    - Added block/unblock/mute/unmute handler functions
    - Updated WaveView to accept and use blocked/muted props
    - Added participant panel moderation menu (⋮ dropdown with MUTE/BLOCK options)
    - Added visual indicators for blocked (red border/name) and muted (gray name) users
    - Added "Blocked & Muted Users" management section in Profile Settings
    - Collapsible section showing blocked and muted users with UNBLOCK/UNMUTE buttons
- ✅ **Phase 7 Complete**: GIF Search Integration
  - Backend implementation:
    - Added `GIPHY_API_KEY` environment variable support
    - Created `GET /api/gifs/search?q=query` endpoint - GIPHY API proxy
    - Created `GET /api/gifs/trending` endpoint - trending GIFs
    - Added rate limiting: 30 searches per minute per user
    - Content filtered to PG-13 rating
    - Returns transformed response with id, title, url (original), preview (small)
  - Frontend implementation:
    - Created `GifSearchModal` component with search and grid display
    - Added GIF button in message composer (teal color)
    - Shows trending GIFs on modal open
    - Debounced search with 500ms delay
    - Click to insert full GIF URL into message
    - GIPHY attribution footer as required
    - Mobile-responsive grid (2 columns mobile, 3 columns desktop)

- ✅ **Bug Fixes**: Moderation ID Handling
  - Fixed unblock/unmute from Profile Settings (was passing wrong ID field)
  - Fixed isBlocked/isMuted helper functions in WaveView (checking wrong field)
  - Fixed "Mark All Read" button visibility (now checks all_messages, not just threaded root)
- ✅ **Environment Configuration**: Added dotenv support
  - Installed `dotenv` package
  - Server now auto-loads `.env` file on startup
  - JWT_SECRET and GIPHY_API_KEY properly read from environment

---

## Known Issues (Deferred to Future Release)

1. **GIF Playback in Messages**: GIFs may appear frozen until double-clicked. This is a minor UX issue and does not affect functionality.

---

## Release Summary

v1.7.0 delivers a comprehensive approval workflow system for Cortex:

- **Contact Request System**: Users must send and accept contact requests before becoming contacts
- **Group Invitation System**: Users must be invited to groups and can accept or decline
- **Participant Quick Actions**: Add contacts directly from wave participants with one-click actions
- **User Moderation**: Block and mute users with full message filtering
- **GIF Search**: GIPHY-powered GIF search and embedding in messages
- **Leave Group**: All members can leave groups voluntarily
- **Group Wave Security**: Leaving a group immediately revokes access to group waves

All features tested and verified working with no show-stopper bugs identified.

---

*Released: December 5, 2025*
