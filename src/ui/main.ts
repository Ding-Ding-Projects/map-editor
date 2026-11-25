// Map Editor web UI, shared by the desktop app, the Docker web app and the appliance.
import '@material/web/all.js';
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';
import { t as tr, type I18nState, type Key, type Lang } from './i18n.js';
import { mountWorkspace } from './workspace.js';
import { worldsView } from './worlds.js';
import { openPalette, type Command } from './palette.js';
import { onboarding } from './onboarding.js';

/** Present only inside the desktop app (see src/desktop/preload.ts). */
const desktopBridge = (window as unknown as { mapEditorDesktop?: { pickFolder: () => Promise<string | undefined> } }).mapEditorDesktop;
import { colorPicker, applyRainbowSpeed } from './colorpicker.js';
import { RAINBOW } from './color.js';
import { argbFromHex, themeFromSourceColor, applyTheme as applyM3Theme } from '@material/material-color-utilities';
import { notesPanel as notesPanelImpl } from './notes.js';

if (typescaleStyles.styleSheet) document.adoptedStyleSheets.push(typescaleStyles.styleSheet);

// ---------- state ----------
interface Prefs extends I18nState { dark: boolean; reduceMotion: boolean; closedTabs: string[]; tab: string; seed: string; rainbowSpeed: number; onboarded: boolean; onboardStep: number }
const PREFS_KEY = 'map-editor.prefs.v1';
const DEFAULT_SEED = '#4c8c4a';
const defaults: Prefs = { lang: 'en', funnyEn: 5, funnyYue: 5, dark: matchMedia('(prefers-color-scheme: dark)').matches, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, closedTabs: [], tab: 'worlds', seed: DEFAULT_SEED, rainbowSpeed: 3, onboarded: false, onboardStep: 0 };
function loadPrefs(): Prefs { try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; } catch { return { ...defaults }; } }
let prefs = loadPrefs();
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked: keep in memory */ } }

const TABS = ['worlds', 'editor', 'history', 'settings', 'about'] as const;
type Tab = typeof TABS[number];

interface Health { version: string; commit: string; builtAt: string | null }
let health: Health | undefined;
let user: { name: string } | null = null;
let hasOwner = true;
let world: { name: string; versionName?: string; path: string; dimensions?: string[]; spawn?: { x: number; y: number; z: number } } | undefined;
let fitPending = false; // centre the map on the world's chunks the next time the editor draws

const tx = (k: Key, v: Record<string, string | number> = {}) => tr(prefs, k, v);
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ---------- api ----------
async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, { method: init?.method ?? 'GET', headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, credentials: 'same-origin' });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ---------- notifications (non-blocking; errors stay until dismissed) ----------
const notes: Array<{ id: number; text: string; error: boolean; at: string }> = [];
let noteId = 0;
function notify(text: string, error = false, action?: { label: string; run: () => void }) {
  const at = new Date().toLocaleTimeString('en-GB');
  notes.unshift({ id: ++noteId, text, error, at });
  const host = document.getElementById('toasts')!;
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(text)}</span>`;
  if (action) { const b = document.createElement('md-text-button'); b.textContent = action.label; b.addEventListener('click', () => { action.run(); el.remove(); }); el.append(b); }
  const x = document.createElement('md-text-button'); x.textContent = tx('close'); x.addEventListener('click', () => el.remove()); el.append(x);
  host.prepend(el);
  if (!error) setTimeout(() => el.remove(), 6000);
  const bell = document.querySelector('.bell-wrap');
  if (bell) { bell.querySelector('.badge')?.remove(); bell.insertAdjacentHTML('beforeend', `<span class="badge">${notes.length}</span>`); }
  if (document.querySelector('.note-centre')) { toggleNoteCentre(); toggleNoteCentre(); }
}

function toggleNoteCentre() {
  const existing = document.querySelector('.note-centre');
  if (existing) { existing.remove(); return; }
  const panel = document.createElement('section');
  panel.className = 'note-centre';
  panel.setAttribute('aria-label', tx('notifications'));
  panel.innerHTML = `<header><h2>${esc(tx('notifications'))}</h2><md-text-button id="nc-clear">${esc(tx('dismissAll'))}</md-text-button><md-text-button id="nc-close">${esc(tx('close'))}</md-text-button></header>
    ${notes.length ? `<ol>${notes.map((n) => `<li class="${n.error ? 'error' : ''}"><span class="dot" aria-hidden="true"></span><span class="nc-text">${esc(n.text)}</span><time>${esc(n.at)}</time></li>`).join('')}</ol>` : `<p class="muted">${esc(tx('noNotifications'))}</p>`}`;
  document.body.append(panel);
  panel.querySelector('#nc-clear')!.addEventListener('click', () => { notes.length = 0; panel.remove(); document.querySelector('.bell-wrap .badge')?.remove(); });
  panel.querySelector('#nc-close')!.addEventListener('click', () => panel.remove());
}

function paletteCommands(): Command[] {
  const go = (t: string) => () => { prefs.closedTabs = prefs.closedTabs.filter((x) => x !== t); prefs.tab = t; savePrefs(); render(); };
  const cmds: Command[] = [];
  for (const t of TABS) cmds.push({ id: `go-${t}`, label: `${tx('open')}: ${tx(t as Key)}`, where: 'Tabs', run: go(t) });
  if (world) for (const [o, k] of [['fill', 'F'], ['replace', 'R'], ['delete', 'D'], ['clone', 'C'], ['waterlog', 'W']] as const) cmds.push({ id: `tool-${o}`, label: tx(o), where: `${tx('editor')} › Tools`, keys: k, run: () => { go('editor')(); setTimeout(() => selectTool?.(o), 50); } });
  if (world) cmds.push({ id: 'undo', label: tx('undo'), where: tx('history'), keys: 'Ctrl+Z', run: () => undoLast() });
  cmds.push({ id: 'dark', label: tx('dark'), where: `${tx('settings')} › Appearance`, toggle: { get: () => prefs.dark, set: (v) => { prefs.dark = v; savePrefs(); applyTheme(); } } });
  cmds.push({ id: 'motion', label: tx('reduceMotion'), where: `${tx('settings')} › Appearance`, toggle: { get: () => prefs.reduceMotion, set: (v) => { prefs.reduceMotion = v; savePrefs(); applyTheme(); } } });
  for (const [l, label] of [['en', 'English'], ['yue', '粵語'], ['both', 'EN + 粵']] as const) cmds.push({ id: `lang-${l}`, label: `${tx('language')}: ${label}`, where: `${tx('settings')} › ${tx('language')}`, run: () => { prefs.lang = l; savePrefs(); render(); } });
  cmds.push({ id: 'notes', label: tx('notifications'), where: 'Header', run: () => toggleNoteCentre() });
  cmds.push({ id: 'welcome', label: tx('welcome'), where: `${tx('settings')}`, run: () => { prefs.onboarded = false; prefs.onboardStep = 0; savePrefs(); render(); } });
  return cmds;
}

function showPalette() {
  if (!user) return;
  openPalette(paletteCommands, { title: tx('palette'), hint: tx('paletteHint'), none: tx('noMatches') });
}

// ---------- theme ----------
function applySeed() {
  const root = document.documentElement;
  // The hand-tuned default palette lives in the stylesheet; any other seed generates every M3 colour role.
  for (const p of Array.from({ length: root.style.length }, (_, i) => root.style.item(i))) if (p.startsWith('--md-sys-color-')) root.style.removeProperty(p);
  root.classList.toggle('seed-rainbow', prefs.seed === RAINBOW);
  if (prefs.seed !== DEFAULT_SEED && prefs.seed !== RAINBOW && /^#[0-9a-f]{6}$/i.test(prefs.seed)) {
    applyM3Theme(themeFromSourceColor(argbFromHex(prefs.seed)), { target: root, dark: prefs.dark });
  }
  applyRainbowSpeed(prefs.rainbowSpeed);
}

function applyTheme() {
  applySeed();
  document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
  document.documentElement.lang = prefs.lang === 'yue' ? 'zh-Hant-HK' : 'en';
}

function provenance() {
  if (!health || !health.builtAt) return tx('provenanceMissing');
  const d = new Date(health.builtAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const tz = `UTC${off >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${tz}`;
  return tx('version', { v: health.version, t: stamp });
}

// ---------- shell ----------
function shell() {
  const app = document.getElementById('app')!;
  const open = TABS.filter((x) => !prefs.closedTabs.includes(x));
  if (!open.includes(prefs.tab as Tab)) prefs.tab = open[0] ?? 'worlds';
  app.innerHTML = `
    <header class="top">
      <div class="brand"><div class="logo" aria-hidden="true"></div>
        <div><div class="md-typescale-headline-medium title">${esc(world?.name ?? tx('appName'))}</div>
        <div class="md-typescale-body-small muted" id="prov">${esc(provenance())}</div></div></div>
      <button class="search-pill" id="cmd" aria-keyshortcuts="Control+Shift+F"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span>${esc(tx('paletteHint'))}</span><kbd>Ctrl Shift F</kbd></button>
      <md-chip-set aria-label="${esc(tx('language'))}">
        ${(['en', 'yue', 'both'] as Lang[]).map((l) => `<md-filter-chip data-lang="${l}" label="${l === 'en' ? 'English' : l === 'yue' ? '粵語' : 'EN + 粵'}" ${prefs.lang === l ? 'selected' : ''}></md-filter-chip>`).join('')}
      </md-chip-set>
      ${user ? `<span class="bell-wrap"><md-icon-button id="bell" aria-label="${esc(tx('notifications'))}${notes.length ? `, ${notes.length}` : ''}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/></svg></md-icon-button>${notes.length ? `<span class="badge">${notes.length}</span>` : ''}</span>` : ''}
      ${user ? `<md-outlined-button id="logout">${esc(user.name)}</md-outlined-button>` : ''}
    </header>
    <div class="body">
      ${user && prefs.onboarded ? `<nav class="tabs" aria-label="Tabs"><md-list role="tablist" aria-orientation="vertical">
        ${open.map((x) => `<md-list-item type="button" role="tab" aria-selected="${x === prefs.tab}" data-tab="${x}" class="${x === prefs.tab ? 'active' : ''}">${esc(tx(x as Key))}
          ${x === prefs.tab ? `<md-outlined-button slot="end" data-close="${x}">${esc(tx('close'))}</md-outlined-button>` : ''}</md-list-item>`).join('')}
        </md-list>
        ${prefs.closedTabs.length ? `<md-text-button id="open-all">${esc(tx('openEveryTab'))}</md-text-button>` : ''}
      </nav>` : ''}
      <main id="view" class="view" role="tabpanel"></main>
    </div>
    <div id="toasts" class="toasts" aria-live="polite"></div>`;
  app.querySelectorAll<HTMLElement>('[data-lang]').forEach((c) => c.addEventListener('click', () => { prefs.lang = c.dataset.lang as Lang; savePrefs(); render(); }));
  app.querySelectorAll<HTMLElement>('[data-tab]').forEach((c) => c.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-close]')) return; prefs.tab = c.dataset.tab!; savePrefs(); render(); }));
  app.querySelectorAll<HTMLElement>('[data-close]').forEach((c) => c.addEventListener('click', () => { prefs.closedTabs.push(c.dataset.close!); savePrefs(); render(); }));
  app.querySelector('#open-all')?.addEventListener('click', () => { prefs.closedTabs = []; savePrefs(); render(); });
  app.querySelector('#cmd')?.addEventListener('click', () => showPalette());
  app.querySelector('#bell')?.addEventListener('click', () => toggleNoteCentre());
  app.querySelector('#logout')?.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); user = null; render(); });
}

async function render(): Promise<void> {
  applyTheme();
  shell();
  const view = document.getElementById('view')!;
  if (!user) return authView(view);
  if (!prefs.onboarded) {
    onboarding(view, {
      tx, esc, prefs, step: prefs.onboardStep,
      save: (step) => { prefs.onboardStep = step; savePrefs(); },
      apply: () => { savePrefs(); applyTheme(); },
      relabel: () => { savePrefs(); applyTheme(); shell(); return document.getElementById('view')!; },
      done: () => { prefs.onboarded = true; prefs.tab = 'worlds'; savePrefs(); render(); },
    });
    return;
  }
  switch (prefs.tab as Tab) {
    case 'worlds': return worldsScreen(view);
    case 'editor': return editorView(view);
    case 'history': return historyView(view);
    case 'settings': return settingsView(view);
    case 'about': return aboutView(view);
  }
}

// ---------- views ----------
function authView(view: HTMLElement) {
  const owner = !hasOwner;
  view.innerHTML = `<section class="card narrow">
    <h1 class="md-typescale-display-small">${esc(owner ? tx('createOwner') : tx('signIn'))}</h1>
    ${owner ? `<p class="md-typescale-body-large muted">${esc(tx('ownerNote'))}</p>` : ''}
    <form id="auth" class="stack">
      <md-outlined-text-field name="name" label="${esc(tx('displayName'))}" required maxlength="40"></md-outlined-text-field>
      <md-outlined-text-field name="password" type="password" label="${esc(tx('password'))}" required minlength="10"></md-outlined-text-field>
      <md-filled-button type="submit">${esc(owner ? tx('createOwner') : tx('signIn'))}</md-filled-button>
    </form></section>`;
  view.querySelector('#auth')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const val = (n: string) => (f.querySelector(`[name=${n}]`) as HTMLInputElement).value;
    try {
      user = await api(owner ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: { name: val('name'), password: val('password') } });
      hasOwner = true; render();
    } catch (err) { notify((err as Error).message, true); if (/owner/.test((err as Error).message)) { hasOwner = true; render(); } }
  });
}

function worldsScreen(view: HTMLElement) {
  return worldsView(view, {
    api, notify, tx, esc,
    browse: desktopBridge?.pickFolder,
    open: async (w) => {
      const r = await api('/api/worlds/open', { method: 'POST', body: { path: w.path } });
      world = { ...r.info }; dim = 'overworld'; fitPending = true;
      const sp = world!.spawn ?? { x: 0, y: 64, z: 0 };
      Object.assign(sel, { x1: sp.x - 8, y1: sp.y - 1, z1: sp.z - 8, x2: sp.x + 7, y2: sp.y - 1, z2: sp.z + 7 }); prefs.tab = 'editor'; savePrefs(); render(); },
  });
}

// Map view: draws 16 px per chunk column region, pans with drag, selects with Shift+drag.
let syncSel: (() => void) | undefined;
let selectTool: ((op: string) => void) | undefined;

async function undoLast() {
  if (!world) return;
  try {
    const r = await api<{ undid: string }>('/api/history/undo', { method: 'POST', body: {} });
    notify(tx('undone', { what: r.undid }));
    document.dispatchEvent(new Event('history-changed'));
    document.dispatchEvent(new Event('world-changed'));
  } catch (e) { notify((e as Error).message, true); }
}
const sel = { x1: 0, y1: 60, z1: 0, x2: 15, y2: 70, z2: 15 };
let dim = 'overworld';
async function editorView(view: HTMLElement): Promise<void> {
  if (!world) { prefs.tab = 'worlds'; return render(); }
  const root = document.createElement('div');
  root.innerHTML = `<div class="editor">
    <section class="map card flat"><div class="map-bar">
        <md-chip-set aria-label="Dimension">${(world.dimensions?.length ? world.dimensions : ['overworld']).map((d) => `<md-filter-chip data-dim="${d}" label="${esc(tx(d as Key))}" ${d === dim ? 'selected' : ''}></md-filter-chip>`).join('')}</md-chip-set>
        <span class="spacer"></span><md-filled-tonal-button id="undo" title="Ctrl+Z">${esc(tx('undo'))}</md-filled-tonal-button></div>
      <canvas id="map" role="img" aria-label="Top-down map"></canvas>
      <div class="coords md-typescale-body-small" id="coords">x 0 · z 0</div></section>
    <aside class="card tool">
      <md-chip-set id="ops" role="radiogroup" aria-label="Tools">${(['fill', 'replace', 'delete', 'clone', 'waterlog'] as const).map((o, i) => `<md-filter-chip data-op="${o}" label="${esc(tx(o))}" ${i === 0 ? 'selected' : ''}></md-filter-chip>`).join('')}</md-chip-set>
      <div class="coords-grid">${(['x1', 'y1', 'z1', 'x2', 'y2', 'z2'] as const).map((k) => `<md-outlined-text-field type="number" label="${k}" name="${k}" value="${sel[k]}"></md-outlined-text-field>`).join('')}</div>
      <div id="op-fields" class="stack"></div>
      <div class="muted" id="sel-size"></div>
      <md-filled-button id="run"></md-filled-button>
    </aside></div>`;
  // dockview moves these panels out of root, so every later lookup goes through the panel itself
  const mapEl = root.querySelector<HTMLElement>('.map')!;
  const toolEl = root.querySelector<HTMLElement>('.tool')!;
  let op: 'fill' | 'replace' | 'delete' | 'clone' | 'waterlog' = 'fill';
  const fields = root.querySelector('#op-fields')!;
  const runBtn = root.querySelector('#run')!;
  const size = () => { const n = (a: number, b: number) => Math.abs(b - a) + 1; toolEl.querySelector('#sel-size')!.textContent = tx('selection', { n: (n(sel.x1, sel.x2) * n(sel.y1, sel.y2) * n(sel.z1, sel.z2)).toLocaleString('en') }); };
  const BLOCKS = ['minecraft:stone_bricks', 'minecraft:oak_planks', 'minecraft:glass', 'minecraft:water', 'minecraft:air', 'minecraft:grass_block', 'minecraft:sand', 'minecraft:deepslate', 'minecraft:cherry_leaves', 'minecraft:gold_block'];
  const chips = (target: string) => `<md-chip-set class="block-chips" aria-label="${esc(tx('block'))}">${BLOCKS.map((b) => `<md-assist-chip data-for="${target}" data-block="${b}" label="${b.slice(10)}"></md-assist-chip>`).join('')}</md-chip-set>`;
  const setOp = (o: typeof op) => {
    op = o;
    toolEl.querySelectorAll<HTMLElement & { selected: boolean }>('[data-op]').forEach((c) => { c.selected = c.dataset.op === o; });
    runBtn.textContent = tx('run', { op: tx(o) });
    fields.innerHTML = o === 'fill' ? `<md-outlined-text-field name="block" label="${esc(tx('block'))}" value="minecraft:stone_bricks"></md-outlined-text-field>`
      : o === 'replace' ? `<md-outlined-text-field name="from" label="${esc(tx('from'))}" value="minecraft:water"></md-outlined-text-field><md-outlined-text-field name="to" label="${esc(tx('to'))}" value="minecraft:air"></md-outlined-text-field>`
      : o === 'clone' ? `<md-outlined-text-field name="dest" label="${esc(tx('dest'))}" value="0, 64, 0"></md-outlined-text-field>` : '';
    if (o === 'fill') fields.insertAdjacentHTML('beforeend', chips('block'));
    if (o === 'replace') fields.insertAdjacentHTML('beforeend', chips('to'));
    fields.querySelectorAll<HTMLElement>('[data-block]').forEach((c) => c.addEventListener('click', () => { (fields.querySelector(`[name=${c.dataset.for}]`) as HTMLInputElement).value = c.dataset.block!; }));
  };
  selectTool = (o) => setOp(o as typeof op);
  setOp('fill'); size();
  mapEl.querySelectorAll<HTMLElement>('[data-dim]').forEach((c) => c.addEventListener('click', () => { dim = c.dataset.dim!; mapEl.querySelectorAll<HTMLElement & { selected: boolean }>('[data-dim]').forEach((x) => { x.selected = x === c; }); fitToWorld().then(() => drawMap()); }));
  mapEl.querySelector('#undo')!.addEventListener('click', () => undoLast());
  document.addEventListener('world-changed', () => { if (canvas.isConnected) drawMap(); });
  toolEl.querySelectorAll<HTMLElement & { selected: boolean }>('[data-op]').forEach((chip, _i, all) => chip.addEventListener('click', () => { all.forEach((c) => { c.selected = c === chip; }); setOp(chip.dataset.op as typeof op); }));
  toolEl.querySelectorAll<HTMLInputElement>('.coords-grid md-outlined-text-field').forEach((f) => f.addEventListener('input', () => { (sel as Record<string, number>)[f.getAttribute('name')!] = Math.trunc(Number(f.value)); size(); drawSel(); }));
  runBtn.addEventListener('click', async () => {
    const v = (n: string) => (fields.querySelector(`[name=${n}]`) as HTMLInputElement | null)?.value ?? '';
    const body: Record<string, unknown> = { op, dimension: dim, box: { ...sel } };
    if (op === 'fill') body.block = v('block');
    if (op === 'replace') { body.from = v('from'); body.to = v('to'); }
    if (op === 'clone') { const [x, y, z] = v('dest').split(',').map((s) => Math.trunc(Number(s.trim()))); body.dest = { x, y, z }; }
    runBtn.setAttribute('disabled', '');
    try {
      const r = await api<{ changed: number; skipped: number; ms: number }>('/api/op', { method: 'POST', body });
      notify(tx('opDone', { op: tx(op), n: r.changed.toLocaleString('en'), ms: r.ms }), false, { label: tx('history'), run: () => { prefs.tab = 'history'; render(); } });
      document.dispatchEvent(new Event('history-changed'));
      if (r.skipped) notify(tx('opSkipped', { n: r.skipped.toLocaleString('en') }), true);
      await drawMap();
    } catch (err) { notify((err as Error).message, true); } finally { runBtn.removeAttribute('disabled'); }
  });

  const canvas = root.querySelector<HTMLCanvasElement>('#map')!;
  const ctx = canvas.getContext('2d')!;
  let originX = -64, originZ = -64, scale = 2; // block coordinate of the canvas's top-left, pixels per block
  async function fitToWorld() {
    try {
      const { chunks } = await api<{ chunks: Array<[number, number]> }>(`/api/world?dim=${dim}`);
      if (!chunks.length) return;
      const xs = chunks.map((c) => c[0]), zs = chunks.map((c) => c[1]);
      const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...zs), Math.max(...zs) + 1];
      const rect = canvas.getBoundingClientRect();
      const spanX = (maxX - minX) * 16, spanZ = (maxZ - minZ) * 16;
      scale = Math.max(0.5, Math.min(8, Math.floor(Math.min(rect.width / spanX, rect.height / spanZ) * 0.85 * 4) / 4 || 2));
      originX = (minX * 16 + spanX / 2) - rect.width / scale / 2;
      originZ = (minZ * 16 + spanZ / 2) - rect.height / scale / 2;
    } catch { /* keep the current view */ }
  }
  let image: ImageBitmap | undefined; let imgCx = 0, imgCz = 0;
  function drawSel() {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--md-sys-color-surface-container-lowest') || '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, (imgCx * 16 - originX) * scale, (imgCz * 16 - originZ) * scale, image.width * scale, image.height * scale);
    const x = (Math.min(sel.x1, sel.x2) - originX) * scale, z = (Math.min(sel.z1, sel.z2) - originZ) * scale;
    const w = (Math.abs(sel.x2 - sel.x1) + 1) * scale, h = (Math.abs(sel.z2 - sel.z1) + 1) * scale;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary') || '#8fd88a';
    ctx.lineWidth = 2; ctx.strokeRect(x, z, w, h);
  }
  async function drawMap() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width)); canvas.height = Math.max(1, Math.floor(rect.height));
    const cx0 = Math.floor(originX / 16), cz0 = Math.floor(originZ / 16);
    const w = Math.min(64, Math.ceil(canvas.width / scale / 16) + 1), h = Math.min(64, Math.ceil(canvas.height / scale / 16) + 1);
    try {
      const buf = await api<ArrayBuffer>(`/api/render?dim=${dim}&cx=${cx0}&cz=${cz0}&w=${w}&h=${h}`);
      image = await createImageBitmap(new ImageData(new Uint8ClampedArray(buf), w * 16, h * 16));
      imgCx = cx0; imgCz = cz0;
    } catch (err) { notify((err as Error).message, true); }
    drawSel();
  }
  let drag: { x: number; y: number; ox: number; oz: number; select: boolean } | undefined;
  const toBlock = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / scale + originX), z: Math.floor((e.clientY - r.top) / scale + originZ) }; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); const b = toBlock(e); drag = { x: e.clientX, y: e.clientY, ox: originX, oz: originZ, select: e.shiftKey }; if (e.shiftKey) { sel.x1 = sel.x2 = b.x; sel.z1 = sel.z2 = b.z; } });
  canvas.addEventListener('pointermove', (e) => {
    const b = toBlock(e); mapEl.querySelector('#coords')!.textContent = `x ${b.x} · z ${b.z} · chunk ${Math.floor(b.x / 16)}, ${Math.floor(b.z / 16)}`;
    if (!drag) return;
    if (drag.select) { sel.x2 = b.x; sel.z2 = b.z; size(); drawSel(); }
    else { originX = drag.ox - (e.clientX - drag.x) / scale; originZ = drag.oz - (e.clientY - drag.y) / scale; drawSel(); }
  });
  canvas.addEventListener('pointerup', () => { const was = drag; drag = undefined; if (was && !was.select) drawMap(); else syncSel?.(); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.max(0.5, Math.min(16, scale * (e.deltaY < 0 ? 1.25 : 0.8))); drawMap(); }, { passive: false });
  syncSel = () => toolEl.querySelectorAll<HTMLInputElement>('.coords-grid md-outlined-text-field').forEach((f) => { f.value = String((sel as Record<string, number>)[f.getAttribute('name')!]); });
  new ResizeObserver(async () => { if (fitPending && canvas.clientWidth > 0) { fitPending = false; await fitToWorld(); } drawMap(); }).observe(canvas);
  const histEl = document.createElement('div'); histEl.className = 'panel-scroll';
  const notesEl = document.createElement('div'); notesEl.className = 'panel-scroll';
  view.innerHTML = '<div id="dock" class="dock"></div>';
  mountWorkspace(view.querySelector<HTMLElement>('#dock')!, { map: mapEl, tool: toolEl, history: histEl, notes: notesEl }, {
    map: tx('editor'), tool: tx('fill'), history: tx('history'), notes: tx('notes'),
  }, prefs.dark);
  historyView(histEl);
  document.addEventListener('history-changed', () => { if (histEl.isConnected) historyView(histEl); });
  notesPanel(notesEl);
}

async function historyView(view: HTMLElement): Promise<void> {
  if (!world) { prefs.tab = 'worlds'; return render(); }
  view.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">${esc(tx('history'))}</h1><p class="muted">${esc(tx('historyNote'))}</p><div id="h"><md-linear-progress indeterminate aria-label="Loading"></md-linear-progress></div></section>`;
  try {
    const { entries } = await api<{ entries: Array<{ sha: string; message: string; action: string; time: number }> }>('/api/history');
    const counts = new Map<string, number>(); for (const e of entries) counts.set(e.action, (counts.get(e.action) ?? 0) + 1);
    view.querySelector('#h')!.innerHTML = `<md-chip-set>${[...counts].map(([a, n]) => `<md-filter-chip data-a="${esc(a)}" label="${esc(a)} · ${n}"></md-filter-chip>`).join('')}</md-chip-set>
      <md-list>${entries.map((e, i) => `<md-list-item data-row="${esc(e.action)}"><div slot="headline">${esc(e.message)}</div>
        <div slot="supporting-text">${esc(new Date(e.time * 1000).toLocaleString('en-GB'))} · <code>${esc(e.sha.slice(0, 7))}</code></div>
        ${i > 0 ? `<md-text-button slot="end" data-sha="${esc(e.sha)}">${esc(tx('rollBack'))}</md-text-button>` : ''}</md-list-item>`).join('')}</md-list>`;
    const active = new Set<string>();
    view.querySelectorAll<HTMLElement>('[data-a]').forEach((c) => c.addEventListener('click', () => {
      const a = c.dataset.a!; active.has(a) ? active.delete(a) : active.add(a);
      view.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => { r.hidden = active.size > 0 && !active.has(r.dataset.row!); });
    }));
    view.querySelectorAll<HTMLElement>('[data-sha]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/api/history/restore', { method: 'POST', body: { sha: b.dataset.sha } }); notify(tx('restored')); historyView(view); }
      catch (err) { notify((err as Error).message, true); }
    }));
  } catch (err) { notify((err as Error).message, true); }
}

function settingsView(view: HTMLElement) {
  view.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">${esc(tx('settings'))}</h1>
    <div class="stack">
      <label class="row"><span>${esc(tx('funnyEn'))}</span><md-slider id="fen" min="1" max="5" step="1" ticks labeled value="${prefs.funnyEn}"></md-slider></label>
      <label class="row"><span>${esc(tx('funnyYue'))}</span><md-slider id="fyue" min="1" max="5" step="1" ticks labeled value="${prefs.funnyYue}"></md-slider></label>
      <p class="muted">${esc(tx('funnyNote'))}</p>
      <label class="row"><span>${esc(tx('dark'))}</span><md-switch id="dark" ${prefs.dark ? 'selected' : ''}></md-switch></label>
      <label class="row"><span>${esc(tx('reduceMotion'))}</span><md-switch id="rm" ${prefs.reduceMotion ? 'selected' : ''}></md-switch></label>
      <div class="row"><span>${esc(tx('seed'))}</span><span class="seed-now"><span class="seed-swatch ${prefs.seed === RAINBOW ? 'rainbow' : ''}" style="background:${prefs.seed === RAINBOW ? 'none' : esc(prefs.seed)}"></span><code>${esc(prefs.seed === RAINBOW ? tx('rainbow') : prefs.seed)}</code><md-text-button id="seed-reset">${esc(tx('reset'))}</md-text-button></span></div>
      <div id="seed-picker"></div>
    </div></section>`;
  const num = (id: string) => Number((view.querySelector(id) as HTMLInputElement).value);
  view.querySelector('#fen')!.addEventListener('change', () => { prefs.funnyEn = num('#fen'); savePrefs(); });
  view.querySelector('#fyue')!.addEventListener('change', () => { prefs.funnyYue = num('#fyue'); savePrefs(); });
  view.querySelector('#dark')!.addEventListener('change', (e) => { prefs.dark = (e.target as HTMLInputElement & { selected: boolean }).selected; savePrefs(); applyTheme(); });
  view.querySelector('#rm')!.addEventListener('change', (e) => { prefs.reduceMotion = (e.target as HTMLInputElement & { selected: boolean }).selected; savePrefs(); applyTheme(); });
  const showSeed = () => { const sw = view.querySelector<HTMLElement>('.seed-swatch')!; sw.classList.toggle('rainbow', prefs.seed === RAINBOW); sw.style.background = prefs.seed === RAINBOW ? '' : prefs.seed; view.querySelector('.seed-now code')!.textContent = prefs.seed === RAINBOW ? tx('rainbow') : prefs.seed; };
  colorPicker(view.querySelector<HTMLElement>('#seed-picker')!, {
    value: prefs.seed, label: tx('seed'), allowRainbow: true, rainbowSpeed: prefs.rainbowSpeed,
    surface: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim() || '#10140f',
    onChange: (v) => { prefs.seed = v.length === 9 ? v.slice(0, 7) : v; savePrefs(); applySeed(); showSeed(); },
    onSpeed: (lv) => { prefs.rainbowSpeed = lv; savePrefs(); applyRainbowSpeed(lv); },
  });
  view.querySelector('#seed-reset')!.addEventListener('click', () => { prefs.seed = DEFAULT_SEED; savePrefs(); render(); });
}

function aboutView(view: HTMLElement) {
  view.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">${esc(tx('about'))}</h1>
    <p class="md-typescale-body-large">${esc(provenance())}</p>
    <p class="muted">Commit ${esc(health?.commit ?? 'unavailable')}</p>
    <p>Map Editor is based on Amulet Map Editor by the Amulet Team, used under the Amulet licence. Minecraft is a trademark of Mojang Synergies AB; this project is not affiliated with Mojang or Microsoft.</p></section>`;
}

function notesPanel(el: HTMLElement) {
  notesPanelImpl(el, { api, notify, dark: prefs.dark, label: tx('notes'), saved: tx('notesSaved') });
}

// ---------- keyboard ----------
const typing = (e: KeyboardEvent) => e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)));
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); showPalette(); return; }
  if (typing(e) || document.querySelector('.palette-scrim, .onboarding')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && world) { e.preventDefault(); undoLast(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && prefs.tab === 'editor' && selectTool) {
    const map: Record<string, string> = { f: 'fill', r: 'replace', d: 'delete', c: 'clone', w: 'waterlog' };
    const op = map[e.key.toLowerCase()];
    if (op) { e.preventDefault(); selectTool(op); }
  }
});

// ---------- start ----------
(async () => {
  applyTheme();
  try { health = await api<Health>('/api/health'); } catch { /* shown as unavailable */ }
  try { const s = await api<{ hasOwner: boolean; user: { name: string } | null }>('/api/auth/state'); hasOwner = s.hasOwner; user = s.user; } catch (e) { notify((e as Error).message, true); }
  render();
})();
