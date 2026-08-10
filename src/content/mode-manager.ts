type Mode = 'idle' | 'picker' | 'tabs' | 'search' | 'actions' | 'caret';

let activeMode: Mode = 'idle';
const deactivators: Record<Mode, (() => void) | null> = {
  idle: null,
  picker: null,
  tabs: null,
  search: null,
  actions: null,
  caret: null,
};

export function requestMode(mode: Mode, deactivateFn: () => void): boolean {
  if (activeMode !== 'idle' && activeMode !== mode) {
    const deactivate = deactivators[activeMode];
    if (deactivate) deactivate();
  }
  activeMode = mode;
  deactivators[mode] = deactivateFn;
  return true;
}

export function releaseMode(mode: Mode): void {
  if (activeMode === mode) {
    activeMode = 'idle';
    deactivators[mode] = null;
  }
}

export function getActiveMode(): Mode {
  return activeMode;
}

export function isIdle(): boolean {
  return activeMode === 'idle';
}
