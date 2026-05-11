let cameraFeed;
let sceneLayer;
let blurLayer;
let fogLayer;
let effectLayer;
let maskLayer;
let maskedEffectLayer;
let fogTexture1;
let fogTexture2;
let wipeMarks = [];
let activeWipeTrail = null;

const WIPE_SIZE_RATIO = 0.062;
const WIPE_CORE_RATIO = 0.58;
const WIPE_FEATHER_RATIO = 2.2;
const WIPE_MIN_MARK_DISTANCE_RATIO = 0.16;
const REFOG_DELAY_MS = 3000;
const REFOG_DURATION_MS = 9000;
const SMEAR_OFFSETS = [
  [-20, -10], [20, -10], [-20, 10], [20, 10],
  [-14, -24], [14, -24], [-14, 24], [14, 24],
  [-34, 0], [34, 0], [0, -34], [0, 34]
];

function preload() {
  fogTexture1 = loadImage("images/fog 01.jpg");
  fogTexture2 = loadImage("images/fog 02.jpg");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  frameRate(30);

  setupCamera();
  rebuildLayers();
}

function setupCamera() {
  cameraFeed = createCapture(
    {
      video: {
        facingMode: {
          ideal: "user"
        }
      },
      audio: false
    },
    () => {
      if (cameraFeed) {
        cameraFeed.hide();
      }
    }
  );

  cameraFeed.size(640, 480);
  cameraFeed.attribute("playsinline", "");
  cameraFeed.hide();
}

function rebuildLayers() {
  [sceneLayer, blurLayer, fogLayer, effectLayer, maskLayer, maskedEffectLayer] =
    Array.from({ length: 6 }, () => createGraphics(width, height));

  for (const layer of [sceneLayer, blurLayer, fogLayer, effectLayer, maskLayer, maskedEffectLayer]) {
    layer.pixelDensity(1);
  }

  buildFogLayer();
  buildMaskLayer();
}

function draw() {
  const cameraReady = hasCameraFrame();

  background(215, 224, 230);

  if (cameraReady) {
    renderCameraScene();
  } else {
    renderFallbackScene();
  }

  renderBlurredScene();
  image(sceneLayer, 0, 0, width, height);
  updateMaskLayer();
  renderEffectComposite();
  image(maskedEffectLayer, 0, 0, width, height);

  if (!cameraReady) {
    drawCameraPrompt();
  }
}

function hasCameraFrame() {
  return (
    cameraFeed &&
    cameraFeed.elt &&
    cameraFeed.elt.readyState >= 2 &&
    cameraFeed.elt.videoWidth > 0 &&
    cameraFeed.elt.videoHeight > 0
  );
}

function renderCameraScene() {
  sceneLayer.clear();
  sceneLayer.push();
  sceneLayer.translate(width, 0);
  sceneLayer.scale(-1, 1);
  drawCoverImage(sceneLayer, cameraFeed, 0, 0, width, height);
  sceneLayer.pop();
}

function renderBlurredScene() {
  const ctx = blurLayer.drawingContext;

  blurLayer.clear();

  ctx.save();
  ctx.filter = "blur(36px) saturate(0.52) brightness(1.12) contrast(0.76)";
  blurLayer.image(sceneLayer, 0, 0, width, height);
  ctx.restore();

  blurLayer.push();
  blurLayer.tint(255, 20);

  for (const [dx, dy] of SMEAR_OFFSETS) {
    blurLayer.image(sceneLayer, dx, dy, width, height);
  }

  blurLayer.pop();

  blurLayer.noStroke();
  blurLayer.fill(246, 250, 253, 120);
  blurLayer.rect(0, 0, width, height);
}

function renderFallbackScene() {
  const topColor = color(235, 242, 248);
  const midColor = color(170, 202, 220);
  const bottomColor = color(42, 58, 76);

  sceneLayer.clear();

  for (let y = 0; y < height; y++) {
    const t = y / max(height - 1, 1);
    const mixColor = t < 0.55
      ? lerpColor(topColor, midColor, t / 0.55)
      : lerpColor(midColor, bottomColor, (t - 0.55) / 0.45);

    sceneLayer.stroke(mixColor);
    sceneLayer.line(0, y, width, y);
  }
}

function buildFogLayer() {
  fogLayer.clear();
  drawAtmosphereWash(fogLayer);
  buildMistParticles(fogLayer);
}

function buildMaskLayer() {
  maskLayer.clear();
  maskLayer.noStroke();
  maskLayer.fill(255);
  maskLayer.rect(0, 0, width, height);
}

function updateMaskLayer() {
  buildMaskLayer();

  if (wipeMarks.length === 0) {
    return;
  }

  const now = millis();
  const ctx = maskLayer.drawingContext;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";

  wipeMarks = wipeMarks.filter((mark) => {
    const age = now - mark.createdAt;

    if (age >= REFOG_DELAY_MS + REFOG_DURATION_MS) {
      return false;
    }

    let clearStrength = 1;

    if (age > REFOG_DELAY_MS) {
      const progress = (age - REFOG_DELAY_MS) / REFOG_DURATION_MS;
      clearStrength = 1 - easeInOutQuint(constrain(progress, 0, 1));
    }

    if (clearStrength > 0) {
      drawSoftClearTrail(ctx, mark, clearStrength);
    }

    return true;
  });

  ctx.restore();
}

function drawSoftClearTrail(ctx, trail, clearStrength) {
  const brushLayers = [
    { width: trail.size * WIPE_FEATHER_RATIO, alpha: 0.025 },
    { width: trail.size * 1.9, alpha: 0.035 },
    { width: trail.size * 1.6, alpha: 0.048 },
    { width: trail.size * 1.34, alpha: 0.062 },
    { width: trail.size * 1.1, alpha: 0.082 },
    { width: trail.size * 0.9, alpha: 0.11 },
    { width: trail.size * 0.72, alpha: 0.15 },
    { width: max(trail.size * WIPE_CORE_RATIO, 8), alpha: 0.2 }
  ];

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const layer of brushLayers) {
    const alpha = clearStrength * layer.alpha;

    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = layer.width;
    drawClearPath(ctx, trail);
  }

  ctx.restore();
}

function drawClearPath(ctx, trail) {
  const points = trail.points;
  const radius = ctx.lineWidth * 0.5;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, radius, 0, TWO_PI);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) * 0.5;
    const midY = (points[i].y + points[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  const lastPoint = points[points.length - 1];
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.stroke();
}

function drawAtmosphereWash(target) {
  const ctx = target.drawingContext;

  target.noStroke();
  target.fill(248, 251, 254, 148);
  target.rect(0, 0, width, height);

  target.fill(255, 255, 255, 55);
  target.rect(0, 0, width, height * 0.38);

  target.fill(148, 178, 205, 46);
  target.rect(0, height * 0.62, width, height * 0.38);

  ctx.save();
  ctx.filter = "blur(90px)";

  noiseSeed(8);

  for (let i = 0; i < 22; i++) {
    const x = noise(i * 0.23, 12) * width;
    const y = noise(i * 0.37, 32) * height;
    const w = map(noise(i * 0.11, 52), 0, 1, width * 0.4, width * 0.92);
    const h = map(noise(i * 0.29, 72), 0, 1, height * 0.2, height * 0.5);

    target.fill(255, 255, 255, 35);
    target.ellipse(x, y, w, h);
  }

  ctx.restore();
}

function buildMistParticles(target) {
  const g = target;
  const particleCount = floor((width * height) * 0.003);

  randomSeed(33);
  g.strokeWeight(1.5);

  for (let i = 0; i < particleCount; i++) {
    g.stroke(255, 255, 255, random(4, 14));
    g.point(random(width), random(height));
  }

  randomSeed(77);
  g.noStroke();
  for (let i = 0; i < floor(particleCount * 0.28); i++) {
    g.fill(255, 255, 255, random(3, 10));
    g.ellipse(random(width), random(height), random(4, 11), random(2, 6));
  }
}

function drawAnimatedFogTextures(target) {
  const t = millis();
  const oversize = 1.18;
  const padX = width * (oversize - 1) * 0.5;
  const padY = height * (oversize - 1) * 0.5;

  // Each texture drifts in opposite directions for a parallax depth feel
  const pan1X = sin(t * 0.00007) * padX;
  const pan1Y = cos(t * 0.00005) * padY;
  const pan2X = -cos(t * 0.00006) * padX;
  const pan2Y = -sin(t * 0.00004) * padY;

  target.push();
  target.blendMode(SCREEN);

  target.tint(235, 240, 248, 92);
  target.image(fogTexture1, -padX + pan1X, -padY + pan1Y, width * oversize, height * oversize);

  target.tint(255, 255, 255, 68);
  target.image(fogTexture2, -padX + pan2X, -padY + pan2Y, width * oversize, height * oversize);

  target.noTint();
  target.blendMode(BLEND);
  target.pop();
}

function renderEffectComposite() {
  const ctx = maskedEffectLayer.drawingContext;

  effectLayer.clear();
  effectLayer.image(blurLayer, 0, 0, width, height);
  effectLayer.image(fogLayer, 0, 0, width, height);
  drawAnimatedFogTextures(effectLayer);

  maskedEffectLayer.clear();
  maskedEffectLayer.image(effectLayer, 0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  maskedEffectLayer.image(maskLayer, 0, 0, width, height);
  ctx.restore();
}

function startDewTrail(x, y) {
  if (!maskLayer) {
    return;
  }

  activeWipeTrail = {
    points: [{ x, y }],
    size: min(width, height) * WIPE_SIZE_RATIO,
    createdAt: millis()
  };

  wipeMarks.push(activeWipeTrail);
}

function extendDewTrail(x, y) {
  if (!maskLayer) {
    return;
  }

  if (!activeWipeTrail) {
    startDewTrail(x, y);
    return;
  }

  const points = activeWipeTrail.points;
  const lastPoint = points[points.length - 1];
  const minDistance = min(width, height) * WIPE_SIZE_RATIO * WIPE_MIN_MARK_DISTANCE_RATIO;

  if (dist(lastPoint.x, lastPoint.y, x, y) < minDistance) {
    return;
  }

  points.push({ x, y });
}

function easeInOutQuint(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function drawCameraPrompt() {
  const needsSecureContext = !window.isSecureContext || location.protocol === "file:";

  noStroke();
  fill(241, 246, 248, 82);
  rect(width * 0.5 - 240, height * 0.5 - 52, 480, 104, 20);

  fill(63, 76, 86);
  textAlign(CENTER, CENTER);
  textSize(min(width, height) * 0.02);

  if (needsSecureContext) {
    text("Open from localhost and allow camera access", width / 2, height / 2);
  } else {
    text("Allow front camera access to see through the misty fog", width / 2, height / 2);
  }
}

function drawCoverImage(target, source, x, y, w, h) {
  const sourceWidth =
    (source.elt && source.elt.videoWidth) ||
    source.videoWidth ||
    source.width ||
    (source.elt && source.elt.width) ||
    1;
  const sourceHeight =
    (source.elt && source.elt.videoHeight) ||
    source.videoHeight ||
    source.height ||
    (source.elt && source.elt.height) ||
    1;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = w / h;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect;
    sx = (sourceWidth - sw) * 0.5;
  } else {
    sh = sourceWidth / targetAspect;
    sy = (sourceHeight - sh) * 0.5;
  }

  target.image(source, x, y, w, h, sx, sy, sw, sh);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  wipeMarks = [];
  activeWipeTrail = null;
  rebuildLayers();
}

function mousePressed() {
  startDewTrail(mouseX, mouseY);
  return false;
}

function mouseDragged() {
  extendDewTrail(mouseX, mouseY);
  return false;
}

function mouseReleased() {
  activeWipeTrail = null;
  return false;
}

function touchStarted() {
  return mousePressed();
}

function touchMoved() {
  return mouseDragged();
}

function touchEnded() {
  return mouseReleased();
}
