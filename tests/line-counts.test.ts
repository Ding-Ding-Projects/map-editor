import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script shared with the release build
import { countLines } from '../scripts/line-counts.mjs';

describe('line counts', () => {
  it('counts by kind and part, and separates blank lines', () => {
    const r = countLines([['src/a.ts', 'one\n\n  \nfour\n'], ['tests/a.test.ts', 'x\ny'], ['src/ui/styles.css', 'a{}\n'], ['README.md', '# hi\n']]);
    expect(r.kinds).toEqual({ TypeScript: 6, CSS: 1, Markdown: 1 }); expect(r.parts).toEqual({ Source: 4, Tests: 2, Styles: 1, 'Documents and other': 1 });
    expect(r.total).toBe(8); expect(r.nonBlank).toBe(6); expect(r.files).toBe(4);
  });
  it('leaves out generated files, the design export, lock files and unknown kinds', () => {
    const r = countLines([['design/canvas/Main.dc.html', 'a\nb\n'], ['docs/features/settings/languages.md', 'a\n'], ['docs/postman/x.md', 'a\n'], ['package-lock.json', '{}\n'], ['assets/icon.png', 'binary'], ['docs/features/README.md', 'kept\n']]);
    expect(r.total).toBe(1); expect(r.files).toBe(1);
  });
});

describe('the time estimate', () => {
  it('is a range from two paces, rounded up, and says it is an estimate', async () => {
    // @ts-expect-error plain script shared with the release workflow
    const { estimateDays, estimateText, PACE } = await import('../scripts/line-counts.mjs');
    expect(PACE.slow).toBeLessThan(PACE.fast);
    expect(estimateDays(15600)).toEqual({ from: 195, to: 520 });
    expect(estimateDays(1)).toEqual({ from: 1, to: 1 });
    expect(estimateDays(0)).toEqual({ from: 0, to: 0 });
    expect(estimateDays('junk')).toEqual({ from: 0, to: 0 });
    expect(estimateText(15600)).toMatch(/^Estimate, not a measurement: .* 30 to 80 .* about 195 to 520 working days .* 15,600 lines/);
  });
});

