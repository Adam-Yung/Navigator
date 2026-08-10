import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { transitionTo } from './aura-ring';
import { pushFocus } from './focus-history';
import { revealElement } from './hover-manager';
import { registerKeyHandler } from './key-handler';
import { releaseMode, requestMode } from './mode-manager';
import { scanVisibleElements } from './mutation-observer';
import { UI } from './ui-tokens';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let panel: HTMLElement | null = null;
let inputEl: HTMLElement | null = null;
let active = false;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let query = '';
let matches: IndexedElement[] = [];
let selectedIndex = 0;
let clearHighlight: (() => void) | null = null;

export function initElementSearch(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateElementSearchSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function deactivateElementSearch(): void {
  if (!active) return;
  active = false;
  releaseMode('search');
  if (clearHighlight) {
    clearHighlight();
    clearHighlight = null;
  }
  query = '';
  matches = [];
  selectedIndex = 0;
  if (panel) {
    const countEl = panel.querySelector('.search-count');
    if (countEl) countEl.textContent = '';
    if (inputEl) inputEl.textContent = '';
    panel.classList.add('hidden');
  }
}

export function isElementSearchActive(): boolean {
  return active;
}

export function destroyElementSearch(): void {
  deactivateElementSearch();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    panel = null;
  }
  if (unregisterKey) unregisterKey();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-search-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-search-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.panel};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  panel = document.createElement('div');
  panel.className = 'search-panel hidden';
  panel.innerHTML = `
    <div class="search-icon">/</div>
    <span class="search-input"></span>
    <span class="search-cursor">|</span>
    <span class="search-count"></span>
    <span class="search-hint">Tab/arrows to navigate</span>
  `;
  shadow.appendChild(panel);

  inputEl = panel.querySelector('.search-input')!;
  document.documentElement.appendChild(host);
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.search) {
      activate();
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    deactivateElementSearch();
    return true;
  }

  if (e.key === 'Enter') {
    if (matches.length > 0) {
      const target = matches[selectedIndex];
      deactivateElementSearch();
      pushFocus(target.el);
      target.el.focus();
    }
    return true;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
    selectedIndex = (selectedIndex + 1) % Math.max(matches.length, 1);
    highlightCurrent();
    return true;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    selectedIndex = (selectedIndex - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1);
    highlightCurrent();
    return true;
  }

  if (e.key === 'Backspace') {
    if (query.length > 0) {
      query = query.slice(0, -1);
      search();
    }
    return true;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    query += e.key;
    search();
    return true;
  }

  return true;
}

function activate(): void {
  requestMode('search', deactivateElementSearch);
  active = true;
  query = '';
  matches = [];
  selectedIndex = 0;
  if (panel) panel.classList.remove('hidden');
  updateInput();
}

function search(): void {
  updateInput();
  if (query.length === 0) {
    matches = [];
    updateCount();
    return;
  }

  const elements = scanVisibleElements();
  const q = query.toLowerCase();
  matches = elements.filter((el) => {
    const text = el.el.textContent?.toLowerCase() || '';
    const ariaLabel = el.el.getAttribute('aria-label')?.toLowerCase() || '';
    const placeholder = (el.el as HTMLInputElement).placeholder?.toLowerCase() || '';
    return text.includes(q) || ariaLabel.includes(q) || placeholder.includes(q);
  });

  selectedIndex = 0;
  updateCount();
  highlightCurrent();
}

function highlightCurrent(): void {
  if (clearHighlight) {
    clearHighlight();
    clearHighlight = null;
  }
  if (matches.length > 0 && matches[selectedIndex]) {
    const target = matches[selectedIndex];
    transitionTo(target);
    revealElement(target.el);
    clearHighlight = highlightMatchInElement(target.el, query);
  }
  updateCount();
}

function updateInput(): void {
  if (inputEl) inputEl.textContent = query;
}

function updateCount(): void {
  if (!panel) return;
  const countEl = panel.querySelector('.search-count');
  if (countEl) {
    countEl.textContent =
      matches.length > 0 ? `${selectedIndex + 1}/${matches.length}` : query.length > 0 ? 'No matches' : '';
  }
}

function highlightMatchInElement(el: HTMLElement, q: string): (() => void) | null {
  if (!q || q.length < 2) return null;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lowerQuery = q.toLowerCase();
  let node = walker.nextNode() as Text | null;

  while (node) {
    const idx = node.textContent?.toLowerCase().indexOf(lowerQuery) ?? -1;
    if (idx === -1) {
      node = walker.nextNode() as Text | null;
      continue;
    }

    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + q.length);

    const mark = document.createElement('mark');
    mark.style.cssText = 'background: rgba(100, 80, 255, 0.3); color: inherit; border-radius: 2px; padding: 0 1px;';
    range.surroundContents(mark);

    return () => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    };
  }
  return null;
}

function getStyles(): string {
  return `
    .search-panel {
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%) scale(1);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.item};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel};
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                  transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: auto;
    }
    .search-panel.hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.95);
      pointer-events: none;
    }
    .search-icon {
      color: ${UI.colors.accent};
      font: bold 16px ${UI.font.mono};
    }
    .search-input {
      color: ${UI.colors.text};
      font: 14px ${UI.font.mono};
      letter-spacing: 0.5px;
    }
    .search-cursor {
      color: ${UI.colors.accent};
      animation: blink 1s step-end infinite;
    }
    .search-count {
      color: ${UI.colors.textMuted};
      font: ${UI.font.sizeSm} ${UI.font.base};
      margin-left: 8px;
    }
    .search-hint {
      color: ${UI.colors.textDim};
      font: ${UI.font.sizeXs} ${UI.font.base};
      margin-left: 8px;
      opacity: 0.7;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
}
