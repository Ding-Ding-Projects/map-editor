// Deploy wizard page. Matches the "Deploy wizard and instances" design board.
import '@material/web/all.js';
import { enableClearControls } from '../ui/clearable.js';

interface Step { label: string; state: 'waiting' | 'running' | 'done' | 'failed'; detail?: string }
interface Disk { id: string; name: string; sizeBytes: number }
interface Instance { name: string; target: string; version: string; port: number; host: string }
declare global { interface Window { deploy: any } }
const d = window.deploy;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const TARGETS = [
  { id: 'docker', name: 'Docker', desc: 'Pulls the published image and starts it with Compose on this computer.' },
  { id: 'virtualbox', name: 'VirtualBox', desc: 'Imports the appliance image with a bridged adapter so your network can reach it.' },
  { id: 'vmware', name: 'VMware', desc: 'Not available in this version yet. See the roadmap.' },
  { id: 'usb', name: 'USB drive', desc: 'Writes the appliance image to a USB drive so a spare PC boots straight into Map Editor.' },
  { id: 'pi', name: 'Raspberry Pi', desc: 'Not available yet: the arm64 image is not built in this version.' },
] as const;
let target: typeof TARGETS[number]['id'] = 'docker';
let view: 'deploy' | 'instances' = 'deploy';
let managing: string | undefined;
const STATE_LABEL: Record<string, string> = { running: 'Running', stopped: 'Stopped', missing: 'Not found in Docker or VirtualBox', unknown: 'State unknown' };

async function manage(main: Element, i: Instance) {
  const url = `http://${i.host}:${i.port}/`;
  main.innerHTML = `<div class="editor manage">
    <section class="card tool manage-card"><md-text-button id="back">← All instances</md-text-button>
      <div class="manage-title"><span class="state-dot" id="dot"></span><h1 class="md-typescale-headline-large">${esc(i.name)}</h1></div>
      <div class="about-stats manage-stats"><div><small>State</small><b id="st">…</b></div><div><small>Version</small><b>${esc(i.version)}</b></div><div class="wide"><small>Link</small><code>${esc(url)}</code></div></div>
      <div class="row-actions" role="group" aria-label="Instance actions">
        <md-filled-button id="a-open">Open</md-filled-button><md-filled-tonal-button id="a-toggle">…</md-filled-tonal-button>
        <md-outlined-button id="a-restart">Restart</md-outlined-button><md-outlined-button id="a-update">Update</md-outlined-button><md-outlined-button id="a-remove" class="danger">Remove</md-outlined-button></div>
      <p class="muted">Remove stops it and deletes its Compose file. Worlds and data are kept unless you also choose Delete data.</p></section>
    <section class="card log-card"><div class="log-head"><b>Live log</b><span class="spacer"></span><md-outlined-button id="pause">Pause</md-outlined-button><md-outlined-button id="copy">Copy</md-outlined-button></div>
      <pre id="log" class="log" aria-live="off"></pre></section></div>`;
  let state = 'unknown', paused = false;
  const lines: string[] = [];
  const logEl = main.querySelector<HTMLElement>('#log')!;
  const refresh = async () => {
    state = await d.state(i.name);
    const st = main.querySelector('#st'); if (!st) return;
    st.textContent = STATE_LABEL[state] ?? state;
    main.querySelector('#dot')!.className = `state-dot ${state}`;
    main.querySelector('#a-toggle')!.textContent = state === 'running' ? 'Stop' : 'Start';
  };
  const act = async (action: string, deleteData = false) => {
    const r = await d.action(i.name, action, deleteData);
    toast(r.message, !r.ok);
    if (r.ok && action === 'remove') { managing = undefined; d.logsStop(); render(); return; }
    refresh();
  };
  d.onLog((l: string) => { lines.push(l); if (lines.length > 2000) lines.shift(); if (!paused && logEl.isConnected) { logEl.textContent = lines.join('\n'); logEl.scrollTop = logEl.scrollHeight; } });
  d.logsStart(i.name);
  main.querySelector('#back')!.addEventListener('click', () => { managing = undefined; d.logsStop(); render(); });
  main.querySelector('#a-open')!.addEventListener('click', () => d.open(url));
  main.querySelector('#a-toggle')!.addEventListener('click', () => act(state === 'running' ? 'stop' : 'start'));
  main.querySelector('#a-restart')!.addEventListener('click', () => act('restart'));
  main.querySelector('#a-update')!.addEventListener('click', () => act('update'));
  main.querySelector('#pause')!.addEventListener('click', (e) => { paused = !paused; (e.target as HTMLElement).textContent = paused ? 'Resume' : 'Pause'; if (!paused) logEl.textContent = lines.join('\n'); });
  main.querySelector('#copy')!.addEventListener('click', () => navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Log copied.'), () => toast('Could not copy the log.', true)));
  main.querySelector('#a-remove')!.addEventListener('click', () => {
    const dlg = document.createElement('md-dialog');
    dlg.innerHTML = `<div slot="headline">Remove ${esc(i.name)}?</div>
      <form slot="content" id="rm" method="dialog"><p>The instance stops and its Compose file is deleted.</p>
      <label class="row"><md-checkbox name="data"></md-checkbox><span>Also delete its data (accounts, history, notes). Worlds are never deleted.</span></label></form>
      <div slot="actions"><md-text-button form="rm" value="cancel">Cancel</md-text-button><md-filled-button form="rm" value="ok">Remove</md-filled-button></div>`;
    document.body.append(dlg);
    (dlg as HTMLElement & { show: () => void }).show();
    dlg.addEventListener('closed', () => {
      const ok = (dlg as HTMLElement & { returnValue: string }).returnValue === 'ok';
      const del = (dlg.querySelector('[name=data]') as HTMLInputElement & { checked: boolean }).checked;
      dlg.remove();
      if (ok) act('remove', del);
    });
  });
  refresh();
}

function stepsHtml(steps: Step[]) {
  return `<ol class="stack" aria-live="polite">${steps.map((s) => `<li><strong>${esc(s.label)}</strong> · ${esc(s.state)}${s.detail ? ` <span class="muted">${esc(s.detail)}</span>` : ''}</li>`).join('')}</ol>`;
}

// Update ready banner: same wording and behaviour as the editor's; restart is never automatic.
let upd: { state: string; version?: string; notes?: string } | undefined;
let updLater = false;
function showUpdate() {
  const el = document.getElementById('update-banner');
  if (!el) return;
  if (upd?.state !== 'ready' || updLater) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<span class="ub-icon" aria-hidden="true">↻</span><span class="ub-text"><b>Map Editor Deploy ${esc(upd.version ?? '')} is ready to install</b><small>This update is not code-signed. It replaces this copy when you restart.</small></span>
    <a href="${esc(upd.notes ?? '')}" target="_blank" rel="noopener">Release notes</a><md-text-button id="ub-later">Later</md-text-button><md-filled-button id="ub-restart">Restart to install update</md-filled-button>`;
  el.querySelector('#ub-later')!.addEventListener('click', () => { updLater = true; showUpdate(); });
  el.querySelector('#ub-restart')!.addEventListener('click', () => d.updateRestart?.());
}
d.onUpdate?.((u: typeof upd) => { if (u?.state === 'ready') updLater = false; upd = u; showUpdate(); });
d.updateState?.().then((u: typeof upd) => { upd = u; showUpdate(); }).catch(() => undefined);

async function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = `<header class="top"><div class="brand"><div class="logo" aria-hidden="true"></div><div>
      <div class="md-typescale-headline-medium title">Put Map Editor on your network</div>
      <div class="muted" id="prov"></div></div></div>
    <md-chip-set><md-filter-chip id="v-deploy" label="Deploy" ${view === 'deploy' ? 'selected' : ''}></md-filter-chip><md-filter-chip id="v-inst" label="Instances" ${view === 'instances' ? 'selected' : ''}></md-filter-chip></md-chip-set></header>
    <div id="update-banner" class="update-banner" role="region" aria-label="Update" hidden></div>
    <div class="body"><main class="view" id="main"></main></div><div id="toasts" class="toasts"></div>`;
  showUpdate();
  app.querySelector('#v-deploy')!.addEventListener('click', () => { view = 'deploy'; render(); });
  app.querySelector('#v-inst')!.addEventListener('click', () => { view = 'instances'; render(); });
  const main = app.querySelector('#main')!;
  if (view === 'instances') {
    const list: Instance[] = await d.instances();
    if (managing && list.some((i) => i.name === managing)) return manage(main, list.find((i) => i.name === managing)!);
    managing = undefined;
    main.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">${list.length} ${list.length === 1 ? 'instance' : 'instances'}</h1>
      <p class="muted">Only instances this app created are listed.</p>
      ${list.length ? `<md-list>${list.map((i) => `<md-list-item><div slot="headline">${esc(i.name)} · ${esc(i.target)} · ${esc(i.version)}</div>
        <div slot="supporting-text">http://${esc(i.host)}:${i.port}/ · <span data-state="${esc(i.name)}">checking…</span></div>
        <md-filled-tonal-button slot="end" data-manage="${esc(i.name)}">Manage</md-filled-tonal-button></md-list-item>`).join('')}</md-list>` : '<p>Deploy one from the Deploy view and it appears here.</p>'}</section>`;
    main.querySelectorAll<HTMLElement>('[data-manage]').forEach((b) => b.addEventListener('click', () => { managing = b.dataset.manage; render(); }));
    for (const i of list) d.state(i.name).then((st: string) => { const el = main.querySelector(`[data-state="${CSS.escape(i.name)}"]`); if (el) el.textContent = STATE_LABEL[st] ?? st; });
    return;
  }
  main.innerHTML = `<div class="editor"><section class="grid" style="flex: 999 1 560px">${TARGETS.map((t) => `<button class="world" data-t="${t.id}" aria-pressed="${t.id === target}" style="${t.id === target ? 'background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary)' : ''}"><span class="md-typescale-title-large">${esc(t.name)}</span><span>${esc(t.desc)}</span></button>`).join('')}</section>
    <aside class="card tool" id="form"></aside></div>`;
  main.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { target = b.dataset.t as typeof target; render(); }));
  const form = main.querySelector('#form')!;
  if (target === 'docker') {
    form.innerHTML = `<h2 class="md-typescale-headline-large">Docker</h2>
      <md-outlined-text-field id="name" label="Instance name" value="map-editor-1"></md-outlined-text-field>
      <md-outlined-text-field id="port" label="Port" type="number" value="8420"></md-outlined-text-field>
      <md-outlined-text-field id="version" label="Version" value="latest" supporting-text="latest follows every release; Update pulls it again"></md-outlined-text-field>
      <md-outlined-button id="worlds">Choose worlds folder</md-outlined-button><span class="muted" id="wpath">No folder chosen</span>
      <md-filled-button id="go">Deploy</md-filled-button><div id="steps"></div>`;
    let worlds = '';
    form.querySelector('#worlds')!.addEventListener('click', async () => { worlds = (await d.pickFolder()) ?? ''; form.querySelector('#wpath')!.textContent = worlds || 'No folder chosen'; });
    form.querySelector('#go')!.addEventListener('click', async () => {
      if (!worlds) return toast('Choose the worlds folder first.', true);
      const val = (id: string) => (form.querySelector(id) as HTMLInputElement).value;
      d.onProgress((s: Step[]) => { form.querySelector('#steps')!.innerHTML = stepsHtml(s); });
      const r = await d.docker({ name: val('#name'), port: Number(val('#port')), version: val('#version'), worlds });
      if (r.error) toast(r.error, true); else celebrate(r.url, r.instance);
    });
  } else if (target === 'virtualbox') {
    form.innerHTML = `<h2 class="md-typescale-headline-large">VirtualBox</h2>
      <md-outlined-text-field id="name" label="Instance name" value="map-editor-vm"></md-outlined-text-field>
      <md-outlined-text-field id="bridge" label="Network adapter to bridge" value=""></md-outlined-text-field>
      <md-outlined-button id="ova">Choose appliance .ova</md-outlined-button><span class="muted" id="opath">No file chosen</span>
      <md-filled-button id="go">Deploy</md-filled-button><div id="steps"></div>`;
    let ova = '';
    form.querySelector('#ova')!.addEventListener('click', async () => { ova = (await d.pickFile(['ova'])) ?? ''; form.querySelector('#opath')!.textContent = ova || 'No file chosen'; });
    form.querySelector('#go')!.addEventListener('click', async () => {
      const val = (id: string) => (form.querySelector(id) as HTMLInputElement).value;
      if (!ova || !val('#bridge')) return toast('Choose the .ova file and the adapter to bridge.', true);
      d.onProgress((s: Step[]) => { form.querySelector('#steps')!.innerHTML = stepsHtml(s); });
      const r = await d.virtualbox({ name: val('#name'), ova, bridgeAdapter: val('#bridge') });
      if (r.error) toast(r.error, true); else celebrate(r.url, r.instance);
    });
  } else if (target === 'usb') {
    const disks: Disk[] = await d.disks().catch((e: Error) => { toast(e.message, true); return []; });
    form.innerHTML = `<h2 class="md-typescale-headline-large">USB drive</h2>
      <p class="muted">Only removable drives are listed. Nothing is chosen for you, and the drive running your system is never offered.</p>
      <md-outlined-select id="disk" label="Drive"><md-select-option value="" selected></md-select-option>${disks.map((x) => `<md-select-option value="${esc(x.id)}"><div slot="headline">${esc(x.name)} · ${(x.sizeBytes / 1e9).toFixed(1)} GB</div></md-select-option>`).join('')}</md-outlined-select>
      <md-outlined-button id="img">Choose appliance .img</md-outlined-button><span class="muted" id="ipath">No file chosen</span>
      <div id="warn"></div>
      <md-outlined-text-field id="typed" label="Type the confirmation shown above"></md-outlined-text-field>
      <md-filled-button id="go" disabled>Erase and flash</md-filled-button><md-linear-progress id="bar" value="0"></md-linear-progress>`;
    let img = '';
    const sel = form.querySelector('#disk') as HTMLInputElement;
    const typed = form.querySelector('#typed') as HTMLInputElement;
    const go = form.querySelector('#go') as HTMLButtonElement;
    const phrase = () => { const disk = disks.find((x) => x.id === sel.value); return disk ? `ERASE ${disk.name}` : ''; };
    const refresh = () => {
      const p = phrase();
      form.querySelector('#warn')!.innerHTML = p ? `<div class="toast error" role="alert"><span>Everything on ${esc(p.slice(6))} will be erased. Type: <code>${esc(p)}</code></span></div>` : '';
      go.disabled = !(p && img && typed.value === p);
    };
    sel.addEventListener('change', refresh); typed.addEventListener('input', refresh);
    form.querySelector('#img')!.addEventListener('click', async () => { img = (await d.pickFile(['img'])) ?? ''; form.querySelector('#ipath')!.textContent = img || 'No file chosen'; refresh(); });
    d.onFlash((w: number, t: number) => { (form.querySelector('#bar') as HTMLInputElement).value = String(w / t); });
    go.addEventListener('click', async () => { go.disabled = true; const r = await d.flash(img, sel.value, typed.value); toast(r.message, !r.ok); });
  } else {
    form.innerHTML = `<h2 class="md-typescale-headline-large">${esc(TARGETS.find((t) => t.id === target)!.name)}</h2><p>${esc(TARGETS.find((t) => t.id === target)!.desc)}</p>`;
  }
}

function toast(text: string, error = false) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`; el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(text)}</span>`;
  const x = document.createElement('md-text-button'); x.textContent = 'Close'; x.addEventListener('click', () => el.remove()); el.append(x);
  document.getElementById('toasts')!.prepend(el);
  if (!error) setTimeout(() => el.remove(), 8000);
}

function celebrate(url: string, inst: Instance) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Deployed');
  el.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:48px;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)';
  el.innerHTML = `<h1 style="margin:0;font-size:clamp(48px,8vw,96px);font-weight:900;letter-spacing:-3px">It is live.</h1>
    <p class="md-typescale-title-large">${esc(inst.name)} answered its health check at <strong>${esc(url)}</strong> (version ${esc(inst.version)}).</p>
    <div><md-filled-button id="o">Open Map Editor</md-filled-button> <md-text-button id="c">Close (Esc)</md-text-button></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('#o')!.addEventListener('click', () => d.open(url));
  el.querySelector('#c')!.addEventListener('click', close);
  document.body.append(el);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,0,0,1)' });
  setTimeout(close, 10_000);
}

enableClearControls((field) => `Clear ${field}`);
render();
