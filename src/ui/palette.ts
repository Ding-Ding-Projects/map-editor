// Command palette (Ctrl+Shift+F): every command and setting in one searchable list.
// Settings are live switches in the result row; Enter runs, Esc closes. Matches the Palette board.
import { searchBox, type RegexText } from './regex.js';
export interface Command {
  id: string;
  label: string;
  where: string;
  keys?: string;
  /** For settings: current value, toggled in place without closing. */
  toggle?: { get: () => boolean; set: (v: boolean) => void };
  run?: () => void;
  /** Teleport to the exact control this command stands for (Shift+Enter, or the arrow button). */
  goto?: () => void;
}

const SIZE_KEY = 'map-editor.palette-size.v1';

let open: HTMLElement | undefined;

export function openPalette(commands: () => Command[], t: { title: string; hint: string; none: string }, rx: RegexText) {
  if (open) { (open.querySelector('[data-search] input') as HTMLInputElement).focus(); return; }
  const back = document.createElement('div');
  back.className = 'palette-scrim';
  back.innerHTML = `<section class="palette" role="dialog" aria-modal="true" aria-label="${t.title}">
    <div class="palette-search"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <div id="palette-q"></div></div>
    <div id="palette-list" class="palette-list" role="listbox"></div>
    <div class="palette-foot"><span>Enter to run</span><span>Shift+Enter shows the setting</span><span>Space toggles a setting</span><span>Esc to close</span></div></section>`;
  document.body.append(back);
  // Remembered size: the palette can be resized from its corner and opens at that size next time.
  const panel = back.querySelector<HTMLElement>('.palette')!;
  try { const z = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null'); if (z && z.w > 320 && z.h > 240) Object.assign(panel.style, { width: `${Math.min(z.w, innerWidth - 16)}px`, height: `${Math.min(z.h, innerHeight - 32)}px`, maxHeight: 'none' }); } catch { /* storage blocked */ }
  const startSize = () => `${panel.offsetWidth}x${panel.offsetHeight}`;
  let opened = '';
  requestAnimationFrame(() => { opened = startSize(); });
  open = back;
  const box = searchBox('palette-search', t.hint, rx, { compact: true });
  back.querySelector('#palette-q')!.replaceWith(box.el);
  const input = box.input;
  input.setAttribute('aria-controls', 'palette-list'); input.placeholder = t.hint;
  const listEl = back.querySelector<HTMLElement>('#palette-list')!;
  let items: Command[] = [];
  let active = 0;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  let run = 0;
  async function draw() {
    const my = ++run;
    const all = commands();
    const hits = await box.filter(all.map((c) => `${c.label} ${c.where}`)) ?? all.map(() => false);
    if (my !== run || !open) return;
    items = all.filter((_, i) => hits[i]);
    active = Math.min(active, Math.max(0, items.length - 1));
    const settings = items.filter((c) => c.toggle), cmds = items.filter((c) => !c.toggle);
    const row = (c: Command) => {
      const i = items.indexOf(c);
      return `<div class="palette-row${i === active ? ' active' : ''}" role="option" id="pr-${i}" aria-selected="${i === active}" data-i="${i}">
        <span class="pr-text"><span class="pr-label">${esc(c.label)}</span><span class="pr-where">${esc(c.where)}</span></span>
        ${c.toggle ? `<md-switch data-sw="${i}" ${c.toggle.get() ? 'selected' : ''} aria-label="${esc(c.label)}"></md-switch>` : c.keys ? `<kbd>${esc(c.keys)}</kbd>` : ''}
        ${c.goto ? `<button type="button" class="pr-goto" data-goto="${i}" aria-label="Show ${esc(c.label)} in ${esc(c.where)}" title="Show it (Shift+Enter)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>` : ''}</div>`;
    };
    listEl.innerHTML = !items.length ? `<p class="palette-empty">${esc(t.none)}</p>`
      : (settings.length ? `<h3>Settings, live</h3>${settings.map(row).join('')}` : '') + (cmds.length ? `<h3>Commands</h3>${cmds.map(row).join('')}` : '');
    input.setAttribute('aria-activedescendant', items.length ? `pr-${active}` : '');
    listEl.querySelectorAll<HTMLElement>('[data-i]').forEach((r) => r.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('md-switch, .pr-goto')) return;
      activate(Number(r.dataset.i));
    }));
    listEl.querySelectorAll<HTMLElement>('[data-goto]').forEach((b) => b.addEventListener('click', () => teleport(Number(b.dataset.goto))));
    listEl.querySelectorAll<HTMLElement & { selected: boolean }>('[data-sw]').forEach((sw) => sw.addEventListener('change', () => items[Number(sw.dataset.sw)].toggle!.set(sw.selected)));
    listEl.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }
  function activate(i: number) {
    const c = items[i];
    if (!c) return;
    if (c.toggle) { c.toggle.set(!c.toggle.get()); draw(); return; }
    close();
    c.run?.();
  }
  function teleport(i: number) { const c = items[i]; if (!c?.goto) return; close(); c.goto(); }
  function close() {
    // Keep the size only when it was changed by hand, so a small window does not shrink it for good.
    if (opened && startSize() !== opened) { try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: panel.offsetWidth, h: panel.offsetHeight })); } catch { /* storage blocked */ } }
    back.remove(); open = undefined; document.removeEventListener('keydown', onKey, true); }
  function onKey(e: KeyboardEvent) {
    // Keys inside the regex builder belong to the builder (its own Escape closes it).
    if ((e.target as HTMLElement | null)?.closest?.('.sb-panel, .sb-rx, .sb-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); teleport(active); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(active); }
    else if (e.key === ' ' && items[active]?.toggle && document.activeElement === input && !input.value.endsWith(' ') && input.value.length === 0) { e.preventDefault(); activate(active); }
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  box.onChange(() => { active = 0; draw(); });
  draw();
  input.focus();
}
