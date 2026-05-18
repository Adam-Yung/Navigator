import type { Settings, Keybindings } from './types';

export const DEFAULT_KEYBINDINGS: Keybindings = {
  enterNavigation: 'Ctrl+Alt+KeyN',
  enterEditing: 'Ctrl+Alt+KeyE',
  returnToNormal: 'Escape',
  activate: 'Enter',
  openNewTab: 'Ctrl+Enter',
};

export const DEFAULT_SETTINGS: Settings = {
  keybindings: DEFAULT_KEYBINDINGS,
  animDuration: 250,
  coneAngle: 90,
  autoScroll: true,
  auraIntensity: 'normal',
};

export const NAV_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
  'details > summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(', ');

export const EDIT_SELECTORS = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
  'textarea',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="searchbox"]',
].join(', ');

export const AURA_COLORS = {
  navigation: 'hsl(250, 80%, 65%)',
  editing: 'hsl(38, 90%, 58%)',
} as const;

export const AURA_INTENSITY_SHADOWS = {
  subtle: {
    spread1: '0 0 0 1px',
    spread2: '0 0 4px 1px',
    spread3: '0 0 12px 2px',
  },
  normal: {
    spread1: '0 0 0 1px',
    spread2: '0 0 8px 2px',
    spread3: '0 0 20px 4px',
  },
  vibrant: {
    spread1: '0 0 0 2px',
    spread2: '0 0 12px 3px',
    spread3: '0 0 28px 6px',
  },
} as const;
