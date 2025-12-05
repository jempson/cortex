# Changelog

All notable changes to Cortex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2025-12-05

### Added

#### Progressive Web App (PWA) Support
Cortex is now a fully installable Progressive Web App that works on Android and iOS devices.

- **Web App Manifest** (`client/public/manifest.json`)
  - App name, description, and theme colors
  - Display mode: standalone (full-screen app experience)
  - Orientation: portrait-primary
  - App shortcuts for quick actions
  - Categories: communication, social

- **Service Worker** (`client/public/sw.js`)
  - Stale-while-revalidate caching strategy for static assets
  - Network-first for API calls (real-time data)
  - Automatic cache cleanup on version updates
  - Push notification handlers (ready for future use)
  - Notification click handling with deep linking

- **App Icons** (`client/public/icons/`)
  - 13 PNG icons for all device sizes (16px to 512px)
  - Maskable icons for Android adaptive icons (192px, 512px)
  - Favicon support (16px, 32px)
  - Icon generator script (`generate-icons.cjs`) for regeneration

- **InstallPrompt Component**
  - Custom "Install Cortex" banner
  - Appears after 2nd visit or 30 seconds
  - 7-day dismissal cooldown
  - Detects if already installed (standalone mode)
  - Handles `beforeinstallprompt` event

- **OfflineIndicator Component**
  - Orange banner when network connection lost
  - Real-time online/offline detection
  - Auto-hides when connection restored

- **iOS PWA Support**
  - `apple-mobile-web-app-capable` meta tag
  - `apple-mobile-web-app-status-bar-style` (black-translucent)
  - `apple-touch-icon` links for home screen icons

- **Service Worker Registration**
  - Automatic registration on page load
  - Hourly update checks
  - Update notification handling

#### Read Receipts Display
Visual UI for the per-message read tracking system (backend from v1.4.0).

- **Participant Read Status Bar**
  - Shows all wave participants in header
  - Green ✓ indicator for users who've read latest message
  - Gray ○ indicator for users with unread messages
  - Hover tooltip shows read/unread status

- **Per-Message Read Receipts**
  - Expandable "Seen by X people" section on each message
  - Lists all users who have read that specific message
  - Green badges with user names
  - Collapses by default to save space

- **Mark All Read Button**
  - One-click button to mark all unread messages as read
  - Appears only when unread messages exist
  - Shows success toast with count of messages marked
  - Real-time update of read status

### Changed

- **index.html** - Added PWA meta tags, manifest link, iOS support tags, favicon links
- **CortexApp.jsx** - Added service worker registration, InstallPrompt, OfflineIndicator components
- **Version** - Updated to 1.6.0 across all files

### Technical Details

#### Bundle Size
- **Gzipped**: 65.03 KB (slight increase from 63.57 KB due to PWA components)
- **Uncompressed**: 226.20 KB
- **Build Time**: ~646ms

#### PWA Compliance
- Passes Lighthouse PWA audit requirements
- Installable on Android Chrome, iOS Safari, Desktop Chrome/Edge
- Offline shell accessible when network unavailable
- Service worker registered and controlling page

#### Files Added
```
client/public/
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── icons/
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-180x180.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    ├── icon-512x512.png
    ├── icon-maskable-192x192.png
    ├── icon-maskable-512x512.png
    └── generate-icons.cjs
```

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Service Worker** - Will register automatically on first visit
- **Icons** - Generated using canvas library, can be regenerated with `node generate-icons.cjs`

### Known Limitations
- **iOS Push Notifications** - Not supported (iOS PWA limitation)
- **iOS Background Sync** - Not supported (iOS PWA limitation)
- **HTTPS Required** - Service workers require HTTPS in production

---

## [1.5.0] - 2025-12-04

### Added

#### Typing Indicators
- **Real-time Typing Detection** - Shows "User is typing..." when users compose messages
- **Throttled WebSocket Events** - Sends typing events max once every 2 seconds to reduce bandwidth
- **Auto-Clear** - Typing indicators disappear after 5 seconds of inactivity
- **Multi-User Support** - Displays multiple typing users: "Alice, Bob are typing..."
- **Wave-Specific** - Only shows typing users in the currently viewed wave
- **Backend WebSocket Handler** - `user_typing` event broadcasts to other wave participants
- **Frontend State Management** - `typingUsers` state with automatic timeout cleanup

#### Message Reactions
- **Emoji Reactions** - Users can react to messages with emojis (👍 ❤️ 😂 🎉 🤔 👏)
- **Quick Reaction Picker** - Click emoji button to show picker overlay
- **Toggle Reactions** - Click same emoji again to remove your reaction
- **Reaction Counts** - Shows count and list of users who reacted
- **Real-time Updates** - WebSocket broadcasts `message_reacted` events
- **Backend API** - `POST /api/messages/:id/react` endpoint toggles reactions
- **Database Schema** - `reactions: { emoji: [userId, ...] }` structure
- **Persistent** - Reactions saved to messages.json file

#### Message Search
- **Full-Text Search** - Search across all accessible waves by message content
- **Security** - Only searches waves user has access to
- **Search Modal** - Overlay UI with search input and results list
- **Result Highlighting** - Search terms highlighted in yellow in results
- **Jump to Message** - Click result to navigate to wave and message
- **Result Metadata** - Shows wave name, author, date for each result
- **Backend Search Method** - `searchMessages(query, filters)` with case-insensitive matching
- **API Endpoint** - `GET /api/search?q=query` returns filtered results

#### Desktop Notifications
- **Browser Notifications** - Native desktop notifications for new messages
- **Permission Request** - Automatic permission request 2 seconds after login
- **Background Detection** - Shows notifications when tab is backgrounded
- **Different Wave Detection** - Shows notifications for messages in other waves
- **Click to Focus** - Clicking notification focuses browser tab and opens wave
- **Notification Grouping** - Groups notifications by wave using tag
- **Auto-Dismiss** - Notifications auto-close after browser default timeout
- **Smart Filtering** - No notifications for your own messages
- **No Backend Changes** - Pure frontend using browser Notification API

### Fixed

#### WebSocket Stability
- **Ref-Based Callback** - Uses `onMessageRef.current` to prevent reconnection on state changes
- **Auto-Reconnect** - Reconnects after 3 seconds if connection drops
- **Heartbeat Ping** - Sends ping every 30 seconds to keep connection alive
- **Intentional Close Tracking** - Prevents reconnect attempts when deliberately closed
- **Better Logging** - Enhanced console logging for connection state debugging

#### Scroll Position Issues
- **Race Condition Fix** - Only saves scroll position if not already pending restoration
- **requestAnimationFrame** - Uses RAF instead of setTimeout(0) for smoother restoration
- **User Actions Preserved** - Posting messages or adding reactions no longer jumps scroll
- **WebSocket Reload Guard** - Prevents scroll position overwrite during rapid reloads
- **Smart Scrolling** - Root messages scroll to bottom, replies preserve position

#### Thread Nesting on Mobile
- **Single-Source Indentation** - Removed double-counting of margins
- **Linear Indentation** - Each level adds exactly 12px (mobile) or 24px (desktop)
- **Removed Message Margin** - Eliminated `marginLeft` from message container
- **Consistent Children Margin** - Uses only children container for indentation
- **Better Deep Thread Support** - 10 levels = 120px (32% of 375px screen, vs 156px before)

#### Real-Time Message Updates
- **waveId Extraction** - Fixed extraction from nested WebSocket event data
- **Multiple Fallbacks** - Tries `data.waveId`, `data.data.wave_id`, `data.data.waveId`
- **Reload Trigger** - Properly triggers wave reload when current wave receives events
- **Viewer Updates** - Watchers now see new messages immediately in real-time

### Changed

#### Backend Updates (server/server.js)
- **WebSocket Handler Enhancement** - Added `user_typing` event handler (Lines 1679-1713)
- **Search Method** - Added `searchMessages(query, filters)` to Database class (Lines 984-1034)
- **Search Endpoint** - Added `GET /api/search` with permission filtering (Lines 1647-1675)
- **React Endpoint** - Message reaction endpoint already existed, no changes needed
- **Version Banner** - Updated to v1.5.0

#### Frontend Updates (CortexApp.jsx)
- **useWebSocket Rewrite** - Complete rewrite with ref-based callbacks (Lines 138-225)
- **SearchModal Component** - New component for search UI (Lines 917-1055)
- **Typing Indicator Display** - Shows below messages, above compose box (Lines 1486-1498)
- **Typing Detection** - handleTyping() function with throttling (Lines 1367-1378)
- **Desktop Notification Handler** - In handleWSMessage WebSocket handler (Lines 2631-2658)
- **Permission Request** - useEffect triggers 2s after mount (Lines 2717-2732)
- **Thread Indentation Fix** - Removed dual marginLeft (Line 530, 750)
- **Version Display** - Updated to v1.5.0

### Technical Details

#### Bundle Size
- **Gzipped**: 63.57 KB (increased from 61.60 KB in v1.4.0)
- **Uncompressed**: 220.30 KB
- **Build Time**: ~575-607ms (excellent)

#### Performance
- **No Breaking Changes** - All v1.4.x features remain fully functional
- **WebSocket Optimized** - Reduced reconnection frequency, added heartbeat
- **Throttled Events** - Typing events throttled to reduce bandwidth
- **Debounced Search** - 300ms debounce on search input
- **Result Limits** - Search capped at 100 results

#### Code Quality
- **Syntax Validated** - Both client and server pass all checks
- **Build Successful** - Vite builds without errors or warnings
- **Clean Implementation** - Follows existing patterns and style
- **Enhanced Logging** - Better debugging for WebSocket and scroll issues

### Developer Notes

#### Feature Implementation Order
1. Typing Indicators (3-4 hours)
2. Message Reactions (4-6 hours, already existed)
3. Message Search (8-12 hours)
4. Desktop Notifications (4-6 hours)
5. Bug Fixes (2-3 hours)

#### Git Commits
- Typing indicators implementation
- Real-time message updates fix
- Message search backend and frontend
- Desktop notifications Phase 1
- WebSocket stability fixes
- Scroll position race condition fix
- Thread nesting indentation fix
- Version updates

#### Testing Performed
- Multi-browser testing (Chrome, Firefox, Edge)
- Multi-user real-time testing
- Mobile responsive testing (< 768px)
- Deep thread nesting (10+ levels)
- WebSocket stability over extended sessions
- Desktop notification permissions and display
- Search with various queries and filters

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Automatic Reaction Init** - Old messages get empty reactions object on first access
- **No Schema Changes** - Reactions field already existed in message schema
- **No Data Loss** - All existing data works immediately

---

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
