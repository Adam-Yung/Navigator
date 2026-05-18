import type { IndexedElement, Settings } from '../shared/types';
import { getSettings, onSettingsChanged } from '../shared/storage';
import { getCurrentMode, onModeChange, setMode } from './mode-manager';
import { scanElements, findNearestToPoint } from './spatial-nav';
import { setNavQueueState, setFlushCallback, setDeadEndCallback } from './nav-queue';
import { initKeyHandler, updateKeyHandlerSettings, setFocusedElement, setTabCycleHandler, setToggleHandler, setHintKeyHandler } from './key-handler';
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

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, { passive: true });

async function init(): Promise<void> {
  settings = await getSettings();

  if (isSiteDisabled(settings.disabledSites)) {
    extensionEnabled = false;
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
  setDeadEndCallback((dir) => { bumpDirection(dir); });
  setTabCycleHandler(cycleElement);
  setToggleHandler(toggleExtension);
  setHintKeyHandler(handleHintKeyEvent);

  onModeChange((newMode, _prevMode) => {
    if (!extensionEnabled && newMode !== 'normal') {
      setMode('normal');
      return;
    }

    if (newMode === 'normal') {
      stopObserving();
      deactivateHintMode();
      elements = [];
      focused = null;
      setFocusedElement(null);
      setNavQueueState(null, [], settings.coneAngle);
      hideAura();
      hideIndicator();
      return;
    }

    showModeIndicator(newMode);
    elements = scanElements(newMode);
    updateMode(newMode);

    if (focused && elements.some(e => e.el === focused!.el)) {
      const updated = elements.find(e => e.el === focused!.el)!;
      focused = updated;
      transitionTo(focused, newMode);
      setNavQueueState(focused, elements, settings.coneAngle);
    } else {
      focused = findNearestToPoint(elements, mouseX, mouseY);
      if (focused) {
        transitionTo(focused, newMode);
      }
      setFocusedElement(focused?.el ?? null);
      setNavQueueState(focused, elements, settings.coneAngle);
    }

    startObserving(newMode, handleElementsInvalidation);
  });

  listenForBackgroundMessages();
}

function handleNavigationResult(target: IndexedElement): void {
  focused = target;
  setFocusedElement(target.el);
  setNavQueueState(target, elements, settings.coneAngle);

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
    const stillExists = elements.find(e => e.el === focused!.el);
    if (stillExists) {
      focused = stillExists;
      if (mode !== 'normal') transitionTo(focused, mode);
    } else {
      focused = findNearestToPoint(elements, focused.cx, focused.cy);
      setFocusedElement(focused?.el ?? null);
      if (focused && mode !== 'normal') transitionTo(focused, mode);
    }
  }

  setNavQueueState(focused, elements, settings.coneAngle);
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
  setNavQueueState(target, elements, settings.coneAngle);

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
    setMode('normal');
  } else {
    extensionEnabled = true;
  }
}

function handleHintKeyEvent(key: string, event: KeyboardEvent): boolean {
  if (!settings) return false;

  if (isHintModeActive()) {
    return handleHintKey(key, event);
  }

  if (key.toLowerCase() === codeToChar(settings.keybindings.hintMode) && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const mode = getCurrentMode();
    if (mode === 'navigation' || mode === 'editing') {
      activateHintMode(elements, mode, handleHintSelect, handleHintCancel);
      return true;
    }
  }

  return false;
}

function handleHintSelect(element: IndexedElement): void {
  focused = element;
  setFocusedElement(element.el);
  setNavQueueState(element, elements, settings.coneAngle);
  const mode = getCurrentMode();
  if (mode !== 'normal') {
    transitionTo(element, mode);
  }
}

function handleHintCancel(): void {
  // Just deactivate — focus stays where it was
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
      if (extensionEnabled) setMode(message.mode);
    }
  });
}

init();
