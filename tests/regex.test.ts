import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, plainHits, LIMITS, cleanFlags } from '../src/ui/regex-core.js';

describe('regex evaluation', () => {
  it('keeps plain text as case-insensitive contains', () => {
    expect(plainHits('GOLD', ['gold block', 'stone', ''])).toEqual([true, false, false]);
    expect(plainHits('  ', ['a', 'b'])).toEqual([true, true]);
    expect(plainHits('.*', ['a.*b', 'ab'])).toEqual([true, false]);
  });
  it('filters a list with flags', () => {
    const r = evaluate({ pattern: '^fill', flags: 'i', texts: ['Fill 8x8', 'refill', 'FILL'] });
    expect(r).toMatchObject({ status: 'ok', hits: [true, false, true] });
    expect(evaluate({ pattern: '^fill', flags: '', texts: ['Fill'] })).toMatchObject({ hits: [false] });
  });
  it('reports invalid patterns instead of throwing', () => {
    const r = evaluate({ pattern: '(unclosed', flags: '' });
    expect(r.status).toBe('invalid');
    expect(evaluate({ pattern: '\\p{L', flags: 'u' }).status).toBe('invalid');
  });
  it('finds matches with numbered and named groups', () => {
    const r = evaluate({ pattern: '(?<x>-?\\d+),(\\d+)', flags: '', sample: 'at 3,4 and -10,20' });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.groupCount).toBe(2);
    expect(r.matches!.map((m) => m.text)).toEqual(['3,4', '-10,20']);
    expect(r.matches![1].groups).toEqual(['-10', '20']);
    expect(r.matches![1].named).toEqual({ x: '-10' });
  });
  it('steps over zero-width matches without looping, including astral characters in u mode', () => {
    const r = evaluate({ pattern: '', flags: 'u', sample: 'a😀b' });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.matches!.map((m) => m.index)).toEqual([0, 1, 3, 4]);
    const b = evaluate({ pattern: '\\b', flags: '', sample: 'one two' });
    expect(b.status === 'ok' && b.matches!.length).toBe(4);
  });
  it('honours multiline and dotAll', () => {
    expect(evaluate({ pattern: '^b', flags: 'm', sample: 'a\nb' })).toMatchObject({ matches: [{ index: 2 }] });
    expect(evaluate({ pattern: '^b', flags: '', sample: 'a\nb' })).toMatchObject({ matches: [] });
    expect(evaluate({ pattern: 'a.b', flags: 's', sample: 'a\nb' })).toMatchObject({ matches: [{ text: 'a\nb' }] });
  });
  it('enforces the limits and truncates many matches', () => {
    expect(evaluate({ pattern: 'x'.repeat(LIMITS.pattern + 1), flags: '' }).status).toBe('limit');
    expect(evaluate({ pattern: 'a', flags: '', sample: 'a'.repeat(LIMITS.sample + 1) }).status).toBe('limit');
    const r = evaluate({ pattern: 'a', flags: '', sample: 'a'.repeat(LIMITS.matches + 10) });
    expect(r).toMatchObject({ status: 'ok', truncated: true });
    expect(r.status === 'ok' && r.matches!.length).toBe(LIMITS.matches);
  });
  it('drops unsupported flags such as g and y', () => {
    expect(cleanFlags('gimyzsu')).toBe('imsu');
  });
});

// Completeness guard: every search field in the UI must be a regex-builder search box listed here.
// A new search input that bypasses searchBox() fails this test.
const SEARCH_SURFACES = ['palette-search', 'settings-search', 'history-search', 'changelog-search', 'notification-search', 'extension-search', 'tab-search', 'activity-search'];
describe('search surface catalogue', () => {
  const dir = path.join(__dirname, '..', 'src');
  const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]).filter((f) => f.endsWith('.ts'));
  const src = files(dir).filter((f) => !f.endsWith('regex.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  it('has no bare search inputs', () => {
    expect(src).not.toMatch(/type="search"|type=search\b|type: .search./);
  });
  it('wires every catalogued field through searchBox', () => {
    const used = [...src.matchAll(/searchBox\('([\w-]+)'/g)].map((m) => m[1]).sort();
    expect(used).toEqual([...SEARCH_SURFACES].sort());
  });
});

describe('ready-made patterns', () => {
  it('each compiles and finds what its label says', async () => {
    const { PRESETS } = await import('../src/ui/regex.js');
    const samples: Record<string, [string, string]> = {
      rxPresetFillReplace: ['Fill 16×1×16 with minecraft:stone', 'Clone 4×4×4'],
      rxPresetSizes: ['Fill 8×1×8 with glass', 'no size here'],
      rxPresetCommits: ['Restored to 1b89e32', 'nothing'],
      rxPresetBlocks: ['minecraft:gold_block', 'gold block'],
      rxPresetDates: ['2026-11-25', 'yesterday'],
    };
    for (const [pattern, key] of PRESETS) {
      const re = new RegExp(pattern, 'iu');
      const [hit, miss] = samples[key];
      expect(re.test(hit), `${key} should match "${hit}"`).toBe(true);
      expect(re.test(miss), `${key} should not match "${miss}"`).toBe(false);
    }
  });
});

describe('personal vocabulary', () => {
  it('accepts known ids as text or per language, and refuses the rest', async () => {
    const { parseVocabulary, setVocabulary, t } = await import('../src/ui/i18n.js');
    const { ok, skipped } = parseVocabulary({ undo: 'Oops, take it back', tools: { yue: '百寶箱' }, nope: 'x', history: 5, about: { en: '' } });
    expect(ok).toEqual({ undo: { en: 'Oops, take it back', yue: 'Oops, take it back' }, tools: { yue: '百寶箱' } });
    expect(skipped.sort()).toEqual(['about', 'history', 'nope']);
    setVocabulary(ok);
    expect(t({ lang: 'en', funnyEn: 5, funnyYue: 5 }, 'undo')).toBe('Oops, take it back');
    expect(t({ lang: 'yue', funnyEn: 1, funnyYue: 1 }, 'tools')).toBe('百寶箱');
    expect(t({ lang: 'en', funnyEn: 1, funnyYue: 1 }, 'tools')).toBe('Tools');
    setVocabulary({});
    expect(() => parseVocabulary([1, 2])).toThrow(/JSON object/);
  });
});
