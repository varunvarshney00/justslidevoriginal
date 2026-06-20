import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";

// --- Canvas Setup ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('status-bar');
const closeBtn = document.getElementById('close-btn');

const dpr = window.devicePixelRatio || 1;
canvas.width = window.innerWidth * dpr;
canvas.height = window.innerHeight * dpr;
canvas.style.width = window.innerWidth + 'px';
canvas.style.height = window.innerHeight + 'px';
ctx.scale(dpr, dpr);

// Fill canvas with dark background so drawings are visible
ctx.fillStyle = 'rgba(8, 8, 20, 0.92)';
ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

console.log('[overlay] canvas initialized:', window.innerWidth, 'x', window.innerHeight, 'dpr:', dpr);

// Coordinate mapping: model uses 1920x1080, scale to actual screen
const W = window.innerWidth;
const H = window.innerHeight;
const sx = W / 1920;
const sy = H / 1080;
const scaleX = (x) => x * sx;
const scaleY = (y) => y * sy;
const scaleS = (s) => s * ((sx + sy) / 2); // scale for sizes

console.log('[overlay] scale factors:', sx.toFixed(3), sy.toFixed(3));

// --- Cursor Buddy ---
const cursorBuddy = document.getElementById('cursor-buddy');
const cursorBubble = document.getElementById('cursor-bubble');
const trailCanvas = document.getElementById('cursor-trail');
const trailCtx = trailCanvas.getContext('2d');

// Size trail canvas to match screen
trailCanvas.width = window.innerWidth * dpr;
trailCanvas.height = window.innerHeight * dpr;
trailCanvas.style.width = window.innerWidth + 'px';
trailCanvas.style.height = window.innerHeight + 'px';
trailCtx.scale(dpr, dpr);

// Pointer phrases
const pointerPhrases = [
  "right here!", "this one!", "over here!",
  "look!", "here it is!", "check this out!"
];

// Cursor state
const cursor = {
  x: W / 2,
  y: H / 2,
  mouseX: W / 2,
  mouseY: H / 2,
  velX: 0,
  velY: 0,
  rotation: -35,
  scale: 1.0,
  mode: 'followingCursor',
  visible: false,
  trail: [],
  flightAnimationId: null,
  isReturningToCursor: false,
  mouseAtNavigationStart: { x: 0, y: 0 },
  bubbleText: '',
  bubbleStreamTimer: null,
};

// --- Mouse Tracking (spring animation, 60fps) ---
let mouseTrackingTimer = null;

document.addEventListener('mousemove', (e) => {
  cursor.mouseX = e.clientX + 35;
  cursor.mouseY = e.clientY + 25;
});

function startMouseTracking() {
  if (mouseTrackingTimer) return;
  mouseTrackingTimer = setInterval(() => {
    if (cursor.mode === 'navigatingToTarget' && !cursor.isReturningToCursor) return;
    if (cursor.mode === 'pointingAtTarget') return;
    if (cursor.mode === 'drawing') return;

    if (cursor.mode === 'navigatingToTarget' && cursor.isReturningToCursor) {
      const dist = Math.hypot(
        cursor.mouseX - cursor.mouseAtNavigationStart.x,
        cursor.mouseY - cursor.mouseAtNavigationStart.y
      );
      if (dist > 100) {
        cancelNavigationAndResumeFollowing();
      }
      return;
    }

    // Normal following with spring physics
    const springResponse = 0.15;
    const damping = 0.7;

    const dx = cursor.mouseX - cursor.x;
    const dy = cursor.mouseY - cursor.y;

    cursor.velX += dx * springResponse;
    cursor.velY += dy * springResponse;
    cursor.velX *= damping;
    cursor.velY *= damping;

    cursor.x += cursor.velX;
    cursor.y += cursor.velY;

    updateCursorDOM();
  }, 16);
}

function showCursorBuddy() {
  cursor.visible = true;
  cursorBuddy.classList.add('visible');
  startMouseTracking();
}

async function showWelcomeAnimation() {
  showCursorBuddy();
  await sleep(800);

  const welcomeMsg = "let me draw this!";
  cursorBubble.textContent = '';
  cursorBubble.classList.add('show');

  for (let i = 0; i < welcomeMsg.length; i++) {
    cursorBubble.textContent += welcomeMsg[i];
    updateBubblePosition();
    await sleep(30 + Math.random() * 30);
  }

  await sleep(1500);
  cursorBubble.classList.remove('show');
  await sleep(400);
  cursorBubble.textContent = '';
}

function updateCursorDOM() {
  if (!cursor.visible) return;
  cursorBuddy.style.left = cursor.x + 'px';
  cursorBuddy.style.top = cursor.y + 'px';
  cursorBuddy.style.transform = `rotate(${cursor.rotation}deg) scale(${cursor.scale})`;
  updateBubblePosition();
}

function updateBubblePosition() {
  cursorBubble.style.left = (cursor.x + 28) + 'px';
  cursorBubble.style.top = (cursor.y + 8) + 'px';
}

function drawTrail() {
  trailCtx.clearRect(0, 0, W, H);
  if (cursor.trail.length < 2) return;

  for (let i = 1; i < cursor.trail.length; i++) {
    const alpha = (i / cursor.trail.length) * 0.6;
    const width = (i / cursor.trail.length) * 4;
    trailCtx.strokeStyle = `rgba(74, 158, 255, ${alpha})`;
    trailCtx.lineWidth = width;
    trailCtx.lineCap = 'round';
    trailCtx.shadowColor = '#4a9eff';
    trailCtx.shadowBlur = 8;
    trailCtx.beginPath();
    trailCtx.moveTo(cursor.trail[i - 1].x, cursor.trail[i - 1].y);
    trailCtx.lineTo(cursor.trail[i].x, cursor.trail[i].y);
    trailCtx.stroke();
  }
  trailCtx.shadowColor = 'transparent';
  trailCtx.shadowBlur = 0;
}

function flyCursorTo(destX, destY) {
  return new Promise((resolve) => {
    const startX = cursor.x;
    const startY = cursor.y;
    const distance = Math.hypot(destX - startX, destY - startY);

    if (distance < 10) {
      cursor.x = destX;
      cursor.y = destY;
      updateCursorDOM();
      resolve();
      return;
    }

    if (cursor.flightAnimationId) {
      cancelAnimationFrame(cursor.flightAnimationId);
      cursor.flightAnimationId = null;
    }

    cursorBuddy.classList.add('flying');
    cursor.mode = 'navigatingToTarget';
    cursor.isReturningToCursor = false;
    cursor.trail = [];
    cursor.velX = 0;
    cursor.velY = 0;

    cursor.mouseAtNavigationStart = { x: cursor.mouseX, y: cursor.mouseY };

    const flightDuration = Math.min(Math.max(distance / 900, 0.4), 1.2);
    const frameInterval = 1 / 60;
    const totalFrames = Math.round(flightDuration / frameInterval);
    let currentFrame = 0;

    const midX = (startX + destX) / 2;
    const midY = (startY + destY) / 2;
    const arcHeight = Math.min(distance * 0.2, 80);
    const controlX = midX;
    const controlY = midY - arcHeight;

    function tick() {
      if (cursor.mode === 'followingCursor') {
        resolve();
        return;
      }

      currentFrame++;

      if (currentFrame > totalFrames) {
        cursor.x = destX;
        cursor.y = destY;
        cursor.scale = 1.0;
        cursorBuddy.classList.remove('flying');
        cursor.flightAnimationId = null;
        updateCursorDOM();

        setTimeout(() => { cursor.trail = []; drawTrail(); }, 300);
        resolve();
        return;
      }

      const linearT = currentFrame / totalFrames;
      const t = linearT * linearT * (3 - 2 * linearT);

      const omt = 1 - t;
      const bx = omt * omt * startX + 2 * omt * t * controlX + t * t * destX;
      const by = omt * omt * startY + 2 * omt * t * controlY + t * t * destY;

      cursor.x = bx;
      cursor.y = by;

      cursor.trail.push({ x: bx, y: by });
      if (cursor.trail.length > 20) cursor.trail.shift();

      const tangentX = 2 * omt * (controlX - startX) + 2 * t * (destX - controlX);
      const tangentY = 2 * omt * (controlY - startY) + 2 * t * (destY - controlY);
      cursor.rotation = Math.atan2(tangentY, tangentX) * (180 / Math.PI);

      const scalePulse = Math.sin(linearT * Math.PI);
      cursor.scale = 1.0 + scalePulse * 0.3;

      updateCursorDOM();
      drawTrail();

      cursor.flightAnimationId = requestAnimationFrame(tick);
    }

    cursor.flightAnimationId = requestAnimationFrame(tick);
  });
}

async function pointAtElement(label, holdMs = 1500) {
  cursor.mode = 'pointingAtTarget';
  cursor.rotation = -35;

  const phrase = label || pointerPhrases[Math.floor(Math.random() * pointerPhrases.length)];

  cursorBubble.textContent = '';
  cursorBubble.classList.add('show');

  for (let i = 0; i < phrase.length; i++) {
    if (cursor.mode !== 'pointingAtTarget') break;
    cursorBubble.textContent += phrase[i];
    updateBubblePosition();
    await sleep(25 + Math.random() * 25);
  }

  await sleep(holdMs);

  cursorBubble.classList.remove('show');
  await sleep(300);
  cursorBubble.textContent = '';
}

function showQuickBubble(text) {
  cursorBubble.textContent = text;
  cursorBubble.classList.add('show');
  updateBubblePosition();
}

function hideQuickBubble() {
  cursorBubble.classList.remove('show');
  setTimeout(() => { cursorBubble.textContent = ''; }, 300);
}

async function flyBackToCursor() {
  cursor.isReturningToCursor = true;
  cursor.mouseAtNavigationStart = { x: cursor.mouseX, y: cursor.mouseY };

  await flyCursorTo(cursor.mouseX, cursor.mouseY);
  finishNavigationAndResumeFollowing();
}

function cancelNavigationAndResumeFollowing() {
  if (cursor.flightAnimationId) {
    cancelAnimationFrame(cursor.flightAnimationId);
    cursor.flightAnimationId = null;
  }
  cursorBuddy.classList.remove('flying');
  cursor.trail = [];
  drawTrail();
  cursorBubble.classList.remove('show');
  cursorBubble.textContent = '';
  finishNavigationAndResumeFollowing();
}

function finishNavigationAndResumeFollowing() {
  cursor.mode = 'followingCursor';
  cursor.isReturningToCursor = false;
  cursor.rotation = -35;
  cursor.scale = 1.0;
  cursor.trail = [];
  drawTrail();
  updateCursorDOM();
}

function moveCursorAlongLine(fromX, fromY, toX, toY, t) {
  if (cursor.mode === 'navigatingToTarget') return;
  cursor.x = fromX + (toX - fromX) * t;
  cursor.y = fromY + (toY - fromY) * t;
  const angle = Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI);
  cursor.rotation = angle;
  updateCursorDOM();
}

function moveCursorToPoint(px, py) {
  if (cursor.mode === 'navigatingToTarget') return;
  cursor.x = px;
  cursor.y = py;
  updateCursorDOM();
}

function getCommandTarget(cmd) {
  switch (cmd.cmd) {
    case 'line':
    case 'arrow':
      return { x: scaleX(cmd.x1), y: scaleY(cmd.y1) };
    case 'circle':
    case 'arc':
      return { x: scaleX(cmd.cx), y: scaleY(cmd.cy) };
    case 'rect':
      return { x: scaleX(cmd.x), y: scaleY(cmd.y) };
    case 'text':
    case 'label':
      return { x: scaleX(cmd.x), y: scaleY(cmd.y) };
    case 'dot':
      return { x: scaleX(cmd.cx), y: scaleY(cmd.cy) };
    default:
      return null;
  }
}

function getCommandLabel(cmd) {
  switch (cmd.cmd) {
    case 'text': return cmd.text ? `"${cmd.text.substring(0, 20)}"` : null;
    case 'label': return cmd.text || null;
    default: return null;
  }
}

// --- Drawing Queue & Animation ---
const commandQueue = [];
let isAnimating = false;
let commandCount = 0;
let welcomeShown = false;

async function processQueue() {
  if (isAnimating || commandQueue.length === 0) return;
  isAnimating = true;

  if (!welcomeShown) {
    welcomeShown = true;
    await showWelcomeAnimation();
  }

  while (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    commandCount++;

    const target = getCommandTarget(cmd);
    if (target) {
      await flyCursorTo(target.x, target.y);
    }

    cursor.mode = 'drawing';
    cursor.rotation = -35;

    const label = getCommandLabel(cmd);
    if (label) {
      showQuickBubble(label);
    }

    await animateCommand(cmd);

    if (label) {
      hideQuickBubble();
    }

    cursor.mode = 'followingCursor';
    await sleep(250);
  }

  if (cursor.visible) {
    await sleep(400);
    cursor.rotation = -35;
    await flyBackToCursor();
  }

  isAnimating = false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animateCommand(cmd) {
  switch (cmd.cmd) {
    case 'line': await animateLine(cmd); break;
    case 'arrow': await animateArrow(cmd); break;
    case 'circle': await animateCircle(cmd); break;
    case 'arc': await animateArc(cmd); break;
    case 'rect': await animateRect(cmd); break;
    case 'text': await animateText(cmd); break;
    case 'label': await animateLabel(cmd); break;
    case 'dot': await animateDot(cmd); break;
    default: break;
  }
}

// --- Glow helper ---
function setGlow(color, blur = 12) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function clearGlow() {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// --- Line animation (hand-drawn wobble) ---
async function animateLine(cmd) {
  const steps = 40;
  const x1 = scaleX(cmd.x1), y1 = scaleY(cmd.y1);
  const x2 = scaleX(cmd.x2), y2 = scaleY(cmd.y2);
  const w = scaleS(cmd.width || 2);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const wobbleAmp = Math.min(len * 0.008, 3);

  ctx.strokeStyle = cmd.color || '#00ffff';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  setGlow(cmd.color || '#00ffff', 10);

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);

  let prevX = x1, prevY = y1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const wobble = (i < steps) ? (Math.sin(t * Math.PI * 3) * wobbleAmp + (Math.random() - 0.5) * wobbleAmp * 0.5) : 0;
    const cx = x1 + (x2 - x1) * t + perpX * wobble;
    const cy = y1 + (y2 - y1) * t + perpY * wobble;
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    prevX = cx;
    prevY = cy;
    moveCursorAlongLine(x1, y1, x2, y2, t);
    await sleep(30);
  }
  clearGlow();
}

// --- Arrow animation ---
async function animateArrow(cmd) {
  await animateLine(cmd);

  const x2 = scaleX(cmd.x2), y2 = scaleY(cmd.y2);
  const x1 = scaleX(cmd.x1), y1 = scaleY(cmd.y1);
  const headSize = scaleS(12);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.strokeStyle = cmd.color || '#00ffff';
  ctx.lineWidth = scaleS(cmd.width || 2);
  ctx.lineCap = 'round';
  setGlow(cmd.color || '#00ffff', 10);

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headSize * Math.cos(angle - Math.PI / 6),
    y2 - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headSize * Math.cos(angle + Math.PI / 6),
    y2 - headSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
  clearGlow();
}

// --- Circle animation (hand-drawn wobble) ---
async function animateCircle(cmd) {
  const cx = scaleX(cmd.cx), cy = scaleY(cmd.cy);
  const r = scaleS(cmd.r);
  const w = scaleS(cmd.width || 2);
  const steps = 36;
  const wobbleAmp = Math.min(r * 0.03, 3);

  ctx.strokeStyle = cmd.color || '#00ffff';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  setGlow(cmd.color || '#00ffff', 10);

  const wobbles = [];
  for (let i = 0; i <= steps; i++) {
    wobbles.push((Math.random() - 0.5) * wobbleAmp * 2 + Math.sin(i * 0.8) * wobbleAmp);
  }

  let prevAngle = 0;
  for (let i = 1; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rw = r + wobbles[i];
    const rprev = r + wobbles[i - 1];
    const px1 = cx + rprev * Math.cos(prevAngle);
    const py1 = cy + rprev * Math.sin(prevAngle);
    const px2 = cx + rw * Math.cos(angle);
    const py2 = cy + rw * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();
    moveCursorToPoint(px2, py2);
    prevAngle = angle;
    await sleep(25);
  }
  clearGlow();
}

// --- Arc animation ---
async function animateArc(cmd) {
  const cx = scaleX(cmd.cx), cy = scaleY(cmd.cy);
  const r = scaleS(cmd.r);
  const w = scaleS(cmd.width || 2);
  const start = (cmd.startAngle || 0) * (Math.PI / 180);
  const end = (cmd.endAngle || 360) * (Math.PI / 180);
  const totalAngle = end - start;
  const steps = Math.max(12, Math.round(Math.abs(totalAngle) / (Math.PI / 18)));

  ctx.strokeStyle = cmd.color || '#00ffff';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  setGlow(cmd.color || '#00ffff', 10);

  for (let i = 1; i <= steps; i++) {
    const s = start + totalAngle * ((i - 1) / steps);
    const e = start + totalAngle * (i / steps);
    ctx.beginPath();
    ctx.arc(cx, cy, r, s, e);
    ctx.stroke();
    await sleep(30);
  }
  clearGlow();
}

// --- Rectangle animation ---
async function animateRect(cmd) {
  await animateLine({ x1: cmd.x, y1: cmd.y, x2: cmd.x + cmd.w, y2: cmd.y, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x + cmd.w, y1: cmd.y, x2: cmd.x + cmd.w, y2: cmd.y + cmd.h, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x + cmd.w, y1: cmd.y + cmd.h, x2: cmd.x, y2: cmd.y + cmd.h, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x, y1: cmd.y + cmd.h, x2: cmd.x, y2: cmd.y, color: cmd.color, width: cmd.width });
}

// Handwriting font for canvas
const HAND_FONT = "'Segoe Script', 'Comic Sans MS', 'Caveat', cursive";

// --- Text animation (typing effect) ---
async function animateText(cmd) {
  const x = scaleX(cmd.x);
  const y = scaleY(cmd.y);
  const size = scaleS(cmd.size || 20);
  const text = cmd.text || '';
  const color = cmd.color || '#ffffff';

  ctx.font = `${size}px ${HAND_FONT}`;
  ctx.textBaseline = 'middle';
  setGlow(color, 8);

  ctx.textAlign = 'center';
  const fullMetrics = ctx.measureText(text);
  const tw = fullMetrics.width + 20;

  const wobbles = [];
  for (let i = 0; i < text.length; i++) {
    wobbles.push({
      dx: (Math.random() - 0.5) * size * 0.06,
      dy: (Math.random() - 0.5) * size * 0.08,
      rot: (Math.random() - 0.5) * 0.03
    });
  }

  for (let i = 1; i <= text.length; i++) {
    clearGlow();
    ctx.fillStyle = 'rgba(8, 8, 20, 0.92)';
    ctx.fillRect(x - tw / 2 - 10, y - size / 2 - 10, tw + 20, size + 20);

    ctx.font = `${size}px ${HAND_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setGlow(color, 8);

    let curX = x - tw / 2 + 10;
    for (let j = 0; j < i; j++) {
      const ch = text[j];
      const w = wobbles[j];
      ctx.save();
      ctx.translate(curX + w.dx, y + w.dy);
      ctx.rotate(w.rot);
      ctx.fillStyle = color;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      curX += ctx.measureText(ch).width;
    }

    moveCursorToPoint(curX, y);
    await sleep(45);
  }
  clearGlow();
}

// --- Label animation (text with background, handwritten) ---
async function animateLabel(cmd) {
  const x = scaleX(cmd.x);
  const y = scaleY(cmd.y);
  const size = scaleS(cmd.size || 18);
  const text = cmd.text || '';
  const bg = cmd.bg || 'rgba(0,0,0,0.7)';
  const color = cmd.color || '#ffffff';

  ctx.font = `${size}px ${HAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const pad = scaleS(8);

  ctx.fillStyle = bg;
  const rx = x - metrics.width / 2 - pad;
  const ry = y - size / 2 - pad / 2;
  const rw = metrics.width + pad * 2;
  const rh = size + pad;
  roundRect(ctx, rx, ry, rw, rh, scaleS(4));
  ctx.fill();

  ctx.textAlign = 'left';
  let curX = x - metrics.width / 2;
  setGlow(color, 6);
  for (let j = 0; j < text.length; j++) {
    const ch = text[j];
    const dx = (Math.random() - 0.5) * size * 0.05;
    const dy = (Math.random() - 0.5) * size * 0.06;
    const rot = (Math.random() - 0.5) * 0.02;
    ctx.save();
    ctx.translate(curX + dx, y + dy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    curX += ctx.measureText(ch).width;
  }
  clearGlow();

  await sleep(300);
}

// --- Dot animation ---
async function animateDot(cmd) {
  const cx = scaleX(cmd.cx), cy = scaleY(cmd.cy);
  const rawR = Math.min(cmd.r || 5, 15);
  const r = scaleS(rawR);
  const targetR = r;
  const steps = 10;

  ctx.fillStyle = cmd.color || '#ffffff';
  setGlow(cmd.color || '#ffffff', 15);

  for (let i = 1; i <= steps; i++) {
    const currentR = targetR * (i / steps);
    ctx.beginPath();
    ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
    ctx.fill();
    await sleep(35);
  }
  clearGlow();
}

// --- Rounded rectangle helper ---
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- Event Listeners ---
listen('drawing-cmd', (event) => {
  console.log('[overlay] received cmd:', JSON.stringify(event.payload));
  commandQueue.push(event.payload);
  statusBar.innerHTML = `<span class="dot"></span>Drawing... (${commandQueue.length + commandCount} commands)`;
  processQueue();
});

listen('drawing-error', (event) => {
  console.error('[overlay] error:', event.payload);
  statusBar.innerHTML = `<span class="dot"></span>Error: ${event.payload}`;
  statusBar.className = 'error';
});

listen('drawing-done', () => {
  console.log('[overlay] done, total commands:', commandCount);
  statusBar.innerHTML = `<span class="dot"></span>Done! ${commandCount} elements drawn. Press ESC to close.`;
  statusBar.className = 'done';
});

// Signal to backend that overlay is ready
console.log('[overlay] event listeners registered, emitting ready signal');
emit('overlay-ready', {});

// Close overlay
async function closeOverlay() {
  try {
    await invoke('close_overlay');
  } catch (e) {
    console.error('Failed to close overlay:', e);
  }
}

closeBtn.addEventListener('click', closeOverlay);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeOverlay();
  }
});
