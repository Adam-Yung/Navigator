import { getAPI } from '../shared/browser-api';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { buildComboString } from '../shared/keys';
import { getSettings, saveSettings } from '../shared/storage';
import type { Keybindings, Settings } from '../shared/types';

const _api = getAPI();

let settings: Settings = { ...DEFAULT_SETTINGS };
let recordingButton: HTMLButtonElement | null = null;

async function init(): Promise<void> {
  await loadSettings();
  renderKeybindings();
  renderAppearance();
  renderBehavior();
  renderDisabledSites();
  setupPreview();
  setupListeners();
}

async function loadSettings(): Promise<void> {
  settings = await getSettings();
}

async function save(): Promise<void> {
  await saveSettings(settings);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save().catch(() => {});
  }, 300);
}

function renderKeybindings(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.keybind-btn');
  for (const btn of buttons) {
    const key = btn.dataset.key as keyof Keybindings;
    if (key && settings.keybindings[key]) {
      btn.querySelector('.keycaps')!.innerHTML = comboToKeycaps(settings.keybindings[key]);
    }
  }
  clearConflictWarning();
}

function renderAppearance(): void {
  const slider = document.getElementById('anim-duration') as HTMLInputElement;
  slider.value = String(settings.animDuration);
  document.getElementById('anim-duration-val')!.textContent = `${settings.animDuration}ms`;

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="aura-intensity"]');
  for (const radio of radios) {
    radio.checked = radio.value === settings.auraIntensity;
  }
}

function renderBehavior(): void {
  (document.getElementById('auto-scroll') as HTMLInputElement).checked = settings.autoScroll;
  (document.getElementById('show-alt-helper') as HTMLInputElement).checked = settings.showAltHelper;

  const delaySlider = document.getElementById('alt-helper-delay') as HTMLInputElement;
  delaySlider.value = String(settings.altHelperDelay);
  document.getElementById('alt-helper-delay-val')!.textContent = `${settings.altHelperDelay}ms`;

  const baseVel = document.getElementById('scroll-base-velocity') as HTMLInputElement;
  baseVel.value = String(settings.scrollBaseVelocity);
  document.getElementById('scroll-base-velocity-val')!.textContent = String(settings.scrollBaseVelocity);

  const maxVel = document.getElementById('scroll-max-velocity') as HTMLInputElement;
  maxVel.value = String(settings.scrollMaxVelocity);
  document.getElementById('scroll-max-velocity-val')!.textContent = String(settings.scrollMaxVelocity);

  const decel = document.getElementById('scroll-decel-factor') as HTMLInputElement;
  decel.value = String(settings.scrollDecelFactor);
  document.getElementById('scroll-decel-factor-val')!.textContent = String(settings.scrollDecelFactor);

  (document.getElementById('use-physical-keys') as HTMLInputElement).checked = settings.usePhysicalKeys;
  (document.getElementById('colorful-hints') as HTMLInputElement).checked = settings.colorfulHints;
  (document.getElementById('hint-chars') as HTMLInputElement).value = settings.hintChars.split('').join(' ');
}

function renderDisabledSites(): void {
  const textarea = document.getElementById('disabled-sites') as HTMLTextAreaElement;
  textarea.value = settings.disabledSites.join('\n');
}

function setupListeners(): void {
  const keybindButtons = document.querySelectorAll<HTMLButtonElement>('.keybind-btn');
  for (const btn of keybindButtons) {
    btn.addEventListener('click', () => startRecording(btn));
  }

  document.getElementById('anim-duration')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.animDuration = parseInt(val, 10);
    document.getElementById('anim-duration-val')!.textContent = `${val}ms`;
    updatePreviewDuration();
    debouncedSave();
  });

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="aura-intensity"]');
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      settings.auraIntensity = radio.value as Settings['auraIntensity'];
      save().catch(() => {});
    });
  }

  document.getElementById('auto-scroll')?.addEventListener('change', (e) => {
    settings.autoScroll = (e.target as HTMLInputElement).checked;
    save().catch(() => {});
  });

  document.getElementById('show-alt-helper')?.addEventListener('change', (e) => {
    settings.showAltHelper = (e.target as HTMLInputElement).checked;
    save().catch(() => {});
  });

  document.getElementById('alt-helper-delay')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.altHelperDelay = parseInt(val, 10);
    document.getElementById('alt-helper-delay-val')!.textContent = `${val}ms`;
    debouncedSave();
  });

  document.getElementById('scroll-base-velocity')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.scrollBaseVelocity = parseInt(val, 10);
    document.getElementById('scroll-base-velocity-val')!.textContent = val;
    debouncedSave();
  });

  document.getElementById('scroll-max-velocity')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.scrollMaxVelocity = parseInt(val, 10);
    document.getElementById('scroll-max-velocity-val')!.textContent = val;
    debouncedSave();
  });

  document.getElementById('scroll-decel-factor')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.scrollDecelFactor = parseFloat(val);
    document.getElementById('scroll-decel-factor-val')!.textContent = val;
    debouncedSave();
  });

  document.getElementById('use-physical-keys')?.addEventListener('change', (e) => {
    settings.usePhysicalKeys = (e.target as HTMLInputElement).checked;
    save().catch(() => {});
  });

  document.getElementById('colorful-hints')?.addEventListener('change', (e) => {
    settings.colorfulHints = (e.target as HTMLInputElement).checked;
    save().catch(() => {});
  });

  document.getElementById('hint-chars')?.addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value.replace(/\s+/g, '');
    if (raw.length >= 6 && new Set(raw.split('')).size === raw.length) {
      settings.hintChars = raw;
      (e.target as HTMLInputElement).value = raw.split('').join(' ');
      save().catch(() => {});
    } else {
      alert('Hint characters must be at least 6 unique characters (spaces are ignored)');
      (e.target as HTMLInputElement).value = settings.hintChars.split('').join(' ');
    }
  });
  document.getElementById('disabled-sites')?.addEventListener('change', (e) => {
    const text = (e.target as HTMLTextAreaElement).value;
    settings.disabledSites = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    save().catch(() => {});
  });

  document.getElementById('btn-export')!.addEventListener('click', () => {
    const json = JSON.stringify(settings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'navigator-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import')!.addEventListener('click', () => {
    (document.getElementById('import-file') as HTMLInputElement).click();
  });

  document.getElementById('import-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.keybindings || typeof imported.animDuration !== 'number') {
        alert('Invalid settings file');
        return;
      }
      settings = { ...DEFAULT_SETTINGS, ...imported };
      await save();
      renderKeybindings();
      renderAppearance();
      renderBehavior();
      renderDisabledSites();
    } catch {
      alert('Failed to parse settings file');
    }
    (e.target as HTMLInputElement).value = '';
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
      settings = { ...DEFAULT_SETTINGS };
      renderKeybindings();
      renderAppearance();
      renderBehavior();
      renderDisabledSites();
      save().catch(() => {});
    }
  });

  document.addEventListener('keydown', handleRecordingKeydown);
  document.addEventListener('click', (e) => {
    if (recordingButton && !(e.target as HTMLElement).closest('.keybind-btn')) {
      stopRecording();
    }
  });
}

function startRecording(btn: HTMLButtonElement): void {
  if (recordingButton) {
    recordingButton.classList.remove('recording');
  }
  recordingButton = btn;
  btn.classList.add('recording');
  btn.querySelector('.keycaps')!.innerHTML = '<span class="keycap">...</span>';
  clearConflictWarning();
}

function stopRecording(): void {
  if (recordingButton) {
    recordingButton.classList.remove('recording');
    const key = recordingButton.dataset.key as keyof Keybindings;
    if (key) {
      recordingButton.querySelector('.keycaps')!.innerHTML = comboToKeycaps(settings.keybindings[key]);
    }
    recordingButton = null;
  }
}

function handleRecordingKeydown(e: KeyboardEvent): void {
  if (!recordingButton) return;

  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecording();
    return;
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

  const combo = buildComboString(e);
  const key = recordingButton.dataset.key as keyof Keybindings;
  if (!key) return;

  const conflict = checkDuplicates(key, combo);
  if (conflict) {
    showConflictWarning(key, conflict, combo);
  } else {
    clearConflictWarning();
  }

  settings.keybindings[key] = combo;
  recordingButton.querySelector('.keycaps')!.innerHTML = comboToKeycaps(combo);
  save().catch(() => {});

  recordingButton.classList.remove('recording');
  recordingButton = null;
}

function checkDuplicates(currentKey: keyof Keybindings, combo: string): keyof Keybindings | null {
  for (const [k, v] of Object.entries(settings.keybindings)) {
    if (k !== currentKey && v === combo) return k as keyof Keybindings;
  }
  return null;
}

function showConflictWarning(key1: keyof Keybindings, key2: keyof Keybindings, combo: string): void {
  const warning = document.getElementById('conflict-warning')!;
  const text = warning.querySelector('.conflict-text')!;
  text.textContent = `"${formatKeyName(key1)}" conflicts with "${formatKeyName(key2)}" — both set to ${combo}`;
  warning.hidden = false;

  highlightConflict(key1, true);
  highlightConflict(key2, true);
}

function clearConflictWarning(): void {
  const warning = document.getElementById('conflict-warning');
  if (warning) warning.hidden = true;

  const buttons = document.querySelectorAll<HTMLButtonElement>('.keybind-btn');
  for (const btn of buttons) {
    btn.classList.remove('conflict');
  }
}

function highlightConflict(key: keyof Keybindings, highlight: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>(`.keybind-btn[data-key="${key}"]`);
  if (btn) {
    if (highlight) btn.classList.add('conflict');
    else btn.classList.remove('conflict');
  }
}

function formatKeyName(key: keyof Keybindings): string {
  const names: Record<keyof Keybindings, string> = {
    picker: 'Element Picker',
    tabPicker: 'Tab Picker',
    search: 'Text Search',
    scrollDown: 'Scroll Down',
    scrollUp: 'Scroll Up',
    scrollLeft: 'Scroll Left',
    scrollRight: 'Scroll Right',
    scrollFastDown: 'Fast Scroll Down',
    scrollFastUp: 'Fast Scroll Up',
    historyBack: 'History Back',
    historyForward: 'History Forward',
    sectionPrev: 'Section Previous',
    sectionNext: 'Section Next',
    focusHistoryBack: 'Focus Back',
    focusHistoryForward: 'Focus Forward',
    urlUp: 'URL Up',
    urlRoot: 'URL Root',
    focusFirstInput: 'Focus First Input',
    yankMode: 'Yank Mode',
    clipboardOpen: 'Open Clipboard URL',
    caretMode: 'Caret/Visual Mode',
    marks: 'Set Mark',
    marksJump: 'Jump to Mark',
    quickActions: 'Quick Actions',
    toggleExtension: 'Toggle Extension',
  };
  return names[key] || key;
}

function comboToKeycaps(combo: string): string {
  const parts = combo.split('+');
  const isMac = /mac/i.test((navigator as any).userAgentData?.platform ?? navigator.platform ?? '');

  return parts
    .map((part) => {
      let display = part;
      if (part === 'Ctrl') display = isMac ? '\u2303' : 'Ctrl';
      else if (part === 'Alt') display = isMac ? '\u2325' : 'Alt';
      else if (part === 'Meta') display = isMac ? '\u2318' : 'Win';
      else if (part === 'Shift') display = isMac ? '\u21E7' : 'Shift';
      else if (part === 'Escape') display = 'Esc';
      else if (part === 'Enter') display = '\u21B5';
      else if (part === 'Space') display = 'Space';
      else if (part === 'Slash') display = '/';
      else if (part === 'BracketLeft') display = '[';
      else if (part === 'BracketRight') display = ']';
      else if (part === 'Quote') display = "'";
      else if (part.startsWith('Key')) display = part.slice(3);
      else if (part.startsWith('Digit')) display = part.slice(5);

      return `<span class="keycap">${display}</span>`;
    })
    .join('');
}

function setupPreview(): void {
  const area = document.getElementById('preview-area')!;
  const ring = document.getElementById('preview-ring')!;
  const el1 = document.getElementById('preview-el-1')!;
  const el2 = document.getElementById('preview-el-2')!;

  let currentTarget = el1;

  function positionRing(): void {
    const areaRect = area.getBoundingClientRect();
    const targetRect = currentTarget.getBoundingClientRect();
    const padding = 8;

    ring.style.top = `${targetRect.top - areaRect.top - padding}px`;
    ring.style.left = `${targetRect.left - areaRect.left - padding}px`;
    ring.style.width = `${targetRect.width + padding * 2}px`;
    ring.style.height = `${targetRect.height + padding * 2}px`;
  }

  positionRing();

  let previewInterval: ReturnType<typeof setInterval> | null = null;
  function startPreview() {
    if (previewInterval) return;
    previewInterval = setInterval(() => {
      currentTarget = currentTarget === el1 ? el2 : el1;
      positionRing();
    }, 2000);
  }
  function stopPreview() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
  }
  startPreview();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPreview();
    else startPreview();
  });
}

function updatePreviewDuration(): void {
  const ring = document.getElementById('preview-ring');
  if (ring) {
    ring.style.transitionDuration = `${settings.animDuration}ms`;
  }
}

init();
