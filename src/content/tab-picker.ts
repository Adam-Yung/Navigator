import { getAPI } from '../shared/browser-api';
import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { escapeHtml } from '../shared/utils';
import { announce } from './indicator';
import { registerKeyHandler } from './key-handler';
import { releaseMode, requestMode } from './mode-manager';
import { UI } from './ui-tokens';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  favIconUrl?: string;
}

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let panel: HTMLElement | null = null;
let inputEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let active = false;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let allTabs: TabInfo[] = [];
let filteredTabs: TabInfo[] = [];
let selectedIndex = 0;
let typedFilter = '';

export function initTabPicker(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKeydown);
}

export function updateTabPickerSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function destroyTabPicker(): void {
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    panel = null;
  }
  if (unregisterKey) unregisterKey();
}

export function isTabPickerActive(): boolean {
  return active;
}

export function deactivateTabPicker(): void {
  closePicker();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-tab-picker-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-tab-picker-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  panel = document.createElement('div');
  panel.className = 'tab-panel hidden';
  panel.innerHTML = `
    <div class="tab-header">
      <span class="tab-title">Switch Tab</span>
      <span class="tab-hint">Type to filter</span>
    </div>
    <div class="tab-input-wrap">
      <span class="tab-input-text"></span>
    </div>
    <div class="tab-list" role="listbox"></div>
    <div class="tab-footer">Enter to switch \u2022 d to close tab \u2022 Esc to cancel</div>
  `;
  shadow.appendChild(panel);

  inputEl = panel.querySelector('.tab-input-text')!;
  listEl = panel.querySelector('.tab-list')!;

  document.documentElement.appendChild(host);
}

function handleKeydown(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.tabPicker) {
      openPicker();
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    closePicker();
    return true;
  }

  if (e.key === 'Enter') {
    if (filteredTabs.length > 0) {
      const tab = filteredTabs[selectedIndex];
      closePicker();
      if (e.shiftKey) {
        openInNewWindow(tab.id);
      } else {
        switchToTab(tab.id);
      }
    }
    return true;
  }

  if (e.key === 'ArrowDown' || (e.key === 'j' && e.ctrlKey)) {
    selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
    renderList();
    const selectedDown = listEl?.querySelector('.tab-item.selected');
    if (selectedDown) selectedDown.scrollIntoView({ block: 'nearest' });
    return true;
  }

  if (e.key === 'ArrowUp' || (e.key === 'k' && e.ctrlKey)) {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderList();
    const selectedUp = listEl?.querySelector('.tab-item.selected');
    if (selectedUp) selectedUp.scrollIntoView({ block: 'nearest' });
    return true;
  }

  if (e.key === 'd' || ((e.key === 'Delete' || e.key === 'Backspace') && typedFilter === '')) {
    if (filteredTabs.length > 0) {
      const tab = filteredTabs[selectedIndex];
      if (tab && !tab.active) {
        const api = getAPI();
        api?.runtime?.sendMessage?.({ type: 'close-tab', tabId: tab.id });
        allTabs = allTabs.filter((t) => t.id !== tab.id);
        filteredTabs = filteredTabs.filter((t) => t.id !== tab.id);
        if (selectedIndex >= filteredTabs.length) selectedIndex = Math.max(0, filteredTabs.length - 1);
        renderList();
        showClosedIndicator();
      }
    }
    return true;
  }

  if (e.key === 'Backspace') {
    if (typedFilter.length > 0) {
      typedFilter = typedFilter.slice(0, -1);
      applyFilter();
    }
    return true;
  }

  // Number shortcuts 1-9, 0 (only when no filter text typed)
  if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(e.key) && typedFilter === '') {
    const num = e.key === '0' ? 10 : parseInt(e.key, 10);
    const idx = num - 1;
    if (idx < filteredTabs.length) {
      const tab = filteredTabs[idx];
      closePicker();
      switchToTab(tab.id);
    }
    return true;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    typedFilter += e.key.toLowerCase();
    applyFilter();
    return true;
  }

  return true;
}

async function openPicker(): Promise<void> {
  const api = getAPI();
  if (!api?.runtime?.sendMessage) return;

  requestMode('tabs', closePicker);
  announce('Tab picker open');
  active = true;
  typedFilter = '';
  selectedIndex = 0;

  if (panel) {
    panel.classList.remove('hidden');
    panel.style.pointerEvents = 'auto';
  }
  if (host) host.style.pointerEvents = 'auto';
  if (listEl) listEl.innerHTML = '<div class="tab-loading">Loading tabs...</div>';
  updateInput();

  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    const response = await Promise.race([api.runtime.sendMessage({ type: 'get-tabs' }), timeout]);
    allTabs = (response?.tabs || []).map((t: any) => ({
      id: t.id,
      title: t.title || '',
      url: t.url || '',
      active: t.active || false,
      pinned: t.pinned || false,
      audible: t.audible || false,
      favIconUrl: t.favIconUrl,
    }));
  } catch {
    allTabs = [];
    if (listEl) listEl.innerHTML = '<div class="tab-empty">Failed to load tabs</div>';
    setTimeout(() => closePicker(), 1500);
    return;
  }

  filteredTabs = [...allTabs];
  renderList();
}

function closePicker(): void {
  active = false;
  releaseMode('tabs');
  typedFilter = '';
  allTabs = [];
  filteredTabs = [];
  if (panel) {
    panel.classList.add('hidden');
    panel.style.pointerEvents = 'none';
  }
  if (host) host.style.pointerEvents = 'none';
}

function applyFilter(): void {
  if (typedFilter === '') {
    filteredTabs = [...allTabs];
  } else {
    const q = typedFilter.toLowerCase();
    filteredTabs = allTabs.filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
  }
  selectedIndex = 0;
  renderList();
  updateInput();
}

function renderList(): void {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (filteredTabs.length === 0) {
    listEl.innerHTML = '<div class="tab-empty">No matching tabs</div>';
    return;
  }

  const visible = filteredTabs.slice(0, 20);
  for (let i = 0; i < visible.length; i++) {
    const tab = visible[i];
    const item = document.createElement('div');
    item.className = `tab-item${i === selectedIndex ? ' selected' : ''}${tab.active ? ' active-tab' : ''}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === selectedIndex));

    const num = i < 10 ? (i < 9 ? String(i + 1) : '0') : '';
    const pinIcon = tab.pinned ? '<span class="pin-icon">\uD83D\uDCCC</span>' : '';
    const audioIcon = tab.audible ? '<span class="audio-icon">\uD83D\uDD0A</span>' : '';
    const domain = getDomain(tab.url);

    const faviconHtml = tab.favIconUrl
      ? `<img class="tab-favicon" src="${escapeHtml(tab.favIconUrl)}" width="16" height="16" alt="" />`
      : `<span class="tab-favicon-placeholder"></span>`;

    item.innerHTML = `
      <span class="tab-num">${num}</span>
      ${faviconHtml}
      <span class="tab-info">
        <span class="tab-item-title">${escapeHtml(tab.title || 'Untitled')}</span>
        <span class="tab-item-url">${escapeHtml(domain)}</span>
      </span>
      ${pinIcon}${audioIcon}
      ${tab.active ? '<span class="active-dot"></span>' : ''}
    `;
    listEl.appendChild(item);
  }
}

function updateInput(): void {
  if (inputEl) inputEl.textContent = typedFilter;
}

function switchToTab(tabId: number): void {
  const api = getAPI();
  try {
    api?.runtime?.sendMessage?.({ type: 'switch-tab', tabId });
  } catch {
    /* tab may not exist */
  }
}

function openInNewWindow(tabId: number): void {
  const api = getAPI();
  try {
    api?.runtime?.sendMessage?.({ type: 'move-tab-new-window', tabId });
  } catch {
    /* fallback: just switch */
  }
}

function showClosedIndicator(): void {
  if (!panel) return;
  const indicator = document.createElement('div');
  indicator.style.cssText =
    'position:absolute;top:8px;right:16px;padding:4px 10px;background:rgba(255,80,80,0.15);border-radius:6px;font:bold 11px/1 sans-serif;color:#ff6b6b;pointer-events:none;';
  indicator.textContent = 'Tab closed';
  panel.style.position = 'relative';
  panel.appendChild(indicator);
  setTimeout(() => indicator.remove(), 1200);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 30);
  }
}

function getStyles(): string {
  return `
    .tab-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1);
      width: min(500px, 90vw);
      max-height: 70vh;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.panel};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                  transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: auto;
    }

    .tab-panel.hidden {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
      pointer-events: none;
    }

    .tab-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 8px;
      border-bottom: 1px solid ${UI.colors.border};
    }

    .tab-title {
      font: 600 ${UI.font.sizeMd}/${UI.font.base};
      color: ${UI.colors.text};
      font-family: ${UI.font.base};
    }

    .tab-hint {
      font: ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.textDim};
    }

    .tab-input-wrap {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      font: 14px ${UI.font.mono};
      color: ${UI.colors.text};
      min-height: 28px;
      border-bottom: 1px solid ${UI.colors.border};
    }

    .tab-input-text {
      color: #fff;
      border-right: 2px solid ${UI.colors.accent};
      padding-right: 1px;
      animation: blink 1s step-end infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .tab-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .tab-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      cursor: default;
      transition: background 80ms ease;
    }

    .tab-item.selected {
      background: ${UI.colors.accentDim};
      border-left: 2px solid ${UI.colors.accent};
    }

    .tab-num {
      min-width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 600 ${UI.font.sizeXs} ${UI.font.mono};
      color: ${UI.colors.textMuted};
      background: rgba(100, 80, 255, 0.1);
      border-radius: ${UI.radius.badge};
    }

    .tab-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .tab-item-title {
      font: ${UI.font.sizeMd} ${UI.font.base};
      color: ${UI.colors.text};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tab-item-url {
      font: ${UI.font.sizeXs} ${UI.font.base};
      color: ${UI.colors.textDim};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .active-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${UI.colors.accent};
      box-shadow: 0 0 4px ${UI.colors.accentGlow};
    }

    .pin-icon, .audio-icon {
      font-size: 11px;
    }

    .tab-footer {
      padding: 8px 16px;
      font: ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.textDim};
      border-top: 1px solid ${UI.colors.border};
      text-align: center;
    }

    .tab-loading, .tab-empty {
      padding: 24px 16px;
      text-align: center;
      font: ${UI.font.sizeSm} ${UI.font.base};
      color: ${UI.colors.textMuted};
    }

    .tab-favicon {
      width: 16px;
      height: 16px;
      border-radius: 2px;
      flex-shrink: 0;
      object-fit: contain;
    }

    .tab-favicon-placeholder {
      width: 16px;
      height: 16px;
      border-radius: 2px;
      background: ${UI.colors.accentDim};
      flex-shrink: 0;
    }

    .tab-list::-webkit-scrollbar {
      width: 4px;
    }
    .tab-list::-webkit-scrollbar-thumb {
      background: ${UI.colors.border};
      border-radius: 2px;
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
