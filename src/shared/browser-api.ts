import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './constants';

export function getAPI(): any {
  return (globalThis as any).browser || (globalThis as any).chrome;
}
