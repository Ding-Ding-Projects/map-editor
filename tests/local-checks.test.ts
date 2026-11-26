import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain script without types
import { fingerprint, notesFor, indexLines, commitLines, RECORD } from '../scripts/local-checks.mjs';

const rec = (over = {}) => ({
  schemaVersion: 1, ranAt: '2026-11-26T15:00:00Z', fingerprint: 'abc',
  checks: [{ name: 'type check', ok: true }, { name: 'tests', ok: true, passed: 12, failed: 0, skipped: 1 }], ...over,
});

describe('record of checks run before a commit', () => {
  it('states the checks only when the record belongs to the released files', () => {
    const lines = notesFor(rec(), 'abc');
    expect(lines[0]).toContain("author's machine");
    expect(lines).toContain('- tests: passed (12 passed, 0 failed, 1 skipped)');
    expect(lines).toContain('- type check: passed');
  });
  it('claims nothing for a record of other files, a missing record or a broken one', () => {
    for (const r of [rec(), null, { schemaVersion: 2 }, rec({ checks: 'yes' })] as any[]) {
      const lines = notesFor(r, r && r.checks === 'yes' ? 'abc' : 'other');
      expect(lines[0]).toContain('nothing is claimed');
      expect(lines.join('\n')).not.toContain('passed');
    }
  });
  it('reports a failed check as failed', () => {
    const lines = notesFor(rec({ checks: [{ name: 'tests', ok: false, passed: 10, failed: 2, skipped: 0 }] }), 'abc');
    expect(lines[1]).toBe('- tests: FAILED (10 passed, 2 failed, 0 skipped)');
  });
  it('always says the workflow itself ran no tests', () => {
    for (const lines of [notesFor(rec(), 'abc'), notesFor(null, '')]) expect(lines.at(-1)).toContain('runs no tests and no lint');
  });
  it('keeps odd characters in a check name out of the notes', () => {
    expect(notesFor(rec({ checks: [{ name: 'x](http://e) <b>', ok: true }] }), 'abc')[1]).toBe('- xhttpe b: passed');
  });
  it('leaves the record itself out of the fingerprint and ignores order', () => {
    const a = fingerprint(['100644 aa src/a.ts', '100644 bb src/b.ts', `100644 cc ${RECORD}`]);
    const b = fingerprint(['100644 bb src/b.ts', '100644 aa src/a.ts', `100644 dd ${RECORD}`]);
    expect(a).toBe(b);
    expect(fingerprint(['100644 ab src/a.ts', '100644 bb src/b.ts'])).not.toBe(a);
  });
  it('reads the staging area and a commit in the same shape', () => {
    const shape = /^\d{6} [0-9a-f]{40} \S/;
    expect(indexLines()[0]).toMatch(shape);
    expect(commitLines()[0]).toMatch(shape);
  });
});

describe('release workflow', () => {
  const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  it('has no test or lint job and none in a needs chain', () => {
    expect(yml).not.toMatch(/^ {2}(test|lint)\w*:/m);
    for (const m of yml.matchAll(/needs:\s*(.+)/g)) expect(m[1]).not.toMatch(/\b(test|lint)\b/);
    expect(yml).not.toMatch(/npm (run )?(test|lint)|vitest|typecheck/);
  });
  it('resolves the token chain in the agreed order and never prints it', () => {
    const chains = [...yml.matchAll(/GH_TOKEN:\s*(.+)/g)].map((m) => m[1].trim());
    expect(chains.length).toBeGreaterThan(0);
    for (const c of chains) expect(c).toBe('${{ secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN }}');
    expect(yml).not.toMatch(/echo[^\n]*(GH_TOKEN|RELEASE_TOKEN|ORG_TOKEN)/);
  });
  it('puts the local check lines in the release notes', () => {
    expect(yml).toContain('node scripts/local-checks.mjs notes');
  });
});
