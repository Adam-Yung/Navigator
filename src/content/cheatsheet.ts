import type { Settings } from '../shared/types';
import { registerKeyHandler } from './key-handler';
import { UI } from './ui-tokens';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let overlay: HTMLElement | null = null;
let active = false;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;

export function initCheatsheet(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateCheatsheetSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function deactivateCheatsheet(): void {
  active = false;
  if (overlay) overlay.classList.add('hidden');
}

export function isCheatsheetActive(): boolean {
  return active;
}

export function destroyCheatsheet(): void {
  deactivateCheatsheet();
  if (host) { host.remove(); host = null; }
  if (unregisterKey) unregisterKey();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-cheatsheet-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-cheatsheet-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.indicator};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  overlay = document.createElement('div');
  overlay.className = 'cheatsheet hidden';
  overlay.innerHTML = getContent();
  shadow.appendChild(overlay);

  document.documentElement.appendChild(host);
}

function handleKey(e: KeyboardEvent): boolean {
  if (active) {
    if (e.key === 'Escape' || e.key === '?') {
      deactivateCheatsheet();
      return true;
    }
    return true;
  }

  if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) {
      return false;
    }
    active = true;
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.pointerEvents = 'auto';
    }
    return true;
  }

  return false;
}

function getContent(): string {
  return `
    <div class="cs-card">
      <h2 class="cs-title">Navigator Shortcuts</h2>
      <div class="cs-grid">
        <div class="cs-section">
          <h3>Scrolling</h3>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>J</kbd>/<kbd>K</kbd> Scroll down/up</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>H</kbd>/<kbd>L</kbd> Scroll left/right</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>/<kbd>K</kbd> Fast scroll</div>
        </div>
        <div class="cs-section">
          <h3>Picking</h3>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>F</kbd> Element picker</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>T</kbd> Tab picker</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>/</kbd> Text search</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>Space</kbd> Quick actions</div>
        </div>
        <div class="cs-section">
          <h3>Navigation</h3>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>[</kbd>/<kbd>]</kbd> History back/forward</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>[</kbd>/<kbd>]</kbd> Section jump</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>U</kbd> URL up</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> URL root</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>O</kbd>/<kbd>I</kbd> Focus back/forward</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>G</kbd> Focus first input</div>
        </div>
        <div class="cs-section">
          <h3>Clipboard</h3>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>Y</kbd> Copy (yank mode)</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>P</kbd> Open from clipboard</div>
        </div>
        <div class="cs-section">
          <h3>Selection</h3>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>V</kbd> Caret/visual mode</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>M</kbd> Set mark</div>
          <div class="cs-row"><kbd>Alt</kbd>+<kbd>'</kbd> Jump to mark</div>
        </div>
        <div class="cs-section">
          <h3>General</h3>
          <div class="cs-row"><kbd>?</kbd> This cheatsheet</div>
          <div class="cs-row"><kbd>Esc</kbd> Clear everything</div>
          <div class="cs-row">Hold <kbd>Alt</kbd> Quick reference</div>
        </div>
      </div>
      <div class="cs-footer">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</div>
    </div>
  `;
}

function getStyles(): string {
  return `
    .cheatsheet {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: auto;
    }
    .cheatsheet.hidden {
      opacity: 0;
      pointer-events: none;
    }
    .cs-card {
      max-width: 700px;
      width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      padding: 24px 32px;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.panel};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel};
    }
    .cs-title {
      font: 600 18px ${UI.font.base};
      color: ${UI.colors.text};
      margin: 0 0 16px;
      text-align: center;
    }
    .cs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .cs-section h3 {
      font: 600 ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.accent};
      margin: 0 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cs-row {
      font: ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.textMuted};
      padding: 3px 0;
      display: flex;
      align-items: center;
      gap: 3px;
      flex-wrap: wrap;
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
    .cs-footer {
      margin-top: 16px;
      text-align: center;
      font: ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textDim};
    }
    .cs-card::-webkit-scrollbar { width: 4px; }
    .cs-card::-webkit-scrollbar-thumb { background: ${UI.colors.border}; border-radius: 2px; }
  `;
}
