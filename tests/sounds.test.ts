import { describe, expect, it } from 'vitest';
import { CUE_ORDER, cueNotes } from '../src/ui/sounds.js';
import { STRINGS } from '../src/ui/i18n.js';

describe('sound list', () => {
  it('names and explains every sound the app can play, in both languages', () => {
    expect([...CUE_ORDER].sort()).toEqual(['create', 'error', 'invalid', 'success', 'tada', 'undo']);
    for (const c of CUE_ORDER) {
      for (const k of [`cue_${c}`, `cueFor_${c}`]) {
        const e = (STRINGS as Record<string, { en: string; yue: string }>)[k];
        expect(e?.en, k).toBeTruthy();
        expect(e?.yue, k).toBeTruthy();
      }
      expect(cueNotes(c).length).toBeGreaterThan(1);
    }
  });
  it('every cue played in the code is one of the listed sounds', async () => {
    const fs = await import('node:fs');
    const src = ['src/ui/main.ts', 'src/ui/worlds.ts', 'src/deploy/ui.ts'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const used = new Set([...src.matchAll(/play\('([a-z]+)'/g)].map((m) => m[1]));
    for (const u of used) expect(CUE_ORDER).toContain(u);
  });
});
