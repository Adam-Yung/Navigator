let labelEl: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let host: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let currentElement: HTMLElement | null = null;

export function initContextualLabel(): void {
  const existing = document.getElementById('navigator-ctx-label-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-ctx-label-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483643;pointer-events:none;';
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .ctx-label {
      position: fixed;
      transform: translateX(-50%);
      padding: 2px 8px;
      background: rgba(15, 15, 30, 0.8);
      border-radius: 4px;
      color: rgba(136, 136, 168, 0.7);
      font: 10px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 150ms ease;
      pointer-events: none;
    }
    .ctx-label.visible {
      opacity: 1;
    }
  `;
  shadow.appendChild(style);

  labelEl = document.createElement('div');
  labelEl.className = 'ctx-label';
  shadow.appendChild(labelEl);

  document.documentElement.appendChild(host);
}

export function showLabelForElement(el: HTMLElement): void {
  hideLabel();
  currentElement = el;
  showTimer = setTimeout(() => {
    if (!labelEl || currentElement !== el) return;
    const text = getActionText(el);
    if (!text) return;
    const rect = el.getBoundingClientRect();
    labelEl.textContent = text;
    labelEl.style.top = `${rect.bottom + 6}px`;
    labelEl.style.left = `${rect.left + rect.width / 2}px`;
    labelEl.classList.add('visible');
  }, 400);
}

export function hideLabel(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (labelEl) labelEl.classList.remove('visible');
  currentElement = null;
}

export function destroyContextualLabel(): void {
  hideLabel();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    labelEl = null;
  }
}

function getActionText(el: HTMLElement): string | null {
  const tag = el.tagName;
  if (tag === 'A') return 'open link';
  if (tag === 'BUTTON' || el.getAttribute('role') === 'button') return 'click';
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    return 'focus input';
  }
  if (tag === 'TEXTAREA') return 'focus input';
  if (tag === 'SELECT') return 'open dropdown';
  if (tag === 'DETAILS' || tag === 'SUMMARY') return el.closest('details')?.open ? 'collapse' : 'expand';
  if (el.getAttribute('role') === 'tab') return 'switch tab';
  if (el.getAttribute('role') === 'menuitem') return 'select';
  return null;
}
