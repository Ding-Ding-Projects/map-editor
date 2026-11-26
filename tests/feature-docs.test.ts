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
  it('has a page for every feature in the inventory, with its status and what is missing', () => {
    const inventory = readFileSync('docs/features/INVENTORY.md', 'utf8');
    const ids = [...inventory.matchAll(/^`([a-z0-9-]+)` \| APPLIES/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(100);
    const pages = new Map(docs.filter(([rel]) => rel.startsWith('catalogue/')).map(([rel, text]) => [rel, text]));
    const byEntry = new Map([...pages].map(([, text]) => [/\(entry ([a-z0-9-]+)\)/.exec(text)?.[1], text]));
    for (const id of ids) {
      const text = byEntry.get(id);
      expect(text, id).toBeTruthy();
      expect(text!, id).toMatch(/^Status: \*\*(Built|Partly built|Not built|Does not apply)\*\*/m);
      expect(text!, id).toContain('## What is missing');
    }
    expect(pages.get('catalogue/README.md')!.match(/^- \[/gm)!.length).toBe(ids.length);
  });
  it('links only to files that exist', () => {
    for (const [rel, text] of docs) for (const m of text.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      expect(existsSync(path.join('docs/features', path.dirname(rel), m[1])), `${rel} -> ${m[1]}`).toBe(true);
    }
  });
});
