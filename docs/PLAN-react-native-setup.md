# React Native Mobile App Development Plan

This document outlines the setup and development plan for native Android and iOS Cortex mobile applications using React Native.

## Overview

**Goal:** Create native mobile applications for Cortex that share code/logic with the existing React web application.

**Framework:** React Native (chosen for React ecosystem familiarity and code sharing potential)

**Platforms:** Android and iOS

---

## Phase 1: Development Environment Setup

### 1.1 Android Development (Linux/Windows/macOS)

#### Prerequisites

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk

# Verify Java installation
java --version
# Should show: openjdk 17.x.x

# Set JAVA_HOME (add to ~/.bashrc or ~/.zshrc)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$PATH:$JAVA_HOME/bin
```

#### Android Studio Installation

1. Download Android Studio from https://developer.android.com/studio
2. Extract and run:
   ```bash
   # Extract to /opt
   sudo tar -xzf android-studio-*.tar.gz -C /opt/

   # Run installer
   /opt/android-studio/bin/studio.sh
   ```
3. During setup, install:
   - Android SDK
   - Android SDK Platform 34 (or latest)
   - Android Virtual Device (AVD)
   - Intel HAXM or KVM for emulator acceleration

#### Environment Variables

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

#### Verify Android Setup

```bash
# Reload shell config
source ~/.bashrc

# Verify
adb --version
emulator -list-avds
```

### 1.2 iOS Development (macOS only)

#### Prerequisites

- macOS 12.0 or later
- Xcode 14+ from Mac App Store
- Xcode Command Line Tools

```bash
# Install Xcode CLI tools
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept

# Install CocoaPods
sudo gem install cocoapods
# Or with Homebrew:
brew install cocoapods
```

#### Verify iOS Setup

```bash
# Check Xcode
xcodebuild -version

# Check CocoaPods
pod --version

# List available simulators
xcrun simctl list devices
```

### 1.3 React Native CLI & Dependencies

```bash
# Install Watchman (recommended for file watching)
# Ubuntu
sudo apt-get install -y watchman
# macOS
brew install watchman

# Install React Native CLI globally
npm install -g react-native-cli

# Or use npx (no global install needed)
npx react-native --version
```

---

## Phase 2: Project Initialization

### 2.1 Create React Native Project

```bash
cd /home/jempson/development/cortex

# Create new React Native app in a 'mobile' subdirectory
npx react-native init CortexMobile --directory mobile

# Or with TypeScript (recommended)
npx react-native init CortexMobile --template react-native-template-typescript --directory mobile
```

### 2.2 Project Structure

```
cortex/
├── client/              # Existing React web app
├── server/              # Existing Node.js server
├── mobile/              # New React Native app
│   ├── android/         # Android native code
│   ├── ios/             # iOS native code
│   ├── src/
│   │   ├── components/  # Mobile-specific components
│   │   ├── screens/     # Screen components
│   │   ├── navigation/  # React Navigation setup
│   │   ├── services/    # API, WebSocket, E2EE
│   │   ├── hooks/       # Custom hooks (shared where possible)
│   │   ├── utils/       # Utilities
│   │   └── config/      # App configuration
│   ├── App.tsx
│   ├── package.json
│   └── ...
└── shared/              # Optional: shared code between web and mobile
    ├── constants/
    ├── types/
    └── utils/
```

### 2.3 Essential Dependencies

```bash
cd mobile

# Navigation
npm install @react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler

# Storage
npm install @react-native-async-storage/async-storage

# WebSocket (for real-time communication)
# React Native has built-in WebSocket support

# Push Notifications
npm install @react-native-firebase/app @react-native-firebase/messaging
# Or for Expo: expo-notifications

# Encryption (for E2EE)
npm install react-native-quick-crypto
# Or: react-native-crypto

# UI Components
npm install react-native-vector-icons
npm install react-native-linear-gradient

# Media
npm install react-native-image-picker
npm install react-native-video
npm install react-native-audio-recorder-player

# Secure Storage (for tokens, keys)
npm install react-native-keychain

# For iOS, install pods
cd ios && pod install && cd ..
```

---

## Phase 3: Core Feature Implementation

### 3.1 Authentication

- [ ] JWT token storage using react-native-keychain
- [ ] Login/Register screens
- [ ] Biometric authentication option (Face ID, fingerprint)
- [ ] Session management

### 3.2 Real-time Communication

- [ ] WebSocket connection manager
- [ ] Auto-reconnection logic
- [ ] Background WebSocket handling
- [ ] Typing indicators
- [ ] Online/offline status

### 3.3 End-to-End Encryption (E2EE)

- [ ] Port E2EE logic from web app
- [ ] Secure key storage using react-native-keychain
- [ ] Key exchange implementation
- [ ] Message encryption/decryption

### 3.4 Waves & Messages

- [ ] Wave list view
- [ ] Wave detail view with messages
- [ ] Message composition with rich text
- [ ] Threaded replies
- [ ] Reactions
- [ ] Unread indicators

### 3.5 Push Notifications

- [ ] Firebase Cloud Messaging (Android)
- [ ] Apple Push Notification Service (iOS)
- [ ] Notification handling when app is background/killed
- [ ] Deep linking from notifications to specific waves/messages

### 3.6 Media

- [ ] Image upload/display
- [ ] Camera capture
- [ ] Audio recording/playback
- [ ] Video recording/playback
- [ ] GIF search integration

### 3.7 Contacts & Groups

- [ ] Contact list
- [ ] Contact requests
- [ ] Group (Crew) management
- [ ] User profiles

---

## Phase 4: Platform-Specific Features

### 4.1 Android

- [ ] Material Design 3 styling
- [ ] Android back button handling
- [ ] Widget for unread count (optional)
- [ ] Share intent handling

### 4.2 iOS

- [ ] iOS design guidelines compliance
- [ ] Haptic feedback
- [ ] Share extension (optional)
- [ ] Siri shortcuts (optional)

---

## Phase 5: Testing & QA

### 5.1 Testing Setup

```bash
# Unit testing with Jest (included by default)
npm test

# E2E testing with Detox
npm install -g detox-cli
npm install detox --save-dev
```

### 5.2 Test Devices

**Android:**
- Emulator: Pixel 6 API 34
- Physical: Various Android 10+ devices

**iOS:**
- Simulator: iPhone 15 Pro (iOS 17)
- Physical: iPhone with iOS 15+

---

## Phase 6: Build & Distribution

### 6.1 Android Release Build

```bash
cd mobile/android

# Generate release keystore (one time)
keytool -genkey -v -keystore cortex-release.keystore -alias cortex -keyalg RSA -keysize 2048 -validity 10000

# Build release APK
./gradlew assembleRelease

# Build release AAB (for Play Store)
./gradlew bundleRelease
```

### 6.2 iOS Release Build

```bash
cd mobile/ios

# Archive for distribution
xcodebuild -workspace CortexMobile.xcworkspace -scheme CortexMobile -configuration Release archive -archivePath build/CortexMobile.xcarchive

# Export IPA
xcodebuild -exportArchive -archivePath build/CortexMobile.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/
```

### 6.3 Alternative: Expo EAS Build (Cloud)

If using Expo or for easier builds without local setup:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for both platforms
eas build --platform all
```

---

## Phase 7: App Store Submission

### 7.1 Google Play Store

1. Create Google Play Developer account ($25 one-time)
2. Create app listing with:
   - App name, description
   - Screenshots (phone, tablet)
   - Feature graphic
   - Privacy policy URL
3. Upload AAB file
4. Complete content rating questionnaire
5. Set up pricing & distribution
6. Submit for review

### 7.2 Apple App Store

1. Create Apple Developer account ($99/year)
2. Create App Store Connect listing with:
   - App name, description
   - Screenshots (various device sizes)
   - App preview videos (optional)
   - Privacy policy URL
3. Upload build via Xcode or Transporter
4. Complete App Review information
5. Submit for review

---

## iOS Development Without a Mac

Since the primary development machine is Linux, here are options for iOS:

### Option 1: Expo EAS Build (Recommended)

Build iOS apps in the cloud without a Mac:

```bash
# Install Expo
npx create-expo-app CortexMobile
# Or convert existing RN project to use Expo

# Build iOS in cloud
eas build --platform ios
```

### Option 2: Cloud Mac Services

- **MacStadium** - Dedicated Mac in the cloud
- **AWS EC2 Mac** - Mac instances on AWS
- **GitHub Actions** - macOS runners for CI/CD builds

### Option 3: Mac Mini for Build Server

Purchase a Mac Mini dedicated to iOS builds, accessible via SSH/VNC.

---

## Code Sharing Strategy

### Shareable Code (web ↔ mobile)

- Constants and configuration
- TypeScript types/interfaces
- API service layer (fetch calls)
- Business logic utilities
- E2EE encryption/decryption logic

### Platform-Specific Code

- UI components (React DOM vs React Native)
- Navigation
- Storage (localStorage vs AsyncStorage)
- Push notifications
- Native modules

### Monorepo Structure (Optional)

```bash
# Using npm workspaces or yarn workspaces
cortex/
├── packages/
│   ├── shared/          # Shared code
│   ├── web/             # React web app
│   └── mobile/          # React Native app
├── package.json         # Workspace root
└── ...
```

---

## Timeline Estimate

| Phase | Description | Duration |
|-------|-------------|----------|
| 1 | Environment Setup | 1-2 days |
| 2 | Project Init & Structure | 1 day |
| 3 | Core Features | 4-6 weeks |
| 4 | Platform-Specific | 1-2 weeks |
| 5 | Testing & QA | 2 weeks |
| 6 | Build & Release Setup | 1 week |
| 7 | Store Submission | 1-2 weeks |

**Total: 10-14 weeks** for MVP with core features

---

## Resources

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [React Navigation](https://reactnavigation.org/)
- [React Native Firebase](https://rnfirebase.io/)
- [Expo Documentation](https://docs.expo.dev/)
- [Android Studio Setup](https://developer.android.com/studio)
- [Xcode Documentation](https://developer.apple.com/documentation/xcode)

---

## Next Steps

1. [ ] Install Java JDK 17 on development machine
2. [ ] Install Android Studio and configure SDK
3. [ ] Initialize React Native project
4. [ ] Set up project structure
5. [ ] Implement authentication flow
6. [ ] Decide on iOS build strategy (EAS, cloud Mac, or physical Mac)
