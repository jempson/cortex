# Cortex Feature Backlog

Future feature ideas and enhancements for consideration.

---

## App Rename & Space-Based Nomenclature Overhaul

**Priority:** High

### Background

Cortex was created as an homage to *Firefly* and *Serenity*, inspired by the Cortex - the 'Verse's interconnected network of databanks and communication systems. The current terminology uses water-based metaphors (Waves, Droplets, Ripple), but a space/Firefly-themed nomenclature would better honor the source material and create a more cohesive identity.

### App Rename

The app name "Cortex" should change to something more obscure that represents the "entry point into the Cortex" - the Cortex being the entire network of federated nodes in the 'Verse.

**Domain Candidates (Possibly Available):**
- **farhold.com** - "Hold in the far reaches" - short, evocative
- gorramit.com - Classic Firefly expletive
- portintheblack.com - "Your port in the black"
- browncoatport.com - Firefly rebel reference

### Terminology Changes

| Current | New | Context |
|---------|-----|---------|
| Cortex | **[New Name]** | App name (entry point to the Cortex) |
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
