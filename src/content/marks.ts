import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { showToast } from './indicator';
import { registerKeyHandler } from './key-handler';
import { UI } from './ui-tokens';

interface MarkEntry {
  scrollX: number;
  scrollY: number;
  selector: string | null;
}

type PromptMode = 'set' | 'jump' | null;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let prompt: HTMLElement | null = null;
let active = false;
let promptMode: PromptMode = null;
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;

export function initMarks(initialSettings: Settings): void {
  settings = initialSettings;
  createDOM();
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateMarksSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function deactivateMarks(): void {
  if (!active) return;
  active = false;
  promptMode = null;
  updatePrompt();
}

export function isMarksActive(): boolean {
  return active;
}

export function destroyMarks(): void {
  deactivateMarks();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    prompt = null;
  }
  if (unregisterKey) unregisterKey();
}

function createDOM(): void {
  const existing = document.getElementById('navigator-marks-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-marks-host';
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;z-index:${UI.zIndex.panel};pointer-events:none;`;
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadow.appendChild(style);

  prompt = document.createElement('div');
  prompt.className = 'marks-prompt hidden';
  shadow.appendChild(prompt);

  document.documentElement.appendChild(host);
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.marks) {
      activatePrompt('set');
      return true;
    }
    if (combo === settings.keybindings.marksJump) {
      activatePrompt('jump');
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    deactivateMarks();
    return true;
  }

  if (e.key.length === 1 && /^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const key = e.key.toLowerCase();
    if (promptMode === 'set') {
      setMark(key);
    } else if (promptMode === 'jump') {
      jumpToMark(key);
    }
    deactivateMarks();
    return true;
  }

  return true;
}

function activatePrompt(mode: PromptMode): void {
  active = true;
  promptMode = mode;
  updatePrompt();
}

function setMark(key: string): void {
  const focused = document.activeElement as HTMLElement | null;
  const entry: MarkEntry = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    selector: focused && focused !== document.body ? getUniqueSelector(focused) : null,
  };
  const marks = loadMarks();
  marks[key] = entry;
  saveMarks(marks);
  showToast(`Mark '${key}' set`, 1500, 'success');
}

function jumpToMark(key: string): void {
  const marks = loadMarks();
  const entry = marks[key];
  if (!entry) {
    showToast(`No mark '${key}'`, 1500, 'error');
    return;
  }
  window.scrollTo(entry.scrollX, entry.scrollY);
  if (entry.selector) {
    const el = document.querySelector<HTMLElement>(entry.selector);
    if (el) el.focus();
  }
  showToast(`Jumped to '${key}'`, 1500, 'success');
}

function storageKey(): string {
  return `navigator-marks:${window.location.href.split('#')[0]}`;
}

function loadMarks(): Record<string, MarkEntry> {
  try {
    const raw = sessionStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMarks(marks: Record<string, MarkEntry>): void {
  try {
    sessionStorage.setItem(storageKey(), JSON.stringify(marks));
  } catch {
    /* quota exceeded or private mode */
  }
}

function getUniqueSelector(el: HTMLElement): string | null {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const path: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    let seg = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const tag = current.tagName;
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === tag);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        seg += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(seg);
    current = parent;
  }
  return path.length > 0 ? path.join(' > ') : null;
}

function updatePrompt(): void {
  if (!prompt) return;
  if (!active || !promptMode) {
    prompt.className = 'marks-prompt hidden';
    prompt.textContent = '';
    return;
  }
  prompt.textContent = promptMode === 'set' ? 'Set mark: _' : 'Jump to mark: _';
  prompt.className = 'marks-prompt visible';
}

function getStyles(): string {
  return `
    .marks-prompt {
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%) scale(1);
      padding: 10px 20px;
      background: ${UI.colors.bg};
      border: 1px solid ${UI.colors.border};
      border-radius: ${UI.radius.pill};
      backdrop-filter: ${UI.backdrop};
      box-shadow: ${UI.shadow.panel};
      font: ${UI.font.sizeMd} ${UI.font.mono};
      color: ${UI.colors.text};
      white-space: nowrap;
      transition: opacity ${UI.anim.entryDuration} ${UI.anim.easeFastOut},
                  transform ${UI.anim.entryDuration} ${UI.anim.easeFastOut};
      pointer-events: none;
    }
    .marks-prompt.hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.92);
      pointer-events: none;
    }
    .marks-prompt.visible {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
  `;
}
