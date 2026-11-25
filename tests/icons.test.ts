import { describe, it, expect } from 'vitest';
import { iconName, iconSvg, ICON_NAMES } from '../src/ui/icons.js';
import { STRINGS, t, englishOf } from '../src/ui/i18n.js';

describe('button icons', () => {
  it('chooses an icon from the words on the button', () => {
    const want: Record<string, string> = { 'Copy': 'copy', 'Download': 'download', 'Export…': 'download', 'Upload world (.zip or .mcworld)': 'upload', 'New flat world': 'plus', 'Remove': 'trash', 'Detach': 'trash',
      'Undo': 'undo', 'Roll back': 'undo', 'Refresh': 'refresh', 'Restart to install update': 'refresh', 'Close': 'x', 'Cancel': 'x', 'Open': 'open', 'Manage': 'open', 'Take a tour': 'compass', 'Deploy': 'rocket',
      'Back': 'back', 'Next': 'next', 'OK': 'check', 'Rename': 'pencil', 'Add a passkey': 'plus', 'Choose worlds folder': 'folder', 'Pan': 'hand', 'Select': 'select', 'Pick block': 'pipette', 'Measure': 'ruler', 'Go to': 'target',
      'New virtual disk…': 'disk', 'Encode': 'play', 'Something unheard of': 'next' };
    for (const [label, icon] of Object.entries(want)) expect(iconName(label), label).toBe(icon);
  });
  it('only names icons that exist, and draws them without a fill', () => {
    for (const key of Object.keys(STRINGS)) expect(ICON_NAMES).toContain(iconName(STRINGS[key as keyof typeof STRINGS].en));
    for (const name of ICON_NAMES) { const svg = iconSvg(name); expect(svg).toContain('aria-hidden="true"'); expect(svg).toContain('fill="none"'); expect(svg).not.toMatch(/\d\.\d00\b/); }
  });
  it('finds the English behind a label in every language mode', () => {
    for (const lang of ['en', 'yue', 'both'] as const) {
      const shown = t({ lang, funnyEn: 1, funnyYue: 1 }, 'download');
      expect(iconName(englishOf(shown) ?? shown)).toBe('download');
    }
  });
});
