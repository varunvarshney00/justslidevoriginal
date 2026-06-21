import {
  cursor,
  cursorBuddy,
  cursorBubble,
  trailCtx,
  W,
  H,
  pointerPhrases,
  flags,
  sleep
} from './state.js';

// --- Mouse Tracking (spring animation, 60fps) ---
export let mouseTrackingTimer = null;

document.addEventListener('mousemove', (e) => {
  cursor.mouseX = e.clientX + 35;
  cursor.mouseY = e.clientY + 25;
  cursor.realMouseX = e.clientX;
  cursor.realMouseY = e.clientY;
});

export function startMouseTracking() {
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

    // Rotate buddy to point directly at the actual mouse cursor
    const toMouseX = cursor.realMouseX - cursor.x;
    const toMouseY = cursor.realMouseY - cursor.y;
    if (Math.hypot(toMouseX, toMouseY) > 5) {
      const targetAngle = Math.atan2(toMouseY, toMouseX) * (180 / Math.PI);
      cursor.rotation = targetAngle + 135;
    }

    updateCursorDOM();
  }, 16);
}

export function showCursorBuddy() {
  cursor.visible = true;
  cursorBuddy.classList.add('visible');
  startMouseTracking();
}

export async function showWelcomeAnimation() {
  flags.isWelcomeAnimating = true;

  // Set initial position to center of screen immediately
  cursor.x = W / 2;
  cursor.y = H / 2;
  updateCursorDOM();

  // Show the buddy and start tracking the mouse so it feels alive
  cursor.visible = true;
  cursorBuddy.classList.add('visible');
  startMouseTracking();

  // Wait 500ms (0.5s) to let the buddy fade in and be seen by the user
  await sleep(500);

  const welcomeMsg = "Let me draw this!";
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
  flags.isWelcomeAnimating = false;
}

export function updateCursorDOM() {
  if (!cursor.visible) return;
  cursorBuddy.style.left = cursor.x + 'px';
  cursorBuddy.style.top = cursor.y + 'px';
  cursorBuddy.style.transform = `rotate(${cursor.rotation}deg) scale(${cursor.scale})`;
  updateBubblePosition();
}

export function updateBubblePosition() {
  cursorBubble.style.left = (cursor.x + 28) + 'px';
  cursorBubble.style.top = (cursor.y + 8) + 'px';
}

export function drawTrail() {
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

export function flyCursorTo(destX, destY) {
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

    // Flight duration scales with distance: clamped to 0.6s–1.4s (matching swift game engine specs)
    const flightDuration = Math.min(Math.max(distance / 650.0, 0.8), 1.8);
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

      const tangentX = 2 * omt * (controlX - startX) + 2 * t * (destX - controlX);
      const tangentY = 2 * omt * (controlY - startY) + 2 * t * (destY - controlY);
      cursor.rotation = Math.atan2(tangentY, tangentX) * (180 / Math.PI);

      // Calculate centroid of the buddy to origin the trail from it
      // The buddy SVG is 24x24, its center is at (12, 12) unrotated.
      // The transform-origin (pivot) is at (3, 3).
      // Vector from pivot to center is (9, 9).
      const theta = cursor.rotation * (Math.PI / 180);
      const cx = bx + 3 + (9 * Math.cos(theta) - 9 * Math.sin(theta));
      const cy = by + 3 + (9 * Math.sin(theta) + 9 * Math.cos(theta));

      cursor.trail.push({ x: cx, y: cy });
      if (cursor.trail.length > 20) cursor.trail.shift();

      const scalePulse = Math.sin(linearT * Math.PI);
      cursor.scale = 1.0 + scalePulse * 0.3;

      updateCursorDOM();
      drawTrail();

      cursor.flightAnimationId = requestAnimationFrame(tick);
    }

    cursor.flightAnimationId = requestAnimationFrame(tick);
  });
}

export async function pointAtElement(label, holdMs = 3000) {
  cursor.mode = 'pointingAtTarget';
  cursor.rotation = -35;

  // We simply pause for the hold duration since text labels are now handled via audio
  await sleep(holdMs);
}

export function showQuickBubble(text) {
  cursorBubble.textContent = text;
  cursorBubble.classList.add('show');
  updateBubblePosition();
}

export function hideQuickBubble() {
  cursorBubble.classList.remove('show');
  setTimeout(() => { cursorBubble.textContent = ''; }, 300);
}

export async function flyBackToCursor() {
  cursor.isReturningToCursor = true;
  cursor.mouseAtNavigationStart = { x: cursor.mouseX, y: cursor.mouseY };

  await flyCursorTo(cursor.mouseX, cursor.mouseY);
  finishNavigationAndResumeFollowing();
}

export function cancelNavigationAndResumeFollowing() {
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

export function finishNavigationAndResumeFollowing() {
  cursor.mode = 'followingCursor';
  cursor.isReturningToCursor = false;
  cursor.rotation = -35;
  cursor.scale = 1.0;
  cursor.trail = [];
  drawTrail();
  updateCursorDOM();
}

export function moveCursorAlongLine(fromX, fromY, toX, toY, t) {
  if (cursor.mode === 'navigatingToTarget') return;
  cursor.x = fromX + (toX - fromX) * t;
  cursor.y = fromY + (toY - fromY) * t;
  const angle = Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI);
  cursor.rotation = angle;
  updateCursorDOM();
}

export function moveCursorToPoint(px, py) {
  if (cursor.mode === 'navigatingToTarget') return;
  cursor.x = px;
  cursor.y = py;
  updateCursorDOM();
}

export function convertScreenPointToWebCoordinates(screenLocation) {
  // Fullscreen transparent window: screen logical coords are 1:1 with client area.
  return {
    x: screenLocation.x,
    y: screenLocation.y
  };
}

export async function startNavigatingToElement(screenLocation) {
  if (flags.isWelcomeAnimating) {
    console.log('[overlay] startNavigatingToElement ignored: welcome animation in progress');
    return;
  }

  const targetInWeb = convertScreenPointToWebCoordinates(screenLocation);

  // Offset the target so the buddy sits beside the element rather than
  // directly on top of it — 8px to the right, 12px below.
  const offsetTarget = {
    x: targetInWeb.x + 8,
    y: targetInWeb.y + 12
  };

  // Clamp target to screen bounds with padding (20px)
  const clampedTarget = {
    x: Math.max(20, Math.min(offsetTarget.x, window.innerWidth - 20)),
    y: Math.max(20, Math.min(offsetTarget.y, window.innerHeight - 20))
  };

  // Record the current cursor position so we can detect if the user
  // moves the mouse enough to cancel the return flight
  cursor.mouseAtNavigationStart = { x: cursor.mouseX, y: cursor.mouseY };

  // Enter navigation mode — stop cursor following
  cursor.mode = 'navigatingToTarget';
  cursor.isReturningToCursor = false;

  console.log('[overlay] navigating to target:', clampedTarget);
  await flyCursorTo(clampedTarget.x, clampedTarget.y);

  // Arrive -> Point At Element
  if (cursor.mode === 'navigatingToTarget') {
    await pointAtElement(screenLocation.label);
    
    // Return to cursor
    if (cursor.mode === 'pointingAtTarget') {
      await flyBackToCursor();
    }
  }
}
