// Infinite colour picker: a continuous saturation and value field, hue and alpha sliders,
// a translator that accepts any common notation, every format with copy, gamut and contrast
// reporting, recent colours as an add-on, and the animated rainbow as a separate marker.
import { parseColor, formats, contrast, inGamut, hsvToRgb, rgbToHsv, RAINBOW, RAINBOW_SPEEDS, type ColorValue, type RGBA } from './color.js';

export interface PickerOptions {
  value: ColorValue;
  label: string;
  allowRainbow?: boolean;
  rainbowSpeed: number; // global level 1..5
  surface: string; // colour the result is checked against for contrast
  onChange: (v: ColorValue) => void;
  onSpeed?: (level: number) => void;
  /** Puts the picker's own fixed phrases into the chosen language; left out, they stay in English. */
  text?: (english: string) => string;
}

const RECENT_KEY = 'map-editor.recent-colours.v1';
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function recent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } }
function pushRecent(hex: string) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recent().filter((x) => x !== hex)].slice(0, 12))); } catch { /* storage blocked */ } }

export function colorPicker(host: HTMLElement, o: PickerOptions) {
  const T = o.text ?? ((x: string) => x);
  let rainbow = o.value === RAINBOW;
  let rgba: RGBA = (!rainbow && parseColor(o.value)) || { r: 0.18, g: 0.42, b: 0.17, a: 1 };
  let hsv = rgbToHsv(rgba);
  let typedNote = '';

  host.innerHTML = `<div class="picker" role="group" aria-label="${esc(o.label)}">
    <div class="picker-field" tabindex="0" role="slider" aria-label="${esc(T('Saturation and brightness'))}" aria-valuetext="">
      <canvas width="280" height="160"></canvas><span class="picker-thumb" aria-hidden="true"></span></div>
    <label class="picker-row"><span>${esc(T('Hue'))}</span><md-slider class="h" min="0" max="360" step="0.1" labeled></md-slider></label>
    <label class="picker-row"><span>${esc(T('Opacity'))}</span><md-slider class="a" min="0" max="100" step="1" labeled></md-slider></label>
    <md-outlined-text-field class="any" label="${esc(T('Any colour: name, HEX, rgb(), hsl(), oklch(), cmyk()…'))}"></md-outlined-text-field>
    <div class="picker-note" aria-live="polite"></div>
    <div class="picker-formats"></div>
    ${o.allowRainbow ? `<div class="picker-rainbow"><md-outlined-button class="rb">${esc(T('Animated rainbow'))}</md-outlined-button>
      <label class="picker-row"><span>${esc(T('Rainbow speed'))}</span><md-slider class="sp" min="1" max="5" step="1" ticks labeled value="${o.rainbowSpeed}"></md-slider></label></div>` : ''}
    <div class="picker-recent" aria-label="${esc(T('Recent colours'))}"></div>
  </div>`;
  const field = host.querySelector<HTMLElement>('.picker-field')!;
  const canvas = field.querySelector('canvas')!;
  const thumb = field.querySelector<HTMLElement>('.picker-thumb')!;
  const hS = host.querySelector('.h') as HTMLInputElement, aS = host.querySelector('.a') as HTMLInputElement;
  const any = host.querySelector('.any') as HTMLInputElement;

  function paintField() {
    const ctx = canvas.getContext('2d')!;
    const { width: w, height: h } = canvas;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = hsvToRgb(hsv.h, x / (w - 1), 1 - y / (h - 1));
      const i = (y * w + x) * 4;
      img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function emit() {
    const f = formats(rgba);
    if (!rainbow) { o.onChange(f.hex8.endsWith('ff') ? f.hex : f.hex8); pushRecent(f.hex); }
    else o.onChange(RAINBOW);
    render();
  }

  function render() {
    const f = formats(rgba);
    field.classList.toggle('rainbow', rainbow);
    thumb.style.left = `${hsv.s * 100}%`; thumb.style.top = `${(1 - hsv.v) * 100}%`;
    field.setAttribute('aria-valuetext', rainbow ? 'Animated rainbow' : `${f.hex}, saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
    hS.value = String(hsv.h); aS.value = String(Math.round(rgba.a * 100));
    const surf = parseColor(o.surface);
    const ratio = surf ? contrast(rgba, surf) : undefined;
    host.querySelector('.picker-note')!.textContent = rainbow
      ? T('Animated rainbow: cycles every hue. With reduced motion it stays on one hue.')
      : [typedNote, ratio ? `${T('Contrast against the background')} ${ratio.toFixed(2)}:1 ${T(ratio >= 4.5 ? '(passes 4.5:1 for text)' : ratio >= 3 ? '(passes 3:1 for large text and icons only)' : '(too low for text)')}` : ''].filter(Boolean).join(' ');
    const rows: Array<[string, string]> = [['Name', f.name ?? T('No exact CSS name')], ['HEX', f.hex], ['HEX8', f.hex8], ['RGB', f.rgb], ['HSL', f.hsl], ['HSV', f.hsv], ['HWB', f.hwb], ['LAB', f.lab], ['LCH', f.lch], ['OKLab', f.oklab], ['OKLCH', f.oklch], ['CMYK', f.cmyk]];
    host.querySelector('.picker-formats')!.innerHTML = rows.map(([k, v]) => `<div class="picker-fmt"><span>${k === 'Name' ? esc(T('Name')) : k}</span><code>${esc(v)}</code>${k !== 'Name' || f.name ? `<md-text-button data-copy="${esc(v)}" aria-label="${esc(T('Copy'))} ${k}">${esc(T('Copy'))}</md-text-button>` : ''}</div>`).join('');
    host.querySelectorAll<HTMLElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => navigator.clipboard?.writeText(b.dataset.copy!).catch(() => undefined)));
    host.querySelector('.picker-recent')!.innerHTML = recent().map((hx) => `<button class="picker-swatch" style="background:${esc(hx)}" data-hex="${esc(hx)}" aria-label="Use ${esc(hx)}"></button>`).join('');
    host.querySelectorAll<HTMLElement>('[data-hex]').forEach((b) => b.addEventListener('click', () => { rainbow = false; rgba = parseColor(b.dataset.hex!)!; hsv = rgbToHsv(rgba); typedNote = ''; paintField(); emit(); }));
  }

  const fromPointer = (e: PointerEvent) => {
    const r = field.getBoundingClientRect();
    hsv = { ...hsv, s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    rainbow = false; typedNote = ''; rgba = hsvToRgb(hsv.h, hsv.s, hsv.v, rgba.a); emit();
  };
  field.addEventListener('pointerdown', (e) => { field.setPointerCapture(e.pointerId); fromPointer(e); });
  field.addEventListener('pointermove', (e) => { if (field.hasPointerCapture(e.pointerId)) fromPointer(e); });
  field.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!d[e.key]) return;
    e.preventDefault();
    hsv = { ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[e.key][0])), v: Math.min(1, Math.max(0, hsv.v + d[e.key][1])) };
    rainbow = false; rgba = hsvToRgb(hsv.h, hsv.s, hsv.v, rgba.a); emit();
  });
  hS.addEventListener('input', () => { hsv = { ...hsv, h: Number(hS.value) }; rainbow = false; rgba = hsvToRgb(hsv.h, hsv.s, hsv.v, rgba.a); paintField(); emit(); });
  aS.addEventListener('input', () => { rgba = { ...rgba, a: Number(aS.value) / 100 }; rainbow = false; emit(); });
  any.addEventListener('change', () => {
    const p = parseColor(any.value);
    if (!p) { typedNote = `"${any.value}" is not a colour this picker can read. Nothing was changed.`; render(); return; }
    typedNote = inGamut(p) ? '' : `That colour is outside what screens can show (sRGB). It is shown clipped to ${formats(p).hex}.`;
    rainbow = false; rgba = { ...p, r: Math.min(1, Math.max(0, p.r)), g: Math.min(1, Math.max(0, p.g)), b: Math.min(1, Math.max(0, p.b)) }; hsv = rgbToHsv(rgba); paintField(); emit();
  });
  host.querySelector('.rb')?.addEventListener('click', () => { rainbow = true; emit(); });
  host.querySelector('.sp')?.addEventListener('change', (e) => o.onSpeed?.(Number((e.target as HTMLInputElement).value)));

  paintField(); render();
}

/** Applies the single global rainbow duration; reduced motion is handled in CSS. */
export function applyRainbowSpeed(level: number) {
  document.documentElement.style.setProperty('--rainbow-duration', `${RAINBOW_SPEEDS[level] ?? RAINBOW_SPEEDS[3]}s`);
}
