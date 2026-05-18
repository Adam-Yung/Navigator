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
  openNewTab: string;
}

export interface Settings {
  keybindings: Keybindings;
  animDuration: number;
  coneAngle: number;
  autoScroll: boolean;
  auraIntensity: 'subtle' | 'normal' | 'vibrant';
}

export type ModeChangeCallback = (newMode: Mode, prevMode: Mode) => void;
