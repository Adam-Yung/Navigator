import type { Mode, IndexedElement } from '../shared/types';
import { scanElements } from './spatial-nav';

type InvalidationCallback = (elements: IndexedElement[]) => void;

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentMode: Mode = 'normal';
let callback: InvalidationCallback | null = null;
let disconnectedDuringDebounce = false;

const FOCUSABLE_TAGS = new Set([
  'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY',
]);

export function startObserving(mode: Mode, onInvalidate: InvalidationCallback): void {
  currentMode = mode;
  callback = onInvalidate;
  disconnectedDuringDebounce = false;

  connectObserver();

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });
}

export function stopObserving(): void {
  disconnectObserver();
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleResize);

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  callback = null;
  disconnectedDuringDebounce = false;
}

export function updateMode(mode: Mode): void {
  currentMode = mode;
}

function connectObserver(): void {
  if (observer) observer.disconnect();

  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'disabled', 'aria-hidden', 'href', 'tabindex'],
  });
}

function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function handleMutations(mutations: MutationRecord[]): void {
  if (!couldAffectFocusables(mutations)) return;
  scheduleRescan();
}

function couldAffectFocusables(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (nodeCouldBeFocusable(node)) return true;
      }
      for (const node of mutation.removedNodes) {
        if (nodeCouldBeFocusable(node)) return true;
      }
    } else if (mutation.type === 'attributes') {
      if (nodeCouldBeFocusable(mutation.target)) return true;
    }
  }
  return false;
}

function nodeCouldBeFocusable(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;

  if (FOCUSABLE_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('tabindex')) return true;
  if (el.hasAttribute('contenteditable')) return true;
  if (el.hasAttribute('role')) return true;

  return el.children.length > 0;
}

function handleScroll(): void {
  scheduleRescan();
}

function handleResize(): void {
  scheduleRescan();
}

function scheduleRescan(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  } else if (observer && !disconnectedDuringDebounce) {
    disconnectObserver();
    disconnectedDuringDebounce = true;
  }

  debounceTimer = setTimeout(rescan, 100);
}

function rescan(): void {
  debounceTimer = null;

  if (disconnectedDuringDebounce) {
    connectObserver();
    disconnectedDuringDebounce = false;
  }

  if (currentMode === 'normal' || !callback) return;
  const elements = scanElements(currentMode);
  callback(elements);
}
