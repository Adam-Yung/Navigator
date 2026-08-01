import { getAPI } from '../shared/browser-api';
import { DEFAULT_SETTINGS } from '../shared/constants';

const api = getAPI();

const actionApi = api.action || api.browserAction;
actionApi?.onClicked?.addListener(() => {
  api.runtime.openOptionsPage();
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

api.runtime.onMessage.addListener(async (message: any, _sender: any, sendResponse: any) => {
  if (message.type === 'get-tabs') {
    try {
      const tabs = await api.tabs.query({ currentWindow: true });
      sendResponse({ tabs });
    } catch {
      sendResponse({ tabs: [] });
    }
    return true;
  }

  if (message.type === 'switch-tab' && message.tabId) {
    try {
      await api.tabs.update(message.tabId, { active: true });
    } catch {
      // Tab may not exist
    }
  }
});
