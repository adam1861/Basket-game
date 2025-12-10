# Basketball Hand Gesture Game

Two ways to play:
- **Browser build (Vercel-ready)**: lives in `public/`, uses MediaPipe Hands in JavaScript, and runs entirely client-side.
- **Desktop build**: original Python/OpenCV game in `game4.py` for offline play.

## Features

- Real-time hand tracking (up to 2 hands) powered by MediaPipe
- Paddle control with your left and right hands
- Live scoring, reset button/`R` shortcut, and game-over screen
- Runs in the browser on desktop or mobile with a camera

## Play it locally (browser build)

```bash
# from repo root
python -m http.server --directory public 3000
# or: npx serve public
```
Then open http://localhost:3000 and allow camera access.

## Deploy to Vercel (static)

1. Push this repo to GitHub (or import it in Vercel).
2. Create a Vercel project and set the output/public directory to `public`.
3. Deploy. `vercel.json` is included to serve the static assets.

## Desktop (Python/OpenCV) build

Requirements:
- Python 3.8+ and a webcam
- 1280x720 resolution recommended

Install and run:
```bash
pip install -r requirements.txt
python game4.py
```

### Controls (Python build)

- **Left Hand**: Control left paddle
- **Right Hand**: Control right paddle
- **`r` key**: Reset/restart the game
- **`q` key**: Quit the game

## Assets

All sprites live in `Resources/` (and are mirrored under `public/Resources/` for the web build):
- `Background.png`
- `gameOver.png`
- `Ball.png`
- `bat1.png`
- `bat2.png`

## Troubleshooting

- **Camera blocked**: Allow webcam permission in your browser or OS.
- **No hand movement**: Ensure good lighting and keep hands within the frame.
- **Images missing**: Check that the files exist under `Resources/` (root and `public/Resources/`).
- **Low FPS (Python)**: Close other apps or lower display resolution.
