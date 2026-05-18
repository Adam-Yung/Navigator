import type { Direction, IndexedElement } from '../shared/types';
import { findNext } from './spatial-nav';

type FlushCallback = (target: IndexedElement) => void;
type DeadEndCallback = (direction: Direction) => void;

let pending: Direction[] = [];
let lastDirection: Direction | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentElement: IndexedElement | null = null;
let candidates: IndexedElement[] = [];
let onFlush: FlushCallback | null = null;
let onDeadEnd: DeadEndCallback | null = null;
let coneAngle = 90;
let smartPrioritization = false;

export function setNavQueueState(
  current: IndexedElement | null,
  elements: IndexedElement[],
  cone: number,
  smart: boolean = false
): void {
  currentElement = current;
  candidates = elements;
  coneAngle = cone;
  smartPrioritization = smart;
}

export function setFlushCallback(callback: FlushCallback): void {
  onFlush = callback;
}

export function setDeadEndCallback(callback: DeadEndCallback): void {
  onDeadEnd = callback;
}

export function enqueue(direction: Direction): void {
  if (lastDirection !== null && direction !== lastDirection && pending.length > 0) {
    flush();
  }

  lastDirection = direction;
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
  let lastDir: Direction = pending[pending.length - 1];

  for (const dir of pending) {
    const next = findNext(target, candidates, dir, coneAngle, smartPrioritization);
    if (next) {
      target = next;
    }
    lastDir = dir;
  }

  pending = [];

  if (target !== currentElement && onFlush) {
    currentElement = target;
    onFlush(target);
  } else if (target === currentElement && onDeadEnd) {
    onDeadEnd(lastDir);
  }
}
