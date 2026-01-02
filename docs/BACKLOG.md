# Cortex Feature Backlog

Future feature ideas and enhancements for consideration.

---

## App Rename & Space-Based Nomenclature Overhaul

**Priority:** High

### Background

Cortex was created as an homage to *Firefly* and *Serenity*, inspired by the Cortex - the 'Verse's interconnected network of databanks and communication systems. The current terminology uses water-based metaphors (Waves, Droplets, Ripple), but a space/Firefly-themed nomenclature would better honor the source material and create a more cohesive identity.

### App Rename

The app name "Cortex" should change to something more obscure that represents the "entry point into the Cortex" - the Cortex being the entire network of federated nodes in the 'Verse.

**Chosen Name: Farhold**
- Domain: **farhold.com** (confirmed available, along with .net, .org, .io)
- Meaning: "Your hold in the far reaches of the 'Verse"
- Short, memorable, evokes frontier/Rim worlds aesthetic
- Works as both a noun ("the Farhold") and a place ("welcome to Farhold")

### Terminology Changes

| Current | New | Context |
|---------|-----|---------|
| Cortex | **Farhold** | App name (entry point to the Cortex) |
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

**Phase 1: App Rename & Domain**
- Acquire new domain
- Update branding, logos, PWA manifest
- Redirect old domain (if applicable)

**Phase 2: Core Renames**
- Ping (messages), Burst (breakout), Crew (groups)
- Database migrations with backward compatibility
- API endpoint aliases during transition

**Phase 3: UI Text Overhaul**
- All user-facing strings updated
- Easter egg messages throughout
- Loading/error/empty state personality

**Phase 4: Federation Theming**
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

### Current State (Honest Assessment)

| Data Point | Current State | Risk Level |
|------------|---------------|------------|
| Email addresses | Stored plaintext | **High** - Identifies real users |
| User → Wave relationships | Visible in DB | **High** - Shows who talks to whom |
| Contact lists | Stored per-user | **High** - Social graph exposed |
| Timestamps | All activity timestamped | **Medium** - Activity patterns |
| Session data | IP, device info stored | **Medium** - Identity correlation |
| Push subscriptions | Tied to user IDs | **Medium** - Device correlation |
| Avatars | Stored with user ID | **Low** - Potential recognition |

**What's protected:** Message content (E2EE)
**What's exposed:** Everything else

### Proposed Improvements

**Phase 1: Data Minimization**
- Remove email requirement (invite-code registration option)
- Hash emails if kept (for password reset only)
- Reduce session data retention
- No IP logging (or hash + auto-expire)
- Shorter timestamp precision (day vs millisecond)

**Phase 2: Encrypted Metadata**
- Encrypt contact lists (only user can decrypt their own)
- Encrypt wave participation lists
- Server knows wave exists, but not who's in it
- Encrypted push subscription mapping

**Phase 3: Social Graph Protection**
- Wave IDs are random, not sequential
- No global user directory (must know handle to find)
- Rate-limited handle lookups
- Encrypted crew membership lists

**Phase 4: Plausible Deniability**
- Hidden waves (don't appear in lists)
- Decoy traffic for federation
- Can't prove user is in a wave without their key

### Technical Approaches

**Option A: Client-Side Encryption of Metadata**
- Contact lists encrypted with user's E2EE key
- Wave participant lists encrypted with wave key
- Server stores blobs, can't read contents
- Pro: True zero-knowledge
- Con: Complex key management, search limitations

**Option B: Hashed/Pseudonymous References**
- User IDs replaced with per-wave pseudonyms
- Same user has different ID in each wave
- Server can't correlate across waves
- Pro: Simpler than full encryption
- Con: Patterns might still leak

**Option C: Hybrid Approach**
- Encrypt high-value metadata (contacts, wave membership)
- Hash medium-value data (emails, IPs)
- Minimize or delete low-value data
- Pro: Balanced complexity vs protection
- Con: Partial protection

### Privacy Claims We Could Make (After Implementation)

**Before (Now):**
> "Your messages are end-to-end encrypted"

**After (Goal):**
> "Even we can't see who you talk to, when, or how often. Your social graph is yours alone."

### Questions to Resolve

1. Do we require email at all? Invite codes + handle could be enough
2. How do we handle password reset without email?
3. Can we do encrypted search (for finding old messages)?
4. Federation complicates this - how do we protect metadata across ports?
5. What's the right balance between usability and privacy?

### Success Criteria

- [ ] Database breach reveals no plaintext emails
- [ ] Cannot determine who is in which wave from DB alone
- [ ] Cannot reconstruct social graph from DB
- [ ] Cannot correlate activity patterns to users
- [ ] Privacy policy accurately reflects actual protections

---

*"The black keeps secrets. So do we."*

---

## Crawl Bar: Pause + Drag Interaction

**Priority:** Low - Enhancement

### Summary

Allow users to pause and drag the crawl bar backwards to see or click on content that just scrolled past.

### Behavior

1. **Pause on hover/touch** - Animation pauses when user hovers (desktop) or touches (mobile)
2. **Drag to scroll** - User can drag left/right to scroll through content manually
3. **Resume after timeout** - Animation resumes from current position after 3-5 seconds of no interaction

### Technical Notes

- Track animation position when pausing (Web Animations API `currentTime`)
- Touch events (`touchstart`, `touchmove`, `touchend`) for mobile
- Mouse events (`mousedown`, `mousemove`, `mouseup`) for desktop
- Resume animation from current scroll position, not restart
- Visual indicator when paused (subtle border glow or pause icon)

### Implementation

```javascript
// Pause animation and enable dragging
crawlBar.addEventListener('mouseenter', () => {
  animation.pause();
  currentPosition = animation.currentTime;
});

// Track drag
crawlBar.addEventListener('mousedown', startDrag);
crawlBar.addEventListener('mousemove', onDrag);
crawlBar.addEventListener('mouseup', endDrag);

// Resume after timeout
crawlBar.addEventListener('mouseleave', () => {
  resumeTimeout = setTimeout(() => {
    animation.currentTime = currentPosition;
    animation.play();
  }, 3000);
});
```

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
