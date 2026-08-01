import { getAPI } from '../shared/browser-api';
import { getSettings, onSettingsChanged } from '../shared/storage';
import type { Settings } from '../shared/types';
import { hide as hideAura, initAuraRing, updateAuraSettings } from './aura-ring';
import { initHintMode, initPickerKeybinding, updatePickerSettings, deactivateHintMode, destroyHintMode } from './hint-mode';
import { cleanup as cleanupHover } from './hover-manager';
import { hideIndicator, initIndicator } from './indicator';
import {
  initKeyHandler,
  setExtensionEnabled,
  registerKeyHandler,
  updateKeyHandlerSettings,
} from './key-handler';
import { initScrollEngine, updateScrollSettings, destroyScrollEngine } from './scroll-engine';
import { initFocusHistory, updateFocusHistorySettings } from './focus-history';
import { initClipboardOps, updateClipboardSettings } from './clipboard-ops';
import { initTabPicker, updateTabPickerSettings, deactivateTabPicker } from './tab-picker';
import { initAltHoldHelper, updateAltHoldSettings } from './alt-hold-helper';
import { initCheatsheet, updateCheatsheetSettings, deactivateCheatsheet } from './cheatsheet';
import { initUrlNav, updateUrlNavSettings } from './url-nav';
import { initSectionNav, updateSectionNavSettings } from './section-nav';
import { initContextualLabel } from './contextual-label';
import { initElementSearch, updateElementSearchSettings, deactivateElementSearch } from './element-search';

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
  initPickerKeybinding(settings);
  initScrollEngine(settings);
  initFocusHistory(settings);
  initClipboardOps(settings);
  initTabPicker(settings);
  initAltHoldHelper(settings);
  initCheatsheet(settings);
  initUrlNav(settings);
  initSectionNav(settings);
  initContextualLabel();
  initElementSearch(settings);

  onSettingsChanged((newSettings) => {
    settings = newSettings;
    updateKeyHandlerSettings(newSettings);
    updateAuraSettings(newSettings);
    updatePickerSettings(newSettings);
    updateScrollSettings(newSettings);
    updateFocusHistorySettings(newSettings);
    updateClipboardSettings(newSettings);
    updateTabPickerSettings(newSettings);
    updateAltHoldSettings(newSettings);
    updateCheatsheetSettings(newSettings);
    updateUrlNavSettings(newSettings);
    updateSectionNavSettings(newSettings);
    updateElementSearchSettings(newSettings);
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
  deactivateTabPicker();
  deactivateElementSearch();
  deactivateCheatsheet();
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
