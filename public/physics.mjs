export const WIDTH = 1280, HEIGHT = 720;
export const MODES = { easy: { speed: 420, max: 780, paddle: 170 }, normal: { speed: 560, max: 1050, paddle: 140 }, hard: { speed: 700, max: 1300, paddle: 110 } };
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function serve(g, direction = 1) { g.ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: MODES[g.difficulty].speed * direction, vy: 100, r: 12 }; g.rally = 0; }
export function createGame(difficulty = 'normal') { const g = { difficulty, score: 0, rally: 0, lives: 3, paddles: [HEIGHT / 2, HEIGHT / 2] }; serve(g); return g; }
// Run at a fixed 240 Hz, independently of hand tracking and rendering.
export function stepPhysics(g, dt) {
  const b = g.ball, mode = MODES[g.difficulty];
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
  if (b.y > HEIGHT - b.r) { b.y = HEIGHT - b.r; b.vy = -Math.abs(b.vy); }
  for (let side = 0; side < 2; side++) {
    const face = side === 0 ? 72 : WIDTH - 72;
    const approaching = side === 0 ? b.vx < 0 : b.vx > 0;
    const touching = side === 0 ? b.x - b.r <= face && b.x + b.r >= face - 16 : b.x + b.r >= face && b.x - b.r <= face + 16;
    if (approaching && touching && Math.abs(b.y - g.paddles[side]) <= mode.paddle / 2 + b.r) {
      const angle = clamp((b.y - g.paddles[side]) / (mode.paddle / 2), -1, 1) * Math.PI / 3;
      const speed = Math.min(Math.hypot(b.vx, b.vy) * 1.045, mode.max);
      b.vx = Math.cos(angle) * speed * (side === 0 ? 1 : -1); b.vy = Math.sin(angle) * speed;
      b.x = face + (side === 0 ? b.r : -b.r); g.score++; g.rally++; return 'hit';
    }
  }
  if (b.x < -b.r || b.x > WIDTH + b.r) { g.lives--; return 'miss'; }
  return null;
}
