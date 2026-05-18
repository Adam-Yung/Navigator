import type { Direction, Settings } from '../shared/types';
import { getCurrentMode, setMode, activateElement, openInNewTab, handleEscape } from './mode-manager';
import { enqueue } from './nav-queue';

let settings: Settings | null = null;
let currentFocusedElement: HTMLElement | null = null;

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

export function destroyKeyHandler(): void {
  document.removeEventListener('keydown', handleKeydown, true);
}

function handleKeydown(e: KeyboardEvent): void {
  if (!settings) return;

  const mode = getCurrentMode();
  const combo = buildComboString(e);

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

    if (combo === settings.keybindings.openNewTab) {
      e.preventDefault();
      e.stopPropagation();
      if (currentFocusedElement) {
        openInNewTab(currentFocusedElement);
      }
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

    if (e.ctrlKey || e.altKey || e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();
  }
}

function keyToDirection(e: KeyboardEvent): Direction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;

  switch (e.key.toLowerCase()) {
    case 'h': return 'left';
    case 'j': return 'down';
    case 'k': return 'up';
    case 'l': return 'right';
    default: return null;
  }
}

function buildComboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}
