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

// Multi-select state
let multiSelected: Set<HintEntry> = new Set();
let badgeEl: HTMLElement | null = null;


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

  badgeEl = document.createElement('div');
  badgeEl.className = 'multi-badge hidden';
  shadow.appendChild(badgeEl);

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

    // Alt+1-9 quick-pick when picker is NOT active
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[0-9]$/.test(e.code)) {
      const digit = parseInt(e.code.replace('Digit', ''));
      const idx = digit === 0 ? 9 : digit - 1;
      activateQuickPick(idx);
      return true;
    }

    return false;
  }

  // Picker is active from here on

  if (e.key === 'Escape') {
    if (multiSelected.size > 0) {
      clearMultiSelection();
      return true;
    }
    deactivateHintMode();
    return true;
  }

  if (e.key === 'Enter') {
    if (multiSelected.size > 0) {
      const targets = [...multiSelected];
      deactivateHintMode();
      executeBatchAction(targets.map((h) => h.element));
    } else if (filteredHints.length > 0) {
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
      if (e.shiftKey) {
        toggleMultiSelect(target);
      } else {
        const newTab = false;
        deactivateHintMode();
        activateTarget(target.element, newTab);
      }
    }
    return true;
  }

  // Shift+letter: toggle multi-select for matching hint
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    const letter = e.key.toLowerCase();
    const matchingHint = filteredHints.find((h) => h.label === typedFilter + letter);
    if (matchingHint) {
      toggleMultiSelect(matchingHint);
      return true;
    }
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
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
  let elements = scanViewportElements(scope);
  if (elements.length === 0 && scope !== null) {
    elements = scanViewportElements(null);
  }
  if (elements.length === 0) return;

  active = true;

  typedFilter = '';

  multiSelected = new Set();

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
    const isLarge = rect.width > 200 || rect.height > 100;
    if (isLarge) {
      labelEl.style.top = `${rect.top + rect.height / 2 - 10}px`;
      labelEl.style.left = `${rect.left + rect.width / 2 - 14}px`;
    } else {
      labelEl.style.top = `${rect.top - 4}px`;
      labelEl.style.left = `${rect.left - 2}px`;
    }

    labelsContainer.appendChild(labelEl);
    allHints.push({ label, element: entry, labelEl, index: i });
  }

  resolveOverlaps(allHints);

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
  updateMultiBadge();
}

function scanViewportElements(scope: HTMLElement | null): IndexedElement[] {
  const allElements = scanVisibleElements();
  if (!scope || scope === document.body) return allElements;

  return allElements.filter((indexed) => scope.contains(indexed.el));
}

function getPickerScope(): HTMLElement | null {
  const dialog = document.querySelector('dialog[open]') as HTMLElement | null;
  if (dialog && isMeaningfulScope(dialog)) return dialog;

  const ariaModal = document.querySelector('[aria-modal="true"]:not([hidden])') as HTMLElement | null;
  if (ariaModal && isMeaningfulScope(ariaModal)) return ariaModal;

  const popover = document.querySelector('[popover]:popover-open') as HTMLElement | null;
  if (popover && isMeaningfulScope(popover)) return popover;

  const centerstage = detectCenterstage();
  if (centerstage && isMeaningfulScope(centerstage)) return centerstage;

  return null;
}

function isMeaningfulScope(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  const vpArea = window.innerWidth * window.innerHeight;
  const area = rect.width * rect.height;
  if (area < vpArea * 0.05) return false;
  return true;
}

function detectCenterstage(): HTMLElement | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vpArea = vw * vh;

  const candidates = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"]'
  );

  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.1) continue;
    if (style.position !== 'fixed' && style.position !== 'absolute') continue;

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    const zIndex = parseInt(style.zIndex) || 0;
    if (area > vpArea * 0.1 && area < vpArea * 0.95 && zIndex > 100) {
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
  multiSelected = new Set();
  hideTooltip();

  if (labelsContainer) labelsContainer.innerHTML = '';
  if (modalEl) modalEl.classList.add('hidden');
  if (badgeEl) badgeEl.classList.add('hidden');
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
    badgeEl = null;
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

// --- Multi-select helpers ---

function toggleMultiSelect(hint: HintEntry): void {
  if (multiSelected.has(hint)) {
    multiSelected.delete(hint);
    hint.labelEl.classList.remove('multi-selected');
  } else {
    multiSelected.add(hint);
    hint.labelEl.classList.add('multi-selected');
  }
  updateMultiBadge();
}

function clearMultiSelection(): void {
  for (const hint of multiSelected) {
    hint.labelEl.classList.remove('multi-selected');
  }
  multiSelected = new Set();
  updateMultiBadge();
}

function updateMultiBadge(): void {
  if (!badgeEl) return;
  if (multiSelected.size > 0) {
    badgeEl.textContent = `${multiSelected.size} selected`;
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.classList.add('hidden');
  }
}

function executeBatchAction(elements: IndexedElement[]): void {
  const allLinks = elements.every((e) => e.el.tagName === 'A' && (e.el as HTMLAnchorElement).href);
  const allCheckboxes = elements.every(
    (e) =>
      (e.el.tagName === 'INPUT' && (e.el as HTMLInputElement).type === 'checkbox') ||
      e.el.getAttribute('role') === 'checkbox',
  );

  if (allLinks) {
    for (const indexed of elements) {
      const href = (indexed.el as HTMLAnchorElement).href;
      if (href) window.open(href, '_blank');
    }
  } else if (allCheckboxes) {
    for (const indexed of elements) {
      indexed.el.click();
    }
  } else {
    for (const indexed of elements) {
      indexed.el.click();
    }
  }

  if (elements.length > 0) {
    const last = elements[elements.length - 1];
    lastPickedElement = last.el;
    pushFocus(last.el);
    revealElement(last.el);
  }
}

// --- Quick-pick (Alt+1-9) ---

function activateQuickPick(idx: number): void {
  const elements = scanVisibleElements();
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const scored = elements.map((el) => {
    const rect = el.el.getBoundingClientRect();
    const inViewport =
      rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
    const area = rect.width * rect.height;
    return { el, inViewport, area };
  });

  scored.sort((a, b) => {
    if (a.inViewport !== b.inViewport) return a.inViewport ? -1 : 1;
    return b.area - a.area;
  });

  if (idx >= scored.length) return;

  const target = scored[idx].el;
  activateTarget(target, false);
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
  const inputEl = modalEl.querySelector('.hint-input');
  const origContent = inputEl?.innerHTML ?? '';
  if (inputEl) {
    inputEl.innerHTML = '<span style="color:#ff6b6b;font-size:13px;">No match</span>';
  }
  setTimeout(() => {
    if (modalEl) modalEl.classList.remove('flash-error');
    if (inputEl) inputEl.innerHTML = origContent;
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

function resolveOverlaps(hints: HintEntry[]): void {
  const LABEL_HEIGHT = 20;
  const LABEL_WIDTH = 28;
  const placed: Array<{ top: number; left: number; bottom: number; right: number }> = [];

  for (const hint of hints) {
    const top = parseFloat(hint.labelEl.style.top);
    const left = parseFloat(hint.labelEl.style.left);
    let finalTop = top;
    const finalLeft = left;

    for (const box of placed) {
      const overlapsH = finalLeft < box.right && finalLeft + LABEL_WIDTH > box.left;
      const overlapsV = finalTop < box.bottom && finalTop + LABEL_HEIGHT > box.top;
      if (overlapsH && overlapsV) {
        finalTop = box.bottom + 2;
      }
    }

    if (finalTop !== top) {
      hint.labelEl.style.top = `${finalTop}px`;
    }

    placed.push({
      top: finalTop,
      left: finalLeft,
      bottom: finalTop + LABEL_HEIGHT,
      right: finalLeft + LABEL_WIDTH,
    });
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

    .hint-label.multi-selected {
      border-color: ${AURA_COLOR};
      box-shadow: 0 0 8px rgba(100, 80, 255, 0.3);
    }

    .hint-label.multi-selected::after {
      content: '\u2713';
      position: absolute;
      top: -4px;
      right: -4px;
      width: 12px;
      height: 12px;
      background: ${AURA_COLOR};
      border-radius: 50%;
      font-size: 8px;
      line-height: 12px;
      text-align: center;
      color: #fff;
    }

    .multi-badge {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 12px;
      background: rgba(15, 15, 30, 0.94);
      border: 1px solid ${AURA_COLOR};
      border-radius: 999px;
      font: bold 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: ${AURA_COLOR};
      backdrop-filter: blur(12px);
      box-shadow: 0 0 12px rgba(100, 80, 255, 0.2);
      z-index: 3;
      transition: opacity 100ms ease;
    }

    .multi-badge.hidden {
      opacity: 0;
      pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .hint-label {
        transition: none;
      }
      .hint-label.entering {
        opacity: 1;
        transform: none;
      }
      .hint-modal {
        transition-duration: 50ms;
      }
    }
  `;
}
