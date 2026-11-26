// Checking a personal wording file before any of it is used. The whole file is checked first and
// nothing is applied unless all of it passes; a refusal names a category, never the file's contents.

export const VOCAB_LIMITS = { bytes: 256 * 1024, depth: 8, entries: 5000, key: 160, value: 1000 } as const;

export type VocabProblem = 'size' | 'json' | 'duplicate' | 'depth' | 'shape' | 'version' | 'key' | 'value' | 'count' | 'unknown' | 'empty';

export class VocabError extends Error {
  constructor(readonly problem: VocabProblem) { super(problem); }
}

export type IdWords = Record<string, { en?: string; yue?: string }>;
export type VocabFile =
  | { kind: 'words'; entries: Record<string, string> } // the portable shape: wording to replacement
  | { kind: 'ids'; ids: IdWords };                     // the older shape: one entry per string id

const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Walk the JSON text once for what JSON.parse hides: keys given twice, and how deep it nests. */
export function scanJson(text: string): void {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = (): string => {
    const start = i; i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) throw new VocabError('json');
    i++;
    try { return JSON.parse(text.slice(start, i)) as string; } catch { throw new VocabError('json'); }
  };
  const value = (depth: number): void => {
    ws();
    const c = text[i];
    if (c === '{' || c === '[') {
      if (depth + 1 > VOCAB_LIMITS.depth) throw new VocabError('depth');
      const close = c === '{' ? '}' : ']', keys = new Set<string>();
      i++; ws();
      if (text[i] === close) { i++; return; }
      for (;;) {
        ws();
        if (c === '{') {
          if (text[i] !== '"') throw new VocabError('json');
          const k = str();
          if (keys.has(k)) throw new VocabError('duplicate');
          keys.add(k); ws();
          if (text[i] !== ':') throw new VocabError('json');
          i++;
        }
        value(depth + 1); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === close) { i++; return; }
        throw new VocabError('json');
      }
    }
    if (c === '"') { str(); return; }
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 40));
    if (!m) throw new VocabError('json');
    i += m[0].length;
  };
  value(0); ws();
  if (i !== text.length) throw new VocabError('json');
}

const okKey = (k: string) => k.length > 0 && k.length <= VOCAB_LIMITS.key && !UNSAFE.has(k) && !CONTROL.test(k) && k.trim().length > 0;
const okValue = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= VOCAB_LIMITS.value && !CONTROL.test(v) && v.trim().length > 0;

/**
 * Check a wording file completely. `knownIds` are the string ids this app has, used for the older
 * id shape. Throws a VocabError naming the first kind of problem; returns the checked content.
 */
export function readVocabFile(text: string, knownIds: ReadonlySet<string>): VocabFile {
  if (new TextEncoder().encode(text).length > VOCAB_LIMITS.bytes) throw new VocabError('size');
  scanJson(text.replace(/^﻿/, ''));
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new VocabError('json'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new VocabError('shape');
  const root = raw as Record<string, unknown>;

  if ('schemaVersion' in root || 'entries' in root) {
    if (root.schemaVersion !== 1) throw new VocabError('version');
    if (Object.keys(root).some((k) => k !== 'schemaVersion' && k !== 'entries')) throw new VocabError('shape');
    const e = root.entries;
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new VocabError('shape');
    const pairs = Object.entries(e as Record<string, unknown>);
    if (pairs.length > VOCAB_LIMITS.entries) throw new VocabError('count');
    if (!pairs.length) throw new VocabError('empty');
    const entries: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [k, v] of pairs) {
      if (!okKey(k)) throw new VocabError('key');
      if (!okValue(v)) throw new VocabError('value');
      entries[k] = v;
    }
    return { kind: 'words', entries: { ...entries } };
  }

  const pairs = Object.entries(root);
  if (pairs.length > VOCAB_LIMITS.entries) throw new VocabError('count');
  if (!pairs.length) throw new VocabError('empty');
  const ids: IdWords = {};
  for (const [k, v] of pairs) {
    if (!okKey(k)) throw new VocabError('key');
    if (!knownIds.has(k)) throw new VocabError('unknown');
    if (okValue(v)) { ids[k] = { en: v, yue: v }; continue; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new VocabError('value');
    const o = v as Record<string, unknown>;
    if (Object.keys(o).some((x) => x !== 'en' && x !== 'yue') || !Object.keys(o).length) throw new VocabError('shape');
    const out: { en?: string; yue?: string } = {};
    for (const lang of ['en', 'yue'] as const) {
      if (!(lang in o)) continue;
      if (!okValue(o[lang])) throw new VocabError('value');
      out[lang] = o[lang] as string;
    }
    ids[k] = out;
  }
  return { kind: 'ids', ids };
}

/** A checked cache of the portable shape, or nothing when it is missing or damaged. */
export function readWordsCache(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try { const f = readVocabFile(stored, new Set()); return f.kind === 'words' ? f.entries : {}; } catch { return {}; }
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordy = (ch: string) => /[A-Za-z0-9_]/.test(ch);

/**
 * One replacer for a wording map: the longest wording wins, each stretch of text is replaced once,
 * and a wording that starts or ends with a letter only matches at a word edge ("Bin" not "Cabin").
 */
export function makeReplacer(entries: Record<string, string>): (text: string) => string {
  const keys = Object.keys(entries).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (!keys.length) return (s) => s;
  const rx = new RegExp(keys.map((k) => `${wordy(k[0]) ? '(?<![A-Za-z0-9_])' : ''}${escapeRx(k)}${wordy(k[k.length - 1]) ? '(?![A-Za-z0-9_])' : ''}`).join('|'), 'g');
  const map = new Map(Object.entries(entries));
  return (s) => (s.length > 4000 ? s : s.replace(rx, (m) => map.get(m) ?? m));
}
