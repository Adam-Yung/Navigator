import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { transitionTo } from './aura-ring';
import { jumpCaretToElement } from './caret-mode';
import { pushFocus } from './focus-history';
import { revealElement } from './hover-manager';
import { registerKeyHandler } from './key-handler';
import { releaseMode, requestMode } from './mode-manager';
import { queryDeepAll, scanVisibleElements } from './mutation-observer';
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
let clearHighlights: (() => void)[] = [];
let lastQuery = '';
let selectCallback: ((el: HTMLElement) => void) | null = null;
let useRegex = false;

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
  selectCallback = null;
  releaseMode('search');
  removeAllHighlights();
  if (query.length > 0) lastQuery = query;
  query = '';
  matches = [];
  selectedIndex = 0;
  if (panel) {
    const countEl = panel.querySelector('.search-count');
    if (countEl) countEl.textContent = '';
    if (inputEl) inputEl.textContent = '';
    const scopeEl = panel.querySelector('.search-scope');
    if (scopeEl) scopeEl.textContent = '';
    panel.classList.add('hidden');
  }
}

export function activateSearchWithCallback(cb: (el: HTMLElement) => void): void {
  selectCallback = cb;
  activate();
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
    <span class="search-scope"></span>
    <span class="search-input"></span>
    <span class="search-cursor">|</span>
    <span class="search-count"></span>
    <span class="search-hint">Tab/arrows navigate \u00b7 @link: @btn: @input: filter</span>
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
      const cb = selectCallback;
      deactivateElementSearch();
      if (cb) {
        cb(target.el);
      } else {
        pushFocus(target.el);
        activateSearchTarget(target.el);
      }
    }
    return true;
  }

  if (e.altKey && e.code === 'KeyV' && matches.length > 0) {
    const target = matches[selectedIndex].el;
    deactivateElementSearch();
    jumpCaretToElement(target);
    return true;
  }

  if (e.altKey && e.code === 'KeyR') {
    useRegex = !useRegex;
    updateRegexIndicator();
    search();
    return true;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
    if (matches.length > 0) {
      selectedIndex = (selectedIndex + 1) % matches.length;
      highlightCurrent();
    }
    return true;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    if (matches.length > 0) {
      selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
      highlightCurrent();
    }
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
  query = lastQuery;
  matches = [];
  selectedIndex = 0;
  if (panel) panel.classList.remove('hidden');
  updateInput();
  if (query.length > 0) {
    search();
  }
}

// === Search Logic ===

interface ScopeFilter {
  prefix: string;
  selector: (el: HTMLElement) => boolean;
}

const SCOPE_FILTERS: ScopeFilter[] = [
  { prefix: '@link:', selector: (el) => el.tagName === 'A' || el.getAttribute('role') === 'link' },
  {
    prefix: '@btn:',
    selector: (el) =>
      el.tagName === 'BUTTON' ||
      el.getAttribute('role') === 'button' ||
      (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((el as HTMLInputElement).type)),
  },
  {
    prefix: '@input:',
    selector: (el) =>
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      el.getAttribute('role') === 'textbox',
  },
];

function parseScope(raw: string): { scope: ScopeFilter | null; text: string } {
  const lower = raw.toLowerCase();
  for (const sf of SCOPE_FILTERS) {
    if (lower.startsWith(sf.prefix)) {
      return { scope: sf, text: raw.slice(sf.prefix.length) };
    }
  }
  return { scope: null, text: raw };
}

function search(): void {
  updateInput();
  removeAllHighlights();

  if (query.length === 0) {
    matches = [];
    updateCount();
    updateScopeIndicator(null);
    return;
  }

  const { scope, text } = parseScope(query);
  updateScopeIndicator(scope);

  const elements = scanVisibleElements();
  let filtered = elements;

  if (scope) {
    filtered = filtered.filter((el) => scope.selector(el.el));
  } else {
    const textSelector = 'p, h1, h2, h3, h4, h5, h6, li, td, th, label, span';
    const deepTextEls = queryDeepAll(textSelector, 200);
    const existingSet = new Set(filtered.map((e) => e.el));
    for (const el of deepTextEls) {
      if (existingSet.has(el)) continue;
      if (!el.textContent?.trim()) continue;
      const rect = el.getBoundingClientRect();
      filtered.push({ el, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, rect });
    }
  }

  if (text.length === 0) {
    matches = filtered;
  } else if (useRegex) {
    let re: RegExp;
    try {
      re = new RegExp(text, 'i');
    } catch {
      matches = [];
      selectedIndex = 0;
      updateCount();
      return;
    }
    matches = filtered.filter((el) => re.test(getVisibleText(el.el)));
    if (matches.length < 3) {
      const metaExtra = filtered.filter(
        (el) => !matches.includes(el) && re.test(getMetadataText(el.el)),
      );
      matches.push(...metaExtra);
    }
  } else {
    const q = text.toLowerCase();
    matches = filtered.filter((el) => fuzzyScore(getVisibleText(el.el), q) > 0);
    if (matches.length < 3) {
      const metaExtra = filtered.filter(
        (el) => !matches.includes(el) && fuzzyScore(getMetadataText(el.el), q) > 0,
      );
      matches.push(...metaExtra);
    }
    matches.sort((a, b) => {
      const sa = fuzzyScore(getVisibleText(a.el), q) || fuzzyScore(getMetadataText(a.el), q) * 0.5;
      const sb = fuzzyScore(getVisibleText(b.el), q) || fuzzyScore(getMetadataText(b.el), q) * 0.5;
      return sb - sa;
    });
  }

  matches = matches.filter((m) => {
    const vis = getVisibleText(m.el);
    if (vis.length > 0) return true;
    if (m.el.tagName === 'INPUT' && (m.el as HTMLInputElement).placeholder) return true;
    return false;
  });

  selectedIndex = 0;
  updateCount();
  highlightAllMatches();
  highlightCurrent();
}

function getVisibleText(el: HTMLElement): string {
  return el.innerText?.trim() || el.textContent?.trim() || '';
}

function getMetadataText(el: HTMLElement): string {
  const parts: string[] = [];
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);
  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) parts.push(placeholder);
  const title = el.getAttribute('title');
  if (title) parts.push(title);
  return parts.join(' ');
}

function fuzzyScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();

  const exactIdx = lower.indexOf(q);
  if (exactIdx !== -1) {
    const atStart = exactIdx === 0 ? 20 : 0;
    const atWordBoundary = exactIdx > 0 && /\s/.test(lower[exactIdx - 1]) ? 10 : 0;
    return 100 + atStart + atWordBoundary;
  }

  let qi = 0;
  let consecutiveBonus = 0;
  let totalScore = 0;
  let lastMatchIdx = -2;

  for (let ti = 0; ti < lower.length && qi < q.length; ti++) {
    if (lower[ti] === q[qi]) {
      const consecutive = ti === lastMatchIdx + 1;
      consecutiveBonus = consecutive ? consecutiveBonus + 5 : 0;
      totalScore += 10 + consecutiveBonus;
      if (ti === 0 || /[\s_\-./]/.test(lower[ti - 1])) totalScore += 8;
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return 0;
  const coverage = q.length / Math.max(lower.length, 1);
  if (coverage < 0.02) return 0;
  return totalScore * (0.5 + coverage * 0.5);
}

// === Highlighting ===

function highlightAllMatches(): void {
  removeAllHighlights();
  const { text } = parseScope(query);
  if (text.length < 2) return;

  const maxHighlights = 20;
  let highlighted = 0;
  for (let i = 0; i < matches.length; i++) {
    if (i === selectedIndex) continue;
    if (highlighted >= maxHighlights) break;
    const cleanup = highlightMatchInElement(matches[i].el, text, false);
    if (cleanup) {
      clearHighlights.push(cleanup);
      highlighted++;
    }
  }
}

function highlightCurrent(): void {
  // Remove only the active highlight marker class, re-add for current
  removeActiveHighlight();
  if (matches.length > 0 && matches[selectedIndex]) {
    const target = matches[selectedIndex];
    const rect = target.el.getBoundingClientRect();
    const vh = document.documentElement.clientHeight;
    if (rect.bottom < 0 || rect.top > vh) {
      target.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    transitionTo(target);
    revealElement(target.el);
    const { text } = parseScope(query);
    const cleanup = highlightMatchInElement(target.el, text, true);
    if (cleanup) clearHighlights.push(cleanup);
  }
  updateCount();
}

function removeActiveHighlight(): void {
  // Remove highlights on the previously active element and re-highlight as inactive
  // Simplification: remove all and re-highlight
  removeAllHighlights();
  highlightAllMatches();
}

function removeAllHighlights(): void {
  for (const fn of clearHighlights) {
    fn();
  }
  clearHighlights = [];
}

function highlightMatchInElement(el: HTMLElement, q: string, isActive: boolean): (() => void) | null {
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
    mark.setAttribute('data-navigator-search', isActive ? 'active' : 'dim');
    mark.style.cssText = isActive
      ? 'background: rgba(100, 80, 255, 0.4); color: inherit; border-radius: 2px; padding: 0 1px; outline: 1px solid rgba(100, 80, 255, 0.6);'
      : 'background: rgba(100, 80, 255, 0.15); color: inherit; border-radius: 2px; padding: 0 1px;';
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

// === Target Activation ===

function activateSearchTarget(el: HTMLElement): void {
  if (el.tagName === 'A' && (el as HTMLAnchorElement).href) {
    el.click();
  } else if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
    el.click();
  } else if (
    el.tagName === 'INPUT' &&
    ['checkbox', 'radio', 'button', 'submit', 'reset'].includes((el as HTMLInputElement).type)
  ) {
    el.click();
  } else {
    el.focus();
  }
}

// === UI Updates ===

function updateInput(): void {
  if (!inputEl) return;
  const { scope, text } = parseScope(query);
  if (scope) {
    inputEl.textContent = text;
  } else {
    inputEl.textContent = query;
  }
}

function updateScopeIndicator(scope: ScopeFilter | null): void {
  if (!panel) return;
  const scopeEl = panel.querySelector('.search-scope');
  if (scopeEl) {
    scopeEl.textContent = scope ? scope.prefix : '';
  }
}

function updateRegexIndicator(): void {
  if (!panel) return;
  let indicator = panel.querySelector('.search-regex');
  if (useRegex) {
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'search-regex';
      const hintEl = panel.querySelector('.search-hint');
      if (hintEl) panel.insertBefore(indicator, hintEl);
      else panel.appendChild(indicator);
    }
    indicator.textContent = '[.*]';
  } else if (indicator) {
    indicator.textContent = '';
  }
}

function updateCount(): void {
  if (!panel) return;
  const countEl = panel.querySelector('.search-count');
  if (countEl) {
    const { text } = parseScope(query);
    countEl.textContent =
      matches.length > 0 ? `${selectedIndex + 1}/${matches.length}` : text.length > 0 ? 'No matches' : '';
  }
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
    .search-scope {
      color: ${UI.colors.accent};
      font: 600 13px ${UI.font.mono};
      opacity: 0.9;
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
    .search-regex {
      color: ${UI.colors.accent};
      font: bold ${UI.font.sizeXs} ${UI.font.mono};
      margin-left: 6px;
      opacity: 0.9;
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

    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 50ms !important;
      }
    }
  `;
}
