import type { Settings } from '../shared/types';
import { registerKeyHandler, registerKeyupHandler } from './key-handler';
import { UI } from './ui-tokens';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let bar: HTMLElement | null = null;
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
  if (host) { host.remove(); host = null; }
  if (unregisterDown) unregisterDown();
  if (unregisterUp) unregisterUp();
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
}

function hideHelper(): void {
  visible = false;
  if (bar) bar.classList.add('hidden');
}

function cancelTimer(): void {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
}

function getStyles(): string {
  return `
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
