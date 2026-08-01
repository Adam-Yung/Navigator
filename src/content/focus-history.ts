import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { registerKeyHandler } from './key-handler';
import { transitionTo } from './aura-ring';
import { revealElement } from './hover-manager';

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

function goBack(): void {
  if (cursor <= 0) return;
  cursor--;
  jumpTo(history[cursor]);
}

function goForward(): void {
  if (cursor >= history.length - 1) return;
  cursor++;
  jumpTo(history[cursor]);
}

function jumpTo(el: HTMLElement): void {
  if (!el.isConnected) return;
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
