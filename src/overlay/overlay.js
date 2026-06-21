import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";

import {
  statusBar,
  closeBtn,
  cursor,
} from './state.js';

import {
  showCursorBuddy,
  startNavigatingToElement
} from './cursor.js';

import {
  addCommand,
  replayCommands,
  commandQueue,
  commandCount
} from './drawing.js';

// --- Event Listeners ---
listen('drawing-cmd', (event) => {
  console.log('[overlay] received cmd:', JSON.stringify(event.payload));
  const cmd = event.payload;
  addCommand(cmd);
});

listen('drawing-error', (event) => {
  console.error('[overlay] error:', event.payload);
  statusBar.innerHTML = `<span class="dot"></span>Error: ${event.payload}`;
  statusBar.className = 'error';
});

listen('drawing-done', () => {
  console.log('[overlay] done, total commands:', commandCount);
  statusBar.innerHTML = `<span class="dot"></span>Done! ${commandCount} elements drawn. Press R to replay, ESC to close.`;
  statusBar.className = 'done';
});

listen('navigate-to-element', (event) => {
  console.log('[overlay] received navigate-to-element:', JSON.stringify(event.payload));
  const loc = event.payload;
  if (loc && typeof loc.x === 'number' && typeof loc.y === 'number') {
    if (!cursor.visible) {
      showCursorBuddy();
    }
    startNavigatingToElement(loc);
  }
});

// Signal to backend that overlay is ready
console.log('[overlay] event listeners registered, emitting ready signal');
emit('overlay-ready', {});

// Close overlay
async function closeOverlay() {
  console.log('[overlay] closeOverlay called');
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
  } else if (e.key.toLowerCase() === 'r') {
    replayCommands();
  }
});
