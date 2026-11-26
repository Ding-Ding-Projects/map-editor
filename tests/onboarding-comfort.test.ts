import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMFORT } from '../src/ui/onboarding.js';

describe('first-run comfort step', () => {
  it('offers the six comfort switches, each with its own id, preference and note', () => {
    expect(COMFORT.map((c) => c[1])).toEqual(['dark', 'reduceMotion', 'largeText', 'focusMode', 'sounds', 'takeovers']);
    expect(new Set(COMFORT.map((c) => c[0])).size).toBe(COMFORT.length);
    for (const [, , label, note] of COMFORT) expect(note).toBe(label === 'soundEffects' ? 'soundEffectsNote' : `${label}Note`);
  });
  it('sets preferences the app really keeps and applies', () => {
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    const defaults = /^const defaults: Prefs = \{(.*)\};$/m.exec(main)![1];
    for (const [, pref] of COMFORT) expect(defaults, pref).toMatch(new RegExp(`\\b${pref}: `));
  });
  it('is drawn the same way on the design board', () => {
    const board = readFileSync(new URL('../design/canvas/FirstRun.dc.html', import.meta.url), 'utf8');
    for (const name of ['Dark theme', 'Reduce motion', 'Large text', 'Focus mode', 'Sound effects', 'Full-screen result cards']) expect(board).toContain(`'${name}'`);
    for (const gone of ['Low stimulation', 'Time awareness', 'Momentum', 'Owner account']) expect(board).not.toContain(gone);
  });
});
