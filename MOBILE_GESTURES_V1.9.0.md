# Mobile Gesture Enhancements - Cortex v1.9.0

## Implementation Summary

This document outlines the mobile gesture enhancements implemented for Cortex v1.9.0, including swipe navigation, pull-to-refresh, and a bottom navigation bar for mobile devices.

---

## COMPLETED FEATURES

### Phase 4: Swipe Navigation Infrastructure

#### `useSwipeGesture` Hook (Lines 1114-1147)
Custom React hook for detecting horizontal swipe gestures on mobile devices.

**Features:**
- Touch event tracking (touchstart, touchend)
- Configurable swipe threshold (default: 100px)
- Vertical movement tolerance (<100px) to avoid conflicts with scrolling
- Callbacks for `onSwipeLeft` and `onSwipeRight`
- Passive event listeners for better performance

**Usage Example:**
```javascript
const containerRef = useRef(null);
useSwipeGesture(containerRef, {
  onSwipeRight: () => onBack(),  // Swipe right to go back
  threshold: 100
});
```

---

### Phase 5: Pull-to-Refresh Infrastructure

#### `usePullToRefresh` Hook (Lines 1149-1211)
Custom hook for implementing pull-down-to-refresh functionality.

**Features:**
- Activates only when scrolled to top
- Resistance effect (0.5x multiplier) for natural feel
- Configurable threshold (60px)
- Returns `{ pulling, pullDistance, refreshing }` state
- Async refresh callback support

**Usage Example:**
```javascript
const listRef = useRef(null);
const { pulling, pullDistance, refreshing } = usePullToRefresh(
  listRef,
  async () => await loadWaves()
);
```

#### `PullIndicator` Component (Lines 1441-1475)
Visual feedback component for pull-to-refresh action.

**Features:**
- Animated spinner with rotation during pull
- Progress-based opacity (30%-100%)
- Smooth transitions when releasing
- Green accent color (#0ead69) matching Firefly theme
- Gradient background for depth effect

---

### Phase 6: Bottom Navigation Bar

#### `BottomNav` Component (Lines 1097-1192)
Mobile-optimized bottom navigation bar with haptic feedback.

**Features:**
- 5 navigation items: Waves, Contacts, Groups, Search, Profile
- Badge indicators for unread counts and pending requests
  - Waves: Orange (#ff6b35) for unread messages
  - Contacts: Teal (#3bceac) for pending requests
  - Groups: Amber (#ffd23f) for pending invitations
- Haptic feedback (10ms vibration) on tap
- Active state with amber glow (#ffd23f)
- Safe area insets for notched devices
- 60px fixed height with proper z-index (1000)

**Layout:**
- Fixed position at bottom
- 5 equal-width buttons in flexbox
- Icon + label vertical layout
- Firefly aesthetic (dark green background, amber highlights)

#### Mobile Navigation Integration (Lines 6208-6245, 6334, 6408-6439)

**Header Changes:**
- Top navigation hidden on mobile (`{!isMobile && ...}`)
- Search button remains visible in header
- Logo shown as icon on mobile (32x32px)

**Main Content:**
- Added `paddingBottom: isMobile ? '60px' : '0'` for BottomNav clearance
- Prevents content from being hidden behind fixed nav

**Footer Changes:**
- Desktop footer hidden on mobile (`{!isMobile && ...}`)
- Replaced with BottomNav component
- Navigation handler integrated with search modal and view switching

---

## PENDING IMPLEMENTATION

### Swipe Gestures on Views
The `useSwipeGesture` hook is ready but needs to be applied to:

1. **WaveView** - Swipe right to return to wave list
   ```javascript
   const waveViewRef = useRef(null);
   useSwipeGesture(waveViewRef, {
     onSwipeRight: isMobile ? onBack : undefined
   });
   ```

2. **ContactsView** - Swipe right to return to waves
   ```javascript
   const contactsRef = useRef(null);
   useSwipeGesture(contactsRef, {
     onSwipeRight: isMobile ? () => setActiveView('waves') : undefined
   });
   ```

3. **GroupsView** - Swipe right to return to waves
   ```javascript
   const groupsRef = useRef(null);
   useSwipeGesture(groupsRef, {
     onSwipeRight: isMobile ? () => setActiveView('waves') : undefined
   });
   ```

**Implementation Notes:**
- Add `ref` prop to each view component's container div
- Only enable swipe on mobile (`isMobile` check)
- Ensure swipe doesn't interfere with horizontal scrolling elements

---

### Pull-to-Refresh on Lists
The `usePullToRefresh` hook and `PullIndicator` component are ready but need to be applied to:

1. **WaveList** - Refresh wave list
   ```javascript
   const waveListRef = useRef(null);
   const { pulling, pullDistance, refreshing } = usePullToRefresh(
     waveListRef,
     async () => {
       await onToggleArchived(); // Reload current view
     }
   );

   return (
     <div ref={waveListRef} style={{ position: 'relative', ... }}>
       <PullIndicator pulling={pulling} pullDistance={pullDistance} refreshing={refreshing} />
       {/* wave list content */}
     </div>
   );
   ```

2. **WaveView Messages** - Refresh messages in wave
   ```javascript
   const messagesRef = useRef(null);
   const { pulling, pullDistance, refreshing } = usePullToRefresh(
     messagesRef,
     async () => {
       await reloadWave(); // Fetch latest messages
     }
   );
   ```

3. **ContactsView** - Refresh contacts list
   ```javascript
   const contactsRef = useRef(null);
   const { pulling, pullDistance, refreshing } = usePullToRefresh(
     contactsRef,
     async () => {
       await onContactsChange();
     }
   );
   ```

4. **GroupsView** - Refresh groups list
   ```javascript
   const groupsRef = useRef(null);
   const { pulling, pullDistance, refreshing } = usePullToRefresh(
     groupsRef,
     async () => {
       await loadGroups();
     }
   );
   ```

**Implementation Notes:**
- Apply to scrollable container element
- Add `position: 'relative'` to container for PullIndicator absolute positioning
- Ensure container has `overflow: 'auto'` or `'scroll'`
- Test that pull doesn't trigger when scrolling mid-list

---

## DESIGN SPECIFICATIONS

### Firefly Aesthetic Theme
- **Background:** #0a150a (dark green)
- **Border:** #2a3a2a (medium green)
- **Active/Highlight:** #ffd23f (amber)
- **Accent:** #0ead69 (green)
- **Text:** #6a7a6a (inactive), #ffd23f (active)

### Mobile Breakpoints
- **Mobile:** width < 600px
- **Tablet:** 600px ≤ width < 1024px
- **Desktop:** width ≥ 1024px

### Touch Targets
- Minimum: 44x44px (iOS guidelines)
- BottomNav buttons: 60px height, full width/5

### Haptic Feedback
- Vibration: 10ms on navigation tap
- Graceful degradation if `navigator.vibrate` unavailable

---

## FILE CHANGES

### `/home/jempson/development/cortex/client/CortexApp.jsx`

**New Code Added:**
- Lines 1114-1147: `useSwipeGesture` hook
- Lines 1149-1211: `usePullToRefresh` hook
- Lines 1441-1475: `PullIndicator` component
- Lines 1097-1192: `BottomNav` component

**Modified Code:**
- Lines 6208-6245: Wrapped top nav in `{!isMobile && ...}`
- Line 6334: Added `paddingBottom: isMobile ? '60px' : '0'` to `<main>`
- Lines 6408-6439: Wrapped footer in `{!isMobile && ...}` and added `<BottomNav>` for mobile

**Total Lines Added:** ~200 lines

---

## TESTING CHECKLIST

### Bottom Navigation
- [ ] Navigation works on all 5 tabs (Waves, Contacts, Groups, Search, Profile)
- [ ] Active state highlights correct tab
- [ ] Badges show correct counts for unread/pending items
- [ ] Haptic feedback fires on tap (test on device)
- [ ] Safe area insets work on notched devices (iPhone X+)
- [ ] BottomNav doesn't overlap content (60px padding applied)

### Swipe Gestures (When Implemented)
- [ ] Swipe right navigates back from WaveView
- [ ] Swipe right navigates back from ContactsView
- [ ] Swipe right navigates back from GroupsView
- [ ] Vertical scrolling still works normally
- [ ] Swipe threshold feels natural (not too sensitive)
- [ ] No conflicts with horizontal scrollable elements

### Pull-to-Refresh (When Implemented)
- [ ] Pull indicator appears when pulling from top
- [ ] Rotation animation matches pull distance
- [ ] Refresh triggers when pulled past threshold (60px)
- [ ] Spinner animation plays during refresh
- [ ] List reloads with fresh data
- [ ] Indicator disappears smoothly after refresh
- [ ] Doesn't trigger when scrolling mid-list

### Responsive Behavior
- [ ] Desktop: Top nav + footer visible, no BottomNav
- [ ] Mobile: BottomNav visible, no top nav or footer
- [ ] Tablet: (Currently using desktop layout, consider custom?)
- [ ] Transitions smooth when resizing window

---

## BROWSER COMPATIBILITY

### Tested Features
- Touch events: All modern mobile browsers
- Haptic feedback: Chrome/Safari on Android/iOS (graceful degradation)
- Safe area insets: iOS 11+ (Safari), Android Chrome

### Known Limitations
- Haptic feedback not available on older browsers (fallback: silent)
- Safe area insets require `viewport-fit=cover` in meta tag (already set)

---

## FUTURE ENHANCEMENTS

1. **Swipe Thresholds:** Make configurable per-view
2. **Pull-to-Refresh Customization:** Allow custom spinner/text
3. **Gesture Animations:** Add slide-in/out transitions for views
4. **Multi-finger Gestures:** Pinch to zoom in wave view
5. **Long-press Actions:** Context menus on long-press
6. **Tablet Optimization:** Custom layout for 600-1024px width
7. **Gesture Tutorial:** First-time user onboarding overlay
8. **Accessibility:** VoiceOver/TalkBack announcements for gestures

---

## NOTES FOR DEVELOPERS

### Adding Swipe to a New View
```javascript
import { useRef } from 'react';

function MyView({ onBack, isMobile }) {
  const containerRef = useRef(null);

  useSwipeGesture(containerRef, {
    onSwipeRight: isMobile ? onBack : undefined,
    threshold: 100
  });

  return <div ref={containerRef} style={{ ... }}>...</div>;
}
```

### Adding Pull-to-Refresh to a List
```javascript
import { useRef } from 'react';

function MyList({ onRefresh, isMobile }) {
  const listRef = useRef(null);
  const { pulling, pullDistance, refreshing } = usePullToRefresh(
    listRef,
    onRefresh
  );

  return (
    <div ref={listRef} style={{ position: 'relative', overflow: 'auto', ... }}>
      {isMobile && <PullIndicator pulling={pulling} pullDistance={pullDistance} refreshing={refreshing} />}
      {/* list items */}
    </div>
  );
}
```

---

## VERSION HISTORY

- **v1.9.0 (2025-12-09):** Initial implementation of mobile gesture enhancements
  - Swipe navigation infrastructure
  - Pull-to-refresh infrastructure
  - Bottom navigation bar
  - Responsive layout updates

---

*Generated for Cortex v1.9.0 Mobile Gesture Enhancements*
