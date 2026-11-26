import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Setting-style checkboxes are Material checkboxes. The only plain ones left are the row tick boxes of
// selection mode and the flag boxes of the regex builder; a new plain checkbox anywhere else fails here.
const ALLOWED = ['class="nc-pick"', 'class="h-pick"', 'class="sel-box"', 'data-flag='];

describe('plain checkboxes', () => {
  it('are only the selection tick boxes and the regex flags', () => {
    const files = [...readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.ts')).map((f) => `../src/ui/${f}`), '../src/deploy/ui.ts'];
    const found: string[] = [];
    for (const f of files) for (const m of readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/<input type="checkbox"[^>]*>/g)) if (!ALLOWED.some((a) => m[0].includes(a))) found.push(`${f}: ${m[0].slice(0, 80)}`);
    expect(found).toEqual([]);
  });
  it('keeps the deploy app settings on Material checkboxes', () => {
    const ui = readFileSync(new URL('../src/deploy/ui.ts', import.meta.url), 'utf8');
    for (const id of ['vd-ro', 'vd-fixed', 'ob-snd']) expect(ui).toContain(`<md-checkbox id="${id}"`);
  });
});
