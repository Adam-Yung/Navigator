import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';

type KeyCallback = (e: KeyboardEvent) => boolean;

let settings: Settings | null = null;
let extensionEnabled = true;
const handlers: KeyCallback[] = [];

export function initKeyHandler(initialSettings: Settings): void {
  settings = initialSettings;
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('keyup', handleKeyup, true);
}

export function updateKeyHandlerSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function setExtensionEnabled(enabled: boolean): void {
  extensionEnabled = enabled;
}

export function isExtensionEnabled(): boolean {
  return extensionEnabled;
}

export function registerKeyHandler(handler: KeyCallback): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}

export function destroyKeyHandler(): void {
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('keyup', handleKeyup, true);
  handlers.length = 0;
}

const keyupHandlers: ((e: KeyboardEvent) => void)[] = [];

export function registerKeyupHandler(handler: (e: KeyboardEvent) => void): () => void {
  keyupHandlers.push(handler);
  return () => {
    const idx = keyupHandlers.indexOf(handler);
    if (idx !== -1) keyupHandlers.splice(idx, 1);
  };
}

function isEditableActive(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

function handleKeydown(e: KeyboardEvent): void {
  if (!settings || !extensionEnabled) return;

  if (!e.altKey && isEditableActive()) return;

  const combo = buildComboString(e);

  if (combo === settings.keybindings.toggleExtension) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  for (const handler of handlers) {
    if (handler(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
}

function handleKeyup(e: KeyboardEvent): void {
  for (const handler of keyupHandlers) {
    handler(e);
  }
}
