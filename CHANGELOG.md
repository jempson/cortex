# Changelog

All notable changes to Cortex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
