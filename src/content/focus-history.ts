import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { transitionTo } from './aura-ring';
import { revealElement } from './hover-manager';
import { showToast } from './indicator';
import { registerKeyHandler } from './key-handler';

const MAX_HISTORY = 30;
let history: HTMLElement[] = [];
let cursor = -1;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;

export function initFocusHistory(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateFocusHistorySettings(newSettings: Settings): void {
  settings = newSettings;
}

export function pushFocus(el: HTMLElement): void {
  if (history.length > 0 && history[cursor] === el) return;
  // Trim forward history when pushing new
  history = history.slice(0, cursor + 1);
  history.push(el);
  if (history.length > MAX_HISTORY) history.shift();
  cursor = history.length - 1;
}

export function destroyFocusHistory(): void {
  if (unregisterKey) unregisterKey();
  history = [];
  cursor = -1;
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  if (combo === settings.keybindings.focusHistoryBack) {
    goBack();
    return true;
  }
  if (combo === settings.keybindings.focusHistoryForward) {
    goForward();
    return true;
  }
  return false;
}

function pruneDisconnected(): void {
  const before = history.length;
  history = history.filter((el) => el.isConnected);
  if (history.length !== before) {
    cursor = Math.min(cursor, history.length - 1);
    if (cursor < 0) cursor = -1;
  }
}

function goBack(): void {
  pruneDisconnected();
  if (cursor <= 0) {
    showToast('Element removed from page', 1500, 'info');
    return;
  }
  cursor--;
  jumpTo(history[cursor]);
}

function goForward(): void {
  pruneDisconnected();
  if (cursor >= history.length - 1) {
    showToast('Element removed from page', 1500, 'info');
    return;
  }
  cursor++;
  jumpTo(history[cursor]);
}

function jumpTo(el: HTMLElement): void {
  if (!el?.isConnected) {
    showToast('Element removed from page', 1500, 'info');
    return;
  }
  const rect = el.getBoundingClientRect();
  const indexed: IndexedElement = { el, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, rect };

  // Scroll into view if needed
  const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!inView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      transitionTo(indexed);
      revealElement(el);
    }, 200);
  } else {
    transitionTo(indexed);
    revealElement(el);
  }
}
