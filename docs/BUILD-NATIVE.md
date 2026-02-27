# Native Build Instructions — macOS (Electron) & iOS (Capacitor)

These instructions cover building the Cortex desktop app for macOS and the iOS mobile app.

---

## Table of Contents

- [macOS Build — Electron](#macos-build--electron)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Add macOS target to electron-builder config](#add-macos-target-to-electron-builder-config)
  - [Create the entitlements file](#create-the-entitlements-file)
  - [Generate a macOS icon (.icns)](#generate-a-macos-icon-icns)
  - [Build the DMG](#build-the-dmg)
  - [Code Signing & Notarization](#code-signing--notarization-for-distribution)
  - [Unsigned local build](#unsigned-local-build-for-testing-only)
  - [Architecture notes](#architecture-notes)
- [iOS Build — Capacitor](#ios-build--capacitor)
  - [Prerequisites](#prerequisites-1)
  - [Setup](#setup-1)
  - [Build and sync web assets](#build-and-sync-web-assets)
  - [Open in Xcode](#open-in-xcode)
  - [Configure signing in Xcode](#configure-signing-in-xcode)
  - [Build for Simulator](#build-for-simulator-testing)
  - [Build for physical device](#build-for-physical-device)
  - [Build for App Store / TestFlight](#build-for-app-store--testflight)
  - [Build for Ad Hoc distribution](#build-for-ad-hoc-distribution-ipa)
  - [Push Notifications setup](#push-notifications-setup)
  - [Project structure reference](#project-structure-reference)
  - [Key configuration](#key-configuration)
  - [Common commands cheat sheet](#common-commands-cheat-sheet)
  - [Troubleshooting](#troubleshooting)

---

## macOS Build — Electron

### Prerequisites

- **macOS** (required for signing and notarization)
- **Node.js** 18+ and npm
- **Xcode Command Line Tools**: `xcode-select --install`
- **Apple Developer account** (for signing/notarization — optional for unsigned local builds)

### Setup

```bash
cd client
npm install
```

### Add macOS target to electron-builder config

The current `electron-builder.yml` only has `win` and `linux` targets. Add a `mac` section after the `linux` block:

```yaml
mac:
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  category: public.app-category.social-networking
  icon: electron/icon.icns
  darkModeSupport: true
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: electron/entitlements.mac.plist
  entitlementsInherit: electron/entitlements.mac.plist
```

### Create the entitlements file

Create `client/electron/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

### Generate a macOS icon (.icns)

Electron on macOS requires `.icns` format. Generate one from the existing 512px PNG:

```bash
cd client

# Create iconset directory
mkdir -p /tmp/Cortex.iconset

# Generate required sizes from source PNG
SOURCE="public/icons/icon-512x512.png"
sips -z 16   16   "$SOURCE" --out /tmp/Cortex.iconset/icon_16x16.png
sips -z 32   32   "$SOURCE" --out /tmp/Cortex.iconset/icon_16x16@2x.png
sips -z 32   32   "$SOURCE" --out /tmp/Cortex.iconset/icon_32x32.png
sips -z 64   64   "$SOURCE" --out /tmp/Cortex.iconset/icon_32x32@2x.png
sips -z 128  128  "$SOURCE" --out /tmp/Cortex.iconset/icon_128x128.png
sips -z 256  256  "$SOURCE" --out /tmp/Cortex.iconset/icon_128x128@2x.png
sips -z 256  256  "$SOURCE" --out /tmp/Cortex.iconset/icon_256x256.png
sips -z 512  512  "$SOURCE" --out /tmp/Cortex.iconset/icon_256x256@2x.png
sips -z 512  512  "$SOURCE" --out /tmp/Cortex.iconset/icon_512x512.png
cp "$SOURCE"       /tmp/Cortex.iconset/icon_512x512@2x.png

# Convert to .icns
iconutil -c icns /tmp/Cortex.iconset -o electron/icon.icns
```

### Build the DMG

```bash
# 1. Build the web assets
npm run build

# 2. Build the macOS Electron app (universal — both architectures)
npm run electron:build -- --mac

# Or for a specific arch only:
npm run electron:build -- --mac --arm64    # Apple Silicon
npm run electron:build -- --mac --x64      # Intel
```

Output appears in `client/electron-dist/`:

| File | Description |
|------|-------------|
| `Cortex-2.33.0-arm64.dmg` | Apple Silicon installer |
| `Cortex-2.33.0.dmg` | Intel installer |
| `Cortex-2.33.0-arm64-mac.zip` | Apple Silicon zip (for auto-updater) |
| `Cortex-2.33.0-mac.zip` | Intel zip (for auto-updater) |

### Code Signing & Notarization (for distribution)

For the DMG to open without Gatekeeper warnings, it must be signed and notarized. Set these environment variables **before** building:

```bash
# Apple Developer identity (from Keychain Access → "Developer ID Application: ...")
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"

# Or provide a .p12 certificate file instead
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate-password"

# For notarization (App Store Connect API key — recommended approach)
export APPLE_API_KEY="/path/to/AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Then build — electron-builder handles signing & notarization automatically
npm run electron:build -- --mac
```

### Unsigned local build (for testing only)

To skip signing entirely (the app will show Gatekeeper warnings on other machines):

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build -- --mac
```

### Architecture notes

- **Production mode**: The app loads a redirect page (`electron/app/index.html`) that navigates to `https://cortex.farhold.com`. There is no bundled offline app — it's a wrapper around the web app.
- **Dev mode**: Run `npm run dev` first (starts Vite on port 3000), then `npm run electron:dev` — it connects to `http://localhost:3000` with DevTools auto-opened.
- Window state (position/size/maximized) persists across launches in `~/Library/Application Support/Cortex/window-state.json`.
- Deep links via `cortex://` protocol are registered automatically.
- macOS gets `hiddenInset` title bar style for native look.
- Auto-updater code exists but is currently disabled in `electron/main.js` — uncomment the block in `app.whenReady()` once GitHub Releases with electron-builder artifacts are being published.

---

## iOS Build — Capacitor

### Prerequisites

- **macOS** with **Xcode 15+** (install from the App Store)
- **Xcode Command Line Tools**: `xcode-select --install`
- **Node.js** 18+ and npm
- **Apple Developer account** (required for device builds and App Store submission)
- An iPhone/iPad or Xcode Simulator

### Setup

```bash
cd client
npm install
```

### Build and sync web assets

```bash
# 1. Build the React app into dist/
npm run build

# 2. Sync web assets + plugins to the native iOS project
npx cap sync ios
```

`cap sync` does three things:
1. Copies `dist/` into `ios/App/App/public/`
2. Updates the native `capacitor.config.json` from `capacitor.config.ts`
3. Resolves and links Capacitor plugin native code via Swift Package Manager

> **Important**: You must run `npm run build && npx cap sync ios` every time the web code changes before building in Xcode.

### Open in Xcode

```bash
npx cap open ios
```

This opens `client/ios/App/App.xcodeproj` in Xcode.

### Configure signing in Xcode

1. In the Xcode sidebar, select the **App** project (blue icon at the top)
2. Select the **App** target
3. Go to the **Signing & Capabilities** tab
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple Developer account)
6. Verify the **Bundle Identifier** is `com.farhold.cortex`

### Build for Simulator (testing)

```bash
# From command line (lists available simulators and runs):
npx cap run ios --target "iPhone 16"

# Or from Xcode:
# 1. Select a simulator from the device dropdown (top bar)
# 2. Press Cmd+R (or Product → Run)
```

### Build for physical device

1. Connect the iPhone/iPad via USB
2. In Xcode, select the device from the device dropdown (top bar)
3. On first use, trust the developer certificate on the device: **Settings → General → VPN & Device Management**
4. Press **Cmd+R** to build and run

### Build for App Store / TestFlight

1. In Xcode, select **Any iOS Device (arm64)** from the device dropdown
2. **Product → Archive** (not Cmd+B — you must use Archive)
3. When archiving completes, the **Organizer** window opens automatically
4. Select the archive → click **Distribute App**
5. Choose **App Store Connect** → **Upload**
6. Follow the prompts for signing options
7. Once uploaded, go to [App Store Connect](https://appstoreconnect.apple.com) to submit for TestFlight or App Store review

### Build for Ad Hoc distribution (.ipa)

1. Archive as above (**Product → Archive**)
2. In Organizer → **Distribute App** → **Ad Hoc**
3. Select the provisioning profile
4. Export — produces a `.ipa` file you can install via Apple Configurator or `ios-deploy`

### Push Notifications setup

The app uses `@capacitor/push-notifications`. For push to work on iOS:

1. In Xcode → **Signing & Capabilities** tab → click **+ Capability** → add **Push Notifications**
2. Also add **Background Modes** capability → check **Remote notifications**
3. In your [Apple Developer account](https://developer.apple.com/account/resources/authkeys/list), create an **APNs Key** (Keys → +) — download the `.p8` file
4. The server's VAPID keys handle web push; native iOS push requires the APNs key to be configured with your push notification service

### Project structure reference

```
client/ios/
├── App/
│   ├── App/
│   │   ├── AppDelegate.swift        ← App lifecycle (standard Capacitor, no custom code)
│   │   ├── Info.plist               ← Bundle metadata
│   │   ├── capacitor.config.json    ← Auto-generated from capacitor.config.ts by cap sync
│   │   ├── Assets.xcassets/         ← App icons & splash screen images
│   │   ├── Base.lproj/             ← Storyboards (LaunchScreen, Main)
│   │   └── public/                  ← Web assets (copied from dist/ by cap sync)
│   ├── App.xcodeproj/               ← Xcode project file
│   └── CapApp-SPM/
│       └── Package.swift            ← Swift Package Manager deps (Capacitor 8.1.0)
```

### Key configuration

| Setting | Value |
|---------|-------|
| App ID | `com.farhold.cortex` |
| Min iOS version | 15 |
| Package manager | Swift Package Manager (not CocoaPods) |
| Capacitor version | 8.1.0 |
| Web dir | `dist` (built React app) |
| Production server | `https://cortex.farhold.com` |
| Background color | `#050805` |
| Plugins | App, Haptics, PushNotifications, SplashScreen, StatusBar |

### Common commands cheat sheet

```bash
npm run build              # Build web assets into dist/
npx cap sync ios           # Copy web assets + sync plugins to iOS project
npx cap open ios           # Open iOS project in Xcode
npx cap run ios            # Build & run on simulator or connected device
npx cap copy ios           # Copy web assets only (skip plugin sync — faster)
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| SPM package resolution fails | Xcode → File → Packages → Reset Package Caches, then File → Packages → Resolve Package Versions |
| Signing errors | Ensure you're signed into Xcode with your Apple ID: Xcode → Settings → Accounts |
| `public/` folder empty in Xcode | Run `npm run build && npx cap copy ios` before building |
| Push notifications not working on Simulator | Push only works on physical devices — this is an Apple limitation |
| Build fails with "no such module" | Run `npx cap sync ios` to ensure all plugin native code is linked |
| Stale web assets after code change | Always run `npm run build && npx cap sync ios` before building in Xcode |
