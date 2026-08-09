import { getAPI } from '../shared/browser-api';
import { DEFAULT_SETTINGS } from '../shared/constants';

const api = getAPI();

const actionApi = api.action || api.browserAction;
actionApi?.onClicked?.addListener(() => {
  api.runtime.openOptionsPage();
});

api.runtime.onInstalled.addListener(async (details: any) => {
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

  if (details.reason === 'install') {
    try {
      await api.storage.local.set({ showWelcome: true });
    } catch {}
  }
});

api.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message.type === 'get-tabs') {
    api.tabs
      .query({ currentWindow: true })
      .then((tabs: any[]) => {
        sendResponse({ tabs: tabs || [] });
      })
      .catch(() => {
        sendResponse({ tabs: [] });
      });
    return true;
  }

  if (message.type === 'switch-tab' && message.tabId) {
    api.tabs.update(message.tabId, { active: true }).catch(() => {});
    return false;
  }

  if (message.type === 'move-tab-new-window' && message.tabId) {
    api.windows.create({ tabId: message.tabId }).catch(() => {});
    return false;
  }

  return false;
});
