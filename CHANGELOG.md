# Changelog

## Unreleased

- Casting: videos the TV browser can't decode (usually HEVC / H.265) now show a clear message on the TV and a fix-it tip on the phone, instead of a black screen
- Casting: files with no MIME type are detected by extension (e.g. .mkv, .mov)

## 1.1.0 — 2026-11-10

- **Wired mode:** native Android and iOS apps show the desktop on any TV or monitor connected over HDMI / USB‑C, fully offline (no smart TV or internet needed)
- `NativeTransport` bridge in the web app, with a "Connect a TV or monitor" guide on the phone
- Self-hosted Geist fonts (offline-ready, no Google Fonts request)
- Equal-size window controls, device mockups on the landing page, WebP hero image

## 1.0.0 — 2026-11-10

First public release.

- TV desktop with movable, resizable, snappable windows; dock; command-palette launcher; status widgets
- Apps: Photos, Player (photos, video, audio), Music, Notes, Browser, Calculator, Settings
- Phone controller for Android and iPhone: trackpad gestures, keyboard (with autocorrect), app launcher, casting, now-playing remote
- Serverless peer-to-peer mode over WebRTC, which the static Vercel deployment uses
- Optional self-hosted Node server for LAN setups, with media streaming and Range support
- Pairing by QR code or 6-digit code; recent TVs on the phone
- Creative Tim UI / shadcn-inspired light design, Lucide icons, Geist type
