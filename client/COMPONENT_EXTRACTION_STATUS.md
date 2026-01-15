# Component Extraction Status

## Completed Extractions

The following components have been successfully extracted from `/tmp/original_farhold.jsx` and created as standalone files:

### 1. UserProfileModal ✅
- **Location:** `/home/jempson/development/cortex/client/src/components/profile/UserProfileModal.jsx`
- **Lines:** 5048-5248 (201 lines)
- **Status:** Complete with all imports
- **Dependencies:** React hooks, LOADING constants, GlowText, Avatar components

### 2. AlertDetailModal ✅
- **Location:** `/home/jempson/development/cortex/client/src/components/modals/AlertDetailModal.jsx`
- **Lines:** 5251-5361 (111 lines)
- **Status:** Complete with all imports
- **Dependencies:** React

### 3. SearchModal ✅
- **Location:** `/home/jempson/development/cortex/client/src/components/search/SearchModal.jsx`
- **Lines:** 6993-7137 (145 lines)
- **Status:** Complete with all imports
- **Dependencies:** React hooks

### 4. ContactsView ✅
- **Location:** `/home/jempson/development/cortex/client/src/components/contacts/ContactsView.jsx`
- **Lines:** 10814-11004 (191 lines)
- **Status:** Complete with all imports
- **Dependencies:** SUCCESS, EMPTY, LOADING constants, useWindowSize hook, GlowText, Avatar, ContactRequestsPanel, SentRequestsPanel, SendContactRequestModal

## Remaining Extractions (Large Components)

These components are extremely large and complex, requiring careful extraction:

### 5. WaveView ⚠️
- **Source Lines:** 7140-10106 (~2967 lines)
- **Complexity:** VERY HIGH
- **Dependencies:**
  - React hooks: useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo
  - E2EE context: useE2EE
  - Voice call: useVoiceCall
  - Constants: SUCCESS, EMPTY, LOADING, CONFIRM, PRIVACY_LEVELS, THREAD_DEPTH_LIMIT
  - UI Components: GlowText, Avatar, PrivacyBadge
  - Multiple child components (MessageItem, ComposeBox, ParticipantsPanel, etc.)
- **Extraction Script:** `sed -n '7140,10106p' /tmp/original_farhold.jsx > WaveView.jsx`

### 6. FocusView ⚠️
- **Source Lines:** 10107-10813 (~707 lines)
- **Complexity:** HIGH
- **Dependencies:**
  - Similar to WaveView but focused view
  - React hooks, E2EE, constants
- **Extraction Script:** `sed -n '10107,10813p' /tmp/original_farhold.jsx > FocusView.jsx`

### 7. GroupsView ⚠️
- **Source Lines:** 11005-14981 (~3977 lines)
- **Complexity:** VERY HIGH
- **Dependencies:**
  - React hooks
  - useWindowSize
  - SUCCESS, EMPTY, LOADING constants
  - GlowText, Avatar components
  - Multiple sub-components for group management
- **Extraction Script:** `sed -n '11005,14981p' /tmp/original_farhold.jsx > GroupsView.jsx`

### 8. ProfileSettings ⚠️
- **Source Lines:** 14982-16958 (~1977 lines)
- **Complexity:** VERY HIGH
- **Dependencies:**
  - React hooks
  - SUCCESS, CONFIRM constants
  - useWindowSize
  - Multiple sub-components for settings sections
  - CollapsibleSection component
- **Extraction Script:** `sed -n '14982,16958p' /tmp/original_farhold.jsx > ProfileSettings.jsx`

## Extraction Commands

To extract the remaining large components, run these commands:

```bash
# Create necessary directories
mkdir -p /home/jempson/development/cortex/client/src/views
mkdir -p /home/jempson/development/cortex/client/src/components/settings

# Extract WaveView
cd /tmp && sed -n '7140,10106p' original_farhold.jsx > /home/jempson/development/cortex/client/src/views/WaveView.jsx

# Extract FocusView
cd /tmp && sed -n '10107,10813p' original_farhold.jsx > /home/jempson/development/cortex/client/src/views/FocusView.jsx

# Extract GroupsView
cd /tmp && sed -n '11005,14981p' original_farhold.jsx > /home/jempson/development/cortex/client/src/components/groups/GroupsView.jsx

# Extract ProfileSettings
cd /tmp && sed -n '14982,16958p' original_farhold.jsx > /home/jempson/development/cortex/client/src/components/settings/ProfileSettings.jsx
```

## Required Imports Template

After extraction, each large component will need these imports added at the top:

### WaveView.jsx
```javascript
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useE2EE } from '../e2ee-context.jsx';
import { useVoiceCall } from '../hooks/useVoiceCall.js';
import { SUCCESS, EMPTY, LOADING, CONFIRM } from '../../messages.js';
import { PRIVACY_LEVELS, THREAD_DEPTH_LIMIT } from '../config/constants.js';
import { GlowText, Avatar, PrivacyBadge } from '../components/ui/SimpleComponents.jsx';
// Add other component imports as needed

// ... component code ...

export default WaveView;
```

### FocusView.jsx
```javascript
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useE2EE } from '../e2ee-context.jsx';
import { SUCCESS, LOADING } from '../../messages.js';
import { GlowText, Avatar } from '../components/ui/SimpleComponents.jsx';
// Add other component imports as needed

// ... component code ...

export default FocusView;
```

### GroupsView.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { SUCCESS, EMPTY, LOADING, CONFIRM } from '../../messages.js';
import { GlowText, Avatar } from '../components/ui/SimpleComponents.jsx';
// Add other component imports as needed

// ... component code ...

export default GroupsView;
```

### ProfileSettings.jsx
```javascript
import React, { useState, useEffect, useRef } from 'react';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { SUCCESS, CONFIRM } from '../../messages.js';
import { storage } from '../utils/storage.js';
import { subscribeToPush, unsubscribeFromPush } from '../utils/pwa.js';
// Add other component imports as needed

// ... component code ...

export default ProfileSettings;
```

## Sub-Components to Extract

These large components contain nested sub-components that should also be extracted:

### From WaveView:
- MessageItem
- ComposeBox
- ParticipantsPanel
- WaveSettingsModal
- DeleteConfirmModal
- EncryptionMigrationBanner

### From GroupsView:
- GroupCard
- GroupMembersPanel
- CreateGroupModal
- InvitationsList

### From ProfileSettings:
- CollapsibleSection
- AvatarUploader
- PasswordChangeForm
- MFASetupPanel
- AccountDeletionConfirm

## Notes

1. **Import Path Adjustments:** After extraction, verify all import paths are correct relative to the new file locations.

2. **Dependency Resolution:** Some components reference other components that may need to be extracted separately or imported from their existing locations.

3. **Testing:** After extraction, test each component individually to ensure:
   - All imports resolve correctly
   - No missing dependencies
   - Component renders without errors

4. **Circular Dependencies:** Watch for circular import issues, especially between large components.

## Recommended Extraction Order

1. ✅ Small modals (completed)
2. ✅ ContactsView (completed)
3. ⏳ FocusView (smallest remaining - 700 lines)
4. ⏳ ProfileSettings (2000 lines, fewer dependencies)
5. ⏳ WaveView (3000 lines, many dependencies)
6. ⏳ GroupsView (4000 lines, most complex)
