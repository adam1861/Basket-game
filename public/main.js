const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset-btn");
const startBtn = document.getElementById("start-btn");
const cameraSelect = document.getElementById("camera-select");
const hintEl = document.querySelector(".overlay-hint");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const assetPaths = {
  background: "./Resources/Background.png",
  gameOver: "./Resources/gameOver.png",
  ball: "./Resources/Ball.png",
  batLeft: "./Resources/bat1.png",
  batRight: "./Resources/bat2.png",
};

const assets = {};
const state = {
  ballX: 180,
  ballY: 220,
  speedX: 12,
  speedY: 10,
  scoreLeft: 0,
  scoreRight: 0,
  gameOver: false,
  ready: false,
  lastHandsAt: 0,
  cameraStarted: false,
  cameraStarting: false,
  selectedDeviceId: null,
  stream: null,
  frameReq: null,
  processingFrame: false,
};

let handsInstance = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadAssets = async () => {
  const entries = await Promise.all(
    Object.entries(assetPaths).map(
      ([key, src]) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([key, img]);
          img.onerror = () => reject(new Error(`Failed to load ${src}`));
          img.src = src;
        }),
    ),
  );

  entries.forEach(([key, img]) => {
    assets[key] = img;
  });
  state.ready = true;
};

const resetGame = () => {
  state.ballX = 200;
  state.ballY = 200;
  state.speedX = 12;
  state.speedY = 10;
  state.scoreLeft = 0;
  state.scoreRight = 0;
  state.gameOver = false;
  setStatus("Ready - show your hands to move the bats");
};

const setStatus = (msg) => {
  statusEl.textContent = msg;
};

const computeHandBoxes = (results) => {
  const boxes = [];
  const { multiHandLandmarks, multiHandedness } = results;
  if (!multiHandLandmarks || !multiHandedness) {
    return boxes;
  }

  multiHandLandmarks.forEach((landmarks, i) => {
    const handed = multiHandedness[i];
    const xs = landmarks.map((p) => p.x * WIDTH);
    const ys = landmarks.map((p) => p.y * HEIGHT);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    boxes.push({
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      label: handed?.label || "Unknown",
    });
  });

  return boxes;
};

const checkPaddleCollision = (box, ballW, ballH) => {
  const paddleH = assets.batLeft.height;
  const paddleW = assets.batLeft.width;
  const paddleMargin = 48;
  const centerY = box.y + box.h / 2;
  const y = clamp(centerY - paddleH / 2, 20, HEIGHT - paddleH - 20);

  if (box.label === "Left") {
    ctx.drawImage(assets.batLeft, paddleMargin, y, paddleW, paddleH);
    const intersectsX =
      state.ballX <= paddleMargin + paddleW &&
      state.ballX + ballW >= paddleMargin;
    const intersectsY =
      state.ballY + ballH >= y && state.ballY <= y + paddleH;
    if (!state.gameOver && intersectsX && intersectsY) {
      state.speedX = Math.abs(state.speedX);
      state.ballX = paddleMargin + paddleW + 6;
      state.scoreLeft += 1;
    }
  } else if (box.label === "Right") {
    const paddleX = WIDTH - paddleMargin - paddleW;
    ctx.drawImage(assets.batRight, paddleX, y, paddleW, paddleH);
    const intersectsX =
      state.ballX + ballW >= paddleX && state.ballX <= paddleX + paddleW;
    const intersectsY =
      state.ballY + ballH >= y && state.ballY <= y + paddleH;
    if (!state.gameOver && intersectsX && intersectsY) {
      state.speedX = -Math.abs(state.speedX);
      state.ballX = paddleX - ballW - 6;
      state.scoreRight += 1;
    }
  }
};

const drawScore = () => {
  ctx.fillStyle = "#ffffff";
  ctx.font = '48px "Space Grotesk", sans-serif';
  ctx.fillText(String(state.scoreLeft).padStart(2, "0"), 280, HEIGHT - 40);
  ctx.fillText(String(state.scoreRight).padStart(2, "0"), WIDTH - 360, HEIGHT - 40);
};

const renderFrame = (handBoxes) => {
  if (!state.ready) return;

  const ballW = assets.ball.width;
  const ballH = assets.ball.height;

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(assets.background, 0, 0, WIDTH, HEIGHT);

  handBoxes.forEach((box) => checkPaddleCollision(box, ballW, ballH));

  if (!state.gameOver) {
    if (state.ballY <= 0 || state.ballY + ballH >= HEIGHT) {
      state.speedY = -state.speedY;
    }

    state.ballX += state.speedX;
    state.ballY += state.speedY;

    ctx.drawImage(assets.ball, state.ballX, state.ballY, ballW, ballH);

    const outOfBounds =
      state.ballX < 12 || state.ballX + ballW > WIDTH - 12;
    if (outOfBounds) {
      state.gameOver = true;
      setStatus("Game over - press reset or R to try again");
    }
  } else {
    ctx.drawImage(assets.gameOver, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e0115f";
    ctx.font = '64px "Space Grotesk", sans-serif';
    const totalScore = state.scoreLeft + state.scoreRight;
    ctx.fillText(String(totalScore).padStart(2, "0"), WIDTH / 2 - 32, HEIGHT / 2 + 16);
  }

  drawScore();
};

const onResults = (results) => {
  const handBoxes = computeHandBoxes(results);
  if (handBoxes.length) {
    state.lastHandsAt = Date.now();
    hintEl.textContent = "Hands detected - keep the ball alive!";
  } else if (Date.now() - state.lastHandsAt > 1000) {
    hintEl.textContent = "Show both hands to move the bats";
  }
  renderFrame(handBoxes);
};

const ensureHands = async () => {
  if (handsInstance) return handsInstance;
  if (typeof Hands === "undefined") {
    throw new Error("MediaPipe scripts failed to load.");
  }
  handsInstance = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    selfieMode: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  handsInstance.onResults(onResults);
  return handsInstance;
};

const stopCamera = () => {
  if (state.frameReq) {
    cancelAnimationFrame(state.frameReq);
    state.frameReq = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  state.cameraStarted = false;
};

const startFrameLoop = () => {
  const step = async () => {
    if (!state.cameraStarted || !handsInstance) return;
    if (video.readyState >= 2 && !state.processingFrame) {
      state.processingFrame = true;
      try {
        await handsInstance.send({ image: video });
      } catch (err) {
        console.error(err);
      } finally {
        state.processingFrame = false;
      }
    }
    state.frameReq = requestAnimationFrame(step);
  };

  if (state.frameReq) {
    cancelAnimationFrame(state.frameReq);
  }
  state.frameReq = requestAnimationFrame(step);
};

const populateCameras = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cameraSelect.innerHTML = "<option>Camera API not supported</option>";
    return 0;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  cameraSelect.innerHTML = "";

  if (!videoInputs.length) {
    cameraSelect.innerHTML = "<option>No camera found</option>";
    return 0;
  }

  const preferPcCam =
    videoInputs.find((d) => !/phone|android|iphone|ipad|redmi|note|galaxy/i.test(d.label || "")) ||
    videoInputs[0];

  videoInputs.forEach((device, idx) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${idx + 1}`;
    cameraSelect.appendChild(option);
  });

  if (state.selectedDeviceId && videoInputs.some((d) => d.deviceId === state.selectedDeviceId)) {
    cameraSelect.value = state.selectedDeviceId;
  } else if (preferPcCam) {
    cameraSelect.value = preferPcCam.deviceId;
    state.selectedDeviceId = preferPcCam.deviceId;
  }

  return videoInputs.length;
};

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera API not supported in this browser");
    return;
  }
  if (state.cameraStarting) {
    setStatus("Camera is starting...");
    return;
  }

  state.cameraStarting = true;
  setStatus("Requesting camera permission...");

  stopCamera();

  try {
    await ensureHands();
    await populateCameras(); // refresh labels after permission

    const constraints = {
      video: {
        deviceId: state.selectedDeviceId ? { exact: state.selectedDeviceId } : undefined,
        width: { ideal: WIDTH },
        height: { ideal: HEIGHT },
        facingMode: "user",
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;

    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.();
    if (settings?.deviceId) {
      state.selectedDeviceId = settings.deviceId;
      cameraSelect.value = settings.deviceId;
    }

    video.srcObject = stream;
    await video.play();

    state.cameraStarted = true;
    setStatus("Camera ready - raise your hands to play");
    hintEl.textContent = "Show both hands to move the bats";
    startFrameLoop();
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Unable to start camera. Check permissions.");
  } finally {
    state.cameraStarting = false;
  }
};

const bootstrap = async () => {
  try {
    await loadAssets();
    resetGame();
    renderFrame([]);
    await populateCameras();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Unable to initialize.");
  }
};

resetBtn.addEventListener("click", resetGame);
startBtn.addEventListener("click", startCamera);
cameraSelect.addEventListener("change", () => {
  state.selectedDeviceId = cameraSelect.value || null;
  if (state.cameraStarted) {
    startCamera();
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") {
    resetGame();
  }
});

window.addEventListener("beforeunload", () => {
  stopCamera();
});

bootstrap();
