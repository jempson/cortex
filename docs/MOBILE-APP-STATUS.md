# Cortex Mobile App - Implementation Status

This document tracks the implementation status of the React Native mobile app (cortex-mobile).

## Project Location

- **Repository:** `~/development/cortex-mobile` (separate repo from main cortex)
- **Framework:** Expo (React Native with managed workflow)
- **Package:** `com.cortex.mobile`

---

## Server Changes for Mobile Support

The following changes were made to the main Cortex server to support the mobile app:

### Push Notifications (Expo)

**Commits:**
- `12344c6` - Add Expo push notification endpoints for mobile app
- `1a9fa7d` - Add Expo Server SDK for mobile push notifications
- `9f9a32f` - Downgrade expo-server-sdk to v3.15.0 for Node 18 compatibility
- `1ecd7f4` - Add push notification debug logging
- `8377485` - Send push notifications regardless of WebSocket connection
- `f097e85` - Add type field to push notification payload for mobile navigation

**Endpoints Added:**
```
POST /api/push/register     - Register Expo push token
DELETE /api/push/register   - Unregister push token
```

**Environment Variables:**
```bash
PUSH_DEBOUNCE_MINUTES=5    # Debounce between push notifications (default: 5)
```

**Dependencies Added:**
```json
"expo-server-sdk": "^3.15.0"
```

**Database Changes:**
- Added `expo_push_tokens` table to store device tokens

### Profile Wave Hiding

**Commit:** `f5b8e51` - Hide profile waves from wave list

Profile waves (used for video feed) are now filtered from the main wave list API responses. This applies to both web and mobile clients.

**Files Modified:**
- `server/database-sqlite.js` - Added filter to `getWavesForUser` and `getWavesForUserMinimal`

### Voice/Video Calls (LiveKit)

The server already had LiveKit integration for voice/video calls. The mobile app uses these existing endpoints:

**Endpoints:**
```
POST /api/waves/:waveId/call/token   - Get LiveKit token to join call
GET  /api/waves/:waveId/call/status  - Check if call is active
GET  /api/waves/active-calls         - List all active calls
```

**Environment Variables:**
```bash
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

---

## Mobile App Features Implemented

### Core Features
- [x] Authentication (login/register)
- [x] JWT token storage (expo-secure-store)
- [x] Wave list with categories
- [x] Wave view with threaded messages
- [x] Real-time WebSocket updates
- [x] Message composition
- [x] Threaded replies
- [x] Reactions (emoji)
- [x] Mentions (@user)
- [x] Unread indicators
- [x] Push notifications (Expo/FCM)
- [x] Deep linking (cortex://wave/:id)

### Media Features
- [x] Image upload/display
- [x] Camera capture
- [x] Audio recording/playback
- [x] Video playback
- [x] GIF search (Tenor/GIPHY)
- [x] Link previews
- [x] Jellyfin/Plex media embeds

### User Features
- [x] Profile view/edit
- [x] Contacts management
- [x] Contact requests
- [x] Crews (groups)
- [x] User status indicators
- [x] Blocked/muted users

### Settings
- [x] Theme picker (multiple themes)
- [x] Font size adjustment
- [x] Notification settings
- [x] Security settings

### Admin Features (for admin/moderator users)
- [x] User management
- [x] Reports review
- [x] Activity log
- [ ] Handle requests (pending)
- [ ] Crawl bar config (pending)
- [ ] System alerts (pending)
- [ ] Alert subscriptions (pending)
- [ ] Federation management (pending)
- [ ] Bots management (pending)

### Voice/Video Calls
- [x] Call service with LiveKit integration
- [x] Call button in wave header
- [x] Call screen UI
- [x] Mute/camera controls
- [ ] Full functionality (requires development build with native modules)

---

## Firebase/FCM Configuration

### EAS Credentials Setup

1. Go to https://expo.dev → Project → Credentials
2. Under Android → Push Notifications (FCM V1):
   - Upload Google Service Account JSON key
   - **NOT** the legacy FCM Server Key

### Firebase Console Setup

1. Create Firebase project at https://console.firebase.google.com
2. Add Android app with package name `com.cortex.mobile`
3. Download `google-services.json` to mobile app root
4. Create Service Account:
   - Go to Project Settings → Service accounts
   - Generate new private key
   - Upload to EAS under "FCM V1"

---

## Building the App

### Development (Expo Go)
```bash
cd ~/development/cortex-mobile
npm install
npx expo start
```

Note: Voice/video calls require a development build (not Expo Go).

### Development Build (with native modules)
```bash
eas build --profile development --platform android
```

### Production Build
```bash
eas build --profile production --platform android
eas build --profile production --platform ios
```

---

## API Compatibility

The mobile app uses the same REST API as the web client. Key endpoints:

| Feature | Endpoint |
|---------|----------|
| Auth | `POST /api/auth/login`, `POST /api/auth/register` |
| Waves | `GET /api/waves`, `GET /api/waves/:id` |
| Messages | `GET /api/waves/:id/messages`, `POST /api/droplets` |
| Push | `POST /api/push/register` |
| Calls | `POST /api/waves/:id/call/token` |

WebSocket events are also compatible - the mobile app connects to the same WebSocket server.

---

## Known Issues

1. **LiveKit in Expo Go** - Voice/video calls show a placeholder in Expo Go. Requires development build with native WebRTC modules.

2. **iOS Build** - Requires macOS or EAS Build cloud service.

---

## Version History

| Mobile Version | Server Version | Notes |
|----------------|----------------|-------|
| 0.1.0 | v2.16.0+ | Initial release with core features |
| 0.1.1 | v2.16.0+ | Push notifications, voice calls (placeholder) |
