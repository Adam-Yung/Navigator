const MAX_ANCESTORS = 15;
const OPACITY_THRESHOLD = 0.1;

interface SavedStyle {
  opacity: string;
  visibility: string;
  pointerEvents: string;
  transition: string;
}

let hoveredNodes: HTMLElement[] = [];
const overriddenNodes: Map<HTMLElement, SavedStyle> = new Map();
let lastRevealedEl: HTMLElement | null = null;

export function revealElement(el: HTMLElement): void {
  const newChain = getAncestorChain(el);

  const oldSet = new Set(hoveredNodes);
  const newSet = new Set(newChain);

  const toLeave = hoveredNodes.filter((n) => !newSet.has(n));
  const toEnter = newChain.filter((n) => !oldSet.has(n));

  for (let i = toLeave.length - 1; i >= 0; i--) {
    dispatchLeave(toLeave[i], el);
  }

  for (const node of toEnter) {
    dispatchEnter(node, el);
  }

  hoveredNodes = newChain;

  if (el === lastRevealedEl && overriddenNodes.size > 0) {
    return;
  }

  lastRevealedEl = el;
  forceVisibilityIfNeeded(el, newChain);
}

export function cleanup(): void {
  restoreOverrides();

  for (let i = hoveredNodes.length - 1; i >= 0; i--) {
    dispatchLeave(hoveredNodes[i], null);
  }
  hoveredNodes = [];
  lastRevealedEl = null;
}

function forceVisibilityIfNeeded(el: HTMLElement, chain: HTMLElement[]): void {
  if (isEffectivelyVisible(el)) {
    restoreOverrides();
    return;
  }

  const nodesToOverride = new Set<HTMLElement>();

  for (const node of chain) {
    const computed = getComputedStyle(node);
    const opacity = Number.parseFloat(computed.opacity);
    if (opacity < OPACITY_THRESHOLD) {
      nodesToOverride.add(node);
    }
    if (computed.visibility === 'hidden') {
      nodesToOverride.add(node);
    }
    if (computed.pointerEvents === 'none') {
      nodesToOverride.add(node);
    }
  }

  const toRestore = new Map(overriddenNodes);
  for (const [node] of toRestore) {
    if (!nodesToOverride.has(node)) {
      restoreNode(node);
      overriddenNodes.delete(node);
    }
  }

  for (const node of nodesToOverride) {
    if (!overriddenNodes.has(node)) {
      overriddenNodes.set(node, {
        opacity: node.style.opacity,
        visibility: node.style.visibility,
        pointerEvents: node.style.pointerEvents,
        transition: node.style.transition,
      });
    }

    const computed = getComputedStyle(node);
    node.style.setProperty('transition', 'none', 'important');
    if (Number.parseFloat(computed.opacity) < OPACITY_THRESHOLD) {
      node.style.setProperty('opacity', '1', 'important');
    }
    if (computed.visibility === 'hidden') {
      node.style.setProperty('visibility', 'visible', 'important');
    }
    if (computed.pointerEvents === 'none') {
      node.style.setProperty('pointer-events', 'auto', 'important');
    }
  }
}

function restoreOverrides(): void {
  for (const [node] of overriddenNodes) {
    restoreNode(node);
  }
  overriddenNodes.clear();
}

function restoreNode(node: HTMLElement): void {
  const saved = overriddenNodes.get(node);
  if (!saved) return;

  if (saved.transition) {
    node.style.transition = saved.transition;
  } else {
    node.style.removeProperty('transition');
  }

  if (saved.opacity) {
    node.style.opacity = saved.opacity;
  } else {
    node.style.removeProperty('opacity');
  }

  if (saved.visibility) {
    node.style.visibility = saved.visibility;
  } else {
    node.style.removeProperty('visibility');
  }

  if (saved.pointerEvents) {
    node.style.pointerEvents = saved.pointerEvents;
  } else {
    node.style.removeProperty('pointer-events');
  }
}

function isEffectivelyVisible(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  let depth = 0;

  while (current && current !== document.documentElement && depth < MAX_ANCESTORS) {
    const computed = getComputedStyle(current);
    if (Number.parseFloat(computed.opacity) < OPACITY_THRESHOLD) return false;
    if (computed.visibility === 'hidden') return false;
    current = current.parentElement;
    depth++;
  }

  return true;
}

function getAncestorChain(el: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [el];
  let current: HTMLElement | null = el.parentElement;
  let depth = 0;

  while (current && current !== document.documentElement && depth < MAX_ANCESTORS) {
    chain.push(current);
    current = current.parentElement;
    depth++;
  }

  return chain;
}

function getCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function dispatchEnter(node: HTMLElement, refEl: HTMLElement): void {
  const { x, y } = getCenter(refEl);

  node.dispatchEvent(
    new PointerEvent('pointerenter', {
      bubbles: false,
      composed: true,
      clientX: x,
      clientY: y,
      pointerType: 'mouse',
    }),
  );

  node.dispatchEvent(
    new MouseEvent('mouseenter', {
      bubbles: false,
      composed: true,
      clientX: x,
      clientY: y,
    }),
  );
}

function dispatchLeave(node: HTMLElement, refEl: HTMLElement | null): void {
  const { x, y } = refEl ? getCenter(refEl) : { x: 0, y: 0 };

  node.dispatchEvent(
    new PointerEvent('pointerleave', {
      bubbles: false,
      composed: true,
      clientX: x,
      clientY: y,
      pointerType: 'mouse',
    }),
  );

  node.dispatchEvent(
    new MouseEvent('mouseleave', {
      bubbles: false,
      composed: true,
      clientX: x,
      clientY: y,
    }),
  );
}
