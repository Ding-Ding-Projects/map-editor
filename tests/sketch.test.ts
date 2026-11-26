import { describe, expect, it } from 'vitest';
import { cleanStrokes, eraseAt, PENS, snapLine, strokeSvg, toSvg, type Stroke } from '../src/ui/sketch.js';

const line = (pts: number[]): Stroke => ({ pen: 'pen', color: '#c62828', width: 2, opacity: 1, points: pts });

describe('sketch board', () => {
  it('has seven pens with their own width and strength', () => {
    expect(PENS).toHaveLength(7); expect(new Set(PENS.map((p) => p.id)).size).toBe(7);
  });
  it('snaps a line to eight directions when Shift is held', () => {
    expect(snapLine(0, 0, 100, 4)).toEqual([100.1, 0]); expect(snapLine(0, 0, 3, 50)[0]).toBeCloseTo(0, 5);
    const [x, y] = snapLine(10, 10, 60, 55); expect(x - 10).toBeCloseTo(y - 10, 1); expect(snapLine(5, 5, 5, 5)).toEqual([5, 5]);
  });
  it('erases only the touched part and splits a stroke cut in the middle', () => {
    const s = [line([0, 0, 10, 0, 20, 0, 30, 0, 40, 0, 50, 0, 60, 0])];
    const cut = eraseAt(s, 30, 0, 4);
    expect(cut).toHaveLength(2); expect(cut[0].points).toEqual([0, 0, 10, 0, 20, 0]); expect(cut[1].points).toEqual([40, 0, 50, 0, 60, 0]);
    expect(eraseAt(s, 30, 200, 4)).toBe(s);
    expect(eraseAt([line([0, 0, 2, 0])], 1, 0, 10)).toEqual([]);
  });
  it('exports a standalone SVG and never trusts a stored colour or pen name', () => {
    const svg = toSvg([line([1, 2, 3.14159, 4])]);
    expect(svg).toContain('viewBox="0 0 960 540"'); expect(svg).toContain('d="M1 2L3.1 4"'); expect(svg).toContain('stroke="#c62828"');
    const bad = strokeSvg({ pen: '"><script>', color: 'red" onload="x', width: 2, opacity: 1, points: [0, 0, 1, 1] });
    expect(bad).not.toContain('<script>'); expect(bad).not.toContain('onload'); expect(bad).toContain('stroke="#000000"');
  });
  it('drops damaged strokes from a save', () => {
    expect(cleanStrokes('nope')).toEqual([]);
    expect(cleanStrokes([line([0, 0, 1, 1]), { pen: 'pen' }, { ...line([0, 0, 1]), points: [0, 0, 1] }, { ...line([0, 0]), width: 'x' }, null])).toHaveLength(1);
    expect(cleanStrokes([{ ...line([0, 0, 1, 1]), width: 9999, color: 'javascript:1' }])[0]).toMatchObject({ width: 60, color: '#000000' });
  });
});
