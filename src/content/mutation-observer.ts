import type { Mode, IndexedElement } from '../shared/types';
import { scanElements } from './spatial-nav';

type InvalidationCallback = (elements: IndexedElement[]) => void;

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentMode: Mode = 'normal';
let callback: InvalidationCallback | null = null;

export function startObserving(mode: Mode, onInvalidate: InvalidationCallback): void {
  currentMode = mode;
  callback = onInvalidate;

  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(scheduleRescan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'disabled', 'aria-hidden'],
  });

  window.addEventListener('scroll', scheduleRescan, { passive: true });
  window.addEventListener('resize', scheduleRescan, { passive: true });
}

export function stopObserving(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.removeEventListener('scroll', scheduleRescan);
  window.removeEventListener('resize', scheduleRescan);

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  callback = null;
}

export function updateMode(mode: Mode): void {
  currentMode = mode;
}

function scheduleRescan(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(rescan, 100);
}

function rescan(): void {
  debounceTimer = null;
  if (currentMode === 'normal' || !callback) return;
  const elements = scanElements(currentMode);
  callback(elements);
}
