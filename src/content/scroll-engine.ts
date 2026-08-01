import type { Settings } from '../shared/types';
import { buildComboString } from '../shared/keys';
import { registerKeyHandler, registerKeyupHandler } from './key-handler';
import { findMagnetTarget, applyMagnetism } from './magnetic-scroll';

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface ScrollState {
  velocity: number;
  direction: ScrollDirection;
  accelerating: boolean;
  fast: boolean;
}

let state: ScrollState | null = null;
let rafId: number | null = null;
let settings: Settings | null = null;
let unregisterKeydown: (() => void) | null = null;
let unregisterKeyup: (() => void) | null = null;

export function initScrollEngine(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKeydown = registerKeyHandler(handleScrollKeydown);
  unregisterKeyup = registerKeyupHandler(handleScrollKeyup);
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
}

function handleScrollKeydown(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  let direction: ScrollDirection | null = null;
  let fast = false;

  if (combo === settings.keybindings.scrollDown) { direction = 'down'; }
  else if (combo === settings.keybindings.scrollUp) { direction = 'up'; }
  else if (combo === settings.keybindings.scrollLeft) { direction = 'left'; }
  else if (combo === settings.keybindings.scrollRight) { direction = 'right'; }
  else if (combo === settings.keybindings.scrollFastDown) { direction = 'down'; fast = true; }
  else if (combo === settings.keybindings.scrollFastUp) { direction = 'up'; fast = true; }

  if (!direction) return false;

  if (state && state.direction === direction && state.fast === fast) {
    state.accelerating = true;
    return true;
  }

  if (state && state.direction !== direction) {
    stopScrolling();
  }

  const baseVelocity = settings.scrollBaseVelocity * (fast ? 3 : 1);
  state = {
    velocity: baseVelocity,
    direction,
    accelerating: true,
    fast,
  };

  if (rafId === null) {
    rafId = requestAnimationFrame(scrollTick);
  }

  return true;
}

function handleScrollKeyup(e: KeyboardEvent): void {
  if (!state) return;

  const isAlt = e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';
  const isDirection =
    e.code === 'KeyJ' || e.code === 'KeyK' ||
    e.code === 'KeyH' || e.code === 'KeyL';

  if (isAlt || isDirection) {
    if (state) {
      state.accelerating = false;
    }
  }
}

function scrollTick(): void {
  rafId = null;
  if (!state || !settings) return;

  const { direction, velocity } = state;
  const maxVelocity = settings.scrollMaxVelocity * (state.fast ? 3 : 1);

  if (state.accelerating) {
    state.velocity = Math.min(velocity + settings.scrollBaseVelocity * 0.08, maxVelocity);
  } else {
    state.velocity = velocity * settings.scrollDecelFactor;
  }

  if (state.velocity < 0.5 && !state.accelerating) {
    const target = findMagnetTarget();
    if (target) applyMagnetism(target);
    stopScrolling();
    return;
  }

  const v = state.velocity;
  switch (direction) {
    case 'down': window.scrollBy(0, v); break;
    case 'up': window.scrollBy(0, -v); break;
    case 'right': window.scrollBy(v, 0); break;
    case 'left': window.scrollBy(-v, 0); break;
  }

  rafId = requestAnimationFrame(scrollTick);
}

function stopScrolling(): void {
  state = null;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
