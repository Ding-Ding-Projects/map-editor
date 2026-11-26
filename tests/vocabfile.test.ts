import { describe, expect, it } from 'vitest';
import { makeReplacer, readVocabFile, readWordsCache, scanJson, VocabError, VOCAB_LIMITS } from '../src/ui/vocabfile.js';
import { setWords, t } from '../src/ui/i18n.js';

const ids = new Set(['undo', 'tools']);
const problem = (text: string) => { try { readVocabFile(text, ids); return 'accepted'; } catch (e) { return e instanceof VocabError ? e.problem : 'other'; } };
const file = (entries: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, entries, ...extra });

describe('personal wording file', () => {
  it('accepts the portable shape and the older id shape', () => {
    expect(readVocabFile(file({ Worlds: 'Places' }), ids)).toEqual({ kind: 'words', entries: { Worlds: 'Places' } });
    expect(readVocabFile('﻿' + JSON.stringify({ undo: 'Take it back', tools: { yue: '百寶箱' } }), ids))
      .toEqual({ kind: 'ids', ids: { undo: { en: 'Take it back', yue: 'Take it back' }, tools: { yue: '百寶箱' } } });
  });

  it('refuses the whole file for any one fault, by category', () => {
    expect(problem('{"schemaVersion":1,"entries":{"a":"b"')).toBe('json');
    expect(problem('[1,2]')).toBe('shape');
    expect(problem(file({ a: 'b' }, { note: 'x' }))).toBe('shape');
    expect(problem(JSON.stringify({ schemaVersion: 2, entries: { a: 'b' } }))).toBe('version');
    expect(problem(JSON.stringify({ entries: { a: 'b' } }))).toBe('version');
    expect(problem('{"schemaVersion":1,"entries":{"a":"b","a":"c"}}')).toBe('duplicate');
    expect(problem('{"schemaVersion":1,"entries":{"a":"b","\\u0061":"c"}}')).toBe('duplicate');
    expect(problem(file({ good: 'fine', ['k'.repeat(161)]: 'x' }))).toBe('key');
    expect(problem(file({ '': 'x' }))).toBe('key');
    expect(problem('{"schemaVersion":1,"entries":{"__proto__":"x"}}')).toBe('key');
    expect(problem(file({ constructor: 'x' }))).toBe('key');
    expect(problem(file({ 'a\tb': 'x' }))).toBe('key');
    expect(problem(file({ a: 5 }))).toBe('value');
    expect(problem(file({ a: { en: 'x' } }))).toBe('value');
    expect(problem(file({ a: 'v'.repeat(1001) }))).toBe('value');
    expect(problem(file({ a: 'line\nbreak' }))).toBe('value');
    expect(problem(file({}))).toBe('empty');
    expect(problem(file(Object.fromEntries(Array.from({ length: VOCAB_LIMITS.entries + 1 }, (_, i) => [`k${i}`, 'v']))))).toBe('count');
    expect(problem(file({ a: 'x'.repeat(900) }).padEnd(VOCAB_LIMITS.bytes + 1, ' '))).toBe('size');
    expect(problem(JSON.stringify({ undo: 'ok', nope: 'x' }))).toBe('unknown');
    expect(problem(JSON.stringify({ undo: { en: 'ok', fr: 'non' } }))).toBe('shape');
    expect(problem(JSON.stringify({ undo: { en: '' } }))).toBe('value');
  });

  it('bounds nesting at eight levels', () => {
    expect(() => scanJson('[[[[[[[[1]]]]]]]]')).not.toThrow();
    expect(() => scanJson('[[[[[[[[[1]]]]]]]]]')).toThrow(VocabError);
    expect(() => scanJson('{"a":1} x')).toThrow(VocabError);
    expect(() => scanJson('{"a":"\\"}"}')).not.toThrow();
  });

  it('a damaged or foreign cache gives no words', () => {
    expect(readWordsCache(null)).toEqual({});
    expect(readWordsCache('{broken')).toEqual({});
    expect(readWordsCache(JSON.stringify({ undo: 'x' }))).toEqual({});
    expect(readWordsCache(file({ a: 'b' }))).toEqual({ a: 'b' });
  });

  it('replaces the longest wording first, once, and only at word edges', () => {
    const r = makeReplacer({ Bin: 'Basket', 'Move to bin': 'Throw away', 世界: '地盤', A: 'B', B: 'C' });
    expect(r('Bin (2)')).toBe('Basket (2)');
    expect(r('Cabin Binary')).toBe('Cabin Binary');
    expect(r('Move to bin')).toBe('Throw away');
    expect(r('我嘅世界')).toBe('我嘅地盤');
    expect(r('A')).toBe('B'); // not chained on to C
    expect(makeReplacer({})('same')).toBe('same');
    expect(makeReplacer({ 'a.b': 'x' })('aXb a.b')).toBe('aXb x');
  });

  it('shown wording changes and goes back when cleared', () => {
    const s = { lang: 'en' as const, funnyEn: 1, funnyYue: 1 };
    const before = t(s, 'undo');
    setWords({ [before]: 'Take it back' });
    expect(t(s, 'undo')).toBe('Take it back');
    setWords({});
    expect(t(s, 'undo')).toBe(before);
  });
});
