// Sketch board: seven pens, an eraser that removes only the part it touches, straight lines with
// Shift, undo and redo, and export as SVG or PNG. The drawing is kept on this device.

export interface Stroke { pen: string; color: string; width: number; opacity: number; points: number[] }
export interface PenKind { id: string; width: number; opacity: number; cap: 'round' | 'square' | 'butt' }

export const PENS: PenKind[] = [
  { id: 'pen', width: 3, opacity: 1, cap: 'round' }, { id: 'fine', width: 1.5, opacity: 1, cap: 'round' }, { id: 'marker', width: 8, opacity: 1, cap: 'round' },
  { id: 'highlighter', width: 18, opacity: 0.35, cap: 'butt' }, { id: 'pencil', width: 2, opacity: 0.6, cap: 'round' }, { id: 'brush', width: 12, opacity: 0.85, cap: 'round' }, { id: 'chalk', width: 6, opacity: 0.5, cap: 'square' },
];
export const COLORS = ['#1b1f1a', '#c62828', '#ef6c00', '#f9a825', '#2e7d32', '#1565c0', '#6a1b9a', '#ffffff'];
export const BOARD = { w: 960, h: 540 };
const KEY = 'map-editor.sketch.v1';

/** With Shift held, the line from the start snaps to the nearest of eight directions. */
export function snapLine(x0: number, y0: number, x: number, y: number): [number, number] {
  const dx = x - x0, dy = y - y0, len = Math.hypot(dx, dy);
  if (!len) return [x, y];
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.round((x0 + Math.cos(a) * len) * 10) / 10, Math.round((y0 + Math.sin(a) * len) * 10) / 10];
}

/** Removes the points within r of (x, y); a stroke cut in the middle becomes two strokes. Returns the same array when nothing was touched. */
export function eraseAt(strokes: Stroke[], x: number, y: number, r: number): Stroke[] {
  let touched = false; const out: Stroke[] = [];
  for (const s of strokes) {
    const reach = r + s.width / 2; let run: number[] = []; let hit = false;
    const flush = () => { if (run.length >= 4) out.push({ ...s, points: run }); run = []; };
    for (let i = 0; i < s.points.length; i += 2) {
      if (Math.hypot(s.points[i] - x, s.points[i + 1] - y) <= reach) { hit = true; flush(); } else run.push(s.points[i], s.points[i + 1]);
    }
    if (!hit) { out.push(s); continue; }
    touched = true; flush();
  }
  return touched ? out : strokes;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const capOf = (pen: string) => PENS.find((p) => p.id === pen)?.cap ?? 'round';
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');
const pathOf = (s: Stroke) => { let d = ''; for (let i = 0; i < s.points.length; i += 2) d += `${i ? 'L' : 'M'}${Math.round(s.points[i] * 10) / 10} ${Math.round(s.points[i + 1] * 10) / 10}`; return d; };
export const strokeSvg = (s: Stroke) => `<path d="${pathOf(s)}" fill="none" stroke="${safeColor(s.color)}" stroke-width="${Number(s.width) || 1}" stroke-opacity="${Math.min(1, Math.max(0, Number(s.opacity) || 1))}" stroke-linecap="${capOf(s.pen)}" stroke-linejoin="round" data-pen="${esc(s.pen)}"/>`;

/** The whole drawing as a standalone SVG file. */
export function toSvg(strokes: Stroke[], w = BOARD.w, h = BOARD.h, background = '#ffffff'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${safeColor(background)}"/>${strokes.map(strokeSvg).join('')}</svg>\n`;
}

/** Keeps only well-formed strokes, so a damaged or hand-edited save cannot break the board. */
export function cleanStrokes(v: unknown): Stroke[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is Stroke => s && typeof s === 'object' && typeof s.pen === 'string' && typeof s.color === 'string' && Number.isFinite(s.width) && Number.isFinite(s.opacity) && Array.isArray(s.points) && s.points.length >= 2 && s.points.length % 2 === 0 && s.points.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))
    .slice(0, 2000).map((s) => ({ pen: s.pen.slice(0, 20), color: safeColor(s.color), width: Math.min(60, Math.max(0.5, s.width)), opacity: Math.min(1, Math.max(0.05, s.opacity)), points: s.points.slice(0, 20000) }));
}

interface SketchText { (k: string, v?: Record<string, string | number>): string }

export function sketchBoard(host: HTMLElement, t: SketchText, escHtml: (s: unknown) => string, notify: (text: string, error?: boolean) => void): void {
  let strokes: Stroke[] = []; try { strokes = cleanStrokes(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* start empty */ }
  const undo: Stroke[][] = [], redo: Stroke[][] = [];
  let pen = PENS[0].id, color = COLORS[0], erasing = false, shift = false;
  host.innerHTML = `<div class="sk-bar" role="toolbar" aria-label="${escHtml(t('sketchTools'))}">
      <span class="sk-pens">${PENS.map((p, i) => `<button type="button" class="sk-pen" data-pen="${p.id}" aria-pressed="false" title="${escHtml(t(`sketch_${p.id}`))} (${i + 1})"><span class="sk-nib" style="--w:${Math.min(16, p.width + 2)}px;--o:${p.opacity}"></span><span class="sk-name">${escHtml(t(`sketch_${p.id}`))}</span></button>`).join('')}
        <button type="button" class="sk-pen" data-erase aria-pressed="false" title="${escHtml(t('sketchEraser'))} (E)"><span class="sk-nib sk-rub"></span><span class="sk-name">${escHtml(t('sketchEraser'))}</span></button></span>
      <span class="sk-colors" role="group" aria-label="${escHtml(t('sketchColour'))}">${COLORS.map((c) => `<button type="button" class="sk-color" data-color="${c}" aria-pressed="false" aria-label="${escHtml(t('sketchColour'))} ${c}" style="--c:${c}"></button>`).join('')}</span>
      <span class="sk-acts"><md-text-button id="sk-undo">${escHtml(t('undo'))}</md-text-button><md-text-button id="sk-redo">${escHtml(t('sketchRedo'))}</md-text-button><md-text-button id="sk-clear">${escHtml(t('sketchClear'))}</md-text-button>
        <md-outlined-button id="sk-svg">${escHtml(t('sketchSvg'))}</md-outlined-button><md-outlined-button id="sk-png">${escHtml(t('sketchPng'))}</md-outlined-button></span></div>
    <svg class="sk-board" viewBox="0 0 ${BOARD.w} ${BOARD.h}" tabindex="0" role="img" aria-label="${escHtml(t('sketchBoard'))}"><rect width="${BOARD.w}" height="${BOARD.h}" fill="#ffffff"/><g id="sk-ink"></g><g id="sk-live"></g></svg>
    <p class="muted sk-hint" id="sk-status" role="status"></p>`;
  const svg = host.querySelector<SVGSVGElement>('.sk-board')!, ink = host.querySelector('#sk-ink')!, live = host.querySelector('#sk-live')!;
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(strokes)); } catch { /* not kept */ } };
  const paint = () => {
    ink.innerHTML = strokes.map(strokeSvg).join('');
    host.querySelectorAll<HTMLElement>('[data-pen]').forEach((b) => b.setAttribute('aria-pressed', String(!erasing && b.dataset.pen === pen)));
    host.querySelector('[data-erase]')!.setAttribute('aria-pressed', String(erasing));
    host.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
    host.querySelector('#sk-undo')!.toggleAttribute('disabled', !undo.length); host.querySelector('#sk-redo')!.toggleAttribute('disabled', !redo.length);
    host.querySelector('#sk-status')!.textContent = `${t('sketchCount', { n: strokes.length })} ${shift ? t('sketchShiftOn') : t('sketchHint')}`;
  };
  const commit = (next: Stroke[]) => { if (next === strokes) return; undo.push(strokes); if (undo.length > 100) undo.shift(); redo.length = 0; strokes = next; keep(); paint(); };
  const at = (e: PointerEvent): [number, number] => { const r = svg.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * BOARD.w * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * BOARD.h * 10) / 10]; };
  let cur: Stroke | undefined, before: Stroke[] | undefined;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; e.preventDefault(); svg.setPointerCapture(e.pointerId); svg.focus();
    const [x, y] = at(e);
    if (erasing) { before = strokes; strokes = eraseAt(strokes, x, y, 10); ink.innerHTML = strokes.map(strokeSvg).join(''); return; }
    const k = PENS.find((p) => p.id === pen)!; cur = { pen, color, width: k.width, opacity: k.opacity, points: [x, y, x, y] };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!svg.hasPointerCapture(e.pointerId)) return;
    const [x, y] = at(e);
    if (erasing && before) { strokes = eraseAt(strokes, x, y, 10); ink.innerHTML = strokes.map(strokeSvg).join(''); return; }
    if (!cur) return;
    if (e.shiftKey || shift) { const [sx, sy] = snapLine(cur.points[0], cur.points[1], x, y); cur.points = [cur.points[0], cur.points[1], sx, sy]; } else cur.points.push(x, y);
    live.innerHTML = strokeSvg(cur);
  });
  const end = () => {
    if (erasing && before) { const after = strokes; strokes = before; before = undefined; commit(after); return; }
    if (cur) { const s = cur; cur = undefined; live.innerHTML = ''; commit([...strokes, s]); }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  const step = (from: Stroke[][], to: Stroke[][]) => { const s = from.pop(); if (!s) return; to.push(strokes); strokes = s; keep(); paint(); };
  host.querySelector('#sk-undo')!.addEventListener('click', () => step(undo, redo));
  host.querySelector('#sk-redo')!.addEventListener('click', () => step(redo, undo));
  host.querySelector('#sk-clear')!.addEventListener('click', () => commit(strokes.length ? [] : strokes));
  host.querySelectorAll<HTMLElement>('[data-pen]').forEach((b) => b.addEventListener('click', () => { pen = b.dataset.pen!; erasing = false; paint(); }));
  host.querySelector('[data-erase]')!.addEventListener('click', () => { erasing = !erasing; paint(); });
  host.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.addEventListener('click', () => { color = b.dataset.color!; erasing = false; paint(); }));
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  host.querySelector('#sk-svg')!.addEventListener('click', () => save(new Blob([toSvg(strokes)], { type: 'image/svg+xml' }), 'sketch.svg'));
  host.querySelector('#sk-png')!.addEventListener('click', () => {
    // Drawn straight onto a canvas, so nothing has to be loaded as a picture first.
    const c = document.createElement('canvas'); c.width = BOARD.w * 2; c.height = BOARD.h * 2; const g = c.getContext('2d')!;
    g.scale(2, 2); g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD.w, BOARD.h); g.lineJoin = 'round';
    for (const s of strokes) { g.beginPath(); g.globalAlpha = s.opacity; g.strokeStyle = s.color; g.lineWidth = s.width; g.lineCap = capOf(s.pen); for (let i = 0; i < s.points.length; i += 2) { if (i) g.lineTo(s.points[i], s.points[i + 1]); else g.moveTo(s.points[i], s.points[i + 1]); } g.stroke(); }
    c.toBlob((b) => { if (b) save(b, 'sketch.png'); else notify(t('sketchPngFailed'), true); }, 'image/png');
  });
  svg.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= PENS.length) { pen = PENS[n - 1].id; erasing = false; paint(); }
    else if (e.key.toLowerCase() === 'e') { erasing = !erasing; paint(); }
    else if (e.key.toLowerCase() === 'l') { shift = !shift; paint(); } // lock straight lines without holding Shift
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) step(redo, undo); else step(undo, redo); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); step(redo, undo); }
  });
  paint();
}
