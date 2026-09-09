# Hand Pong

A browser Pong game controlled by both hands or a keyboard. Keep the ball alive: every paddle return earns a point, and three misses end the run.

## Play locally

```bash
python -m http.server --directory public 3000
```

Open http://localhost:3000. Choose **Keyboard** to play immediately, or **Enable camera** for hand tracking. Camera access requires localhost or HTTPS. MediaPipe loads from a pinned CDN version and requires an internet connection; camera frames are processed locally in the browser.

## Controls and features

- **Hand tracking:** Move both hands comfortably up and down during the four-second calibration. Each hand needs a visible vertical range; calibration repeats if the range is too small. Use Calibrate to adjust it again.
- **Tracking recovery:** Paddles retain their position during a 500 ms tracking grace period. Play then pauses until both hands return, followed by a ready countdown.
- **Keyboard:** W/S moves the left paddle; up/down arrows move the right. Both paddles are player controlled, so you can play alone or share the keyboard.
- **Space / Pause:** Pause or resume with a fresh countdown. Switching tabs or losing window focus also pauses play.
- **R / Restart:** Start a new three-life run.
- **Easy / Normal / Hard:** Different paddle sizes, starting speeds and speed caps. Changing difficulty starts a new run.
- **Bounce physics:** Edge hits change the angle; each return increases speed by 4.5% up to the difficulty cap. Fixed 240 Hz physics runs independently of hand tracking and rendering. Long frame stalls are capped at 100 ms to avoid skipping through a rally.
- **Replay:** Cumulative score, current rally, three lives, and a best score across modes saved on this device when browser storage is available. Every ten rally hits triggers a milestone.
- **Display and audio:** Fullscreen, hideable mirrored camera preview, and optional synthesized hit sounds. Switching to keyboard releases the camera.

## Checks

Node.js is needed only to run the dependency-free automated checks:

```bash
node --test tests/game.test.mjs
```

Tests cover physics timing, collisions and speed caps, lives, countdown and pause, calibration and tracking recovery using simulated hand results, and best-score saving. Actual camera accuracy, audio output, fullscreen and responsive appearance still require a browser/device check.

## Deployment

The static browser build is in `public/`. The existing `vercel.json` serves it; no build step is needed.

## Legacy desktop prototype

The original Python basketball-themed prototype remains in `game4.py`; the Hand Pong enhancements apply to the browser build. Its sprites are in `Resources/` (with the original copies also retained under `public/Resources/`).

```bash
pip install -r requirements.txt
python game4.py
```

The legacy version uses left/right hand controls, R to restart and Q to quit, and expects a 1280×720 webcam feed.

## Visual identity

The browser interface follows the E++ guide in `visual identity/visual_identity.png`: black (#0A0A0A), charcoal (#161616), white, green (#00E676 / #00C853) and mint (#69F0AE), with ring and dot motifs. The supplied logo is copied unchanged to `public/brand/logo.png` for static hosting. Body text uses Inter via Google Fonts with system fallbacks. The guide's Monument Extended font file was not supplied; headings use it if installed, otherwise a heavy system display fallback.
