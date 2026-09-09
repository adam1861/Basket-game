import { WIDTH, HEIGHT, MODES, clamp, createGame, serve, stepPhysics } from './physics.mjs';
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas'), ctx = canvas.getContext('2d'), video = $('video');
let game = createGame(), phase = 'idle', countdown = 3, accumulator = 0, previous = 0;
let stream = null, hands = null, busy = false, starting = false, generation = 0, inferenceGeneration = -1;
let calibrated = false, calibrationTime = 0, stableTime = 0, manualPause = false;
let samples = [[], []], ranges = [[.2, .8], [.2, .8]];
let seen = [-Infinity, -Infinity], positions = [.5, .5], keys = new Set();
let best = 0, announcement = '', announcementUntil = 0, audio = null;
let player = { name: '', promo: '' }, runRecorded = false;
try { best = Number(localStorage.getItem('hand-pong-best')) || 0; } catch { /* Storage is optional. */ }
try { player = JSON.parse(localStorage.getItem('hand-pong-player')) || player; } catch { /* Storage is optional. */ }
function leaderboard() {
  try { return JSON.parse(localStorage.getItem('hand-pong-leaderboard')) || []; } catch { return []; }
}
function renderLeaderboard() {
  const list = $('leaderboard-list'); if (!list || typeof document.createElement !== 'function') return;
  const scores = leaderboard().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10);
  list.replaceChildren(...(scores.length ? scores.map((entry, index) => {
    const item = document.createElement('li'), identity = document.createElement('span'), rank = document.createElement('b'), promo = document.createElement('small'), score = document.createElement('strong');
    rank.textContent = index + 1; identity.append(rank, document.createTextNode(entry.name), promo); promo.textContent = entry.promo; score.textContent = entry.score; item.append(identity, score); return item;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-leaderboard', textContent: 'No scores yet. Be the first.' })]));
}
function recordRun() {
  if (runRecorded || !player.name || !player.promo) return;
  runRecorded = true;
  const scores = leaderboard(); scores.push({ name: player.name, promo: player.promo, score: game.score });
  try { localStorage.setItem('hand-pong-leaderboard', JSON.stringify(scores.slice(-50))); } catch { /* Storage is optional. */ }
  renderLeaderboard();
}
const keyboard = () => $('control-mode').value === 'keyboard';
const status = (message) => { if ($('status').textContent !== message) $('status').textContent = message; };
const tracked = (now) => keyboard() || (stream && seen.every((time) => now - time < 500));
function sound(frequency = 520) {
  if (!$('sound').checked) return;
  try {
    audio ||= new AudioContext(); void audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.05, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .09);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .1);
  } catch { /* Audio must never interrupt a game. */ }
}
function reset() {
  game = createGame($('difficulty').value); accumulator = 0; manualPause = false; stableTime = 0; announcementUntil = 0;
  runRecorded = false;
  phase = keyboard() || calibrated ? 'waiting' : 'idle';
  if (stream && !calibrated && !keyboard()) calibrate();
  status(keyboard() ? 'Keyboard ready. Get set!' : 'Enable your camera, then calibrate your hands.');
}
function calibrate() {
  if (!stream || keyboard() || game.lives <= 0) return;
  calibrated = false; calibrationTime = 0; samples = [[], []]; phase = 'calibrating'; manualPause = false; accumulator = 0;
}
function stopCamera() {
  generation++; stream?.getTracks().forEach((track) => track.stop());
  stream = null; video.srcObject = null; seen = [-Infinity, -Infinity];
  if (phase === 'calibrating') phase = 'idle';
  $('start-btn').textContent = 'Enable camera';
}
async function populateCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const selected = $('camera-select').value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('camera-select').replaceChildren(new Option('Default camera', ''));
  devices.forEach((device, i) => $('camera-select').add(new Option(device.label || `Camera ${i + 1}`, device.deviceId)));
  if (devices.some((d) => d.deviceId === selected)) $('camera-select').value = selected;
}
function cameraError(error) {
  return ({ NotAllowedError: 'Camera permission denied. Allow camera access in your browser, or choose Keyboard.',
    NotFoundError: 'No camera found. Connect a webcam or choose Keyboard.',
    NotReadableError: 'Camera is busy. Close other camera apps and try again.',
    OverconstrainedError: 'Selected camera is unavailable. Choose Default camera and retry.',
    SecurityError: 'Camera access requires HTTPS or localhost. You can still use Keyboard.' })[error.name] || `Camera could not start: ${error.message}. Try again or choose Keyboard.`;
}
async function startCamera() {
  if (starting) return;
  if (!navigator.mediaDevices?.getUserMedia) { status('Camera requires HTTPS or localhost and a supported browser. Choose Keyboard to play now.'); return; }
  starting = true; $('start-btn').disabled = true; stopCamera(); const token = generation;
  status('Starting camera and hand tracking…');
  try {
    if (typeof window.Hands !== 'function') throw new Error('Hand tracking failed to load; check your connection');
    if (!hands) {
      hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 1, selfieMode: true, minDetectionConfidence: .65, minTrackingConfidence: .6 });
      hands.onResults((results) => {
        if (!stream || keyboard() || inferenceGeneration !== generation) return;
        (results.multiHandLandmarks || []).forEach((landmarks, i) => {
          const label = results.multiHandedness?.[i]?.label;
          if (!['Left', 'Right'].includes(label)) return;
          const side = label === 'Left' ? 0 : 1;
          positions[side] = (landmarks[0].y + landmarks[9].y) / 2; seen[side] = performance.now();
          if (phase === 'calibrating') samples[side].push(positions[side]);
        });
      });
    }
    const deviceId = $('camera-select').value;
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    if (token !== generation) { acquired.getTracks().forEach((track) => track.stop()); return; }
    stream = acquired; video.srcObject = stream; await video.play();
    if (token !== generation) return;
    $('control-mode').value = 'hands'; $('start-btn').textContent = 'Restart camera';
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (token === generation) { stopCamera(); status('Camera disconnected. Reconnect it or choose Keyboard.'); } });
    await populateCameras();
    if (token === generation) { if (game.lives <= 0) reset(); calibrate(); }
  } catch (error) { if (token === generation) { stopCamera(); status(cameraError(error)); } }
  finally { starting = false; $('start-btn').disabled = false; }
}
function update(dt, now) {
  const available = tracked(now);
  $('tracking').textContent = keyboard() ? 'Keyboard controls active' : `Left ${now - seen[0] < 500 ? '●' : '○'}  ·  Right ${now - seen[1] < 500 ? '●' : '○'}`;
  const half = MODES[game.difficulty].paddle / 2;
  game.paddles.forEach((y, side) => {
    if (keyboard()) {
      const up = side === 0 ? 'w' : 'arrowup', down = side === 0 ? 's' : 'arrowdown';
      game.paddles[side] = clamp(y + ((keys.has(down) ? 1 : 0) - (keys.has(up) ? 1 : 0)) * 650 * dt, half, HEIGHT - half);
    } else if (now - seen[side] < 500) {
      const [min, max] = ranges[side];
      const target = half + clamp((positions[side] - min) / (max - min), 0, 1) * (HEIGHT - 2 * half);
      game.paddles[side] = y + (target - y) * (1 - Math.exp(-14 * dt));
    }
  });
  if (phase === 'calibrating') {
    if (available) calibrationTime += dt;
    status(available ? `Calibration: move BOTH hands comfortably up and down · ${Math.ceil(4 - calibrationTime)}s` : 'Calibration: show both hands to continue.');
    if (calibrationTime >= 4) {
      const measured = samples.map((values) => { const sorted = [...values].sort((a, b) => a - b); return [sorted[Math.floor(sorted.length * .05)], sorted[Math.floor(sorted.length * .95)]]; });
      if (measured.some(([min, max]) => !Number.isFinite(min) || max - min < .12)) {
        calibrationTime = 0; samples = [[], []]; announcement = 'Move BOTH hands farther up and down'; announcementUntil = now + 3000;
      } else { ranges = measured; calibrated = true; phase = 'waiting'; stableTime = 0; }
    }
    return;
  }
  if (manualPause || phase === 'idle' || phase === 'over') return;
  if (!available) {
    phase = 'waiting'; stableTime = 0; accumulator = 0;
    if (stream) status('Paused — show both hands to resume.');
    return;
  }
  if (phase === 'waiting') {
    stableTime += dt; status('Hold steady…');
    if (stableTime >= .6) { phase = 'countdown'; countdown = 3; } return;
  }
  if (phase === 'countdown') {
    countdown -= dt; status(`Ready in ${Math.max(1, Math.ceil(countdown))}…`);
    if (countdown <= 0) { phase = 'playing'; status('Keep the rally alive!'); } return;
  }
  accumulator += dt;
  while (accumulator >= 1 / 240) {
    accumulator -= 1 / 240; const event = stepPhysics(game, 1 / 240);
    if (event === 'hit') {
      sound();
      if (game.score > best) { best = game.score; try { localStorage.setItem('hand-pong-best', String(best)); } catch { /* Storage may be disabled. */ } }
      if (game.rally % 10 === 0) { announcement = `${game.rally} HIT RALLY!`; announcementUntil = now + 1800; sound(880); }
    }
    if (event === 'miss') {
      sound(160); accumulator = 0;
      if (game.lives <= 0) { phase = 'over'; recordRun(); status(`Game over · ${game.score} points. Press R to play again.`); }
      else { serve(game, game.ball.vx > 0 ? -1 : 1); phase = 'waiting'; stableTime = 0; } break;
    }
  }
}
function draw(now) {
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#25352b'; ctx.lineWidth = 2; ctx.setLineDash([10, 16]);
  ctx.beginPath(); ctx.moveTo(WIDTH / 2, 24); ctx.lineTo(WIDTH / 2, HEIGHT - 24); ctx.stroke(); ctx.setLineDash([]);
  const height = MODES[game.difficulty].paddle;
  game.paddles.forEach((y, side) => { ctx.fillStyle = side === 0 ? '#00e676' : '#69f0ae'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18; ctx.fillRect(side === 0 ? 56 : WIDTH - 72, y - height / 2, 16, height); });
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(game.ball.x, game.ball.y, game.ball.r, 0, Math.PI * 2); ctx.fill();
  if (phase !== 'playing' || manualPause) {
    ctx.fillStyle = '#0a0a0ae6'; ctx.fillRect(150, 230, WIDTH - 300, 250); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 48px Inter, sans-serif';
    const title = manualPause ? 'PAUSED' : ({ idle: 'HAND PONG', calibrating: 'FIND YOUR RANGE', waiting: 'GET READY', countdown: String(Math.max(1, Math.ceil(countdown))), over: 'NICE RUN' })[phase];
    ctx.fillText(title, WIDTH / 2, 325); ctx.font = '24px Inter, sans-serif'; ctx.fillStyle = '#b7c4bc';
    ctx.fillText(phase === 'over' ? `${game.score} points · Press R to play again` : phase === 'calibrating' ? 'Move both hands up and down' : manualPause ? 'Press Space or Resume to continue' : keyboard() ? 'Left: W / S     Right: ↑ / ↓' : 'Show both hands · or choose Keyboard', WIDTH / 2, 385);
  }
  if (now < announcementUntil) { ctx.textAlign = 'center'; ctx.font = '900 30px Inter, sans-serif'; ctx.fillStyle = '#00e676'; ctx.fillText(announcement, WIDTH / 2, 90); }
  $('score').textContent = game.score; $('best').textContent = best; $('lives').textContent = '♥'.repeat(game.lives) || '0'; $('rally').textContent = game.rally;
  $('pause-btn').textContent = manualPause ? 'Resume' : 'Pause';
  $('calibrate-btn').disabled = !stream || keyboard() || phase === 'over';
}
function frame(now) {
  const dt = Math.min((now - previous) / 1000 || 0, .1); previous = now;
  if (!document.hidden) { update(dt, now); draw(now); }
  if (stream && !keyboard() && hands && !busy && video.readyState >= 2 && !document.hidden) {
    busy = true; const token = generation; inferenceGeneration = token;
    hands.send({ image: video }).catch(() => { if (token === generation) { stopCamera(); status('Hand tracking stopped. Restart the camera or choose Keyboard.'); } }).finally(() => { busy = false; });
  }
  requestAnimationFrame(frame);
}
function pause() {
  if (['idle', 'calibrating', 'over'].includes(phase)) return;
  manualPause = !manualPause; keys.clear(); accumulator = 0;
  if (!manualPause) { phase = 'waiting'; stableTime = 0; }
  status(manualPause ? 'Paused. Press Space or Resume.' : 'Get ready to resume…');
}
$('start-btn').addEventListener('click', startCamera);
$('player-form')?.addEventListener('submit', (event) => { event.preventDefault(); player = { name: $('player-name').value.trim(), promo: $('player-promo').value.trim() }; try { localStorage.setItem('hand-pong-player', JSON.stringify(player)); } catch { /* Storage is optional. */ } document.querySelectorAll('.player-required').forEach((control) => { control.disabled = false; }); reset(); status(`Ready, ${player.name}. Choose your controls to begin.`); });
$('reset-btn').addEventListener('click', reset);
$('calibrate-btn').addEventListener('click', calibrate);
$('pause-btn').addEventListener('click', pause);
$('difficulty').addEventListener('change', () => { reset(); $('difficulty').blur(); });
$('control-mode').addEventListener('change', () => { stopCamera(); calibrated = false; keys.clear(); reset(); $('control-mode').blur(); });
$('camera-select').addEventListener('change', () => { if (stream) void startCamera(); });
$('preview').addEventListener('change', () => { video.hidden = !$('preview').checked; });
$('sound').addEventListener('change', () => sound());
$('fullscreen-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('stage').requestFullscreen(); } catch { status('Fullscreen is unavailable in this browser.'); } });
document.addEventListener('fullscreenchange', () => { $('fullscreen-btn').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || (event.target.tagName === 'BUTTON' && key === ' ')) return;
  if (['arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault(); keys.add(key);
  if (!event.repeat && key === 'r') reset(); if (!event.repeat && key === ' ') pause();
});
document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
function loseFocus() { keys.clear(); if (phase === 'playing' || phase === 'countdown') { manualPause = true; accumulator = 0; status('Paused while you were away. Press Resume.'); } }
window.addEventListener('blur', loseFocus);
document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); previous = performance.now(); });
window.addEventListener('pagehide', stopCamera);
populateCameras().catch(() => status('Camera list unavailable. Try Enable camera or choose Keyboard.'));
if ($('player-name')) $('player-name').value = player.name;
if ($('player-promo')) $('player-promo').value = player.promo;
renderLeaderboard();
reset(); requestAnimationFrame(frame);
