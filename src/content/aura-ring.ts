import { AURA_COLOR, AURA_INTENSITY_SHADOWS } from '../shared/constants';
import type { IndexedElement, Settings } from '../shared/types';

type Direction = 'left' | 'right' | 'up' | 'down';

const RING_PADDING = 8;
const RING_MIN_SIZE = 24;
const BUMP_OFFSET_PX = 3;
const BUMP_TIMING_MS = 80;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let ring: HTMLElement | null = null;
let ghost: HTMLElement | null = null;
let visible = false;
let animDuration = 250;
let auraIntensity: Settings['auraIntensity'] = 'normal';
let trackedElement: HTMLElement | null = null;
let rafId: number | null = null;
let isTransitioning = false;
let isRapidMovement = false;
let lastTransitionTime = 0;
const RAPID_THRESHOLD_MS = 100;

export function initAuraRing(): void {
  const existing = document.getElementById('navigator-aura-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-aura-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  ring = document.createElement('div');
  ring.className = 'aura-ring';
  shadow.appendChild(ring);

  ghost = document.createElement('div');
  ghost.className = 'aura-ghost';
  shadow.appendChild(ghost);

  document.documentElement.appendChild(host);
}

export function updateAuraSettings(settings: Settings): void {
  animDuration = settings.animDuration;
  auraIntensity = settings.auraIntensity;
  if (ring) {
    ring.style.transitionDuration = `${animDuration}ms`;
  }
}

export function transitionTo(target: IndexedElement): void {
  if (!ring || !ghost) return;

  const now = Date.now();
  isRapidMovement = now - lastTransitionTime < RAPID_THRESHOLD_MS;
  lastTransitionTime = now;

  if (visible && trackedElement && !isRapidMovement) {
    const currentRect = ring.getBoundingClientRect();
    if (currentRect.width > 0) {
      ghost.style.top = ring.style.top;
      ghost.style.left = ring.style.left;
      ghost.style.width = ring.style.width;
      ghost.style.height = ring.style.height;
      ghost.style.borderRadius = ring.style.borderRadius;
      ghost.classList.remove('fading');
      void ghost.offsetWidth;
      ghost.classList.add('fading');
    }
  }

  const rect = target.el.getBoundingClientRect();
  const padding = RING_PADDING;
  const borderRadius = getTargetBorderRadius(target.el, padding);

  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = Math.max(rect.width + padding * 2, RING_MIN_SIZE);
  const height = Math.max(rect.height + padding * 2, RING_MIN_SIZE);

  isTransitioning = true;
  ring.classList.add('transitioning');
  ring.style.willChange = 'top, left, width, height, opacity, transform';
  ring.style.transitionDuration = `${animDuration}ms`;
  ring.style.top = `${top}px`;
  ring.style.left = `${left}px`;
  ring.style.width = `${width}px`;
  ring.style.height = `${height}px`;
  ring.style.borderRadius = borderRadius;

  const color = AURA_COLOR;
  const shadows = AURA_INTENSITY_SHADOWS[auraIntensity];

  ring.style.borderColor = color;
  ring.style.boxShadow = [
    `${shadows.spread1} ${withAlpha(color, 0.3)}`,
    `${shadows.spread2} ${withAlpha(color, 0.4)}`,
    `${shadows.spread3} ${withAlpha(color, 0.15)}`,
  ].join(', ');

  if (!visible) {
    show();
  }

  trackedElement = target.el;

  setTimeout(() => {
    isTransitioning = false;
    if (ring) {
      ring.style.willChange = 'auto';
      ring.classList.remove('transitioning');
    }
  }, animDuration);
}

export function bumpDirection(direction: Direction): void {
  if (!ring) return;
  const offsets: Record<Direction, [number, number]> = {
    left: [-BUMP_OFFSET_PX, 0],
    right: [BUMP_OFFSET_PX, 0],
    up: [0, -BUMP_OFFSET_PX],
    down: [0, BUMP_OFFSET_PX],
  };
  const [dx, dy] = offsets[direction];
  ring.style.transition = `transform ${BUMP_TIMING_MS}ms ease-out`;
  ring.style.transform = `translate(${dx}px, ${dy}px)`;
  setTimeout(() => {
    if (!ring) return;
    ring.style.transition = `transform ${BUMP_TIMING_MS}ms ease-in`;
    ring.style.transform = 'translate(0, 0)';
  }, BUMP_TIMING_MS);
}

export function show(): void {
  if (!ring) return;
  ring.classList.add('visible');
  visible = true;
  startTracking();
}

export function hide(): void {
  if (!ring) return;
  ring.classList.remove('visible');
  visible = false;
  trackedElement = null;
  stopTracking();
}

export function getTrackedElement(): HTMLElement | null {
  return trackedElement;
}

export function destroyAuraRing(): void {
  stopTracking();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    ring = null;
    ghost = null;
    visible = false;
    trackedElement = null;
  }
}

function startTracking(): void {
  if (rafId !== null) return;
  window.addEventListener('scroll', onScrollTrack, { passive: true, capture: true });
  window.addEventListener('resize', onScrollTrack, { passive: true });
}

function stopTracking(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  window.removeEventListener('scroll', onScrollTrack, true);
  window.removeEventListener('resize', onScrollTrack);
}

function onScrollTrack(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(updatePosition);
}

function updatePosition(): void {
  rafId = null;
  if (!ring || !trackedElement || !visible) return;
  if (isTransitioning) return;

  const rect = trackedElement.getBoundingClientRect();
  const padding = RING_PADDING;
  ring.style.transitionDuration = '0ms';
  ring.style.top = `${rect.top - padding}px`;
  ring.style.left = `${rect.left - padding}px`;
  ring.style.width = `${Math.max(rect.width + padding * 2, RING_MIN_SIZE)}px`;
  ring.style.height = `${Math.max(rect.height + padding * 2, RING_MIN_SIZE)}px`;
}

function getTargetBorderRadius(el: HTMLElement, padding: number): string {
  const computed = getComputedStyle(el);
  const raw = computed.borderRadius;

  if (!raw || raw === '0px') {
    return `${Math.min(padding + 4, 12)}px`;
  }

  const values = raw.split(' ').map((v) => {
    const px = parseFloat(v);
    return Number.isNaN(px) ? padding + 4 : px + padding;
  });

  return values.map((v) => `${v}px`).join(' ');
}

function withAlpha(hsl: string, alpha: number): string {
  const match = hsl.match(/hsl\((.+)\)/);
  if (match) {
    return `hsla(${match[1]}, ${alpha})`;
  }
  return hsl;
}

function getStyles(): string {
  return `
    .aura-ring {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      border: 2px solid transparent;
      box-sizing: border-box;
      pointer-events: none;
      opacity: 0;
      transform: translate(0, 0);
      transition-property: top, left, width, height, border-radius, border-color, box-shadow, opacity;
      transition-duration: ${animDuration}ms;
      transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
      animation: aura-breathe 2.5s ease-in-out infinite;
    }

    .aura-ring.visible {
      opacity: 1;
      will-change: transform;
    }

    .aura-ring.transitioning {
      animation-play-state: paused;
    }

    @keyframes aura-breathe {
      0%, 100% { transform: scale(1) translate(var(--bump-x, 0), var(--bump-y, 0)); }
      50% { transform: scale(0.97) translate(var(--bump-x, 0), var(--bump-y, 0)); }
    }

    .aura-ring:not(.visible) {
      animation: none;
    }

    .aura-ghost {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      border: 1px solid hsla(250, 60%, 65%, 0.3);
      box-sizing: border-box;
      pointer-events: none;
      opacity: 0;
      transition: none;
    }

    .aura-ghost.fading {
      opacity: 0.3;
      animation: ghost-fade 300ms ease-out forwards;
    }

    @keyframes ghost-fade {
      from { opacity: 0.3; }
      to { opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 50ms !important;
      }
    }
  `;
}
