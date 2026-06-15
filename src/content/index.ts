import type { Direction, IndexedElement, Settings } from '../shared/types';
import { getSettings, onSettingsChanged } from '../shared/storage';
import { getCurrentMode, onModeChange, setMode } from './mode-manager';
import { scanElements, findNearestToPoint } from './spatial-nav';
import { setNavQueueState, setFlushCallback, setDeadEndCallback } from './nav-queue';
import { initKeyHandler, updateKeyHandlerSettings, setFocusedElement, setTabCycleHandler, setToggleHandler, setHintKeyHandler, setGoBackHandler, setExtensionEnabled, setJumpToFirstHandler, setJumpToLastHandler } from './key-handler';
import { startObserving, stopObserving, updateMode } from './mutation-observer';
import { initAuraRing, updateAuraSettings, transitionTo, hide as hideAura, bumpDirection } from './aura-ring';
import { initIndicator, showModeIndicator, hideIndicator } from './indicator';
import { initHintMode, activateHintMode, deactivateHintMode, isHintModeActive, getFilteredElements, handleHintKey, destroyHintMode } from './hint-mode';

let elements: IndexedElement[] = [];
let focused: IndexedElement | null = null;
let settings: Settings;
let extensionEnabled = true;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

const MAX_JUMP_STACK = 20;
let jumpStack: IndexedElement[] = [];

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, { passive: true });

async function init(): Promise<void> {
  settings = await getSettings();

  if (isSiteDisabled(settings.disabledSites)) {
    extensionEnabled = false;
    setExtensionEnabled(false);
  }

  initKeyHandler(settings);
  initAuraRing();
  updateAuraSettings(settings);
  initIndicator();
  initHintMode();

  onSettingsChanged((newSettings) => {
    settings = newSettings;
    updateKeyHandlerSettings(newSettings);
    updateAuraSettings(newSettings);
  });

  setFlushCallback(handleNavigationResult);
  setDeadEndCallback(handleDeadEnd);
  setTabCycleHandler(cycleElement);
  setToggleHandler(toggleExtension);
  setHintKeyHandler(handleHintKeyEvent);
  setGoBackHandler(handleGoBack);
  setJumpToFirstHandler(() => jumpToIndex(0));
  setJumpToLastHandler(() => jumpToIndex(elements.length - 1));

  onModeChange((newMode, _prevMode) => {
    if (!extensionEnabled && newMode !== 'normal') {
      setMode('normal');
      return;
    }

    notifyModeChange(newMode);

    if (newMode === 'normal') {
      stopObserving();
      deactivateHintMode();
      elements = [];
      focused = null;
      setFocusedElement(null);
      setNavQueueState(null, [], settings.coneAngle, settings.smartPrioritization);
      hideAura();
      hideIndicator();
      return;
    }

    showModeIndicator(newMode);
    elements = scanElements(newMode);
    updateMode(newMode);

    if (focused && elements.some(e => e.el === focused!.el)) {
      const updated = elements.find(e => e.el === focused!.el);
      if (!updated) { focused = null; setFocusedElement(null); setNavQueueState(null, elements, settings.coneAngle, settings.smartPrioritization); return; }
      focused = updated;
      transitionTo(focused, newMode);
      setNavQueueState(focused, elements, settings.coneAngle, settings.smartPrioritization);
    } else {
      focused = findNearestToPoint(elements, mouseX, mouseY);
      if (focused) {
        transitionTo(focused, newMode);
      }
      setFocusedElement(focused?.el ?? null);
      setNavQueueState(focused, elements, settings.coneAngle, settings.smartPrioritization);
    }

    startObserving(newMode, handleElementsInvalidation);
  });

  listenForBackgroundMessages();
}

function handleNavigationResult(target: IndexedElement): void {
  if (focused) pushJump(focused);
  focused = target;
  setFocusedElement(target.el);
  setNavQueueState(target, elements, settings.coneAngle, settings.smartPrioritization);

  const mode = getCurrentMode();
  if (mode !== 'normal') {
    transitionTo(target, mode);
  }

  if (settings.autoScroll) {
    scrollIntoViewIfNeeded(target);
  }
}

function handleElementsInvalidation(newElements: IndexedElement[]): void {
  elements = newElements;
  const mode = getCurrentMode();

  if (focused) {
    const focusedEl = focused.el;
    const stillExists = elements.find(e => e.el === focusedEl);
    if (stillExists) {
      focused = stillExists;
      if (mode !== 'normal') transitionTo(focused, mode);
    } else {
      focused = findNearestToPoint(elements, focused.cx, focused.cy);
      setFocusedElement(focused?.el ?? null);
      if (focused && mode !== 'normal') transitionTo(focused, mode);
    }
  }

  setNavQueueState(focused, elements, settings.coneAngle, settings.smartPrioritization);
}

export function cycleElement(direction: 'next' | 'prev'): void {
  const list = isHintModeActive() ? getFilteredElements() : elements;
  if (list.length === 0) return;

  const currentIdx = focused ? list.findIndex(e => e.el === focused!.el) : -1;
  let nextIdx: number;

  if (direction === 'next') {
    nextIdx = (currentIdx + 1) % list.length;
  } else {
    nextIdx = (currentIdx - 1 + list.length) % list.length;
  }

  const target = list[nextIdx];
  focused = target;
  setFocusedElement(target.el);
  setNavQueueState(target, elements, settings.coneAngle, settings.smartPrioritization);

  const mode = getCurrentMode();
  if (mode !== 'normal') {
    transitionTo(target, mode);
  }

  if (settings.autoScroll) {
    scrollIntoViewIfNeeded(target);
  }
}

function toggleExtension(): void {
  if (extensionEnabled) {
    extensionEnabled = false;
    setExtensionEnabled(false);
    setMode('normal');
  } else {
    extensionEnabled = true;
    setExtensionEnabled(true);
  }
}

function pushJump(element: IndexedElement): void {
  if (jumpStack.length > 0 && jumpStack[jumpStack.length - 1].el === element.el) return;
  jumpStack.push(element);
  if (jumpStack.length > MAX_JUMP_STACK) jumpStack.shift();
}

function popJump(): IndexedElement | null {
  return jumpStack.pop() ?? null;
}

function handleGoBack(): void {
  const prev = popJump();
  if (!prev) return;
  const stillExists = elements.find(e => e.el === prev.el);
  if (stillExists) {
    focused = stillExists;
    setFocusedElement(stillExists.el);
    setNavQueueState(stillExists, elements, settings.coneAngle, settings.smartPrioritization);
    const mode = getCurrentMode();
    if (mode !== 'normal') transitionTo(stillExists, mode);
    if (settings.autoScroll) scrollIntoViewIfNeeded(stillExists);
  }
}

function jumpToIndex(index: number): void {
  if (elements.length === 0 || index < 0 || index >= elements.length) return;
  const target = elements[index];
  if (focused) pushJump(focused);
  focused = target;
  setFocusedElement(target.el);
  setNavQueueState(target, elements, settings.coneAngle, settings.smartPrioritization);
  const mode = getCurrentMode();
  if (mode !== 'normal') transitionTo(target, mode);
  if (settings.autoScroll) scrollIntoViewIfNeeded(target);
}

function handleHintKeyEvent(key: string, event: KeyboardEvent): boolean {
  if (!settings) return false;

  if (isHintModeActive()) {
    return handleHintKey(key, event);
  }

  if (key.toLowerCase() === codeToChar(settings.keybindings.hintMode) && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const mode = getCurrentMode();
    if (mode === 'navigation' || mode === 'editing') {
      if (elements.length === 0) return false;
      activateHintMode(elements, mode, handleHintSelect, handleHintCancel);
      return true;
    }
  }

  return false;
}

function handleHintSelect(element: IndexedElement): void {
  focused = element;
  setFocusedElement(element.el);
  setNavQueueState(element, elements, settings.coneAngle, settings.smartPrioritization);
  const mode = getCurrentMode();
  if (mode !== 'normal') {
    transitionTo(element, mode);
  }
}

function handleHintCancel(): void {
  // Just deactivate — focus stays where it was
}

function handleDeadEnd(direction: Direction): void {
  if (canScrollInDirection(direction)) {
    scrollInDirection(direction, 200);
  } else {
    bumpDirection(direction);
  }
}

function canScrollInDirection(direction: Direction): boolean {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = doc.scrollTop || body.scrollTop;
  const scrollLeft = doc.scrollLeft || body.scrollLeft;
  const clientHeight = doc.clientHeight;
  const clientWidth = doc.clientWidth;
  const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
  const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);

  switch (direction) {
    case 'down': return scrollTop + clientHeight < scrollHeight - 1;
    case 'up': return scrollTop > 0;
    case 'right': return scrollLeft + clientWidth < scrollWidth - 1;
    case 'left': return scrollLeft > 0;
  }
}

function scrollInDirection(direction: Direction, amount: number): void {
  const map: Record<Direction, [number, number]> = {
    down: [0, amount], up: [0, -amount],
    right: [amount, 0], left: [-amount, 0],
  };
  const [x, y] = map[direction];
  window.scrollBy({ left: x, top: y, behavior: 'smooth' });
}

function codeToChar(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  return code.toLowerCase();
}

function scrollIntoViewIfNeeded(target: IndexedElement): void {
  const rect = target.el.getBoundingClientRect();
  const inView =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!inView) {
    target.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function isSiteDisabled(patterns: string[]): boolean {
  const url = window.location.href;
  for (const pattern of patterns) {
    if (matchUrlPattern(pattern, url)) return true;
  }
  return false;
}

function matchUrlPattern(pattern: string, url: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

function listenForBackgroundMessages(): void {
  const api = (globalThis as any).browser || (globalThis as any).chrome;
  if (!api?.runtime?.onMessage) return;

  api.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'set-mode') {
      const validModes = ['normal', 'navigation', 'editing'];
      if (extensionEnabled && validModes.includes(message.mode)) {
        setMode(message.mode);
      }
    }
  });
}

function notifyModeChange(mode: string): void {
  const api = (globalThis as any).browser || (globalThis as any).chrome;
  try {
    api?.runtime?.sendMessage?.({ type: 'mode-changed', mode });
  } catch {
    // Extension context may be invalidated
  }
}

init().catch(() => {});
