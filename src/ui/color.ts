// Colour model for the colour picker: parse any common notation, convert between spaces,
// report gamut clipping and contrast. Pure functions, unit tested.

export interface RGBA { r: number; g: number; b: number; a: number } // sRGB 0..1, unclipped
/** The animated rainbow is a stored marker, never a palette entry or a real colour value. */
export const RAINBOW = 'rainbow' as const;
export type ColorValue = string | typeof RAINBOW;

const NAMED: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const toLin = (c: number) => { const a = Math.abs(c); return Math.sign(c) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4); };
const toGam = (c: number) => { const a = Math.abs(c); return Math.sign(c) * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055); };
const deg = (h: number) => ((h % 360) + 360) % 360;

// ---- OKLab (Björn Ottosson) ----
export function rgbToOklab({ r, g, b }: RGBA) {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
export function oklabToRgb(L: number, A: number, B: number, alpha = 1): RGBA {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return { r: toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), a: alpha };
}

// ---- CIE Lab / LCH (D50, Bradford adapted from sRGB D65) ----
function rgbToXyzD50({ r, g, b }: RGBA) {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  return [0.4360747 * lr + 0.3850649 * lg + 0.1430804 * lb, 0.2225045 * lr + 0.7168786 * lg + 0.0606169 * lb, 0.0139322 * lr + 0.0971045 * lg + 0.7141733 * lb];
}
function xyzD50ToRgb(x: number, y: number, z: number, a: number): RGBA {
  const lr = 3.1338561 * x - 1.6168667 * y - 0.4906146 * z, lg = -0.9787684 * x + 1.9161415 * y + 0.033454 * z, lb = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z;
  return { r: toGam(lr), g: toGam(lg), b: toGam(lb), a };
}
const WD50 = [0.96422, 1, 0.82521];
export function rgbToLab(c: RGBA) {
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [x, y, z] = rgbToXyzD50(c).map((v, i) => f(v / WD50[i]));
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
export function labToRgb(L: number, A: number, B: number, alpha = 1): RGBA {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  return xyzD50ToRgb(inv(fx) * WD50[0], inv(fy) * WD50[1], inv(fz) * WD50[2], alpha);
}

// ---- HSL / HSV / HWB ----
export function rgbToHsv({ r, g, b }: RGBA) {
  const [R, G, B] = [clamp(r), clamp(g), clamp(b)];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: deg(h * 60), s: max ? d / max : 0, v: max };
}
export function hsvToRgb(h: number, s: number, v: number, a = 1): RGBA {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5), g: f(3), b: f(1), a };
}
export function rgbToHsl(c: RGBA) {
  const { h, v, s: sv } = rgbToHsv(c);
  const l = v * (1 - sv / 2);
  return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}
export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToRgb(h, v ? 2 * (1 - l / v) : 0, v, a);
}
export function hwbToRgb(h: number, w: number, bl: number, a = 1): RGBA {
  if (w + bl >= 1) { const g = w / (w + bl); return { r: g, g, b: g, a }; }
  return hsvToRgb(h, 1 - w / (1 - bl), 1 - bl, a);
}

// ---- parse ----
const num = (s: string, pctScale: number) => (s.trim().endsWith('%') ? (parseFloat(s) / 100) * pctScale : parseFloat(s));
const hue = (s: string) => { const t = s.trim(); const v = parseFloat(t); return t.endsWith('turn') ? v * 360 : t.endsWith('rad') ? (v * 180) / Math.PI : t.endsWith('grad') ? v * 0.9 : v; };

/** Parse a colour in any supported notation. Returns undefined, never a guess, for text it cannot read. */
export function parseColor(input: string): RGBA | undefined {
  const s = input.trim().toLowerCase();
  if (!s || s === RAINBOW) return undefined;
  if (NAMED[s]) return parseColor('#' + NAMED[s]);
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  m = /^([a-z]+)\((.*)\)$/.exec(s);
  if (!m) return undefined;
  const fn = m[1];
  const [main, alphaPart] = m[2].includes('/') ? m[2].split('/') : [m[2], undefined];
  const parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = alphaPart !== undefined ? num(alphaPart, 1) : parts.length === 4 && fn !== 'cmyk' ? num(parts.pop()!, 1) : 1;
  if (Number.isNaN(alpha)) return undefined;
  alpha = clamp(alpha);
  const p = parts;
  let out: RGBA | undefined;
  switch (fn) {
    case 'rgb': case 'rgba': if (p.length === 3) out = { r: num(p[0], 255) / 255, g: num(p[1], 255) / 255, b: num(p[2], 255) / 255, a: alpha }; break;
    case 'hsl': case 'hsla': if (p.length === 3) out = hslToRgb(deg(hue(p[0])), num(p[1], 1) > 1 ? num(p[1], 1) / 100 : num(p[1], 1), num(p[2], 1) > 1 ? num(p[2], 1) / 100 : num(p[2], 1), alpha); break;
    case 'hsv': case 'hsb': if (p.length === 3) out = hsvToRgb(deg(hue(p[0])), num(p[1], 100) / 100, num(p[2], 100) / 100, alpha); break;
    case 'hwb': if (p.length === 3) out = hwbToRgb(deg(hue(p[0])), num(p[1], 100) / 100, num(p[2], 100) / 100, alpha); break;
    case 'lab': if (p.length === 3) out = labToRgb(num(p[0], 100), num(p[1], 125), num(p[2], 125), alpha); break;
    case 'lch': if (p.length === 3) { const C = num(p[1], 150), h = (hue(p[2]) * Math.PI) / 180; out = labToRgb(num(p[0], 100), C * Math.cos(h), C * Math.sin(h), alpha); } break;
    case 'oklab': if (p.length === 3) out = oklabToRgb(num(p[0], 1), num(p[1], 0.4), num(p[2], 0.4), alpha); break;
    case 'oklch': if (p.length === 3) { const C = num(p[1], 0.4), h = (hue(p[2]) * Math.PI) / 180; out = oklabToRgb(num(p[0], 1), C * Math.cos(h), C * Math.sin(h), alpha); } break;
    case 'cmyk': if (p.length === 4) { const [c, m2, y, k] = p.map((v) => num(v, 100) / 100); out = { r: (1 - c) * (1 - k), g: (1 - m2) * (1 - k), b: (1 - y) * (1 - k), a: alpha }; } break;
  }
  if (!out || [out.r, out.g, out.b].some((v) => Number.isNaN(v))) return undefined;
  return out;
}

// ---- format ----
export const inGamut = (c: RGBA, eps = 1e-4) => [c.r, c.g, c.b].every((v) => v >= -eps && v <= 1 + eps);
export const clipToGamut = (c: RGBA): RGBA => ({ r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a: clamp(c.a) });
const r2 = (v: number, d = 2) => Number(v.toFixed(d));
const h2 = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
const aSuffix = (a: number) => (a < 1 ? ` / ${r2(a * 100, 1)}%` : '');

export function formats(input: RGBA) {
  const c = clipToGamut(input);
  const { h: hh, s: ss, l } = rgbToHsl(c);
  const v = rgbToHsv(c);
  const lab = rgbToLab(c);
  const ok = rgbToOklab(c);
  const lchC = Math.hypot(lab.a, lab.b), lchH = deg((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  const okC = Math.hypot(ok.a, ok.b), okH = deg((Math.atan2(ok.b, ok.a) * 180) / Math.PI);
  const k = 1 - Math.max(c.r, c.g, c.b);
  const cm = (x: number) => (k >= 1 ? 0 : (1 - x - k) / (1 - k));
  const name = Object.entries(NAMED).find(([, hex]) => hex === `${h2(c.r)}${h2(c.g)}${h2(c.b)}` && c.a === 1)?.[0];
  return {
    name,
    hex: `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`,
    hex8: `#${h2(c.r)}${h2(c.g)}${h2(c.b)}${h2(c.a)}`,
    rgb: `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)}${aSuffix(c.a)})`,
    hsl: `hsl(${r2(hh, 1)} ${r2(ss * 100, 1)}% ${r2(l * 100, 1)}%${aSuffix(c.a)})`,
    hsv: `hsv(${r2(v.h, 1)} ${r2(v.s * 100, 1)}% ${r2(v.v * 100, 1)}%)`,
    hwb: `hwb(${r2(v.h, 1)} ${r2((1 - v.s) * v.v * 100, 1)}% ${r2((1 - v.v) * 100, 1)}%${aSuffix(c.a)})`,
    lab: `lab(${r2(lab.L)}% ${r2(lab.a)} ${r2(lab.b)}${aSuffix(c.a)})`,
    lch: `lch(${r2(lab.L)}% ${r2(lchC)} ${r2(lchH, 1)}${aSuffix(c.a)})`,
    oklab: `oklab(${r2(ok.L * 100)}% ${r2(ok.a, 4)} ${r2(ok.b, 4)}${aSuffix(c.a)})`,
    oklch: `oklch(${r2(ok.L * 100)}% ${r2(okC, 4)} ${r2(okH, 1)}${aSuffix(c.a)})`,
    cmyk: `cmyk(${r2(cm(c.r) * 100, 1)}% ${r2(cm(c.g) * 100, 1)}% ${r2(cm(c.b) * 100, 1)}% ${r2(k * 100, 1)}%)`,
  };
}

/** WCAG 2 contrast ratio between two opaque colours. */
export function contrast(a: RGBA, b: RGBA) {
  const lum = (c: RGBA) => { const [r, g, bl] = [c.r, c.g, c.b].map((v) => toLin(clamp(v))); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Rainbow speed: one global level mapped to one duration (seconds per full turn). */
export const RAINBOW_SPEEDS: Record<number, number> = { 1: 24, 2: 12, 3: 6, 4: 3, 5: 1.5 };
