import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setNavQueueState, setFlushCallback, setDeadEndCallback, enqueue, flushImmediately } from '../src/content/nav-queue';
import type { IndexedElement } from '../src/shared/types';

function makeElement(cx: number, cy: number): IndexedElement {
  const el = document.createElement('button');
  const rect = new DOMRect(cx - 25, cy - 12, 50, 24);
  return { el, cx, cy, rect };
}

describe('nav-queue', () => {
  let flushCb: ReturnType<typeof vi.fn>;
  let deadEndCb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    flushCb = vi.fn();
    deadEndCb = vi.fn();
    setFlushCallback(flushCb);
    setDeadEndCallback(deadEndCb);
  });

  it('flushes after delay and navigates to next element', () => {
    const current = makeElement(100, 100);
    const right = makeElement(200, 100);
    setNavQueueState(current, [current, right], 90);

    enqueue('right');
    vi.advanceTimersByTime(20);

    expect(flushCb).toHaveBeenCalledWith(right);
  });

  it('calls dead-end callback when no target found', () => {
    const current = makeElement(100, 100);
    setNavQueueState(current, [current], 90);

    enqueue('right');
    vi.advanceTimersByTime(20);

    expect(deadEndCb).toHaveBeenCalledWith('right');
    expect(flushCb).not.toHaveBeenCalled();
  });

  it('batches rapid enqueues into single flush', () => {
    const current = makeElement(100, 100);
    const mid = makeElement(200, 100);
    const far = makeElement(300, 100);
    setNavQueueState(current, [current, mid, far], 90);

    enqueue('right');
    enqueue('right');
    vi.advanceTimersByTime(20);

    expect(flushCb).toHaveBeenCalledTimes(1);
    expect(flushCb).toHaveBeenCalledWith(far);
  });

  it('flushImmediately triggers without waiting for timer', () => {
    const current = makeElement(100, 100);
    const right = makeElement(200, 100);
    setNavQueueState(current, [current, right], 90);

    enqueue('right');
    flushImmediately();

    expect(flushCb).toHaveBeenCalledWith(right);
  });

  it('does nothing when no current element', () => {
    setNavQueueState(null, [], 90);
    enqueue('right');
    vi.advanceTimersByTime(20);
    expect(flushCb).not.toHaveBeenCalled();
    expect(deadEndCb).not.toHaveBeenCalled();
  });

  it('flushes immediately on direction change then processes new direction', () => {
    const current = makeElement(100, 100);
    const right = makeElement(200, 100);
    const below = makeElement(200, 200);
    setNavQueueState(current, [current, right, below], 90);

    enqueue('right');
    enqueue('down');
    vi.advanceTimersByTime(20);

    expect(flushCb).toHaveBeenCalled();
    const lastCall = flushCb.mock.calls[flushCb.mock.calls.length - 1][0];
    expect(lastCall.cy).toBe(200);
  });
});
