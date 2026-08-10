import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { getLastPickedElement } from './hint-mode';
import { announce, showToast } from './indicator';
import { registerKeyHandler } from './key-handler';
import { releaseMode, requestMode } from './mode-manager';
import { UI } from './ui-tokens';

type CaretState = 'inactive' | 'caret' | 'visual';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let badge: HTMLElement | null = null;
let active = false;
let state: CaretState = 'inactive';
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let targetElement: HTMLElement | null = null;

export function initCaretMode(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateCaretModeSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function deactivateCaretMode(): void {
  if (!active) return;
  active = false;
  releaseMode('caret');
  state = 'inactive';
  targetElement = null;
  window.getSelection()?.removeAllRanges();
  updateBadge();
}

export function isCaretModeActive(): boolean {
  return active;
}

export function destroyCaretMode(): void {
  deactivateCaretMode();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    badge = null;
  }
  if (unregisterKey) unregisterKey();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-caret-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-caret-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.indicator};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  badge = document.createElement('div');
  badge.className = 'caret-badge hidden';
  shadow.appendChild(badge);

  document.documentElement.appendChild(host);
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.caretMode) {
      activate();
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    deactivateCaretMode();
    return true;
  }

  if (e.key === 'y' || e.key === 'Y') {
    copySelection();
    return true;
  }

  const extend = e.shiftKey;

  if (e.key === 'h' || e.key === 'H') {
    moveCaret('character', 'backward', extend);
    return true;
  }
  if (e.key === 'l' || e.key === 'L') {
    moveCaret('character', 'forward', extend);
    return true;
  }
  if (e.key === 'k' || e.key === 'K') {
    moveCaret('line', 'backward', extend);
    return true;
  }
  if (e.key === 'j' || e.key === 'J') {
    moveCaret('line', 'forward', extend);
    return true;
  }

  return true;
}

function activate(): void {
  const sel = window.getSelection();
  if (!sel) return;

  const lastPicked = getLastPickedElement();
  if (lastPicked && lastPicked.isConnected) {
    targetElement = lastPicked;
  } else {
    targetElement = findElementNearViewportCenter();
  }

  sel.removeAllRanges();

  const textNode = findFirstTextNode(targetElement);
  if (textNode) {
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    sel.addRange(range);
  } else {
    const range = document.createRange();
    range.selectNodeContents(targetElement);
    range.collapse(true);
    sel.addRange(range);
  }

  requestMode('caret', deactivateCaretMode);
  active = true;
  state = 'caret';
  updateBadge();
  announce('Caret mode active');
}

function findElementNearViewportCenter(): HTMLElement {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const candidates = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, span, a, div');
  let best: HTMLElement = document.documentElement;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (!el.textContent?.trim()) continue;
    const ex = rect.left + rect.width / 2;
    const ey = rect.top + rect.height / 2;
    const dist = Math.hypot(ex - cx, ey - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = el as HTMLElement;
    }
  }
  return best;
}

function moveCaret(granularity: 'character' | 'line', direction: 'forward' | 'backward', extend: boolean): void {
  const sel = window.getSelection();
  if (!sel) return;

  if (extend && state === 'caret') {
    state = 'visual';
    updateBadge();
  }

  sel.modify(
    extend ? 'extend' : 'move',
    direction === 'forward' ? 'forward' : 'backward',
    granularity === 'line' ? 'line' : 'character',
  );
}

async function copySelection(): Promise<void> {
  const sel = window.getSelection();
  const text = sel?.toString() || '';
  if (!text) {
    showToast('No selection', 1500, 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied', 1500, 'success');
  } catch {
    showToast('Copy failed', 1500, 'error');
  }
  deactivateCaretMode();
}

function findFirstTextNode(el: Node): Text | null {
  if (el.nodeType === Node.TEXT_NODE && el.textContent?.trim()) {
    return el as Text;
  }
  for (const child of el.childNodes) {
    const found = findFirstTextNode(child);
    if (found) return found;
  }
  return null;
}

function updateBadge(): void {
  if (!badge) return;
  if (state === 'inactive') {
    badge.className = 'caret-badge hidden';
    badge.textContent = '';
  } else {
    badge.textContent = state === 'caret' ? 'CARET' : 'VISUAL';
    badge.className = `caret-badge visible ${state}`;
  }
}

function getStyles(): string {
  return `
    .caret-badge {
      position: fixed;
      bottom: 16px;
      right: 16px;
      padding: 6px 14px;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.pill};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.subtle};
      font: bold ${UI.font.sizeXs} ${UI.font.mono};
      letter-spacing: 1px;
      color: ${UI.colors.text};
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                  transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: none;
    }
    .caret-badge.hidden {
      opacity: 0;
      transform: scale(0.9);
    }
    .caret-badge.visible {
      opacity: 1;
      transform: scale(1);
    }
    .caret-badge.visual {
      border-color: ${UI.colors.accentGlow};
      color: ${UI.colors.accent};
    }
  `;
}
