import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error plain script without types
import { check, sectionOf, digest, sourceDir } from '../scripts/check-vocabulary.mjs';

const TEXT = '# Notes\n\n## Before\nx\n\n## Vocabulary and locations\nalpha means beta\n\n## After\ny\n';
function folder(text: string | null, lock: string | null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lock-'));
  mkdirSync(path.join(dir, 'memory'));
  if (text !== null) writeFileSync(path.join(dir, 'memory', 'SHARED_INSTRUCTIONS.md'), text);
  if (lock !== null) writeFileSync(path.join(dir, 'memory', 'SHARED_INSTRUCTIONS.md.lock.json'), lock);
  return dir;
}
const good = JSON.stringify({ version: 1, sha256: digest(sectionOf(TEXT, 'Vocabulary and locations')) });

describe('wording lock', () => {
  it('cuts out exactly one section and ignores Windows line endings', () => {
    expect(sectionOf(TEXT, 'Vocabulary and locations')).toBe('## Vocabulary and locations\nalpha means beta\n');
    expect(sectionOf(TEXT.replace(/\n/g, '\r\n'), 'Vocabulary and locations')).toBe('## Vocabulary and locations\nalpha means beta\n');
    expect(sectionOf(TEXT, 'Missing')).toBeNull();
  });
  it('skips, without failing, where there is no private source', () => {
    expect(check(null).state).toBe('skipped');
    expect(check(folder(null, null)).state).toBe('skipped');
  });
  it('passes when the source matches its lock', () => {
    expect(check(folder(TEXT, good)).state).toBe('ok');
  });
  it('fails when the section grew, the lock is missing or broken, or the section is gone', () => {
    expect(check(folder(TEXT.replace('alpha means beta', 'alpha means beta\ngamma means delta'), good)).state).toBe('stale');
    expect(check(folder(TEXT, null)).state).toBe('stale');
    expect(check(folder(TEXT, '{not json')).state).toBe('stale');
    expect(check(folder('# Notes\n\n## Other\n', good)).state).toBe('stale');
  });
  it('is not disturbed by changes outside the locked section', () => {
    expect(check(folder(TEXT.replace('## After\ny', '## After\nchanged'), good)).state).toBe('ok');
  });
  it('finds the source from the environment first, then from the uncommitted pointer file', () => {
    expect(sourceDir({ AGENT_INSTRUCTIONS_DIR: ' /somewhere ' }, '/nowhere')).toBe('/somewhere');
    expect(sourceDir({}, '/nowhere')).toBeNull();
  });
  it('keeps no hash and no private wording in this repository', () => {
    const src = readFileSync(new URL('../scripts/check-vocabulary.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/[0-9a-f]{40,}/);
  });
  it('is wired into the build and into an executable pre-push hook', () => {
    expect(readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')).toContain("'check-vocabulary.mjs'");
    const hook = new URL('../.githooks/pre-push', import.meta.url);
    expect(readFileSync(hook, 'utf8')).toContain('scripts/check-vocabulary.mjs');
    if (process.platform !== 'win32') expect(statSync(hook).mode & 0o111).not.toBe(0);
    expect(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')).toContain('/.agent/');
  });
});
