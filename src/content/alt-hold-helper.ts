import type { Settings } from '../shared/types';
import { registerKeyHandler, registerKeyupHandler } from './key-handler';
import { scanVisibleElements } from './mutation-observer';
import { UI } from './ui-tokens';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let bar: HTMLElement | null = null;
let badgesContainer: HTMLElement | null = null;
let settings: Settings | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let visible = false;
let unregisterDown: (() => void) | null = null;
let unregisterUp: (() => void) | null = null;

export function initAltHoldHelper(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterDown = registerKeyHandler(handleKeydown);
  unregisterUp = registerKeyupHandler(handleKeyup);
}

export function updateAltHoldSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function destroyAltHoldHelper(): void {
  hideHelper();
  if (host) {
    host.remove();
    host = null;
  }
  if (unregisterDown) unregisterDown();
  if (unregisterUp) unregisterUp();
}

export function cancelAltHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (visible) hideHelper();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-alt-helper-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-alt-helper-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.panel};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  badgesContainer = document.createElement('div');
  badgesContainer.className = 'badges-container';
  shadow.appendChild(badgesContainer);

  bar = document.createElement('div');
  bar.className = 'helper-bar hidden';
  bar.innerHTML = `
    <div class="helper-row">
      <span class="helper-item"><kbd>F</kbd> Picker</span>
      <span class="helper-item"><kbd>T</kbd> Tabs</span>
      <span class="helper-item"><kbd>/</kbd> Search</span>
      <span class="helper-item"><kbd>Space</kbd> Actions</span>
      <span class="helper-item"><kbd>V</kbd> Select Text</span>
    </div>
    <div class="helper-row">
      <span class="helper-item"><kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> Scroll</span>
      <span class="helper-item"><kbd>[</kbd> Back</span>
      <span class="helper-item"><kbd>]</kbd> Forward</span>
      <span class="helper-item"><kbd>U</kbd> URL Up</span>
      <span class="helper-item"><kbd>G</kbd> First Input</span>
    </div>
    <div class="helper-row">
      <span class="helper-item"><kbd>O</kbd> Prev Focus</span>
      <span class="helper-item"><kbd>I</kbd> Next Focus</span>
      <span class="helper-item"><kbd>M</kbd> Set Mark</span>
      <span class="helper-item"><kbd>Y</kbd> Copy</span>
      <span class="helper-item"><kbd>P</kbd> Paste URL</span>
    </div>
  `;
  shadow.appendChild(bar);
  document.documentElement.appendChild(host);
}

function handleKeydown(e: KeyboardEvent): boolean {
  if (!settings || !settings.showAltHelper) return false;

  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    if (!holdTimer && !visible) {
      holdTimer = setTimeout(showHelper, settings.altHelperDelay);
    }
    return false;
  }

  cancelTimer();
  if (visible) hideHelper();
  return false;
}

function handleKeyup(e: KeyboardEvent): void {
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    cancelTimer();
    if (visible) hideHelper();
  }
}

function showHelper(): void {
  holdTimer = null;
  visible = true;
  if (bar) bar.classList.remove('hidden');
  showBadges();
}

function hideHelper(): void {
  visible = false;
  if (bar) bar.classList.add('hidden');
  removeBadges();
}

function showBadges(): void {
  if (!badgesContainer) return;

  const elements = scanVisibleElements();
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const scored = elements.map((el) => {
    const rect = el.el.getBoundingClientRect();
    const inViewport = rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
    const area = rect.width * rect.height;
    return { el, inViewport, area };
  });

  scored.sort((a, b) => {
    if (a.inViewport !== b.inViewport) return a.inViewport ? -1 : 1;
    return b.area - a.area;
  });

  const count = Math.min(scored.length, 10);

  for (let i = 0; i < count; i++) {
    const rect = scored[i].el.el.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'qp-badge';
    badge.textContent = i < 9 ? String(i + 1) : '0';
    badge.style.top = `${rect.top}px`;
    badge.style.left = `${rect.left}px`;
    badgesContainer.appendChild(badge);
  }
}

function removeBadges(): void {
  if (badgesContainer) badgesContainer.innerHTML = '';
}

function cancelTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function getStyles(): string {
  return `
    .badges-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
    }
    .qp-badge {
      position: fixed;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(100, 80, 255, 0.9);
      color: #fff;
      font: bold 11px ${UI.font.mono};
      border-radius: 5px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
      pointer-events: none;
      animation: badge-in ${UI.anim.entryDuration} ${UI.anim.easeSpring} both;
    }
    @keyframes badge-in {
      from { transform: scale(0); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }
    .helper-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 10px 20px;
      background: ${UI.colors.bg};
      border-top: 1px solid ${UI.colors.border};
      border-radius: 12px 12px 0 0;
      backdrop-filter: ${UI.backdrop};
      box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: opacity 120ms ${UI.anim.easeFastOut}, transform 120ms ${UI.anim.easeFastOut};
      pointer-events: none;
    }
    .helper-bar.hidden {
      opacity: 0;
      transform: translateY(8px);
    }
    .helper-row {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .helper-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: ${UI.colors.textMuted};
      font: ${UI.font.sizeSm} ${UI.font.base};
    }
    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      background: ${UI.colors.accentDim};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.badge};
      font: 600 ${UI.font.sizeXs} ${UI.font.mono};
      color: ${UI.colors.text};
    }
  `;
}
