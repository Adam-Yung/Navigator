import { DEFAULT_SETTINGS } from '../shared/constants';

const api = (globalThis as any).browser || (globalThis as any).chrome;

api.runtime.onInstalled.addListener(async () => {
  try {
    const result = await api.storage.sync.get('settings');
    if (!result.settings) {
      await api.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
  } catch {
    try {
      const result = await api.storage.local.get('settings');
      if (!result.settings) {
        await api.storage.local.set({ settings: DEFAULT_SETTINGS });
      }
    } catch {
      // Storage unavailable
    }
  }
});

api.commands?.onCommand?.addListener(async (command: string) => {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;

  let mode: string | null = null;
  if (command === 'activate-navigation') {
    mode = 'navigation';
  } else if (command === 'activate-editing') {
    mode = 'editing';
  }

  if (mode) {
    api.tabs.sendMessage(tab.id, { type: 'set-mode', mode });
  }
});
