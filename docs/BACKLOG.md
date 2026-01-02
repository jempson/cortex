# Cortex Feature Backlog

Future feature ideas and enhancements for consideration.

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
