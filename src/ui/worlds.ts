// Worlds screen: list, upload a .zip, new flat world, download, browse (desktop), and every stage.
// Matches the "Worlds" design board.
import type { Key } from './i18n.js';
import { showTakeover } from './takeover.js';

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
  /** Present only in the desktop app. */
  browse?: () => Promise<string | undefined>;
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
      </div></header>
    <div id="upload-status"></div>
    <div id="list" class="world-grid" role="status" aria-label="${esc(tx('loading'))}">${'<div class="world-card skeleton"><span class="sk-tile"></span><span class="sk-line"></span><span class="sk-line short"></span></div>'.repeat(4)}</div>
  </section>`;

  const status = view.querySelector<HTMLElement>('#upload-status')!;
  const list = view.querySelector<HTMLElement>('#list')!;
  const fileInput = view.querySelector<HTMLInputElement>('#upload')!;
  const label = view.querySelector<HTMLElement>('#upload-label')!;
  label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

  async function load() {
    try {
      const { worlds, roots } = await c.api<{ worlds: WorldSummary[]; roots: string[] }>('/api/worlds');
      if (!list.isConnected) return; // the screen was replaced while this loaded
      view.querySelector('#roots')!.textContent = tx('worldsFrom', { roots: roots.join(', ') });
      list.removeAttribute('role'); list.removeAttribute('aria-label');
      if (!worlds.length) {
        list.className = '';
        list.innerHTML = `<div class="empty-world"><div class="empty-art" aria-hidden="true">${'<i></i>'.repeat(16)}</div>
          <div><h2>${esc(tx('noWorldsTitle'))}</h2><p class="muted">${esc(tx('noWorldsBody'))}</p></div></div>`;
        return;
      }
      list.className = 'world-grid';
      list.innerHTML = worlds.map((w, i) => `<article class="world-card ${SHAPES[i % SHAPES.length]}" style="--i:${i}">
        <div class="mini-map" aria-hidden="true">${mosaic(w.name)}</div>
        <h2>${esc(w.name)}</h2>${w.edition === 'bedrock' ? `<p class="muted"><b>Bedrock</b> · ${esc(tx('bedrockNote'))}</p>` : `<p class="muted">Java ${esc(w.versionName ?? '')} · ${esc(w.dimensions.map((d) => tx(d as Key)).join(', '))}</p>`}
        <div class="row-actions"><md-filled-button data-open="${i}">${esc(tx('open'))}</md-filled-button>
        <md-outlined-button data-dl="${i}">${esc(tx('download'))}</md-outlined-button></div></article>`).join('');
      list.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.addEventListener('click', () => c.open(worlds[Number(b.dataset.open)]).catch((e) => c.notify((e as Error).message, true))));
      list.querySelectorAll<HTMLElement>('[data-dl]').forEach((b) => b.addEventListener('click', () => {
        const w = worlds[Number(b.dataset.dl)];
        const a = document.createElement('a');
        a.href = '/api/worlds/download?path=' + encodeURIComponent(w.path);
        a.download = `${w.name}${w.edition === 'bedrock' ? '.mcworld' : '.zip'}`;
        document.body.append(a); a.click(); a.remove();
      }));
    } catch (e) {
      if (!list.isConnected) return;
      list.className = '';
      list.innerHTML = `<div class="banner error" role="alert"><div><b>${esc(tx('loadFailed'))}</b><p>${esc((e as Error).message)}</p></div><md-filled-button id="retry">${esc(tx('retry'))}</md-filled-button></div>`;
      list.querySelector('#retry')!.addEventListener('click', () => worldsView(view, c));
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
          stats: [{ label: tx('tkFile'), value: file.name, code: true }, { label: tx('tkSize'), value: `${(file.size / 1e6).toFixed(1)} MB` }, { label: tx('tkTook'), value: `${Math.max(1, Math.round((Date.now() - t0) / 1000))} s` }],
          actions: [{ label: tx('tkOpenWorld'), primary: true, run: (close) => { close(); if (j.path) void c.open({ name: j.name ?? file.name, path: j.path, dimensions: [] }); } }, { label: tx('tkClose'), run: (close) => close() }],
          autoClose: { seconds: 8, text: (n) => tx('tkCloses', { n }), held: tx('tkHeld') } });
      } else showError(j.error ?? `HTTP ${xhr.status}`, file);
    };
    xhr.onerror = () => { status.innerHTML = ''; showError(tx('offlineBody'), file); };
    xhr.send(file);
  });

  function showError(message: string, file?: File) {
    if (file && c.takeovers?.()) {
      const log = `${file.name} (${(file.size / 1e6).toFixed(1)} MB)\n${message}\n${new Date().toLocaleTimeString('en-GB')}`;
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
