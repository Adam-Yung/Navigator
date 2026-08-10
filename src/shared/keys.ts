export function buildComboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}

const CODE_TO_DISPLAY: Record<string, string> = {
  Space: 'Space',
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Comma: ',',
  Period: '.',
  Backslash: '\\',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
};

export function comboToDisplayKey(combo: string): string {
  const parts = combo.split('+');
  const modifiers: string[] = [];
  let key = '';

  for (const part of parts) {
    if (part === 'Alt') continue;
    if (part === 'Ctrl' || part === 'Meta' || part === 'Shift') {
      modifiers.push(part === 'Meta' ? 'Cmd' : part);
      continue;
    }
    if (part.startsWith('Key')) {
      key = part.slice(3);
    } else if (part.startsWith('Digit')) {
      key = part.slice(5);
    } else if (CODE_TO_DISPLAY[part]) {
      key = CODE_TO_DISPLAY[part];
    } else {
      key = part;
    }
  }

  if (modifiers.length > 0) {
    return `${modifiers.join('+')}+${key}`;
  }
  return key;
}

export function comboToFullDisplay(combo: string): string {
  const parts = combo.split('+');
  return parts
    .map((part) => {
      if (part === 'Ctrl' || part === 'Alt' || part === 'Meta' || part === 'Shift') return part;
      if (part.startsWith('Key')) return part.slice(3);
      if (part.startsWith('Digit')) return part.slice(5);
      return CODE_TO_DISPLAY[part] || part;
    })
    .join('+');
}
