import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { getTrackedElement } from './aura-ring';
import { registerKeyHandler, registerKeyupHandler } from './key-handler';

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface ScrollState {
  velocity: number;
  direction: ScrollDirection;
  accelerating: boolean;
  fast: boolean;
  lastKeyTime: number;
}

let state: ScrollState | null = null;
let rafId: number | null = null;
let settings: Settings | null = null;
let unregisterKeydown: (() => void) | null = null;
let unregisterKeyup: (() => void) | null = null;

let lastMouseX = 0;
let lastMouseY = 0;
let mouseListenerAttached = false;
let safetyTimerId: ReturnType<typeof setTimeout> | null = null;

const SAFETY_TIMEOUT_MS = 2000;

// --- Public API (same shape as before) ---

export function initScrollEngine(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKeydown = registerKeyHandler(handleScrollKeydown);
  unregisterKeyup = registerKeyupHandler(handleScrollKeyup);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onWindowBlur);
}

export function updateScrollSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function destroyScrollEngine(): void {
  stopScrolling();
  if (unregisterKeydown) unregisterKeydown();
  if (unregisterKeyup) unregisterKeyup();
  unregisterKeydown = null;
  unregisterKeyup = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('blur', onWindowBlur);
  removeMouseListener();
}

export function setScrollContext(_element: HTMLElement | null): void {
  // Reserved for external callers that want to override tier-1 target.
  // Currently tier-1 reads from aura-ring's trackedElement directly.
}

// --- Robustness listeners ---

function onVisibilityChange(): void {
  if (document.hidden) stopScrolling();
}

function onWindowBlur(): void {
  stopScrolling();
}

// --- Mouse tracking (lazy-init) ---

function ensureMouseListener(): void {
  if (mouseListenerAttached) return;
  mouseListenerAttached = true;
  document.addEventListener('mousemove', onMouseMove, { passive: true });
}

function removeMouseListener(): void {
  if (!mouseListenerAttached) return;
  mouseListenerAttached = false;
  document.removeEventListener('mousemove', onMouseMove);
}

function onMouseMove(e: MouseEvent): void {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

// --- Key handlers ---

function handleScrollKeydown(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  let direction: ScrollDirection | null = null;
  let fast = false;

  if (combo === settings.keybindings.scrollDown) {
    direction = 'down';
  } else if (combo === settings.keybindings.scrollUp) {
    direction = 'up';
  } else if (combo === settings.keybindings.scrollLeft) {
    direction = 'left';
  } else if (combo === settings.keybindings.scrollRight) {
    direction = 'right';
  } else if (combo === settings.keybindings.scrollFastDown) {
    direction = 'down';
    fast = true;
  } else if (combo === settings.keybindings.scrollFastUp) {
    direction = 'up';
    fast = true;
  }

  if (!direction) return false;

  ensureMouseListener();

  if (state && state.direction === direction && state.fast === fast) {
    state.accelerating = true;
    state.lastKeyTime = Date.now();
    resetSafetyTimer();
    return true;
  }

  if (state && state.direction !== direction) {
    stopScrolling();
  }

  const fastMultiplier = fast ? 4 : 1;
  const baseVelocity = settings.scrollBaseVelocity * fastMultiplier;
  state = {
    velocity: baseVelocity,
    direction,
    accelerating: true,
    fast,
    lastKeyTime: Date.now(),
  };

  resetSafetyTimer();

  if (rafId === null) {
    rafId = requestAnimationFrame(scrollTick);
  }

  return true;
}

function handleScrollKeyup(e: KeyboardEvent): void {
  if (!state) return;

  const isAlt = e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';
  const isDirection = e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyH' || e.code === 'KeyL';

  if (isAlt || isDirection) {
    if (state) {
      state.accelerating = false;
    }
    clearSafetyTimer();
  }
}

// --- Safety timer ---

function resetSafetyTimer(): void {
  clearSafetyTimer();
  safetyTimerId = setTimeout(() => {
    if (state?.accelerating) {
      state.accelerating = false;
    }
  }, SAFETY_TIMEOUT_MS);
}

function clearSafetyTimer(): void {
  if (safetyTimerId !== null) {
    clearTimeout(safetyTimerId);
    safetyTimerId = null;
  }
}

// --- Scroll loop ---

function scrollTick(): void {
  rafId = null;
  if (!state || !settings) return;

  const { direction, velocity } = state;
  const fastMultiplier = state.fast ? 4 : 1;
  const maxVelocity = settings.scrollMaxVelocity * fastMultiplier;

  if (state.accelerating) {
    state.velocity = Math.min(velocity + settings.scrollBaseVelocity * 0.25, maxVelocity);
  } else {
    state.velocity = velocity * settings.scrollDecelFactor;
  }

  if (state.velocity < 0.5 && !state.accelerating) {
    stopScrolling();
    return;
  }

  const v = state.velocity;
  const target = resolveScrollTarget(direction);

  switch (direction) {
    case 'down':
      target.scrollBy(0, v);
      break;
    case 'up':
      target.scrollBy(0, -v);
      break;
    case 'right':
      target.scrollBy(v, 0);
      break;
    case 'left':
      target.scrollBy(-v, 0);
      break;
  }

  rafId = requestAnimationFrame(scrollTick);
}

// --- 3-tier scroll target resolution ---

function resolveScrollTarget(direction: ScrollDirection): Element {
  // Tier 1: last focused element's scrollable ancestor
  const focused = getTrackedElement();
  if (focused) {
    const ancestor = findScrollableAncestor(focused, direction);
    if (ancestor && hasScrollRoom(ancestor, direction)) return ancestor;
  }

  // Tier 2: element under mouse cursor
  const hovered = document.elementFromPoint(lastMouseX, lastMouseY);
  if (hovered) {
    const ancestor = findScrollableAncestor(hovered, direction);
    if (ancestor && hasScrollRoom(ancestor, direction)) return ancestor;
  }

  // Tier 3: page fallback
  return document.scrollingElement ?? document.documentElement;
}

function findScrollableAncestor(start: Element, direction: ScrollDirection): Element | null {
  let node: Element | null = start;
  while (node && node !== document.documentElement) {
    if (isScrollable(node, direction) && hasScrollRoom(node, direction)) {
      return node;
    }
    node = node.parentElement;
  }
  const root = document.scrollingElement ?? document.documentElement;
  if (isScrollable(root, direction) && hasScrollRoom(root, direction)) return root;
  return null;
}

function isScrollable(el: Element, direction: ScrollDirection): boolean {
  const style = getComputedStyle(el);
  if (direction === 'up' || direction === 'down') {
    const overflowY = style.overflowY;
    if (overflowY === 'hidden' || overflowY === 'visible') return false;
    return el.scrollHeight > el.clientHeight;
  }
  const overflowX = style.overflowX;
  if (overflowX === 'hidden' || overflowX === 'visible') return false;
  return el.scrollWidth > el.clientWidth;
}

function hasScrollRoom(el: Element, direction: ScrollDirection): boolean {
  switch (direction) {
    case 'down':
      return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    case 'up':
      return el.scrollTop > 0;
    case 'left':
      return el.scrollLeft > 0;
    case 'right':
      return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  }
}

function stopScrolling(): void {
  state = null;
  clearSafetyTimer();
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
