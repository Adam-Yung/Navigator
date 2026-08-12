import type { Keybindings, Settings } from './types';

export const DEFAULT_KEYBINDINGS: Keybindings = {
  picker: 'Alt+KeyF',
  tabPicker: 'Alt+KeyT',
  search: 'Alt+Slash',
  scrollDown: 'Alt+KeyJ',
  scrollUp: 'Alt+KeyK',
  scrollLeft: 'Alt+KeyH',
  scrollRight: 'Alt+KeyL',
  scrollFastDown: 'Alt+Shift+KeyJ',
  scrollFastUp: 'Alt+Shift+KeyK',
  historyBack: 'Alt+BracketLeft',
  historyForward: 'Alt+BracketRight',
  sectionPrev: 'Alt+Shift+BracketLeft',
  sectionNext: 'Alt+Shift+BracketRight',
  focusHistoryBack: 'Alt+KeyO',
  focusHistoryForward: 'Alt+KeyI',
  urlUp: 'Alt+KeyU',
  urlRoot: 'Alt+Shift+KeyU',
  focusFirstInput: 'Alt+KeyG',
  yankMode: 'Alt+KeyY',
  clipboardOpen: 'Alt+KeyP',
  caretMode: 'Alt+KeyV',
  marks: 'Alt+KeyM',
  marksJump: 'Alt+Quote',
  quickActions: 'Alt+Space',
  toggleExtension: 'Ctrl+Alt+KeyA',
};

export const DEFAULT_SETTINGS: Settings = {
  keybindings: DEFAULT_KEYBINDINGS,
  animDuration: 200,
  autoScroll: true,
  auraIntensity: 'normal',
  disabledSites: [],
  showAltHelper: true,
  altHelperDelay: 200,
  scrollBaseVelocity: 5,
  scrollMaxVelocity: 60,
  scrollDecelFactor: 0.92,
  usePhysicalKeys: false,
  hintChars: 'asdfghjklqwertyuiopzxcvbnm',
  colorfulHints: true,
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

export const AURA_COLOR = 'hsl(250, 80%, 65%)';

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
