import type { Mode } from '../shared/types';
import { AURA_COLORS } from '../shared/constants';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let chip: HTMLElement | null = null;
let animTimer: ReturnType<typeof setTimeout> | null = null;
let currentDisplayMode: Mode = 'normal';

const COMPASS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none"/></svg>`;

const PEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

export function initIndicator(): void {
  const existing = document.getElementById('navigator-indicator-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-indicator-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getIndicatorStyles();
  shadow.appendChild(style);

  chip = document.createElement('div');
  chip.className = 'indicator';
  chip.innerHTML = `
    <span class="icon"></span>
    <span class="label"></span>
  `;
  shadow.appendChild(chip);

  document.documentElement.appendChild(host);
}

export function showModeIndicator(mode: Mode): void {
  if (!chip || mode === 'normal') {
    hideIndicator();
    return;
  }

  if (animTimer) {
    clearTimeout(animTimer);
    animTimer = null;
  }

  currentDisplayMode = mode;
  const color = mode === 'editing' ? AURA_COLORS.editing : AURA_COLORS.navigation;
  const icon = mode === 'editing' ? PEN_SVG : COMPASS_SVG;
  const label = mode === 'editing' ? 'EDIT' : 'NAVIGATE';

  chip.style.setProperty('--chip-color', color);
  chip.querySelector('.icon')!.innerHTML = icon;
  chip.querySelector('.label')!.textContent = label;

  runAnimation(chip);
}

export function hideIndicator(): void {
  if (!chip) return;
  if (animTimer) {
    clearTimeout(animTimer);
    animTimer = null;
  }
  currentDisplayMode = 'normal';
  chip.className = 'indicator state-exit';

  animTimer = setTimeout(() => {
    if (chip) chip.className = 'indicator state-hidden';
  }, 150);
}

export function destroyIndicator(): void {
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    chip = null;
  }
  if (animTimer) {
    clearTimeout(animTimer);
    animTimer = null;
  }
}

function runAnimation(el: HTMLElement): void {
  el.className = 'indicator state-dot';

  animTimer = setTimeout(() => {
    el.className = 'indicator state-icon';

    animTimer = setTimeout(() => {
      el.className = 'indicator state-pill';

      animTimer = setTimeout(() => {
        el.className = 'indicator state-icon';

        animTimer = setTimeout(() => {
          el.className = 'indicator state-dot';
          animTimer = null;
        }, 200);
      }, 1200);
    }, 250);
  }, 200);
}

function getIndicatorStyles(): string {
  return `
    :host {
      --chip-color: ${AURA_COLORS.navigation};
    }

    .indicator {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--chip-color);
      color: white;
      border-radius: 999px;
      overflow: hidden;
      white-space: nowrap;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1),
                  height 200ms cubic-bezier(0.4, 0, 0.2, 1),
                  padding 200ms cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 150ms ease,
                  transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  background-color 150ms ease;
      pointer-events: none;
    }

    .indicator.state-hidden {
      width: 0;
      height: 0;
      padding: 0;
      opacity: 0;
      transform: translateX(-50%) scale(0);
    }

    .indicator.state-exit {
      width: 6px;
      height: 6px;
      padding: 0;
      opacity: 0;
      transform: translateX(-50%) scale(0);
    }

    .indicator.state-dot {
      width: 6px;
      height: 6px;
      padding: 0;
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }

    .indicator.state-dot .icon,
    .indicator.state-dot .label {
      opacity: 0;
      width: 0;
      height: 0;
      overflow: hidden;
    }

    .indicator.state-icon {
      width: 24px;
      height: 24px;
      padding: 4px;
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }

    .indicator.state-icon .icon {
      width: 14px;
      height: 14px;
      opacity: 1;
      transition: opacity 150ms ease;
    }

    .indicator.state-icon .label {
      width: 0;
      opacity: 0;
      overflow: hidden;
      font-size: 0;
    }

    .indicator.state-pill {
      height: 28px;
      padding: 4px 12px 4px 8px;
      opacity: 1;
      transform: translateX(-50%) scale(1);
      width: auto;
    }

    .indicator.state-pill .icon {
      width: 14px;
      height: 14px;
      opacity: 1;
      flex-shrink: 0;
    }

    .indicator.state-pill .label {
      opacity: 1;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      transition: opacity 200ms ease;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: width 200ms ease, height 200ms ease, opacity 150ms ease;
    }

    .icon svg {
      width: 100%;
      height: 100%;
    }

    .label {
      transition: opacity 200ms ease, width 200ms ease, font-size 200ms ease;
    }
  `;
}
