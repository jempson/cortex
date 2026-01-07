# Changelog

All notable changes to Farhold (formerly Cortex) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-01-07

### Added

#### Wave List Organization with Custom Categories
Complete wave organization system allowing users to create custom categories to organize their waves, with pinned waves, drag-and-drop functionality, collapsible groups, and group-level notifications.

**Features:**
- **Custom Categories**: Create user-defined categories (e.g., "Work", "Personal", "Projects") with custom names and colors
- **Pinned Waves**: Pin important waves to keep them always visible at the top of the list
- **Drag-and-Drop**: Move waves between categories using drag-and-drop (desktop) or long-press menu (mobile)
- **Collapsible Groups**: Collapse/expand categories to manage screen space, with state persisting across sessions
- **Group-Level Notifications**: See unread count badges at both wave and category level
- **Visual Organization**: Color-coded categories with wave counts and unread indicators
- **Per-User System**: Each user has their own category structure independent of other participants

**User Experience:**
```
┌─────────────────────────────────────┐
│ WAVES            [MANAGE] [📦] [+NEW]│
├─────────────────────────────────────┤
│ ⭐ PINNED (3)                    [▼] │
│   📌 Important Wave            (2)   │
│   📌 Quick Access              (1)   │
├─────────────────────────────────────┤
│ 💼 WORK (5)                      [▼] │
│   • Team Standup              (12)  │
│   • Project Alpha             (3)   │
├─────────────────────────────────────┤
│ 👥 PERSONAL (2)                  [▼] │
│   • Family Chat               (5)   │
├─────────────────────────────────────┤
│ 📂 UNCATEGORIZED (1)             [▼] │
│   • Random Wave               (0)   │
└─────────────────────────────────────┘
```

**Technical Implementation:**

**Database Schema** (`server/schema.sql`):
- **New Table: `wave_categories`** - Stores user-defined categories
  - Fields: id, user_id, name, color, sort_order, collapsed, created_at, updated_at
  - UNIQUE constraint on (user_id, name) prevents duplicate category names
  - Indexed on user_id and sort_order for fast lookups

- **New Table: `wave_category_assignments`** - Maps waves to categories per user
  - Fields: user_id, wave_id, category_id (nullable), assigned_at
  - PRIMARY KEY (user_id, wave_id) ensures one category per wave
  - category_id NULL represents uncategorized waves
  - Indexed on user_id, category_id, and wave_id

- **Enhanced: `wave_participants`** table
  - Added `pinned INTEGER DEFAULT 0` column for wave pinning
  - Indexed on (user_id, pinned) for fast pinned wave queries

**Database Methods** (`server/database-sqlite.js`):
- `getCategoriesForUser(userId)` - Fetch all categories with wave counts and unread counts
- `createCategory(userId, data)` - Create new category with validation
- `updateCategory(categoryId, userId, data)` - Update category name, color, or collapsed state
- `deleteCategory(categoryId, userId)` - Delete category with safety checks
- `reorderCategories(userId, categoryOrders)` - Bulk update category sort order
- `assignWaveToCategory(waveId, userId, categoryId)` - Assign wave to category
- `getWaveCategoryAssignment(waveId, userId)` - Get current category assignment
- `pinWaveForUser(waveId, userId, pinned)` - Pin/unpin wave for user
- Modified `getWavesForUser()` - Enhanced to JOIN category data and pinned status

**API Endpoints** (`server/server.js`):
- `GET /api/wave-categories` - List user's categories
- `POST /api/wave-categories` - Create new category
- `PUT /api/wave-categories/:id` - Update category (name, color, collapsed state)
- `DELETE /api/wave-categories/:id` - Delete category
- `PUT /api/wave-categories/reorder` - Reorder categories
- `PUT /api/waves/:waveId/category` - Assign wave to category
- `PUT /api/waves/:waveId/pin` - Pin/unpin wave

**WebSocket Events** (Real-time Updates):
- `category_created` - New category created
- `category_updated` - Category modified
- `category_deleted` - Category removed
- `categories_reordered` - Category order changed
- `wave_category_changed` - Wave moved between categories
- `wave_pinned_changed` - Wave pinned/unpinned

**Client Components** (`client/FarholdApp.jsx`):
- **WaveCategoryList** (lines 3822-4069) - Main category list component
  - Groups waves by category with pinned section
  - Renders collapsible sections for each category
  - Implements drag-and-drop handlers
  - Calculates group-level unread counts
  - Shows "Uncategorized" section for waves without category

- **CategoryManagementModal** (lines 5360-5595) - Category CRUD interface
  - Create new categories with name and color selection
  - Rename/delete existing categories
  - View wave counts and unread counts per category
  - Color picker with Farhold theme colors
  - Inline editing with Enter/Escape keyboard shortcuts

- **Enhanced WaveList** (lines 4071-4213) - Updated to use categories
  - Conditionally renders WaveCategoryList if categories exist
  - Falls back to flat list if no categories
  - Added "Manage Categories" button
  - Passes all category handlers to child components

- **State Management** (lines 16626-16627, 16751-16813) - Category state
  - `waveCategories` state for storing user's categories
  - `categoryManagementOpen` state for modal visibility
  - `loadCategories()` - Fetch categories from API
  - `handleCategoryToggle()` - Toggle collapse state with optimistic UI update
  - `handleWaveMove()` - Move wave between categories
  - `handleWavePin()` - Pin/unpin wave with immediate local state update

- **WebSocket Integration** (lines 16913-16922) - Real-time category updates
  - Handles all category-related WebSocket events
  - Automatically reloads categories and waves on changes
  - Maintains sync across multiple clients

**Migration** (`server/database-sqlite.js` lines 1207-1299):
- Automated migration runs on server startup via `applySchemaUpdates()`
- Creates all tables and indexes automatically
- Creates default "General" category for all existing users
- Backward compatible - runs safely on existing databases
- Idempotent - checks if tables exist before running

**How It Works:**
1. User creates categories via "Manage Categories" button
2. Waves can be dragged into categories or moved via API
3. Categories are rendered as collapsible sections with CollapsibleSection component
4. Pinned waves always appear at top regardless of category
5. Category collapsed state persists in database per user
6. Real-time WebSocket events keep all clients synchronized
7. Archive toggle works across all categories

**Design Decisions:**
- **Per-User Categories**: Each user organizes their wave list independently
- **One Category Per Wave**: Simplifies mental model and UI (no multi-assignment)
- **Pinned Section**: Always visible at top, spans all categories
- **Uncategorized Fallback**: Waves without category go to "Uncategorized" section
- **Server-Side State**: Collapsed state stored in database for cross-device persistence
- **Archive Compatibility**: Archive toggle applies across all categories
- **Federation Safe**: Category data is local-only, doesn't affect cross-server waves

**Files Modified:**
- `server/schema.sql` - Added wave_categories, wave_category_assignments tables, pinned column
- `server/database-sqlite.js` - Added 9 category methods, modified getWavesForUser (lines 3771-4003, 3222-3302)
- `server/server.js` - Added 7 API endpoints with WebSocket broadcasts (lines 11295-11576)
- `client/FarholdApp.jsx` - Added WaveCategoryList, CategoryManagementModal, state management
- `server/package.json` - Version 2.2.0
- `client/package.json` - Version 2.2.0

**Migration:**
- Automatic migration on server startup via `applySchemaUpdates()` method
- Checks if `wave_categories` table exists before running
- Zero downtime deployment
- Backward compatible with existing waves
- Default "General" category auto-created for all users
- Migration integrated in `database-sqlite.js` lines 1207-1299

## [2.1.1] - 2026-01-06

### Added

#### Breadcrumb Navigation for Burst Waves
One-level breadcrumb navigation that shows the parent wave when viewing a burst wave, making it easy to navigate back to context.

**Features:**
- **Clickable Parent Link**: Parent wave title displayed as clickable link above current wave title
- **One-Level Back**: Shows immediate parent only (burst of burst shows nearest parent, not full chain)
- **Access Controlled**: Breadcrumb only appears if user has permission to view parent wave
- **Visual Design**: Teal accent color with arrow (→) separator matching Farhold aesthetic
- **Smart Display**: Long titles truncated with ellipsis (max 200px), tooltip shows full title on hover
- **Responsive**: Works on mobile and desktop layouts

**User Experience:**
```
[← Back] [Parent Wave Title →]
         Current Burst Wave Title
         2 participants • 5 pings
```

**Technical Implementation:**
- **Server Enhancement** (`server/server.js`):
  - GET `/api/waves/:id` endpoint now includes `parent_wave` field for burst waves
  - Returns `{ id, title }` of parent wave if `wave.brokenOutFrom` exists
  - Access control enforced - only returns parent info if user can access it
  - Added lines 10746-10756, 10795

- **Client Component** (`client/FarholdApp.jsx`):
  - Breadcrumb UI added to WaveView header component
  - Positioned above wave title with smaller, muted styling
  - Uses existing `onNavigateToWave` callback for navigation
  - Conditional rendering based on `waveData.parent_wave` presence
  - Added lines 7341-7373

**How It Works:**
1. When loading a wave, server checks if `brokenOutFrom` exists
2. If yes, fetches parent wave and verifies user access
3. Returns parent wave ID and title in API response
4. Client displays breadcrumb link above wave title
5. Click navigates to parent using standard wave navigation

**Files Modified:**
- `server/server.js` - Enhanced `/api/waves/:id` endpoint with parent wave lookup
- `client/FarholdApp.jsx` - Added breadcrumb UI component to WaveView header

**Migration:**
- No database changes required (uses existing `broken_out_from` column)
- Backward compatible with all existing waves
- Zero downtime deployment

#### Production Bot Configuration
Added production bot integration settings to `.env.example` for automated release announcements from development to production environments.

**Environment Variables Added:**
```bash
# Production Bot Integration (v2.1.0)
FARHOLD_PROD_URL=https://app.farhold.com
FARHOLD_PROD_BOT_KEY=fh_bot_your-key-here
FARHOLD_PROD_UPDATES_WAVE_ID=your-wave-id-here
```

**Use Case:**
Enables development environments to post automated release announcements to production Farhold servers using bot API keys.

**Files Modified:**
- `server/.env.example` - Added production bot configuration section

### Fixed

#### Burst Waves from Crew Waves Not Appearing in Wave List
Fixed critical bug where burst waves created from crew/group waves weren't visible in the wave list for participants who weren't crew members.

**Problem:**
When a ping was burst out of a crew wave:
1. The new burst wave inherited `privacy='crew'` from the parent wave
2. The new burst wave inherited `crew_id` from the parent wave
3. Participants were added to `wave_participants` table
4. **But**: The wave list query only checks crew membership for crew waves, not `wave_participants`
5. **Result**: Non-crew participants couldn't see the burst wave in their wave list

**Root Cause:**
The `getWavesForUser()` query has this logic:
```sql
WHERE (
  w.privacy = 'public'
  OR (w.privacy = 'private' AND wp.user_id IS NOT NULL)
  OR ((w.privacy = 'crew' OR w.privacy = 'group') AND w.crew_id IN (...crew IDs...))
)
```

For crew waves, it checks crew membership via `crew_id`, not the `wave_participants` table. So burst waves with crew privacy weren't visible to non-crew participants even though they were explicitly added as participants.

**Solution:**
Burst waves are now **always created as private waves** with explicit participants, regardless of parent wave privacy. This makes conceptual sense - bursts are focused subset conversations, not crew-wide discussions.

**Code Change** (`server/database-sqlite.js:3542-3543`):
```javascript
// Before:
privacy: originalWave.privacy || 'private',  // Inherited crew privacy
crew_id: originalWave.groupId || null,       // Inherited crew ID

// After:
privacy: 'private', // Always private for burst waves (v2.1.1 fix)
crew_id: null,      // No crew_id - use explicit participants instead
```

**Impact:**
- ✅ Burst waves now appear in wave list for all invited participants
- ✅ Conceptually correct: bursts are participant-based, not crew-based
- ✅ Consistent behavior across all parent wave types (private, public, crew)
- ✅ No breaking changes to existing functionality
- ✅ Only affects newly created burst waves

**Migration:**
- No database migration required
- Existing burst waves retain their current privacy settings
- Only new burst waves use the updated logic

**Files Modified:**
- `server/database-sqlite.js` - Lines 3542-3543 in `breakoutDroplet()` method

### Technical Details

**API Response Enhancement:**
```javascript
// GET /api/waves/:id response now includes:
{
  ...wave,
  parent_wave: {
    id: "wave-abc123",
    title: "Original Wave Title"
  } // null if not a burst wave or user can't access parent
}
```

**Breadcrumb Component Styling:**
- Font size: 0.7rem (smaller than wave title)
- Color: `var(--text-dim)` for text, `var(--accent-teal)` for link
- Max width: 200px with ellipsis overflow
- Gap: 6px between elements
- Margin bottom: 4px from wave title

**Performance:**
- Single additional DB query per wave view (only if burst wave)
- Query uses existing index on `waves.id`
- Access control check uses existing `canAccessWave()` method
- Minimal impact on page load time

### Benefits

**User Experience:**
- Easier navigation between related waves
- Clear visual hierarchy of burst wave relationships
- One-click return to context without browser back button
- Better understanding of wave conversation flow

**Technical:**
- Backward compatible with existing waves
- No database migrations required
- Uses existing wave relationship data
- Clean separation of concerns (server/client)

---

## [2.1.0] - 2026-01-06

### Added

#### Bot/Webhook System
Comprehensive automated posting system allowing external services and scripts to post into Farhold waves with full E2EE support.

**Authentication:**
- **API Key System**: Static token-based authentication with `fh_bot_` prefix
- **256-bit Security**: API keys generated with `crypto.randomBytes(32)` (64 hex characters)
- **SHA-256 Hashing**: Keys hashed before storage, never stored in plaintext
- **One-Time Display**: API keys shown once at creation with copy-to-clipboard functionality
- **Bearer Token Format**: Standard `Authorization: Bearer fh_bot_...` header authentication

**Bot Management (Admin-Only):**
- **BotsAdminPanel Component**: Full admin UI for bot lifecycle management
- **Create Bot Modal**: Name, description, and optional webhook configuration
- **Bot Details Modal**: Manage bot information, permissions, and wave access
- **API Key Display Modal**: Secure one-time display of newly generated keys
- **Regenerate Keys**: Invalidate old keys and generate new ones
- **Status Management**: Activate, suspend, or delete bots
- **Statistics Display**: Track total pings, API calls, and wave access per bot

**Bot API Endpoints** (require bot authentication):
- `POST /api/bot/ping` - Create ping in wave (returns bot-formatted ping data)
- `GET /api/bot/waves` - List all accessible waves
- `GET /api/bot/waves/:id` - Get wave details with recent pings
- `GET /api/bot/waves/:id/key` - Get encrypted wave key for E2EE waves

**Admin Bot Management Endpoints** (require ADMIN role):
- `POST /api/admin/bots` - Create bot (returns API key once)
- `GET /api/admin/bots` - List all bots with stats
- `GET /api/admin/bots/:id` - Get bot details
- `PATCH /api/admin/bots/:id` - Update bot (name, description, status)
- `DELETE /api/admin/bots/:id` - Delete bot (cascade deletion)
- `POST /api/admin/bots/:id/regenerate` - Regenerate API key
- `POST /api/admin/bots/:id/permissions` - Grant wave access (can_post, can_read)
- `DELETE /api/admin/bots/:id/permissions/:waveId` - Revoke wave access

**Webhook Integration:**
- `POST /api/webhooks/:botId/:webhookSecret` - Receive external webhooks
- **Secret Validation**: Each bot has unique webhook secret for authentication
- **50KB Payload Limit**: Prevents abuse from oversized webhook payloads
- **Permission Enforcement**: Webhooks respect bot wave permissions
- **URL Display**: Webhook endpoint URL shown in bot details modal

**End-to-End Encryption Support:**
- **Bot Keypairs**: ECDH P-384 keypairs generated for each bot
- **Private Key Encryption**: Bot private keys encrypted with master bot key (`BOT_MASTER_KEY` env var)
- **Wave Key Distribution**: Bots receive encrypted wave keys via `bot_wave_keys` table
- **E2EE Posting**: Bots can post encrypted pings to encrypted waves
- **Key Version Support**: Multi-version key support for reading after rotation
- **Automatic Key Distribution**: Wave permissions automatically distribute encryption keys

**Security Features:**
- **Rate Limiting**: 300 requests/minute per bot (5x higher than user limit)
- **Content Sanitization**: All bot-posted content sanitized with `sanitizeMessage()`
- **Permission Checks**: Wave-level access control (can_post, can_read)
- **Activity Logging**: All bot operations logged to `activity_log` table
- **Status Validation**: Only active bots can use API (suspended/revoked bots blocked)
- **Webhook Secret**: Cryptographically secure webhook authentication
- **Admin-Only Management**: Only admins can create/modify/delete bots

**Bot Ping Format:**
Bot pings use special author format to distinguish from user pings:
```javascript
{
  authorId: "bot:{botId}",
  sender_name: "[Bot] {botName}",
  sender_handle: "{botName-slugified}",
  sender_avatar: "🤖",
  isBot: true,
  botId: "{botId}"
}
```

**Database Schema:**
Three new tables added:
- `bots` - Bot identity, API key hash, stats, E2EE keypair, webhook secret
- `bot_permissions` - Wave-level access control per bot
- `bot_wave_keys` - Encrypted wave keys for E2EE support

**Database Methods:**
- `createBot()` - Create new bot with API key hash
- `getBot()` - Get bot by ID
- `findBotByApiKeyHash()` - Find bot by hashed API key
- `getAllBots()` - List all bots
- `updateBot()` - Update bot metadata
- `deleteBot()` - Delete bot (cascade to permissions and keys)
- `regenerateBotApiKey()` - Regenerate API key hash
- `updateBotStats()` - Track API calls and ping counts
- `grantBotPermission()` - Grant wave access
- `revokeBotPermission()` - Revoke wave access
- `botCanAccessWave()` - Check bot permission
- `getBotPermissions()` - Get all bot permissions
- `getBotWaves()` - Get accessible waves for bot
- `createBotWaveKey()` - Store encrypted wave key
- `getBotWaveKey()` - Retrieve encrypted wave key

**Server Middleware:**
- `authenticateBotToken()` - JWT-style bot authentication middleware
- `botLimiter` - Rate limiter for bot endpoints (300 req/min)
- `hashToken()` - SHA-256 token hashing utility

**UI Components:**
- **BotsAdminPanel** (542 lines) - Main bot management interface
  - Bot list with stats display
  - Create bot modal with webhook toggle
  - API key display modal with copy button
  - Status management actions
  - Responsive mobile layout
- **BotDetailsModal** (309 lines) - Bot configuration interface
  - Bot information display
  - Webhook endpoint URL with copy button
  - Wave permissions list
  - Add/revoke wave permissions modal
  - Permission statistics
  - Mobile-optimized layout

**Admin UI Integration:**
- Bot management panel added to Profile Settings admin section
- Accessible via "Bots" toggle in admin panel
- Same collapsible pattern as other admin panels
- Restricted to admin role users only

**Example Usage:**
```bash
# Create Bot (Admin)
curl -X POST https://farhold.com/api/admin/bots \
  -H "Authorization: Bearer {admin-jwt}" \
  -H "Content-Type: application/json" \
  -d '{"name": "GitHub Bot", "description": "Posts commit notifications", "enableWebhook": true}'

# Post Ping (Bot)
curl -X POST https://farhold.com/api/bot/ping \
  -H "Authorization: Bearer fh_bot_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"waveId": "wave-xyz", "content": "Build passed! ✅"}'

# Webhook (External)
curl -X POST https://farhold.com/api/webhooks/{botId}/{secret} \
  -H "Content-Type: application/json" \
  -d '{"waveId": "wave-xyz", "content": "Alert: Server down!"}'
```

### Technical Details

**Files Modified:**
- `server/schema.sql` - Added 3 new tables (bots, bot_permissions, bot_wave_keys)
- `server/database-sqlite.js` - Added bot migration and 15+ database methods
- `server/server.js` - Added bot middleware, admin endpoints, bot API, webhook receiver
- `client/FarholdApp.jsx` - Added BotsAdminPanel and BotDetailsModal components

**Migration:**
- Auto-migration on server startup via `applySchemaUpdates()`
- Creates tables if not exist (no manual migration required)
- Backward compatible with existing waves/pings

**Environment Variables:**
```bash
BOT_MASTER_KEY=your-secret-key  # Optional: For encrypting bot private keys
```

**Rate Limits:**
- Bot API endpoints: 300 requests/minute
- User API endpoints: 60 requests/minute (unchanged)

**Activity Logging:**
All bot operations logged with `bot:{botId}` as user_id:
- Bot creation/deletion
- API key regeneration
- Permission grants/revokes
- Ping creation
- Webhook posts

### Security Considerations

**What's Protected:**
- API keys never stored in plaintext (SHA-256 hashed)
- API keys displayed once at creation only
- Bot operations require active status (suspended bots blocked)
- Wave permissions enforced before all operations
- Content sanitized before storage and broadcast
- Webhook secrets cryptographically secure
- Rate limiting prevents abuse

**Best Practices:**
- Store API keys securely (environment variables, secrets managers)
- Regenerate keys if compromised
- Grant minimum necessary permissions per bot
- Monitor bot activity via activity log
- Suspend bots instead of deleting (preserves audit trail)
- Use webhooks only when necessary (API keys preferred)

### Known Limitations

**v2.1.0 Scope:**
- Bots are local-only (no federation support)
- Bots cannot create waves (permission flag exists for future)
- E2EE wave key distribution requires manual permission grant (auto-distribution coming in v2.1.1)
- No bot analytics dashboard (statistics shown in bot list only)
- No scheduled pings (cron-like feature planned for v2.2.0)

**Future Enhancements (v2.2.0+):**
- Bot wave creation permission
- Bot analytics dashboard
- Advanced webhook formats (Slack, Discord, GitHub)
- Bot command parsing (e.g., `/bot-name command`)
- Scheduled pings (cron-like)
- Federation bot support

---

## [2.0.5] - 2026-01-05

### Added

#### Configurable Session Expiration
Session duration is now configurable at login/registration to balance security and convenience.

**Security Enhancement:**
- **Default session duration reduced from 7 days to 24 hours** for improved security
- Sessions now have hard expiration times that cannot be bypassed, even if browser tabs remain open
- Prevents indefinite session persistence from forgotten open tabs

**User-Selectable Duration:**
- Users can choose session duration at login/register:
  - **24 hours** (recommended, default)
  - **7 days** (convenience)
  - **30 days** (maximum convenience)
- Selection preserved through MFA verification flow
- Session duration selector added to login and registration forms

**Session Management UI:**
- Active sessions now display expiration countdown ("Expires in 23h")
- New `formatExpirationDate()` helper formats future dates with time-remaining countdown
- Sessions show "Expired" if already past expiration time

**Technical Implementation:**
- Added `SESSION_DURATIONS` constant with allowed durations (24h, 7d, 30d)
- Added `getSessionDuration()` validation function on server
- Updated `/api/auth/login` endpoint to accept `sessionDuration` parameter
- Updated `/api/auth/register` endpoint to accept `sessionDuration` parameter
- Updated `/api/auth/mfa/verify` endpoint to use stored `sessionDuration` from challenge
- Fixed `/api/auth/sessions` endpoint to include `expiresAt` field in response
- Database migration adds `session_duration TEXT DEFAULT '24h'` to `mfa_challenges` table
- Updated `schema.sql` for fresh installations
- Existing sessions continue to work until their original expiration

**Files Changed:**
- `server/server.js` - Session duration validation and endpoint updates
- `server/database-sqlite.js` - Database migration and `createMfaChallenge()` update
- `server/schema.sql` - Schema update for new installations
- `server/.env.example` - Updated JWT_EXPIRES_IN default and documentation
- `client/FarholdApp.jsx` - Session duration selector UI and auth function updates

---

## [2.0.3] - 2026-01-04

### Added

#### Crawl Bar: Pause & Drag Interaction
Interactive crawl bar that allows users to pause and manually scroll through content.

**Features:**
- **Pause on hover/touch**: Animation pauses when user hovers (desktop) or touches (mobile)
- **Drag to scroll**: Click and drag left/right to manually scroll through content
  - Drag right → see earlier content (scroll backwards)
  - Drag left → see later content (scroll forwards)
  - Seamless wrapping at content boundaries
- **Auto-resume**: Animation resumes from current position after 3 seconds of no interaction
- **Visual indicators**:
  - Amber border glow when paused
  - Pause icon (⏸) displayed in corner when paused
  - Drag arrows (◀ ▶) shown while actively dragging
  - Cursor changes to grab/grabbing during interaction

**Technical:**
- Uses Web Animations API `currentTime` property for precise position control
- Pixel-to-time conversion for smooth drag-to-scroll mapping
- Global mouse event listeners for drag beyond component bounds
- Touch event support for mobile devices
- User-select disabled to prevent text selection during drag

---

## [2.0.2] - 2026-01-03

### Added

#### Firefly Easter Eggs (Phase 1)
Firefly-themed messages woven throughout the UI to reinforce brand identity. The Firefly aesthetic is always on as part of the core Farhold experience.

**Rotating Footer Taglines** (30-second interval)
- "Can't stop the signal"
- "Keep flying"
- "We're still flying, that's something"
- "You can't take the sky from me"
- "Find a crew, find a job, keep flying"
- "Privacy isn't a feature, it's a foundation"
- "The signal is strong"
- "Shiny"
- "I aim to misbehave"
- "We have done the impossible, and that makes us mighty"

**Success Messages** (toast notifications)
| Action | Message |
|--------|---------|
| Generic success | "Shiny!" |
| Ping sent | "Signal's away" |
| Wave created | "New signal on the cortex" |
| Wave updated | "Signal adjusted" |
| Wave deleted | "Signal terminated" |
| Wave archived | "Signal archived" |
| Wave restored | "Signal restored" |
| Link copied | "Coordinates locked" |
| Contact added | "New crew member aboard" |
| Contact removed | "Crew member departed" |
| Contact request sent | "Hail sent" |
| Contact request accepted | "Welcome aboard!" |
| Joined crew | "You're in the air" |
| Left crew | "You've jumped ship" |
| Crew created | "Crew assembled" |
| Crew deleted | "Crew disbanded" |
| Invitation sent | "Invitation transmitted" |
| Profile updated | "Ship's log updated" |
| Password changed | "New codes set" |
| Shared | "Signal boosted" |

**Empty State Messages**
| Context | Message |
|---------|---------|
| No waves | "Cortex is quiet" |
| No waves (with CTA) | "Cortex is quiet. Start a signal?" |
| No notifications | "Ain't heard a peep" |
| No pings | "Nothing but black out here" |
| No search results | "Nothing in the black matches that" |
| No contacts | "No crew yet" |
| No crews | "Flying solo" |
| No GIFs | "No captures found" |
| No users found | "No souls out here" |
| No alerts | "All quiet on the cortex" |
| No sessions | "No active docking bays" |

**Loading State Messages**
| Context | Message |
|---------|---------|
| Generic loading | "Spinning up..." |
| Searching | "Scanning the cortex..." |
| Sending | "Transmitting..." |
| Connecting | "Awaiting docking clearance..." |
| Encrypting | "Running encryption protocols..." |
| Uploading | "Uploading cargo..." |

**Confirmation Button Labels**
| Action | Button Text |
|--------|-------------|
| Delete | "Let's be bad guys" |
| Destructive confirm | "I aim to misbehave" |
| Cancel | "Belay that" |
| Leave | "Jump ship" |
| Confirm | "Do the job" |

**Error Prefix**
- Non-technical errors prefixed with "Gorram it!"

#### Technical
- **New `client/messages.js` Module**: Centralized Firefly-themed messages
  - `SUCCESS` - Success toast message constants
  - `ERROR_PREFIX` - Error message prefix ("Gorram it!")
  - `EMPTY` - Empty state message constants
  - `LOADING` - Loading state message constants
  - `CONFIRM` - Confirmation button label constants
  - `TAGLINES` - Footer tagline array
  - `getRandomTagline()` - Returns random tagline for footer rotation
  - `formatError(message)` - Wraps message with Firefly error prefix

### Changed
- Footer now displays rotating taglines instead of static wave/crew/contact counts
- ~25 UI locations updated to use themed messages from `messages.js`

---

## [2.0.1] - 2026-01-03

### Fixed

#### Search Navigation
- **Search now scrolls to correct ping**: Clicking a search result now navigates to the wave AND scrolls to the specific message with amber highlight animation
  - Added `setScrollToDropletId(result.id)` to `handleSearchResultClick`
  - Leverages existing WaveView scroll-to mechanism that was previously unused by search

#### Authentication & Session Handling
- **Crew waves no longer force logout**: Accessing a crew wave you don't have permission for now shows an error instead of logging you out
  - Changed `useAPI` hook to only call `logout()` on 401 (authentication failure), not 403 (authorization denied)
- **PWA sessions persist through network errors**: App no longer clears your session when `/auth/me` fails due to network issues
  - Only clears session on 401 (invalid/expired token)
  - Network errors and server errors now preserve cached session data
  - Prevents frustrating re-login prompts when server is temporarily unreachable

#### Mobile UI
- **Added search button to mobile header**: Mobile users can now access the search feature
  - Search 🔍 and notification 🔔 buttons added to right side of mobile header
  - Previously these were desktop-only

---

## [1.19.5] - 2025-12-26

### Added

#### Tenor GIF Support
- **Configurable GIF Provider**: Server-side configuration to use GIPHY, Tenor, or both
  - `GIF_PROVIDER` environment variable: `giphy`, `tenor`, or `both`
  - `TENOR_API_KEY` for Tenor API v2 integration
- **Dynamic Attribution**: GIF search modal shows "Powered by Tenor" or "Powered by GIPHY" based on active provider
- **Tenor API v2**: Full support for Tenor's search and featured/trending endpoints

#### TikTok Thumbnails
- **Video Previews**: TikTok links now display video thumbnails via oEmbed API
- **Rich Link Cards**: Styled cards show thumbnail, author name, and video title
- **Click to Open**: Cards link to TikTok in new tab (embed.js incompatible with React)

### Fixed

#### Critical: Unread Count Bug
- **Wave List Not Updating**: Fixed bug where unread counts were always 0 for users without blocked/muted users
  - Root cause: SQL `NOT IN (NULL)` returns NULL instead of TRUE, excluding all rows
  - Fix: Conditional SQL clauses only added when blocked/muted arrays have items
- **Immediate Updates**: Wave list now correctly refreshes after marking droplets as read

#### GIF Embedding
- **Tenor CDN URLs**: Fixed direct Tenor/GIPHY CDN URLs (media.tenor.com, i.giphy.com) being properly embedded as images
- **Tenor Short URLs**: Fixed tenor.com/xxx.gif URLs being incorrectly treated as images (they're redirect pages)
- **oEmbed Public Access**: Made `/api/embeds/oembed` endpoint public (no auth required) for embed previews
- **Trending GIFs**: Fixed GIF modal to always load fresh trending when opened (removed stale data check)

#### TikTok oEmbed
- **Field Normalization**: Fixed mismatch between server response fields (`thumbnail`, `author`) and client expectations (`thumbnail_url`, `author_name`)

### Configuration

New environment variables in `.env`:
```
TENOR_API_KEY=your-tenor-api-key
GIF_PROVIDER=tenor  # Options: giphy, tenor, both
```

---

## [1.19.4] - 2025-12-26

### Improved

#### E2EE Unlock Modal Text
- **Clearer password prompt**: On PWA reopen, now shows simple "Enter your password to unlock your encrypted messages" instead of confusing "Original Encryption Passphrase"
- **Migration notice only when needed**: The "Original Encryption Passphrase" message now only appears when auto-unlock actually fails due to password mismatch (for users who set up E2EE before password-based encryption)
- **Better labels**: Changed "Current Password" to just "Password" with placeholder "Enter your login password"
- Added `passwordMismatch` state to distinguish between failed unlock vs no pending password

---

## [1.19.3] - 2025-12-26

### Fixed

#### E2EE Unlock on PWA Reopen
- **Fixed stuck spinner on PWA reopen**: When reopening the PWA or refreshing the page, the app was stuck on "Preparing encryption..." spinner
  - Root cause: Auto-unlock logic only triggered when there was a pending password from login
  - On page refresh or PWA reopen, there's no pending password, so auto-unlock never triggered
  - Fix: If passphrase is needed but no pending password exists, immediately show the unlock modal
- Service worker version updated to v1.19.3

---

## [1.19.2] - 2025-12-26

### Fixed

#### PWA Caching Issue
- **Network-First for HTML**: Service worker now uses network-first strategy for HTML/navigation requests
  - Fixes spinning circle issue where stale cached HTML referenced non-existent JS bundles
  - PWA now always fetches fresh HTML on launch, with cache fallback only when offline
- **Cache-First for Hashed Assets**: JS/CSS files with content hashes still use cache-first (safe because immutable)
- **Emergency Recovery**: `?clear=1` URL parameter clears all localStorage, sessionStorage, IndexedDB, service workers, and caches

### Technical Details
- Service worker version updated to v1.19.2
- Navigation requests (`request.mode === 'navigate'`) always hit network first
- Hashed asset detection via regex: `/\.[a-f0-9]{8,}\.(js|css)$/i`

---

## [1.19.1] - 2025-12-26

### Added

#### Wave Participant Management
- **Invite Participants**: INVITE button in participant panel allows wave creators to add contacts
  - `POST /api/waves/:id/participants` endpoint
  - InviteToWaveModal component with contact search
  - E2EE key distribution for new participants via `distributeKeyToParticipant()`
- **Remove Participants**: Wave creators can remove participants with REMOVE button
  - `DELETE /api/waves/:id/participants/:userId` endpoint
  - Automatic wave key rotation when participant is removed
- **Leave Wave**: All participants can leave waves with LEAVE button
  - Uses same DELETE endpoint as removal
  - WebSocket events: `participant_added`, `participant_removed`, `added_to_wave`, `removed_from_wave`

#### Stale Data Recovery
- **Clear Data Button**: Login screen shows "Clear all data" button for recovery from broken cached state
- **Version Check**: Automatic data clearing when major version changes (e.g., 1.18.x → 1.19.x)
- **URL Parameter Recovery**: `?clear=1` clears all cached data on any page load
  - Clears: localStorage, sessionStorage, IndexedDB, service worker registrations, caches
  - Redirects to clean URL after clearing

### Database
- Added `removeWaveParticipant()` method to SQLite database class

---

## [1.19.0] - 2025-12-24

### Added

#### End-to-End Encryption (E2EE)
- **Always-On Encryption**: All new waves are encrypted by default when E2EE is enabled
- **User Key Management**: ECDH P-384 keypairs generated per user, protected by passphrase
- **Passphrase-Based Key Protection**: Private keys encrypted with PBKDF2-derived keys (600k iterations)
- **Recovery System**: Generated recovery keys for backup access (24-character Base32 format)
- **Per-Wave Keys**: Each wave has its own AES-256-GCM symmetric key
- **Key Distribution**: Wave keys encrypted for each participant using ECDH key exchange
- **Key Rotation**: Automatic key rotation when participants are removed from waves
- **Legacy Wave Support**: Unencrypted waves from before E2EE show "Legacy Wave" notice

#### E2EE Client Components
- **E2EE Setup Modal**: Two-step setup flow (passphrase → save recovery key)
- **Passphrase Unlock**: Login requires passphrase to decrypt private key
- **Recovery Flow**: Recover access using recovery key if main passphrase forgotten
- **E2EE Context Provider**: React context for encryption state and operations
- **Wave Key Cache**: LRU cache (100 keys) for decrypted wave keys

#### E2EE API Endpoints
- `GET /api/e2ee/status` - Check E2EE status for current user
- `POST /api/e2ee/keys/register` - Register user's encrypted keypair
- `GET /api/e2ee/keys/me` - Get own encrypted private key (for new device setup)
- `GET /api/e2ee/keys/user/:id` - Get another user's public key
- `POST /api/e2ee/recovery/setup` - Configure recovery key
- `GET /api/e2ee/recovery` - Get recovery data (encrypted key + salt)
- `GET /api/waves/:id/key` - Get encrypted wave key for current user
- `POST /api/waves/:id/key/rotate` - Rotate wave key (participant removal)
- `GET /api/waves/:id/keys/all` - Get all key versions for wave (key rotation)

#### Database Schema
- New tables: `user_encryption_keys`, `wave_encryption_keys`, `wave_key_metadata`, `user_recovery_keys`
- New fields on `droplets`: `encrypted`, `nonce`, `key_version`
- New field on `waves`: `encrypted`

#### Cryptographic Implementation
- **Web Crypto API**: Native browser cryptography (no external JS libraries)
- **ECDH P-384**: Asymmetric key exchange for user and wave key distribution
- **AES-256-GCM**: Authenticated encryption for droplet content and private key wrapping
- **PBKDF2-SHA256**: Password-based key derivation (600k iterations)
- **Random Nonces**: Unique 12-byte nonces for each encrypted droplet

### Security Notes

#### What E2EE Protects
- **Server Breach**: Server only stores ciphertext, never plaintext
- **Database Leak**: Encrypted content is meaningless without keys
- **MITM**: Content encrypted before transmission

#### What E2EE Does NOT Protect
- **Compromised Client Device**: Keys exist in memory during session
- **Malicious Client Code**: Could capture plaintext before encryption
- **Metadata**: Who talks to whom is still visible to server

### Technical Details

- Keys never leave client unencrypted (private keys wrapped before upload)
- Wave keys cached with LRU eviction (max 100 keys)
- Multi-version key support for reading old messages after rotation
- Encrypted droplets show "[Unable to decrypt]" on key mismatch
- Push notifications show "Encrypted message" for encrypted content
- Client-side search deferred (would require IndexedDB implementation)

---

## [1.18.1] - 2025-12-24

### Fixed

- **MFA Status Display**: Fixed MFA status showing "Not Set Up" when TOTP or Email MFA was actually enabled
  - Root cause: Property name mismatch between `getMfaSettings()` return value (camelCase) and endpoint check (snake_case)
  - `settings.totp_enabled` → `settings.totpEnabled`
  - `settings.email_mfa_enabled` → `settings.emailMfaEnabled`

### Security

- **Email MFA Disable Verification**: Disabling Email MFA now requires email verification code
  - Previously only required password (inconsistent with TOTP disable which requires TOTP code)
  - New two-step flow: enter password → receive email code → confirm disable
  - Prevents unauthorized MFA disable if password is compromised

### Improved

- **MFA Code Input Clarity**: Changed confusing "TOTP Code" placeholder to clear instructions
  - Added label: "Enter the 6-digit code from your authenticator app:"
  - Applies to TOTP disable and recovery code regeneration

## [1.18.0] - 2025-12-24

### Added

#### Session Management
- View all active sessions with device info, IP addresses, and timestamps
- Revoke individual sessions or logout all other devices at once
- Sessions automatically cleaned up when they expire
- Current session clearly marked in the session list

#### GDPR Compliance
- **Download My Data**: Export all personal data as JSON (profile, droplets, wave participation, contacts, and more)
- **Delete Account**: Permanently delete your account with proper data handling
  - Droplets preserved but attributed to "[Deleted User]"
  - Waves transferred to other participants
  - Empty waves and groups automatically cleaned up

### Security
- HSTS (HTTP Strict Transport Security) headers enabled
- Optional HTTPS enforcement via `ENFORCE_HTTPS=true`
- Stricter CORS defaults - `ALLOWED_ORIGINS` required in production
- Session tokens hashed before storage (never stored in plain text)

### Improved
- Logout now properly revokes session on the server
- Better error handling throughout security features
- Rate limiting on account management endpoints

## [1.15.0] - 2025-12-17

### Added

#### Crawl Bar - Live News Ticker
- **Crawl Bar Component**: Horizontal scrolling ticker displaying stocks, weather, and news
- **CSS Animation**: Smooth continuous scroll with configurable speeds (slow/normal/fast)
- **Pause on Interaction**: Ticker pauses on mouse hover or touch
- **Gradient Fade**: Visual fade effect at left/right edges
- **Theme Integration**: Full CSS variable support for all themes
- **Responsive Design**: Adapts height and font size for mobile devices

#### Stock Market Integration (Finnhub)
- **Real-time Quotes**: Current price, change amount, and percent change
- **Multiple Symbols**: Admin-configurable list of stock symbols
- **Visual Indicators**: Green/red arrows for positive/negative changes
- **60-Second Cache**: Respects Finnhub's rate limits (60 calls/min free tier)

#### Weather Integration (OpenWeatherMap)
- **Current Conditions**: Temperature, weather description, location name
- **Weather Alerts**: Severe weather alerts displayed with warning icons
- **IP Geolocation**: Automatic location detection via ip-api.com (free)
- **User Override**: Users can set custom location in preferences
- **Server Default**: Admin-configured fallback location
- **5-Minute Cache**: ~288 calls/day within free tier limits

#### News Integration (NewsAPI.org + GNews.io)
- **Breaking Headlines**: Top news stories from multiple sources
- **Dual Provider Support**: NewsAPI as primary, GNews as fallback
- **3-Minute Cache**: Balances freshness with rate limit compliance
- **Graceful Fallback**: Automatically switches to backup provider on failure

#### User Preferences
- **Enable/Disable Toggle**: Users can hide the crawl bar entirely
- **Section Toggles**: Choose which content types to display (Stocks/Weather/News)
- **Scroll Speed**: Slow (80s), Normal (50s), or Fast (30s) full-width scroll
- **Location Override**: Set custom location name for weather data
- **Preferences API**: `PUT /api/profile/crawl-preferences`

#### Admin Configuration
- **Server-wide Settings**: Global crawl bar configuration for all users
- **Stock Symbols**: Configure which stocks to display (comma-separated)
- **Default Location**: Fallback for IP geolocation failures
- **Feature Toggles**: Enable/disable stocks, weather, or news globally
- **Refresh Intervals**: Configure cache TTL for each data type
- **API Key Status**: Dashboard shows which APIs are configured
- **Admin Endpoints**: `GET/PUT /api/admin/crawl/config`

#### API Endpoints
- `GET /api/crawl/stocks` - Get stock quotes for configured symbols
- `GET /api/crawl/weather` - Get weather for user's location
- `GET /api/crawl/news` - Get news headlines
- `GET /api/crawl/all` - Combined endpoint (recommended for efficiency)
- `PUT /api/profile/crawl-preferences` - Update user crawl settings
- `GET /api/admin/crawl/config` - Get server crawl configuration (admin)
- `PUT /api/admin/crawl/config` - Update server crawl configuration (admin)

### Database
- Added `crawl_config` table - Server-wide crawl bar configuration (singleton)
- Added `crawl_cache` table - External API response caching with TTL

### Environment Variables
- `FINNHUB_API_KEY` - Finnhub API key for stock quotes
- `OPENWEATHERMAP_API_KEY` - OpenWeatherMap API key for weather data
- `NEWSAPI_KEY` - NewsAPI.org API key for news (primary)
- `GNEWS_API_KEY` - GNews.io API key for news (backup)
- `IPINFO_TOKEN` - IPinfo.io token for enhanced geolocation (optional)
- `RATE_LIMIT_CRAWL_MAX` - Crawl endpoint rate limit (default: 60/min)

### Dependencies
- No new dependencies required (uses native `fetch` for API calls)

### Notes
- Crawl bar only displays sections with configured API keys
- No API keys = crawl bar hidden completely (graceful degradation)
- NewsAPI.org free tier only works on localhost (use GNews for production)
- OpenWeatherMap keys take up to 2 hours to activate after creation
- IP geolocation uses ip-api.com (free, no key required, 45 req/min)

---

## [1.14.0] - 2025-12-17

### Added

#### Security Enhancements - Password Recovery
- **Email Service**: Configurable email delivery supporting SMTP, SendGrid, and Mailgun
- **Password Reset Flow**: Forgot password, token verification, and reset endpoints
- **Admin Password Reset**: Admins can reset user passwords with optional email notification
- **Force Logout**: Admin endpoint to force user logout
- **Account Lockout Persistence**: Failed login attempts now stored in database (survives restarts)

#### Password Reset Endpoints
- `POST /api/auth/forgot-password` - Request password reset (rate-limited)
- `GET /api/auth/reset-password/:token` - Verify reset token
- `POST /api/auth/reset-password` - Complete password reset
- `POST /api/auth/clear-password-change` - Clear forced password change flag

#### Admin Security Endpoints
- `POST /api/admin/users/:id/reset-password` - Admin reset user password
- `POST /api/admin/users/:id/force-logout` - Force user logout

#### Multi-Factor Authentication (MFA)
- **TOTP Support**: Setup authenticator apps (Google Authenticator, Authy, etc.) with QR code
- **Email MFA**: Email-based 6-digit verification codes as alternative to TOTP
- **Recovery Codes**: 10 one-time backup codes generated on MFA setup
- **MFA Challenge Flow**: Login returns challenge when MFA is enabled, requiring second factor

#### MFA Endpoints
- `GET /api/auth/mfa/status` - Get MFA status for current user
- `POST /api/auth/mfa/totp/setup` - Begin TOTP setup (returns QR code)
- `POST /api/auth/mfa/totp/verify` - Verify TOTP code and enable
- `POST /api/auth/mfa/totp/disable` - Disable TOTP (requires password + code)
- `POST /api/auth/mfa/email/enable` - Begin email MFA setup
- `POST /api/auth/mfa/email/verify-setup` - Verify email code and enable
- `POST /api/auth/mfa/email/disable` - Disable email MFA
- `POST /api/auth/mfa/recovery/regenerate` - Generate new recovery codes
- `POST /api/auth/mfa/send-email-code` - Send email code during login
- `POST /api/auth/mfa/verify` - Verify MFA during login

#### Client UI
- Forgot password link on login screen
- Password reset page with token validation
- Confirm password field for registration
- MFA challenge screen during login (TOTP, email, or recovery code)
- MFA setup panel in Profile Settings (Two-Factor Authentication section)
- QR code display for authenticator app setup
- Recovery codes display with copy-to-clipboard functionality

### Security
- JWT_SECRET now required in production (server exits if not set)
- CORS production warning when ALLOWED_ORIGINS not configured
- Avatar URL validation to prevent path traversal attacks

### Database
- Added `account_lockouts` table for persistent rate limiting
- Added `password_reset_tokens` table for secure token storage
- Added `require_password_change` flag to users table
- Added `user_mfa` table for MFA settings (TOTP secret, email MFA, recovery codes)
- Added `mfa_challenges` table for login challenge tracking
- Added `activity_log` table for security and content event tracking

#### Activity Tracking & Audit Log
- **Activity Log System**: Track security and content events for auditing
- **90-Day Retention**: Automatic cleanup of old activity log entries
- **Admin Activity Panel**: View and filter activity log in admin dashboard
- **Action Types Tracked**: Logins, failed logins, registrations, password changes, MFA events, admin actions, wave/droplet operations

#### Activity Log Endpoints
- `GET /api/admin/activity-log` - Get paginated activity log with filters
- `GET /api/admin/activity-stats` - Get activity statistics
- `GET /api/admin/activity-log/user/:userId` - Get activity for specific user

#### Encryption at Rest
- **SQLCipher Support**: Database encryption using SQLCipher (optional)
- **Environment Variables**: `DB_ENCRYPTION_KEY` to enable database encryption
- **Production Mode**: `REQUIRE_DB_ENCRYPTION=true` to enforce encryption in production
- **Backward Compatible**: Works with existing better-sqlite3 (encryption disabled)

### Dependencies
- Added `otplib` for TOTP generation/verification
- Added `qrcode` for QR code generation

---

## [1.13.0] - 2025-12-15

### Added

#### Server-to-Server Federation
- **Federation Architecture**: Multiple Cortex servers can now exchange waves and droplets
- **HTTP Signature Authentication**: RSA-SHA256 signed requests for secure server-to-server communication
- **Federated User Format**: Reference users on other servers with `@handle@server.com`
- **Origin-Authoritative Model**: Origin server is the source of truth for wave data
- **Manual Trust Model**: Admin-managed allowlist of trusted federation partners

#### Federation Endpoints
- `GET /api/federation/identity` - Public endpoint for server's public key
- `POST /api/federation/inbox` - Receive signed messages from other servers
- `GET /api/federation/users/:handle` - Get local user profile for remote servers
- `GET /api/users/resolve/:identifier` - Resolve local or federated users

#### Admin Federation Management
- `GET /api/admin/federation/status` - Get federation status and configuration
- `GET /api/admin/federation/nodes` - List trusted federation nodes
- `POST /api/admin/federation/nodes` - Add trusted node
- `DELETE /api/admin/federation/nodes/:id` - Remove trusted node
- `POST /api/admin/federation/nodes/:id/handshake` - Exchange public keys with node

#### Database Schema (New Tables)
- `server_identity` - Server's RSA keypair (singleton)
- `federation_nodes` - Trusted federation partners
- `remote_users` - Cached profiles from federated servers
- `remote_droplets` - Cached droplets from federated waves
- `wave_federation` - Wave-to-node relationships
- `federation_queue` - Outbound message queue with retry logic
- `federation_inbox_log` - Inbound message deduplication

#### Message Queue System
- Optimistic send with automatic queue fallback on failure
- Exponential backoff retries: 1min → 5min → 25min → 2hr → 10hr
- Background processor runs every 30 seconds
- Auto-cleanup of old messages after 7 days

#### Client Updates
- **FederationAdminPanel**: New admin panel in Profile Settings for managing federation
- Generate and view server identity
- Add/remove trusted nodes
- Initiate handshakes with remote servers
- View node status and connection health

### Changed

- Server startup banner now shows federation status
- Updated environment variables section with `FEDERATION_ENABLED` and `FEDERATION_NODE_NAME`

### Technical Details

- RSA-2048 keypair generation for server identity
- HTTP Signature draft-cavage-http-signatures-12 compatible
- Rate limiting: 500 requests/minute per federated node
- Idempotent inbox processing prevents duplicate message handling

---

## [1.12.1] - 2025-12-12

### Fixed

#### SQLite Media Embedding
- **GIF/Image Embedding**: Fixed media embedding not working in SQLite mode
- Added missing `sanitizeMessage()` and `detectAndEmbedMedia()` calls to SQLite database class
- GIPHY URLs now properly converted to embedded `<img>` tags in SQLite mode

---

## [1.12.0] - 2025-12-11

### Added

#### CSS Variable Theme System
- **Complete Theme Refactor**: All colors now use CSS custom properties
- **Theme Application**: `data-theme` attribute on `<html>` element
- **Flash Prevention**: Inline script applies theme before React loads
- **Theme Persistence**: Dedicated `cortex_theme` localStorage key

#### 5 Themes Available
- **Firefly** (default): Classic green terminal with enhanced mobile contrast
- **High Contrast**: Maximum readability with brighter text and borders
- **AMOLED Black**: True #000 background for OLED battery savings
- **Light Mode**: Light background for daytime use
- **Ocean Blue**: Blue-tinted dark alternative

### Fixed

#### Push Notifications
- **VAPID Key Change Detection**: Auto re-subscribe if server VAPID key changes
- **SQLite Constraint Migration**: Auto-migration for `push_subscriptions` UNIQUE constraint
- **Toggle State Management**: Proper React state for push notification toggle
- **Error Feedback**: Detailed failure messages in UI toast

#### Database
- **Preferences Persistence**: Fixed preferences not persisting in SQLite mode
- Added `updateUserPreferences()` method to SQLite class

### Technical Details

- CSS variable categories: Background, Text, Borders, Accents, Glows, Overlays
- Mobile readability: Droplet content uses `--text-primary` for maximum contrast
- Server validates themes against: firefly, highContrast, amoled, light, ocean

---

## [1.11.0] - 2025-12-11

### Added

#### Notification System
- **In-App Notifications**: Comprehensive notification system for all activity types
- **Notification Types**: @mentions, replies to your droplets, wave activity, ripples
- **Smart Routing**: Notifications suppressed when viewing source wave
- **Real-Time Updates**: WebSocket-powered instant notifications

#### Enhanced Wave List Badges
- **Color-Coded Indicators**: Visual distinction for notification types
- **Amber (@)**: Direct @mentions
- **Green (↩)**: Replies to your droplets
- **Purple (◈)**: Ripple activity
- **Orange**: General wave activity

#### Notification Preferences
- Per-type control in Profile Settings
- Options: Always, App Closed Only, Never
- "Suppress while focused" toggle

### Changed

#### API Deprecation
- Legacy `/api/messages/*` endpoints now return deprecation headers
- Migration guide added to docs/API.md
- Sunset date: March 1, 2026

#### Component Updates
- Internal terminology alignment (ThreadedMessage → Droplet)
- Auto-focus preference for Focus View on droplet click

### Fixed

- Notification badges now clear when droplets are read
- Push notification re-enable after disabling
- Droplet creation endpoint uses POST /droplets

---

## [1.10.0] - 2025-12-10

### Added

#### Droplets Architecture
- **Terminology Rename**: Messages → Droplets throughout codebase
- Database tables renamed: `messages` → `droplets`, `messages_fts` → `droplets_fts`
- API endpoints support both `/droplets` and `/messages` (backward compatibility)
- WebSocket events renamed with legacy aliases maintained

#### Focus View
- **Wave-Like Context**: View any droplet with replies as its own wave
- **Desktop Entry**: "⤢ FOCUS" button on droplets with children
- **Mobile Entry**: Tap droplet content area, swipe right to go back
- **Breadcrumb Navigation**: Clickable path items for navigation
- **Navigation Stack**: Push/pop model for nested focus levels

#### Threading Depth Limit
- 3-level inline limit in WaveView
- "FOCUS TO REPLY" button at depth limit
- Visual depth indicator banner
- Focus View allows unlimited depth

#### Ripple System
- **Spin Off Threads**: Create new waves from droplet trees
- **RippleModal**: Title input and participant selection
- **RippledLinkCard**: Visual "Rippled to wave..." link in original
- **Nested Ripples**: `breakout_chain` field tracks lineage
- **API Endpoint**: `POST /api/droplets/:id/ripple`

### Changed

#### Database Schema
- New fields: `droplets.broken_out_to`, `droplets.original_wave_id`
- New fields: `waves.root_droplet_id`, `waves.broken_out_from`, `waves.breakout_chain`
- Auto-migration for existing SQLite databases

---

## [1.9.0] - 2025-12-10

### Added

#### Message Threading Improvements
- **Collapse/Expand**: Thread collapse with localStorage persistence per wave
- **Bulk Actions**: "Collapse All" / "Expand All" buttons in wave toolbar
- **Jump to Parent**: "↑ Parent" button with highlight animation
- **Depth Indicator**: Visual indicator for deeply nested messages (depth > 3)
- **Thread Connectors**: Dashed lines showing reply hierarchy

#### Mobile Gesture Enhancements
- **useSwipeGesture Hook**: Swipe navigation support
- **usePullToRefresh Hook**: Pull-to-refresh with PullIndicator component
- **BottomNav Component**: 5-tab navigation (Waves, Contacts, Groups, Search, Profile)
- **Haptic Feedback**: 10ms vibration on navigation
- **Badge Indicators**: Unread counts and pending requests

#### Report System
- **Report Types**: Spam, harassment, inappropriate content, other
- **Rate Limiting**: 10 reports per hour per user
- **ReportModal**: Reason selection and details textarea
- **Admin Dashboard**: ReportsAdminPanel with tabs (Pending/Resolved/Dismissed)
- **Resolution Options**: Warning Issued, Content Removed, User Banned, No Action
- **MyReportsPanel**: Users can view their submitted reports
- **WebSocket Event**: `report_resolved` notifies reporters

#### Moderation Actions
- **Warning System**: `warnings` table with `createWarning()` method
- **Moderation Audit Log**: `moderation_log` table
- **Admin Endpoints**: Warn user, get warnings, get moderation log
- **WebSocket Event**: `warning_received` notifies warned users

#### API Documentation
- Comprehensive `docs/API.md` with 70+ endpoints documented
- WebSocket events documentation
- Rate limiting and error response formats
- curl examples for key endpoints

---

## [1.8.1] - 2025-12-09

### Fixed

#### Video Embeds
- **YouTube/Spotify/Vimeo Working**: Fixed embed detection to not skip video URLs in anchor tags (only skip image URLs)
- **TikTok Link Card**: Replaced TikTok oEmbed with styled link card (TikTok's embed.js incompatible with React, caused infinite re-renders)
- **Duplicate Image Embeds**: Fixed duplicate embeds by tracking already-embedded image URLs

#### Push Notifications
- **Unique Notification Tags**: Each message now has unique tag (`cortex-msg-{messageId}`) to prevent notification replacement
- **Visibility Filtering**: Push notifications only show when app is not in foreground (client-side `clients.matchAll()` check)
- **iOS Warning**: Added console warning about iOS push notification limitations in PWA

### Added

#### Version Display
- **Footer Version**: Added "v1.8.1" version indicator to application footer
- **Tighter Footer**: Reduced footer padding for cleaner appearance

### Technical Details

- TikTok styled link card with gradient background and platform branding
- Service worker visibility check using `clients.matchAll({ type: 'window', includeUncontrolled: true })`
- Push payload includes `messageId` for unique notification tags

---

## [1.8.0] - 2025-12-08

### Added

#### Scroll-to-Unread Navigation
- **Auto-Scroll on Wave Open**: When clicking into a wave, automatically scrolls to first unread message
- **Fallback to Bottom**: If all messages are read, scrolls to the most recent message at the bottom
- **Smooth Animation**: Uses `scrollIntoView({ behavior: 'smooth', block: 'start' })` for pleasant UX
- **One-Time Scroll**: Only triggers on initial wave load, not on WebSocket updates or refreshes

### Fixed

#### WaveView Crash Fix
- **Missing useMemo Import**: Fixed `ReferenceError: useMemo is not defined` that caused blank screen when clicking into waves
- **ErrorBoundary Added**: New error boundary component catches render errors and displays them gracefully instead of blank screen
- **Defensive Null Checks**: Added fallback defaults for `waveData.messages`, `all_messages`, and `participants`

### Changed

#### Header Cleanup
- **Removed Desktop Status**: API/WebSocket connection status removed from desktop header (now in footer only)

### Technical Details

#### Implementation
- `data-message-id` attribute added to message elements for scroll targeting
- `hasScrolledToUnreadRef` ref prevents duplicate scrolling
- 100ms setTimeout ensures DOM is ready before scroll calculation

---

## [1.6.1] - 2025-12-05

### Changed

#### Mobile Header Improvements
- **App Icon Logo** - Replaced "CORTEX" text with PWA app icon (32x32px) on mobile screens
- **Compact Layout** - Removed header wrapping, flex-centered navigation buttons
- **Reduced Padding** - Tighter spacing on mobile (8px vs 10px)
- **Smaller Nav Buttons** - Reduced font size and padding for better fit

#### Logout Button Relocated
- **Moved to Settings** - Logout button removed from header, added to Profile Settings
- **New SESSION Section** - Orange-bordered LOGOUT button at bottom of settings panel
- **Better UX** - Reduces accidental logouts, more discoverable location

#### Collapsible Wave Toolbar
- **Combined Toolbar** - Participants and Playback merged into single compact bar
- **Toggle Buttons** - "PARTICIPANTS (n)" and "PLAYBACK" buttons expand/collapse panels
- **Collapsed by Default** - Both panels start collapsed to save vertical space
- **Mark All Read** - Button remains visible in toolbar when unread messages exist

### Technical Details

#### Bundle Size
- **Gzipped**: 65.23 KB (slight increase from 65.03 KB)
- **Uncompressed**: 227.05 KB
- **Build Time**: ~617ms

### Migration Notes
- **No Migration Required** - Fully backward compatible
- **Service Worker** - Cache version updated to v1.6.1

---

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
