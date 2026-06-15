import type { Mode, Direction, IndexedElement } from '../shared/types';
import { NAV_SELECTORS, EDIT_SELECTORS } from '../shared/constants';

const CONE_EXPANSION_STEP = 15;
const MAX_HALF_CONE = 90;
const DEVIATION_PENALTY_FACTOR = 0.5;
const LARGE_AREA_THRESHOLD = 2000;
const LARGE_AREA_PRIORITY = 0.9;
const INTERACTIVE_PRIORITY = 0.85;
const LANDMARK_PRIORITY = 0.9;

export function scanElements(mode: Mode): IndexedElement[] {
  if (mode === 'normal') return [];

  const selector = mode === 'navigation' ? NAV_SELECTORS : EDIT_SELECTORS;
  const result: IndexedElement[] = [];

  queryDocument(document, selector, result, 0, 0);
  scanIframes(selector, result);

  return result;
}

export function findNext(
  current: IndexedElement,
  candidates: IndexedElement[],
  direction: Direction,
  coneAngle: number,
  smartPrioritization: boolean = false
): IndexedElement | null {
  const refAngle = directionToAngle(direction);
  const filtered = candidates.filter(c => c.el !== current.el);

  if (filtered.length === 0) return null;

  let halfCone = coneAngle / 2;
  const maxHalfCone = MAX_HALF_CONE;

  while (halfCone <= maxHalfCone) {
    const inCone = scoreInCone(current, filtered, refAngle, halfCone, smartPrioritization);
    if (inCone.length > 0) {
      inCone.sort((a, b) => a.score - b.score);
      return inCone[0].element;
    }
    halfCone += CONE_EXPANSION_STEP;
  }

  return null;
}

export function findNearestToPoint(elements: IndexedElement[], x: number, y: number): IndexedElement | null {
  if (elements.length === 0) return null;

  let nearest = elements[0];
  let minDist = distance(x, y, nearest.cx, nearest.cy);

  for (let i = 1; i < elements.length; i++) {
    const d = distance(x, y, elements[i].cx, elements[i].cy);
    if (d < minDist) {
      minDist = d;
      nearest = elements[i];
    }
  }

  return nearest;
}

export function scanOffscreen(
  mode: Mode,
  direction: Direction,
  currentCx: number,
  currentCy: number
): IndexedElement | null {
  if (mode === 'normal') return null;

  const selector = mode === 'navigation' ? NAV_SELECTORS : EDIT_SELECTORS;
  const elements = document.querySelectorAll<HTMLElement>(selector);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let bestCandidate: IndexedElement | null = null;
  let bestScore = Infinity;
  const refAngle = directionToAngle(direction);

  for (const el of elements) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (isInViewport(rect)) continue;

    const offscreenLimit = direction === 'up' || direction === 'down' ? vh * 2 : vw * 2;
    if (rect.top > vh + offscreenLimit || rect.bottom < -offscreenLimit) continue;
    if (rect.left > vw + offscreenLimit || rect.right < -offscreenLimit) continue;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - currentCx;
    const dy = cy - currentCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const deviation = angleDifference(angle, refAngle);
    if (deviation > 90) continue;

    const score = dist * (1 + (deviation / MAX_HALF_CONE) * DEVIATION_PENALTY_FACTOR);
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = { el, cx, cy, rect };
    }
  }

  return bestCandidate;
}

interface ScoredCandidate {
  element: IndexedElement;
  score: number;
}

function queryDocument(
  doc: Document,
  selector: string,
  result: IndexedElement[],
  offsetX: number,
  offsetY: number
): void {
  const elements = doc.querySelectorAll<HTMLElement>(selector);
  for (const el of elements) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const adjustedLeft = rect.left + offsetX;
    const adjustedTop = rect.top + offsetY;

    if (!isInViewportAt(adjustedLeft, adjustedTop, rect.width, rect.height)) continue;

    result.push({
      el,
      cx: adjustedLeft + rect.width / 2,
      cy: adjustedTop + rect.height / 2,
      rect,
    });
  }
}

function scanIframes(selector: string, result: IndexedElement[]): void {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    let doc: Document;
    try {
      doc = (iframe as HTMLIFrameElement).contentDocument!;
      if (!doc) continue;
    } catch {
      continue;
    }
    const iframeRect = iframe.getBoundingClientRect();
    queryDocument(doc, selector, result, iframeRect.left, iframeRect.top);
  }
}

function scoreInCone(
  current: IndexedElement,
  candidates: IndexedElement[],
  refAngle: number,
  halfCone: number,
  smartPrioritization: boolean
): ScoredCandidate[] {
  const result: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const dx = candidate.cx - current.cx;
    const dy = candidate.cy - current.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) continue;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const deviation = angleDifference(angle, refAngle);

    if (deviation <= halfCone) {
      const penalty = 1 + (deviation / halfCone) * DEVIATION_PENALTY_FACTOR;
      const priority = smartPrioritization ? elementPriority(candidate.el, candidate.rect) : 1.0;
      result.push({ element: candidate, score: dist * penalty * priority });
    }
  }

  return result;
}

function elementPriority(el: HTMLElement, rect: DOMRect): number {
  const area = rect.width * rect.height;
  let priority = 1.0;
  if (area > LARGE_AREA_THRESHOLD) priority *= LARGE_AREA_PRIORITY;
  const tag = el.tagName;
  const role = el.getAttribute('role');
  if (tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link') priority *= INTERACTIVE_PRIORITY;
  if (el.closest('nav, main, [role="navigation"], [role="main"]')) priority *= LANDMARK_PRIORITY;
  return priority;
}

function directionToAngle(direction: Direction): number {
  switch (direction) {
    case 'right': return 0;
    case 'down': return 90;
    case 'left': return 180;
    case 'up': return -90;
  }
}

function angleDifference(a: number, b: number): number {
  let diff = ((a - b + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return Math.abs(diff);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function isVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  if (el.offsetParent !== null || el.tagName === 'BODY') {
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.opacity !== '0';
  }

  const style = getComputedStyle(el);
  if (style.position !== 'fixed' && style.position !== 'sticky') return false;
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function isInViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function isInViewportAt(left: number, top: number, width: number, height: number): boolean {
  return (
    top + height > 0 &&
    left + width > 0 &&
    top < window.innerHeight &&
    left < window.innerWidth
  );
}
