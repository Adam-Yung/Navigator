export interface IndexedElement {
  el: HTMLElement;
  cx: number;
  cy: number;
  rect: DOMRect;
}

export interface Keybindings {
  picker: string;
  tabPicker: string;
  search: string;
  scrollDown: string;
  scrollUp: string;
  scrollLeft: string;
  scrollRight: string;
  scrollFastDown: string;
  scrollFastUp: string;
  historyBack: string;
  historyForward: string;
  sectionPrev: string;
  sectionNext: string;
  focusHistoryBack: string;
  focusHistoryForward: string;
  urlUp: string;
  urlRoot: string;
  focusFirstInput: string;
  yankMode: string;
  clipboardOpen: string;
  caretMode: string;
  marks: string;
  marksJump: string;
  quickActions: string;
  toggleExtension: string;
}

export interface Settings {
  keybindings: Keybindings;
  animDuration: number;
  autoScroll: boolean;
  auraIntensity: 'subtle' | 'normal' | 'vibrant';
  disabledSites: string[];
  showAltHelper: boolean;
  altHelperDelay: number;
  scrollBaseVelocity: number;
  scrollMaxVelocity: number;
  scrollDecelFactor: number;
  usePhysicalKeys: boolean;
  hintChars: string;
}
