import type { Direction, IndexedElement } from '../shared/types';
import { findNext } from './spatial-nav';

type FlushCallback = (target: IndexedElement) => void;
type DeadEndCallback = (direction: Direction) => void;

const FLUSH_DELAY_MS = 16;
const CONSECUTIVE_FLUSH_WINDOW_MS = 500;
const REPEAT_TIER_3_THRESHOLD = 6;
const REPEAT_TIER_2_THRESHOLD = 3;
const REPEAT_TIER_3_MULTIPLIER = 3;
const REPEAT_TIER_2_MULTIPLIER = 2;

let pending: Direction[] = [];
let lastDirection: Direction | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentElement: IndexedElement | null = null;
let candidates: IndexedElement[] = [];
let onFlush: FlushCallback | null = null;
let onDeadEnd: DeadEndCallback | null = null;
let coneAngle = 90;
let smartPrioritization = false;
let consecutiveFlushes = 0;
let lastFlushTime = 0;
let lastFlushDir: Direction | null = null;

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

  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
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

  const now = Date.now();
  const dir = pending[pending.length - 1];

  if (dir === lastFlushDir && now - lastFlushTime < CONSECUTIVE_FLUSH_WINDOW_MS) {
    consecutiveFlushes++;
  } else {
    consecutiveFlushes = 0;
  }
  lastFlushDir = dir;
  lastFlushTime = now;

  const multiplier = getRepeatMultiplier();
  let target: IndexedElement = currentElement;
  let lastDir: Direction = dir;

  for (const d of pending) {
    for (let step = 0; step < multiplier; step++) {
      const next = findNext(target, candidates, d, coneAngle, smartPrioritization);
      if (next) {
        target = next;
      } else {
        break;
      }
    }
    lastDir = d;
  }

  pending = [];

  if (target !== currentElement && onFlush) {
    currentElement = target;
    onFlush(target);
  } else if (target === currentElement && onDeadEnd) {
    onDeadEnd(lastDir);
  }
}

function getRepeatMultiplier(): number {
  if (consecutiveFlushes >= REPEAT_TIER_3_THRESHOLD) return REPEAT_TIER_3_MULTIPLIER;
  if (consecutiveFlushes >= REPEAT_TIER_2_THRESHOLD) return REPEAT_TIER_2_MULTIPLIER;
  return 1;
}
