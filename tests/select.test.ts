import { describe, expect, it } from 'vitest';
import { invert, pickItem, selectAll } from '../src/ui/select.js';

describe('multi-selection', () => {
  it('toggles one item and remembers it as the anchor', () => {
    const s = new Set<number>(); expect(pickItem(s, 2, undefined, false)).toBe(2); expect([...s]).toEqual([2]);
    pickItem(s, 2, 2, false); expect(s.size).toBe(0);
  });
  it('selects a range with Shift, in either direction', () => {
    const s = new Set<number>(); let a = pickItem(s, 4, undefined, false); a = pickItem(s, 1, a, true);
    expect([...s].sort()).toEqual([1, 2, 3, 4]); expect(a).toBe(4);
  });
  it('clears a range with Shift when the anchor was switched off', () => {
    const s = new Set([0, 1, 2, 3]); const a = pickItem(s, 1, undefined, false); pickItem(s, 3, a, true); expect([...s]).toEqual([0]);
  });
  it('selects all, then none, and inverts', () => {
    const s = new Set([1]); selectAll(s, 3); expect(s.size).toBe(3); selectAll(s, 3); expect(s.size).toBe(0);
    s.add(0); invert(s, 3); expect([...s].sort()).toEqual([1, 2]);
  });
});
