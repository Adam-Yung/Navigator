import { NAV_SELECTORS } from '../shared/constants';

const MAGNET_RANGE_PX = 60;

export function findMagnetTarget(): HTMLElement | null {
  const _vcx = window.innerWidth / 2;
  const vcy = window.innerHeight / 2;

  const elements = document.querySelectorAll<HTMLElement>(NAV_SELECTORS);
  let best: HTMLElement | null = null;
  let bestDist = MAGNET_RANGE_PX;

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cy = rect.top + rect.height / 2;
    const dist = Math.abs(cy - vcy);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }

  return best;
}

export function applyMagnetism(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const vcy = window.innerHeight / 2;
  const offset = rect.top + rect.height / 2 - vcy;
  if (Math.abs(offset) > 5) {
    const scroller = findScrollableAncestor(target);
    scroller.scrollBy({ top: offset, behavior: 'smooth' });
  }
}

function findScrollableAncestor(el: Element): Element | Window {
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (overflowY !== 'hidden' && overflowY !== 'visible' && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}
