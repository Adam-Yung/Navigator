import { AURA_COLOR } from '../shared/constants';
import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { transitionTo, hide as hideAura } from './aura-ring';
import { pushFocus } from './focus-history';
import { revealElement } from './hover-manager';
import { registerKeyHandler } from './key-handler';
import { scanVisibleElements } from './mutation-observer';

const HINT_CHARS = 'asdfghjklqwertyuiopzxcvbnm'.split('');

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let modalEl: HTMLElement | null = null;
let labelsContainer: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
let active = false;
let typedFilter = '';
let allHints: HintEntry[] = [];
let filteredHints: HintEntry[] = [];
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let lastPickedElement: HTMLElement | null = null;

interface HintEntry {
  label: string;
  element: IndexedElement;
  labelEl: HTMLElement;
  index: number;
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
  modalEl.setAttribute('aria-label', 'Element picker');
  modalEl.innerHTML = `
    <div class="hint-input" aria-live="polite"><span class="hint-typed"></span><span class="hint-cursor">|</span></div>
    <div class="hint-help">Type to filter \u2022 Enter to select \u2022 Shift+Enter new tab \u2022 Esc to cancel</div>
  `;
  shadow.appendChild(modalEl);

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'hint-tooltip hidden';
  shadow.appendChild(tooltipEl);

  document.documentElement.appendChild(host);
}

export function initPickerKeybinding(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKey = registerKeyHandler(handlePickerKeydown);
}

export function updatePickerSettings(newSettings: Settings): void {
  settings = newSettings;
}

function handlePickerKeydown(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (!active) {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.picker) {
      activatePicker();
      return true;
    }
    return false;
  }

  if (e.key === 'Escape') {
    deactivateHintMode();
    return true;
  }

  if (e.key === 'Enter') {
    if (filteredHints.length > 0) {
      const target = filteredHints[0];
      const newTab = e.shiftKey;
      deactivateHintMode();
      activateTarget(target.element, newTab);
    }
    return true;
  }

  if (e.key === 'Backspace') {
    if (typedFilter.length > 0) {
      typedFilter = typedFilter.slice(0, -1);
      applyFilter();
    }
    return true;
  }

  if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(e.key)) {
    const num = e.key === '0' ? 10 : parseInt(e.key);
    const idx = num - 1;
    if (idx < filteredHints.length) {
      const target = filteredHints[idx];
      const newTab = e.shiftKey;
      deactivateHintMode();
      activateTarget(target.element, newTab);
    }
    return true;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    typedFilter += e.key.toLowerCase();
    applyFilter();

    if (filteredHints.length === 1) {
      const target = filteredHints[0];
      deactivateHintMode();
      activateTarget(target.element, false);
    } else if (filteredHints.length === 0) {
      flashNoMatch();
      typedFilter = '';
      filteredHints = [...allHints];
      updateVisuals();
      updateModal();
      updateRingPosition();
    }

    return true;
  }

  return true;
}

function activatePicker(): void {
  if (!labelsContainer || !modalEl) return;

  const scope = getPickerScope();
  const elements = scanViewportElements(scope);
  if (elements.length === 0) return;

  active = true;
  typedFilter = '';

  const labels = generateLabels(elements.length);
  allHints = [];
  labelsContainer.innerHTML = '';

  for (let i = 0; i < elements.length; i++) {
    const entry = elements[i];
    const label = labels[i];
    const labelEl = document.createElement('span');
    labelEl.className = 'hint-label';

    if (i < 10) {
      const numBadge = document.createElement('span');
      numBadge.className = 'hint-number';
      numBadge.textContent = i < 9 ? String(i + 1) : '0';
      labelEl.appendChild(numBadge);
    }

    const textNode = document.createElement('span');
    textNode.className = 'hint-text';
    textNode.textContent = label;
    labelEl.appendChild(textNode);

    const rect = entry.el.getBoundingClientRect();
    labelEl.style.top = `${rect.top - 4}px`;
    labelEl.style.left = `${rect.left - 2}px`;

    labelsContainer.appendChild(labelEl);
    allHints.push({ label, element: entry, labelEl, index: i });
  }

  filteredHints = [...allHints];

  const vcx = window.innerWidth / 2;
  const vcy = window.innerHeight / 2;
  const maxDist = Math.sqrt(vcx * vcx + vcy * vcy);

  for (const hint of allHints) {
    const rect = hint.element.el.getBoundingClientRect();
    const dx = rect.left - vcx;
    const dy = rect.top - vcy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delay = (dist / maxDist) * 120;
    hint.labelEl.style.transitionDelay = `${delay}ms`;
    hint.labelEl.classList.add('entering');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hint.labelEl.classList.remove('entering');
      });
    });
  }

  modalEl.classList.remove('hidden');
  updateModal();
  updateRingPosition();
}

function scanViewportElements(scope: HTMLElement | null): IndexedElement[] {
  const allElements = scanVisibleElements();
  if (!scope || scope === document.body) return allElements;

  return allElements.filter((indexed) => scope.contains(indexed.el));
}

function getPickerScope(): HTMLElement | null {
  const dialog = document.querySelector('dialog[open]') as HTMLElement | null;
  if (dialog) return dialog;

  const ariaModal = document.querySelector('[aria-modal="true"]:not([hidden])') as HTMLElement | null;
  if (ariaModal) return ariaModal;

  const popover = document.querySelector('[popover]:popover-open') as HTMLElement | null;
  if (popover) return popover;

  const centerstage = detectCenterstage();
  if (centerstage) return centerstage;

  return null;
}

function detectCenterstage(): HTMLElement | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vpArea = vw * vh;

  const candidates = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], .modal, .dialog, [class*="modal"], [class*="dialog"], [class*="overlay"]'
  );

  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.1) continue;

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > vpArea * 0.2 && parseInt(style.zIndex) > 100) {
      return el;
    }
  }

  return null;
}

export function activateHintMode(
  _elements: IndexedElement[],
  _selectCb: (element: IndexedElement) => void,
  _cancelCb: () => void,
): void {
  activatePicker();
}

export function deactivateHintMode(): void {
  active = false;
  typedFilter = '';
  allHints = [];
  filteredHints = [];
  hideTooltip();

  if (labelsContainer) labelsContainer.innerHTML = '';
  if (modalEl) modalEl.classList.add('hidden');
  hideAura();
}

export function isHintModeActive(): boolean {
  return active;
}

export function getFilteredElements(): IndexedElement[] {
  return filteredHints.map((h) => h.element);
}

export function getLastPickedElement(): HTMLElement | null {
  return lastPickedElement;
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
  if (unregisterKey) unregisterKey();
}

function activateTarget(indexed: IndexedElement, newTab: boolean): void {
  lastPickedElement = indexed.el;
  pushFocus(indexed.el);
  revealElement(indexed.el);

  if (newTab) {
    if (indexed.el.tagName === 'A') {
      const href = (indexed.el as HTMLAnchorElement).href;
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
    indexed.el.dispatchEvent(clickEvent);
  } else {
    const isEditable = isEditableElement(indexed.el);
    if (isEditable) {
      indexed.el.focus();
    } else {
      indexed.el.click();
    }
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

function applyFilter(): void {
  filteredHints = allHints.filter((h) => h.label.startsWith(typedFilter));
  updateVisuals();
  updateModal();
  updateRingPosition();
}

function updateVisuals(): void {
  for (const hint of allHints) {
    const textEl = hint.labelEl.querySelector('.hint-text');
    if (!textEl) continue;

    if (hint.label.startsWith(typedFilter)) {
      hint.labelEl.classList.remove('dimmed');
      if (typedFilter.length > 0) {
        const matched = hint.label.slice(0, typedFilter.length);
        const rest = hint.label.slice(typedFilter.length);
        textEl.innerHTML = `<span class="matched">${matched}</span>${rest}`;
      } else {
        textEl.textContent = hint.label;
      }
    } else {
      hint.labelEl.classList.add('dimmed');
      textEl.textContent = hint.label;
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

function updateRingPosition(): void {
  hideTooltip();
  if (filteredHints.length > 0) {
    const first = filteredHints[0];
    transitionTo(first.element);
    revealElement(first.element.el);
    scrollToRevealIfNeeded(first.element.el);
    showTooltipForElement(first.element.el);
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

function scrollToRevealIfNeeded(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const padding = 20;

  const clipTop = Math.max(0, -rect.top);
  const clipBottom = Math.max(0, rect.bottom - vh);
  const clipLeft = Math.max(0, -rect.left);
  const clipRight = Math.max(0, rect.right - vw);

  const height = rect.height || 1;
  const width = rect.width || 1;
  const verticalClip = (clipTop + clipBottom) / height;
  const horizontalClip = (clipLeft + clipRight) / width;

  if (verticalClip > 0.3) {
    const scrollY = clipTop > 0 ? -(clipTop + padding) : clipBottom + padding;
    window.scrollBy({ top: scrollY, behavior: 'smooth' });
  }
  if (horizontalClip > 0.3) {
    const scrollX = clipLeft > 0 ? -(clipLeft + padding) : clipRight + padding;
    window.scrollBy({ left: scrollX, behavior: 'smooth' });
  }
}

function showTooltipForElement(el: HTMLElement): void {
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => {
    if (!tooltipEl || !active) return;
    const text = getTooltipText(el);
    if (!text) return;

    const rect = el.getBoundingClientRect();
    tooltipEl.textContent = text;
    tooltipEl.style.top = `${rect.bottom + 8}px`;
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.classList.remove('hidden');
  }, 300);
}

function hideTooltip(): void {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  if (tooltipEl) tooltipEl.classList.add('hidden');
}

function getTooltipText(el: HTMLElement): string | null {
  if (el.tagName === 'A') {
    const href = (el as HTMLAnchorElement).href;
    if (href) return href.length > 50 ? href.slice(0, 47) + '...' : href;
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  if (el.tagName === 'INPUT') {
    return (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || null;
  }
  if (el.tagName === 'BUTTON') {
    const text = el.textContent?.trim();
    if (text && text.length < 40) return text;
  }
  return null;
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
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 5px;
      background: rgba(15, 15, 30, 0.92);
      border: 1px solid rgba(100, 80, 255, 0.25);
      color: #e4e4ef;
      font: bold 10px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 1px rgba(100, 80, 255, 0.2);
      z-index: 1;
      white-space: nowrap;
      transition: opacity 80ms ease, transform 80ms ease;
      backdrop-filter: blur(8px);
    }

    .hint-label.dimmed {
      opacity: 0.15;
      transform: scale(0.9);
    }

    .hint-label.entering {
      opacity: 0;
      transform: scale(0.8);
    }

    .matched {
      color: #fff;
      text-shadow: 0 0 6px hsla(250, 80%, 65%, 0.6);
    }

    .hint-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 14px;
      height: 14px;
      padding: 0 3px;
      background: hsla(250, 80%, 65%, 0.25);
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      color: ${AURA_COLOR};
    }

    .hint-text {
      color: #fff;
    }

    .hint-modal {
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%) scale(1);
      background: rgba(15, 15, 30, 0.94);
      border: 1px solid rgba(100, 80, 255, 0.2);
      border-radius: 12px;
      padding: 12px 24px;
      text-align: center;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(100, 80, 255, 0.3);
      transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .hint-modal.hidden {
      opacity: 0;
      transform: translateX(-50%) scale(0.95);
      pointer-events: none;
    }

    .hint-modal.flash-error {
      border-color: #ff6b6b;
      box-shadow: 0 0 12px rgba(255, 107, 107, 0.3);
    }

    .hint-input {
      font: 16px ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
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
      font: 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #6a6a8a;
      margin-top: 8px;
    }

    .hint-tooltip {
      position: fixed;
      transform: translateX(-50%);
      padding: 4px 10px;
      background: rgba(15, 15, 30, 0.94);
      border: 1px solid rgba(100, 80, 255, 0.15);
      border-radius: 6px;
      backdrop-filter: blur(12px);
      color: #8888a8;
      font: 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: opacity 100ms ease;
      z-index: 2;
    }

    .hint-tooltip.hidden {
      opacity: 0;
      pointer-events: none;
    }
  `;
}
