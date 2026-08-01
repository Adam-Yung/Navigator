import { getAPI } from '../shared/browser-api';
import { getSettings, onSettingsChanged } from '../shared/storage';
import type { Settings } from '../shared/types';
import { hide as hideAura, initAuraRing, updateAuraSettings } from './aura-ring';
import { initHintMode, deactivateHintMode, destroyHintMode } from './hint-mode';
import { cleanup as cleanupHover } from './hover-manager';
import { hideIndicator, initIndicator } from './indicator';
import {
  initKeyHandler,
  setExtensionEnabled,
  registerKeyHandler,
  updateKeyHandlerSettings,
} from './key-handler';

let settings: Settings;
let extensionEnabled = true;

async function init(): Promise<void> {
  settings = await getSettings();

  if (isSiteDisabled(settings.disabledSites)) {
    extensionEnabled = false;
    setExtensionEnabled(false);
  }

  initKeyHandler(settings);
  initAuraRing();
  updateAuraSettings(settings);
  initIndicator();
  initHintMode();

  onSettingsChanged((newSettings) => {
    settings = newSettings;
    updateKeyHandlerSettings(newSettings);
    updateAuraSettings(newSettings);
  });

  registerKeyHandler((e) => {
    if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      escapeAll();
      return true;
    }
    return false;
  });

  listenForBackgroundMessages();
}

export function escapeAll(): void {
  deactivateHintMode();
  cleanupHover();
  hideAura();
  hideIndicator();
}

function isSiteDisabled(patterns: string[]): boolean {
  const url = window.location.href;
  for (const pattern of patterns) {
    if (matchUrlPattern(pattern, url)) return true;
  }
  return false;
}

function matchUrlPattern(pattern: string, url: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

function listenForBackgroundMessages(): void {
  const api = getAPI();
  if (!api?.runtime?.onMessage) return;

  api.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'toggle-extension') {
      if (extensionEnabled) {
        extensionEnabled = false;
        setExtensionEnabled(false);
        escapeAll();
      } else {
        extensionEnabled = true;
        setExtensionEnabled(true);
      }
    }
  });
}

init().catch(() => {});
