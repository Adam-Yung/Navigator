import { describe, expect, it } from 'vitest';
import { buildComboString } from '../src/shared/keys';

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    code: 'KeyA',
    ...overrides,
  } as KeyboardEvent;
}

describe('buildComboString', () => {
  it('returns just the code for a plain key', () => {
    expect(buildComboString(makeKeyEvent({ code: 'KeyN' }))).toBe('KeyN');
  });

  it('prepends Ctrl when ctrlKey is true', () => {
    expect(buildComboString(makeKeyEvent({ ctrlKey: true, code: 'KeyN' }))).toBe('Ctrl+KeyN');
  });

  it('prepends Alt when altKey is true', () => {
    expect(buildComboString(makeKeyEvent({ altKey: true, code: 'KeyE' }))).toBe('Alt+KeyE');
  });

  it('prepends Meta when metaKey is true', () => {
    expect(buildComboString(makeKeyEvent({ metaKey: true, code: 'KeyA' }))).toBe('Meta+KeyA');
  });

  it('prepends Shift when shiftKey is true', () => {
    expect(buildComboString(makeKeyEvent({ shiftKey: true, code: 'Enter' }))).toBe('Shift+Enter');
  });

  it('combines multiple modifiers in order', () => {
    const e = makeKeyEvent({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyN' });
    expect(buildComboString(e)).toBe('Ctrl+Alt+Shift+KeyN');
  });

  it('handles all four modifiers', () => {
    const e = makeKeyEvent({ ctrlKey: true, altKey: true, metaKey: true, shiftKey: true, code: 'KeyA' });
    expect(buildComboString(e)).toBe('Ctrl+Alt+Meta+Shift+KeyA');
  });

  it('works with Escape code', () => {
    expect(buildComboString(makeKeyEvent({ code: 'Escape' }))).toBe('Escape');
  });
});
