const MAX_ANCESTORS = 15;

let hoveredNodes: HTMLElement[] = [];

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
}

export function cleanup(): void {
  for (let i = hoveredNodes.length - 1; i >= 0; i--) {
    dispatchLeave(hoveredNodes[i], null);
  }
  hoveredNodes = [];
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
