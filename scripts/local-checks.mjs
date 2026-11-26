#!/usr/bin/env node
// The release workflow runs no tests. What was checked is whatever the author ran on their own machine
// before committing, so that is what the release notes may state, and only when it can be tied to the
// exact files in the commit.
//
//   node scripts/local-checks.mjs record   run the type check and the tests, write local-checks.json
//   node scripts/local-checks.mjs notes    print the lines for the release notes
//
// The record carries a fingerprint of every tracked file except itself. `notes` works the fingerprint out
// again from the commit; if it differs, the record belongs to other files and nothing is claimed.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECORD = 'local-checks.json';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fingerprint of "mode hash path" lines, the record itself left out. */
export function fingerprint(lines) {
  const kept = lines.filter((l) => l && !l.endsWith(' ' + RECORD)).sort();
  return createHash('sha256').update(kept.join('\n')).digest('hex');
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });

/** From the staging area: what the next commit will hold. */
export function indexLines(cwd = root) {
  return git(['ls-files', '-s'], cwd).split('\n').filter(Boolean).map((l) => {
    const [meta, file] = l.split('\t');
    const [mode, hash] = meta.split(' ');
    return `${mode} ${hash} ${file}`;
  });
}

/** From a commit. */
export function commitLines(cwd = root, rev = 'HEAD') {
  return git(['ls-tree', '-r', rev], cwd).split('\n').filter(Boolean).map((l) => {
    const [meta, file] = l.split('\t');
    const [mode, , hash] = meta.split(' ');
    return `${mode} ${hash} ${file}`;
  });
}

const NONE = 'Checks before this commit: no record matches these files, so nothing is claimed.';
const ALWAYS = 'This workflow builds and publishes; it runs no tests and no lint, so a release existing is not a test result.';

/** The release-note lines for a record and the fingerprint of the commit being released. */
export function notesFor(record, print) {
  if (!record || record.schemaVersion !== 1 || record.fingerprint !== print || !Array.isArray(record.checks)) return [NONE, ALWAYS];
  const out = [`Checks run on the author's machine before this commit (${record.ranAt}), not by this workflow:`];
  for (const c of record.checks) {
    const name = String(c.name).replace(/[^\w .-]/g, '').slice(0, 40);
    if (c.name === 'tests' && Number.isInteger(c.passed)) {
      out.push(`- ${name}: ${c.ok ? 'passed' : 'FAILED'} (${c.passed} passed, ${c.failed | 0} failed, ${c.skipped | 0} skipped)`);
    } else out.push(`- ${name}: ${c.ok ? 'passed' : 'FAILED'}`);
  }
  out.push(ALWAYS);
  return out;
}

function record() {
  // Tests read the working folder, the fingerprint reads the staging area: they must hold the same files.
  const dirty = git(['diff', '--name-only'], root).split('\n').filter((f) => f && f !== RECORD);
  if (dirty.length) {
    console.error(`These changed files are not staged, so the checks would not describe the commit:\n  ${dirty.join('\n  ')}\nStage them (git add) and run this again.`);
    process.exit(2);
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const type = spawnSync(npx, ['tsc', '--noEmit'], { cwd: root, stdio: 'inherit' });
  const run = spawnSync(npx, ['vitest', 'run', '--reporter=json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 });
  let passed = null, failed = null, skipped = null;
  try {
    const j = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
    passed = j.numPassedTests; failed = j.numFailedTests; skipped = (j.numPendingTests | 0) + (j.numTodoTests | 0);
  } catch { /* the counts stay unknown; the exit code still says passed or failed */ }
  const checks = [
    { name: 'type check', ok: type.status === 0 },
    { name: 'tests', ok: run.status === 0, ...(passed === null ? {} : { passed, failed, skipped }) },
  ];
  const rec = { schemaVersion: 1, ranAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), fingerprint: fingerprint(indexLines()), checks };
  writeFileSync(path.join(root, RECORD), JSON.stringify(rec, null, 2) + '\n');
  console.log(notesFor(rec, rec.fingerprint).join('\n'));
  console.log(`\nWrote ${RECORD}. Add it to the same commit: git add ${RECORD}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

function notes() {
  let rec = null;
  try { if (existsSync(path.join(root, RECORD))) rec = JSON.parse(readFileSync(path.join(root, RECORD), 'utf8')); } catch { rec = null; }
  let print = '';
  try { print = fingerprint(commitLines()); } catch { /* no git here: nothing can be tied to the commit */ }
  console.log(notesFor(rec, print).join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'record') record();
  else if (mode === 'notes') notes();
  else { console.error('Usage: node scripts/local-checks.mjs record|notes'); process.exit(64); }
}
