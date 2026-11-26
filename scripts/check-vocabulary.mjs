#!/usr/bin/env node
// Wording lock. The maintainer keeps a private set of working instructions outside this repository.
// This check hashes one section of that private file at run time and compares it with the lock file
// that sits beside it. Nothing from that file, and no hash of it, is kept in this repository: only
// the method is.
//
//   no private source on this machine   skipped, with the reason printed (anyone may build)
//   source present, lock matches        passes
//   source present, lock differs/absent fails: the section changed and has not been read and re-locked
//
// What this proves: the person building or pushing holds the current private file. It cannot prove
// that anything in it was followed; no build step can.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join('memory', 'SHARED_INSTRUCTIONS.md');
const LOCK = SOURCE + '.lock.json';
const SECTION = 'Vocabulary and locations';

/** Where the private source is, or null. Set AGENT_INSTRUCTIONS_DIR, or write the folder into .agent/instructions-dir (never committed). */
export function sourceDir(env = process.env, repo = root) {
  const fromEnv = (env.AGENT_INSTRUCTIONS_DIR ?? '').trim();
  if (fromEnv) return fromEnv;
  try { const f = readFileSync(path.join(repo, '.agent', 'instructions-dir'), 'utf8').trim(); return f || null; } catch { return null; }
}

/** The text of one "## " section, heading included, up to the next "## " heading. Line endings are normalised. */
export function sectionOf(text, heading) {
  const t = '\n' + text.replace(/\r\n/g, '\n');
  const i = t.indexOf(`\n## ${heading}\n`);
  if (i < 0) return null;
  const j = t.indexOf('\n## ', i + 5);
  return t.slice(i + 1, j < 0 ? t.length : j);
}

export const digest = (s) => createHash('sha256').update(s).digest('hex');

/** { state: 'skipped' | 'ok' | 'stale', reason } */
export function check(dir) {
  if (!dir) return { state: 'skipped', reason: 'no private source is configured on this machine' };
  const src = path.join(dir, SOURCE);
  if (!existsSync(src)) return { state: 'skipped', reason: 'the configured folder holds no private source' };
  const section = sectionOf(readFileSync(src, 'utf8'), SECTION);
  if (section === null) return { state: 'stale', reason: 'the private source no longer has the locked section' };
  let expected = null;
  try { expected = JSON.parse(readFileSync(path.join(dir, LOCK), 'utf8')).sha256; } catch { /* handled below */ }
  if (typeof expected !== 'string') return { state: 'stale', reason: 'the lock file beside the private source is missing or unreadable' };
  return digest(section) === expected ? { state: 'ok', reason: 'the private source matches its lock' } : { state: 'stale', reason: 'the private source changed since it was locked: read it again and re-lock it there' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = check(sourceDir());
  console.log(`Wording lock: ${r.state} (${r.reason}). This shows possession of the current file, not that it was followed.`);
  process.exit(r.state === 'stale' ? 1 : 0);
}
