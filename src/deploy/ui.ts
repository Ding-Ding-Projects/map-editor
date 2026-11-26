// Deploy wizard page. Matches the "Deploy wizard and instances" design board.
import '@material/web/all.js';
import { enableClearControls } from '../ui/clearable.js';
import { startTour } from '../ui/tour.js';
import { showTakeover } from '../ui/takeover.js';
import { downloadRows, exportButton } from '../ui/exporter.js';
import { iconSvg, initButtonIcons } from '../ui/icons.js';
import { superConfirm } from '../ui/moments.js';
import { englishOf, initLang, langSwitch, setLang, type Lang } from './lang.js';
import { configureSounds, play } from '../ui/sounds.js';
import { openPalette, type Command } from '../ui/palette.js';
import { t as tr, type Key } from '../ui/i18n.js';
import { currentLang } from './lang.js';
import { ARTICLES, docsView, docTitle, openDoc } from '../ui/docs.js';
import { invert, pickItem, selectAll } from '../ui/select.js';
import { openSupportDesk } from '../ui/tickets.js';
let guideOpened = false;
/** A plain yes or no question, for small local things such as deleting a saved ticket. */
function askYesNo(text: string, ok: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; returnValue: string };
    dlg.innerHTML = `<form slot="content" id="yn" method="dialog"><p>${esc(text)}</p></form><div slot="actions"><md-text-button form="yn" value="cancel">Cancel</md-text-button><md-filled-button form="yn" value="ok">${esc(ok)}</md-filled-button></div>`;
    document.body.append(dlg);
    dlg.addEventListener('closed', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.show();
  });
}
/** The support desk, with the facts about this copy of the deploy app. */
async function supportDesk() {
  const b: { version?: string; commit?: string } = await d.buildInfo?.().catch(() => ({})) ?? {};
  openSupportDesk({
    context: () => ({ version: b.version ?? 'unavailable', commit: b.commit ?? 'unavailable', language: currentLang(), screen: `deploy app: ${view}`, window: `${innerWidth} × ${innerHeight}`, browser: `Map Editor Deploy on ${d.platform ?? 'unknown'}` }),
    tx: paletteText, esc, notify: toast, confirm: askYesNo,
  });
}
/** Text made at run time, in the chosen language (fixed phrases go through the phrase list instead). */
const by = (en: string, yue: string) => currentLang() === 'yue' ? yue : currentLang() === 'both' ? `${en} · ${yue}` : en;

interface Step { label: string; state: 'waiting' | 'running' | 'done' | 'failed'; detail?: string }
interface Disk { id: string; name: string; sizeBytes: number }
interface Instance { name: string; target: string; version: string; port: number; host: string; sshHost?: string }
declare global { interface Window { deploy: any } }
const d = window.deploy;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const TARGET_ICONS: Record<string, string> = {'docker': 'docker', 'ssh': 'remote', 'virtualbox': 'box', 'vmware': 'layers', 'usb': 'usb', 'pi': 'chip'};
const TARGETS = [
  { id: 'docker', name: 'Docker', desc: 'Pulls the published image and starts it with Compose on this computer.' },
  { id: 'ssh', name: 'Docker on another computer', desc: 'Uses Docker on a server or spare PC through SSH, with your own SSH key. No passwords are stored.' },
  { id: 'virtualbox', name: 'VirtualBox', desc: 'Imports the appliance image with a bridged adapter so your network can reach it.' },
  { id: 'vmware', name: 'VMware', desc: 'Imports the appliance image into VMware Workstation or Player on a bridged network and starts it without a window.' },
  { id: 'usb', name: 'USB drive', desc: 'Writes the appliance image to a USB drive so a spare PC boots straight into Map Editor.' },
  { id: 'pi', name: 'Raspberry Pi', desc: 'Write the Raspberry Pi image (unpack map-editor-appliance-rpi-arm64.img.xz first) to an SD card with USB drive, or use Docker on another computer if the Pi already runs Docker.' },
] as const;
let target: typeof TARGETS[number]['id'] = 'docker';
let view: 'deploy' | 'instances' | 'disks' | 'guide' = 'deploy';
let managing: string | undefined;
const STATE_LABEL: Record<string, string> = { running: 'Running', stopped: 'Stopped', missing: 'Not found in Docker, VirtualBox or VMware', unknown: 'State unknown' };

async function manage(main: Element, i: Instance) {
  const url = `http://${i.host}:${i.port}/`;
  main.innerHTML = `<div class="editor manage">
    <section class="card tool manage-card"><md-text-button id="back" data-icon="back">All instances</md-text-button>
      <div class="manage-title"><span class="state-dot" id="dot"></span><h1 class="md-typescale-headline-large">${esc(i.name)}</h1></div>
      <div class="about-stats manage-stats"><div><small>State</small><b id="st">…</b></div><div><small>Version</small><b>${esc(i.version)}</b></div><div class="wide"><small>Link</small><code>${esc(url)}</code></div></div>
      <div class="row-actions" role="group" aria-label="Instance actions">
        <md-filled-button id="a-open">Open</md-filled-button><md-filled-tonal-button id="a-toggle">…</md-filled-tonal-button>
        <md-outlined-button id="a-restart">Restart</md-outlined-button><md-outlined-button id="a-update">Update</md-outlined-button><md-outlined-button id="a-dup">Duplicate</md-outlined-button><md-outlined-button id="a-remove" class="danger">Remove</md-outlined-button></div>
      <p class="muted">Duplicate makes a second instance on the same computer with the same version and worlds folder, its own port and fresh accounts. Remove stops it and deletes its Compose file. Worlds and data are kept unless you also choose Delete data.</p></section>
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
  const dupBtn = main.querySelector<HTMLElement & { disabled: boolean }>('#a-dup')!;
  if (i.target !== 'docker' && i.target !== 'docker-ssh') { dupBtn.disabled = true; dupBtn.title = 'Only Docker instances can be duplicated.'; }
  dupBtn.addEventListener('click', () => duplicateDialog(i));
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
      if (!ok) return;
      // Removing is destructive, so it also needs two keys and a full slide.
      void superConfirm(`Remove ${i.name}: the instance stops and its Compose file is deleted.${del ? ' Its data (accounts, history, notes) is deleted too.' : ' Its data is kept.'} Worlds are never deleted.`,
        { title: 'This cannot be taken back', key1: 'Turn the first key', key2: 'Turn the second key', keyOn: 'Key turned.', slide: 'Slide all the way to the end to go ahead', slideLocked: 'Turn both keys to unlock the slider', exit: 'Emergency exit', hint: 'Nothing happens until both keys are turned and the slider reaches the end. Emergency exit or Esc leaves at once.', done: 'Confirmed.' })
        .then((yes) => { if (yes) act('remove', del); });
    });
  });
  refresh();
}

/** Duplicate dialog: suggests a free name and port, then deploys the copy with live steps. */
async function duplicateDialog(i: Instance) {
  const sug = (await d.duplicateSuggest(i.name)) ?? { name: `${i.name}-copy`, port: i.port + 1 };
  const dlg = document.createElement('md-dialog');
  dlg.innerHTML = `<div slot="headline">Duplicate ${esc(i.name)}</div>
    <form slot="content" id="dup" method="dialog" class="stack">
      <p>The copy runs ${esc(i.version)} on ${esc(i.sshHost ?? 'this computer')} with the same worlds folder. Accounts, history and notes start fresh.</p>
      <md-outlined-text-field name="name" label="New instance name" value="${esc(sug.name)}" required supporting-text="Lower-case letters, digits and dashes"></md-outlined-text-field>
      <md-outlined-text-field name="port" label="Port" type="number" min="1024" max="65535" value="${sug.port}" required></md-outlined-text-field>
      <p id="dup-err" class="err" role="alert"></p><div id="dup-steps"></div></form>
    <div slot="actions"><md-text-button id="dup-cancel">Cancel</md-text-button><md-filled-button id="dup-go">Duplicate</md-filled-button></div>`;
  document.body.append(dlg);
  const show = dlg as HTMLElement & { show: () => void; close: () => void };
  show.show();
  dlg.addEventListener('closed', () => dlg.remove());
  dlg.querySelector('#dup-cancel')!.addEventListener('click', () => show.close());
  let busy = false;
  const go = dlg.querySelector<HTMLElement & { disabled: boolean }>('#dup-go')!;
  go.addEventListener('click', async () => {
    if (busy) return;
    busy = true; go.disabled = true;
    const val = (n: string) => (dlg.querySelector(`[name=${n}]`) as HTMLInputElement).value.trim();
    const err = dlg.querySelector('#dup-err')!; err.textContent = '';
    d.onProgress((steps: Step[]) => { const el = dlg.querySelector('#dup-steps'); if (el) el.innerHTML = stepsHtml(steps); });
    const r = await d.duplicate(i.name, { name: val('name'), port: Number(val('port')) });
    busy = false; go.disabled = false;
    if (r.error) { err.textContent = r.error; (dlg.querySelector('[name=name]') as HTMLElement).focus(); return; }
    show.close();
    toast(`${r.instance.name} is running at ${r.url}`);
    managing = r.instance.name; render();
  });
}

const gb = (n: number) => n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : `${Math.round(n / 2 ** 20)} MB`;
interface VDisk { number: number; name: string; sizeBytes: number; file: string; letters: string[]; readOnly: boolean }

/** Virtual disks: files that Windows shows as a drive. Create, attach and detach; never delete. */
async function virtualDisks(main: Element) {
  if (d.platform !== 'win32') {
    main.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">Virtual disks</h1>
      <p>A virtual disk is one file that Windows shows as a drive. It is a handy way to keep worlds in one file you can copy to another computer.</p>
      <p class="muted">This screen uses tools that come with Windows, so it works in the Windows app only. On this computer nothing here can be changed.</p></section>`;
    return;
  }
  main.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">Virtual disks</h1>
      <p class="muted">A virtual disk is one file that Windows shows as a drive. Windows asks for permission before each change. Detaching keeps the file; this screen never deletes anything.</p>
      <div class="vd-actions"><md-filled-button id="vd-new">New virtual disk…</md-filled-button><md-filled-tonal-button id="vd-attach">Attach a file…</md-filled-tonal-button><md-text-button id="vd-refresh">Refresh</md-text-button></div>
      <label class="check"><input type="checkbox" id="vd-ro"> Attach read-only</label>
      <p id="vd-status" class="muted" role="status" aria-live="polite">Loading…</p><md-list id="vd-list"></md-list></section>`;
  const status = main.querySelector('#vd-status')!, listEl = main.querySelector('#vd-list')!;
  const busy = (on: boolean) => main.querySelectorAll<HTMLElement & { disabled: boolean }>('md-filled-button, md-filled-tonal-button, md-text-button, md-outlined-button').forEach((b) => { b.disabled = on; });
  const run = async (job: unknown, working: string) => {
    busy(true); status.textContent = working;
    try { const r = await d.vdiskJob(job); toast(r.message, !r.ok); } catch (e) { toast((e as Error).message, true); }
    busy(false); await load();
  };
  async function load() {
    try {
      const disks: VDisk[] = await d.vdisks();
      status.textContent = disks.length ? `${disks.length} attached` : 'No virtual disk is attached right now.';
      listEl.innerHTML = disks.map((v, i) => `<md-list-item><div slot="headline">${esc(v.file)}</div>
        <div slot="supporting-text">${v.letters.length ? `Drive ${esc(v.letters.join(', '))}: · ` : 'No drive letter · '}${gb(v.sizeBytes)}${v.readOnly ? ' · read-only' : ''}</div>
        <md-outlined-button slot="end" data-detach="${i}">Detach</md-outlined-button></md-list-item>`).join('');
      listEl.querySelectorAll<HTMLElement>('[data-detach]').forEach((b) => b.addEventListener('click', () => run({ action: 'detach', file: disks[Number(b.dataset.detach)].file }, 'Waiting for Windows permission…')));
    } catch (e) { status.textContent = (e as Error).message; listEl.innerHTML = ''; }
  }
  main.querySelector('#vd-refresh')!.addEventListener('click', () => { status.textContent = 'Loading…'; void load(); });
  main.querySelector('#vd-attach')!.addEventListener('click', async () => {
    const file = await d.pickFile(['vhdx', 'vhd']); if (!file) return;
    await run({ action: 'attach', file, readOnly: main.querySelector<HTMLInputElement>('#vd-ro')!.checked }, 'Waiting for Windows permission…');
  });
  main.querySelector('#vd-new')!.addEventListener('click', () => {
    const dlg = document.createElement('md-dialog') as HTMLElement & { show(): void; close(): void };
    dlg.innerHTML = `<div slot="headline">New virtual disk</div><form slot="content" method="dialog" class="vd-form">
        <p class="muted">Makes a new file, formats it (NTFS) and gives it a drive letter. An existing file is never replaced.</p>
        <div class="vd-file"><md-outlined-text-field id="vd-file" label="File" readonly style="flex:1"></md-outlined-text-field><md-filled-tonal-button type="button" id="vd-pick">Choose…</md-filled-tonal-button></div>
        <md-outlined-text-field id="vd-size" label="Largest size in GB" type="number" min="1" max="2048" value="8"></md-outlined-text-field>
        <md-outlined-text-field id="vd-label" label="Drive name" value="Worlds" maxlength="32"></md-outlined-text-field>
        <label class="check"><input type="checkbox" id="vd-fixed"> Take all the space now (slower to make; otherwise the file grows as it fills)</label>
        <p id="vd-err" class="error" role="alert"></p></form>
      <div slot="actions"><md-text-button id="vd-cancel">Cancel</md-text-button><md-filled-button id="vd-go">Create</md-filled-button></div>`;
    document.body.append(dlg); dlg.show();
    const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
    dlg.addEventListener('closed', () => dlg.remove());
    q('#vd-cancel').addEventListener('click', () => dlg.close());
    q('#vd-pick').addEventListener('click', async () => { const f = await d.saveFile('worlds.vhdx', ['vhdx', 'vhd']); if (f) q<HTMLInputElement>('#vd-file').value = f; });
    q('#vd-go').addEventListener('click', async () => {
      const file = q<HTMLInputElement>('#vd-file').value, sizeGb = Number(q<HTMLInputElement>('#vd-size').value), label = q<HTMLInputElement>('#vd-label').value.trim();
      const err = !file ? 'Choose where the file goes.' : !Number.isInteger(sizeGb) || sizeGb < 1 || sizeGb > 2048 ? 'Size must be a whole number from 1 to 2048 GB.' : !/^[A-Za-z0-9 _-]{1,32}$/.test(label) ? 'The name can use letters, digits, spaces, _ and -, up to 32 characters.' : '';
      q('#vd-err').textContent = err; if (err) return;
      const fixed = q<HTMLInputElement>('#vd-fixed').checked;
      dlg.close();
      await run({ action: 'create', file, sizeMb: sizeGb * 1024, label, fixed }, 'Waiting for Windows permission, then making the disk…');
    });
  });
  await load();
}

function stepsHtml(steps: Step[]) {
  return `<ol class="stack" aria-live="polite">${steps.map((s) => `<li><strong>${esc(s.label)}</strong> · ${esc(s.state)}${s.detail ? ` <span class="muted">${esc(s.detail)}</span>` : ''}</li>`).join('')}</ol>`;
}

// Update ready banner: same wording and behaviour as the editor's; restart is never automatic.
let upd: { state: string; version?: string; notes?: string } | undefined;
let updLater = false;
let updSoonHidden = false;
function showUpdate() {
  const el = document.getElementById('update-banner');
  if (!el) return;
  // Update coming soon while the download runs; same card as the editor's.
  if (upd?.state === 'downloading' && !updSoonHidden) {
    el.hidden = false; el.classList.add('soon');
    el.innerHTML = `<span class="ub-icon" aria-hidden="true">↓</span><span class="ub-text"><b>Update coming soon</b><small>A new version of Map Editor Deploy is downloading in the background. Nothing restarts until you choose.</small><md-linear-progress indeterminate aria-label="Update coming soon"></md-linear-progress></span><md-text-button id="ub-hide">Hide</md-text-button>`;
    el.querySelector('#ub-hide')!.addEventListener('click', () => { updSoonHidden = true; showUpdate(); });
    return;
  }
  el.classList.remove('soon');
  if (upd?.state !== 'ready' || updLater) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<span class="ub-icon" aria-hidden="true">↻</span><span class="ub-text"><b>Map Editor Deploy ${esc(upd.version ?? '')} is ready to install</b><small>This update is not code-signed. It replaces this copy when you restart.</small></span>
    <a href="${esc(upd.notes ?? '')}" target="_blank" rel="noopener">Release notes</a><md-text-button id="ub-later">Later</md-text-button><md-filled-button id="ub-restart">Restart to install update</md-filled-button>`;
  el.querySelector('#ub-later')!.addEventListener('click', () => { updLater = true; showUpdate(); });
  el.querySelector('#ub-restart')!.addEventListener('click', () => d.updateRestart?.());
}
d.onUpdate?.((u: typeof upd) => { if (u?.state === 'ready') updLater = false; if (u?.state === 'downloading' && upd?.state !== 'downloading') updSoonHidden = false; upd = u; showUpdate(); });
d.updateState?.().then((u: typeof upd) => { upd = u; showUpdate(); }).catch(() => undefined);

// Guided tour of the deploy app, same coach card as the editor.
function deployTour(start = 0) {
  const toDeploy = { text: 'This part is on the Deploy view.', label: 'Show Deploy', reveal: () => { view = 'deploy'; return render(); } };
  startTour('Map Editor Deploy', [
    { target: '.grid', title: 'Choose where', body: 'Docker on this computer, Docker on another computer over SSH, VirtualBox, VMware, a USB drive, or a Raspberry Pi with Docker.', missing: toDeploy },
    { target: '#form', title: 'Fill in and deploy', body: 'Each target asks only for what it needs, shows every step while it runs, and ends with the working link or the exact error.', missing: toDeploy },
    { target: '#v-inst', title: 'Instances', body: 'Everything this app created: open, start, stop, restart, update, remove, and follow its live log.' },
    { target: '#v-disks', title: 'Virtual disks', body: 'On Windows: make a disk that lives in one file, attach one you already have, or detach it. Files are never deleted here.' },
    { target: '#v-guide', title: 'Guide', body: 'The whole guide is inside this app and opens without a network.' },
    { target: '#tour', title: 'Come back any time', body: 'Take a tour starts this walk-through again.' },
  ], { stepOf: (n, m) => currentLang() === 'yue' ? `部署導覽第 ${n} 步，共 ${m} 步` : currentLang() === 'both' ? `Step ${n} of ${m} of the deploy tour · 第 ${n} 步，共 ${m} 步` : `Step ${n} of ${m} of the deploy tour`, back: 'Back', skip: 'Skip this step', next: 'Next', done: 'Finish', close: 'Close', notHere: 'This part is not on screen right now.' }, {
    start,
    onStep: (i) => { try { localStorage.setItem('map-editor-deploy.tour', String(i)); } catch { /* ignore */ } },
    onEnd: (done) => { try { localStorage.setItem('map-editor-deploy.tour', done ? 'done' : localStorage.getItem('map-editor-deploy.tour') ?? '0'); } catch { /* ignore */ } },
  });
}

async function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = `<header class="top"><div class="brand"><div class="logo" aria-hidden="true"></div><div>
      <div class="md-typescale-headline-medium title">Put Map Editor on your network</div>
      <div class="muted" id="prov"></div></div></div>
    <md-chip-set class="views"><md-filter-chip id="v-deploy" label="Deploy" ${view === 'deploy' ? 'selected' : ''}></md-filter-chip><md-filter-chip id="v-inst" label="Instances" ${view === 'instances' ? 'selected' : ''}></md-filter-chip><md-filter-chip id="v-disks" label="Virtual disks" ${view === 'disks' ? 'selected' : ''}></md-filter-chip><md-filter-chip id="v-guide" label="Guide" ${view === 'guide' ? 'selected' : ''}></md-filter-chip></md-chip-set><md-text-button id="tour">Take a tour</md-text-button><button type="button" id="cmd" class="icon-btn" aria-label="Find commands (Ctrl+Shift+F)" title="Find commands (Ctrl+Shift+F)" aria-keyshortcuts="Control+Shift+F">${iconSvg('search', 20)}</button>${langSwitch()}<button type="button" id="snd" class="icon-btn" aria-pressed="${soundsOn}" aria-label="Sound effects" title="Sound effects">${iconSvg('sound', 20)}</button></header>
    <div id="update-banner" class="update-banner" role="region" aria-label="Update" hidden></div>
    <div class="body"><main class="view" id="main"></main></div><div id="toasts" class="toasts"></div>`;
  showUpdate();
  // Front-screen provenance: the version and when this build was made.
  d.buildInfo?.().then((b: { version: string; commit: string; builtAt: string | null }) => { const el = app.querySelector('#prov'); if (el) el.textContent = `Version ${b.version} · updated ${b.builtAt ? new Date(b.builtAt).toLocaleString('en-GB', { timeZoneName: 'short' }) : 'unavailable'} · ${String(b.commit).slice(0, 7)}`; }).catch(() => undefined);
  app.querySelector('#v-deploy')!.addEventListener('click', () => { view = 'deploy'; render(); });
  app.querySelector('#v-inst')!.addEventListener('click', () => { view = 'instances'; render(); });
  app.querySelector('#v-disks')!.addEventListener('click', () => { view = 'disks'; render(); });
  app.querySelector('#v-guide')!.addEventListener('click', () => { view = 'guide'; render(); });
  app.querySelector('#tour')!.addEventListener('click', () => deployTour());
  const main = app.querySelector('#main')!;
  if (!obState().done) return onboarding(main);
  if (view === 'disks') return virtualDisks(main);
  if (view === 'guide') { // the same bundled guide as the editor, opened on this app's own article first
    if (!guideOpened) { openDoc('deploy-app'); guideOpened = true; }
    main.classList.add('guide-view');
    docsView(main as HTMLElement, { lang: currentLang(), tx: paletteText, esc, rx: (k, v) => paletteText(k, v) });
    const report = document.createElement('md-outlined-button'); report.id = 'desk-open-btn'; report.textContent = 'Report a problem'; report.style.marginBlockStart = '12px';
    report.addEventListener('click', () => { void supportDesk(); });
    main.querySelector('.docs-nav')?.append(report);
    return;
  }
  if (view === 'instances') {
    const list: Instance[] = await d.instances();
    if (managing && list.some((i) => i.name === managing)) return manage(main, list.find((i) => i.name === managing)!);
    managing = undefined;
    main.innerHTML = `<section class="card"><h1 class="md-typescale-display-small">${list.length} ${list.length === 1 ? 'instance' : 'instances'}</h1>
      <p class="muted">Only instances this app created are listed.</p>
      ${list.length ? `<div class="h-selbar" id="inst-bar" role="toolbar" aria-label="Select"><b id="inst-count" role="status"></b><md-text-button id="inst-all">Select all</md-text-button><md-text-button id="inst-inv">Invert</md-text-button><md-outlined-button data-bulk="start" disabled>Start selected</md-outlined-button><md-outlined-button data-bulk="stop" disabled>Stop selected</md-outlined-button><md-outlined-button data-bulk="restart" disabled>Restart selected</md-outlined-button></div><p class="muted" id="inst-report" role="status" hidden></p>
      <md-list>${list.map((i) => `<md-list-item><input type="checkbox" slot="start" class="h-pick" data-pick="${esc(i.name)}" aria-label="Select ${esc(i.name)}"><div slot="headline">${esc(i.name)} · ${esc(i.target)} · ${esc(i.version)}</div>
        <div slot="supporting-text">http://${esc(i.host)}:${i.port}/ · <span data-state="${esc(i.name)}">checking…</span></div>
        <md-filled-tonal-button slot="end" data-manage="${esc(i.name)}">Manage</md-filled-tonal-button></md-list-item>`).join('')}</md-list>` : '<p>Deploy one from the Deploy view and it appears here.</p>'}</section>
      <section class="card activity"><h2 class="md-typescale-headline-small">Activity</h2><p class="muted">Every deploy, duplicate, drive write and instance action from this app, kept in a local Git history on this computer.</p><ol class="act-list" id="act-list"><li>Loading…</li></ol></section>`;
    d.activity?.().then((events: Array<{ time: number; message: string; who: string; sha?: string }>) => {
      const ol = main.querySelector('#act-list'); if (!ol) return;
      ol.innerHTML = events.length ? events.map((e) => `<li><span class="act-kind">${/failed/.test(e.message) ? 'Failed' : 'Done'}</span><span class="act-text"><b>${esc(e.message)}</b><small>${esc(e.who)} · ${esc(new Date(e.time * 1000).toLocaleString('en-GB'))}${e.sha ? ` · <code>${esc(e.sha.slice(0, 7))}</code>` : ''}</small></span></li>`).join('') : '<li>Nothing yet.</li>';
    }).catch(() => undefined);
    main.querySelectorAll<HTMLElement>('[data-manage]').forEach((b) => b.addEventListener('click', () => { managing = b.dataset.manage; render(); }));
    if (list.length) main.querySelector('section.card h1')!.after(exportButton('Export…', { csv: 'CSV (spreadsheets)', json: 'JSON', md: 'Markdown', html: 'HTML table' }, (f) => downloadRows(
      list.map((i) => ({ name: i.name, target: i.target, version: i.version, link: `http://${i.host}:${i.port}/`, sshHost: i.sshHost ?? '' })), ['name', 'target', 'version', 'link', 'sshHost'], f, 'Map Editor instances', 'map-editor-instances')));
    const paintStates = () => { for (const i of list) d.state(i.name).then((st: string) => { const el = main.querySelector(`[data-state="${CSS.escape(i.name)}"]`); if (el) el.textContent = STATE_LABEL[st] ?? st; }); };
    paintStates();
    // Selection: start, stop or restart several instances in one go. Removing stays one at a time, behind its own confirmation.
    const boxes = Array.from(main.querySelectorAll<HTMLInputElement>('.h-pick'));
    if (boxes.length) {
      const picked = new Set<number>(); let anchor: number | undefined;
      const paint = () => {
        boxes.forEach((b, k) => { b.checked = picked.has(k); });
        main.querySelector('#inst-count')!.textContent = by(`${picked.size} of ${list.length} selected`, `揀咗 ${picked.size} 個，共 ${list.length} 個`);
        main.querySelectorAll('[data-bulk]').forEach((b) => b.toggleAttribute('disabled', !picked.size));
      };
      boxes.forEach((b, k) => b.addEventListener('click', (ev) => { ev.stopPropagation(); anchor = pickItem(picked, k, anchor, ev.shiftKey); paint(); }));
      main.querySelector('#inst-all')!.addEventListener('click', () => { selectAll(picked, list.length); paint(); });
      main.querySelector('#inst-inv')!.addEventListener('click', () => { invert(picked, list.length); paint(); });
      main.querySelectorAll<HTMLElement>('[data-bulk]').forEach((btn) => btn.addEventListener('click', async () => {
        const action = btn.dataset.bulk!, chosen = [...picked].sort((x, y) => x - y).map((k) => list[k]);
        if (!chosen.length) return;
        main.querySelectorAll('[data-bulk]').forEach((b) => b.setAttribute('disabled', ''));
        const failed: string[] = []; let ok = 0;
        for (const i of chosen) { try { const r = await d.action(i.name, action, false); if (r.ok) ok++; else failed.push(`${i.name}: ${r.message}`); } catch (e) { failed.push(`${i.name}: ${(e as Error).message}`); } }
        const report = main.querySelector<HTMLElement>('#inst-report');
        const text = by(`${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted'} ${ok} of ${chosen.length}.${failed.length ? ` Not done: ${failed.join('; ')}` : ''}`,
          `${action === 'start' ? '啟動' : action === 'stop' ? '停止' : '重新啟動'}咗 ${ok} 個，共 ${chosen.length} 個。${failed.length ? `未搞掂：${failed.join('；')}` : ''}`);
        if (report) { report.hidden = false; report.textContent = text; }
        toast(text, failed.length > 0); paintStates(); paint();
      }));
      paint();
    }
    return;
  }
  main.innerHTML = `<div class="editor"><section class="grid" style="flex: 999 1 560px; align-self: flex-start">${TARGETS.map((t) => `<button class="world" data-t="${t.id}" aria-pressed="${t.id === target}" style="${t.id === target ? 'background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary)' : ''}"><span class="target-badge" aria-hidden="true">${iconSvg(TARGET_ICONS[t.id] ?? 'next', 26)}</span><span class="md-typescale-title-large">${esc(t.name)}</span><span>${esc(t.desc)}</span></button>`).join('')}</section>
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
    let worlds = savedWorlds();
    if (worlds) form.querySelector('#wpath')!.textContent = worlds;
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
      ${target === 'pi' ? '<div class="row-actions"><md-filled-button id="to-usb">Write the Pi image to an SD card</md-filled-button><md-filled-tonal-button id="to-ssh">Use Docker on another computer</md-filled-tonal-button></div><p class="muted">The Pi image is built for Pi 4 and Pi 5 and checked for its firmware, kernel and device trees, but it has not been boot-tested on a Pi yet.</p>' : ''}`;
    form.querySelector('#to-ssh')?.addEventListener('click', () => { target = 'ssh'; render(); });
    form.querySelector('#to-usb')?.addEventListener('click', () => { target = 'usb'; render(); });
  }
}

function toast(text: string, error = false) {
  play(error ? 'error' : 'success');
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`; el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(text)}</span>`;
  const x = document.createElement('md-text-button'); x.textContent = 'Close'; x.addEventListener('click', () => el.remove()); el.append(x);
  document.getElementById('toasts')!.prepend(el);
  if (!error) setTimeout(() => el.remove(), 8000);
}

// Full-screen takeovers from the Takeover board (shared with the editor).
function celebrate(url: string, inst: Instance, tookMs = 0) {
  const where = inst.target === 'docker' ? 'in Docker on this computer' : inst.target === 'docker-ssh' ? `in Docker on ${inst.sshHost ?? inst.host}` : inst.target === 'vmware' ? 'in VMware' : 'in VirtualBox';
  showTakeover({ kind: 'ok', chip: 'Installed', title: 'It is live.', lead: `${inst.name} is running ${where} and answered its health check. The first person to open the link creates the owner account, so open it yourself first.`,
    stats: [{ label: 'Link', value: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), code: true }, { label: 'Version', value: inst.version }, { label: 'Took', value: `${Math.max(1, Math.round(tookMs / 1000))} s` }],
    actions: [{ label: 'Open Map Editor', primary: true, run: () => d.open(url) }, { label: 'Copy link', outlined: true, run: () => { void navigator.clipboard?.writeText(url).then(() => toast('Link copied.')); } }, { label: 'Close (Esc)', run: (close) => close() }],
    autoClose: { seconds: 8, text: (n) => `Closes by itself in ${n} s.`, held: 'Stays open while you use it.' } });
}

function failTakeover(o: { what: string; error: string; steps: Step[]; retry: { label: string; run: () => void } }) {
  const log = [...o.steps.map((s) => `${s.state === 'failed' ? '✗' : s.state === 'done' ? '✓' : '·'} ${s.label}${s.detail ? ` — ${s.detail}` : ''}`), '', o.error, `at ${new Date().toLocaleTimeString('en-GB')}`].join('\n').trim();
  showTakeover({ kind: 'fail', chip: 'Install failed · stays until you close it', title: 'That did not work.', lead: `${o.what} Nothing else on this computer was changed.`, log, logLabel: 'What happened',
    actions: [{ label: o.retry.label, primary: true, run: (close) => { close(); o.retry.run(); } }, { label: 'Copy details', outlined: true, run: () => { void navigator.clipboard?.writeText(log).then(() => toast('Details copied.')); } }, { label: 'Dismiss (Esc)', run: (close) => close() }] });
}

enableClearControls((field) => `Clear ${field}`);
initButtonIcons(englishOf);
initLang();
let soundsOn = true; try { soundsOn = localStorage.getItem('map-editor-deploy.sounds') !== 'off'; } catch { /* default on */ }
configureSounds(soundsOn, 0.4);
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-set-lang], #snd');
  if (t?.dataset.setLang) setLang(t.dataset.setLang as Lang);
  else if (t?.id === 'snd') { soundsOn = !soundsOn; configureSounds(soundsOn, 0.4); try { localStorage.setItem('map-editor-deploy.sounds', soundsOn ? 'on' : 'off'); } catch { /* not kept */ } t.setAttribute('aria-pressed', String(soundsOn)); if (soundsOn) play('success'); }
});
// ---------- First run: three short steps that each do something real ----------
const OB_KEY = 'map-editor-deploy.onboarding';
const savedWorlds = () => { try { return localStorage.getItem('map-editor-deploy.worlds') ?? ''; } catch { return ''; } };
const obState = (): { step: number; done: boolean } => { try { const v = JSON.parse(localStorage.getItem(OB_KEY) ?? ''); return { step: Math.max(0, Math.min(2, Number(v.step) || 0)), done: Boolean(v.done) }; } catch { return { step: 0, done: false }; } };
const obSave = (v: { step: number; done: boolean }) => { try { localStorage.setItem(OB_KEY, JSON.stringify(v)); } catch { /* not kept */ } };
function onboarding(main: Element) {
  const st = obState();
  const names = ['Language and sound', 'Check this computer', 'Worlds folder'];
  main.innerHTML = `<section class="card ob" aria-labelledby="ob-h"><p class="muted" id="ob-count">Step ${st.step + 1} of 3</p>
    <ol class="ob-steps">${names.map((n, i) => `<li class="${i === st.step ? 'on' : i < st.step ? 'past' : ''}"${i === st.step ? ' aria-current="step"' : ''}><span>${i + 1}</span>${n}</li>`).join('')}</ol>
    <div id="ob-body"></div>
    <div class="row-actions ob-nav"><md-text-button id="ob-back" ${st.step === 0 ? 'disabled' : ''}>Back</md-text-button><md-text-button id="ob-skip">Skip setup</md-text-button><span style="flex:1"></span><md-filled-button id="ob-next">${st.step === 2 ? 'Finish' : 'Next'}</md-filled-button></div>
    <p class="muted">Progress is saved. You can close the app and carry on later.</p></section>`;
  const body = main.querySelector('#ob-body')!;
  if (st.step === 0) {
    body.innerHTML = `<h1 id="ob-h" class="md-typescale-display-small">Welcome to Map Editor Deploy</h1><p>Choose how this app talks to you. You can change both later from the top bar.</p>${langSwitch()}
      <p><label class="check"><input type="checkbox" id="ob-snd" ${soundsOn ? 'checked' : ''}> Play a short sound when something finishes or fails</label></p>`;
    body.querySelector('#ob-snd')!.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).checked !== soundsOn) document.querySelector<HTMLElement>('#snd')?.click(); });
  } else if (st.step === 1) {
    body.innerHTML = `<h1 id="ob-h" class="md-typescale-display-small">Check this computer</h1><p>This looks for the tools each deploy target needs. Nothing is installed or changed.</p>
      <md-filled-tonal-button id="ob-check">Check now</md-filled-tonal-button><ul class="ob-results" id="ob-results" role="status" aria-live="polite"></ul>`;
    const check = async () => {
      const list = body.querySelector('#ob-results')!; list.innerHTML = '<li class="muted">Checking…</li>';
      try {
        const res: Array<{ name: string; ok: boolean; detail: string }> = await d.preflight();
        list.innerHTML = res.map((r) => `<li class="${r.ok ? 'ok' : 'no'}"><b>${esc(r.name)}</b><span class="pill-state">${r.ok ? 'Found' : 'Not found'}</span><small>${esc(r.detail)}</small></li>`).join('') + '<li><b>USB drive and Raspberry Pi</b><span class="pill-state">Ready</span><small>These only need the appliance image file, which you choose when you deploy.</small></li>';
      } catch (e) { list.innerHTML = `<li class="no"><b>The check could not run</b><small>${esc((e as Error).message)}</small></li>`; }
    };
    body.querySelector('#ob-check')!.addEventListener('click', () => void check());
    void check();
  } else {
    const w = savedWorlds();
    body.innerHTML = `<h1 id="ob-h" class="md-typescale-display-small">Worlds folder</h1><p>Choose the folder that holds your Minecraft worlds. Deploy will offer it every time, so you only pick it once. This step is optional.</p>
      <div class="row-actions"><md-filled-tonal-button id="ob-pick">Choose worlds folder</md-filled-tonal-button><md-text-button id="ob-clear">Forget this folder</md-text-button></div><p id="ob-w" role="status" aria-live="polite"><code>${esc(w || 'No folder chosen')}</code></p>`;
    const show = (v: string) => { body.querySelector('#ob-w')!.innerHTML = `<code>${esc(v || 'No folder chosen')}</code>`; };
    body.querySelector('#ob-pick')!.addEventListener('click', async () => { const f = await d.pickFolder(); if (!f) return; try { localStorage.setItem('map-editor-deploy.worlds', f); } catch { /* not kept */ } show(f); toast('Worlds folder saved.'); });
    body.querySelector('#ob-clear')!.addEventListener('click', () => { try { localStorage.removeItem('map-editor-deploy.worlds'); } catch { /* nothing kept */ } show(''); });
  }
  const move = (step: number, done = false) => { obSave({ step: Math.max(0, Math.min(2, step)), done }); void render(); };
  main.querySelector('#ob-back')!.addEventListener('click', () => move(st.step - 1));
  main.querySelector('#ob-skip')!.addEventListener('click', () => move(st.step, true));
  main.querySelector('#ob-next')!.addEventListener('click', () => (st.step === 2 ? move(2, true) : move(st.step + 1)));
  body.querySelector<HTMLElement>('h1')?.setAttribute('tabindex', '-1'); body.querySelector<HTMLElement>('h1')?.focus();
}

// Command palette (Ctrl+Shift+F): every view, target and switch of this app, with live toggles.
function deployCommands(): Command[] {
  const go = (v: typeof view) => () => { view = v; void render(); };
  return [
    { id: 'v-deploy', label: 'Deploy', where: 'Views', run: go('deploy'), goto: go('deploy') },
    { id: 'v-inst', label: 'Instances', where: 'Views', run: go('instances'), goto: go('instances') },
    { id: 'v-disks', label: 'Virtual disks', where: 'Views', run: go('disks'), goto: go('disks') },
    { id: 'v-guide', label: 'Guide', where: 'Views', run: go('guide'), goto: go('guide') },
    ...ARTICLES.map((a) => ({ id: `doc-${a.slug}`, label: `Guide: ${docTitle(a, currentLang())}`, where: 'Guide', run: () => { openDoc(a.slug); guideOpened = true; view = 'guide'; void render(); } })),
    ...TARGETS.map((x) => ({ id: `t-${x.id}`, label: `Deploy to: ${x.name}`, where: 'Targets', run: () => { view = 'deploy'; target = x.id; void render(); } })),
    { id: 'tour', label: 'Take a tour', where: 'Help', run: () => deployTour() },
    { id: 'support', label: 'Report a problem', where: 'Help', run: () => { void supportDesk(); } },
    { id: 'setup', label: 'Run first-time setup again', where: 'Help', run: () => { obSave({ step: 0, done: false }); void render(); } },
    { id: 'snd', label: 'Sound effects', where: 'Settings, live', toggle: { get: () => soundsOn, set: (v) => { if (v !== soundsOn) document.querySelector<HTMLElement>('#snd')?.click(); } } },
    ...(['en', 'yue', 'both'] as const).map((l) => ({ id: `lang-${l}`, label: `Language: ${l === 'en' ? 'English' : l === 'yue' ? '粵語' : 'English + 粵語'}`, where: 'Settings', run: () => setLang(l) })),
  ];
}
const paletteText = (k: string, v?: Record<string, string | number>) => tr({ lang: currentLang(), funnyEn: 1, funnyYue: 1 }, k as Key, v);
const showPalette = () => openPalette(deployCommands, { title: paletteText('palette'), hint: paletteText('paletteHint'), none: paletteText('noMatches') }, paletteText);
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); showPalette(); } });
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('#cmd')) showPalette(); });
render().then(() => { let t: string | null = null; try { t = localStorage.getItem('map-editor-deploy.tour'); } catch { /* ignore */ } if (t === null && obState().done) setTimeout(() => deployTour(), 800); });
