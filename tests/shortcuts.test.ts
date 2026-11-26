import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SHORTCUTS, TOOL_KEYS, MAP_MODE_KEYS, UNDO_KEY, PALETTE_KEY, hitKey, shownKey, ariaKey, keysInText } from '../src/ui/shortcuts.js';

const press = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../src/ui/menu.ts', import.meta.url), 'utf8');

describe('keyboard shortcuts', () => {
  it('gives every action its own key', () => {
    const combos = Object.values(SHORTCUTS).map((c) => c.toLowerCase());
    expect(new Set(combos).size).toBe(combos.length);
    expect(Object.keys(SHORTCUTS).length).toBe(2 + Object.keys(TOOL_KEYS).length + Object.keys(MAP_MODE_KEYS).length);
  });
  it('matches a press only with exactly the written modifiers', () => {
    expect(hitKey(press('f', { ctrlKey: true, shiftKey: true }), PALETTE_KEY)).toBe(true);
    expect(hitKey(press('F', { metaKey: true, shiftKey: true }), PALETTE_KEY)).toBe(true);
    expect(hitKey(press('f', { ctrlKey: true }), PALETTE_KEY)).toBe(false);
    expect(hitKey(press('f', { ctrlKey: true, shiftKey: true, altKey: true }), PALETTE_KEY)).toBe(false);
    expect(hitKey(press('z', { ctrlKey: true }), UNDO_KEY)).toBe(true);
    expect(hitKey(press('z'), UNDO_KEY)).toBe(false);
    expect(hitKey(press('f'), TOOL_KEYS.fill)).toBe(true);
    expect(hitKey(press('f', { ctrlKey: true }), TOOL_KEYS.fill)).toBe(false);
  });
  it('rewrites the keys named in a sentence on a Mac and leaves other text alone', () => {
    const t = 'Click here or press Ctrl+Shift+F. Ctrl+Z works too, Shift+click selects a range, Ctrl+A selects all.';
    expect(keysInText(t, false)).toBe(t);
    expect(keysInText(t, true)).toBe('Click here or press ⇧⌘F. ⌘Z works too, Shift+click selects a range, ⌘A selects all.');
    expect(keysInText('撳呢度或者 Ctrl+Shift+F，就可以搜', true)).toBe('撳呢度或者 ⇧⌘F，就可以搜');
  });
  it('writes a combo the way the machine does', () => {
    expect(shownKey(PALETTE_KEY, false)).toBe('Ctrl+Shift+F');
    expect(shownKey(PALETTE_KEY, true)).toBe('⇧⌘F');
    expect(shownKey(UNDO_KEY, true)).toBe('⌘Z');
    expect(shownKey('H', true)).toBe('H');
    expect(ariaKey(PALETTE_KEY, false)).toBe('Control+Shift+F');
    expect(ariaKey(PALETTE_KEY, true)).toBe('Meta+Shift+F');
  });
});

describe('what is shown is what is registered', () => {
  // The app must take every key from the table: a combo typed by hand in the UI code could drift from the handler.
  it('has no hand-written combo or key map in the app code', () => {
    const code = main.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/['"`>]Ctrl\+/);
    expect(code).not.toMatch(/\{ f: 'fill'/);
    expect(code).not.toMatch(/\['fill', 'F'\]/);
    expect(code).not.toMatch(/function hitKey/);
  });
  it('reads the table in the key handler, the menu, the palette and the tooltips', () => {
    const handler = main.slice(main.indexOf("document.addEventListener('keydown', (e) => {\n  if (hitKey(e, PALETTE_KEY))"));
    for (const name of ['PALETTE_KEY', 'UNDO_KEY', 'TOOL_KEYS', 'MAP_MODE_KEYS']) expect(handler).toContain(name);
    const shown = main.slice(0, main.length - handler.length);
    for (const name of ['PALETTE_KEY', 'UNDO_KEY', 'TOOL_KEYS', 'MAP_MODE_KEYS']) expect(shown).toContain(name);
    expect(menu).toContain('shownKey(key)');
    expect(menu).toContain('ariaKey(key)');
  });
});
