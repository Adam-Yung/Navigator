import { buildComboString } from '../shared/keys';
import type { Settings } from '../shared/types';
import { registerKeyHandler } from './key-handler';

let settings: Settings | null = null;
let unregisterKey: (() => void) | null = null;

export function initSectionNav(initialSettings: Settings): void {
  settings = initialSettings;
  unregisterKey = registerKeyHandler(handleKey);
}

export function updateSectionNavSettings(newSettings: Settings): void {
  settings = newSettings;
}

export function destroySectionNav(): void {
  if (unregisterKey) unregisterKey();
}

function handleKey(e: KeyboardEvent): boolean {
  if (!settings) return false;
  const combo = buildComboString(e);

  if (combo === settings.keybindings.sectionNext) {
    jumpToSection('next');
    return true;
  }
  if (combo === settings.keybindings.sectionPrev) {
    jumpToSection('prev');
    return true;
  }
  return false;
}

function jumpToSection(direction: 'next' | 'prev'): void {
  const landmarks = getLandmarkElements();
  if (landmarks.length === 0) return;

  const scrollY = window.scrollY;
  const viewportMiddle = scrollY + window.innerHeight / 2;

  if (direction === 'next') {
    for (const el of landmarks) {
      const top = el.getBoundingClientRect().top + scrollY;
      if (top > viewportMiddle + 10) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  } else {
    for (let i = landmarks.length - 1; i >= 0; i--) {
      const top = landmarks[i].getBoundingClientRect().top + scrollY;
      if (top < viewportMiddle - 10) {
        landmarks[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }
}

function getLandmarkElements(): HTMLElement[] {
  const selectors =
    'h1, h2, h3, h4, h5, h6, main, [role="main"], nav, [role="navigation"], section, article, aside, footer';
  const elements = document.querySelectorAll<HTMLElement>(selectors);
  return Array.from(elements).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}
