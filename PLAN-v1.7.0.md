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
| 1 | Contact Request System | High | 8-10h | 🔶 Backend Done |
| 2 | Add Contact from Participants | High | 4-6h | 🔲 Not Started |
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
**Status:** 🔲 Not Started

#### 2.1 State Management
- [ ] Add `contactRequests` state to MainApp
- [ ] Add `sentContactRequests` state
- [ ] Load requests on app init
- [ ] Handle WebSocket events for real-time updates

#### 2.2 UI Components
- [ ] `ContactRequestBadge` - Shows count of pending requests
- [ ] `ContactRequestsPanel` - List received requests with Accept/Decline
- [ ] `SentRequestsPanel` - List sent requests with Cancel option
- [ ] `SendContactRequestModal` - Form to send request with message

#### 2.3 Integration Points
- [ ] Add requests section to Contacts view
- [ ] Add badge count to Contacts nav button
- [ ] Show toast notifications for request events

---

### Phase 3: Add Contact from Participants
**Status:** 🔲 Not Started

#### 3.1 Participant Panel Updates
- [ ] Check if each participant is already a contact
- [ ] Check if there's a pending request (sent or received)
- [ ] Show appropriate button/status:
  - "Add Contact" - if not a contact and no pending request
  - "Request Pending" - if you sent a request
  - "Respond" - if they sent you a request
  - "Contact ✓" - if already a contact

#### 3.2 Quick Actions
- [ ] One-click "Add Contact" sends request immediately
- [ ] Or opens modal for adding message (user preference?)

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

---

*Last Updated: December 5, 2025*
