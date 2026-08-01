import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { registerKeyHandler } from './key-handler';
import { showToast } from './indicator';

const MAX_RING = 20;
let copyRing: string[] = [];
let yankMode = false;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let focusedElement: HTMLElement | null = null;

export function initClipboardOps(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateClipboardSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function setClipboardFocusedElement(el: HTMLElement | null): void {
  focusedElement = el;
}

export function destroyClipboardOps(): void {
  if (unregisterKey) unregisterKey();
  yankMode = false;
}

export function isYankModeActive(): boolean {
  return yankMode;
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  // Yank mode second key
  if (yankMode) {
    yankMode = false;
    if (e.key === 'y' || e.key === 'Y') {
      copyToClipboard(window.location.href, 'URL copied');
      return true;
    }
    if (e.key === 't' || e.key === 'T') {
      copyToClipboard(document.title, 'Title copied');
      return true;
    }
    if (e.key === 'f' || e.key === 'F') {
      if (focusedElement?.tagName === 'A') {
        const href = (focusedElement as HTMLAnchorElement).href;
        if (href) { copyToClipboard(href, 'Link copied'); return true; }
      }
      showToast('No link to copy');
      return true;
    }
    return false;
  }

  // Enter yank mode
  if (combo === settings.keybindings.yankMode) {
    if (focusedElement?.tagName === 'A') {
      const href = (focusedElement as HTMLAnchorElement).href;
      if (href) { copyToClipboard(href, 'Link copied'); return true; }
    }
    yankMode = true;
    showToast('Yank: y=URL  t=title  f=link');
    return true;
  }

  // Open clipboard
  if (combo === settings.keybindings.clipboardOpen) {
    openFromClipboard();
    return true;
  }

  return false;
}

async function copyToClipboard(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copyRing.push(text);
    if (copyRing.length > MAX_RING) copyRing.shift();
    showToast(message);
  } catch {
    showToast('Copy failed');
  }
}

async function openFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text && isUrl(text)) {
      window.location.href = text;
    } else if (copyRing.length > 0) {
      const lastUrl = [...copyRing].reverse().find(isUrl);
      if (lastUrl) window.location.href = lastUrl;
      else showToast('No URL in clipboard');
    } else {
      showToast('No URL in clipboard');
    }
  } catch {
    showToast('Cannot read clipboard');
  }
}

function isUrl(text: string): boolean {
  return /^https?:\/\/.+/.test(text.trim());
}
