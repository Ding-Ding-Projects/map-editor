// Worlds screen: list, upload a .zip, new flat world, download, browse (desktop), and every stage.
// Matches the "Worlds" design board.
import type { Key } from './i18n.js';
import { showTakeover } from './takeover.js';
import { invert, pickItem, selectAll } from './select.js';

/** A file size people can read: small files in kB, the rest in MB. */
const sizeText = (n: number) => n < 1e5 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`;

import { searchBox, type RegexText } from './regex.js';
export interface WorldSummary { name: string; path: string; versionName?: string; dimensions: string[]; edition?: string }
export interface WorldsContext {
  api: <T = any>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  notify: (text: string, error?: boolean, action?: { label: string; run: () => void }) => void;
  play?: (cue: 'create' | 'success') => void;
  /** Full-screen result cards for uploads (Settings › Comfort and focus can turn them off). */
  takeovers?: () => boolean;
  tx: (k: Key, v?: Record<string, string | number>) => string;
  esc: (s: unknown) => string;
  open: (w: WorldSummary) => Promise<void>;
  /** The two-key confirmation, for moving worlds to the bin. */
  confirm?: (text: string, ok: string) => Promise<boolean>;
  /** Present only in the desktop app. */
  browse?: () => Promise<string | undefined>;
  /** Wording for the search box and its regular-expression builder. */
  rx?: RegexText;
}

const PAL = ['#3e6b30', '#4a7a38', '#567f3f', '#6f8a4a', '#2c5a86', '#356a9a', '#6a6f72', '#d8cfa3', '#7c6a4a'];
function mosaic(seed: string) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let out = '';
  for (let i = 0; i < 64; i++) {
    const x = i % 16, z = Math.floor(i / 16);
    const d = Math.abs(x - (5 + (h % 6) + Math.round(2 * Math.sin(z + h))));
    const n = (x * 7 + z * 13 + h) % 11;
    out += `<i style="background:${d < 1 ? PAL[4] : d === 1 ? PAL[7] : PAL[n % 4]}"></i>`;
  }
  return out;
}
const SHAPES = ['card-shape-a', 'card-shape-b', 'card-shape-c', 'card-shape-b'];

export async function worldsView(view: HTMLElement, c: WorldsContext): Promise<void> {
  const { tx, esc } = c;
  view.innerHTML = `<section class="worlds">
    <header class="worlds-head"><div>
      <h1 class="display">${esc(tx('worlds'))}</h1><p class="muted" id="roots"></p></div>
      <div class="worlds-actions">
        <label class="btn-primary shape-tl" tabindex="0" role="button" id="upload-label">${esc(tx('uploadZip'))}<input type="file" id="upload" accept=".zip,.mcworld,application/zip" hidden></label>
        <md-filled-tonal-button id="new">${esc(tx('newFlat'))}</md-filled-tonal-button>
        ${c.browse ? `<md-outlined-button id="browse">${esc(tx('browse'))}</md-outlined-button>` : ''}
        <md-outlined-button id="sel-mode" aria-pressed="false" hidden>${esc(tx('selectMode'))}</md-outlined-button>
        <md-text-button id="bin-open" hidden></md-text-button>
      </div></header>
    <div id="sel-bar" class="sel-bar" role="toolbar" aria-label="${esc(tx('selectMode'))}" hidden><b id="sel-count" role="status"></b><span class="muted sel-hint">${esc(tx('selectHint'))}</span><span class="sel-acts">
      <md-text-button id="sel-all">${esc(tx('selectAll'))}</md-text-button><md-text-button id="sel-inv">${esc(tx('selectInvert'))}</md-text-button><md-filled-tonal-button id="sel-dl">${esc(tx('downloadSelected'))}</md-filled-tonal-button><md-outlined-button id="sel-bin">${esc(tx('binMove'))}</md-outlined-button></span></div>
    <div class="world-find"><div id="world-q"></div><span class="muted" id="world-count" role="status" hidden></span></div>
    <p class="muted" id="bin-report" role="status" hidden></p>
    <div id="upload-status"></div>
    <div id="list" class="world-grid" role="status" aria-label="${esc(tx('loading'))}">${'<div class="world-card skeleton"><span class="sk-tile"></span><span class="sk-line"></span><span class="sk-line short"></span></div>'.repeat(4)}</div>
  </section>`;

  const status = view.querySelector<HTMLElement>('#upload-status')!;
  const list = view.querySelector<HTMLElement>('#list')!;
  const fileInput = view.querySelector<HTMLInputElement>('#upload')!;
  const label = view.querySelector<HTMLElement>('#upload-label')!;
  label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

  const selBtn = view.querySelector<HTMLElement>('#sel-mode')!, selBar = view.querySelector<HTMLElement>('#sel-bar')!;
  const sel = new Set<number>(); let selecting = false, anchor: number | undefined, shown: WorldSummary[] = [];
  let all: WorldSummary[] = [];
  const countEl = view.querySelector<HTMLElement>('#world-count')!;
  const box = c.rx ? searchBox('world-search', tx('worldsSearch'), c.rx, { compact: true }) : undefined;
  if (box) { view.querySelector('#world-q')!.replaceWith(box.el); box.el.hidden = true; box.onChange(() => { void draw(); }); }
  const download = (w: WorldSummary) => {
    const a = document.createElement('a');
    a.href = '/api/worlds/download?path=' + encodeURIComponent(w.path);
    a.download = `${w.name}${w.edition === 'bedrock' ? '.mcworld' : '.zip'}`;
    document.body.append(a); a.click(); a.remove();
  };
  function paintSel() {
    list.classList.toggle('selecting', selecting); selBar.hidden = !selecting;
    selBtn.setAttribute('aria-pressed', String(selecting)); selBtn.textContent = tx(selecting ? 'selectDone' : 'selectMode');
    list.querySelectorAll<HTMLElement>('.world-card').forEach((card, i) => {
      card.classList.toggle('selected', selecting && sel.has(i));
      const box = card.querySelector<HTMLInputElement>('.sel-box'); if (box) { box.hidden = !selecting; box.checked = sel.has(i); }
    });
    view.querySelector('#sel-count')!.textContent = tx('selectedN', { n: sel.size, total: shown.length });
    view.querySelector('#sel-dl')!.toggleAttribute('disabled', !sel.size); view.querySelector('#sel-bin')!.toggleAttribute('disabled', !sel.size);
  }
  const setSelecting = (on: boolean) => { selecting = on; if (!on) { sel.clear(); anchor = undefined; } paintSel(); };
  selBtn.addEventListener('click', () => setSelecting(!selecting));
  view.querySelector('#sel-all')!.addEventListener('click', () => { selectAll(sel, shown.length); paintSel(); });
  view.querySelector('#sel-inv')!.addEventListener('click', () => { invert(sel, shown.length); paintSel(); });
  view.querySelector('#sel-dl')!.addEventListener('click', () => {
    const picked = [...sel].sort((a, b) => a - b).map((i) => shown[i]).filter(Boolean); if (!picked.length) return;
    c.notify(tx('downloadingN', { n: picked.length }));
    picked.forEach((w, k) => setTimeout(() => download(w), k * 700)); // spaced so the browser keeps every file
  });
  // The bin: ticked worlds are moved aside (never deleted) after the two-key confirmation, and can be put back.
  const binBtn = view.querySelector<HTMLElement>('#bin-open')!, binReport = view.querySelector<HTMLElement>('#bin-report')!;
  type BinItem = { id: string; name: string; root: string; binnedAt: string };
  async function refreshBin() {
    try { const { items } = await c.api<{ items: BinItem[] }>('/api/worlds/bin'); binBtn.hidden = !items.length; binBtn.textContent = tx('binOpen', { n: items.length }); return items; } catch { binBtn.hidden = true; return []; }
  }
  view.querySelector('#sel-bin')!.addEventListener('click', async () => {
    const picked = [...sel].sort((a, b) => a - b).map((i) => shown[i]).filter(Boolean); if (!picked.length) return;
    const ask = tx('binAsk', { n: picked.length, list: picked.map((w) => w.name).slice(0, 8).join(', ') + (picked.length > 8 ? '…' : '') });
    if (!(c.confirm ? await c.confirm(ask, tx('binMove')) : false)) return;
    try {
      const r = await c.api<{ moved: string[]; skipped: Array<{ name: string; reason: string }> }>('/api/worlds/bin', { method: 'POST', body: { paths: picked.map((w) => w.path) } });
      const text = tx('binDone', { n: r.moved.length, total: picked.length }) + (r.skipped.length ? ` ${tx('binSkipped', { list: r.skipped.map((x) => `${x.name}: ${x.reason}`).join('; ') })}` : '');
      binReport.hidden = false; binReport.textContent = text; c.notify(text, r.skipped.length > 0);
      setSelecting(false); await load();
    } catch (e) { c.notify((e as Error).message, true); }
  });
  binBtn.addEventListener('click', async () => {
    const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void };
    dlg.className = 'bin-dialog';
    const draw = async () => {
      const items = await refreshBin();
      dlg.innerHTML = `<div slot="headline">${esc(tx('binTitle'))}</div><form slot="content" id="bin-form" method="dialog"><p class="muted">${esc(tx('binNote'))}</p>
        <ol class="bin-list">${items.length ? items.map((it, i) => `<li><span class="desk-text"><b>${esc(it.name)}</b><small>${esc(it.binnedAt ? new Date(it.binnedAt).toLocaleString('en-GB') : '')} · <code>${esc(it.root)}</code></small></span><md-filled-tonal-button type="button" data-restore="${i}">${esc(tx('binRestore'))}</md-filled-tonal-button></li>`).join('') : `<li class="muted">${esc(tx('binEmpty'))}</li>`}</ol></form>
        <div slot="actions"><md-text-button form="bin-form" value="close">${esc(tx('close'))}</md-text-button></div>`;
      dlg.querySelectorAll<HTMLElement>('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
        const it = items[Number(b.dataset.restore)];
        try { const r = await c.api<{ name: string }>('/api/worlds/restore', { method: 'POST', body: { root: it.root, id: it.id } }); c.notify(tx('binRestored', { name: r.name })); await draw(); await load(); }
        catch (e) { c.notify((e as Error).message, true); }
      }));
    };
    document.body.append(dlg); await draw(); dlg.addEventListener('closed', () => dlg.remove()); dlg.show();
  });

  list.addEventListener('click', (e) => {
    if (!selecting) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.world-card'); if (!card || (e.target as HTMLElement).closest('.row-actions')) return;
    const i = Array.from(list.querySelectorAll('.world-card')).indexOf(card); if (i < 0) return;
    if ((e.target as HTMLElement).matches('.sel-box')) e.stopPropagation();
    anchor = pickItem(sel, i, anchor, (e as MouseEvent).shiftKey); paintSel();
  });
  view.addEventListener('keydown', (e) => {
    if (!selecting || (e.target as HTMLElement).matches('input:not(.sel-box), textarea, md-outlined-text-field')) return;
    if (e.key === 'Escape') { e.preventDefault(); setSelecting(false); selBtn.focus(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); sel.clear(); selectAll(sel, shown.length); paintSel(); }
  });

  async function load() {
    try {
      const { worlds: fetched, roots } = await c.api<{ worlds: WorldSummary[]; roots: string[] }>('/api/worlds');
      if (!list.isConnected) return; // the screen was replaced while this loaded
      view.querySelector('#roots')!.textContent = tx('worldsFrom', { roots: roots.join(', ') });
      list.removeAttribute('role'); list.removeAttribute('aria-label');
      all = fetched; void refreshBin();
      await draw();
    } catch (e) {
      if (!list.isConnected) return;
      list.className = '';
      list.innerHTML = `<div class="banner error" role="alert"><div><b>${esc(tx('loadFailed'))}</b><p>${esc((e as Error).message)}</p></div><md-filled-button id="retry">${esc(tx('retry'))}</md-filled-button></div>`;
      list.querySelector('#retry')!.addEventListener('click', () => worldsView(view, c));
    }
  }
  // The list as the search leaves it. Selection and the bin act on what is shown, never on a hidden world.
  let drawRun = 0;
  async function draw() {
    const my = ++drawRun;
    const folder = (w: WorldSummary) => w.path.split(/[\\/]/).filter(Boolean).pop() ?? '';
    const hits = box ? await box.filter(all.map((w) => `${w.name} ${folder(w)} ${w.edition === 'bedrock' ? 'Bedrock' : `Java ${w.versionName ?? ''}`}`)) ?? all.map(() => false) : all.map(() => true);
    if (my !== drawRun || !list.isConnected) return;
    const worlds = all.filter((_, i) => hits[i]);
    if (box) { box.el.hidden = all.length < 2; countEl.hidden = all.length < 2 || worlds.length === all.length; countEl.textContent = tx('worldsShowing', { n: worlds.length, total: all.length }); }
    {
      shown = worlds; sel.clear(); anchor = undefined; selBtn.hidden = worlds.length < 1;
      if (all.length && !worlds.length) {
        selecting = false; selBar.hidden = true; list.className = '';
        list.innerHTML = `<div class="empty-world"><div><h2>${esc(tx('worldsNoMatch'))}</h2><p class="muted">${esc(tx('worldsNoMatchBody'))}</p></div></div>`;
        return;
      }
      if (!worlds.length) {
        selecting = false; selBar.hidden = true;
        list.className = '';
        list.innerHTML = `<div class="empty-world"><div class="empty-art" aria-hidden="true">${'<i></i>'.repeat(16)}</div>
          <div><h2>${esc(tx('noWorldsTitle'))}</h2><p class="muted">${esc(tx('noWorldsBody'))}</p></div></div>`;
        return;
      }
      list.className = 'world-grid';
      // Worlds that share a name are told apart by their folder, and each gets its own picture.
      const folderOf = (w: { path: string }) => w.path.split(/[\\/]/).filter(Boolean).pop() ?? '';
      const shared = new Set(all.map((w) => w.name).filter((n, i, names) => names.indexOf(n) !== i)); // over every world, so a searched-for card keeps its folder line
      list.innerHTML = worlds.map((w, i) => `<article class="world-card ${SHAPES[i % SHAPES.length]}" style="--i:${i}">
        <input type="checkbox" class="sel-box" hidden aria-label="${esc(tx('selectWorld', { name: w.name }))}">
        <div class="mini-map" aria-hidden="true">${mosaic(shared.has(w.name) ? folderOf(w) : w.name)}</div>
        <h2>${esc(w.name)}</h2>${shared.has(w.name) && folderOf(w) !== w.name ? `<p class="muted world-folder">${esc(tx('worldFolderLine', { folder: folderOf(w) }))}</p>` : ''}${w.edition === 'bedrock' ? `<p class="muted"><b>Bedrock</b> · ${esc(tx('bedrockNote'))}</p>` : `<p class="muted">Java ${esc(w.versionName ?? '')} · ${esc(w.dimensions.map((d) => tx(d as Key)).join(', '))}</p>`}
        <div class="row-actions"><md-filled-button data-open="${i}">${esc(tx('open'))}</md-filled-button>
        <button type="button" class="icon-btn" data-dl="${i}" aria-label="${esc(tx('download'))}: ${esc(w.name)}" title="${esc(tx('download'))}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg></button></div></article>`).join('');
      list.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.addEventListener('click', () => c.open(worlds[Number(b.dataset.open)]).catch((e) => c.notify((e as Error).message, true))));
      list.querySelectorAll<HTMLElement>('[data-dl]').forEach((b) => b.addEventListener('click', () => download(worlds[Number(b.dataset.dl)])));
      paintSel();
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    status.innerHTML = `<div class="upload-box" role="status"><b>${esc(tx('uploading', { name: file.name }))}</b>
      <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="muted" id="up-text">0 of ${(file.size / 1e6).toFixed(1)} MB</span></div>`;
    const fill = status.querySelector<HTMLElement>('.bar-fill')!;
    const text = status.querySelector<HTMLElement>('#up-text')!;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/worlds/upload');
    xhr.setRequestHeader('content-type', 'application/zip');
    xhr.setRequestHeader('x-map-editor', '1');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      fill.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
      text.textContent = e.loaded < e.total ? `${(e.loaded / 1e6).toFixed(1)} of ${(e.total / 1e6).toFixed(1)} MB` : tx('unpacking');
    };
    const t0 = Date.now();
    xhr.onload = () => {
      let j: { name?: string; path?: string; error?: string } = {};
      try { j = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      status.innerHTML = '';
      if (xhr.status === 201) {
        c.notify(tx('uploaded', { name: j.name ?? file.name })); c.play?.('create'); load();
        if (c.takeovers?.()) showTakeover({ kind: 'ok', chip: tx('tkUploaded'), title: tx('tkReady'), lead: tx('tkUploadLead', { name: j.name ?? file.name }),
          stats: [{ label: tx('tkFile'), value: file.name, code: true }, { label: tx('tkSize'), value: sizeText(file.size) }, { label: tx('tkTook'), value: `${Math.max(1, Math.round((Date.now() - t0) / 1000))} s` }],
          actions: [{ label: tx('tkOpenWorld'), primary: true, run: (close) => { close(); if (j.path) void c.open({ name: j.name ?? file.name, path: j.path, dimensions: [] }); } }, { label: tx('tkClose'), run: (close) => close() }],
          autoClose: { seconds: 8, text: (n) => tx('tkCloses', { n }), held: tx('tkHeld') } });
      } else showError(j.error ?? `HTTP ${xhr.status}`, file);
    };
    xhr.onerror = () => { status.innerHTML = ''; showError(tx('offlineBody'), file); };
    xhr.send(file);
  });

  function showError(message: string, file?: File) {
    if (file && c.takeovers?.()) {
      const log = `${file.name} (${sizeText(file.size)})\n${message}\n${new Date().toLocaleTimeString('en-GB')}`;
      showTakeover({ kind: 'fail', chip: tx('tkFailedChip'), title: tx('tkFailed'), lead: tx('tkUploadFailLead'), log, logLabel: tx('tkWhat'),
        actions: [{ label: tx('chooseAnother'), primary: true, run: (close) => { close(); fileInput.click(); } }, { label: tx('tkCopy'), outlined: true, run: () => { void navigator.clipboard?.writeText(log).then(() => c.notify(tx('copied'))); } }, { label: tx('tkDismiss'), run: (close) => close() }] });
    }
    status.innerHTML = `<div class="banner error" role="alert"><div><b>${esc(tx('uploadFailed'))}</b><p>${esc(message)}</p></div>
      <md-filled-button id="again">${esc(tx('chooseAnother'))}</md-filled-button><md-text-button id="dismiss">${esc(tx('dismiss'))}</md-text-button></div>`;
    status.querySelector('#again')!.addEventListener('click', () => fileInput.click());
    status.querySelector('#dismiss')!.addEventListener('click', () => { status.innerHTML = ''; });
  }

  const PRESETS = ['classic', 'desert', 'snowy', 'water', 'stone', 'void'];
  view.querySelector('#new')!.addEventListener('click', () => {
    const dlg = document.createElement('md-dialog');
    dlg.innerHTML = `<div slot="headline">${esc(tx('newFlat'))}</div>
      <form slot="content" id="nf" method="dialog"><md-outlined-text-field name="name" label="${esc(tx('worldName'))}" value="Flat World" maxlength="80" required style="width:100%"></md-outlined-text-field>
      <p class="muted">${esc(tx('newFlatBody'))}</p>
      <fieldset class="nf-presets"><legend>${esc(tx('worldPreset'))}</legend>${PRESETS.map((p, i) => `<label class="nf-preset"><input type="radio" name="preset" value="${p}" ${i === 0 ? 'checked' : ''}><span class="nf-swatch p-${p}" aria-hidden="true"></span><span>${esc(tx(`preset_${p}` as never))}</span></label>`).join('')}</fieldset>
      <label class="nf-size">${esc(tx('worldSize'))} <select name="size">${[[2, '64'], [4, '128'], [8, '256'], [12, '384']].map(([r, w]) => `<option value="${r}" ${r === 4 ? 'selected' : ''}>${w} × ${w}</option>`).join('')}</select></label></form>
      <div slot="actions"><md-text-button form="nf" value="cancel">${esc(tx('cancel'))}</md-text-button><md-filled-button form="nf" value="ok">${esc(tx('create'))}</md-filled-button></div>`;
    document.body.append(dlg);
    (dlg as HTMLElement & { show: () => void }).show();
    dlg.addEventListener('closed', async () => {
      const rv = (dlg as HTMLElement & { returnValue: string }).returnValue;
      const name = (dlg.querySelector('[name=name]') as HTMLInputElement).value.trim();
      const preset = (dlg.querySelector('[name=preset]:checked') as HTMLInputElement | null)?.value ?? 'classic';
      const size = Number((dlg.querySelector('[name=size]') as HTMLSelectElement).value);
      dlg.remove();
      if (rv !== 'ok' || !name) return;
      try { const r = await c.api<{ name: string }>('/api/worlds/new', { method: 'POST', body: { name, preset, size } }); c.notify(tx('created', { name: r.name })); c.play?.('create'); load(); }
      catch (e) { c.notify((e as Error).message, true); }
    });
  });

  view.querySelector('#browse')?.addEventListener('click', async () => {
    const p = await c.browse!();
    if (p) await c.open({ name: p.split(/[\\/]/).pop() ?? p, path: p, dimensions: [] }).catch((e) => c.notify((e as Error).message, true));
  });

  await load();
}
