# Cortex v1.9.0 - Implementation Plan

## RELEASE STATUS: COMPLETE (11/11 Phases)

**Target Scope:** Threading, Mobile UX, Moderation & API Documentation
**Branch:** `v1.9.0`

---

## Overview

Version 1.9.0 focuses on enhanced message threading visualization, improved mobile experience with gestures, a user-driven content moderation system, and formal API documentation for third-party developers.

**Release Type:** UX Enhancement + Platform Maturity
**Focus Areas:** Threading improvements, mobile gestures, content moderation, API documentation

---

## Features for v1.9.0

### UX Enhancement Features
| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | Message Threading Improvements | Medium | Complete |
| 2 | Mobile Gesture Enhancements | Medium | Complete |

### Platform Maturity Features
| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 3 | Report System (Content Moderation) | Medium | Complete |
| 4 | Public REST API Documentation | Low-Medium | Complete |

---

## Implementation Phases

### Phase 1: Thread Collapse/Expand System
**Priority:** Medium | **Status:** Complete ✓

Allow users to collapse entire threads to focus on relevant conversations.

#### 1.1 Thread State Management
- [x] Add `collapsedThreads` state to track collapsed root messages by ID
- [x] `onToggleThreadCollapse(messageId)` function to toggle thread state
- [x] Persist collapsed state in localStorage per wave
- [x] "Collapse All" / "Expand All" buttons in wave header

#### 1.2 ThreadedMessage Component Updates
- [x] Add collapse/expand chevron icon to messages with children
- [x] When collapsed, show only root message with child count badge
- [x] Animated transition for collapse/expand (CSS transform)
- [x] Indentation indicator line (vertical dashed line) along thread depth

#### 1.3 Thread Summary Mode
- [x] Collapsed thread shows: root content + "N replies" badge
- [x] Most recent reply timestamp in collapsed view
- [x] "Unread replies" indicator if any children are unread

---

### Phase 2: Thread Navigation
**Priority:** Medium | **Status:** Complete ✓

Add navigation aids for deep thread structures.

#### 2.1 Jump to Parent
- [x] "↑ Parent" button on reply messages (depth > 0)
- [x] Scroll to and highlight parent message
- [x] Use existing highlight animation (amber border flash)

#### 2.2 Thread Breadcrumb
- [x] For deeply nested messages (depth > 3), show breadcrumb trail
- [x] Format: "Root > Reply 1 > Reply 2 > Current"
- [x] Each breadcrumb item clickable to jump to that message

#### 2.3 Thread Depth Warning
- [x] Visual indicator when approaching max depth (e.g., depth 8+)
- [x] Subtle amber warning: "Thread getting deep - consider starting new thread"
- [x] Optional: Suggest creating new wave with link to this thread

---

### Phase 3: Visual Thread Connectors
**Priority:** Medium | **Status:** Complete ✓

Add visual lines connecting related messages in threads.

#### 3.1 Thread Line Rendering
- [x] Vertical connector line from parent to last child
- [x] Line color matches theme (muted green `#2a3a2a`)
- [x] Line positioned at left edge of message indent
- [x] Dashed line style to avoid visual clutter

#### 3.2 Reply Connection
- [x] Horizontal connector from vertical line to reply message
- [x] L-shaped connector for visual clarity
- [x] CSS-only implementation (pseudo-elements `::before`, `::after`)

#### 3.3 Mobile Considerations
- [x] Thinner lines on mobile (1px vs 2px)
- [x] Reduced indent depth on mobile (16px vs 24px)
- [x] Consider hiding connectors below certain depth on mobile

---

### Phase 4: Mobile Swipe Navigation
**Priority:** Medium | **Status:** Complete ✓

Add swipe gestures for mobile navigation.

#### 4.1 Swipe Gesture Hook
- [x] Create `useSwipeGesture(ref, options)` custom hook
- [x] Track touch start/move/end positions
- [x] Calculate swipe direction and velocity
- [x] Options: `threshold` (min distance), `direction` ('horizontal'|'vertical'|'both')

#### 4.2 Swipe to Go Back
- [x] In WaveView: swipe right to return to wave list
- [x] In ContactsView/GroupsView: swipe right to return to main view
- [x] Visual feedback: slight page translation during swipe
- [x] Threshold: 100px horizontal swipe to trigger

#### 4.3 Swipe Between Waves
- [x] In WaveView: swipe left/right to navigate between adjacent waves
- [x] Optional: Show peek of next/previous wave during swipe
- [x] Circular navigation (last wave wraps to first)

---

### Phase 5: Pull-to-Refresh
**Priority:** Medium | **Status:** Complete ✓

Add pull-down gesture to refresh content.

#### 5.1 Pull Gesture Detection
- [x] Create `usePullToRefresh(ref, onRefresh)` hook
- [x] Detect overscroll at top of scrollable container
- [x] Show pull indicator with distance feedback
- [x] Trigger refresh when pulled past threshold (60px)

#### 5.2 Visual Feedback
- [x] Pull indicator: arrow icon that rotates/fills based on distance
- [x] "Release to refresh" text when past threshold
- [x] Loading spinner during refresh operation
- [x] Smooth snap-back animation after release

#### 5.3 Integration Points
- [x] Wave list: Refresh waves
- [x] Wave view: Refresh messages
- [x] Contacts view: Refresh contacts and requests
- [x] Groups view: Refresh groups and invitations

---

### Phase 6: Bottom Navigation Bar
**Priority:** Medium | **Status:** Complete ✓

Add persistent bottom navigation for primary actions on mobile.

#### 6.1 BottomNav Component
- [x] Fixed position at bottom of screen
- [x] Safe area insets for notched devices
- [x] 5 navigation items: Waves, Contacts, Groups, Search, Profile
- [x] Active indicator with theme color (amber)

#### 6.2 Navigation Integration
- [x] Replace top nav buttons on mobile
- [x] Maintain current view state
- [x] Badge indicators (unread count, pending requests)
- [x] Smooth transition when switching views

#### 6.3 Haptic Feedback
- [x] Vibrate on navigation tap (if supported)
- [x] Use `navigator.vibrate(10)` for subtle feedback
- [x] Check for API support before calling

---

### Phase 7: Report System - Backend
**Priority:** Medium | **Status:** Complete ✓

Backend API for content reporting (schema already exists).

#### 7.1 Report Endpoints
- [x] `POST /api/reports` - Create new report
  - Body: `{ type: 'message'|'wave'|'user', targetId, reason, details? }`
  - Reasons: 'spam', 'harassment', 'inappropriate', 'other'
  - Rate limit: 10 reports per hour per user
- [x] `GET /api/reports` - Get user's own submitted reports
- [x] `GET /api/admin/reports` - Get all reports (admin only)
  - Query params: `?status=pending|resolved|dismissed&limit=50&offset=0`
- [x] `POST /api/admin/reports/:id/resolve` - Resolve report (admin only)
  - Body: `{ resolution: 'warning_issued'|'content_removed'|'user_banned'|'no_action', notes? }`
- [x] `POST /api/admin/reports/:id/dismiss` - Dismiss report (admin only)
  - Body: `{ reason? }`

#### 7.2 Database Methods (SQLite)
- [x] `createReport(reporterId, type, targetId, reason, details)`
- [x] `getReportsByUser(userId)`
- [x] `getPendingReports(limit, offset)`
- [x] `getReportsByStatus(status, limit, offset)`
- [x] `resolveReport(reportId, resolution, resolvedBy, notes)`
- [x] `dismissReport(reportId, resolvedBy, reason)`
- [x] `getReportById(reportId)`

#### 7.3 Database Methods (JSON fallback)
- [x] Implement same methods for JSON database class
- [x] Create `reports.json` file storage
- [x] Match SQLite method signatures

#### 7.4 Notification Integration
- [x] Send WebSocket event to reporter when report is resolved
- [x] Event: `report_resolved` with status and resolution
- [x] Optional: Push notification for report resolution

---

### Phase 8: Report System - Frontend
**Priority:** Medium | **Status:** Complete ✓

User interface for reporting and admin dashboard.

#### 8.1 Report Modal Component
- [x] `ReportModal` component for reporting content
- [x] Props: `type`, `targetId`, `targetPreview`, `onClose`, `onSubmit`
- [x] Radio buttons for reason selection
- [x] Optional details textarea (max 500 chars)
- [x] Submit and Cancel buttons

#### 8.2 Report Triggers
- [x] Message actions: Add "Report" option to message menu (⋮)
- [x] Wave header: Add "Report Wave" option to wave menu
- [x] User profile modal: Add "Report User" button
- [x] Confirmation toast on successful report submission

#### 8.3 Admin Reports Dashboard
- [x] New `ReportsAdminPanel` component in ProfileSettings
- [x] Visible only to admin users
- [x] Tabs: Pending | Resolved | Dismissed
- [x] Report card shows: type, target preview, reason, reporter, timestamp
- [x] Actions: View Target | Resolve | Dismiss
- [x] Resolution modal with action selection and notes

#### 8.4 My Reports View
- [x] Section in ProfileSettings: "My Reports"
- [x] List of submitted reports with status
- [x] Status badge: Pending (amber) | Resolved (green) | Dismissed (gray)
- [x] Resolution notes visible when resolved

---

### Phase 9: Report System - Moderation Actions
**Priority:** Medium | **Status:** Complete ✓

Actions admins can take when resolving reports.

#### 9.1 Warning System
- [x] Add `warnings` table/field to user schema
- [x] `POST /api/admin/users/:id/warn` - Issue warning
- [x] Warning history tracked with timestamp and reason
- [x] User notification: "You have received a warning from moderators"

#### 9.2 Content Removal
- [x] Soft-delete message with reason: "Removed by moderator"
- [x] Keep message in DB but show "[Content removed by moderator]"
- [x] Log moderation action with admin ID and reason

#### 9.3 Audit Log
- [x] `moderation_log` table for tracking all moderation actions
- [x] Fields: `id`, `admin_id`, `action_type`, `target_type`, `target_id`, `reason`, `created_at`
- [x] Admin can view moderation history for any user
- [x] Export audit log for compliance (CSV format)

---

### Phase 10: API Documentation - Structure
**Priority:** Low-Medium | **Status:** Complete ✓

Create comprehensive API documentation.

#### 10.1 Documentation Format
- [x] Create `docs/API.md` as main documentation file
- [x] OpenAPI 3.0 spec file: `docs/openapi.yaml` (optional)
- [x] Organize by resource: Auth, Users, Waves, Messages, Groups, etc.
- [x] Include curl examples for each endpoint

#### 10.2 Documentation Sections
- [x] Overview and base URL
- [x] Authentication (JWT)
  - Login flow
  - Token format and expiration
  - Authorization header format
- [x] Rate limiting policies
  - Global limits
  - Endpoint-specific limits
- [x] Error responses
  - Standard error format: `{ error: string }`
  - Common HTTP status codes

---

### Phase 11: API Documentation - Endpoints
**Priority:** Low-Medium | **Status:** Complete ✓

Document all REST API endpoints.

#### 11.1 Authentication Endpoints
- [x] `POST /api/register` - Create account
- [x] `POST /api/login` - Authenticate and get token
- [x] `POST /api/logout` - Invalidate token (if implemented)
- [x] `GET /api/auth/me` - Get current user

#### 11.2 User Endpoints
- [x] `GET /api/users` - List/search users
- [x] `GET /api/users/:id` - Get user by ID
- [x] `GET /api/users/:id/profile` - Get public profile
- [x] `PUT /api/profile` - Update own profile
- [x] `PUT /api/profile/preferences` - Update preferences
- [x] `POST /api/profile/avatar` - Upload avatar
- [x] `DELETE /api/profile/avatar` - Remove avatar

#### 11.3 Wave Endpoints
- [x] `GET /api/waves` - List user's waves
- [x] `GET /api/waves/archived` - List archived waves
- [x] `POST /api/waves` - Create wave
- [x] `GET /api/waves/:id` - Get wave with messages
- [x] `PUT /api/waves/:id` - Update wave
- [x] `DELETE /api/waves/:id` - Delete wave
- [x] `POST /api/waves/:id/archive` - Archive wave
- [x] `POST /api/waves/:id/unarchive` - Unarchive wave
- [x] `GET /api/waves/:id/messages` - Get paginated messages

#### 11.4 Message Endpoints
- [x] `POST /api/waves/:id/messages` - Create message
- [x] `PUT /api/messages/:id` - Edit message
- [x] `DELETE /api/messages/:id` - Delete message
- [x] `POST /api/messages/:id/read` - Mark as read
- [x] `POST /api/messages/:id/react` - Add reaction

#### 11.5 Contact Endpoints
- [x] `GET /api/contacts` - List contacts
- [x] `POST /api/contacts/request` - Send contact request
- [x] `GET /api/contacts/requests` - Get pending requests
- [x] `POST /api/contacts/requests/:id/accept` - Accept request
- [x] `POST /api/contacts/requests/:id/decline` - Decline request

#### 11.6 Group Endpoints
- [x] `GET /api/groups` - List user's groups
- [x] `POST /api/groups` - Create group
- [x] `GET /api/groups/:id` - Get group details
- [x] `PUT /api/groups/:id` - Update group
- [x] `DELETE /api/groups/:id` - Delete group
- [x] `POST /api/groups/:id/invite` - Invite users
- [x] `POST /api/groups/:id/leave` - Leave group

#### 11.7 Search & Utility Endpoints
- [x] `GET /api/search` - Full-text search messages
- [x] `GET /api/gifs/search` - Search GIFs
- [x] `GET /api/gifs/trending` - Trending GIFs
- [x] `POST /api/uploads` - Upload image

#### 11.8 WebSocket Documentation
- [x] Connection URL and authentication
- [x] Event types (inbound and outbound)
- [x] Message format examples
- [x] Reconnection handling

---

## Testing Checklist

### Threading Features
- [x] Collapse/expand individual threads
- [x] Collapse all / expand all
- [x] Thread state persists across page reload
- [x] Jump to parent scrolls correctly
- [x] Visual connectors render at all depths
- [x] Mobile thread display is readable

### Mobile Gestures
- [x] Swipe right to go back works on all views
- [x] Pull-to-refresh triggers data reload
- [x] Bottom nav switches views correctly
- [x] Badges update in real-time
- [x] Haptic feedback works on supported devices
- [x] Gestures don't conflict with scrolling

### Report System
- [x] Users can report messages, waves, users
- [x] Rate limiting prevents spam reports
- [x] Admins can view pending reports
- [x] Resolve/dismiss updates report status
- [x] Reporter receives notification on resolution
- [x] Moderation actions are logged

### API Documentation
- [x] All endpoints documented with request/response
- [x] Authentication flow clearly explained
- [x] Error codes documented
- [x] Examples work when copied
- [x] Rate limits documented per endpoint

---

## Migration Notes

### Database Changes
- `warnings` table for user warning history (new)
- `moderation_log` table for audit trail (new)
- No changes to existing tables

### Breaking Changes
- None anticipated

### Environment Variables
- No new environment variables required

---

## Version History Reference

| Version | Focus | Key Features |
|---------|-------|--------------|
| v1.8.1 | Bug Fixes | Embed fixes, push notification fixes |
| v1.8.0 | Profiles & Scale | Avatar upload, bio, SQLite, push, FTS |
| v1.7.0 | Social Features | Contact requests, group invites, block/mute, GIFs |
| v1.6.0 | PWA | Service worker, offline mode, install prompt |
| v1.5.0 | Real-time | Reactions, typing indicators, notifications |

---

*This document will be updated as implementation progresses.*
