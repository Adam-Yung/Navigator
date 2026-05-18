import type { IndexedElement, Mode, Direction, Settings } from '../shared/types';
import { AURA_COLORS, AURA_INTENSITY_SHADOWS } from '../shared/constants';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let ring: HTMLElement | null = null;
let visible = false;
let animDuration = 250;
let auraIntensity: Settings['auraIntensity'] = 'normal';
let trackedElement: HTMLElement | null = null;
let rafId: number | null = null;
let isTransitioning = false;

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

  document.documentElement.appendChild(host);
}

export function updateAuraSettings(settings: Settings): void {
  animDuration = settings.animDuration;
  auraIntensity = settings.auraIntensity;
  if (ring) {
    ring.style.transitionDuration = `${animDuration}ms`;
  }
}

export function transitionTo(target: IndexedElement, mode: Mode): void {
  if (!ring) return;

  const rect = target.el.getBoundingClientRect();
  const padding = 8;
  const borderRadius = getTargetBorderRadius(target.el, padding);

  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = Math.max(rect.width + padding * 2, 24);
  const height = Math.max(rect.height + padding * 2, 24);

  isTransitioning = true;
  ring.style.transitionDuration = `${animDuration}ms`;
  ring.style.top = `${top}px`;
  ring.style.left = `${left}px`;
  ring.style.width = `${width}px`;
  ring.style.height = `${height}px`;
  ring.style.borderRadius = borderRadius;

  const color = mode === 'editing' ? AURA_COLORS.editing : AURA_COLORS.navigation;
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
  }, animDuration);
}

export function bumpDirection(direction: Direction): void {
  if (!ring) return;
  const offsets: Record<Direction, [number, number]> = {
    left: [-3, 0], right: [3, 0], up: [0, -3], down: [0, 3],
  };
  const [dx, dy] = offsets[direction];
  ring.style.transition = 'transform 80ms ease-out';
  ring.style.transform = `translate(${dx}px, ${dy}px)`;
  setTimeout(() => {
    if (!ring) return;
    ring.style.transition = 'transform 80ms ease-in';
    ring.style.transform = 'translate(0, 0)';
  }, 80);
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

export function destroyAuraRing(): void {
  stopTracking();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    ring = null;
    visible = false;
    trackedElement = null;
  }
}

function startTracking(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(trackPosition);
}

function stopTracking(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function trackPosition(): void {
  rafId = null;
  if (!ring || !trackedElement || !visible) return;
  if (isTransitioning) {
    rafId = requestAnimationFrame(trackPosition);
    return;
  }

  const rect = trackedElement.getBoundingClientRect();
  const padding = 8;
  ring.style.transitionDuration = '0ms';
  ring.style.top = `${rect.top - padding}px`;
  ring.style.left = `${rect.left - padding}px`;
  ring.style.width = `${Math.max(rect.width + padding * 2, 24)}px`;
  ring.style.height = `${Math.max(rect.height + padding * 2, 24)}px`;

  rafId = requestAnimationFrame(trackPosition);
}

function getTargetBorderRadius(el: HTMLElement, padding: number): string {
  const computed = getComputedStyle(el);
  const raw = computed.borderRadius;

  if (!raw || raw === '0px') {
    return `${Math.min(padding + 4, 12)}px`;
  }

  const values = raw.split(' ').map(v => {
    const px = parseFloat(v);
    return isNaN(px) ? padding + 4 : px + padding;
  });

  return values.map(v => `${v}px`).join(' ');
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
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      will-change: top, left, width, height, opacity, transform;
      animation: aura-breathe 2.5s ease-in-out infinite;
    }

    .aura-ring.visible {
      opacity: 1;
    }

    @keyframes aura-breathe {
      0%, 100% { transform: scale(1) translate(var(--bump-x, 0), var(--bump-y, 0)); }
      50% { transform: scale(0.97) translate(var(--bump-x, 0), var(--bump-y, 0)); }
    }

    .aura-ring:not(.visible) {
      animation: none;
    }
  `;
}
