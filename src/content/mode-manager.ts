import type { Mode, ModeChangeCallback } from '../shared/types';

type ActivationContext = {
  element: HTMLElement;
  returnMode: Mode;
};

let currentMode: Mode = 'normal';
let previousModalMode: Mode = 'navigation';
let activeInput: ActivationContext | null = null;
const listeners: ModeChangeCallback[] = [];

export function getCurrentMode(): Mode {
  return currentMode;
}

export function getPreviousModalMode(): Mode {
  return previousModalMode;
}

export function getActiveInput(): ActivationContext | null {
  return activeInput;
}

export function onModeChange(callback: ModeChangeCallback): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function setMode(newMode: Mode): void {
  if (newMode === currentMode) return;
  const prev = currentMode;

  if (prev !== 'normal') {
    previousModalMode = prev;
  }

  currentMode = newMode;

  if (newMode === 'normal') {
    activeInput = null;
  }

  for (const cb of listeners) {
    cb(newMode, prev);
  }
}

export function activateElement(el: HTMLElement): void {
  const isLink = el.tagName === 'A' && el.hasAttribute('href');
  const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
  const isEditable = isEditableElement(el);

  if (isLink) {
    el.click();
    setMode('normal');
  } else if (isButton) {
    el.click();
    setMode('normal');
  } else if (isEditable) {
    activeInput = { element: el, returnMode: currentMode };
    el.focus();
    setMode('normal');
  } else {
    el.click();
    setMode('normal');
  }
}

export function openInNewTab(el: HTMLElement): void {
  if (el.tagName === 'A') {
    const href = (el as HTMLAnchorElement).href;
    if (href) {
      window.open(href, '_blank');
      return;
    }
  }
  const clickEvent = new MouseEvent('click', {
    ctrlKey: true,
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(clickEvent);
}

export function handleEscape(): void {
  if (activeInput) {
    const returnTo = activeInput.returnMode;
    activeInput.element.blur();
    activeInput = null;
    setMode(returnTo);
  } else {
    setMode('normal');
  }
}

function isEditableElement(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return !['hidden', 'button', 'submit', 'reset', 'checkbox', 'radio'].includes(type);
  }
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'searchbox';
}
