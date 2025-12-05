# Cortex v1.7.0 - Implementation Plan

## 🎯 RELEASE STATUS: IN DEVELOPMENT

**Started:** December 5, 2025
**Target Scope:** Contact & Invitation Approval System
**Estimated Time:** 38-52 hours

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
| 3 | Group Invitation System | High | 8-12h | 🔲 Not Started |

### Secondary Features
| # | Feature | Priority | Est. Time | Status |
|---|---------|----------|-----------|--------|
| 4 | Basic Moderation (block/mute) | Med-High | 12-16h | 🔲 Not Started |
| 5 | GIF Search Integration | Medium | 6-8h | 🔲 Not Started |

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
**Status:** 🔲 Not Started

#### 4.1 Data Storage
- [ ] Create `group-invitations.json` data file
- [ ] Add GroupInvitation schema to Database class
- [ ] Implement CRUD methods:
  - `createGroupInvitation(groupId, invitedBy, invitedUserId, message)`
  - `getGroupInvitationsForUser(userId)`
  - `getGroupInvitationsSent(groupId, userId)`
  - `updateGroupInvitationStatus(invitationId, status)`

#### 4.2 API Endpoints
- [ ] `POST /api/groups/:id/invite` - Invite user(s) to group
  - Body: `{ userIds: [], message? }`
  - Validates: inviter is group member/admin, users not already members
- [ ] `GET /api/groups/invitations` - Get pending invitations
- [ ] `POST /api/groups/invitations/:id/accept` - Accept invitation
  - Adds user to group
- [ ] `POST /api/groups/invitations/:id/decline` - Decline invitation

#### 4.3 WebSocket Events
- [ ] `group_invitation_received` - Notify invitee
- [ ] `group_invitation_accepted` - Notify inviter
- [ ] `group_invitation_declined` - Notify inviter

---

### Phase 5: Group Invitation System (Frontend)
**Status:** 🔲 Not Started

#### 5.1 UI Components
- [ ] `GroupInvitationsPanel` - List pending invitations
- [ ] `InviteToGroupModal` - Select contacts to invite
- [ ] `GroupInvitationBadge` - Shows pending invitation count

#### 5.2 Integration Points
- [ ] Add invitations section to Groups view
- [ ] Add "Invite" button to group details
- [ ] Badge count on Groups nav button

---

### Phase 6: Basic Moderation (Block/Mute)
**Status:** 🔲 Not Started

#### 6.1 Backend
- [ ] Add `blocked: []` and `muted: []` arrays to user schema
- [ ] `POST /api/users/:id/block` - Block user
- [ ] `POST /api/users/:id/unblock` - Unblock user
- [ ] `POST /api/users/:id/mute` - Mute user
- [ ] `POST /api/users/:id/unmute` - Unmute user
- [ ] `GET /api/users/blocked` - Get blocked users list
- [ ] `GET /api/users/muted` - Get muted users list
- [ ] Filter blocked users from:
  - Contact requests (can't request)
  - Wave participants (hide messages)
  - Group invitations (can't invite)

#### 6.2 Frontend
- [ ] Block/Mute buttons in user context menu
- [ ] Blocked/Muted users management in Settings
- [ ] Visual indicator for muted users

---

### Phase 7: GIF Search Integration
**Status:** 🔲 Not Started

#### 7.1 Backend
- [ ] Add `GIPHY_API_KEY` environment variable
- [ ] `GET /api/gifs/search?q=query` - Proxy to Giphy API
- [ ] Rate limiting for GIF searches

#### 7.2 Frontend
- [ ] GIF button in message composer
- [ ] GIF search modal with grid layout
- [ ] Click to insert GIF URL

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

### Contact Requests
- [ ] Send request to non-contact
- [ ] Cannot send duplicate request
- [ ] Cannot request blocked user
- [ ] Accept creates mutual contact
- [ ] Decline removes request
- [ ] Cancel removes sent request
- [ ] WebSocket notifications work
- [ ] Badge counts update correctly

### Group Invitations
- [ ] Invite contact to group
- [ ] Cannot invite existing member
- [ ] Accept adds to group
- [ ] Decline removes invitation
- [ ] Only members can invite
- [ ] WebSocket notifications work

### Moderation
- [ ] Block prevents contact requests
- [ ] Block hides messages in waves
- [ ] Mute hides messages but no notification
- [ ] Unblock/unmute restores functionality
- [ ] Blocked list management works

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

---

*Last Updated: December 5, 2025*
