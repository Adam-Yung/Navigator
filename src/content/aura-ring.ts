import type { IndexedElement, Mode, Settings } from '../shared/types';
import { AURA_COLORS, AURA_INTENSITY_SHADOWS } from '../shared/constants';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let ring: HTMLElement | null = null;
let isVisible = false;
let animDuration = 250;
let auraIntensity: Settings['auraIntensity'] = 'normal';

export function initAuraRing(): void {
  host = document.createElement('div');
  host.id = 'modal-nav-aura-host';
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

  const rect = target.rect;
  const padding = 8;
  const borderRadius = getTargetBorderRadius(target.el, padding);

  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = Math.max(rect.width + padding * 2, 24);
  const height = Math.max(rect.height + padding * 2, 24);

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

  if (!isVisible) {
    show();
  }
}

export function show(): void {
  if (!ring) return;
  ring.classList.add('visible');
  isVisible = true;
}

export function hide(): void {
  if (!ring) return;
  ring.classList.remove('visible');
  isVisible = false;
}

export function destroyAuraRing(): void {
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    ring = null;
    isVisible = false;
  }
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
      transition-property: top, left, width, height, border-radius, border-color, box-shadow, opacity;
      transition-duration: ${animDuration}ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      will-change: top, left, width, height, opacity;
      animation: aura-breathe 2.5s ease-in-out infinite;
    }

    .aura-ring.visible {
      opacity: 1;
    }

    @keyframes aura-breathe {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.75; }
    }

    .aura-ring:not(.visible) {
      animation: none;
    }
  `;
}
