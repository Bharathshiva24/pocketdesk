# Wired mode: any TV or monitor over HDMI / USB‑C

Use PocketDesk with **any screen that has an HDMI input**, including non‑smart TVs, old monitors and hotel TVs, with **no internet connection**. Your phone runs the whole app:

- the **TV or monitor** shows the desktop (windows, dock, apps)
- the **phone screen** stays your trackpad, keyboard and remote

This needs the PocketDesk **native app** (Android or iOS), because a website can't choose what appears on a cable-connected screen. The native apps bundle the same web app found in `public/`, so they work fully offline.

```
 ┌───────── TV / monitor (HDMI input) ─────────┐        USB‑C → HDMI         ┌──── Phone ────┐
 │  PocketDesk desktop  (tv.html, WebView #2)  │ ◀───────── cable ────────── │  phone.html   │
 └─────────────────────────────────────────────┘   (or a wireless display)   │  WebView #1   │
                                                                              └──── native ───┘
```

## Using it

1. Install the PocketDesk app on your phone (see [Building](#building) below).
2. Connect the phone to the TV:
   - **USB‑C phones:** a USB‑C → HDMI cable or adapter. A hub with a charging port keeps the phone powered.
   - **Lightning iPhones:** Apple's Lightning Digital AV Adapter.
3. On the TV remote, press **Input** / **Source** and pick the HDMI port you used.
4. Open PocketDesk. The desktop appears on the TV and the phone shows the trackpad. Unplug and the phone shows "Connect a TV or monitor" until you plug back in.

## Compatibility

| Phone | Works? | Notes |
|---|---|---|
| **iPhone 15 and later** (USB‑C) | ✅ | Any USB‑C → HDMI adapter. PocketDesk shows its own desktop on the screen, not a mirror. |
| **iPhone with Lightning** | ✅ | Lightning Digital AV Adapter. |
| **iPad** (USB‑C or Lightning) | ✅ | Same as iPhone. |
| **Android with USB‑C video out** (DisplayPort Alt Mode) | ✅ | Most Samsung Galaxy S / Note / Z / Tab flagships, many Motorola, Sony, OnePlus, ASUS and Xiaomi models, and recent Google Pixels. Check your phone's specs for "DisplayPort", "video output" or "HDMI out". |
| **Android with Samsung DeX / Motorola Ready For** | ✅ | If the phone starts DeX or Ready For automatically, switch the connection to **screen mirroring** mode so PocketDesk can draw its own desktop. |
| **Android without wired video out** | ⚠️ | Use a wireless display instead (Smart View / Screen cast to a Miracast TV or dongle). Android exposes it to PocketDesk the same way. |
| **Any phone in a browser** (no app) | ➖ | Use the hosted version with a smart TV or a computer on the TV: [pocketdesk-pi.vercel.app](https://pocketdesk-pi.vercel.app). |

TV requirements: an HDMI input. No apps, no smart features and no internet.

## Building

### Android (`apps/android`)

Requirements: Android Studio Ladybug (2024.2) or newer, or JDK 17 plus the Android SDK.

1. **Android Studio:** *File → Open* → `apps/android`. Let Gradle sync, plug in your phone (USB debugging on) and press **Run**.
2. **Command line:**
   ```bash
   cd apps/android
   gradle wrapper            # once, if you have Gradle installed
   ./gradlew assembleRelease # → app/build/outputs/apk/release/app-release.apk
   ```
   The release build is signed with the debug key so it installs directly. Use your own keystore for Google Play.

The build copies `public/` into the APK automatically, so web changes are picked up on the next build.

How it works: `MainActivity` shows `phone.html` in a WebView and listens to `DisplayManager`. When a presentation display appears, a `Presentation` dialog shows `tv.html` on it in a second WebView. Both pages are served from the APK by `WebViewAssetLoader`, and cast media is written to the app cache and served from `/www/media/`.

### iOS (`apps/ios`)

Requirements: a Mac with Xcode 15 or newer, and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
cd apps/ios
xcodegen                 # generates PocketDesk.xcodeproj
open PocketDesk.xcodeproj
```

In Xcode: select the **PocketDesk** target → *Signing & Capabilities* → choose your **Team** (a free Apple ID works for your own phone). Then plug in your iPhone and press **Run**.

How it works: the app's phone scene shows `phone.html`. When a display is connected, iOS creates an **external display scene** (`UIWindowSceneSessionRoleExternalDisplayNonInteractive`), which shows `tv.html` full-screen. Both pages load from a local copy of the bundled web app, and `Hub.swift` relays messages and stores cast media next to it.

## Bridge protocol

The web app detects the native shell (`window.PocketDeskNative` on Android, `webkit.messageHandlers.pocketdesk` on iOS) and switches to `NativeTransport` (`public/js/transport.js`). Pages post JSON envelopes:

| `type` | From | Meaning |
|---|---|---|
| `ready` | both | Page loaded. The TV's ready makes the shell send `{t:'tv-ready'}` to the phone. |
| `msg` | both | A normal PocketDesk message (`move`, `click`, `text`, `cast`…), relayed to the other screen |
| `file-start` / `file-chunk` / `file-end` | phone | Streams a cast file (base64 chunks) into the local media folder. The TV loads it as `media/<name>`. |

The shell also sends `{t:'display', connected, name}` to the phone whenever a screen is attached or removed.
