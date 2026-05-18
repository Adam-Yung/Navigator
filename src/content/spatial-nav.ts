import type { Mode, Direction, IndexedElement } from '../shared/types';
import { NAV_SELECTORS, EDIT_SELECTORS } from '../shared/constants';

export function scanElements(mode: Mode): IndexedElement[] {
  if (mode === 'normal') return [];

  const selector = mode === 'navigation' ? NAV_SELECTORS : EDIT_SELECTORS;
  const elements = document.querySelectorAll<HTMLElement>(selector);
  const result: IndexedElement[] = [];

  for (const el of elements) {
    if (!isVisible(el)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (!isInViewport(rect)) continue;

    result.push({
      el,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      rect,
    });
  }

  return result;
}

export function findNext(
  current: IndexedElement,
  candidates: IndexedElement[],
  direction: Direction,
  coneAngle: number
): IndexedElement | null {
  const refAngle = directionToAngle(direction);
  const filtered = candidates.filter(c => c.el !== current.el);

  if (filtered.length === 0) return null;

  let halfCone = coneAngle / 2;
  const maxHalfCone = 90;

  while (halfCone <= maxHalfCone) {
    const inCone = scoreInCone(current, filtered, refAngle, halfCone);
    if (inCone.length > 0) {
      inCone.sort((a, b) => a.score - b.score);
      return inCone[0].element;
    }
    halfCone += 15;
  }

  return null;
}

export function findNearestToViewportCenter(elements: IndexedElement[]): IndexedElement | null {
  if (elements.length === 0) return null;

  const vcx = window.innerWidth / 2;
  const vcy = window.innerHeight / 2;
  let nearest = elements[0];
  let minDist = distance(vcx, vcy, nearest.cx, nearest.cy);

  for (let i = 1; i < elements.length; i++) {
    const d = distance(vcx, vcy, elements[i].cx, elements[i].cy);
    if (d < minDist) {
      minDist = d;
      nearest = elements[i];
    }
  }

  return nearest;
}

interface ScoredCandidate {
  element: IndexedElement;
  score: number;
}

function scoreInCone(
  current: IndexedElement,
  candidates: IndexedElement[],
  refAngle: number,
  halfCone: number
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
      const penalty = 1 + (deviation / halfCone) * 0.5;
      result.push({ element: candidate, score: dist * penalty });
    }
  }

  return result;
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
  if (el.offsetParent === null && el.tagName !== 'BODY') {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') return false;
  }
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  return true;
}

function isInViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}
