// --- Canvas Setup ---
export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');
export const statusBar = document.getElementById('status-bar');
export const closeBtn = document.getElementById('close-btn');

export const dpr = window.devicePixelRatio || 1;
canvas.width = window.innerWidth * dpr;
canvas.height = window.innerHeight * dpr;
canvas.style.width = window.innerWidth + 'px';
canvas.style.height = window.innerHeight + 'px';
ctx.scale(dpr, dpr);

// Ensure canvas starts completely transparent
ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

console.log('[overlay] canvas initialized:', window.innerWidth, 'x', window.innerHeight, 'dpr:', dpr);

// Coordinate mapping: model uses 1920x1080, scale to actual screen
export const W = window.innerWidth;
export const H = window.innerHeight;
export const sx = W / 1920;
export const sy = H / 1080;
export const scaleX = (x) => x * sx;
export const scaleY = (y) => y * sy;
export const scaleS = (s) => s * ((sx + sy) / 2); // scale for sizes

console.log('[overlay] scale factors:', sx.toFixed(3), sy.toFixed(3));

// --- Cursor Buddy ---
export const cursorBuddy = document.getElementById('cursor-buddy');
export const cursorBubble = document.getElementById('cursor-bubble');
export const trailCanvas = document.getElementById('cursor-trail');
export const trailCtx = trailCanvas.getContext('2d');

// Size trail canvas to match screen
trailCanvas.width = window.innerWidth * dpr;
trailCanvas.height = window.innerHeight * dpr;
trailCanvas.style.width = window.innerWidth + 'px';
trailCanvas.style.height = window.innerHeight + 'px';
trailCtx.scale(dpr, dpr);

// Pointer phrases
export const pointerPhrases = [
  "right here!", "this one!", "over here!",
  "look!", "here it is!", "check this out!"
];

// Cursor state
export const cursor = {
  x: W / 2,
  y: H / 2,
  mouseX: W / 2,
  mouseY: H / 2,
  realMouseX: W / 2 - 35,
  realMouseY: H / 2 - 25,
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

// Global animation/behavior flags
export const flags = {
  isWelcomeAnimating: false,
  isAnimating: false,
  welcomeShown: false,
};

// Helper sleep function
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
