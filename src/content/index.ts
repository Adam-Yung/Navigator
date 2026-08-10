import { getAPI } from '../shared/browser-api';
import { comboToFullDisplay } from '../shared/keys';
import { getSettings, onSettingsChanged } from '../shared/storage';
import type { Settings } from '../shared/types';
import { initAltHoldHelper, updateAltHoldSettings } from './alt-hold-helper';
import { hide as hideAura, initAuraRing, updateAuraSettings } from './aura-ring';
import { deactivateCaretMode, initCaretMode, updateCaretModeSettings } from './caret-mode';
import { deactivateCheatsheet, initCheatsheet, updateCheatsheetSettings } from './cheatsheet';
import { initClipboardOps, updateClipboardSettings } from './clipboard-ops';
import { initContextualLabel } from './contextual-label';
import { deactivateElementSearch, initElementSearch, updateElementSearchSettings } from './element-search';
import { initFocusHistory, updateFocusHistorySettings } from './focus-history';
import {
  deactivateHintMode,
  initHintMode,
  initPickerKeybinding,
  repeatLastAction,
  updatePickerSettings,
} from './hint-mode';
import { cleanup as cleanupHover } from './hover-manager';
import { hideIndicator, initIndicator } from './indicator';
import { initKeyHandler, registerKeyHandler, setExtensionEnabled, updateKeyHandlerSettings } from './key-handler';
import { deactivateMarks, initMarks, updateMarksSettings } from './marks';
import { deactivateQuickActions, initQuickActions, updateQuickActionsSettings } from './quick-actions';
import { initScrollEngine, updateScrollSettings } from './scroll-engine';
import { initSectionNav, updateSectionNavSettings } from './section-nav';
import { deactivateTabPicker, initTabPicker, updateTabPickerSettings } from './tab-picker';
import { initUrlNav, updateUrlNavSettings } from './url-nav';

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
  initCaretMode(settings);
  initMarks(settings);
  initQuickActions(settings);

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
    updateCaretModeSettings(newSettings);
    updateMarksSettings(newSettings);
    updateQuickActionsSettings(newSettings);
  });

  registerKeyHandler((e) => {
    if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      escapeAll();
      return true;
    }
    if (e.altKey && e.key === '.' && !e.ctrlKey && !e.metaKey) {
      repeatLastAction();
      return true;
    }
    return false;
  });

  listenForBackgroundMessages();

  setTimeout(showWelcomeTooltip, 1000);
}

export function escapeAll(): void {
  deactivateHintMode();
  deactivateTabPicker();
  deactivateElementSearch();
  deactivateCheatsheet();
  deactivateCaretMode();
  deactivateMarks();
  deactivateQuickActions();
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

async function showWelcomeTooltip(): Promise<void> {
  const api = getAPI();
  if (!api?.storage?.local) return;

  try {
    const result = await api.storage.local.get('showWelcome');
    if (!result.showWelcome) return;
  } catch {
    return;
  }

  const tip = document.createElement('div');
  tip.id = 'navigator-welcome';
  tip.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    max-width: 320px;
    padding: 16px 20px;
    background: rgba(15, 15, 30, 0.95);
    border: 1px solid rgba(100, 80, 255, 0.3);
    border-radius: 12px;
    backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 12px rgba(100, 80, 255, 0.1);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #e4e4ef;
    z-index: 2147483647;
    animation: navigator-welcome-in 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    opacity: 0;
    transform: translateY(8px);
  `;
  tip.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px;color:#fff;">Navigator is ready</div>
    <div style="color:#9999b8;margin-bottom:12px;">
      Hold <kbd style="padding:2px 6px;background:rgba(100,80,255,0.2);border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;">Alt</kbd> to see shortcuts, or press
      <kbd style="padding:2px 6px;background:rgba(100,80,255,0.2);border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;">${comboToFullDisplay(settings.keybindings.picker)}</kbd> to pick elements.
    </div>
    <div style="color:#9999b8;font-size:11px;">Press <kbd style="padding:2px 6px;background:rgba(100,80,255,0.2);border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;">Alt+?</kbd> anytime for all shortcuts</div>
    <button id="navigator-welcome-dismiss" style="
      margin-top:12px;
      padding:6px 14px;
      background:rgba(100,80,255,0.2);
      border:1px solid rgba(100,80,255,0.3);
      border-radius:6px;
      color:#e4e4ef;
      font:12px -apple-system,system-ui,sans-serif;
      cursor:pointer;
    ">Got it</button>
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes navigator-welcome-in {
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(styleEl);
  document.body.appendChild(tip);

  const dismiss = () => {
    tip.style.opacity = '0';
    tip.style.transform = 'translateY(8px)';
    tip.style.transition = 'opacity 200ms, transform 200ms';
    setTimeout(() => {
      tip.remove();
      styleEl.remove();
    }, 200);
    try {
      api.storage.local.set({ showWelcome: false });
    } catch {}
  };

  tip.querySelector('#navigator-welcome-dismiss')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 15000);
}

init().catch(() => {});
