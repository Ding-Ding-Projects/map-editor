// Support desk: write up a problem, see exactly what will be attached, keep it on this device, and
// copy it or open it as a new issue on the project page. Nothing is sent by the app itself.

export interface TicketContext { version: string; commit: string; codeName?: string; language: string; screen: string; window: string; browser: string; world?: string }
export interface Ticket { id: string; time: string; title: string; details: string; context: TicketContext }

const KEY = 'map-editor.tickets.v1';
export const ISSUES_URL = 'https://github.com/Ding-Ding-Projects/map-editor/issues/new';
const MAX_URL_BODY = 5000;

export function loadTickets(): Ticket[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string').slice(0, 100) : []; } catch { return []; }
}
export function saveTickets(list: Ticket[]): void { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch { /* not kept */ } }

/** The lines that are attached to every ticket, as [label, value]. This is the whole list: nothing else is added. */
export function contextLines(c: TicketContext): Array<[string, string]> {
  return ([['Version', c.version], ['Build', c.commit.slice(0, 12)], ['Code name', c.codeName ?? ''], ['Language', c.language], ['Screen', c.screen], ['Window', c.window], ['Browser', c.browser], ['World edition', c.world ?? '']] as Array<[string, string]>).filter(([, v]) => v);
}

/** The ticket as Markdown, ready to paste into an issue. */
export function ticketText(t: Ticket): string {
  return [`### What happened`, '', t.details.trim() || '(not filled in)', '', '### About this copy', '', ...contextLines(t.context).map(([k, v]) => `- ${k}: ${v}`), '', `Written ${t.time}`].join('\n');
}

/** A link that opens the project's new-issue page with the ticket filled in. Long text is cut, and says so. */
export function issueUrl(t: Ticket): string {
  let body = ticketText(t);
  if (body.length > MAX_URL_BODY) body = `${body.slice(0, MAX_URL_BODY)}\n\n(cut here: paste the rest from the copied ticket)`;
  return `${ISSUES_URL}?title=${encodeURIComponent(t.title.trim().slice(0, 200))}&body=${encodeURIComponent(body)}`;
}

interface Desk { context: () => TicketContext; tx: (k: string, v?: Record<string, string | number>) => string; esc: (s: unknown) => string; notify: (text: string, error?: boolean) => void; confirm: (text: string, ok: string) => Promise<boolean> }

export function openSupportDesk(d: Desk): void {
  document.querySelector('.support-desk')?.remove();
  const { tx, esc } = d;
  const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; close: () => void };
  dlg.className = 'support-desk';
  const ctx = d.context();
  dlg.innerHTML = `<div slot="headline">${esc(tx('deskTitle'))}</div>
    <form slot="content" id="desk-form" method="dialog">
      <p class="muted">${esc(tx('deskLead'))}</p>
      <md-outlined-text-field name="title" label="${esc(tx('deskSubject'))}" maxlength="120" required></md-outlined-text-field>
      <md-outlined-text-field name="details" type="textarea" rows="5" label="${esc(tx('deskDetails'))}" maxlength="4000"></md-outlined-text-field>
      <details class="desk-attached" open><summary>${esc(tx('deskAttached'))}</summary><ul>${contextLines(ctx).map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join('')}</ul><p class="muted">${esc(tx('deskDisclosure'))}</p></details>
      <div class="row-actions"><md-filled-button id="desk-save" type="button">${esc(tx('deskSave'))}</md-filled-button><md-outlined-button id="desk-copy" type="button">${esc(tx('deskCopy'))}</md-outlined-button><md-outlined-button id="desk-open" type="button">${esc(tx('deskOpenIssue'))}</md-outlined-button></div>
      <h3>${esc(tx('deskSaved'))}</h3><ol class="desk-list" id="desk-list"></ol>
    </form>
    <div slot="actions"><md-text-button form="desk-form" value="close">${esc(tx('close'))}</md-text-button></div>`;
  document.body.append(dlg);
  const field = (n: string) => dlg.querySelector(`[name=${n}]`) as HTMLInputElement;
  const draft = (): Ticket | undefined => {
    const title = field('title').value.trim();
    if (!title) { d.notify(tx('deskNeedSubject'), true); field('title').focus(); return undefined; }
    return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, time: new Date().toISOString(), title, details: field('details').value, context: d.context() };
  };
  const copy = (t: Ticket) => { void navigator.clipboard?.writeText(`${t.title}\n\n${ticketText(t)}`).then(() => d.notify(tx('copied')), () => d.notify(tx('copyFailed'), true)); };
  const open = (t: Ticket) => { window.open(issueUrl(t), '_blank', 'noopener,noreferrer'); };
  const list = dlg.querySelector<HTMLElement>('#desk-list')!;
  const draw = () => {
    const all = loadTickets();
    list.innerHTML = all.length ? all.map((t, i) => `<li><span class="desk-text"><b>${esc(t.title)}</b><small>${esc(new Date(t.time).toLocaleString('en-GB'))} · ${esc(t.context?.version ?? '')}</small></span>
      <md-text-button type="button" data-copy="${i}">${esc(tx('deskCopy'))}</md-text-button><md-text-button type="button" data-open="${i}">${esc(tx('deskOpenIssue'))}</md-text-button><md-text-button type="button" data-drop="${i}">${esc(tx('deskDelete'))}</md-text-button></li>`).join('') : `<li class="muted">${esc(tx('deskNone'))}</li>`;
    list.querySelectorAll<HTMLElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(all[Number(b.dataset.copy)])));
    list.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.addEventListener('click', () => open(all[Number(b.dataset.open)])));
    list.querySelectorAll<HTMLElement>('[data-drop]').forEach((b) => b.addEventListener('click', async () => {
      const t = all[Number(b.dataset.drop)];
      if (!await d.confirm(tx('deskDeleteAsk', { title: t.title }), tx('deskDelete'))) return;
      saveTickets(loadTickets().filter((x) => x.id !== t.id)); draw();
    }));
  };
  dlg.querySelector('#desk-save')!.addEventListener('click', () => { const t = draft(); if (!t) return; saveTickets([t, ...loadTickets()]); field('title').value = ''; field('details').value = ''; d.notify(tx('deskSavedMsg')); draw(); });
  dlg.querySelector('#desk-copy')!.addEventListener('click', () => { const t = draft(); if (t) copy(t); });
  dlg.querySelector('#desk-open')!.addEventListener('click', () => { const t = draft(); if (t) open(t); });
  dlg.addEventListener('closed', () => dlg.remove());
  draw();
  dlg.show();
}
