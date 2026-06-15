import { DEFAULT_SETTINGS } from '../shared/constants';
import { getAPI } from '../shared/browser-api';

const api = getAPI();

const actionApi = api.action || api.browserAction;
actionApi?.onClicked?.addListener(() => {
  api.runtime.openOptionsPage();
});

api.runtime.onMessage.addListener((message: any, sender: any) => {
  if (message.type === 'mode-changed' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const text = message.mode === 'navigation' ? 'NAV' : message.mode === 'editing' ? 'EDT' : '';
    const color = message.mode === 'navigation' ? '#7c5ce0' : message.mode === 'editing' ? '#e0960a' : '#666666';
    actionApi?.setBadgeText?.({ text, tabId });
    actionApi?.setBadgeBackgroundColor?.({ color, tabId });
  }
});

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
  let tabs: any[];
  try {
    tabs = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }

  const tab = tabs[0];
  if (!tab?.id) return;

  let mode: string | null = null;
  if (command === 'activate-navigation') {
    mode = 'navigation';
  } else if (command === 'activate-editing') {
    mode = 'editing';
  }

  if (mode) {
    try {
      await api.tabs.sendMessage(tab.id, { type: 'set-mode', mode });
    } catch {
      // Tab may be discarded, frozen, or content script not yet injected.
      // Attempt to re-inject the content script (MV3 only), then retry.
      if (api.scripting?.executeScript) {
        try {
          await api.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          await api.tabs.sendMessage(tab.id, { type: 'set-mode', mode });
        } catch {
          // Tab is truly unreachable (e.g. chrome:// page, discarded)
        }
      }
    }
  }
});
