import type { IndexedElement, Settings } from '../shared/types';
import { getSettings, onSettingsChanged } from '../shared/storage';
import { getCurrentMode, onModeChange, setMode } from './mode-manager';
import { scanElements, findNearestToViewportCenter } from './spatial-nav';
import { setNavQueueState, setFlushCallback } from './nav-queue';
import { initKeyHandler, updateKeyHandlerSettings, setFocusedElement } from './key-handler';
import { startObserving, stopObserving, updateMode } from './mutation-observer';
import { initAuraRing, updateAuraSettings, transitionTo, hide as hideAura } from './aura-ring';
import { initIndicator, showModeIndicator, hideIndicator } from './indicator';

let elements: IndexedElement[] = [];
let focused: IndexedElement | null = null;
let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();

  initKeyHandler(settings);
  initAuraRing();
  updateAuraSettings(settings);
  initIndicator();

  onSettingsChanged((newSettings) => {
    settings = newSettings;
    updateKeyHandlerSettings(newSettings);
    updateAuraSettings(newSettings);
  });

  setFlushCallback(handleNavigationResult);

  onModeChange((newMode, _prevMode) => {
    if (newMode === 'normal') {
      stopObserving();
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
      focused = findNearestToViewportCenter(elements);
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
      focused = findNearestToViewportCenter(elements);
      setFocusedElement(focused?.el ?? null);
      if (focused && mode !== 'normal') transitionTo(focused, mode);
    }
  }

  setNavQueueState(focused, elements, settings.coneAngle);
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

function listenForBackgroundMessages(): void {
  const api = (globalThis as any).browser || (globalThis as any).chrome;
  if (!api?.runtime?.onMessage) return;

  api.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'set-mode') {
      setMode(message.mode);
    }
  });
}

init();
