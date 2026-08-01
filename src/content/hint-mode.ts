import { AURA_COLOR } from '../shared/constants';
import type { IndexedElement } from '../shared/types';

const HINT_CHARS = 'asdfghjklqwertyuiopzxcvbnm'.split('');

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let modalEl: HTMLElement | null = null;
let labelsContainer: HTMLElement | null = null;
let active = false;
let typedFilter = '';
let allHints: HintEntry[] = [];
let filteredHints: HintEntry[] = [];
let onSelect: ((element: IndexedElement) => void) | null = null;
let onCancel: (() => void) | null = null;

interface HintEntry {
  label: string;
  element: IndexedElement;
  labelEl: HTMLElement;
}

export function initHintMode(): void {
  const existing = document.getElementById('navigator-hints-host');
  if (existing) existing.remove();

  host = document.createElement('div');
  host.id = 'navigator-hints-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483645;pointer-events:none;';
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getHintStyles();
  shadow.appendChild(style);

  labelsContainer = document.createElement('div');
  labelsContainer.className = 'labels-container';
  shadow.appendChild(labelsContainer);

  modalEl = document.createElement('div');
  modalEl.className = 'hint-modal hidden';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-label', 'Hint mode filter');
  modalEl.innerHTML = `
    <div class="hint-input" aria-live="polite"><span class="hint-typed"></span><span class="hint-cursor">|</span></div>
    <div class="hint-help">Tab to cycle &bull; Enter to select &bull; Esc to cancel</div>
  `;
  shadow.appendChild(modalEl);

  document.documentElement.appendChild(host);
}

export function activateHintMode(
  elements: IndexedElement[],
  selectCb: (element: IndexedElement) => void,
  cancelCb: () => void,
): void {
  if (!labelsContainer || !modalEl) return;

  active = true;
  typedFilter = '';
  onSelect = selectCb;
  onCancel = cancelCb;

  const labels = generateLabels(elements.length);
  allHints = [];
  labelsContainer.innerHTML = '';

  for (let i = 0; i < elements.length; i++) {
    const entry = elements[i];
    const label = labels[i];
    const labelEl = document.createElement('span');
    labelEl.className = 'hint-label';
    labelEl.textContent = label;

    const rect = entry.el.getBoundingClientRect();
    labelEl.style.top = `${rect.top - 4}px`;
    labelEl.style.left = `${rect.left - 2}px`;

    labelsContainer.appendChild(labelEl);
    allHints.push({ label, element: entry, labelEl });
  }

  filteredHints = [...allHints];
  modalEl.classList.remove('hidden');
  updateModal();
}

export function deactivateHintMode(): void {
  active = false;
  typedFilter = '';
  allHints = [];
  filteredHints = [];

  if (labelsContainer) labelsContainer.innerHTML = '';
  if (modalEl) modalEl.classList.add('hidden');
}

export function isHintModeActive(): boolean {
  return active;
}

export function getFilteredElements(): IndexedElement[] {
  return filteredHints.map((h) => h.element);
}

export function handleHintKey(key: string, event: KeyboardEvent): boolean {
  if (!active) return false;

  if (key === 'Escape') {
    deactivateHintMode();
    if (onCancel) onCancel();
    return true;
  }

  if (key === 'Enter') {
    if (filteredHints.length > 0) {
      const target = filteredHints[0];
      deactivateHintMode();
      if (onSelect) onSelect(target.element);
    }
    return true;
  }

  if (key === 'Backspace') {
    if (typedFilter.length > 0) {
      typedFilter = typedFilter.slice(0, -1);
      applyFilter();
    }
    return true;
  }

  if (key === 'Tab') {
    return false;
  }

  if (key.length === 1) {
    typedFilter += key.toLowerCase();
    applyFilter();

    if (filteredHints.length === 1) {
      const target = filteredHints[0];
      deactivateHintMode();
      if (onSelect) onSelect(target.element);
    } else if (filteredHints.length === 0) {
      flashNoMatch();
      typedFilter = '';
      filteredHints = [...allHints];
      updateVisuals();
      updateModal();
    }

    return true;
  }

  return true;
}

export function destroyHintMode(): void {
  deactivateHintMode();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    labelsContainer = null;
    modalEl = null;
  }
}

function applyFilter(): void {
  filteredHints = allHints.filter((h) => h.label.startsWith(typedFilter));
  updateVisuals();
  updateModal();
}

function updateVisuals(): void {
  for (const hint of allHints) {
    if (hint.label.startsWith(typedFilter)) {
      hint.labelEl.classList.remove('dimmed');
    } else {
      hint.labelEl.classList.add('dimmed');
    }
  }
}

function updateModal(): void {
  if (!modalEl) return;
  const typedSpan = modalEl.querySelector('.hint-typed');
  if (typedSpan) {
    typedSpan.textContent = typedFilter || '';
  }
}

function flashNoMatch(): void {
  if (!modalEl) return;
  modalEl.classList.add('flash-error');
  setTimeout(() => {
    if (modalEl) modalEl.classList.remove('flash-error');
  }, 300);
}

function generateLabels(count: number): string[] {
  if (count <= HINT_CHARS.length) return HINT_CHARS.slice(0, count);

  const labels: string[] = [];
  let depth = 1;
  while (labels.length < count && depth <= 5) {
    addLabelsOfLength(depth, count, labels);
    depth++;
  }
  return labels;
}

function addLabelsOfLength(len: number, max: number, out: string[]): void {
  const generate = (prefix: string, remaining: number): void => {
    if (out.length >= max) return;
    if (remaining === 0) {
      out.push(prefix);
      return;
    }
    for (const c of HINT_CHARS) {
      if (out.length >= max) return;
      generate(prefix + c, remaining - 1);
    }
  };
  generate('', len);
}

function getHintStyles(): string {
  return `
    .labels-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
    }

    .hint-label {
      position: fixed;
      padding: 2px 4px;
      background: rgba(15, 15, 30, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: white;
      font: bold 10px/1 monospace;
      border-radius: 4px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      z-index: 1;
      white-space: nowrap;
      transition: opacity 0.2s ease;
    }

    .hint-label.dimmed {
      opacity: 0.2;
    }

    .hint-modal {
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a2e;
      border: 1px solid #3a3a5a;
      border-radius: 12px;
      padding: 10px 20px;
      text-align: center;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .hint-modal.hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.9);
      pointer-events: none;
    }

    .hint-modal.flash-error {
      border-color: #ff6b6b;
      box-shadow: 0 0 12px rgba(255, 107, 107, 0.3);
    }

    .hint-input {
      font: 16px monospace;
      color: #e4e4ef;
      letter-spacing: 3px;
      min-height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hint-typed {
      color: #fff;
    }

    .hint-cursor {
      color: ${AURA_COLOR};
      animation: blink 1s step-end infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .hint-help {
      font-size: 11px;
      color: #6a6a8a;
      margin-top: 6px;
    }
  `;
}
