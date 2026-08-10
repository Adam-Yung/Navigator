import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { escapeHtml } from '../shared/utils';
import { showToast } from './indicator';
import { registerKeyHandler } from './key-handler';
import { releaseMode, requestMode } from './mode-manager';
import { UI } from './ui-tokens';

interface Action {
  id: string;
  label: string;
  description: string;
  execute: () => void;
}

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let panel: HTMLElement | null = null;
let inputEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let active = false;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let query = '';
let filteredActions: Action[] = [];
let selectedIndex = 0;

export function initQuickActions(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateQuickActionsSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function deactivateQuickActions(): void {
  if (!active) return;
  active = false;
  releaseMode('actions');
  query = '';
  filteredActions = [];
  selectedIndex = 0;
  if (panel) panel.classList.add('hidden');
}

export function isQuickActionsActive(): boolean {
  return active;
}

export function destroyQuickActions(): void {
  deactivateQuickActions();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    panel = null;
    inputEl = null;
    listEl = null;
  }
  if (unregisterKey) unregisterKey();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-quickactions-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-quickactions-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.panel};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  panel = document.createElement('div');
  panel.className = 'qa-panel hidden';
  panel.innerHTML = `
    <div class="qa-input-row">
      <span class="qa-icon">⌘</span>
      <span class="qa-input"></span>
      <span class="qa-cursor">|</span>
    </div>
    <div class="qa-list"></div>
  `;
  shadow.appendChild(panel);

  inputEl = panel.querySelector('.qa-input')!;
  listEl = panel.querySelector('.qa-list')!;
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Quick actions');
  document.documentElement.appendChild(host);
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.quickActions) {
      activate();
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    deactivateQuickActions();
    return true;
  }

  if (e.key === 'Enter') {
    executeSelected();
    return true;
  }

  if (e.key === 'ArrowDown' || (e.key === 'j' && e.ctrlKey)) {
    selectedIndex = (selectedIndex + 1) % Math.max(filteredActions.length, 1);
    renderList();
    const selectedItem = listEl?.querySelector('.qa-item.selected');
    if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
    return true;
  }

  if (e.key === 'ArrowUp' || (e.key === 'k' && e.ctrlKey)) {
    selectedIndex = (selectedIndex - 1 + Math.max(filteredActions.length, 1)) % Math.max(filteredActions.length, 1);
    renderList();
    const selectedItem = listEl?.querySelector('.qa-item.selected');
    if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
    return true;
  }

  if (e.key === 'Backspace') {
    if (query.length > 0) {
      query = query.slice(0, -1);
      filterActions();
    }
    return true;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (/^[1-9]$/.test(e.key) && query.length === 0) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < filteredActions.length) {
        selectedIndex = idx;
        executeSelected();
        return true;
      }
    }
    query += e.key;
    filterActions();
    return true;
  }

  return true;
}

function activate(): void {
  requestMode('actions', deactivateQuickActions);
  active = true;
  query = '';
  selectedIndex = 0;
  filteredActions = getActions();
  if (panel) panel.classList.remove('hidden');
  updateInput();
  renderList();
}

function executeSelected(): void {
  if (filteredActions.length > 0 && filteredActions[selectedIndex]) {
    const action = filteredActions[selectedIndex];
    deactivateQuickActions();
    action.execute();
  }
}

function filterActions(): void {
  const all = getActions();
  if (query.length === 0) {
    filteredActions = all;
  } else {
    filteredActions = all.filter((a) => fuzzyMatch(query, a.label));
  }
  selectedIndex = 0;
  updateInput();
  renderList();
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  const lower = haystack.toLowerCase();
  const q = needle.toLowerCase();
  let j = 0;
  for (let i = 0; i < lower.length && j < q.length; i++) {
    if (lower[i] === q[j]) j++;
  }
  return j === q.length;
}

function updateInput(): void {
  if (inputEl) inputEl.textContent = query;
}

function renderList(): void {
  if (!listEl) return;
  listEl.innerHTML = '';
  const toShow = filteredActions.slice(0, 12);
  if (toShow.length === 0) {
    listEl.innerHTML = '<div class="qa-empty">No matching actions</div>';
    return;
  }
  toShow.forEach((action, i) => {
    const item = document.createElement('div');
    item.className = `qa-item ${i === selectedIndex ? 'selected' : ''}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', `${i === selectedIndex}`);
    const numBadge = i < 9 ? `<span class="qa-num">${i + 1}</span>` : '';
    item.innerHTML = `${numBadge}<span class="qa-label">${escapeHtml(action.label)}</span><span class="qa-desc">${escapeHtml(action.description)}</span>`;
    listEl?.appendChild(item);
  });
}

function getActions(): Action[] {
  return [
    {
      id: 'copy-url',
      label: 'Copy URL',
      description: 'Copy page URL to clipboard',
      execute: () => copyText(window.location.href, 'URL copied'),
    },
    {
      id: 'copy-title',
      label: 'Copy Title',
      description: 'Copy page title',
      execute: () => copyText(document.title, 'Title copied'),
    },
    {
      id: 'copy-link',
      label: 'Copy Link at Ring',
      description: 'Copy focused link href',
      execute: () => {
        const el = document.activeElement;
        if (el?.tagName === 'A') {
          copyText((el as HTMLAnchorElement).href, 'Link copied');
        } else {
          showToast('No link focused', 1500, 'error');
        }
      },
    },
    {
      id: 'go-up',
      label: 'Go Up',
      description: 'Navigate one path segment up',
      execute: () => {
        const url = new URL(window.location.href);
        const parts = url.pathname.replace(/\/$/, '').split('/');
        if (parts.length > 1) {
          parts.pop();
          url.pathname = parts.join('/') || '/';
          window.location.href = url.href;
        } else {
          showToast('Already at root', 1500, 'info');
        }
      },
    },
    {
      id: 'go-root',
      label: 'Go Root',
      description: 'Navigate to site root',
      execute: () => {
        const url = new URL(window.location.href);
        url.pathname = '/';
        url.search = '';
        window.location.href = url.href;
      },
    },
    {
      id: 'toggle-extension',
      label: 'Toggle Extension',
      description: 'Enable/disable Navigator',
      execute: () => {
        document.dispatchEvent(new CustomEvent('navigator-toggle'));
      },
    },
    {
      id: 'open-clipboard',
      label: 'Open Clipboard',
      description: 'Navigate to URL from clipboard',
      execute: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text && /^https?:\/\/.+/.test(text.trim())) {
            window.location.href = text.trim();
          } else {
            showToast('No URL in clipboard', 1500, 'error');
          }
        } catch {
          showToast('Cannot read clipboard', 1500, 'error');
        }
      },
    },
    {
      id: 'scroll-top',
      label: 'Scroll to Top',
      description: 'Jump to page top',
      execute: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
      id: 'scroll-bottom',
      label: 'Scroll to Bottom',
      description: 'Jump to page bottom',
      execute: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
    },
    {
      id: 'reload',
      label: 'Reload Page',
      description: 'Refresh the current page',
      execute: () => window.location.reload(),
    },
    {
      id: 'history-back',
      label: 'Go Back',
      description: 'Navigate back in history',
      execute: () => history.back(),
    },
    {
      id: 'history-forward',
      label: 'Go Forward',
      description: 'Navigate forward in history',
      execute: () => history.forward(),
    },
  ];
}

async function copyText(text: string, msg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(msg, 1500, 'success');
  } catch {
    showToast('Copy failed', 1500, 'error');
  }
}

function getStyles(): string {
  return `
    .qa-panel {
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%) scale(1);
      width: 420px;
      max-width: 90vw;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.panel};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel};
      overflow: hidden;
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                  transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: auto;
    }
    .qa-panel.hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.95);
      pointer-events: none;
    }
    .qa-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 18px;
      border-bottom: 1px solid ${UI.colors.border};
    }
    .qa-icon {
      color: ${UI.colors.accent};
      font-size: 16px;
    }
    .qa-input {
      color: ${UI.colors.text};
      font: 14px ${UI.font.mono};
      flex: 1;
    }
    .qa-cursor {
      color: ${UI.colors.accent};
      animation: blink 1s step-end infinite;
    }
    .qa-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
    }
    .qa-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: ${UI.radius.item};
      cursor: default;
      transition: background 80ms ease;
    }
    .qa-item.selected {
      background: ${UI.colors.accentDim};
    }
    .qa-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: ${UI.colors.accentDim};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.badge};
      font: bold ${UI.font.sizeXs} ${UI.font.mono};
      color: ${UI.colors.textMuted};
      flex-shrink: 0;
    }
    .qa-label {
      color: ${UI.colors.text};
      font: ${UI.font.sizeMd} ${UI.font.base};
      flex-shrink: 0;
    }
    .qa-desc {
      color: ${UI.colors.textMuted};
      font: ${UI.font.sizeSm} ${UI.font.base};
      margin-left: auto;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qa-empty {
      padding: 20px 12px;
      text-align: center;
      font: ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.textMuted};
    }
    .qa-list::-webkit-scrollbar {
      width: 4px;
    }
    .qa-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .qa-list::-webkit-scrollbar-thumb {
      background: ${UI.colors.border};
      border-radius: 2px;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
}
