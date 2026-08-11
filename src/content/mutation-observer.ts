import { NAV_SELECTORS } from '../shared/constants';
import type { IndexedElement } from '../shared/types';

type InvalidationCallback = (elements: IndexedElement[]) => void;

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let callback: InvalidationCallback | null = null;
let disconnectedDuringDebounce = false;
let lastRescanTime = 0;
let cachedElements: IndexedElement[] | null = null;
let cacheValid = false;

const FOCUSABLE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
const RESCAN_THROTTLE = 500;

export function startObserving(onInvalidate: InvalidationCallback): void {
  callback = onInvalidate;
  disconnectedDuringDebounce = false;
  connectObserver();
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });
}

export function invalidateElementCache(): void {
  cacheValid = false;
  cachedElements = null;
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
  cachedElements = null;
  cacheValid = false;
}

function queryShadowRoots(root: Document | ShadowRoot, selector: string): HTMLElement[] {
  const results: HTMLElement[] = [];
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    if (el.shadowRoot) {
      results.push(...el.shadowRoot.querySelectorAll<HTMLElement>(selector));
      results.push(...queryShadowRoots(el.shadowRoot, selector));
    }
  }
  return results;
}

function detectActiveModal(): HTMLElement | null {
  const dialog = document.querySelector('dialog[open]') as HTMLElement | null;
  if (dialog) return dialog;

  const ariaModal = document.querySelector('[aria-modal="true"]') as HTMLElement | null;
  if (ariaModal) {
    const style = getComputedStyle(ariaModal);
    if (style.display !== 'none' && style.visibility !== 'hidden') return ariaModal;
  }

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const vpArea = vw * vh;
  const candidates = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position !== 'fixed' && style.position !== 'absolute') continue;
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width * rect.height > vpArea * 0.15) return el as HTMLElement;
  }

  return null;
}

export function scanVisibleElements(): IndexedElement[] {
  if (cacheValid && cachedElements !== null) {
    return cachedElements;
  }

  const modalScope = detectActiveModal();
  const root = modalScope || document;

  const result: IndexedElement[] = [];
  const elements = root.querySelectorAll<HTMLElement>(NAV_SELECTORS);
  const shadowElements = modalScope ? [] : queryShadowRoots(document, NAV_SELECTORS);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const el of elements) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) continue;

    result.push({
      el,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      rect,
    });
  }

  for (const el of shadowElements) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) continue;

    result.push({
      el,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      rect,
    });
  }

  scanIframes(result, vw, vh);

  cachedElements = result;
  cacheValid = true;
  return result;
}

function scanIframes(result: IndexedElement[], vw: number, vh: number): void {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    let doc: Document;
    try {
      doc = (iframe as HTMLIFrameElement).contentDocument!;
      if (!doc) continue;
    } catch {
      continue;
    }
    const iframeRect = iframe.getBoundingClientRect();
    const elements = doc.querySelectorAll<HTMLElement>(NAV_SELECTORS);
    for (const el of elements) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const adjustedLeft = rect.left + iframeRect.left;
      const adjustedTop = rect.top + iframeRect.top;
      if (adjustedTop + rect.height <= 0 || adjustedLeft + rect.width <= 0) continue;
      if (adjustedTop >= vh || adjustedLeft >= vw) continue;

      result.push({
        el,
        cx: adjustedLeft + rect.width / 2,
        cy: adjustedTop + rect.height / 2,
        rect,
      });
    }
  }
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
  cacheValid = false;
  scheduleRescan(true);
}

function handleResize(): void {
  cacheValid = false;
  scheduleRescan(false);
}

function scheduleRescan(throttle = false): void {
  cacheValid = false;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  } else if (observer && !disconnectedDuringDebounce) {
    disconnectObserver();
    disconnectedDuringDebounce = true;
  }

  if (throttle) {
    const now = Date.now();
    const elapsed = now - lastRescanTime;
    const delay = Math.max(RESCAN_THROTTLE - elapsed, 100);
    debounceTimer = setTimeout(rescan, delay);
  } else {
    debounceTimer = setTimeout(rescan, 100);
  }
}

function rescan(): void {
  debounceTimer = null;
  lastRescanTime = Date.now();

  if (disconnectedDuringDebounce) {
    connectObserver();
    disconnectedDuringDebounce = false;
  }

  if (!callback) return;
  const elements = scanVisibleElements();
  callback(elements);
}

function isVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  if (el.checkVisibility) {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }

  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}
