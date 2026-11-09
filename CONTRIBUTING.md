# Contributing to PocketDesk

Thanks for helping! PocketDesk is deliberately simple: plain HTML, CSS and JavaScript, with no framework and no build step.

## Getting started

```bash
git clone https://github.com/Bharathshiva24/pocketdesk.git
cd pocketdesk
npm install
npm start              # self-hosted server on http://localhost:8080
```

- Open `http://localhost:8080/demo` to see the TV and phone side by side in one window. This is the quickest way to iterate.
- Open `/tv` and `/phone` in two browser windows (or on a real TV and phone) to test pairing.
- Add `?mode=p2p` to test the serverless WebRTC mode that the Vercel deployment uses.

## Project layout

| Path | What it is |
|---|---|
| `public/js/tv.js` | TV desktop: windows, dock, launcher, apps, pointer and input engine |
| `public/js/phone.js` | Phone controller: trackpad, keyboard, apps, cast, media |
| `public/js/transport.js` | WebSocket, WebRTC (PeerJS) and in-page transports |
| `public/js/icons.js` | Lucide icons and the shared app catalogue |
| `public/css/*.css` | Design tokens and styles (Creative Tim UI / shadcn look) |
| `server/index.js` | Optional self-hosted server (pairing, relay, media streaming) |
| `apps/android`, `apps/ios` | Native shells for wired HDMI / USB‑C mode (see `docs/WIRED.md`) |
| `tests/` | `node:test` integration tests |

## Guidelines

- **Keep it dependency-free in the browser.** Third-party browser code lives in `public/vendor/` (update it with `npm run vendor`).
- **Follow the design system.** Orange is the only brand accent. Use emerald, amber, red and blue for status. No violet or purple. Use the existing CSS tokens, not new hex values.
- **Design for the sofa.** TV text should stay readable at 3 m. Test with the TV remote's arrow keys too.
- **Run `npm test`** before opening a pull request, and include screenshots for UI changes.

## Message protocol

Phone and TV exchange small JSON messages (`move`, `click`, `text`, `key`, `open`, `cast`, `media`, …). See the protocol table in the README. If you add a message, handle it in both `tv.js` and `phone.js`, and in `server/index.js` if the server needs to understand it.

## Reporting bugs

Use the issue templates. Include the TV model and browser, the phone model and OS, and whether you used the hosted or self-hosted mode.

By contributing you agree that your contributions are licensed under the MIT License.
