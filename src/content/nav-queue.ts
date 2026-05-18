import type { Direction, IndexedElement } from '../shared/types';
import { findNext } from './spatial-nav';

type FlushCallback = (target: IndexedElement) => void;

let pending: Direction[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentElement: IndexedElement | null = null;
let candidates: IndexedElement[] = [];
let onFlush: FlushCallback | null = null;
let coneAngle = 90;

export function setNavQueueState(
  current: IndexedElement | null,
  elements: IndexedElement[],
  cone: number
): void {
  currentElement = current;
  candidates = elements;
  coneAngle = cone;
}

export function setFlushCallback(callback: FlushCallback): void {
  onFlush = callback;
}

export function enqueue(direction: Direction): void {
  pending.push(direction);

  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(flush, 16);
}

export function flushImmediately(): void {
  if (pending.length > 0) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  }
}

function flush(): void {
  flushTimer = null;
  if (!currentElement || pending.length === 0) {
    pending = [];
    return;
  }

  let target: IndexedElement = currentElement;

  for (const dir of pending) {
    const next = findNext(target, candidates, dir, coneAngle);
    if (next) {
      target = next;
    }
  }

  pending = [];

  if (target !== currentElement && onFlush) {
    currentElement = target;
    onFlush(target);
  }
}
