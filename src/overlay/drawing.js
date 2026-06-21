import {
  ctx,
  trailCtx,
  statusBar,
  cursorBuddy,
  cursor,
  flags,
  W,
  H,
  scaleX,
  scaleY,
  scaleS,
  sleep
} from './state.js';

import {
  flyCursorTo,
  flyBackToCursor,
  showWelcomeAnimation,
  showQuickBubble,
  hideQuickBubble,
  moveCursorAlongLine,
  moveCursorToPoint,
  startMouseTracking
} from './cursor.js';

// --- Drawing Queue & State ---
export const commandQueue = [];
export const commandHistory = [];
export let commandCount = 0;

export function addCommand(cmd) {
  if (cmd.cmd === 'clear') {
    commandHistory.length = 0; // clear in-place
  }
  commandHistory.push(cmd);
  commandQueue.push(cmd);
  statusBar.innerHTML = `<span class="dot"></span>Drawing... (${commandQueue.length + commandCount} commands)`;
  processQueue();
}

export async function processQueue() {
  if (flags.isAnimating || commandQueue.length === 0) return;
  flags.isAnimating = true;

  if (!flags.welcomeShown) {
    flags.welcomeShown = true;
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

  flags.isAnimating = false;
}

export function clearCanvas() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  trailCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

export async function replayCommands() {
  if (flags.isAnimating) {
    console.log('[overlay] already animating, ignoring replay request');
    return;
  }
  if (commandHistory.length === 0) {
    console.log('[overlay] no command history to replay');
    return;
  }
  console.log('[overlay] replaying', commandHistory.length, 'commands');

  // Immediately clear the canvas
  clearCanvas();

  commandCount = 0;
  commandQueue.push(...commandHistory);

  statusBar.className = '';
  statusBar.innerHTML = `<span class="dot"></span>Replaying... (${commandQueue.length} commands)`;

  cursor.visible = true;
  cursorBuddy.classList.add('visible');
  startMouseTracking();

  processQueue();
}

export async function animateCommand(cmd) {
  switch (cmd.cmd) {
    case 'clear': clearCanvas(); break;
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
export function setGlow(color, blur = 12) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export function clearGlow() {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// --- Line animation (hand-drawn wobble) ---
export async function animateLine(cmd) {
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
export async function animateArrow(cmd) {
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
export async function animateCircle(cmd) {
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
export async function animateArc(cmd) {
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
export async function animateRect(cmd) {
  await animateLine({ x1: cmd.x, y1: cmd.y, x2: cmd.x + cmd.w, y2: cmd.y, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x + cmd.w, y1: cmd.y, x2: cmd.x + cmd.w, y2: cmd.y + cmd.h, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x + cmd.w, y1: cmd.y + cmd.h, x2: cmd.x, y2: cmd.y + cmd.h, color: cmd.color, width: cmd.width });
  await animateLine({ x1: cmd.x, y1: cmd.y + cmd.h, x2: cmd.x, y2: cmd.y, color: cmd.color, width: cmd.width });
}

// Handwriting font for canvas
export const HAND_FONT = "'Segoe Script', 'Comic Sans MS', 'Caveat', cursive";

// --- Text animation (typing effect) ---
export async function animateText(cmd) {
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
    ctx.clearRect(x - tw / 2 - 10, y - size / 2 - 10, tw + 20, size + 20);

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
export async function animateLabel(cmd) {
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
export async function animateDot(cmd) {
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
export function roundRect(ctx, x, y, w, h, r) {
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

export function getCommandTarget(cmd) {
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

export function getCommandLabel(cmd) {
  switch (cmd.cmd) {
    case 'text': return cmd.text ? `"${cmd.text.substring(0, 20)}"` : null;
    case 'label': return cmd.text || null;
    default: return null;
  }
}
