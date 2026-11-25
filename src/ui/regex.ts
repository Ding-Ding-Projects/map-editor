// Search field with its own anchored regex builder. Plain text is the default; the .* switch turns
// regex on for this field only. Query, raw pattern, flags, validation and mode stay in sync in both
// directions, nothing is saved, and every pattern runs in a worker that is replaced after 250 ms.
import { FLAGS, LIMITS, plainHits, type RegexRequest, type RegexResult } from './regex-core.js';
import { clearButton } from './clearable.js';

export type RegexText = (k: RegexKey, v?: Record<string, string | number>) => string;
export type RegexKey =
  | 'rxToggle' | 'rxBuilder' | 'rxPattern' | 'rxFlags' | 'rxSample' | 'rxEngine' | 'rxInvalid' | 'rxTimeout' | 'rxLimit'
  | 'rxMatches' | 'rxNoMatch' | 'rxTruncated' | 'rxCopy' | 'rxExport' | 'rxCopied' | 'rxGroups' | 'rxInsert' | 'rxLiteral'
  | 'rxFlagI' | 'rxFlagM' | 'rxFlagS' | 'rxFlagU' | 'rxClose' | 'clearField';

// ---- worker-backed evaluation ----
let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, (r: RegexResult | { status: 'timeout' }) => void>();
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./regex-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<RegexResult & { id: number }>) => { const done = pending.get(e.data.id); pending.delete(e.data.id); done?.(e.data); };
  }
  return worker;
}
export type EvalResult = RegexResult | { status: 'timeout' };
export function runRegex(req: RegexRequest): Promise<EvalResult> {
  return new Promise((resolve) => {
    const id = nextId++;
    const w = getWorker();
    const timer = setTimeout(() => {
      // Kill the stuck worker; every request still in flight on it fails as a timeout too.
      w.terminate(); if (worker === w) worker = undefined;
      for (const [pid, done] of pending) { pending.delete(pid); done({ status: 'timeout' }); }
    }, LIMITS.timeoutMs);
    pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
    w.postMessage({ id, ...req });
  });
}

export interface SearchBox {
  el: HTMLElement;
  input: HTMLInputElement;
  /** Which texts match the current query; null when the regex cannot run (the state is shown in the field). */
  filter(texts: string[]): Promise<boolean[] | null>;
  query(): string;
  onChange(cb: () => void): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const TOKENS: Array<[string, string]> = [['\\d', 'digit'], ['\\w', 'word'], ['\\s', 'space'], ['.', 'any'], ['[a-z]', 'set'], ['[^ ]', 'not'], ['^', 'start'], ['$', 'end'], ['\\b', 'edge'],
  ['(…)', 'group'], ['(?<name>…)', 'named'], ['(?:…)', 'plain'], ['|', 'or'], ['*', '0+'], ['+', '1+'], ['?', '0–1'], ['{2,4}', '2–4'], ['*?', 'lazy']];

let boxes = 0;
/**
 * @param id    stable id for this field (used for element ids and the search-surface catalogue)
 * @param label visible label of the field
 */
export function searchBox(id: string, label: string, t: RegexText, opts: { compact?: boolean } = {}): SearchBox {
  const n = ++boxes;
  const el = document.createElement('div');
  el.className = `search-box${opts.compact ? ' compact' : ''}`;
  el.dataset.search = id;
  el.innerHTML = `<div class="sb-row">
      <label class="sb-field"><span class="sb-label">${esc(label)}</span><input id="${id}" type="search" autocomplete="off" spellcheck="false" aria-describedby="sb-state-${n}"></label>
      <button type="button" class="sb-rx" aria-pressed="false" title="${esc(t('rxToggle'))}" aria-label="${esc(t('rxToggle'))}">.*</button>
      <button type="button" class="sb-open" aria-expanded="false" aria-controls="sb-panel-${n}" aria-label="${esc(t('rxBuilder'))}" title="${esc(t('rxBuilder'))}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/></svg></button>
    </div>
    <p class="sb-state" id="sb-state-${n}" aria-live="polite"></p>
    <section class="sb-panel" id="sb-panel-${n}" hidden aria-label="${esc(t('rxBuilder'))}">
      <p class="sb-engine">${esc(t('rxEngine', { pattern: LIMITS.pattern, sample: LIMITS.sample, ms: LIMITS.timeoutMs, matches: LIMITS.matches }))}</p>
      <label class="sb-sub">${esc(t('rxPattern'))}<textarea class="sb-raw" rows="2" spellcheck="false" maxlength="${LIMITS.pattern}"></textarea></label>
      <div class="sb-insert" role="group" aria-label="${esc(t('rxInsert'))}">
        <span class="sb-lit"><input class="sb-lit-in" aria-label="${esc(t('rxLiteral'))}" placeholder="${esc(t('rxLiteral'))}"><button type="button" class="sb-lit-add">+</button></span>
        ${TOKENS.map(([tok, hint]) => `<button type="button" data-tok="${esc(tok)}" title="${esc(hint)}"><code>${esc(tok)}</code></button>`).join('')}
      </div>
      <fieldset class="sb-flags"><legend>${esc(t('rxFlags'))}</legend>${FLAGS.map((f) => `<label><input type="checkbox" data-flag="${f}" ${f === 'i' ? 'checked' : ''}> <code>${f}</code> ${esc(t(`rxFlag${f.toUpperCase()}` as RegexKey))}</label>`).join('')}</fieldset>
      <label class="sb-sub">${esc(t('rxSample'))}<textarea class="sb-sample" rows="3" maxlength="${LIMITS.sample}"></textarea></label>
      <div class="sb-preview" aria-hidden="true"></div>
      <p class="sb-count" aria-live="polite"></p>
      <div class="sb-groups"></div>
      <div class="sb-actions"><button type="button" class="sb-copy">${esc(t('rxCopy'))}</button><button type="button" class="sb-export">${esc(t('rxExport'))}</button><button type="button" class="sb-close">${esc(t('rxClose'))}</button></div>
    </section>`;
  const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
  const input = q<HTMLInputElement>('input[type=search]');
  const rxBtn = q<HTMLButtonElement>('.sb-rx'), openBtn = q<HTMLButtonElement>('.sb-open'), panel = q<HTMLElement>('.sb-panel');
  const raw = q<HTMLTextAreaElement>('.sb-raw'), sample = q<HTMLTextAreaElement>('.sb-sample'), state = q<HTMLElement>('.sb-state');
  const clearIn = clearButton(input, t('clearField', { field: label }));
  const clearRaw = clearButton(raw, t('clearField', { field: t('rxPattern') }));
  clearButton(sample, t('clearField', { field: t('rxSample') }));
  clearButton(q<HTMLInputElement>('.sb-lit-in'), t('clearField', { field: t('rxLiteral') }));
  const mirrored = () => { clearIn.hidden = !input.value; clearRaw.hidden = !raw.value; };
  let regex = false;
  const listeners: Array<() => void> = [];
  const flags = () => Array.from(el.querySelectorAll<HTMLInputElement>('[data-flag]')).filter((c) => c.checked).map((c) => c.dataset.flag).join('');
  const changed = () => { listeners.forEach((cb) => cb()); if (!panel.hidden) preview(); };
  const setRegex = (on: boolean) => { regex = on; rxBtn.setAttribute('aria-pressed', String(on)); el.classList.toggle('rx-on', on); if (!on) { state.textContent = ''; el.classList.remove('rx-bad'); } changed(); };
  rxBtn.addEventListener('click', () => setRegex(!regex));
  input.addEventListener('input', () => { raw.value = input.value; mirrored(); changed(); });
  raw.addEventListener('input', () => { input.value = raw.value; mirrored(); if (!regex) setRegex(true); else changed(); });
  el.querySelectorAll<HTMLInputElement>('[data-flag]').forEach((c) => c.addEventListener('change', () => { if (!regex) setRegex(true); else changed(); }));
  const insert = (text: string) => {
    const s = raw.selectionStart ?? raw.value.length, e = raw.selectionEnd ?? s;
    raw.value = raw.value.slice(0, s) + text + raw.value.slice(e);
    raw.focus(); raw.setSelectionRange(s + text.length, s + text.length);
    raw.dispatchEvent(new Event('input'));
  };
  el.querySelectorAll<HTMLElement>('[data-tok]').forEach((b) => b.addEventListener('click', () => insert(b.dataset.tok!.replace('…', ''))));
  q<HTMLButtonElement>('.sb-lit-add').addEventListener('click', () => { const v = q<HTMLInputElement>('.sb-lit-in').value; if (v) insert(v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')); });
  const toggle = (open: boolean) => { panel.hidden = !open; openBtn.setAttribute('aria-expanded', String(open)); if (open) { raw.value = input.value; mirrored(); preview(); raw.focus(); } else openBtn.focus(); };
  openBtn.addEventListener('click', () => toggle(panel.hidden));
  q<HTMLButtonElement>('.sb-close').addEventListener('click', () => toggle(false));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggle(false); } });
  sample.addEventListener('input', () => preview());
  q<HTMLButtonElement>('.sb-copy').addEventListener('click', () => navigator.clipboard?.writeText(input.value).then(() => { q<HTMLElement>('.sb-count').textContent = t('rxCopied'); }));
  q<HTMLButtonElement>('.sb-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ engine: 'ECMAScript RegExp', pattern: input.value, flags: flags() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'search-pattern.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const showState = (r: EvalResult) => {
    const bad = r.status !== 'ok';
    el.classList.toggle('rx-bad', bad);
    state.textContent = r.status === 'invalid' ? t('rxInvalid', { error: r.error }) : r.status === 'timeout' ? t('rxTimeout', { ms: LIMITS.timeoutMs }) : r.status === 'limit' ? t('rxLimit', { error: r.error }) : '';
    input.setAttribute('aria-invalid', String(bad));
  };
  let seq = 0;
  async function preview() {
    const my = ++seq;
    const pv = q<HTMLElement>('.sb-preview'), count = q<HTMLElement>('.sb-count'), groups = q<HTMLElement>('.sb-groups');
    const r = await runRegex({ pattern: input.value, flags: flags(), sample: sample.value });
    if (my !== seq) return; // a newer edit already replaced this run; never show a stale pattern
    if (regex) showState(r);
    if (r.status !== 'ok') { pv.innerHTML = esc(sample.value); count.textContent = r.status === 'invalid' ? t('rxInvalid', { error: r.error }) : r.status === 'timeout' ? t('rxTimeout', { ms: LIMITS.timeoutMs }) : t('rxLimit', { error: r.error }); groups.innerHTML = ''; return; }
    const ms = r.matches ?? [];
    let html = '', at = 0;
    for (const m of ms) { html += esc(sample.value.slice(at, m.index)) + (m.text ? `<mark>${esc(m.text)}</mark>` : '<mark class="zero"></mark>'); at = m.index + m.text.length; }
    pv.innerHTML = html + esc(sample.value.slice(at));
    count.textContent = ms.length ? t('rxMatches', { n: ms.length }) + (r.truncated ? ` ${t('rxTruncated', { n: LIMITS.matches })}` : '') : t('rxNoMatch');
    groups.innerHTML = ms.length && r.groupCount ? `<table><caption>${esc(t('rxGroups'))}</caption><thead><tr><th>#</th><th>0</th>${Array.from({ length: r.groupCount }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>${ms.slice(0, 20).map((m, i) => `<tr><td>${i + 1}</td><td><code>${esc(m.text)}</code></td>${m.groups.map((g) => `<td><code>${g === undefined ? '–' : esc(g)}</code></td>`).join('')}</tr>`).join('')}</tbody></table>
      ${Object.keys(ms[0].named).length ? `<p>${Object.entries(ms[0].named).map(([k, v]) => `<code>${esc(k)}</code> = <code>${esc(v ?? '–')}</code>`).join(' · ')}</p>` : ''}` : '';
  }

  return {
    el, input,
    query: () => input.value,
    onChange: (cb) => listeners.push(cb),
    async filter(texts) {
      if (!regex || !input.value) return plainHits(input.value, texts);
      const r = await runRegex({ pattern: input.value, flags: flags(), texts });
      showState(r);
      return r.status === 'ok' ? r.hits! : null;
    },
  };
}
