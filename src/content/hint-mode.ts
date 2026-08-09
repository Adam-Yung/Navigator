import { AURA_COLOR } from '../shared/constants';
import { buildComboString } from '../shared/keys';
import type { IndexedElement, Settings } from '../shared/types';
import { hide as hideAura, transitionTo } from './aura-ring';
import { pushFocus } from './focus-history';
import { revealElement } from './hover-manager';
import { registerKeyHandler } from './key-handler';
import { scanVisibleElements } from './mutation-observer';

const HINT_CHARS = 'asdfghjklqwertyuiopzxcvbnm'.split('');

type PickerPhase = 'inactive' | 'zone-select' | 'zone-zoomed';
let phase: PickerPhase = 'inactive';
let activeZone = -1;

const ZONE_KEYS = ['a', 's', 'd', 'f', 'g', 'h'];
const ZONE_COLS = 3;
const ZONE_ROWS = 2;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let modalEl: HTMLElement | null = null;
let labelsContainer: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
let typedFilter = '';
let allHints: HintEntry[] = [];
let filteredHints: HintEntry[] = [];
let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;
let lastPickedElement: HTMLElement | null = null;

let multiSelected: Set<HintEntry> = new Set();
let badgeEl: HTMLElement | null = null;
let dimOverlay: HTMLElement | null = null;
let zoneMarkersContainer: HTMLElement | null = null;
let miniMapEl: HTMLElement | null = null;
let vignetteEl: HTMLElement | null = null;

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

  dimOverlay = document.createElement('div');
  dimOverlay.className = 'dim-overlay hidden';
  shadow.appendChild(dimOverlay);

  vignetteEl = document.createElement('div');
  vignetteEl.className = 'vignette hidden';
  shadow.appendChild(vignetteEl);

  zoneMarkersContainer = document.createElement('div');
  zoneMarkersContainer.className = 'zone-markers-container hidden';
  shadow.appendChild(zoneMarkersContainer);

  labelsContainer = document.createElement('div');
  labelsContainer.className = 'labels-container';
  shadow.appendChild(labelsContainer);

  miniMapEl = document.createElement('div');
  miniMapEl.className = 'mini-map hidden';
  for (let i = 0; i < 6; i++) {
    const cell = document.createElement('div');
    cell.className = 'mm-cell';
    cell.dataset.zone = String(i);
    miniMapEl.appendChild(cell);
  }
  shadow.appendChild(miniMapEl);

  modalEl = document.createElement('div');
  modalEl.className = 'hint-modal hidden';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-label', 'Element picker');
  modalEl.innerHTML = `
    <div class="hint-input" aria-live="polite"><span class="hint-typed"></span><span class="hint-cursor">|</span></div>
    <div class="hint-count"></div>
    <div class="hint-preview"></div>
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

export function activateHintMode(
  _elements: IndexedElement[],
  _selectCb: (element: IndexedElement) => void,
  _cancelCb: () => void,
): void {
  startZoneSelection();
}

export function deactivateHintMode(): void {
  exitPicker();
}

export function isHintModeActive(): boolean {
  return phase !== 'inactive';
}

export function getFilteredElements(): IndexedElement[] {
  return filteredHints.map((h) => h.element);
}

export function getLastPickedElement(): HTMLElement | null {
  return lastPickedElement;
}

export function destroyHintMode(): void {
  exitPicker();
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    labelsContainer = null;
    modalEl = null;
    badgeEl = null;
    dimOverlay = null;
    zoneMarkersContainer = null;
    miniMapEl = null;
    vignetteEl = null;
  }
  if (unregisterKey) unregisterKey();
}

// === Key Handler ===

function handlePickerKeydown(e: KeyboardEvent): boolean {
  if (!settings) return false;

  if (phase === 'inactive') {
    const combo = buildComboString(e);
    if (combo === settings.keybindings.picker) {
      startZoneSelection();
      return true;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[0-9]$/.test(e.code)) {
      const digit = parseInt(e.code.replace('Digit', ''), 10);
      const idx = digit === 0 ? 9 : digit - 1;
      activateQuickPick(idx);
      return true;
    }
    return false;
  }

  if (phase === 'zone-select') {
    if (e.key === 'Escape') {
      exitPicker();
      return true;
    }
    const zoneIdx = ZONE_KEYS.indexOf(e.key.toLowerCase());
    if (zoneIdx !== -1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      zoomIntoZone(zoneIdx);
      return true;
    }
    return true;
  }

  if (phase === 'zone-zoomed') {
    if (e.key === 'Escape') {
      if (multiSelected.size > 0) {
        clearMultiSelection();
        return true;
      }
      zoomOut();
      return true;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const direction = getNavDirection(e);
      if (direction) {
        navigateZone(direction);
        return true;
      }
    }

    if (ZONE_KEYS[activeZone] === e.key.toLowerCase() && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      zoomOut();
      return true;
    }

    if (e.key === 'Enter') {
      if (multiSelected.size > 0) {
        const targets = [...multiSelected];
        exitPicker();
        executeBatchAction(targets.map((h) => h.element));
      } else if (filteredHints.length > 0) {
        const target = filteredHints[0];
        const newTab = e.shiftKey;
        exitPicker();
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
      const num = e.key === '0' ? 10 : parseInt(e.key, 10);
      const idx = num - 1;
      if (idx < filteredHints.length) {
        const target = filteredHints[idx];
        if (e.shiftKey) {
          toggleMultiSelect(target);
        } else {
          exitPicker();
          activateTarget(target.element, false);
        }
      }
      return true;
    }

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
        exitPicker();
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
  }

  return true;
}

// === Zone Selection ===

function startZoneSelection(): void {
  if (!labelsContainer || !modalEl) return;

  const scope = getPickerScope();
  if (scope) {
    activateDirectLabeling(scope);
    return;
  }

  phase = 'zone-select';
  activeZone = -1;

  if (dimOverlay) dimOverlay.classList.remove('hidden');
  showZoneMarkers();
  showMiniMap();
  updateMiniMap(-1);
}

function activateDirectLabeling(scope: HTMLElement | null): void {
  phase = 'zone-zoomed';
  activeZone = -1;
  if (dimOverlay) dimOverlay.classList.remove('hidden');
  showMiniMap();
  renderLabelsForScope(scope);
  if (modalEl) modalEl.classList.remove('hidden');
  updateModal();
}

// === Zone Markers ===

function showZoneMarkers(): void {
  if (!zoneMarkersContainer) return;
  zoneMarkersContainer.innerHTML = '';
  zoneMarkersContainer.classList.remove('hidden');

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const zoneW = vw / ZONE_COLS;
  const zoneH = vh / ZONE_ROWS;

  for (let i = 0; i < 6; i++) {
    const col = i % ZONE_COLS;
    const row = Math.floor(i / ZONE_COLS);
    const marker = document.createElement('div');
    marker.className = 'zone-marker';
    marker.textContent = ZONE_KEYS[i].toUpperCase();
    marker.style.left = `${col * zoneW + zoneW / 2 - 24}px`;
    marker.style.top = `${row * zoneH + zoneH / 2 - 24}px`;
    zoneMarkersContainer.appendChild(marker);
  }
}

function hideZoneMarkers(): void {
  if (zoneMarkersContainer) {
    zoneMarkersContainer.classList.add('hidden');
    zoneMarkersContainer.innerHTML = '';
  }
}

// === Mini-map ===

function showMiniMap(): void {
  if (miniMapEl) miniMapEl.classList.remove('hidden');
}

function hideMiniMap(): void {
  if (miniMapEl) miniMapEl.classList.add('hidden');
}

function updateMiniMap(zoneIdx: number): void {
  if (!miniMapEl) return;
  const cells = miniMapEl.querySelectorAll('.mm-cell');
  cells.forEach((cell, i) => {
    if (i === zoneIdx) {
      cell.classList.add('active');
    } else {
      cell.classList.remove('active');
    }
  });
}

// === Vignette ===

function showVignette(): void {
  if (vignetteEl) vignetteEl.classList.remove('hidden');
}

function hideVignette(): void {
  if (vignetteEl) vignetteEl.classList.add('hidden');
}

// === Zoom Mechanics ===

function zoomIntoZone(zoneIdx: number): void {
  activeZone = zoneIdx;
  phase = 'zone-zoomed';

  const col = zoneIdx % ZONE_COLS;
  const row = Math.floor(zoneIdx / ZONE_COLS);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const zoneW = vw / ZONE_COLS;
  const zoneH = vh / ZONE_ROWS;

  const originX = ((col * zoneW + zoneW / 2) / vw) * 100;
  const originY = ((row * zoneH + zoneH / 2) / vh) * 100;

  document.documentElement.style.transformOrigin = `${originX}% ${originY}%`;
  document.documentElement.style.transition = 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)';
  document.documentElement.style.transform = 'scale(1.4)';
  document.documentElement.style.overflow = 'hidden';

  hideZoneMarkers();
  if (dimOverlay) dimOverlay.classList.add('hidden');
  showVignette();
  updateMiniMap(zoneIdx);

  setTimeout(() => {
    renderZoneLabels();
    if (modalEl) modalEl.classList.remove('hidden');
    updateModal();
  }, 260);
}

function zoomOut(): void {
  phase = 'zone-select';
  activeZone = -1;

  document.documentElement.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
  document.documentElement.style.transform = '';

  setTimeout(() => {
    document.documentElement.style.transformOrigin = '';
    document.documentElement.style.transition = '';
    document.documentElement.style.overflow = '';
  }, 210);

  if (labelsContainer) labelsContainer.innerHTML = '';
  allHints = [];
  filteredHints = [];
  typedFilter = '';
  multiSelected = new Set();
  hideVignette();
  if (dimOverlay) dimOverlay.classList.remove('hidden');
  if (modalEl) modalEl.classList.add('hidden');
  if (badgeEl) badgeEl.classList.add('hidden');
  updateMiniMap(-1);
  showZoneMarkers();
  hideTooltip();
  updateModal();
}

function exitPicker(): void {
  phase = 'inactive';
  activeZone = -1;

  document.documentElement.style.transform = '';
  document.documentElement.style.transformOrigin = '';
  document.documentElement.style.transition = '';
  document.documentElement.style.overflow = '';

  if (labelsContainer) labelsContainer.innerHTML = '';
  if (modalEl) modalEl.classList.add('hidden');
  if (badgeEl) badgeEl.classList.add('hidden');
  allHints = [];
  filteredHints = [];
  typedFilter = '';
  multiSelected = new Set();
  hideZoneMarkers();
  hideVignette();
  hideMiniMap();
  hideAura();
  hideTooltip();
  if (dimOverlay) dimOverlay.classList.add('hidden');
}

// === Zone Navigation ===

function getNavDirection(e: KeyboardEvent): string | null {
  if (e.key === 'h' || e.key === 'ArrowLeft') return 'left';
  if (e.key === 'l' || e.key === 'ArrowRight') return 'right';
  if (e.key === 'k' || e.key === 'ArrowUp') return 'up';
  if (e.key === 'j' || e.key === 'ArrowDown') return 'down';
  return null;
}

function navigateZone(direction: string): void {
  const col = activeZone % ZONE_COLS;
  const row = Math.floor(activeZone / ZONE_COLS);

  let newCol = col;
  let newRow = row;
  if (direction === 'left') newCol = Math.max(0, col - 1);
  if (direction === 'right') newCol = Math.min(ZONE_COLS - 1, col + 1);
  if (direction === 'up') newRow = Math.max(0, row - 1);
  if (direction === 'down') newRow = Math.min(ZONE_ROWS - 1, row + 1);

  const newZone = newRow * ZONE_COLS + newCol;
  if (newZone === activeZone) return;

  if (labelsContainer) labelsContainer.innerHTML = '';
  allHints = [];
  filteredHints = [];
  typedFilter = '';
  multiSelected = new Set();

  zoomIntoZone(newZone);
}

// === Label Rendering ===

function renderZoneLabels(): void {
  renderLabelsForScope(null);
}

function renderLabelsForScope(scope: HTMLElement | null): void {
  if (!labelsContainer || !modalEl) return;

  let elements = scanViewportElements(scope);
  if (elements.length === 0 && scope !== null) {
    elements = scanViewportElements(null);
  }
  if (elements.length === 0) return;

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

    const semanticClass = getSemanticClass(entry.el);
    if (semanticClass) labelEl.classList.add(semanticClass);

    labelsContainer.appendChild(labelEl);
    allHints.push({ label, element: entry, labelEl, index: i });
  }

  const MAX_VISIBLE_LABELS = 30;
  if (allHints.length > MAX_VISIBLE_LABELS) {
    for (let i = MAX_VISIBLE_LABELS; i < allHints.length; i++) {
      allHints[i].labelEl.classList.add('capped');
    }
  }

  resolveOverlaps(allHints);

  filteredHints = [...allHints];

  const vcx = window.innerWidth / 2;
  const vcy = window.innerHeight / 2;
  const maxDist = Math.sqrt(vcx * vcx + vcy * vcy);

  for (const hint of allHints) {
    const rect = hint.element.el.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - vcx;
    const dy = rect.top + rect.height / 2 - vcy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delay = (dist / maxDist) * 120;
    hint.labelEl.style.transitionDelay = `${delay}ms`;
    hint.labelEl.classList.add('entering');

    const opacity = dist < 300 ? 1 : dist < 600 ? 0.7 : 0.4;
    hint.labelEl.style.setProperty('--hint-opacity', String(opacity));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hint.labelEl.classList.remove('entering');
      });
    });
  }

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

  const candidates = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');

  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.1) continue;
    if (style.position !== 'fixed' && style.position !== 'absolute') continue;

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    const zIndex = parseInt(style.zIndex, 10) || 0;
    if (area > vpArea * 0.1 && area < vpArea * 0.95 && zIndex > 100) {
      return el;
    }
  }

  return null;
}

// === Target Activation ===

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

// === Multi-select ===

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

// === Quick-pick ===

function activateQuickPick(idx: number): void {
  const elements = scanVisibleElements();
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const scored = elements.map((el) => {
    const rect = el.el.getBoundingClientRect();
    const inViewport = rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
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

// === Utility Functions ===

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
      hint.labelEl.classList.add('filter-visible');
      if (typedFilter.length > 0) {
        const matched = hint.label.slice(0, typedFilter.length);
        const rest = hint.label.slice(typedFilter.length);
        textEl.innerHTML = `<span class="matched">${matched}</span>${rest}`;
      } else {
        textEl.textContent = hint.label;
      }
    } else {
      hint.labelEl.classList.add('dimmed');
      hint.labelEl.classList.remove('filter-visible');
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
  const countEl = modalEl.querySelector('.hint-count');
  if (countEl) {
    if (allHints.length > 30) {
      countEl.textContent = `${filteredHints.length} of ${allHints.length} elements`;
    } else {
      countEl.textContent = '';
    }
  }
  const previewEl = modalEl.querySelector('.hint-preview');
  if (previewEl) {
    if (typedFilter.length > 0 && filteredHints.length > 0) {
      const previews = filteredHints.slice(0, 3).map((h) => {
        const name = getElementName(h.element.el);
        return `<span class="preview-item"><span class="preview-key">${h.label}</span> ${escapeHtml(name)}</span>`;
      });
      previewEl.innerHTML = previews.join('<span class="preview-sep">\u00b7</span>');
    } else {
      previewEl.innerHTML = '';
    }
  }
}

function updateRingPosition(): void {
  hideTooltip();
  if (filteredHints.length > 0) {
    const first = filteredHints[0];
    transitionTo(first.element);
    revealElement(first.element.el);
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
    if (!tooltipEl || phase === 'inactive') return;
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
    if (href) return href.length > 50 ? `${href.slice(0, 47)}...` : href;
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

function getElementName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.slice(0, 25);
  const text = el.textContent?.trim();
  if (text && text.length <= 25) return text;
  if (text) return `${text.slice(0, 22)}...`;
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).placeholder || 'input';
  return el.tagName.toLowerCase();
}

function getSemanticClass(el: HTMLElement): string {
  const tag = el.tagName;
  if (tag === 'A') return 'hint-link';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'hint-input-field';
  if (el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'searchbox') return 'hint-input-field';
  const type = (el as HTMLInputElement).type?.toLowerCase?.();
  if (
    type === 'checkbox' ||
    type === 'radio' ||
    el.getAttribute('role') === 'checkbox' ||
    el.getAttribute('role') === 'radio' ||
    el.getAttribute('role') === 'switch'
  )
    return 'hint-toggle';
  return 'hint-button';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// === Styles ===

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
      opacity: var(--hint-opacity, 1);
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
      z-index: 5;
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
      z-index: 6;
      transition: opacity 100ms ease;
    }

    .multi-badge.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .hint-label.capped {
      display: none;
    }
    .hint-label.capped.filter-visible {
      display: inline-flex;
    }

    .hint-count {
      font: 10px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #7a7a9a;
      margin-top: 4px;
    }

    .dim-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.15);
      pointer-events: none;
      transition: opacity 150ms ease;
      z-index: 0;
    }
    .dim-overlay.hidden {
      opacity: 0;
    }

    .hint-label.hint-link {
      border-color: rgba(96, 165, 250, 0.4);
    }
    .hint-label.hint-input-field {
      border-color: rgba(74, 222, 128, 0.4);
    }
    .hint-label.hint-toggle {
      border-color: rgba(251, 191, 36, 0.4);
    }
    .hint-label.hint-button {
      border-color: rgba(100, 80, 255, 0.35);
    }

    .hint-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin-top: 6px;
      font: 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #9999b8;
      min-height: 16px;
      flex-wrap: wrap;
    }
    .preview-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background: rgba(100, 80, 255, 0.08);
      border-radius: 4px;
      white-space: nowrap;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-key {
      font-family: ui-monospace, 'SF Mono', monospace;
      font-weight: 700;
      color: hsl(250, 80%, 65%);
      font-size: 10px;
    }
    .preview-sep {
      color: #5a5a7a;
      margin: 0 2px;
    }

    /* Zone markers */
    .zone-marker {
      position: fixed;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(50, 45, 80, 0.9) 0%, rgba(30, 28, 55, 0.95) 100%);
      border: 2px solid rgba(120, 100, 255, 0.35);
      border-radius: 10px;
      font: 700 20px ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
      color: #e4e4ef;
      box-shadow: 0 2px 0 2px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 0 20px rgba(100, 80, 255, 0.1);
      text-shadow: 0 0 8px rgba(100, 80, 255, 0.4);
      z-index: 2;
      animation: zone-marker-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
      pointer-events: none;
    }

    @keyframes zone-marker-in {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .zone-markers-container {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }

    .zone-markers-container.hidden {
      display: none;
    }

    /* Mini-map */
    .mini-map {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 72px;
      height: 48px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 2px;
      background: rgba(15, 15, 30, 0.9);
      border: 1px solid rgba(100, 80, 255, 0.2);
      border-radius: 6px;
      padding: 3px;
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 4;
      transition: opacity 150ms ease;
    }

    .mini-map.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .mm-cell {
      border-radius: 2px;
      background: rgba(100, 80, 255, 0.1);
      border: 1px solid rgba(100, 80, 255, 0.15);
      transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .mm-cell.active {
      background: rgba(100, 80, 255, 0.5);
      border-color: hsl(250, 80%, 65%);
      box-shadow: 0 0 6px rgba(100, 80, 255, 0.4);
    }

    /* Vignette */
    .vignette {
      position: fixed;
      inset: 0;
      background: radial-gradient(
        ellipse 75% 75% at center,
        transparent 45%,
        rgba(0, 0, 0, 0.35) 100%
      );
      pointer-events: none;
      z-index: 1;
      transition: opacity 200ms ease;
    }

    .vignette.hidden {
      opacity: 0;
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
      .zone-marker {
        animation: none;
      }
    }
  `;
}
