import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { registerKeyHandler } from './key-handler';
import { showToast } from './indicator';

let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let awaitingFocusInput = false;

export function initUrlNav(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateUrlNavSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function destroyUrlNav(): void {
  if (unregisterKey) unregisterKey();
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  if (combo === settings.keybindings.historyBack) {
    history.back();
    return true;
  }
  if (combo === settings.keybindings.historyForward) {
    history.forward();
    return true;
  }
  if (combo === settings.keybindings.urlUp) {
    goUpUrl();
    return true;
  }
  if (combo === settings.keybindings.urlRoot) {
    goToRoot();
    return true;
  }
  if (combo === settings.keybindings.focusFirstInput) {
    focusFirstInput();
    return true;
  }
  return false;
}

function goUpUrl(): void {
  const url = new URL(window.location.href);
  const parts = url.pathname.replace(/\/$/, '').split('/');
  if (parts.length <= 1) {
    showToast('Already at root');
    return;
  }
  parts.pop();
  url.pathname = parts.join('/') || '/';
  window.location.href = url.href;
}

function goToRoot(): void {
  const url = new URL(window.location.href);
  if (url.pathname === '/') {
    showToast('Already at root');
    return;
  }
  url.pathname = '/';
  url.search = '';
  window.location.href = url.href;
}

function focusFirstInput(): void {
  const selectors = 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';
  const inputs = document.querySelectorAll<HTMLElement>(selectors);
  for (const input of inputs) {
    const rect = input.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight) {
      input.focus();
      showToast('Input focused', 1500, 'success');
      return;
    }
  }
  showToast('No input found', 1500, 'error');
}
