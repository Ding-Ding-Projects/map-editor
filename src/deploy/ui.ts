// Deploy wizard page. Matches the "Deploy wizard and instances" design board.
import '@material/web/all.js';
import { enableClearControls } from '../ui/clearable.js';

interface Step { label: string; state: 'waiting' | 'running' | 'done' | 'failed'; detail?: string }
interface Disk { id: string; name: string; sizeBytes: number }
interface Instance { name: string; target: string; version: string; port: number; host: string; sshHost?: string }
declare global { interface Window { deploy: any } }
const d = window.deploy;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const TARGETS = [
  { id: 'docker', name: 'Docker', desc: 'Pulls the published image and starts it with Compose on this computer.' },
  { id: 'ssh', name: 'Docker on another computer', desc: 'Uses Docker on a server or spare PC through SSH, with your own SSH key. No passwords are stored.' },
  { id: 'virtualbox', name: 'VirtualBox', desc: 'Imports the appliance image with a bridged adapter so your network can reach it.' },
  { id: 'vmware', name: 'VMware', desc: 'Imports the appliance image into VMware Workstation or Player on a bridged network and starts it without a window.' },
  { id: 'usb', name: 'USB drive', desc: 'Writes the appliance image to a USB drive so a spare PC boots straight into Map Editor.' },
  { id: 'pi', name: 'Raspberry Pi', desc: 'A Pi 4 or 5 running Docker can use Docker on another computer: the image runs on arm64. A ready-to-flash Pi image is not built yet.' },
] as const;
let target: typeof TARGETS[number]['id'] = 'docker';
let view: 'deploy' | 'instances' = 'deploy';
let managing: string | undefined;
const STATE_LABEL: Record<string, string> = { running: 'Running', stopped: 'Stopped', missing: 'Not found in Docker, VirtualBox or VMware', unknown: 'State unknown' };

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
  main.innerHTML = `<div class="editor"><section class="grid" style="flex: 999 1 560px; align-self: flex-start">${TARGETS.map((t) => `<button class="world" data-t="${t.id}" aria-pressed="${t.id === target}" style="${t.id === target ? 'background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary)' : ''}"><span class="md-typescale-title-large">${esc(t.name)}</span><span>${esc(t.desc)}</span></button>`).join('')}</section>
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
    const deployNow = async (): Promise<void> => {
      if (!worlds) return toast('Choose the worlds folder first.', true);
      const val = (id: string) => (form.querySelector(id) as HTMLInputElement).value;
      let steps: Step[] = [];
      d.onProgress((s: Step[]) => { steps = s; form.querySelector('#steps')!.innerHTML = stepsHtml(s); });
      const t0 = Date.now();
      const r = await d.docker({ name: val('#name'), port: Number(val('#port')), version: val('#version'), worlds });
      if (!r.error) { celebrate(r.url, r.instance, Date.now() - t0); return; }
      const port = Number(val('#port'));
      const portBusy = /port|allocated|in use/i.test(r.error) && port < 65535;
      failTakeover({ what: `Docker could not start ${val('#name')}.`, error: r.error, steps,
        retry: portBusy ? { label: `Try port ${port + 1}`, run: () => { (form.querySelector('#port') as HTMLInputElement).value = String(port + 1); void deployNow(); } }
          : { label: 'Try again', run: () => void deployNow() } });
    };
    form.querySelector('#go')!.addEventListener('click', () => void deployNow());
  } else if (target === 'ssh') {
    form.innerHTML = `<h2 class="md-typescale-headline-large">Docker on another computer</h2>
      <p class="muted">The other computer needs Docker with Compose and an SSH login that works without a password prompt (an SSH key in your agent). Docker connects with <code>DOCKER_HOST=ssh://…</code>; this app never sees your password or key.</p>
      <md-outlined-text-field id="ssh" label="SSH login (user@host or user@host:port)" placeholder="pi@192.168.1.50"></md-outlined-text-field>
      <md-outlined-text-field id="name" label="Instance name" value="map-editor-1"></md-outlined-text-field>
      <md-outlined-text-field id="port" label="Port on that computer" type="number" value="8420"></md-outlined-text-field>
      <md-outlined-text-field id="version" label="Version" value="latest"></md-outlined-text-field>
      <md-outlined-text-field id="rworlds" label="Worlds folder on that computer" placeholder="/srv/minecraft/worlds"></md-outlined-text-field>
      <md-filled-button id="go">Deploy</md-filled-button><div id="steps"></div>`;
    const val = (id: string) => (form.querySelector(id) as HTMLInputElement).value.trim();
    const deployNow = async (): Promise<void> => {
      if (!val('#ssh') || !val('#rworlds')) return toast('Enter the SSH login and the worlds folder on that computer.', true);
      let steps: Step[] = [];
      d.onProgress((st: Step[]) => { steps = st; form.querySelector('#steps')!.innerHTML = stepsHtml(st); });
      const t0 = Date.now();
      const port = Number(val('#port'));
      const r = await d.docker({ name: val('#name'), port, version: val('#version'), worlds: val('#rworlds'), sshHost: val('#ssh') });
      if (!r.error) { celebrate(r.url, r.instance, Date.now() - t0); return; }
      const portBusy = /allocated|address already in use/i.test(r.error) && port < 65535;
      failTakeover({ what: `Docker on ${val('#ssh')} could not start ${val('#name')}.`, error: r.error, steps,
        retry: portBusy ? { label: `Try port ${port + 1}`, run: () => { (form.querySelector('#port') as HTMLInputElement).value = String(port + 1); void deployNow(); } } : { label: 'Try again', run: () => void deployNow() } });
    };
    form.querySelector('#go')!.addEventListener('click', () => void deployNow());
  } else if (target === 'vmware') {
    form.innerHTML = `<h2 class="md-typescale-headline-large">VMware</h2>
      <p class="muted">Needs VMware Workstation or Player with OVF Tool (it comes with Workstation). The VM uses a bridged network so other devices can reach it.</p>
      <md-outlined-text-field id="name" label="VM name" value="map-editor-vmware"></md-outlined-text-field>
      <md-outlined-button id="ova">Choose appliance .ova</md-outlined-button><span class="muted" id="opath">No file chosen</span>
      <md-filled-button id="go">Deploy</md-filled-button><div id="steps"></div>`;
    let ova = '';
    form.querySelector('#ova')!.addEventListener('click', async () => { ova = (await d.pickFile(['ova'])) ?? ''; form.querySelector('#opath')!.textContent = ova || 'No file chosen'; });
    const deployNow = async (): Promise<void> => {
      const name = (form.querySelector('#name') as HTMLInputElement).value.trim();
      if (!ova) return toast('Choose the appliance .ova file first.', true);
      let steps: Step[] = [];
      d.onProgress((st: Step[]) => { steps = st; form.querySelector('#steps')!.innerHTML = stepsHtml(st); });
      const t0 = Date.now();
      const r = await d.vmware({ name, ova });
      if (!r.error) { celebrate(r.url, r.instance, Date.now() - t0); return; }
      failTakeover({ what: `VMware could not start ${name}.`, error: r.error, steps, retry: { label: 'Try again', run: () => void deployNow() } });
    };
    form.querySelector('#go')!.addEventListener('click', () => void deployNow());
  } else if (target === 'virtualbox') {
    form.innerHTML = `<h2 class="md-typescale-headline-large">VirtualBox</h2>
      <md-outlined-text-field id="name" label="Instance name" value="map-editor-vm"></md-outlined-text-field>
      <md-outlined-text-field id="bridge" label="Network adapter to bridge" value=""></md-outlined-text-field>
      <md-outlined-button id="ova">Choose appliance .ova</md-outlined-button><span class="muted" id="opath">No file chosen</span>
      <md-filled-button id="go">Deploy</md-filled-button><div id="steps"></div>`;
    let ova = '';
    form.querySelector('#ova')!.addEventListener('click', async () => { ova = (await d.pickFile(['ova'])) ?? ''; form.querySelector('#opath')!.textContent = ova || 'No file chosen'; });
    const deployNow = async (): Promise<void> => {
      const val = (id: string) => (form.querySelector(id) as HTMLInputElement).value;
      if (!ova || !val('#bridge')) return toast('Choose the .ova file and the adapter to bridge.', true);
      let steps: Step[] = [];
      d.onProgress((s: Step[]) => { steps = s; form.querySelector('#steps')!.innerHTML = stepsHtml(s); });
      const t0 = Date.now();
      const r = await d.virtualbox({ name: val('#name'), ova, bridgeAdapter: val('#bridge') });
      if (!r.error) { celebrate(r.url, r.instance, Date.now() - t0); return; }
      failTakeover({ what: `VirtualBox could not start ${val('#name')}.`, error: r.error, steps, retry: { label: 'Try again', run: () => void deployNow() } });
    };
    form.querySelector('#go')!.addEventListener('click', () => void deployNow());
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
    go.addEventListener('click', async () => {
      go.disabled = true;
      const r = await d.flash(img, sel.value, typed.value);
      if (r.ok) { toast(r.message); return; }
      failTakeover({ what: 'The drive was not written correctly.', error: r.message, steps: [], retry: { label: 'Choose again', run: () => { typed.value = ''; refresh(); sel.focus(); } } });
    });
  } else {
    form.innerHTML = `<h2 class="md-typescale-headline-large">${esc(TARGETS.find((t) => t.id === target)!.name)}</h2><p>${esc(TARGETS.find((t) => t.id === target)!.desc)}</p>
      ${target === 'pi' ? '<md-filled-tonal-button id="to-ssh">Use Docker on another computer</md-filled-tonal-button>' : ''}`;
    form.querySelector('#to-ssh')?.addEventListener('click', () => { target = 'ssh'; render(); });
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

// Full-screen takeovers from the Takeover board. Success closes itself after 8 s; failure stays
// until it is dismissed and keeps the step log, the exact error and a retry.
function takeover(kind: 'ok' | 'fail', html: string, opener: Element | null): { el: HTMLElement; close: () => void } {
  const el = document.createElement('div');
  el.className = `takeover ${kind}`;
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tk-title');
  el.innerHTML = `<div class="tk-shapes" aria-hidden="true"><i></i><i></i><i></i></div><section>${html}</section>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); (opener as HTMLElement | null)?.focus?.(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { // keep focus inside the takeover
      const f = Array.from(el.querySelectorAll<HTMLElement>('button, md-filled-button, md-outlined-button, md-text-button, a'));
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(el);
  requestAnimationFrame(() => el.querySelector<HTMLElement>('md-filled-button')?.focus());
  return { el, close };
}

function celebrate(url: string, inst: Instance, tookMs = 0) {
  const { el, close } = takeover('ok', `<span class="tk-chip">Installed</span>
    <h1 id="tk-title">It is live.</h1>
    <p class="tk-lead">${esc(inst.name)} is running ${inst.target === 'docker' ? 'in Docker on this computer' : inst.target === 'docker-ssh' ? `in Docker on ${inst.sshHost ?? inst.host}` : inst.target === 'vmware' ? 'in VMware' : 'in VirtualBox'} and answered its health check.</p>
    <div class="tk-stats"><div><small>Link</small><code>${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</code></div><div><small>Version</small><b>${esc(inst.version)}</b></div><div><small>Took</small><b>${Math.max(1, Math.round(tookMs / 1000))} s</b></div></div>
    <div class="tk-actions"><md-filled-button id="tk-open">Open Map Editor</md-filled-button><md-outlined-button id="tk-copy">Copy link</md-outlined-button><md-text-button id="tk-close">Close (Esc)</md-text-button></div>
    <small class="tk-note" id="tk-count">Closes by itself in 8 s.</small>`, document.activeElement);
  el.querySelector('#tk-open')!.addEventListener('click', () => d.open(url));
  el.querySelector('#tk-copy')!.addEventListener('click', () => navigator.clipboard?.writeText(url).then(() => toast('Link copied.')));
  el.querySelector('#tk-close')!.addEventListener('click', close);
  let left = 8;
  const timer = setInterval(() => { left--; const c = el.querySelector('#tk-count'); if (!el.isConnected || left <= 0) { clearInterval(timer); if (el.isConnected) close(); return; } if (c) c.textContent = `Closes by itself in ${left} s.`; }, 1000);
  // Hovering or focusing inside keeps it open, so it never vanishes while being read.
  const hold = () => { clearInterval(timer); el.querySelector('#tk-count')!.textContent = 'Stays open while you use it.'; };
  el.addEventListener('pointerenter', hold, { once: true }); el.addEventListener('focusin', (e) => { if (e.target !== el.querySelector('md-filled-button')) hold(); });
}

function failTakeover(o: { what: string; error: string; steps: Step[]; retry: { label: string; run: () => void } }) {
  const stamp = new Date().toLocaleTimeString('en-GB');
  const log = [...o.steps.map((s) => `${s.state === 'failed' ? '✗' : s.state === 'done' ? '✓' : '·'} ${s.label}${s.detail ? ` — ${s.detail}` : ''}`), '', o.error, `at ${stamp}`].join('\n').trim();
  const { el, close } = takeover('fail', `<span class="tk-chip">Install failed · stays until you close it</span>
    <h1 id="tk-title">That did not work.</h1>
    <p class="tk-lead">${esc(o.what)} Nothing else on this computer was changed.</p>
    <pre class="tk-log" tabindex="0" aria-label="What happened">${esc(log)}</pre>
    <div class="tk-actions"><md-filled-button id="tk-retry">${esc(o.retry.label)}</md-filled-button><md-outlined-button id="tk-copy">Copy details</md-outlined-button><md-text-button id="tk-close">Dismiss (Esc)</md-text-button></div>`, document.activeElement);
  el.querySelector('#tk-retry')!.addEventListener('click', () => { close(); o.retry.run(); });
  el.querySelector('#tk-copy')!.addEventListener('click', () => navigator.clipboard?.writeText(log).then(() => toast('Details copied.')));
  el.querySelector('#tk-close')!.addEventListener('click', close);
}

enableClearControls((field) => `Clear ${field}`);
render();
