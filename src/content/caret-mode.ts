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
let caretEl: HTMLElement | null = null;
let active = false;
let state: CaretState = 'inactive';
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let targetElement: HTMLElement | null = null;
let caretRaf: number | null = null;
let countBuffer = '';

function matchesMotion(e: KeyboardEvent, logicalKey: string, physicalCode: string): boolean {
  if (settings?.usePhysicalKeys) return e.code === physicalCode;
  return e.key === logicalKey || e.key === logicalKey.toUpperCase();
}

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
  countBuffer = '';
  active = false;
  releaseMode('caret');
  state = 'inactive';
  targetElement = null;
  window.getSelection()?.removeAllRanges();
  updateBadge();
  hideCaretIndicator();
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
    caretEl = null;
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

  caretEl = document.createElement('div');
  caretEl.className = 'caret-indicator hidden';
  shadow.appendChild(caretEl);

  document.documentElement.appendChild(host);
}

function consumeCount(): number {
  const n = countBuffer ? Math.min(parseInt(countBuffer, 10), 999) : 1;
  countBuffer = '';
  return n;
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
    countBuffer = '';
    deactivateCaretMode();
    return true;
  }

  // Count prefix: accumulate digits
  if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    countBuffer += e.key;
    return true;
  }
  if (e.key === '0' && countBuffer.length > 0 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    countBuffer += '0';
    return true;
  }

  if (matchesMotion(e, 'y', 'KeyY')) {
    copySelection();
    return true;
  }

  if (matchesMotion(e, 'v', 'KeyV') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (state === 'caret') {
      state = 'visual';
      updateBadge();
      announce('Visual selection mode');
    } else if (state === 'visual') {
      state = 'caret';
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        sel.collapseToEnd();
      }
      updateBadge();
      announce('Caret mode');
    }
    return true;
  }

  if (matchesMotion(e, 'w', 'KeyW')) {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('word', 'forward', state === 'visual');
    updateCaretPosition();
    return true;
  }
  if (matchesMotion(e, 'b', 'KeyB')) {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('word', 'backward', state === 'visual');
    updateCaretPosition();
    return true;
  }

  if (e.key === '0') {
    countBuffer = '';
    moveCaret('lineboundary', 'backward', state === 'visual');
    updateCaretPosition();
    return true;
  }
  if (e.key === '$') {
    countBuffer = '';
    moveCaret('lineboundary', 'forward', state === 'visual');
    updateCaretPosition();
    return true;
  }

  const extend = state === 'visual';

  if (matchesMotion(e, 'h', 'KeyH') || e.key === 'ArrowLeft') {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('character', 'backward', extend);
    updateCaretPosition();
    return true;
  }
  if (matchesMotion(e, 'l', 'KeyL') || e.key === 'ArrowRight') {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('character', 'forward', extend);
    updateCaretPosition();
    return true;
  }
  if (matchesMotion(e, 'k', 'KeyK') || e.key === 'ArrowUp') {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('line', 'backward', extend);
    updateCaretPosition();
    return true;
  }
  if (matchesMotion(e, 'j', 'KeyJ') || e.key === 'ArrowDown') {
    const count = consumeCount();
    for (let i = 0; i < count; i++) moveCaret('line', 'forward', extend);
    updateCaretPosition();
    return true;
  }

  countBuffer = '';
  return true;
}

function activate(): void {
  const sel = window.getSelection();
  if (!sel) return;

  const lastPicked = getLastPickedElement();
  if (lastPicked?.isConnected) {
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
  showCaretIndicator();
  updateCaretPosition();
  announce('Caret mode: h/j/k/l move, v toggles visual, w/b words, y copies');
}

function findElementNearViewportCenter(): HTMLElement {
  const cx = document.documentElement.clientWidth / 2;
  const cy = document.documentElement.clientHeight / 2;
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

function moveCaret(
  granularity: 'character' | 'word' | 'line' | 'lineboundary',
  direction: 'forward' | 'backward',
  extend: boolean,
): void {
  const sel = window.getSelection();
  if (!sel) return;

  sel.modify(extend ? 'extend' : 'move', direction === 'forward' ? 'forward' : 'backward', granularity);
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

// === Visual Caret Indicator ===

function showCaretIndicator(): void {
  if (caretEl) caretEl.classList.remove('hidden');
}

function hideCaretIndicator(): void {
  if (caretEl) caretEl.classList.add('hidden');
  if (caretRaf) {
    cancelAnimationFrame(caretRaf);
    caretRaf = null;
  }
}

function updateCaretPosition(): void {
  if (!caretEl || !active) return;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  const isCollapsed = range.collapsed;

  if (isCollapsed) {
    const rect = getCaretRect(range);
    if (!rect) return;
    caretEl.style.top = `${rect.top}px`;
    caretEl.style.left = `${rect.left}px`;
    caretEl.style.width = '2px';
    caretEl.style.height = `${rect.height || 18}px`;
    caretEl.classList.remove('selection-mode');
  } else {
    const rects = range.getClientRects();
    if (rects.length === 0) return;
    const last = rects[rects.length - 1];
    caretEl.style.top = `${last.top}px`;
    caretEl.style.left = `${last.right}px`;
    caretEl.style.width = '2px';
    caretEl.style.height = `${last.height || 18}px`;
    caretEl.classList.add('selection-mode');
  }

  scrollCaretIntoView();
}

function getCaretRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];

  const span = document.createElement('span');
  span.textContent = '\u200b';
  range.insertNode(span);
  const rect = span.getBoundingClientRect();
  const parent = span.parentNode;
  if (parent) {
    parent.removeChild(span);
    parent.normalize();
  }
  return rect;
}

function scrollCaretIntoView(): void {
  if (!caretEl) return;
  const top = parseFloat(caretEl.style.top);
  const height = parseFloat(caretEl.style.height) || 18;
  const vh = document.documentElement.clientHeight;
  const margin = 60;

  if (top < margin) {
    window.scrollBy(0, top - margin);
  } else if (top + height > vh - margin) {
    window.scrollBy(0, top + height - (vh - margin));
  }
}

// === UI ===

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

    .caret-indicator {
      position: fixed;
      background: ${UI.colors.accent};
      border-radius: 1px;
      pointer-events: none;
      animation: caret-blink 1s step-end infinite;
      box-shadow: 0 0 4px ${UI.colors.accentGlow}, 0 0 8px rgba(100, 80, 255, 0.2);
      transition: top 50ms ease-out, left 50ms ease-out;
    }
    .caret-indicator.hidden {
      opacity: 0;
    }
    .caret-indicator.selection-mode {
      background: ${UI.colors.accent};
      box-shadow: 0 0 6px ${UI.colors.accentGlow}, 0 0 12px rgba(100, 80, 255, 0.3);
    }
    @keyframes caret-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 50ms !important;
      }
    }
  `;
}
