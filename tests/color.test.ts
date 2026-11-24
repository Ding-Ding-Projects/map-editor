import { describe, it, expect } from 'vitest';
import { parseColor, formats, contrast, inGamut, RAINBOW } from '../src/ui/color.js';

const close = (a: number, b: number, eps = 0.004) => Math.abs(a - b) <= eps;

describe('colour translator', () => {
  it('reads every supported notation for the same colour', () => {
    const want = parseColor('#2e6b2c')!;
    const f = formats(want);
    for (const s of [f.hex, f.hex8, f.rgb, f.hsl, f.hsv, f.hwb, f.lab, f.lch, f.oklab, f.oklch, f.cmyk]) {
      const got = parseColor(s);
      expect(got, s).toBeDefined();
      expect(close(got!.r, want.r) && close(got!.g, want.g) && close(got!.b, want.b), `${s} -> ${JSON.stringify(got)}`).toBe(true);
    }
  });
  it('reads names, short hex, alpha and modern slash syntax', () => {
    expect(formats(parseColor('rebeccapurple')!).hex).toBe('#663399');
    expect(formats(parseColor('#f00')!).name).toBe('red');
    expect(parseColor('rgb(0 0 0 / 50%)')!.a).toBeCloseTo(0.5);
    expect(parseColor('rgba(255, 0, 0, 0.25)')!.a).toBeCloseTo(0.25);
    expect(parseColor('hsl(0.5turn 100% 50%)')!.g).toBeCloseTo(1);
  });
  it('never guesses at unreadable text and treats the rainbow marker as not a colour', () => {
    expect(parseColor('greenish')).toBeUndefined();
    expect(parseColor('rgb(1 2)')).toBeUndefined();
    expect(parseColor(RAINBOW)).toBeUndefined();
  });
  it('reports out-of-gamut colours instead of silently clipping', () => {
    expect(inGamut(parseColor('oklch(70% 0.4 150)')!)).toBe(false);
    expect(inGamut(parseColor('oklch(70% 0.05 150)')!)).toBe(true);
  });
  it('computes WCAG contrast', () => {
    expect(contrast(parseColor('white')!, parseColor('black')!)).toBeCloseTo(21, 1);
    expect(contrast(parseColor('#777')!, parseColor('white')!)).toBeCloseTo(4.48, 1);
  });
});
