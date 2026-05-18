import type { Direction, Settings } from '../shared/types';
import { getCurrentMode, setMode, activateElement, openInNewTab, handleEscape } from './mode-manager';
import { enqueue } from './nav-queue';

let settings: Settings | null = null;
let currentFocusedElement: HTMLElement | null = null;
let onTabCycle: ((direction: 'next' | 'prev') => void) | null = null;
let onHintKey: ((key: string, event: KeyboardEvent) => boolean) | null = null;
let onToggle: (() => void) | null = null;
let onGoBack: (() => void) | null = null;

export function initKeyHandler(initialSettings: Settings): void {
  settings = initialSettings;
  document.addEventListener('keydown', handleKeydown, true);
}

export function updateKeyHandlerSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function setFocusedElement(el: HTMLElement | null): void {
  currentFocusedElement = el;
}

export function setTabCycleHandler(handler: (direction: 'next' | 'prev') => void): void {
  onTabCycle = handler;
}

export function setHintKeyHandler(handler: (key: string, event: KeyboardEvent) => boolean): void {
  onHintKey = handler;
}

export function setToggleHandler(handler: () => void): void {
  onToggle = handler;
}

export function setGoBackHandler(handler: () => void): void {
  onGoBack = handler;
}

export function destroyKeyHandler(): void {
  document.removeEventListener('keydown', handleKeydown, true);
}

function handleKeydown(e: KeyboardEvent): void {
  if (!settings) return;

  const mode = getCurrentMode();
  const combo = buildComboString(e);

  if (combo === settings.keybindings.toggleExtension) {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle) onToggle();
    return;
  }

  if (mode === 'normal') {
    if (combo === settings.keybindings.enterNavigation) {
      e.preventDefault();
      e.stopPropagation();
      setMode('navigation');
    } else if (combo === settings.keybindings.enterEditing) {
      e.preventDefault();
      e.stopPropagation();
      setMode('editing');
    }
    return;
  }

  if (mode === 'navigation' || mode === 'editing') {
    if (onHintKey && onHintKey(e.key, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const direction = keyToDirection(e);
    if (direction) {
      e.preventDefault();
      e.stopPropagation();
      enqueue(direction);
      return;
    }

    if (combo === settings.keybindings.returnToNormal) {
      e.preventDefault();
      e.stopPropagation();
      handleEscape();
      return;
    }

    if (combo === settings.keybindings.activate) {
      e.preventDefault();
      e.stopPropagation();
      if (currentFocusedElement) {
        activateElement(currentFocusedElement);
      }
      return;
    }

    if (combo === settings.keybindings.stickyActivate) {
      e.preventDefault();
      e.stopPropagation();
      if (currentFocusedElement) {
        activateElement(currentFocusedElement, true);
      }
      return;
    }

    if (combo === settings.keybindings.openNewTab) {
      e.preventDefault();
      e.stopPropagation();
      if (currentFocusedElement) {
        openInNewTab(currentFocusedElement);
      }
      return;
    }

    if (combo === settings.keybindings.goBack) {
      e.preventDefault();
      e.stopPropagation();
      if (onGoBack) onGoBack();
      return;
    }

    if (combo === settings.keybindings.enterNavigation) {
      e.preventDefault();
      e.stopPropagation();
      setMode('navigation');
      return;
    }

    if (combo === settings.keybindings.enterEditing) {
      e.preventDefault();
      e.stopPropagation();
      setMode('editing');
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (onTabCycle) onTabCycle(e.shiftKey ? 'prev' : 'next');
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code.startsWith('F') && /^F\d{1,2}$/.test(e.key)) return;

    e.preventDefault();
    e.stopPropagation();
  }
}

function keyToDirection(e: KeyboardEvent): Direction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;

  switch (e.key.toLowerCase()) {
    case 'h': case 'arrowleft': return 'left';
    case 'j': case 'arrowdown': return 'down';
    case 'k': case 'arrowup': return 'up';
    case 'l': case 'arrowright': return 'right';
    default: return null;
  }
}

export function buildComboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}
