import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './constants';

function getAPI(): any {
  return (globalThis as any).browser || (globalThis as any).chrome;
}

export async function getSettings(): Promise<Settings> {
  const api = getAPI();
  if (!api?.storage) return { ...DEFAULT_SETTINGS };

  try {
    const result = await api.storage.sync.get('settings');
    if (result.settings) {
      return { ...DEFAULT_SETTINGS, ...result.settings };
    }
  } catch {
    try {
      const result = await api.storage.local.get('settings');
      if (result.settings) {
        return { ...DEFAULT_SETTINGS, ...result.settings };
      }
    } catch {
      // Fall through to defaults
    }
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const api = getAPI();
  if (!api?.storage) return;

  const current = await getSettings();
  const updated = { ...current, ...partial };

  try {
    await api.storage.sync.set({ settings: updated });
  } catch {
    await api.storage.local.set({ settings: updated });
  }
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  const api = getAPI();
  if (!api?.storage) return;

  api.storage.onChanged.addListener((changes: any) => {
    if (changes.settings?.newValue) {
      callback({ ...DEFAULT_SETTINGS, ...changes.settings.newValue });
    }
  });
}
