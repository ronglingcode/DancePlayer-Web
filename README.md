# Dance Player

A lightweight PWA for practicing dance moves. Pick a video from your device and use speed control, A-B looping, and mirror mode to learn choreography step by step.

## Features

- **Video playback** from local files (no upload, everything stays on your device)
- **Adjustable speed**: 0.25x, 0.5x, 0.6x, 0.75x, 0.8x, 1.0x
- **A-B loop**: set start/end points to repeat a section
- **Mirror mode**: flip the video horizontally so you can follow along as if looking in a mirror
- **Full loop**: video loops by default
- **PWA**: installable on iOS and Android for offline use
- **Keyboard shortcuts**: Space (play/pause), M (mirror)

## Use Locally

Just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## Deploy to Vercel

Connect your GitHub repo to Vercel, or deploy manually:

```bash
npx vercel
```

No build step needed -- it's a static site.

## Add to Home Screen

- **iOS Safari**: Tap the Share button, then "Add to Home Screen"
- **Android Chrome**: Tap the menu (three dots), then "Add to Home Screen" or "Install app"

## Icons

Replace `icon-192.png` and `icon-512.png` with your own app icons for the PWA manifest.
