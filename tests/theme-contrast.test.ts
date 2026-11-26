import { describe, expect, it } from 'vitest';
import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';
import { contrast, parseColor } from '../src/ui/color.js';

// The owner can pick any seed colour. Whatever they pick, text must stay readable on its background.
const PAIRS: Array<[string, string]> = [
  ['onPrimary', 'primary'], ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'], ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'], ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'], ['onErrorContainer', 'errorContainer'],
  ['onSurface', 'surface'], ['onSurfaceVariant', 'surface'], ['onSurfaceVariant', 'surfaceVariant'], ['onBackground', 'background'],
  ['inverseOnSurface', 'inverseSurface'],
];
const SEEDS = ['#4c8c4a', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#000000', '#ffffff', '#808080', '#7a3e9d', '#c2410c', '#0f766e', '#fde68a', '#1e293b'];

describe('theme colours from any seed', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`keeps text at 4.5 to 1 or better on its background in the ${mode} theme`, () => {
      const worst: string[] = [];
      for (const seed of SEEDS) {
        const scheme = themeFromSourceColor(argbFromHex(seed)).schemes[mode].toJSON() as Record<string, number>;
        for (const [fg, bg] of PAIRS) {
          const a = parseColor(hexFromArgb(scheme[fg]))!, b = parseColor(hexFromArgb(scheme[bg]))!;
          const r = contrast(a, b);
          if (r < 4.5) worst.push(`${seed} ${fg} on ${bg}: ${r.toFixed(2)}`);
        }
      }
      expect(worst).toEqual([]);
    });
  }
});

describe('the built-in palette in the stylesheet', () => {
  it('keeps every text colour at 4.5 to 1 or better on its own background, light and dark', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync('src/ui/styles.css', 'utf8');
    const block = (start: string) => { const i = css.indexOf(start); return css.slice(i, css.indexOf('}', i)); };
    const tokens = (text: string) => Object.fromEntries([...text.matchAll(/--md-sys-color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
    const worst: string[] = [];
    for (const [mode, start] of [['light', ':root, [data-theme="light"] {'], ['dark', '[data-theme="dark"] {']] as const) {
      const t = tokens(block(start));
      expect(Object.keys(t).length, mode).toBeGreaterThan(15);
      for (const name of Object.keys(t)) {
        if (!name.startsWith('on-')) continue;
        const bases = name === 'on-surface' || name === 'on-surface-variant' ? Object.keys(t).filter((k) => k.startsWith('surface')) : [name.slice(3)];
        for (const base of bases) {
          if (!t[base]) continue;
          const r = contrast(parseColor(t[name])!, parseColor(t[base])!);
          if (r < 4.5) worst.push(`${mode} ${name} on ${base}: ${r.toFixed(2)}`);
        }
      }
    }
    expect(worst).toEqual([]);
  });
});
