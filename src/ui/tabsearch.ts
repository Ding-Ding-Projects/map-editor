// Tab search: find any of the app's tabs (open or closed) and close tabs by text.
// "Close tabs containing text" and "Close tabs not containing text" share one predicate, show a
// preview with a count, refuse an empty or invalid query, keep at least one tab, and never close
// the editor while an edit is running.
import { searchBox, type RegexText } from './regex.js';

export interface TabInfo { id: string; label: string; open: boolean; active: boolean; busy?: boolean }
export interface TabSearchDeps {
  tabs: () => TabInfo[];
  go: (id: string) => void;
  close: (ids: string[]) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  rx: RegexText;
  esc: (s: unknown) => string;
}

/** Which tabs a bulk close would close, and which it keeps and why. Pure, so it is unit tested. */
export function planClose(tabs: TabInfo[], hits: boolean[], mode: 'containing' | 'not-containing'): { close: string[]; kept: Array<{ id: string; why: 'busy' | 'last' }> } {
  const want = tabs.filter((tab, i) => tab.open && (mode === 'containing' ? hits[i] : !hits[i]));
  const kept: Array<{ id: string; why: 'busy' | 'last' }> = [];
  let close = want.filter((tab) => { if (tab.busy) { kept.push({ id: tab.id, why: 'busy' }); return false; } return true; }).map((tab) => tab.id);
  const openCount = tabs.filter((tab) => tab.open).length;
  if (close.length >= openCount) {
    // Keep one tab open: the active one if it was going to close, otherwise the first.
    const keep = close.includes(tabs.find((tab) => tab.active)?.id ?? '') ? tabs.find((tab) => tab.active)!.id : close[0];
    close = close.filter((id) => id !== keep);
    kept.push({ id: keep, why: 'last' });
  }
  return { close, kept };
}

export function showTabSearch(d: TabSearchDeps) {
  document.querySelector('.tab-search')?.remove();
  const dlg = document.createElement('md-dialog') as HTMLElement & { show: () => void; close: () => void };
  dlg.className = 'tab-search';
  dlg.innerHTML = `<div slot="headline">${d.esc(d.t('tabSearch'))}</div>
    <div slot="content" class="stack">
      <div id="ts-host"></div>
      <p class="muted" id="ts-count" aria-live="polite"></p>
      <div class="row-actions ts-bulk" role="group" aria-label="${d.esc(d.t('tabBulk'))}">
        <md-outlined-button id="ts-close-in" disabled></md-outlined-button>
        <md-outlined-button id="ts-close-out" disabled></md-outlined-button>
      </div>
      <p class="ts-preview" id="ts-preview" aria-live="polite"></p>
      <ul class="ts-list" role="list"></ul>
    </div>
    <div slot="actions"><md-text-button id="ts-done">${d.esc(d.t('close'))}</md-text-button></div>`;
  document.body.append(dlg);
  const box = searchBox('tab-search', d.t('searchTabs'), d.rx);
  dlg.querySelector('#ts-host')!.replaceWith(box.el);
  const list = dlg.querySelector<HTMLElement>('.ts-list')!;
  const btnIn = dlg.querySelector<HTMLElement & { disabled: boolean }>('#ts-close-in')!;
  const btnOut = dlg.querySelector<HTMLElement & { disabled: boolean }>('#ts-close-out')!;
  const preview = dlg.querySelector<HTMLElement>('#ts-preview')!;
  let hits: boolean[] = [];
  let tabs = d.tabs();
  const label = (id: string) => tabs.find((x) => x.id === id)?.label ?? id;
  const draw = async () => {
    tabs = d.tabs();
    const q = box.query().trim();
    const res = q ? await box.filter(tabs.map((x) => `${x.label} ${x.id}`)) : tabs.map(() => true);
    const valid = res !== null;
    hits = res ?? tabs.map(() => false);
    list.innerHTML = tabs.map((x, i) => `<li ${hits[i] ? '' : 'hidden'}><button type="button" data-go="${d.esc(x.id)}" class="ts-row${x.active ? ' active' : ''}">
        <b>${d.esc(x.label)}</b><small>${d.esc([x.active ? d.t('tabActive') : x.open ? d.t('tabOpen') : d.t('tabClosed'), x.busy ? d.t('tabBusy') : ''].filter(Boolean).join(' · '))}</small></button></li>`).join('');
    list.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => { dlg.close(); d.go(b.dataset.go!); }));
    const shown = hits.filter(Boolean).length;
    dlg.querySelector('#ts-count')!.textContent = d.t('tabCount', { n: shown, m: tabs.length });
    const inPlan = planClose(tabs, hits, 'containing');
    const outPlan = planClose(tabs, hits, 'not-containing');
    const usable = Boolean(q) && valid;
    btnIn.textContent = d.t('closeContaining', { n: usable ? inPlan.close.length : 0 });
    btnOut.textContent = d.t('closeNotContaining', { n: usable ? outPlan.close.length : 0 });
    btnIn.disabled = !usable || inPlan.close.length === 0;
    btnOut.disabled = !usable || outPlan.close.length === 0;
    preview.textContent = !q ? d.t('tabNeedQuery') : !valid ? d.t('tabBadQuery') : '';
    btnIn.onmouseenter = btnIn.onfocus = () => { preview.textContent = describe(inPlan); };
    btnOut.onmouseenter = btnOut.onfocus = () => { preview.textContent = describe(outPlan); };
    btnIn.onclick = () => run(inPlan);
    btnOut.onclick = () => run(outPlan);
  };
  const describe = (p: ReturnType<typeof planClose>) => [
    p.close.length ? d.t('tabWillClose', { list: p.close.map(label).join(', ') }) : d.t('tabNothing'),
    ...p.kept.map((k) => d.t(k.why === 'busy' ? 'tabKeptBusy' : 'tabKeptLast', { tab: label(k.id) })),
  ].join(' ');
  const run = (p: ReturnType<typeof planClose>) => {
    if (!p.close.length) return;
    d.close(p.close);
    const n = p.close.length;
    void draw().then(() => { preview.textContent = n === 1 ? d.t('tabClosed1') : d.t('tabClosedN', { n }); });
  };
  box.onChange(() => { void draw(); });
  dlg.querySelector('#ts-done')!.addEventListener('click', () => dlg.close());
  dlg.addEventListener('closed', () => dlg.remove());
  dlg.show();
  void draw().then(() => box.input.focus());
}
