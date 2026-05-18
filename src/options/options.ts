import type { Settings, Keybindings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';

const api = (globalThis as any).browser || (globalThis as any).chrome;

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
  try {
    const result = await api.storage.sync.get('settings');
    if (result.settings) {
      settings = { ...DEFAULT_SETTINGS, ...result.settings };
    }
  } catch {
    try {
      const result = await api.storage.local.get('settings');
      if (result.settings) {
        settings = { ...DEFAULT_SETTINGS, ...result.settings };
      }
    } catch {
      // Use defaults
    }
  }
}

async function save(): Promise<void> {
  try {
    await api.storage.sync.set({ settings });
  } catch {
    await api.storage.local.set({ settings });
  }
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
  (document.getElementById('smart-priority') as HTMLInputElement).checked = settings.smartPrioritization;

  const coneSlider = document.getElementById('cone-angle') as HTMLInputElement;
  coneSlider.value = String(settings.coneAngle);
  document.getElementById('cone-angle-val')!.textContent = `${settings.coneAngle}\u00B0`;
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

  document.getElementById('anim-duration')!.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.animDuration = parseInt(val, 10);
    document.getElementById('anim-duration-val')!.textContent = `${val}ms`;
    updatePreviewDuration();
    save();
  });

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="aura-intensity"]');
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      settings.auraIntensity = radio.value as Settings['auraIntensity'];
      save();
    });
  }

  document.getElementById('auto-scroll')!.addEventListener('change', (e) => {
    settings.autoScroll = (e.target as HTMLInputElement).checked;
    save();
  });

  document.getElementById('smart-priority')!.addEventListener('change', (e) => {
    settings.smartPrioritization = (e.target as HTMLInputElement).checked;
    save();
  });

  document.getElementById('cone-angle')!.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    settings.coneAngle = parseInt(val, 10);
    document.getElementById('cone-angle-val')!.textContent = `${val}\u00B0`;
    save();
  });

  document.getElementById('disabled-sites')!.addEventListener('change', (e) => {
    const text = (e.target as HTMLTextAreaElement).value;
    settings.disabledSites = text.split('\n').map(s => s.trim()).filter(Boolean);
    save();
  });

  document.getElementById('btn-reset')!.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
      settings = { ...DEFAULT_SETTINGS };
      renderKeybindings();
      renderAppearance();
      renderBehavior();
      renderDisabledSites();
      save();
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
  save();

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
    enterNavigation: 'Enter Navigation',
    enterEditing: 'Enter Editing',
    returnToNormal: 'Return to Normal',
    activate: 'Activate',
    stickyActivate: 'Sticky Activate',
    openNewTab: 'Open New Tab',
    goBack: 'Go Back',
    toggleExtension: 'Toggle Extension',
    hintMode: 'Hint Mode',
  };
  return names[key] || key;
}

function buildComboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}

function comboToKeycaps(combo: string): string {
  const parts = combo.split('+');
  const isMac = navigator.platform.includes('Mac');

  return parts.map(part => {
    let display = part;
    if (part === 'Ctrl') display = isMac ? '\u2303' : 'Ctrl';
    else if (part === 'Alt') display = isMac ? '\u2325' : 'Alt';
    else if (part === 'Meta') display = isMac ? '\u2318' : 'Win';
    else if (part === 'Shift') display = isMac ? '\u21E7' : 'Shift';
    else if (part === 'Escape') display = 'Esc';
    else if (part === 'Enter') display = '\u21B5';
    else if (part.startsWith('Key')) display = part.slice(3);
    else if (part.startsWith('Digit')) display = part.slice(5);

    return `<span class="keycap">${display}</span>`;
  }).join('');
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

  setInterval(() => {
    currentTarget = currentTarget === el1 ? el2 : el1;
    positionRing();
  }, 2000);
}

function updatePreviewDuration(): void {
  const ring = document.getElementById('preview-ring');
  if (ring) {
    ring.style.transitionDuration = `${settings.animDuration}ms`;
  }
}

init();
