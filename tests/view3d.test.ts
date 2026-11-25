import { describe, expect, it } from 'vitest';
import { turnCell } from '../src/ui/view3d.js';

describe('3D view turns', () => {
  it('rotates cells a quarter turn at a time and comes back after four', () => {
    const sx = 3, sz = 2;
    expect(turnCell(0, 0, sx, sz, 1)).toEqual([1, 0]);
    expect(turnCell(2, 1, sx, sz, 2)).toEqual([0, 0]);
    let p: [number, number] = [2, 0];
    let w = sx, d = sz;
    for (let t = 0; t < 4; t++) { p = turnCell(p[0], p[1], w, d, 1); [w, d] = [d, w]; }
    expect(p).toEqual([2, 0]);
  });
});
