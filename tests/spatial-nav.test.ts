import { describe, it, expect } from 'vitest';
import { findNext, findNearestToPoint } from '../src/content/spatial-nav';
import type { IndexedElement } from '../src/shared/types';

function makeElement(cx: number, cy: number, tag = 'BUTTON'): IndexedElement {
  const el = document.createElement(tag);
  const rect = new DOMRect(cx - 25, cy - 12, 50, 24);
  return { el, cx, cy, rect };
}

describe('findNext', () => {
  it('finds element to the right', () => {
    const current = makeElement(100, 100);
    const right = makeElement(200, 100);
    const below = makeElement(100, 200);
    const result = findNext(current, [current, right, below], 'right', 90);
    expect(result).toBe(right);
  });

  it('finds element below', () => {
    const current = makeElement(100, 100);
    const right = makeElement(200, 100);
    const below = makeElement(100, 200);
    const result = findNext(current, [current, right, below], 'down', 90);
    expect(result).toBe(below);
  });

  it('finds element to the left', () => {
    const current = makeElement(200, 100);
    const left = makeElement(50, 100);
    const result = findNext(current, [current, left], 'left', 90);
    expect(result).toBe(left);
  });

  it('finds element above', () => {
    const current = makeElement(100, 200);
    const above = makeElement(100, 50);
    const result = findNext(current, [current, above], 'up', 90);
    expect(result).toBe(above);
  });

  it('returns null when no candidates in direction', () => {
    const current = makeElement(100, 100);
    const below = makeElement(100, 200);
    const result = findNext(current, [current, below], 'up', 90);
    expect(result).toBeNull();
  });

  it('prefers closer element in same direction', () => {
    const current = makeElement(100, 100);
    const near = makeElement(150, 100);
    const far = makeElement(300, 100);
    const result = findNext(current, [current, near, far], 'right', 90);
    expect(result).toBe(near);
  });

  it('uses cone angle to filter candidates', () => {
    const current = makeElement(100, 100);
    const slightRight = makeElement(200, 150);
    const result = findNext(current, [current, slightRight], 'right', 90);
    expect(result).toBe(slightRight);
  });

  it('widens cone to find elements when narrow cone misses', () => {
    const current = makeElement(100, 100);
    const diagonal = makeElement(200, 200);
    const result = findNext(current, [current, diagonal], 'right', 30);
    expect(result).toBe(diagonal);
  });

  it('excludes self from candidates', () => {
    const current = makeElement(100, 100);
    const result = findNext(current, [current], 'right', 90);
    expect(result).toBeNull();
  });

  it('applies smart prioritization to interactive elements', () => {
    const current = makeElement(100, 100);
    const link = makeElement(200, 110, 'A');
    const div = makeElement(200, 90);
    const result = findNext(current, [current, link, div], 'right', 90, true);
    expect(result).toBe(link);
  });
});

describe('findNearestToPoint', () => {
  it('returns null for empty array', () => {
    expect(findNearestToPoint([], 100, 100)).toBeNull();
  });

  it('returns the single element for array of one', () => {
    const el = makeElement(50, 50);
    expect(findNearestToPoint([el], 100, 100)).toBe(el);
  });

  it('returns the closest element', () => {
    const near = makeElement(110, 100);
    const far = makeElement(500, 500);
    expect(findNearestToPoint([near, far], 100, 100)).toBe(near);
  });

  it('handles exact match at point', () => {
    const atPoint = makeElement(100, 100);
    const away = makeElement(200, 200);
    expect(findNearestToPoint([atPoint, away], 100, 100)).toBe(atPoint);
  });
});
