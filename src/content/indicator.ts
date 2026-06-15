import { AURA_COLORS } from '../shared/constants';
import type { Mode } from '../shared/types';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let chip: HTMLElement | null = null;
let animTimer: ReturnType<typeof setTimeout> | null = null;

const ANIM_DOT_TO_ICON_MS = 250;
const ANIM_ICON_TO_PILL_MS = 300;
const ANIM_PILL_HOLD_MS = 1200;
const ANIM_PILL_TO_DOT_MS = 250;
const ANIM_EXIT_MS = 150;

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
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  chip.innerHTML = `
    <span class="icon" aria-hidden="true"></span>
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

  const color = mode === 'editing' ? AURA_COLORS.editing : AURA_COLORS.navigation;
  const icon = mode === 'editing' ? PEN_SVG : COMPASS_SVG;
  const label = mode === 'editing' ? 'EDIT' : 'NAVIGATE';

  chip.style.setProperty('--chip-color', color);
  const iconEl = chip.querySelector('.icon');
  const labelEl = chip.querySelector('.label');
  if (iconEl) iconEl.innerHTML = icon;
  if (labelEl) labelEl.textContent = label;

  runAnimation(chip);
}

export function hideIndicator(): void {
  if (!chip) return;
  if (animTimer) {
    clearTimeout(animTimer);
    animTimer = null;
  }
  chip.className = 'indicator state-exit';

  animTimer = setTimeout(() => {
    if (chip) chip.className = 'indicator state-hidden';
  }, ANIM_EXIT_MS);
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
        }, ANIM_PILL_TO_DOT_MS);
      }, ANIM_PILL_HOLD_MS);
    }, ANIM_ICON_TO_PILL_MS);
  }, ANIM_DOT_TO_ICON_MS);
}

function getIndicatorStyles(): string {
  return `
    :host {
      --chip-color: ${AURA_COLORS.navigation};
    }

    .indicator {
      position: fixed;
      bottom: 12px;
      right: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--chip-color);
      color: white;
      border-radius: 999px;
      white-space: nowrap;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
      min-width: 8px;
      min-height: 8px;
    }

    .indicator.state-hidden {
      min-width: 0;
      min-height: 0;
      max-width: 0;
      height: 0;
      padding: 0;
      opacity: 0;
      transform: scale(0);
    }

    .indicator.state-exit {
      min-width: 0;
      min-height: 0;
      max-width: 8px;
      height: 8px;
      padding: 0;
      opacity: 0;
      transform: scale(0);
    }

    .indicator.state-dot {
      max-width: 8px;
      height: 8px;
      padding: 0;
      opacity: 1;
      transform: scale(1);
    }

    .indicator.state-dot .icon,
    .indicator.state-dot .label {
      opacity: 0;
      width: 0;
      height: 0;
      overflow: hidden;
    }

    .indicator.state-icon {
      max-width: 28px;
      height: 28px;
      padding: 5px;
      opacity: 1;
      transform: scale(1);
    }

    .indicator.state-icon .icon {
      width: 16px;
      height: 16px;
      opacity: 1;
    }

    .indicator.state-icon .label {
      max-width: 0;
      opacity: 0;
      overflow: hidden;
      font-size: 0;
    }

    .indicator.state-pill {
      height: 28px;
      padding: 5px 12px 5px 8px;
      opacity: 1;
      transform: scale(1);
      max-width: 140px;
    }

    .indicator.state-pill .icon {
      width: 14px;
      height: 14px;
      opacity: 1;
      flex-shrink: 0;
    }

    .indicator.state-pill .label {
      opacity: 1;
      max-width: 80px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .icon svg {
      width: 100%;
      height: 100%;
    }

    .label {
      transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  `;
}
