let cameraFeed;
let sceneLayer;
let blurLayer;
let frostLayer;
let effectLayer;
let maskLayer;
let maskedEffectLayer;
let rainTexture;
let glowTexture;
let wipeMarks = [];
let activeWipeTrail = null;

const WIPE_SIZE_RATIO = 0.062;
const WIPE_CORE_RATIO = 0.58;
const WIPE_FEATHER_RATIO = 2.2;
const WIPE_MIN_MARK_DISTANCE_RATIO = 0.16;
const REFOG_DELAY_MS = 3000;
const REFOG_DURATION_MS = 9000;

function preload() {
  rainTexture = loadImage("images/background-rain-drops-close-up.jpg");
  glowTexture = loadImage("images/abstract-wet-glass-texture-with-gradient-hues.jpg");
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
  sceneLayer = createGraphics(width, height);
  blurLayer = createGraphics(width, height);
  frostLayer = createGraphics(width, height);
  effectLayer = createGraphics(width, height);
  maskLayer = createGraphics(width, height);
  maskedEffectLayer = createGraphics(width, height);

  sceneLayer.pixelDensity(1);
  blurLayer.pixelDensity(1);
  frostLayer.pixelDensity(1);
  effectLayer.pixelDensity(1);
  maskLayer.pixelDensity(1);
  maskedEffectLayer.pixelDensity(1);

  buildFrostLayer();
  buildMaskLayer();
}

function draw() {
  background(208, 220, 226);

  if (hasCameraFrame()) {
    renderCameraScene();
    renderBlurredScene();
  } else {
    renderFallbackScene();
    renderBlurredScene();
  }

  image(sceneLayer, 0, 0, width, height);
  updateMaskLayer();
  renderEffectComposite();
  image(maskedEffectLayer, 0, 0, width, height);

  if (!hasCameraFrame()) {
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
  const smearOffsets = [
    [-18, 0],
    [18, 0],
    [0, -18],
    [0, 18],
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
    [-26, 0],
    [26, 0],
    [0, -26],
    [0, 26]
  ];

  blurLayer.clear();

  ctx.save();
  ctx.filter = "blur(22px) saturate(0.86) brightness(0.92) contrast(0.9)";
  blurLayer.image(sceneLayer, 0, 0, width, height);
  ctx.restore();

  blurLayer.push();
  blurLayer.tint(255, 18);

  for (const [dx, dy] of smearOffsets) {
    blurLayer.image(sceneLayer, dx, dy, width, height);
  }

  blurLayer.pop();

  blurLayer.noStroke();
  blurLayer.fill(228, 236, 239, 70);
  blurLayer.rect(0, 0, width, height);
}

function renderFallbackScene() {
  const topColor = color(228, 238, 244);
  const midColor = color(165, 205, 224);
  const bottomColor = color(31, 44, 64);

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

function buildFrostLayer() {
  frostLayer.clear();
  drawAtmosphereWash(frostLayer);
  drawReferenceOverlay(frostLayer, rainTexture, 78, SOFT_LIGHT, color(210, 236, 248));
  drawReferenceOverlay(frostLayer, glowTexture, 112, SCREEN, color(255, 244, 250));
  buildGrainLayer(frostLayer);
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
  target.fill(235, 242, 245, 74);
  target.rect(0, 0, width, height);

  target.fill(255, 236, 242, 28);
  target.rect(0, 0, width, height * 0.42);

  target.fill(70, 116, 146, 36);
  target.rect(0, height * 0.58, width, height * 0.42);

  ctx.save();
  ctx.filter = "blur(54px)";

  noiseSeed(8);

  for (let i = 0; i < 12; i++) {
    const x = noise(i * 0.23, 12) * width;
    const y = noise(i * 0.37, 32) * height;
    const w = map(noise(i * 0.11, 52), 0, 1, width * 0.24, width * 0.62);
    const h = map(noise(i * 0.29, 72), 0, 1, height * 0.1, height * 0.28);

    target.fill(255, 255, 255, 18);
    target.ellipse(x, y, w, h);
  }

  ctx.restore();
}

function drawReferenceOverlay(target, img, alpha, mode, tintColor) {
  if (!img) {
    return;
  }

  target.blendMode(mode);
  target.tint(red(tintColor), green(tintColor), blue(tintColor), alpha);
  drawCoverImage(target, img, 0, 0, width, height);
  target.noTint();
  target.blendMode(BLEND);
}

function buildGrainLayer(target) {
  const g = target;
  const grainCount = floor((width * height) * 0.0035);

  randomSeed(33);
  g.strokeWeight(1);

  for (let i = 0; i < grainCount; i++) {
    g.stroke(255, 255, 255, random(5, 16));
    g.point(random(width), random(height));
  }
}

function renderEffectComposite() {
  const ctx = maskedEffectLayer.drawingContext;

  effectLayer.clear();
  effectLayer.image(blurLayer, 0, 0, width, height);
  effectLayer.image(frostLayer, 0, 0, width, height);

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
    text("Allow front camera access to see the live frosted blur", width / 2, height / 2);
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
  startDewTrail(mouseX, mouseY);
  return false;
}

function touchMoved() {
  extendDewTrail(mouseX, mouseY);
  return false;
}

function touchEnded() {
  activeWipeTrail = null;
  return false;
}
