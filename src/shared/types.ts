export type Mode = 'normal' | 'navigation' | 'editing';

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface IndexedElement {
  el: HTMLElement;
  cx: number;
  cy: number;
  rect: DOMRect;
}

export interface Keybindings {
  enterNavigation: string;
  enterEditing: string;
  returnToNormal: string;
  activate: string;
  stickyActivate: string;
  openNewTab: string;
  goBack: string;
  toggleExtension: string;
  hintMode: string;
}

export interface Settings {
  keybindings: Keybindings;
  animDuration: number;
  coneAngle: number;
  autoScroll: boolean;
  auraIntensity: 'subtle' | 'normal' | 'vibrant';
  disabledSites: string[];
}

export type ModeChangeCallback = (newMode: Mode, prevMode: Mode) => void;
