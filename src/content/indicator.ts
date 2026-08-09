import { AURA_COLOR } from '../shared/constants';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let chip: HTMLElement | null = null;
let animTimer: ReturnType<typeof setTimeout> | null = null;

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
  chip.className = 'indicator state-hidden';
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  shadow.appendChild(chip);

  document.documentElement.appendChild(host);
}

export type ToastType = 'info' | 'success' | 'error';

export function showToast(text: string, durationMs = 1500, type: ToastType = 'info'): void {
  if (!chip) return;
  if (animTimer) {
    clearTimeout(animTimer);
    animTimer = null;
  }

  chip.textContent = text;
  chip.className = `indicator state-visible type-${type}`;

  animTimer = setTimeout(() => {
    hideIndicator();
  }, durationMs);
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

function getIndicatorStyles(): string {
  return `
    .indicator {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%) scale(1);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      background: rgba(15, 15, 30, 0.92);
      border: 1px solid rgba(100, 80, 255, 0.2);
      color: #e4e4ef;
      border-radius: 8px;
      white-space: nowrap;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(100, 80, 255, 0.3);
      font: 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      transition: all 150ms cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    .indicator.state-hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.9);
      pointer-events: none;
    }

    .indicator.state-exit {
      opacity: 0;
      transform: translateX(-50%) scale(0.95);
    }

    .indicator.state-visible {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }

    .indicator.type-info {
      border-color: rgba(100, 80, 255, 0.2);
    }

    .indicator.type-error {
      border-color: rgba(255, 107, 107, 0.5);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 8px rgba(255, 107, 107, 0.15);
    }

    .indicator.type-success {
      border-color: rgba(74, 222, 128, 0.5);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 8px rgba(74, 222, 128, 0.15);
    }
  `;
}
