// Map Editor web UI, shared by the desktop app, the Docker web app and the appliance.
import '@material/web/all.js';
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';
import { t as tr, type I18nState, type Key, type Lang } from './i18n.js';
import { mountWorkspace, PHONE, resetLayout } from './workspace.js';
import { searchBox, type RegexText } from './regex.js';
import { enableClearControls } from './clearable.js';
import { configureSounds, play } from './sounds.js';
import { startTour, type TourStep } from './tour.js';
import { worldsView } from './worlds.js';
import { openPalette, type Command } from './palette.js';
import { showTabSearch } from './tabsearch.js';
import { onboarding } from './onboarding.js';

/** Present only inside the desktop app (see src/desktop/preload.ts). */
type UpdState = { state: 'disabled'; reason: string } | { state: 'idle' | 'checking' | 'none' | 'downloading'; at?: string } | { state: 'ready'; version: string; notes: string } | { state: 'error'; message: string };
interface DesktopBridge {
  pickFolder: () => Promise<string | undefined>;
  openDataFolder?: (p: string) => Promise<string>;
  updates?: { state: () => Promise<UpdState>; check: () => Promise<UpdState>; restart: () => Promise<boolean>; onState: (fn: (s: UpdState) => void) => void };
}
const desktopBridge = (window as unknown as { mapEditorDesktop?: DesktopBridge }).mapEditorDesktop;
let upd: UpdState | undefined;
let updLater = false;
let updSoonHidden = false;
let busy = 0; // edits in progress; a restart waits until they finish
import { colorPicker, applyRainbowSpeed } from './colorpicker.js';
import { RAINBOW } from './color.js';
import { blockColor } from '../core/colors.js';
import { argbFromHex, themeFromSourceColor, applyTheme as applyM3Theme } from '@material/material-color-utilities';
import { notesPanel as notesPanelImpl } from './notes.js';

if (typescaleStyles.styleSheet) document.adoptedStyleSheets.push(typescaleStyles.styleSheet);

// ---------- state ----------
interface Prefs extends I18nState { dark: boolean; reduceMotion: boolean; largeText: boolean; dimSum: boolean; takeovers: boolean; lockedSettings: string[]; layoutLocked: boolean; tabsLocked: boolean; settingsLocked: boolean; quietHours: boolean; quietFrom: string; quietTo: string; narrate: boolean; narrateRate: number; darkSchedule: boolean; darkFrom: string; darkTo: string; editLock: boolean; tourOffered: boolean; tourResume: { name: string; step: number } | null; sounds: boolean; soundVolume: number; settingsSection: string; closedTabs: string[]; tab: string; seed: string; rainbowSpeed: number; onboarded: boolean; onboardStep: number }
const PREFS_KEY = 'map-editor.prefs.v1';
const DEFAULT_SEED = '#4c8c4a';
const defaults: Prefs = { lang: 'en', funnyEn: 5, funnyYue: 5, dark: matchMedia('(prefers-color-scheme: dark)').matches, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, largeText: false, dimSum: true, takeovers: true, lockedSettings: [], layoutLocked: false, tabsLocked: false, settingsLocked: false, quietHours: false, quietFrom: '22:00', quietTo: '07:00', narrate: false, narrateRate: 10, darkSchedule: false, darkFrom: '19:00', darkTo: '07:00', editLock: false, tourOffered: false, tourResume: null, sounds: true, soundVolume: 40, settingsSection: 'language', closedTabs: [], tab: 'worlds', seed: DEFAULT_SEED, rainbowSpeed: 3, onboarded: false, onboardStep: 0 };
function loadPrefs(): Prefs { try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; } catch { return { ...defaults }; } }
let prefs = loadPrefs();
// Settings history: every saved change to a user-facing setting keeps the previous values,
// newest first, so any change can be restored (and the restore is recorded too).
const HISTORY_KEY = 'map-editor.settings-history.v1';
const TRACKED = ['lang', 'funnyEn', 'funnyYue', 'dark', 'reduceMotion', 'largeText', 'takeovers', 'lockedSettings', 'layoutLocked', 'tabsLocked', 'settingsLocked', 'quietHours', 'quietFrom', 'quietTo', 'dimSum', 'narrate', 'narrateRate', 'darkSchedule', 'darkFrom', 'darkTo', 'editLock', 'sounds', 'soundVolume', 'seed', 'rainbowSpeed'] as const;
type Tracked = typeof TRACKED[number];
interface SettingsChange { at: string; keys: Tracked[]; before: Partial<Prefs>; after: Partial<Prefs> }
let lastSaved: Partial<Prefs> = pick(prefs);
function pick(p: Prefs): Partial<Prefs> { const o: Record<string, unknown> = {}; for (const k of TRACKED) o[k] = p[k]; return o as Partial<Prefs>; }
function loadSettingsHistory(): SettingsChange[] { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function savePrefs() {
  const now = pick(prefs);
  const keys = TRACKED.filter((k) => JSON.stringify(now[k]) !== JSON.stringify(lastSaved[k]));
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    if (keys.length) {
      const h = loadSettingsHistory();
      h.unshift({ at: new Date().toISOString(), keys, before: Object.fromEntries(keys.map((k) => [k, lastSaved[k]])), after: Object.fromEntries(keys.map((k) => [k, now[k]])) });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 200)));
    }
  } catch { /* storage blocked: keep in memory */ }
  lastSaved = now;
}
/** Accepts only known settings with the right types; returns how many were applied. */
function importSettings(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const src = ((raw as { settings?: unknown }).settings ?? raw) as Record<string, unknown>;
  let n = 0;
  const p = prefs as unknown as Record<string, unknown>;
  for (const k of TRACKED) {
    const v = src[k];
    if (v === undefined) continue;
    const ok = k === 'lang' ? v === 'en' || v === 'yue' || v === 'both'
      : k === 'seed' ? typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || v === RAINBOW)
      : k === 'narrateRate' ? typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 20
      : k === 'lockedSettings' ? Array.isArray(v) && v.every((x) => typeof x === 'string' && /^[a-z-]{1,20}$/.test(x))
      : k === 'darkFrom' || k === 'darkTo' || k === 'quietFrom' || k === 'quietTo' ? typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
      : k === 'soundVolume' ? typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
      : typeof defaults[k] === 'number' ? typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
      : typeof v === typeof defaults[k];
    if (ok) { p[k] = v; n++; }
  }
  return n;
}

const TABS = ['worlds', 'editor', 'history', 'settings', 'about'] as const;
type Tab = typeof TABS[number];

interface Health { version: string; commit: string; builtAt: string | null }
let health: Health | undefined;
let user: { name: string } | null = null;
let hasOwner = true;
let world: { name: string; versionName?: string; path: string; dimensions?: string[]; spawn?: { x: number; y: number; z: number } } | undefined;
let fitPending = false; // centre the map on the world's chunks the next time the editor draws

const tx = (k: Key, v: Record<string, string | number> = {}) => tr(prefs, k, v);
const rx: RegexText = (k, v) => tx(k, v);
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
// Narration: reads every message aloud with the device's own speech voices (nothing is sent anywhere).
function narrate(text: string, force = false) {
  if ((!prefs.narrate && !force) || (!force && quiet()) || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = prefs.lang === 'yue' ? 'zh-HK' : 'en';
    u.rate = prefs.narrateRate / 10;
    speechSynthesis.speak(u);
  } catch { /* no speech on this device: the message is still on screen */ }
}
// Scheduled dark theme: dark between darkFrom and darkTo (the range may cross midnight).
function inWindow(from: string, to: string, now = new Date()): boolean {
  const m = (t: string) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
  const cur = now.getHours() * 60 + now.getMinutes(), a = m(from), b = m(to);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
function scheduledDark(now = new Date()): boolean | undefined { return prefs.darkSchedule ? inWindow(prefs.darkFrom, prefs.darkTo, now) : undefined; }
// Quiet hours: sounds and reading aloud stay silent between the two times.
const quiet = () => prefs.quietHours && inWindow(prefs.quietFrom, prefs.quietTo);
setInterval(() => { const d = scheduledDark(); if ((d !== undefined && d !== (document.documentElement.dataset.theme === 'dark')) || prefs.quietHours) applyTheme(); }, 60_000);

function notify(text: string, error = false, action?: { label: string; run: () => void }) {
  const at = new Date().toLocaleTimeString('en-GB');
  notes.unshift({ id: ++noteId, text, error, at });
  if (error) play('error');
  narrate(text);
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
  const list = panel.querySelector('ol');
  if (list) {
    const box = searchBox('notification-search', tx('searchNotifications'), rx, { compact: true });
    list.before(box.el);
    const items = Array.from(list.querySelectorAll<HTMLElement>('li'));
    const none = document.createElement('p'); none.className = 'muted'; none.hidden = true; none.setAttribute('role', 'status'); list.after(none);
    let run = 0;
    box.onChange(async () => {
      const my = ++run;
      const hits = await box.filter(notes.map((n) => `${n.text} ${n.at}`)) ?? notes.map(() => false);
      if (my !== run) return;
      items.forEach((li, i) => { li.hidden = !hits[i]; });
      const shown = hits.filter(Boolean).length;
      none.hidden = shown > 0; none.textContent = tx('noMatches');
    });
  }
  panel.querySelector('#nc-clear')!.addEventListener('click', () => { notes.length = 0; panel.remove(); document.querySelector('.bell-wrap .badge')?.remove(); });
  panel.querySelector('#nc-close')!.addEventListener('click', () => panel.remove());
}

/** Material confirm dialog in place of the browser's confirm(): themed, translated and keyboard friendly. */
function askConfirm(text: string, ok = tx('ok'), danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; returnValue: string };
    dlg.setAttribute('type', 'alert');
    dlg.innerHTML = `<form slot="content" id="ask-form" method="dialog"><p class="ask-text">${esc(text)}</p></form>
      <div slot="actions"><md-text-button form="ask-form" value="cancel">${esc(tx('cancel'))}</md-text-button><md-filled-button form="ask-form" value="ok" class="${danger ? 'danger' : ''}" autofocus>${esc(ok)}</md-filled-button></div>`;
    document.body.append(dlg);
    dlg.addEventListener('closed', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.show();
  });
}

function tabSearch() {
  showTabSearch({
    tabs: () => TABS.map((x) => ({ id: x, label: tx(x as Key), open: !prefs.closedTabs.includes(x), active: x === prefs.tab, busy: x === 'editor' && busy > 0 })),
    go: (id) => { prefs.closedTabs = prefs.closedTabs.filter((x) => x !== id); prefs.tab = id; savePrefs(); render(); },
    close: (ids) => { if (prefs.tabsLocked) { notify(tx('tabsLockedRefuse'), true); return; } prefs.closedTabs = [...new Set([...prefs.closedTabs, ...ids])]; savePrefs(); render(); },
    t: (k, v) => tx(k as Key, v), rx, esc,
  });
}

function paletteCommands(): Command[] {
  const go = (t: string) => () => { prefs.closedTabs = prefs.closedTabs.filter((x) => x !== t); prefs.tab = t; savePrefs(); render(); };
  const cmds: Command[] = [];
  for (const t of TABS) cmds.push({ id: `go-${t}`, label: `${tx('open')}: ${tx(t as Key)}`, where: 'Tabs', run: go(t) });
  if (world) for (const [o, k] of [['fill', 'F'], ['replace', 'R'], ['delete', 'D'], ['clone', 'C'], ['waterlog', 'W']] as const) cmds.push({ id: `tool-${o}`, label: tx(o), where: `${tx('editor')} › Tools`, keys: k, run: () => { go('editor')(); setTimeout(() => selectTool?.(o), 50); } });
  if (world) for (const m of MAP_MODES) cmds.push({ id: `map-${m}`, label: tx(`mode_${m}` as Key), where: `${tx('editor')} › ${tx('mapTools')}`, keys: MAP_MODE_KEYS[m], run: () => { go('editor')(); setTimeout(() => setMapMode?.(m), 50); } });
  if (world) cmds.push({ id: 'undo', label: tx('undo'), where: tx('history'), keys: 'Ctrl+Z', run: () => undoLast() });
  cmds.push({ id: 'dark', label: tx('dark'), where: `${tx('settings')} › Appearance`, toggle: { get: () => prefs.dark, set: (v) => { prefs.dark = v; savePrefs(); applyTheme(); } } });
  cmds.push({ id: 'large-text', label: tx('largeText'), where: `${tx('settings')} › ${tx('secComfort')}`, toggle: { get: () => prefs.largeText, set: (v) => { prefs.largeText = v; savePrefs(); applyTheme(); } } });
  cmds.push({ id: 'edit-lock', label: tx('editLock'), where: `${tx('settings')} › ${tx('secComfort')}`, toggle: { get: () => prefs.editLock, set: (v) => { prefs.editLock = v; savePrefs(); applyTheme(); } } });
  cmds.push({ id: 'narrate', label: tx('narrate'), where: `${tx('settings')} › ${tx('secSounds')}`, toggle: { get: () => prefs.narrate, set: (v) => { prefs.narrate = v; savePrefs(); } } });
  cmds.push({ id: 'sounds', label: tx('soundEffects'), where: `${tx('settings')} › ${tx('secSounds')}`, toggle: { get: () => prefs.sounds, set: (v) => { prefs.sounds = v; savePrefs(); applyTheme(); } } });
  cmds.push({ id: 'tour', label: tx('tourTake'), where: tx('help'), run: () => takeTour('app') });
  cmds.push({ id: 'tour-page', label: tx('tourThisPage'), where: `${tx('help')} › ${tx(prefs.tab as Key)}`, run: () => takeTour(prefs.tab as Tab) });
  cmds.push({ id: 'tab-search', label: tx('tabSearch'), where: 'Tabs', run: () => tabSearch() });
  cmds.push({ id: 'open-every-tab', label: tx('openEveryTab'), where: 'Tabs', run: () => { prefs.closedTabs = []; savePrefs(); render(); } });
  cmds.push({ id: 'reset-layouts', label: tx('resetLayouts'), where: `${tx('settings')} › ${tx('secAppearance')}`, run: () => { resetLayout(); notify(tx('resetLayoutsDone')); render(); } });
  cmds.push({ id: 'check-updates', label: tx('updCheck'), where: `${tx('about')}`, run: () => { void checkForUpdates(); } });
  for (const e of extCache) if (e.enabled) for (const c of e.commands) cmds.push({ id: `ext-${e.id}-${c.id}`, label: c.title, where: `${tx('secExtensions')} › ${e.name}`, run: () => { void runExtension(e.id, c.id); } });
  cmds.push({ id: 'dim-sum', label: tx('dimSumNow'), where: `${tx('settings')} › ${tx('secAppearance')}`, run: () => { void dimSumSurprise(true); } });
  cmds.push({ id: 'dim-sum-toggle', label: tx('dimSum'), where: `${tx('settings')} › ${tx('secAppearance')}`, toggle: { get: () => prefs.dimSum, set: (v) => { prefs.dimSum = v; savePrefs(); } } });
  cmds.push({ id: 'motion', label: tx('reduceMotion'), where: `${tx('settings')} › Appearance`, toggle: { get: () => prefs.reduceMotion, set: (v) => { prefs.reduceMotion = v; savePrefs(); applyTheme(); } } });
  for (const [l, label] of [['en', 'English'], ['yue', '粵語'], ['both', 'EN + 粵']] as const) cmds.push({ id: `lang-${l}`, label: `${tx('language')}: ${label}`, where: `${tx('settings')} › ${tx('language')}`, run: () => { prefs.lang = l; savePrefs(); render(); } });
  cmds.push({ id: 'notes', label: tx('notifications'), where: 'Header', run: () => toggleNoteCentre() });
  cmds.push({ id: 'welcome', label: tx('welcome'), where: `${tx('settings')}`, run: () => { prefs.onboarded = false; prefs.onboardStep = 0; savePrefs(); render(); } });
  // A setting locked in Settings is locked here too: its row says so instead of switching.
  const SWITCH_OF: Record<string, string> = { dark: 'dark', motion: 'rm', 'large-text': 'lt', sounds: 'snd', 'edit-lock': 'elock', narrate: 'nar', 'dim-sum-toggle': 'ds' };
  for (const c of cmds) {
    const sid = SWITCH_OF[c.id];
    if (c.toggle && ((sid && prefs.lockedSettings.includes(sid)) || prefs.settingsLocked)) { c.where = `${c.where} · ${tx('lockedSettings')}`; c.toggle = { get: c.toggle.get, set: () => notify(tx('settingLocked'), true) }; }
  }
  return cmds;
}

function showPalette() {
  if (!user) return;
  openPalette(paletteCommands, { title: tx('palette'), hint: tx('paletteHint'), none: tx('noMatches') }, rx);
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
  document.documentElement.dataset.theme = (scheduledDark() ?? prefs.dark) ? 'dark' : 'light';
  document.documentElement.classList.toggle('edit-locked', prefs.editLock);
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
  document.documentElement.classList.toggle('large-text', prefs.largeText);
  configureSounds(prefs.sounds && !quiet(), prefs.soundVolume / 100);
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
const ico = (d: string) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TAB_ICON: Record<Tab, string> = {
  worlds: ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  editor: ico('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 3v18"/>'),
  history: ico('<path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  settings: ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  about: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
};

// Dim sum surprise: a 1 in 10 chance per start once setup is done, never during setup or an error.
// Non-blocking corner card that closes itself after 9 s (held while hovered or focused).
// Extension commands appear in the palette once their extension is switched on.
type ExtInfo = { id: string; name: string; version: string; description?: string; builtIn: boolean; enabled: boolean; needsConsent: boolean; error?: string; permissions: string[]; permissionKey?: string; commands: Array<{ id: string; title: string }> };
let extCache: ExtInfo[] = [];
type ExtState = { list: ExtInfo[]; perms: Record<string, string>; masterOn: boolean; canAddFolder: boolean; folder?: string };
async function loadExtensions(): Promise<ExtState> {
  const r = await api<{ extensions: ExtInfo[]; permissions: Record<string, string>; masterOn: boolean; canAddFolder: boolean; folder?: string }>('/api/extensions');
  extCache = r.masterOn ? r.extensions : [];
  return { list: r.extensions, perms: r.permissions, masterOn: r.masterOn, canAddFolder: r.canAddFolder, folder: r.folder };
}
async function runExtension(id: string, command: string) {
  if (!world) { notify(tx('extNeedsWorld'), true); return; }
  if (prefs.editLock) { notify(tx('editLocked'), true); return; }
  try {
    const r = await api<{ message: string; applied: number; changed: number }>('/api/extensions/run', { method: 'POST', body: { id, command, selection: { dimension: dim, box: { ...sel } } } });
    if (r.applied) { play('success'); document.dispatchEvent(new Event('history-changed')); }
    notify(r.applied ? tx('extApplied', { message: r.message, n: r.changed.toLocaleString('en') }) : r.message || tx('extDone'), false, r.applied ? { label: tx('history'), run: () => { prefs.tab = 'history'; render(); } } : undefined);
    if (r.applied && prefs.tab === 'editor') render();
  } catch (e) { notify((e as Error).message, true); }
}

let surprised = false;
async function dimSumSurprise(force = false) {
  if (!force && (surprised || !prefs.dimSum || !user || !prefs.onboarded || Math.random() >= 0.1)) return;
  surprised = true;
  type R = { dish: { id: string; name: { en: string; zhHant: string }; jyutping?: string; description: { en: string; yue: string }; alt?: { en: string; yue: string } }; total: number; revision: string };
  let r: R;
  try { r = await api<R>('/api/dimsum/random'); } catch (e) { if (force) notify(tx('dimSumOffline'), true); return; }
  document.querySelector('.dimsum')?.remove();
  const d = r.dish;
  const desc = prefs.lang === 'yue' ? d.description.yue : prefs.lang === 'both' ? `${d.description.en} ${d.description.yue}` : d.description.en;
  const alt = prefs.lang === 'yue' ? d.alt?.yue : d.alt?.en;
  const el = document.createElement('aside');
  el.className = 'dimsum'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', tx('dimSum'));
  el.innerHTML = `<div class="ds-photo" role="img" aria-label="${esc(tx('dimSumNoImage'))}${alt ? `: ${esc(alt)}` : ''}"><span class="ds-steamer" aria-hidden="true"><i></i><i></i><i></i></span><small>${esc(tx('dimSumNoImage'))}</small></div>
    <div class="ds-body"><small class="ds-kicker">${esc(tx('dimSum'))}</small><b class="ds-en">${esc(d.name.en)}</b><span class="ds-zh" lang="zh-Hant-HK">${esc(d.name.zhHant)}${d.jyutping ? ` <em>${esc(d.jyutping)}</em>` : ''}</span>
    <p>${esc(desc)}</p><small class="ds-src">${esc(tx('dimSumSource', { n: r.total.toLocaleString('en') }))}</small></div>
    <md-icon-button class="ds-close" aria-label="${esc(tx('close'))}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></md-icon-button>`;
  const close = () => { clearTimeout(timer); el.remove(); };
  let timer = setTimeout(close, 9000);
  const hold = () => clearTimeout(timer);
  el.addEventListener('pointerenter', hold); el.addEventListener('focusin', hold);
  el.addEventListener('pointerleave', () => { timer = setTimeout(close, 4000); });
  el.querySelector('.ds-close')!.addEventListener('click', close);
  document.body.append(el);
}

// ---------- guided tours ----------
const goTab = (t: Tab) => () => { prefs.closedTabs = prefs.closedTabs.filter((x) => x !== t); prefs.tab = t; savePrefs(); render(); };
const tabsTarget = () => (matchMedia('(max-width: 720px)').matches ? '.bottom-nav' : '.tabs');
function tourSteps(name: 'app' | Tab): TourStep[] {
  const needWorld = { text: tx('tourNeedWorld'), label: tx('tourOpenWorlds'), reveal: goTab('worlds') };
  const s = (target: string, k: string, missing?: TourStep['missing']): TourStep => ({ target, title: tx(`tour_${k}_t` as Key), body: tx(`tour_${k}_b` as Key), missing });
  switch (name) {
    case 'worlds': return [s('#upload-label', 'upload', { text: tx('tourNotHere'), label: tx('tourOpenWorlds'), reveal: goTab('worlds') }), s('#new', 'newworld', { text: tx('tourNotHere'), label: tx('tourOpenWorlds'), reveal: goTab('worlds') }), s('.world-card, .empty-world', 'cards', { text: tx('tourNotHere'), label: tx('tourOpenWorlds'), reveal: goTab('worlds') })];
    case 'editor': return [s('#map', 'map', needWorld), s('#ops', 'tools', needWorld), s('.coords-grid', 'coords', needWorld), s('#run', 'run', needWorld), s('#undo', 'undo', needWorld)];
    case 'history': return [s('[data-search=history-search]', 'hsearch', needWorld), s('.h-filters', 'hdates', needWorld), s('#h md-chip-set', 'hchips', needWorld), s('#h md-list', 'hlist', needWorld)];
    case 'settings': return [s('.set-nav [role=tablist]', 'ssections', { text: tx('tourNotHere'), label: tx('tourOpenSettings'), reveal: goTab('settings') }), s('[data-search=settings-search]', 'ssearch', { text: tx('tourNotHere'), label: tx('tourOpenSettings'), reveal: goTab('settings') })];
    case 'about': return [s('.about-stats', 'aversion', { text: tx('tourNotHere'), label: tx('tourOpenAbout'), reveal: goTab('about') }), s('[data-search=changelog-search]', 'achangelog', { text: tx('tourNotHere'), label: tx('tourOpenAbout'), reveal: goTab('about') })];
    default: return [s('#cmd', 'palette'), s('.top md-chip-set, .set-langs', 'language', { text: tx('tourLangHidden'), label: tx('tourOpenSettings'), reveal: () => { prefs.settingsSection = 'language'; goTab('settings')(); } }), s('#bell', 'bell'), s(tabsTarget(), 'tabs'), s('#tour-help', 'help')];
  }
}
function offerTour() {
  if (prefs.tourOffered) return;
  prefs.tourOffered = true; savePrefs();
  setTimeout(() => notify(tx('tourOffer'), false, { label: tx('tourTake'), run: () => takeTour('app') }), 600);
}
function takeTour(name: 'app' | Tab = 'app', start = 0) {
  const steps = tourSteps(name);
  const label = name === 'app' ? tx('tourWhole') : tx(name as Key);
  startTour(label, steps, { stepOf: (n, m, tour) => tx('tourStepOf', { n, m, tour }), back: tx('back'), skip: tx('tourSkip'), next: tx('next'), done: tx('tourDone'), close: tx('close'), notHere: tx('tourNotHere') }, {
    start,
    onStep: (i) => { prefs.tourResume = { name, step: i }; savePrefs(); },
    onEnd: (finished) => { prefs.tourOffered = true; if (finished) prefs.tourResume = null; savePrefs(); },
  });
}
function resumeOrStartTour() { const r = prefs.tourResume; if (r) takeTour(r.name as 'app' | Tab, r.step); else takeTour('app'); }

function updateText(u: UpdState | undefined): string {
  if (!desktopBridge?.updates) return tx('updWeb');
  if (!u) return tx('updIdle');
  switch (u.state) {
    case 'disabled': return u.reason;
    case 'checking': return tx('updChecking');
    case 'downloading': return tx('updDownloading');
    case 'none': return tx('updNone');
    case 'ready': return tx('updReady', { v: u.version });
    case 'error': return tx('updError', { e: u.message });
    default: return tx('updIdle');
  }
}
function updateBanner() {
  const el = document.getElementById('update-banner');
  if (!el) return;
  // Update coming soon: a quiet card while the download runs. Hide keeps it away until the next download.
  if (upd?.state === 'downloading' && !updSoonHidden) {
    el.hidden = false;
    el.classList.add('soon');
    el.innerHTML = `<span class="ub-icon" aria-hidden="true">↓</span><span class="ub-text"><b>${esc(tx('updSoon'))}</b><small>${esc(tx('updSoonBody'))}</small>
      <md-linear-progress indeterminate aria-label="${esc(tx('updSoon'))}"></md-linear-progress></span><md-text-button id="ub-hide">${esc(tx('updHide'))}</md-text-button>`;
    el.querySelector('#ub-hide')!.addEventListener('click', () => { updSoonHidden = true; updateBanner(); document.getElementById('cmd')?.focus(); });
    return;
  }
  el.classList.remove('soon');
  if (!upd || upd.state !== 'ready' || updLater) { el.hidden = true; el.innerHTML = ''; return; }
  const u = upd;
  el.hidden = false;
  el.innerHTML = `<span class="ub-icon" aria-hidden="true">↻</span><span class="ub-text"><b>${esc(tx('updReady', { v: u.version }))}</b><small>${esc(tx('updUnsigned'))}</small></span>
    <a href="${esc(u.notes)}" target="_blank" rel="noopener">${esc(tx('updNotes'))}</a>
    <md-text-button id="ub-later">${esc(tx('updLater'))}</md-text-button><md-filled-button id="ub-restart">${esc(tx('updRestart'))}</md-filled-button>`;
  el.querySelector('#ub-later')!.addEventListener('click', () => { updLater = true; updateBanner(); document.getElementById('cmd')?.focus(); });
  el.querySelector('#ub-restart')!.addEventListener('click', async () => {
    if (busy) { notify(tx('updBusy'), true); return; }
    if (!await desktopBridge!.updates!.restart()) notify(tx('updError', { e: tx('updNotReady') }), true);
  });
}
async function checkForUpdates() {
  if (!desktopBridge?.updates) { notify(tx('updWeb')); return; }
  updLater = false;
  upd = await desktopBridge.updates.check();
  notify(updateText(upd), upd.state === 'error');
  if (prefs.tab === 'about') render(); else updateBanner();
}

function helpMenu(anchor: HTMLElement) {
  document.querySelector('.help-menu')?.remove();
  const m = document.createElement('div');
  m.className = 'help-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', tx('help'));
  const items: Array<[string, () => void]> = [[tx('tourTake'), () => takeTour('app')], [tx('tourThisPage'), () => takeTour(prefs.tab as Tab)], ...(prefs.tourResume ? [[tx('tourResume'), resumeOrStartTour] as [string, () => void]] : []), [tx('paletteHint'), () => showPalette()]];
  m.innerHTML = items.map(([label], i) => `<button role="menuitem" data-i="${i}">${esc(label)}</button>`).join('');
  const r = anchor.getBoundingClientRect();
  Object.assign(m.style, { top: `${r.bottom + 6}px`, right: `${Math.max(8, innerWidth - r.right)}px` });
  document.body.append(m);
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); };
  const outside = (e: Event) => { if (!m.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => {
    const b = Array.from(m.querySelectorAll<HTMLElement>('button')); const k = b.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); b[(k + 1) % b.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); b[(k - 1 + b.length) % b.length].focus(); }
  };
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true);
  m.querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => { close(); items[Number(b.dataset.i)][1](); }));
  m.querySelector<HTMLElement>('button')?.focus();
}

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
      ${user && prefs.onboarded ? `<md-icon-button id="tour-help" aria-label="${esc(tx('help'))}" title="${esc(tx('help'))}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01"/></svg></md-icon-button>` : ''}
      ${user ? `<span class="bell-wrap"><md-icon-button id="bell" aria-label="${esc(tx('notifications'))}${notes.length ? `, ${notes.length}` : ''}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/></svg></md-icon-button>${notes.length ? `<span class="badge">${notes.length}</span>` : ''}</span>` : ''}
      ${user ? `<md-outlined-button id="logout">${esc(user.name)}</md-outlined-button>` : ''}
    </header>
    <div id="update-banner" class="update-banner" role="region" aria-label="${esc(tx('updateRegion'))}" hidden></div>
    <div class="body">
      ${user && prefs.onboarded ? `<nav class="tabs" aria-label="Tabs"><md-list role="tablist" aria-orientation="vertical">
        ${open.map((x) => `<md-list-item type="button" role="tab" aria-selected="${x === prefs.tab}" data-tab="${x}" class="${x === prefs.tab ? 'active' : ''}">${esc(tx(x as Key))}
          ${x === prefs.tab && !prefs.tabsLocked ? `<md-outlined-button slot="end" data-close="${x}">${esc(tx('close'))}</md-outlined-button>` : ''}</md-list-item>`).join('')}
        </md-list>
        <div class="tab-tools"><md-text-button id="tab-find">${esc(tx('tabSearch'))}</md-text-button>${prefs.closedTabs.length ? `<md-text-button id="open-all">${esc(tx('openEveryTab'))}</md-text-button>` : ''}</div>
      </nav>` : ''}
      <main id="view" class="view" role="tabpanel"></main>
    </div>
    ${user && prefs.onboarded ? `<nav class="bottom-nav" aria-label="${esc(tx('destinations'))}">${open.map((x) => `<button data-tab="${x}" ${x === prefs.tab ? 'aria-current="page"' : ''}><span class="pill">${TAB_ICON[x]}</span><span>${esc(tx(x as Key))}</span></button>`).join('')}</nav>` : ''}
    <div id="toasts" class="toasts" aria-live="polite"></div>`;
  app.querySelectorAll<HTMLElement>('[data-lang]').forEach((c) => c.addEventListener('click', () => { prefs.lang = c.dataset.lang as Lang; savePrefs(); render(); }));
  app.querySelectorAll<HTMLElement>('[data-tab]').forEach((c) => c.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-close]')) return; prefs.tab = c.dataset.tab!; savePrefs(); render(); }));
  app.querySelectorAll<HTMLElement>('[data-close]').forEach((c) => c.addEventListener('click', () => { prefs.closedTabs.push(c.dataset.close!); savePrefs(); render(); }));
  app.querySelector('#open-all')?.addEventListener('click', () => { prefs.closedTabs = []; savePrefs(); render(); });
  app.querySelector('#tab-find')?.addEventListener('click', () => tabSearch());
  app.querySelector('#cmd')?.addEventListener('click', () => showPalette());
  app.querySelector('#bell')?.addEventListener('click', () => toggleNoteCentre());
  app.querySelector('#tour-help')?.addEventListener('click', (e) => helpMenu(e.currentTarget as HTMLElement));
  updateBanner();
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
      done: () => { prefs.onboarded = true; prefs.tab = 'worlds'; savePrefs(); render(); offerTour(); },
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
      loadExtensions().catch(() => undefined);
      hasOwner = true; render();
    } catch (err) { notify((err as Error).message, true); if (/owner/.test((err as Error).message)) { hasOwner = true; render(); } }
  });
}

function worldsScreen(view: HTMLElement) {
  return worldsView(view, {
    api, notify, tx, esc, play, takeovers: () => prefs.takeovers,
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
let setMapMode: ((m: MapMode) => void) | undefined;
let selectTool: ((op: string) => void) | undefined;

async function undoLast() {
  if (!world) return;
  if (prefs.editLock) { notify(tx('editLocked'), true); return; }
  try {
    const r = await api<{ undid: string }>('/api/history/undo', { method: 'POST', body: {} });
    notify(tx('undone', { what: r.undid })); play('undo');
    document.dispatchEvent(new Event('history-changed'));
    document.dispatchEvent(new Event('world-changed'));
  } catch (e) { notify((e as Error).message, true); }
}
const sel = { x1: 0, y1: 60, z1: 0, x2: 15, y2: 70, z2: 15 };
let dim = 'overworld';
// Map toolbar modes: what a drag or click on the map does. Shift+drag always selects.
const MAP_MODES = ['pan', 'select', 'pick', 'measure', 'goto'] as const;
type MapMode = typeof MAP_MODES[number];
const MAP_MODE_KEYS: Record<MapMode, string> = { pan: 'H', select: 'S', pick: 'I', measure: 'M', goto: 'G' };
let mapMode: MapMode = 'pan';
/** Blocks in the Block palette panel; picked blocks are added to the front. */
const PALETTE_BLOCKS = ['minecraft:stone_bricks', 'minecraft:oak_planks', 'minecraft:grass_block', 'minecraft:water', 'minecraft:sand', 'minecraft:glass', 'minecraft:deepslate', 'minecraft:cherry_leaves',
  'minecraft:stone', 'minecraft:dirt', 'minecraft:cobblestone', 'minecraft:gold_block', 'minecraft:lava', 'minecraft:snow_block', 'minecraft:spruce_planks', 'minecraft:air'];
let pickedBlocks: string[] = [];
async function editorView(view: HTMLElement): Promise<void> {
  if (!world) { prefs.tab = 'worlds'; return render(); }
  const root = document.createElement('div');
  root.innerHTML = `<div class="editor">
    <section class="map card flat"><div class="map-bar">
        <md-chip-set aria-label="Dimension">${(world.dimensions?.length ? world.dimensions : ['overworld']).map((d) => `<md-filter-chip data-dim="${d}" label="${esc(tx(d as Key))}" ${d === dim ? 'selected' : ''}></md-filter-chip>`).join('')}</md-chip-set>
        <span class="spacer"></span><md-filled-tonal-button id="undo" title="Ctrl+Z">${esc(tx('undo'))}</md-filled-tonal-button></div>
      <canvas id="map" role="img" aria-label="Top-down map"></canvas>
      <div class="coords md-typescale-body-small" id="coords">x 0 · z 0</div>
      <div class="map-toolbar" role="toolbar" aria-label="${esc(tx('mapTools'))}">
        ${MAP_MODES.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${m === mapMode}" title="${esc(tx(`mode_${m}` as Key))} (${MAP_MODE_KEYS[m]})">${esc(tx(`mode_${m}` as Key))}</button>`).join('')}
      </div>
      <div class="mt-status" id="mt-status" aria-live="polite"></div>
      <form class="goto-form" id="goto" hidden><md-outlined-text-field name="gx" type="number" label="x"></md-outlined-text-field><md-outlined-text-field name="gz" type="number" label="z"></md-outlined-text-field><md-filled-button type="submit">${esc(tx('mode_goto'))}</md-filled-button><md-text-button type="button" id="goto-x">${esc(tx('close'))}</md-text-button></form></section>
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
    if (prefs.editLock) { notify(tx('editLocked'), true); return; }
    runBtn.setAttribute('disabled', '');
    busy++;
    try {
      const r = await api<{ changed: number; skipped: number; ms: number }>('/api/op', { method: 'POST', body });
      play('success');
      notify(tx('opDone', { op: tx(op), n: r.changed.toLocaleString('en'), ms: r.ms }), false, { label: tx('history'), run: () => { prefs.tab = 'history'; render(); } });
      document.dispatchEvent(new Event('history-changed'));
      if (r.skipped) notify(tx('opSkipped', { n: r.skipped.toLocaleString('en') }), true);
      await drawMap();
    } catch (err) { notify((err as Error).message, true); } finally { busy--; runBtn.removeAttribute('disabled'); }
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
  let drag: { x: number; y: number; ox: number; oz: number; kind: 'pan' | 'select' | 'measure'; bx: number; bz: number } | undefined;
  let measure: { x1: number; z1: number; x2: number; z2: number } | undefined;
  const status = mapEl.querySelector<HTMLElement>('#mt-status')!;
  const toBlock = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / scale + originX), z: Math.floor((e.clientY - r.top) / scale + originZ) }; };
  const drawMeasure = () => {
    if (!measure) return;
    const p = (x: number, z: number) => [(x + 0.5 - originX) * scale, (z + 0.5 - originZ) * scale] as const;
    const [ax, az] = p(measure.x1, measure.z1), [bx, bz] = p(measure.x2, measure.z2);
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-tertiary') || '#fff';
    ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke(); ctx.restore();
  };
  const measureText = () => {
    if (!measure) return '';
    const dx = Math.abs(measure.x2 - measure.x1), dz = Math.abs(measure.z2 - measure.z1);
    return tx('measureResult', { dx, dz, d: Math.hypot(dx, dz).toFixed(1), area: ((dx + 1) * (dz + 1)).toLocaleString('en') });
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const b = toBlock(e);
    if (mapMode === 'pick' && !e.shiftKey) { void pickAt(b.x, b.z); return; }
    if (mapMode === 'goto' && !e.shiftKey) { openGoto(b.x, b.z); return; }
    const kind = e.shiftKey || mapMode === 'select' ? 'select' : mapMode === 'measure' ? 'measure' : 'pan';
    drag = { x: e.clientX, y: e.clientY, ox: originX, oz: originZ, kind, bx: b.x, bz: b.z };
    if (kind === 'select') { sel.x1 = sel.x2 = b.x; sel.z1 = sel.z2 = b.z; }
    if (kind === 'measure') { measure = { x1: b.x, z1: b.z, x2: b.x, z2: b.z }; status.textContent = measureText(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const b = toBlock(e); mapEl.querySelector('#coords')!.textContent = `x ${b.x} · z ${b.z} · chunk ${Math.floor(b.x / 16)}, ${Math.floor(b.z / 16)}`;
    if (!drag) return;
    if (drag.kind === 'select') { sel.x2 = b.x; sel.z2 = b.z; size(); drawSel(); }
    else if (drag.kind === 'measure') { measure = { ...measure!, x2: b.x, z2: b.z }; drawSel(); drawMeasure(); status.textContent = measureText(); }
    else { originX = drag.ox - (e.clientX - drag.x) / scale; originZ = drag.oz - (e.clientY - drag.y) / scale; drawSel(); drawMeasure(); }
  });
  canvas.addEventListener('pointerup', () => { const was = drag; drag = undefined; if (was?.kind === 'pan') drawMap(); else if (was?.kind === 'select') syncSel?.(); });
  async function pickAt(x: number, z: number) {
    try {
      const { top } = await api<{ top: { y: number; block: string } | null }>(`/api/top?dim=${dim}&x=${x}&z=${z}`);
      if (!top) { status.textContent = tx('pickNone', { x, z }); return; }
      useBlock(top.block);
      pickedBlocks = [top.block, ...pickedBlocks.filter((b) => b !== top.block)].slice(0, 8);
      drawPalette();
      status.textContent = tx('picked', { block: top.block, x, y: top.y, z });
      play('create');
    } catch (err) { notify((err as Error).message, true); }
  }
  /** Put a block into the current tool: Fill's block, or Replace's "to". Other tools switch to Fill. */
  function useBlock(block: string) {
    if (op !== 'fill' && op !== 'replace') { setOp('fill'); toolEl.querySelectorAll<HTMLElement & { selected: boolean }>('[data-op]').forEach((c) => { c.selected = c.dataset.op === 'fill'; }); }
    const f = fields.querySelector<HTMLInputElement>(op === 'replace' ? '[name=to]' : '[name=block]');
    if (f) f.value = block;
  }
  const gotoForm = mapEl.querySelector<HTMLFormElement>('#goto')!;
  function openGoto(x?: number, z?: number) {
    gotoForm.hidden = false;
    const gx = gotoForm.querySelector<HTMLInputElement>('[name=gx]')!, gz = gotoForm.querySelector<HTMLInputElement>('[name=gz]')!;
    if (x !== undefined) gx.value = String(x);
    if (z !== undefined) gz.value = String(z);
    gx.focus();
  }
  gotoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = Number(gotoForm.querySelector<HTMLInputElement>('[name=gx]')!.value), z = Number(gotoForm.querySelector<HTMLInputElement>('[name=gz]')!.value);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 30_000_000 || Math.abs(z) > 30_000_000) { status.textContent = tx('gotoBad'); return; }
    const rect = canvas.getBoundingClientRect();
    originX = x - rect.width / scale / 2; originZ = z - rect.height / scale / 2;
    status.textContent = tx('gotoDone', { x: Math.trunc(x), z: Math.trunc(z) });
    gotoForm.hidden = true; void drawMap();
  });
  gotoForm.querySelector('#goto-x')!.addEventListener('click', () => { gotoForm.hidden = true; });
  gotoForm.querySelector('md-filled-button')!.addEventListener('click', () => gotoForm.requestSubmit());
  const setMode = (m: MapMode) => {
    mapMode = m;
    mapEl.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    canvas.dataset.mode = m;
    if (m !== 'measure') { measure = undefined; drawSel(); }
    status.textContent = tx(`modeHint_${m}` as Key);
    if (m === 'goto') openGoto(); else gotoForm.hidden = true;
  };
  mapEl.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as MapMode)));
  setMapMode = setMode;
  canvas.dataset.mode = mapMode;
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.max(0.5, Math.min(16, scale * (e.deltaY < 0 ? 1.25 : 0.8))); drawMap(); }, { passive: false });
  syncSel = () => toolEl.querySelectorAll<HTMLInputElement>('.coords-grid md-outlined-text-field').forEach((f) => { f.value = String((sel as Record<string, number>)[f.getAttribute('name')!]); });
  new ResizeObserver(async () => { if (fitPending && canvas.clientWidth > 0) { fitPending = false; await fitToWorld(); } drawMap(); }).observe(canvas);
  const histEl = document.createElement('div'); histEl.className = 'panel-scroll';
  const notesEl = document.createElement('div'); notesEl.className = 'panel-scroll';
  const blocksEl = document.createElement('section'); blocksEl.className = 'panel-scroll block-palette';
  function drawPalette() {
    const list = [...pickedBlocks, ...PALETTE_BLOCKS.filter((b) => !pickedBlocks.includes(b))];
    blocksEl.innerHTML = `<p class="muted">${esc(tx('paletteNote'))}</p><div class="bp-grid" role="list">${list.map((b) => {
      const [r, g, bl] = blockColor(b);
      return `<button type="button" role="listitem" class="bp-swatch${pickedBlocks.includes(b) ? ' picked' : ''}" data-pb="${esc(b)}" title="${esc(b)}" aria-label="${esc(b.slice(10))}"><span style="background: rgb(${r} ${g} ${bl})"></span><small>${esc(b.slice(10).replace(/_/g, ' '))}</small></button>`;
    }).join('')}</div>`;
    blocksEl.querySelectorAll<HTMLElement>('[data-pb]').forEach((sw) => sw.addEventListener('click', () => { useBlock(sw.dataset.pb!); status.textContent = tx('blockSet', { block: sw.dataset.pb! }); }));
  }
  drawPalette();
  view.innerHTML = '<div id="dock" class="dock"></div>';
  mountWorkspace(view.querySelector<HTMLElement>('#dock')!, { map: mapEl, tool: toolEl, blocks: blocksEl, history: histEl, notes: notesEl }, {
    map: tx('editor'), tool: tx('fill'), blocks: tx('blockPalette'), history: tx('history'), notes: tx('notes'),
  }, prefs.dark, undefined, prefs.layoutLocked);
  historyView(histEl, true);
  document.addEventListener('history-changed', () => { if (histEl.isConnected) historyView(histEl, true); });
  notesPanel(notesEl);
}

async function historyView(view: HTMLElement, embedded = false): Promise<void> {
  if (!world) { prefs.tab = 'worlds'; return render(); }
  // Two docked panels: the filterable list of edits, and the details of the selected edit.
  view.innerHTML = embedded ? '' : '<div id="dock" class="dock"></div>';
  const listEl = document.createElement('section');
  listEl.className = 'card panel-scroll';
  listEl.innerHTML = `<h1 class="md-typescale-display-small">${esc(tx('history'))}</h1><p class="muted">${esc(tx('historyNote'))}</p><div id="h"><md-linear-progress indeterminate aria-label="Loading"></md-linear-progress></div>`;
  const detailEl = document.createElement('section');
  detailEl.className = 'card panel-scroll h-detail';
  detailEl.innerHTML = `<p class="muted">${esc(tx('hPick'))}</p>`;
  // Inside the editor's own History panel the list stands alone; the History tab docks list and details.
  if (embedded) { listEl.className = 'card'; view.append(listEl); }
  else mountWorkspace(view.querySelector<HTMLElement>('#dock')!, { edits: listEl, details: detailEl }, { edits: tx('hEdits'), details: tx('hDetails') }, document.documentElement.dataset.theme === 'dark',
    { key: 'history', arrange: [['edits'], ['details', { ref: 'edits', dir: 'right' }, 420]], active: 'edits' }, prefs.layoutLocked);
  const outer = view;
  view = listEl;
  try {
    const { entries } = await api<{ entries: Array<{ sha: string; message: string; action: string; time: number }> }>('/api/history');
    const counts = new Map<string, number>(); for (const e of entries) counts.set(e.action, (counts.get(e.action) ?? 0) + 1);
    view.querySelector('#h')!.innerHTML = `<div class="h-filters"><div id="hq-host"></div>
        <md-outlined-text-field id="hfrom" type="date" label="${esc(tx('fromDate'))}"></md-outlined-text-field><md-outlined-text-field id="hto" type="date" label="${esc(tx('toDate'))}"></md-outlined-text-field></div>
      <p class="muted" id="hcount" aria-live="polite"></p><md-chip-set>${[...counts].map(([a, n]) => `<md-filter-chip data-a="${esc(a)}" label="${esc(a)} · ${n}"></md-filter-chip>`).join('')}</md-chip-set>
      <md-list>${entries.map((e, i) => `<md-list-item data-row="${esc(e.action)}" data-t="${e.time}" data-text="${esc((e.message + ' ' + e.sha).toLowerCase())}"><div slot="headline">${esc(e.message)}</div>
        <div slot="supporting-text">${esc(new Date(e.time * 1000).toLocaleString('en-GB'))} · <code>${esc(e.sha.slice(0, 7))}</code></div>
        ${i > 0 ? `<md-text-button slot="end" data-sha="${esc(e.sha)}">${esc(tx('rollBack'))}</md-text-button>` : ''}</md-list-item>`).join('')}</md-list>`;
    // Selecting an edit shows its details in the other panel.
    const showDetail = (i: number) => {
      const e = entries[i]; if (!e) return;
      view.querySelectorAll('[data-row].picked').forEach((r) => r.classList.remove('picked'));
      view.querySelectorAll<HTMLElement>('[data-row]')[i]?.classList.add('picked');
      detailEl.innerHTML = `<small class="h-kind">${esc(e.action)}</small><h2>${esc(e.message)}</h2>
        <dl><dt>${esc(tx('hWhen'))}</dt><dd>${esc(new Date(e.time * 1000).toLocaleString('en-GB'))}</dd><dt>${esc(tx('hCommit'))}</dt><dd><code>${esc(e.sha)}</code></dd><dt>${esc(tx('hPosition'))}</dt><dd>${esc(tx('hPositionValue', { n: i + 1, m: entries.length }))}</dd>
        <dt>${esc(tx('hChanges'))}</dt><dd id="hd-stats" aria-live="polite">${esc(tx('hCounting'))}</dd></dl>
        ${i > 0 ? '' : `<p class="muted">${esc(tx('hLatest'))}</p>`}<div class="row-actions">${i > 0 ? `<md-filled-tonal-button id="hd-roll">${esc(tx('rollBack'))}</md-filled-tonal-button>` : ''}<md-outlined-button id="hd-open-copy">${esc(tx('hOpenCopy'))}</md-outlined-button><md-outlined-button id="hd-copy">${esc(tx('hCopySha'))}</md-outlined-button></div>`;
      const DIM_NAME: Record<string, string> = { overworld: tx('overworld'), nether: tx('nether'), end: tx('end') };
      api<{ stats: { files: number; regions: number; chunks: number; dimensions: string[] } }>(`/api/history/stats?sha=${e.sha}`).then(({ stats: st }) => {
        const el = detailEl.querySelector('#hd-stats'); if (!el) return;
        const count = (n: number, one: Parameters<typeof tx>[0], many: Parameters<typeof tx>[0]) => (n === 1 ? tx(one) : tx(many, { n }));
        const f = count(st.files, 'nFile', 'nFiles');
        el.textContent = st.chunks ? tx('hStats', { c: count(st.chunks, 'nChunk', 'nChunks'), r: count(st.regions, 'nRegion', 'nRegions'), d: st.dimensions.map((x) => DIM_NAME[x] ?? x).join(', '), f }) : tx('hStatsNoChunks', { f });
      }, (err) => { const el = detailEl.querySelector('#hd-stats'); if (el) el.textContent = tx('hStatsFail', { e: (err as Error).message }); });
      detailEl.querySelector('#hd-open-copy')!.addEventListener('click', async (ev) => {
        const b = ev.currentTarget as HTMLElement & { disabled: boolean }; b.disabled = true;
        try {
          const r = await api<{ path: string; name: string }>('/api/history/copy', { method: 'POST', body: { sha: e.sha } });
          notify(tx('hCopyMade', { name: r.name }), false, { label: tx('hCopyOpen'), run: async () => {
            const o = await api('/api/worlds/open', { method: 'POST', body: { path: r.path } });
            world = { ...o.info }; dim = 'overworld'; fitPending = true; prefs.tab = 'editor'; savePrefs(); render();
          } });
          play('success');
        } catch (err) { notify((err as Error).message, true); } finally { b.disabled = false; }
      });
      detailEl.querySelector('#hd-copy')!.addEventListener('click', () => navigator.clipboard?.writeText(e.sha).then(() => notify(tx('copied'))));
      detailEl.querySelector('#hd-roll')?.addEventListener('click', () => (view.querySelector(`[data-sha="${CSS.escape(e.sha)}"]`) as HTMLElement | null)?.click());
    };
    view.querySelectorAll<HTMLElement>('[data-row]').forEach((r, i) => {
      r.setAttribute('type', 'button');
      r.addEventListener('click', (ev) => { if (!(ev.target as HTMLElement).closest('[data-sha]')) showDetail(i); });
    });
    showDetail(0);
    const active = new Set<string>();
    const val = (id: string) => (view.querySelector(id) as HTMLInputElement).value;
    const hq = searchBox('history-search', tx('searchHistory'), rx);
    view.querySelector('#hq-host')!.replaceWith(hq.el);
    const rows = Array.from(view.querySelectorAll<HTMLElement>('[data-row]'));
    let run = 0;
    const filter = async () => {
      const my = ++run;
      const hits = await hq.filter(rows.map((r) => r.dataset.text!)) ?? rows.map(() => false);
      if (my !== run) return;
      const from = val('#hfrom') ? new Date(val('#hfrom') + 'T00:00:00').getTime() / 1000 : -Infinity;
      const to = val('#hto') ? new Date(val('#hto') + 'T23:59:59').getTime() / 1000 : Infinity;
      let shown = 0;
      view.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => {
        const t = Number(r.dataset.t);
        r.hidden = (active.size > 0 && !active.has(r.dataset.row!)) || !hits[rows.indexOf(r)] || t < from || t > to;
        if (!r.hidden) shown++;
      });
      view.querySelector('#hcount')!.textContent = tx('historyCount', { shown, total: entries.length });
    };
    view.querySelectorAll<HTMLElement>('[data-a]').forEach((c) => c.addEventListener('click', () => {
      const a = c.dataset.a!; active.has(a) ? active.delete(a) : active.add(a); filter();
    }));
    hq.onChange(filter);
    for (const id of ['#hfrom', '#hto']) view.querySelector(id)!.addEventListener('input', filter);
    filter();
    view.querySelectorAll<HTMLElement>('[data-sha]').forEach((b) => b.addEventListener('click', async () => {
      if (prefs.editLock) { notify(tx('editLocked'), true); return; }
      try { await api('/api/history/restore', { method: 'POST', body: { sha: b.dataset.sha } }); notify(tx('restored')); play('undo'); historyView(outer, embedded); }
      catch (err) { notify((err as Error).message, true); }
    }));
  } catch (err) { notify((err as Error).message, true); }
}

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
const UNLOCK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/></svg>';
const SECTIONS = [['language', 'secLanguage'], ['appearance', 'secAppearance'], ['comfort', 'secComfort'], ['sounds', 'secSounds'], ['extensions', 'secExtensions'], ['backup', 'secBackup'], ['later', 'secLater']] as const;

async function extensionsPanel(view: HTMLElement) {
  const host = view.querySelector<HTMLElement>('#ext-list');
  if (!host) return;
  let data: ExtState;
  try { data = await loadExtensions(); } catch (e) { host.innerHTML = `<p class="muted">${esc((e as Error).message)}</p>`; return; }
  const q = searchBox('extension-search', tx('searchExtensions'), rx, { compact: true });
  const qHost = view.querySelector('#ext-q') ?? view.querySelector('[data-search=extension-search]');
  qHost?.replaceWith(q.el);
  view.querySelector('.ext-bar')?.remove(); view.querySelector('.ext-runs')?.remove();
  const bar = document.createElement('div');
  bar.className = 'ext-bar';
  bar.innerHTML = `<label class="ext-master"><md-switch id="ext-master" ${data.masterOn ? 'selected' : ''} aria-label="${esc(tx('extMaster'))}"></md-switch><span><b>${esc(tx('extMaster'))}</b><small>${esc(tx(data.masterOn ? 'extMasterOn' : 'extMasterOff'))}</small></span></label>
    <span class="spacer"></span>
    <md-outlined-button id="ext-zip">${esc(tx('extAddZip'))}</md-outlined-button><md-outlined-button id="ext-link">${esc(tx('extAddLink'))}</md-outlined-button><input type="file" id="ext-zip-file" accept=".zip,application/zip" hidden>
    ${data.canAddFolder && desktopBridge ? `<md-outlined-button id="ext-folder">${esc(tx('extAddFolder'))}</md-outlined-button>` : ''}
    ${data.folder && desktopBridge?.openDataFolder ? `<md-text-button id="ext-open">${esc(tx('extOpenFolder'))}</md-text-button>` : ''}
    <md-text-button id="ext-reload">${esc(tx('extReload'))}</md-text-button>`;
  q.el.before(bar);
  bar.querySelector('#ext-master')!.addEventListener('change', async (ev) => {
    const on = (ev.target as HTMLElement & { selected: boolean }).selected;
    await api('/api/extensions/master', { method: 'POST', body: { on } }).catch((err) => notify((err as Error).message, true));
    notify(tx(on ? 'extMasterOn' : 'extMasterOff')); void extensionsPanel(view);
  });
  bar.querySelector('#ext-reload')!.addEventListener('click', () => { void extensionsPanel(view); notify(tx('extReloaded')); });
  bar.querySelector('#ext-open')?.addEventListener('click', async () => { const r = await desktopBridge!.openDataFolder!(data.folder!); if (r) notify(r, true); });
  // Adding asks before replacing an installed copy with a different version.
  const added = async (doIt: (replace: boolean) => Promise<Response>) => {
    let r = await doIt(false);
    let j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.replace) {
      if (!await askConfirm(tx('extReplace', { id: j.id, installed: j.installed, incoming: j.incoming }), tx('extReplaceOk'))) return;
      r = await doIt(true); j = await r.json().catch(() => ({}));
    }
    if (!r.ok) { notify(j.error ?? `${r.status}`, true); return; }
    notify(j.sha256 ? tx('extAddedSha', { name: j.name, version: j.version, sha: j.sha256 }) : tx('extAdded', { name: j.name, version: j.version })); play('create'); void extensionsPanel(view);
  };
  const zipIn = bar.querySelector<HTMLInputElement>('#ext-zip-file')!;
  bar.querySelector('#ext-zip')!.addEventListener('click', () => zipIn.click());
  zipIn.addEventListener('change', () => {
    const f = zipIn.files?.[0]; if (!f) return;
    void added((replace) => fetch('/api/extensions/upload', { method: 'POST', headers: { 'content-type': 'application/zip', 'x-map-editor': '1', ...(replace ? { 'x-replace': '1' } : {}) }, body: f }));
    zipIn.value = '';
  });
  // A dialog rather than prompt(): the desktop app has no prompt(), and the SHA-256 needs its own field.
  bar.querySelector('#ext-link')!.addEventListener('click', () => {
    const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; close: () => void; returnValue: string };
    dlg.innerHTML = `<div slot="headline">${esc(tx('extAddLink'))}</div>
      <form slot="content" id="ext-link-form" method="dialog" class="stack">
        <md-outlined-text-field name="url" type="url" label="${esc(tx('extLinkAsk'))}" required></md-outlined-text-field>
        <p class="muted">${esc(tx('extLinkOff'))}</p>
        <md-outlined-text-field name="sha" label="${esc(tx('extShaLabel'))}" supporting-text="${esc(tx('extShaNote'))}" maxlength="64"></md-outlined-text-field>
      </form>
      <div slot="actions"><md-text-button form="ext-link-form" value="cancel">${esc(tx('cancel'))}</md-text-button><md-filled-button form="ext-link-form" value="ok">${esc(tx('extInstall'))}</md-filled-button></div>`;
    document.body.append(dlg);
    dlg.show();
    dlg.addEventListener('closed', () => {
      const link = (dlg.querySelector('[name=url]') as HTMLInputElement).value.trim();
      const sha = (dlg.querySelector('[name=sha]') as HTMLInputElement).value.trim();
      const ok = dlg.returnValue === 'ok';
      dlg.remove();
      if (!ok || !link) return;
      void added((replace) => fetch('/api/extensions/add-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: link, replace, ...(sha ? { sha256: sha } : {}) }) }));
    });
  });
  bar.querySelector('#ext-folder')?.addEventListener('click', async () => {
    const dir = await desktopBridge!.pickFolder(); if (!dir) return;
    void added((replace) => fetch('/api/extensions/add-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: dir, replace }) }));
  });
  const card = (e: ExtInfo) => `<article class="ext-card${e.error ? ' broken' : ''}" data-ext="${esc(e.id)}">
      <header><span class="ext-icon" aria-hidden="true">${esc(e.name.slice(0, 1).toUpperCase())}</span><span class="ext-title"><b>${esc(e.name)}</b><small>${esc(e.version)} · ${esc(e.builtIn ? tx('extBuiltIn') : tx('extYours'))}${e.needsConsent && !e.error ? ` · ${esc(tx('extNeedsConsent'))}` : ''}</small></span>
      ${e.error ? '' : `<md-switch data-ext-toggle="${esc(e.id)}" ${e.enabled ? 'selected' : ''} aria-label="${esc(e.name)}"></md-switch>`}</header>
      ${e.error ? `<p class="ext-error" role="alert">${esc(e.error)}</p>` : `<p>${esc(e.description ?? '')}</p>
      <ul class="ext-perms">${e.permissions.map((p) => `<li>${esc(data.perms[p] ?? p)}</li>`).join('')}</ul>
      <div class="ext-cmds">${e.commands.map((c) => `<md-assist-chip data-ext-run="${esc(e.id)}" data-cmd="${esc(c.id)}" label="${esc(c.title)}" ${e.enabled && data.masterOn ? '' : 'disabled'}></md-assist-chip>`).join('')}</div>`}
      ${e.builtIn ? '' : `<md-text-button class="ext-remove" data-ext-remove="${esc(e.id)}">${esc(tx('extRemove'))}</md-text-button>`}
    </article>`;
  host.innerHTML = data.list.length ? data.list.map(card).join('') : `<p class="muted">${esc(tx('extNone'))}</p>`;
  const cards = Array.from(host.querySelectorAll<HTMLElement>('[data-ext]'));
  const none = document.createElement('p'); none.className = 'muted'; none.hidden = true; host.after(none);
  let run = 0;
  q.onChange(async () => {
    const my = ++run;
    const hits = await q.filter(data.list.map((e) => `${e.name} ${e.description ?? ''} ${e.commands.map((c) => c.title).join(' ')} ${e.permissions.join(' ')}`)) ?? data.list.map(() => false);
    if (my !== run) return;
    cards.forEach((c, i) => { c.hidden = !hits[i]; });
    none.hidden = hits.some(Boolean); none.textContent = tx('noMatches');
  });
  host.querySelectorAll<HTMLElement & { selected: boolean }>('[data-ext-toggle]').forEach((sw) => sw.addEventListener('change', async () => {
    const e = data.list.find((x) => x.id === sw.dataset.extToggle)!;
    if (!sw.selected) { await api('/api/extensions/enable', { method: 'POST', body: { id: e.id, enabled: false } }).catch((err) => notify((err as Error).message, true)); void extensionsPanel(view); return; }
    sw.selected = false; // only switched on after the user allows the permissions
    const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; close: () => void; returnValue: string };
    dlg.innerHTML = `<div slot="headline">${esc(tx('extAllowTitle', { name: e.name }))}</div>
      <form slot="content" id="ext-consent" method="dialog"><p>${esc(tx('extAllowBody'))}</p><ul class="ext-perms">${e.permissions.map((p) => `<li>${esc(data.perms[p] ?? p)}</li>`).join('') || `<li>${esc(tx('extNoPerms'))}</li>`}</ul></form>
      <div slot="actions"><md-text-button form="ext-consent" value="cancel">${esc(tx('cancel'))}</md-text-button><md-filled-button form="ext-consent" value="allow">${esc(tx('extAllow'))}</md-filled-button></div>`;
    document.body.append(dlg);
    dlg.addEventListener('closed', async () => {
      const ok = dlg.returnValue === 'allow';
      dlg.remove();
      if (!ok) { sw.focus(); return; }
      try { await api('/api/extensions/enable', { method: 'POST', body: { id: e.id, enabled: true, permissionKey: e.permissionKey } }); notify(tx('extOn', { name: e.name })); }
      catch (err) { notify((err as Error).message, true); }
      void extensionsPanel(view);
    });
    dlg.show();
  }));
  host.querySelectorAll<HTMLElement>('[data-ext-run]').forEach((c) => c.addEventListener('click', async () => { await runExtension(c.dataset.extRun!, c.dataset.cmd!); void showRuns(); }));
  host.querySelectorAll<HTMLElement>('[data-ext-remove]').forEach((b) => b.addEventListener('click', async () => {
    const e = data.list.find((x) => x.id === b.dataset.extRemove)!;
    if (!await askConfirm(tx('extRemoveAsk', { name: e.name }), tx('extRemoveOk'), true)) return;
    try { await api('/api/extensions/remove', { method: 'POST', body: { id: e.id } }); notify(tx('extRemoved', { name: e.name })); } catch (err) { notify((err as Error).message, true); }
    void extensionsPanel(view);
  }));
  // Recent runs: what ran, when, how long, and whether it worked.
  const runsEl = document.createElement('section');
  runsEl.className = 'ext-runs';
  host.after(runsEl);
  async function showRuns() {
    let runs: Array<{ at: string; name: string; command: string; ok: boolean; message: string; ms: number; ops: number }> = [];
    try { runs = (await api<{ runs: typeof runs }>('/api/extensions/runs')).runs; } catch { /* shown empty */ }
    runsEl.innerHTML = `<h3>${esc(tx('extRuns'))}</h3>${runs.length ? `<ol>${runs.slice(0, 20).map((r) => `<li class="${r.ok ? '' : 'bad'}"><span class="dot" aria-hidden="true"></span><span><b>${esc(r.name)} › ${esc(r.command)}</b><small>${esc(new Date(r.at).toLocaleString())} · ${r.ms} ms${r.ops ? ` · ${r.ops} ${esc(tx('extOps'))}` : ''} · ${esc(r.ok ? tx('extRunOk') : tx('extRunFailed'))}</small>${r.message ? `<small>${esc(r.message)}</small>` : ''}</span></li>`).join('')}</ol>` : `<p class="muted">${esc(tx('extNoRuns'))}</p>`}`;
  }
  void showRuns();
}

function settingsView(view: HTMLElement) {
  const sec = SECTIONS.some(([id]) => id === prefs.settingsSection) ? prefs.settingsSection : 'language';
  // Every switch can be locked on its own, so it cannot be changed by accident (here or in the palette).
  const lockedSet = new Set(prefs.lockedSettings);
  const sw = (id: string, label: Key, note: Key, on: boolean) => { const locked = lockedSet.has(id); return `<div class="set-row${locked ? ' locked' : ''}" data-find="${esc(tx(label))} ${esc(tx(note))}"><label for="${id}"><span><b>${esc(tx(label))}</b><small>${esc(tx(locked ? 'settingLocked' : note))}</small></span></label>
    <md-icon-button class="set-lock" data-lock="${id}" aria-pressed="${locked}" aria-label="${esc(tx(locked ? 'unlockSetting' : 'lockSetting', { name: tx(label) }))}" title="${esc(tx(locked ? 'unlockSetting' : 'lockSetting', { name: tx(label) }))}">${locked ? LOCK_SVG : UNLOCK_SVG}</md-icon-button>
    <md-switch id="${id}" ${on ? 'selected' : ''} ${locked ? 'disabled' : ''} aria-label="${esc(tx(label))}"></md-switch></div>`; };
  const body: Record<string, string> = {
    language: `<div class="set-langs" role="group" aria-label="${esc(tx('secLanguage'))}" data-find="English 粵語 ${esc(tx('secLanguage'))}">${(['en', 'yue', 'both'] as const).map((l) => `<button class="set-lang${prefs.lang === l ? ' on' : ''}" data-set-lang="${l}" aria-pressed="${prefs.lang === l}">${l === 'en' ? 'English' : l === 'yue' ? '粵語' : 'English + 粵語'}</button>`).join('')}</div>
      <div class="set-sliders">
        <label class="set-slider" data-find="${esc(tx('funnyEn'))}"><span><b>${esc(tx('funnyEn'))}</b><em>${prefs.funnyEn}</em></span><md-slider id="fen" min="1" max="5" step="1" ticks labeled value="${prefs.funnyEn}"></md-slider></label>
        <label class="set-slider" data-find="${esc(tx('funnyYue'))}"><span><b>${esc(tx('funnyYue'))}</b><em>${prefs.funnyYue}</em></span><md-slider id="fyue" min="1" max="5" step="1" ticks labeled value="${prefs.funnyYue}"></md-slider></label>
      </div><p class="muted">${esc(tx('funnyNote'))}</p>`,
    appearance: `${sw('dark', 'dark', 'darkNote', prefs.dark)}${sw('dsched', 'darkSchedule', 'darkScheduleNote', prefs.darkSchedule)}
      <div class="set-times" data-find="${esc(tx('darkSchedule'))} ${esc(tx('darkFrom'))} ${esc(tx('darkTo'))}"><md-outlined-text-field id="dfrom" type="time" label="${esc(tx('darkFrom'))}" value="${prefs.darkFrom}"></md-outlined-text-field><md-outlined-text-field id="dto" type="time" label="${esc(tx('darkTo'))}" value="${prefs.darkTo}"></md-outlined-text-field></div>${sw('ds', 'dimSum', 'dimSumNote', prefs.dimSum)}
      <div class="set-row seed-row" data-find="${esc(tx('seed'))}"><span><b>${esc(tx('seed'))}</b></span><span class="seed-now"><span class="seed-swatch ${prefs.seed === RAINBOW ? 'rainbow' : ''}" style="background:${prefs.seed === RAINBOW ? 'none' : esc(prefs.seed)}"></span><code>${esc(prefs.seed === RAINBOW ? tx('rainbow') : prefs.seed)}</code><md-text-button id="seed-reset">${esc(tx('reset'))}</md-text-button></span></div>
      <div class="row-actions" data-find="${esc(tx('resetLayouts'))} dockview panels"><md-outlined-button id="reset-layouts">${esc(tx('resetLayouts'))}</md-outlined-button></div>
      <div id="seed-picker" data-find="${esc(tx('seed'))} colour color"></div>`,
    comfort: `<div class="row-actions" data-find="${esc(tx('tourTake'))} ${esc(tx('tourThisPage'))}"><md-filled-tonal-button id="set-tour">${esc(tx('tourTake'))}</md-filled-tonal-button></div>${sw('rm', 'reduceMotion', 'reduceMotionNote', prefs.reduceMotion)}${sw('lt', 'largeText', 'largeTextNote', prefs.largeText)}${sw('elock', 'editLock', 'editLockNote', prefs.editLock)}${sw('tko', 'takeovers', 'takeoversNote', prefs.takeovers)}${sw('llock', 'layoutLocked', 'layoutLockedNote', prefs.layoutLocked)}${sw('tlock', 'tabsLocked', 'tabsLockedNote', prefs.tabsLocked)}${sw('slock', 'settingsLocked', 'settingsLockedNote', prefs.settingsLocked)}`,
    backup: `<p data-find="${esc(tx('exportSettings'))} ${esc(tx('importSettings'))}">${esc(tx('settingsSaved'))}</p>
      <div class="row-actions"><md-filled-tonal-button id="exp">${esc(tx('exportSettings'))}</md-filled-tonal-button><md-outlined-button id="imp">${esc(tx('importSettings'))}</md-outlined-button><input id="imp-file" type="file" accept="application/json,.json" hidden></div>
      <h3 data-find="${esc(tx('settingsHistory'))}">${esc(tx('settingsHistory'))}</h3><ol class="set-history" id="sh"></ol>`,
    sounds: `${sw('snd', 'soundEffects', 'soundEffectsNote', prefs.sounds)}
      <label class="set-slider" data-find="${esc(tx('soundVolume'))}"><span><b>${esc(tx('soundVolume'))}</b><em id="vol-n">${prefs.soundVolume}%</em></span><md-slider id="vol" min="0" max="100" step="10" labeled value="${prefs.soundVolume}" aria-label="${esc(tx('soundVolume'))}"></md-slider></label>
      <div class="row-actions" data-find="${esc(tx('soundTry'))}"><md-outlined-button id="snd-try">${esc(tx('soundTry'))}</md-outlined-button></div>
      ${sw('quiet', 'quietHours', 'quietHoursNote', prefs.quietHours)}
      <div class="set-times" data-find="${esc(tx('quietHours'))} ${esc(tx('quietFrom'))} ${esc(tx('quietTo'))}"><md-outlined-text-field id="qfrom" type="time" label="${esc(tx('quietFrom'))}" value="${prefs.quietFrom}"></md-outlined-text-field><md-outlined-text-field id="qto" type="time" label="${esc(tx('quietTo'))}" value="${prefs.quietTo}"></md-outlined-text-field></div>
      ${sw('nar', 'narrate', 'narrateNote', prefs.narrate)}
      <label class="set-slider" data-find="${esc(tx('narrateRate'))}"><span><b>${esc(tx('narrateRate'))}</b><em id="nar-n">${(prefs.narrateRate / 10).toFixed(1)}×</em></span><md-slider id="nar-rate" min="5" max="20" step="1" labeled value="${prefs.narrateRate}" aria-label="${esc(tx('narrateRate'))}"></md-slider></label>
      <div class="row-actions" data-find="${esc(tx('narrateTry'))}"><md-outlined-button id="nar-try">${esc(tx('narrateTry'))}</md-outlined-button></div>`,
    extensions: `<p data-find="${esc(tx('extIntro'))}">${esc(tx('extIntro'))}</p><div id="ext-q"></div><div class="ext-list" id="ext-list" aria-live="polite"><md-linear-progress indeterminate></md-linear-progress></div>`,
    later: `<p data-find="${esc(tx('laterList'))}">${esc(tx('laterList'))}</p>`,
  };
  view.innerHTML = `<div class="settings">
    <nav class="set-nav" aria-label="${esc(tx('settings'))}"><h1>${esc(tx('settings'))}</h1>
      <div id="ss-host"></div>
      <div role="tablist" aria-orientation="vertical">${SECTIONS.map(([id, k]) => `<button role="tab" class="set-tab${id === sec ? ' on' : ''}" aria-selected="${id === sec}" data-sec="${id}">${esc(tx(k))}</button>`).join('')}</div></nav>
    <main class="set-main" id="set-main">${SECTIONS.map(([id, k]) => `<section class="set-sec" data-sec-body="${id}" ${id === sec ? '' : 'hidden'}><h2>${esc(tx(k))}</h2>${body[id]}</section>`).join('')}
      <p class="muted" id="ss-none" hidden></p></main></div>`;
  // A locked Settings screen can be read but not changed, until it is unlocked here (which asks first).
  if (prefs.settingsLocked) {
    const main = view.querySelector<HTMLElement>('#set-main')!;
    main.querySelectorAll('.set-sec').forEach((sec) => { sec.setAttribute('inert', ''); sec.classList.add('screen-locked'); });
    const bar = document.createElement('div');
    bar.className = 'banner lock-banner'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<div><b>${esc(tx('settingsLocked'))}</b><p>${esc(tx('settingsLockedBanner'))}</p></div><md-filled-button id="unlock-settings">${esc(tx('unlockScreen'))}</md-filled-button>`;
    main.prepend(bar);
    bar.querySelector('#unlock-settings')!.addEventListener('click', async () => { if (!await askConfirm(tx('unlockAsk'), tx('unlockOk'))) return; prefs.settingsLocked = false; savePrefs(); render(); notify(tx('settingUnlockedMsg')); });
  }
  view.querySelectorAll<HTMLElement>('[data-sec]').forEach((b) => b.addEventListener('click', () => { prefs.settingsSection = b.dataset.sec!; savePrefs(); render(); }));
  view.querySelector('[role=tablist]')!.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent; if (ke.key !== 'ArrowDown' && ke.key !== 'ArrowUp') return;
    const tabs = Array.from(view.querySelectorAll<HTMLElement>('[data-sec]')); const i = tabs.indexOf(document.activeElement as HTMLElement);
    tabs[(i + (ke.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length]?.focus(); ke.preventDefault();
  });
  // Search shows every matching row across all sections at once.
  const ss = searchBox('settings-search', tx('searchSettings'), rx);
  view.querySelector('#ss-host')!.replaceWith(ss.el);
  const findRows = Array.from(view.querySelectorAll<HTMLElement>('[data-sec-body] [data-find]'));
  let ssRun = 0;
  ss.onChange(async () => {
    const my = ++ssRun;
    const q = ss.query().trim();
    const hits = await ss.filter(findRows.map((r) => r.dataset.find!)) ?? findRows.map(() => false);
    if (my !== ssRun) return;
    let count = 0;
    view.querySelectorAll<HTMLElement>('[data-sec-body]').forEach((secEl) => {
      if (!q) { secEl.hidden = secEl.dataset.secBody !== sec; secEl.querySelectorAll<HTMLElement>('[data-find]').forEach((r) => r.hidden = false); return; }
      let any = false;
      secEl.querySelectorAll<HTMLElement>('[data-find]').forEach((r) => { const m = hits[findRows.indexOf(r)]; r.hidden = !m; any ||= m; if (m) count++; });
      secEl.hidden = !any;
    });
    const none = view.querySelector<HTMLElement>('#ss-none')!; none.hidden = !q || count > 0; none.textContent = tx('noSettingMatch', { q });
  });
  if (sec === 'extensions' || ss.query()) void extensionsPanel(view);
  view.querySelectorAll<HTMLElement>('[data-set-lang]').forEach((b) => b.addEventListener('click', () => { prefs.lang = b.dataset.setLang as Prefs['lang']; savePrefs(); applyTheme(); render(); }));
  const num = (id: string) => Number((view.querySelector(id) as HTMLInputElement).value);
  const sel = (e: Event) => (e.target as HTMLElement & { selected: boolean }).selected;
  view.querySelector('#fen')!.addEventListener('change', () => { prefs.funnyEn = num('#fen'); savePrefs(); render(); });
  view.querySelector('#fyue')!.addEventListener('change', () => { prefs.funnyYue = num('#fyue'); savePrefs(); render(); });
  view.querySelector('#dark')!.addEventListener('change', (e) => { prefs.dark = sel(e); savePrefs(); applyTheme(); });
  view.querySelector('#rm')!.addEventListener('change', (e) => { prefs.reduceMotion = sel(e); savePrefs(); applyTheme(); });
  view.querySelector('#lt')!.addEventListener('change', (e) => { prefs.largeText = sel(e); savePrefs(); applyTheme(); });
  view.querySelector('#ds')!.addEventListener('change', (e) => { prefs.dimSum = sel(e); savePrefs(); });
  view.querySelector('#snd')!.addEventListener('change', (e) => { prefs.sounds = sel(e); savePrefs(); applyTheme(); });
  view.querySelector('#vol')!.addEventListener('change', () => { prefs.soundVolume = num('#vol'); view.querySelector('#vol-n')!.textContent = `${prefs.soundVolume}%`; savePrefs(); applyTheme(); play('success'); });
  view.querySelector('#snd-try')!.addEventListener('click', () => { play('create'); });
  view.querySelector('#set-tour')!.addEventListener('click', () => takeTour('app'));
  view.querySelector('#nar')!.addEventListener('change', (e) => { prefs.narrate = sel(e); savePrefs(); if (prefs.narrate) narrate(tx('narrateOn')); });
  view.querySelector('#nar-rate')!.addEventListener('change', () => { prefs.narrateRate = num('#nar-rate'); view.querySelector('#nar-n')!.textContent = `${(prefs.narrateRate / 10).toFixed(1)}×`; savePrefs(); });
  view.querySelector('#nar-try')!.addEventListener('click', () => narrate(tx('narrateSample'), true));
  view.querySelector('#quiet')!.addEventListener('change', (e) => { prefs.quietHours = sel(e); savePrefs(); applyTheme(); });
  for (const [id, k] of [['#qfrom', 'quietFrom'], ['#qto', 'quietTo']] as const) view.querySelector(id)!.addEventListener('change', () => { const v = (view.querySelector(id) as HTMLInputElement).value; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { prefs[k] = v; savePrefs(); applyTheme(); } });
  view.querySelectorAll<HTMLElement>('[data-lock]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.lock!;
    const isLocked = prefs.lockedSettings.includes(id);
    if (isLocked && !await askConfirm(tx('unlockAsk'), tx('unlockOk'))) return;
    prefs.lockedSettings = isLocked ? prefs.lockedSettings.filter((x) => x !== id) : [...prefs.lockedSettings, id];
    savePrefs(); render(); notify(tx(isLocked ? 'settingUnlockedMsg' : 'settingLockedMsg'));
  }));
  view.querySelector('#dsched')!.addEventListener('change', (e) => { prefs.darkSchedule = sel(e); savePrefs(); applyTheme(); });
  for (const [id, k] of [['#dfrom', 'darkFrom'], ['#dto', 'darkTo']] as const) view.querySelector(id)!.addEventListener('change', () => { const v = (view.querySelector(id) as HTMLInputElement).value; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { prefs[k] = v; savePrefs(); applyTheme(); } });
  view.querySelector('#reset-layouts')!.addEventListener('click', () => { resetLayout(); notify(tx('resetLayoutsDone')); });
  view.querySelector('#llock')!.addEventListener('change', (e) => { prefs.layoutLocked = sel(e); savePrefs(); notify(tx(prefs.layoutLocked ? 'layoutLockedOn' : 'layoutLockedOff')); });
  view.querySelector('#tlock')!.addEventListener('change', (e) => { prefs.tabsLocked = sel(e); savePrefs(); render(); });
  view.querySelector('#slock')!.addEventListener('change', (e) => { prefs.settingsLocked = sel(e); savePrefs(); render(); });
  view.querySelector('#tko')!.addEventListener('change', (e) => { prefs.takeovers = sel(e); savePrefs(); });
  view.querySelector('#elock')!.addEventListener('change', (e) => { prefs.editLock = sel(e); savePrefs(); applyTheme(); notify(tx(prefs.editLock ? 'editLockOn' : 'editLockOff')); });
  const showSeed = () => { const s = view.querySelector<HTMLElement>('.seed-swatch')!; s.classList.toggle('rainbow', prefs.seed === RAINBOW); s.style.background = prefs.seed === RAINBOW ? '' : prefs.seed; view.querySelector('.seed-now code')!.textContent = prefs.seed === RAINBOW ? tx('rainbow') : prefs.seed; };
  colorPicker(view.querySelector<HTMLElement>('#seed-picker')!, {
    value: prefs.seed, label: tx('seed'), allowRainbow: true, rainbowSpeed: prefs.rainbowSpeed,
    surface: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim() || '#10140f',
    onChange: (v) => { prefs.seed = v.length === 9 ? v.slice(0, 7) : v; savePrefs(); applySeed(); showSeed(); },
    onSpeed: (lv) => { prefs.rainbowSpeed = lv; savePrefs(); applyRainbowSpeed(lv); },
  });
  view.querySelector('#seed-reset')!.addEventListener('click', () => { prefs.seed = DEFAULT_SEED; savePrefs(); render(); });
  view.querySelector('#exp')!.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'map-editor', kind: 'settings', version: 1, exportedAt: new Date().toISOString(), settings: pick(prefs) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'map-editor-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const file = view.querySelector<HTMLInputElement>('#imp-file')!;
  view.querySelector('#imp')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    let n = 0; try { n = importSettings(JSON.parse(await f.text())); } catch { n = 0; }
    if (!n) { notify(tx('importBad'), true); return; }
    savePrefs(); applyTheme(); render(); notify(tx('imported', { n })); play('success');
  });
  const sh = view.querySelector<HTMLElement>('#sh')!;
  const hist = loadSettingsHistory();
  const fmt = (k: Tracked, v: unknown) => k === 'seed' && v === RAINBOW ? tx('rainbow') : typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v);
  const name: Record<Tracked, string> = { layoutLocked: tx('layoutLocked'), tabsLocked: tx('tabsLocked'), settingsLocked: tx('settingsLocked'), lockedSettings: tx('lockedSettings'), quietHours: tx('quietHours'), quietFrom: tx('quietFrom'), quietTo: tx('quietTo'), takeovers: tx('takeovers'), narrate: tx('narrate'), narrateRate: tx('narrateRate'), darkSchedule: tx('darkSchedule'), darkFrom: tx('darkFrom'), darkTo: tx('darkTo'), editLock: tx('editLock'), dimSum: tx('dimSum'), sounds: tx('soundEffects'), soundVolume: tx('soundVolume'), lang: tx('secLanguage'), funnyEn: tx('funnyEn'), funnyYue: tx('funnyYue'), dark: tx('dark'), reduceMotion: tx('reduceMotion'), largeText: tx('largeText'), seed: tx('seed'), rainbowSpeed: tx('rainbow') };
  sh.innerHTML = hist.length ? hist.slice(0, 50).map((h, i) => `<li data-find="${esc(h.keys.map((k) => name[k]).join(' '))}"><span><b>${h.keys.map((k) => `${esc(name[k])}: ${esc(fmt(k, h.before[k]))} → ${esc(fmt(k, h.after[k]))}`).join(' · ')}</b><small>${esc(new Date(h.at).toLocaleString())}</small></span><md-text-button data-restore="${i}">${esc(tx('restore'))}</md-text-button></li>`).join('') : `<li class="muted">${esc(tx('noSettingsHistory'))}</li>`;
  sh.querySelectorAll<HTMLElement>('[data-restore]').forEach((b) => b.addEventListener('click', () => {
    const h = hist[Number(b.dataset.restore)]; if (!h) return;
    Object.assign(prefs, h.before); savePrefs(); applyTheme(); render(); notify(tx('settingsRestored')); play('undo');
  }));
}

async function aboutView(view: HTMLElement): Promise<void> {
  view.innerHTML = `<div class="about">
    <section class="about-card"><div class="about-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h1>${esc(tx('appName'))}</h1>
      <div class="about-stats"><div><small>${esc(tx('versionLabel'))}</small><b>${esc(health?.version ?? 'unavailable')}</b></div><div><small>${esc(tx('buildLabel'))}</small><code>${esc((health?.commit ?? 'unavailable').slice(0, 7))}</code></div></div>
      <p>${esc(provenance())}</p>
      <p class="fine">${esc(tx('aboutLegal'))}</p>
      <div class="row-actions"><md-filled-button id="copy-ver">${esc(tx('copyDetails'))}</md-filled-button></div>
      <div class="about-update"><b>${esc(tx('updTitle'))}</b><p id="upd-text" aria-live="polite">${esc(updateText(upd))}</p>${desktopBridge?.updates ? `<md-outlined-button id="upd-check">${esc(tx('updCheck'))}</md-outlined-button>` : ''}</div></section>
    <section class="changelog"><div class="cl-head"><h2>${esc(tx('changelog'))}</h2>
      <div id="cl-q-host"></div></div>
      <ol id="cl" aria-live="polite"><li class="muted">${esc(tx('loading'))}</li></ol></section></div>`;
  view.querySelector('#upd-check')?.addEventListener('click', () => checkForUpdates());
  view.querySelector('#copy-ver')!.addEventListener('click', () => navigator.clipboard?.writeText(`Map Editor ${health?.version} ${health?.commit} ${health?.builtAt ?? ''}`).then(() => notify(tx('copied')), () => notify(tx('copyFailed'), true)));
  const listEl = view.querySelector<HTMLElement>('#cl')!;
  type Entry = { sha: string; date: string; subject: string };
  let entries: Entry[] | null = null;
  try { entries = (await api<{ entries: Entry[] | null }>('/api/changelog')).entries; } catch (e) { notify((e as Error).message, true); }
  const kind = (s: string) => /^(add|new|build|introduc)/i.test(s) ? 'added' : /^(fix|repair|correct)/i.test(s) ? 'fixed' : 'changed';
  const clq = searchBox('changelog-search', tx('searchChanges'), rx);
  view.querySelector('#cl-q-host')!.replaceWith(clq.el);
  let clRun = 0;
  const draw = async () => {
    if (!entries) { listEl.innerHTML = `<li class="muted">${esc(tx('changelogUnavailable'))}</li>`; return; }
    const my = ++clRun;
    const q = clq.query().trim();
    const all: Entry[] = entries;
    const hits = await clq.filter(all.map((e) => `${e.subject} ${e.sha}`)) ?? all.map(() => false);
    if (my !== clRun) return; // a hidden panel (phone width) is still filled, ready when shown
    const shown = all.filter((_, i) => hits[i]);
    listEl.innerHTML = shown.length ? shown.map((e, i) => `<li class="cl-entry${i === 0 && !q ? ' newest' : ''}" style="--i:${Math.min(i, 12)}"><span class="cl-kind ${kind(e.subject)}">${esc(tx(kind(e.subject) as Key))}</span>
      <span class="cl-text"><b>${esc(e.subject)}</b><small>${esc(new Date(e.date).toLocaleString('en-GB'))} · <code>${esc(e.sha.slice(0, 7))}</code></small></span></li>`).join('') : `<li class="muted">${esc(tx('noMatches'))}</li>`;
  };
  clq.onChange(draw);
  draw();
  // Dock last: dockview detaches the content of a panel that is not showing (phone width), so
  // everything above is wired up while both sections are still on the page.
  {
    const wrap = view.querySelector<HTMLElement>('.about')!;
    const card = wrap.querySelector<HTMLElement>('.about-card')!, log = wrap.querySelector<HTMLElement>('.changelog')!;
    card.classList.add('panel-scroll'); log.classList.add('panel-scroll');
    const dock = Object.assign(document.createElement('div'), { id: 'dock', className: 'dock' });
    view.append(dock);
    mountWorkspace(dock, { about: card, changes: log }, { about: tx('about'), changes: tx('changelog') }, document.documentElement.dataset.theme === 'dark',
      { key: 'about', arrange: [['about'], ['changes', { ref: 'about', dir: 'right' }, 820]], active: 'about' }, prefs.layoutLocked);
    wrap.remove();
  }
}

function notesPanel(el: HTMLElement) {
  notesPanelImpl(el, { api, notify, dark: prefs.dark, label: tx('notes'), saved: tx('notesSaved') });
}

// ---------- keyboard ----------
const typing = (e: KeyboardEvent) => e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)));
// Crossing the phone width rebuilds the editor workspace as one tabbed group (or back to side by side).
matchMedia(PHONE).addEventListener('change', () => { if (user && prefs.tab === 'editor') render(); });

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); showPalette(); return; }
  if (typing(e) || document.querySelector('.palette-scrim, .onboarding')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && world) { e.preventDefault(); undoLast(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && prefs.tab === 'editor' && selectTool) {
    const map: Record<string, string> = { f: 'fill', r: 'replace', d: 'delete', c: 'clone', w: 'waterlog' };
    const op = map[e.key.toLowerCase()];
    if (op) { e.preventDefault(); selectTool(op); return; }
    const mode = MAP_MODES.find((m) => MAP_MODE_KEYS[m].toLowerCase() === e.key.toLowerCase());
    if (mode && setMapMode) { e.preventDefault(); setMapMode(mode); }
  }
});

// ---------- start ----------
(async () => {
  applyTheme();
  if (desktopBridge?.updates) {
    desktopBridge.updates.onState((u) => { if (u.state === 'ready' && (upd?.state !== 'ready' || upd.version !== u.version)) updLater = false; if (u.state === 'downloading' && upd?.state !== 'downloading') updSoonHidden = false; upd = u; updateBanner(); const t = document.getElementById('upd-text'); if (t) t.textContent = updateText(u); });
    desktopBridge.updates.state().then((u) => { upd = u; updateBanner(); }).catch(() => undefined);
  }
  enableClearControls((field) => tx('clearField', { field }));
  try { health = await api<Health>('/api/health'); } catch { /* shown as unavailable */ }
  try { const s = await api<{ hasOwner: boolean; user: { name: string } | null }>('/api/auth/state'); hasOwner = s.hasOwner; user = s.user; } catch (e) { notify((e as Error).message, true); }
  render();
  setTimeout(() => { void dimSumSurprise(); }, 2500);
  if (user) loadExtensions().catch(() => undefined);
})();
