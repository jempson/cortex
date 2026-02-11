# Cortex Feature Backlog

Future feature ideas and enhancements for consideration.

---

## ✅ App Rename & Space-Based Nomenclature Overhaul (COMPLETED in v2.0.0)

**Status:** Implemented in v2.0.0 (January 2026)

### Background

Cortex was created as an homage to *Firefly* and *Serenity*, inspired by the Cortex - the 'Verse's interconnected network of databanks and communication systems. The original terminology used water-based metaphors (Waves, Droplets, Ripple), but the v2.0.0 nomenclature overhaul brought space/Firefly-themed naming to better honor the source material and create a more cohesive identity.

### App Rename

The app name "Cortex" should change to something more obscure that represents the "entry point into the Cortex" - the Cortex being the entire network of federated nodes in the 'Verse.

**Chosen Name: Cortex**
- Domain: **cortex.com** (confirmed available, along with .net, .org, .io)
- Meaning: "Your hold in the far reaches of the 'Verse"
- Short, memorable, evokes frontier/Rim worlds aesthetic
- Works as both a noun ("the Cortex") and a place ("welcome to Cortex")

### Terminology Changes

| Current | New | Context |
|---------|-----|---------|
| Cortex | **Cortex** | App name (entry point to the Cortex) |
| Droplet | **Ping** | Individual message |
| Ripple | **Burst** | Break out thread to new conversation |
| Group | **Crew** | User groups |
| Wave | **Wave** | Keep - canonical Firefly ("send a wave") |
| Contact | **Contact** | Keep as-is |

### Federation Terminology

| Current | Proposed | Reasoning |
|---------|----------|-----------|
| Federation | **The Verse** | The interconnected network of instances |
| Federated Server | **Port** or **Outpost** | Docking locations in the 'Verse |
| Federation Handshake | **Docking** | Ships dock to exchange |
| Remote User | **Traveler** | Someone from another port |
| Federation Sync | **Signal Relay** | Passing waves through the black |
| Trusted Nodes | **Allied Ports** | Trusted connections |
| Federation Queue | **Cargo Hold** | Outbound messages waiting for delivery |

### Firefly Easter Eggs

**Success States:**
- "Shiny!" - Operation successful
- "Wave sent" → "Signal's away"
- "Connected" → "We're in the air"

**Error States:**
- "Gorram it!" - Generic error prefix
- "Lost signal" - Connection failed
- "Ship's grounded" - Server unreachable
- "Alliance interference" - Access denied

**Empty States:**
- "Nothing but black out here" - No messages
- "Crew's elsewhere" - No one online
- "Ain't heard a peep" - No notifications

**Loading States:**
- "Spinning up..." - Loading
- "Scanning the cortex..." - Searching
- "Awaiting docking clearance..." - Connecting to federation

**Confirmations:**
- "I aim to misbehave" - Admin/destructive action confirmation
- "Let's be bad guys" - Delete confirmation
- "Time to go to work" - Task starting

**Taglines/Footer Rotation:**
- "Can't stop the signal"
- "Keep flying"
- "We're still flying, that's something"
- "You can't take the sky from me"
- "Privacy isn't a feature, it's a foundation" (keep original)
- "Find a crew, find a job, keep flying"
- "I don't care what you believe, just believe in it"

**Profile/Settings:**
- "Captain's Log" - Activity log
- "Ship's Manifest" - Account data export
- "Abandon Ship" - Delete account

**Notifications:**
- "Wave incoming" - New message
- "Ping from the black" - Mention
- "Crew assembled" - Added to group
- "New traveler docked" - Federated user joined

### UI Text Examples

**Current → New:**
- "No droplets yet" → "Ain't heard a ping yet"
- "Send a droplet" → "Send a ping"
- "Ripple to new wave" → "Burst to new wave"
- "Create group" → "Assemble a crew"
- "Group members" → "Crew manifest"
- "Leave group" → "Jump ship"
- "Add to group" → "Recruit to crew"
- "Federate wave" → "Broadcast to the Verse"
- "Connected servers" → "Allied ports"

### Implementation Scope

**Phase 1: App Rename & Domain** ✅
- ~~Acquire new domain~~
- ~~Update branding, logos, PWA manifest~~
- ~~Redirect old domain (if applicable)~~

**Phase 2: Core Renames** ✅
- ~~Ping (messages), Burst (breakout), Crew (groups)~~
- ~~Database migrations with backward compatibility~~
- ~~API endpoint aliases during transition~~

**Phase 3: UI Text Overhaul** ✅
- ~~All user-facing strings updated~~
- Easter egg messages throughout (future enhancement)
- Loading/error/empty state personality (future enhancement)

**Phase 4: Federation Theming** (Future)
- Federation UI terminology
- Admin panel updates
- Documentation refresh

### Database Migration Notes

```sql
-- Tables to rename
ALTER TABLE droplets RENAME TO pings;
ALTER TABLE droplet_read_by RENAME TO ping_read_by;
ALTER TABLE droplets_fts RENAME TO pings_fts;
ALTER TABLE groups RENAME TO crews;
ALTER TABLE group_members RENAME TO crew_members;
ALTER TABLE group_invitations RENAME TO crew_invitations;

-- Columns referencing old terms
-- (broken_out_to stays but UI shows "burst")
```

---

*"We have done the impossible, and that makes us mighty."*

---

## Privacy Hardening: Metadata Protection

**Priority:** High

### Background

E2EE protects message content, but metadata can reveal just as much. If someone gains database access, they shouldn't be able to "connect the dots" - who talks to whom, when, or how often. Our privacy claims must match our actual security posture.

### Current State (After v2.17.0)

| Data Point | Current State | Risk Level |
|------------|---------------|------------|
| Email addresses | ✅ Hashed + Encrypted | **Low** - Protected |
| IP addresses | ✅ Anonymized to /24 subnet | **Low** - Protected |
| User-Agent | ✅ Truncated to Browser/OS | **Low** - Protected |
| Timestamps | ✅ Rounded (15-min activity, 5-min sessions) | **Low** - Protected |
| Session data | ✅ 30-day auto-cleanup | **Low** - Protected |
| Activity logs | ✅ 30-day auto-cleanup | **Low** - Protected |
| User → Wave relationships | Visible in DB | **High** - Shows who talks to whom |
| Contact lists | Stored per-user | **High** - Social graph exposed |
| Push subscriptions | Tied to user IDs | **Medium** - Device correlation |
| Avatars | Stored with user ID | **Low** - Potential recognition |

**What's protected:** Message content (E2EE), emails, IPs, user-agents, timestamps
**What's still exposed:** Social graph (wave participation, contacts, crews)

### Implementation Progress

**Phase 1: Data Minimization** ✅ COMPLETED (v2.17.0)
- ✅ Hash emails (SHA-256 for lookup)
- ✅ Encrypt emails (AES-256-GCM for password reset)
- ✅ Anonymize IPs (truncate to /24 subnet)
- ✅ Truncate User-Agent (Browser/OS only)
- ✅ Round timestamps (15-min for activity, 5-min for sessions)
- ✅ Auto-cleanup activity logs (30 days default)
- ✅ Auto-cleanup old sessions (30 days default)
- ✅ Admin endpoints for migration and status

**Phase 2: Encrypted Metadata** (Future)
- Encrypt contact lists (only user can decrypt their own)
- Encrypt wave participation lists
- Server knows wave exists, but not who's in it
- Encrypted push subscription mapping

**Phase 3: Social Graph Protection** (Future)
- Wave IDs are random, not sequential (already done)
- No global user directory (must know handle to find)
- Rate-limited handle lookups
- Encrypted crew membership lists

**Phase 4: Plausible Deniability** (Future)
- Hidden waves (don't appear in lists)
- Decoy traffic for federation
- Can't prove user is in a wave without their key

### Environment Variables (v2.17.0)

```bash
EMAIL_ENCRYPTION_KEY=<32-byte-hex>  # openssl rand -hex 32
ACTIVITY_LOG_RETENTION_DAYS=30
SESSION_MAX_AGE_DAYS=30
```

### Admin Endpoints (v2.17.0)

- `POST /api/admin/maintenance/migrate-emails` - Migrate existing users to encrypted email
- `GET /api/admin/maintenance/privacy-status` - View privacy protection stats

### Success Criteria

- [x] Database breach reveals no plaintext emails (v2.17.0)
- [x] IPs cannot identify specific users (v2.17.0)
- [x] Cannot correlate activity patterns via precise timestamps (v2.17.0)
- [ ] Cannot determine who is in which wave from DB alone
- [ ] Cannot reconstruct social graph from DB
- [ ] Privacy policy accurately reflects actual protections

---

*"The black keeps secrets. So do we."*

---

## ✅ Crawl Bar: Pause + Drag Interaction (COMPLETED in v2.0.3)

**Status:** Implemented in v2.0.3 (January 2026)

### Summary

Allow users to pause and drag the crawl bar backwards to see or click on content that just scrolled past.

### Implementation

- **Pause on hover/touch**: Animation pauses when user hovers (desktop) or touches (mobile)
- **Drag to scroll**: Click and drag left/right to manually scroll through content
- **Auto-resume**: Animation resumes from current position after 3 seconds of no interaction
- **Visual indicators**: Amber border glow, pause icon (⏸), drag arrows (◀ ▶), grab cursor

---

*"Missed something? Just grab the signal and pull it back."*

---

## Holiday Theme System

**Priority:** Low - Enhancement / Nice-to-have

### Summary
Add a calendaring system that automatically applies special visual themes and effects during holidays, creating a festive atmosphere for users.

### Motivation
Holidays are times when users naturally want to celebrate and share with their communities. Having the interface reflect these moments creates delight and strengthens the sense of community within Cortex.

### Proposed Features

**Core: Holiday Detection & Themes**
- Holiday configuration with dates, duration, and associated theme
- Automatic theme activation during holiday windows
- Holiday-specific color palettes using existing CSS variable system
- Graceful fallback to user's normal theme outside holiday periods

**Visual Enhancements**
- Animated effects (snowfall, confetti, floating hearts, etc.)
- Holiday-themed scanline overlays or glow effects
- Special app icon/favicon during holidays (PWA)

**Content Features**
- Holiday greeting displayed in crawl bar
- Limited-time emoji or reaction packs
- Holiday-themed notification sounds (optional)

**Admin Controls**
- Manage holidays via Admin Panel (add/edit/remove)
- Upload custom assets for holiday effects
- Enable/disable holidays server-wide
- Support for recurring annual and one-time events

**User Preferences**
- Option to disable holiday themes (accessibility/preference)
- Holiday theme preview in settings

### Example Holidays
| Holiday | Date(s) | Theme | Effects |
|---------|---------|-------|---------|
| New Year | Jan 1-2 | Gold/silver accents | Confetti |
| Valentine's Day | Feb 14 | Pink/red accents | Floating hearts |
| Halloween | Oct 31 | Orange/purple accents | Spooky glow |
| Christmas | Dec 24-26 | Red/green accents | Snowfall |

### Technical Notes
- Leverages existing CSS variable theme system
- Holiday config stored in database (`holidays` table)
- Client checks active holiday on load and via WebSocket updates
- Effects rendered via CSS animations or canvas overlay

---

*"Even in the black, we find reasons to celebrate."*

---

## Completed Features Archive

Features from the backlog that have been implemented.

### v2.0.0 - Cortex Nomenclature Overhaul (January 2026)
- App renamed from Cortex to Cortex
- Droplet → Ping (individual messages)
- Ripple → Burst (break out threads)
- Group → Crew (user groups)
- API endpoint aliases: /api/pings/*, /api/crews/*
- Full backward compatibility maintained
