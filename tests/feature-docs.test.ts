import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script shared with the command line
import { featureDocs } from '../scripts/feature-docs.mjs';

describe('feature documentation', () => {
  const docs = featureDocs() as Array<[string, string]>;
  it('has one file per article, an index per category and a top index, all current', () => {
    expect(docs.length).toBeGreaterThan(14);
    for (const [rel, text] of docs) expect(readFileSync(path.join('docs/features', rel), 'utf8'), `${rel} is out of date: run node scripts/feature-docs.mjs`).toBe(text);
  });
  it('links only to files that exist', () => {
    for (const [rel, text] of docs) for (const m of text.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      expect(existsSync(path.join('docs/features', path.dirname(rel), m[1])), `${rel} -> ${m[1]}`).toBe(true);
    }
  });
});
