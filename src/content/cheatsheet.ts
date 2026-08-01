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

function key(label: string, cls = ''): string {
  return `<span class="keycap ${cls}">${label}</span>`;
}

function keyWithHint(label: string, hint: string, cls = ''): string {
  return `<span class="key-unit"><span class="keycap ${cls}">${label}</span><span class="key-hint">${hint}</span></span>`;
}

function getContent(): string {
  return `
    <div class="cs-card">
      <div class="cs-header">
        <span class="cs-title">Navigator</span>
        <span class="cs-alt-badge">Alt + key</span>
      </div>

      <div class="cs-layout">

        <!-- Top-left: Navigation -->
        <div class="cs-cluster cluster-nav">
          <span class="cluster-label">Navigation</span>
          <div class="cluster-keys">
            <div class="key-row">
              ${keyWithHint('[', 'Back')}
              ${keyWithHint(']', 'Fwd')}
            </div>
            <div class="key-row">
              ${keyWithHint('U', 'URL up')}
              ${keyWithHint('⇧U', 'Root')}
            </div>
            <div class="key-row">
              ${keyWithHint('G', '1st input')}
            </div>
            <div class="key-row">
              ${keyWithHint('I', '◁ focus')}
              ${keyWithHint('O', 'focus ▷')}
            </div>
          </div>
        </div>

        <!-- Top-right: Pickers -->
        <div class="cs-cluster cluster-pick">
          <span class="cluster-label">Pickers</span>
          <div class="cluster-keys">
            <div class="key-row">
              ${keyWithHint('F', 'Elements')}
              ${keyWithHint('T', 'Tabs')}
            </div>
            <div class="key-row">
              ${keyWithHint('/', 'Search')}
            </div>
            <div class="key-row">
              ${keyWithHint('Space', 'Quick actions', 'wide')}
            </div>
          </div>
        </div>

        <!-- Bottom-left: Scrolling (HJKL inverted-T) -->
        <div class="cs-cluster cluster-scroll">
          <span class="cluster-label">Scroll</span>
          <div class="hjkl-grid">
            <span class="hjkl-spacer"></span>
            <span class="key-unit hjkl-k">
              <span class="keycap">K</span>
              <span class="key-hint">↑</span>
            </span>
            <span class="hjkl-spacer"></span>

            <span class="key-unit hjkl-h">
              <span class="keycap">H</span>
              <span class="key-hint">←</span>
            </span>
            <span class="key-unit hjkl-j">
              <span class="keycap">J</span>
              <span class="key-hint">↓</span>
            </span>
            <span class="key-unit hjkl-l">
              <span class="keycap">L</span>
              <span class="key-hint">→</span>
            </span>
          </div>
          <span class="cluster-sublabel">+ Shift = fast</span>
        </div>

        <!-- Bottom-right: Clipboard & Selection -->
        <div class="cs-cluster cluster-clip">
          <span class="cluster-label">Clipboard & Selection</span>
          <div class="cluster-keys">
            <div class="key-row">
              ${keyWithHint('Y', 'Yank')}
              ${keyWithHint('P', 'Paste URL')}
            </div>
            <div class="key-row">
              ${keyWithHint('V', 'Visual')}
            </div>
            <div class="key-row">
              ${keyWithHint('M', 'Mark')}
              ${keyWithHint("'", 'Jump')}
            </div>
          </div>
        </div>

        <!-- Center-bottom: General -->
        <div class="cs-cluster cluster-general">
          <span class="cluster-label">General</span>
          <div class="cluster-keys cluster-keys-row">
            ${keyWithHint('?', 'Help')}
            ${keyWithHint('Esc', 'Clear', 'med')}
            <span class="key-unit">
              <span class="keycap med">Alt</span>
              <span class="key-hint">⏱ hold</span>
            </span>
          </div>
        </div>

      </div>

      <div class="cs-footer">Press ${key('?')} or ${key('Esc', 'sm')} to close</div>
    </div>
  `;
}

function getStyles(): string {
  return `
    * { box-sizing: border-box; }

    .cheatsheet {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px);
      opacity: 1;
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: auto;
    }
    .cheatsheet.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .cs-card {
      max-width: 720px;
      width: 92vw;
      max-height: 85vh;
      overflow-y: auto;
      padding: 28px 36px 20px;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.panel};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel}, 0 0 60px rgba(100, 80, 255, 0.08);
      transform: scale(1);
      transition: transform ${UI.anim.entryDuration} ${UI.anim.easeSpring};
    }
    .cheatsheet.hidden .cs-card {
      transform: scale(0.96);
    }

    .cs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .cs-title {
      font: 700 16px ${UI.font.base};
      color: ${UI.colors.text};
      letter-spacing: -0.3px;
    }
    .cs-alt-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: ${UI.colors.accentDim};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.pill};
      font: 600 ${UI.font.sizeXs} ${UI.font.mono};
      color: ${UI.colors.accent};
      letter-spacing: 0.3px;
    }

    .cs-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto auto;
      gap: 20px 28px;
    }

    .cs-cluster {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cluster-nav  { grid-column: 1; grid-row: 1; }
    .cluster-pick { grid-column: 2; grid-row: 1; }
    .cluster-scroll { grid-column: 1; grid-row: 2; }
    .cluster-clip { grid-column: 2; grid-row: 2; }
    .cluster-general { grid-column: 1 / -1; grid-row: 3; align-items: center; }

    .cluster-label {
      font: 600 ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .cluster-sublabel {
      font: ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textDim};
      margin-top: -4px;
    }

    .cluster-keys {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cluster-keys-row {
      flex-direction: row;
      align-items: flex-start;
      gap: 14px;
    }

    .key-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .key-unit {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .key-hint {
      font: ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textDim};
      white-space: nowrap;
    }

    /* Keycap styling - the star of the show */
    .keycap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      height: 32px;
      padding: 0 8px;
      background: linear-gradient(180deg, rgba(50, 45, 80, 0.9) 0%, rgba(30, 28, 55, 0.95) 100%);
      border: 1px solid rgba(120, 100, 255, 0.25);
      border-radius: 7px;
      font: 700 ${UI.font.sizeMd} ${UI.font.mono};
      color: ${UI.colors.text};
      line-height: 1;
      box-shadow:
        0 1px 0 1px rgba(0, 0, 0, 0.4),
        0 3px 6px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.07),
        0 0 8px rgba(100, 80, 255, 0.06);
      text-shadow: 0 0 6px rgba(100, 80, 255, 0.3);
      transition: transform 80ms ease, box-shadow 80ms ease;
      user-select: none;
    }
    .keycap.wide {
      min-width: 80px;
      padding: 0 14px;
      font-size: ${UI.font.sizeSm};
      letter-spacing: 0.5px;
    }
    .keycap.med {
      min-width: 44px;
      padding: 0 10px;
      font-size: ${UI.font.sizeSm};
    }
    .keycap.sm {
      min-width: 24px;
      height: 22px;
      padding: 0 5px;
      font-size: ${UI.font.sizeXs};
      border-radius: 5px;
      box-shadow:
        0 1px 0 rgba(0, 0, 0, 0.3),
        0 2px 4px rgba(0, 0, 0, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    /* HJKL inverted-T layout */
    .hjkl-grid {
      display: grid;
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(2, auto);
      gap: 6px;
      justify-items: center;
      align-items: center;
    }
    .hjkl-spacer { width: 44px; }
    .hjkl-k { grid-column: 2; grid-row: 1; }
    .hjkl-h { grid-column: 1; grid-row: 2; }
    .hjkl-j { grid-column: 2; grid-row: 2; }
    .hjkl-l { grid-column: 3; grid-row: 2; }

    .cs-footer {
      margin-top: 20px;
      text-align: center;
      font: ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textDim};
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .cs-footer .keycap {
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      font-size: 9px;
      border-radius: 4px;
      box-shadow:
        0 1px 0 rgba(0, 0, 0, 0.3),
        0 1px 3px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .cs-card::-webkit-scrollbar { width: 4px; }
    .cs-card::-webkit-scrollbar-thumb {
      background: ${UI.colors.border};
      border-radius: 2px;
    }
  `;
}
