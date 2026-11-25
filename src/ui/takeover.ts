// Full-screen takeovers from the Takeover board, shared by the editor and the deploy app.
// Success closes itself after a few seconds (held while hovered or focused); failure stays until
// dismissed. Focus is kept inside, Esc closes, and focus goes back to where it was.

export interface TakeoverOptions {
  kind: 'ok' | 'fail';
  chip: string;
  title: string;
  lead: string;
  stats?: Array<{ label: string; value: string; code?: boolean }>;
  log?: string;
  logLabel?: string;
  actions: Array<{ label: string; primary?: boolean; outlined?: boolean; run: (close: () => void) => void }>;
  /** Success only: seconds before it closes by itself, and the countdown wording. */
  autoClose?: { seconds: number; text: (s: number) => string; held: string };
}

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function showTakeover(o: TakeoverOptions): { el: HTMLElement; close: () => void } {
  const opener = document.activeElement as HTMLElement | null;
  const el = document.createElement('div');
  el.className = `takeover ${o.kind}`;
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tk-title');
  el.innerHTML = `<div class="tk-shapes" aria-hidden="true"><i></i><i></i><i></i></div><section>
    <span class="tk-chip">${esc(o.chip)}</span>
    <h1 id="tk-title">${esc(o.title)}</h1>
    <p class="tk-lead">${esc(o.lead)}</p>
    ${o.stats?.length ? `<div class="tk-stats">${o.stats.map((s) => `<div><small>${esc(s.label)}</small>${s.code ? `<code>${esc(s.value)}</code>` : `<b>${esc(s.value)}</b>`}</div>`).join('')}</div>` : ''}
    ${o.log ? `<pre class="tk-log" tabindex="0" aria-label="${esc(o.logLabel ?? 'Details')}">${esc(o.log)}</pre>` : ''}
    <div class="tk-actions">${o.actions.map((a, i) => `<${a.primary ? 'md-filled-button' : a.outlined ? 'md-outlined-button' : 'md-text-button'} data-a="${i}">${esc(a.label)}</${a.primary ? 'md-filled-button' : a.outlined ? 'md-outlined-button' : 'md-text-button'}>`).join('')}</div>
    ${o.autoClose ? `<small class="tk-note" id="tk-count">${esc(o.autoClose.text(o.autoClose.seconds))}</small>` : ''}</section>`;
  let timer: ReturnType<typeof setInterval> | undefined;
  const close = () => { if (timer) clearInterval(timer); el.remove(); document.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = Array.from(el.querySelectorAll<HTMLElement>('[data-a], .tk-log'));
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => o.actions[Number(b.dataset.a)].run(close)));
  if (o.autoClose) {
    let left = o.autoClose.seconds;
    timer = setInterval(() => { left--; if (left <= 0) close(); else { const c = el.querySelector('#tk-count'); if (c) c.textContent = o.autoClose!.text(left); } }, 1000);
    const hold = () => { if (timer) clearInterval(timer); timer = undefined; const c = el.querySelector('#tk-count'); if (c) c.textContent = o.autoClose!.held; };
    el.addEventListener('pointerenter', hold, { once: true });
    el.addEventListener('keydown', hold, { once: true });
  }
  document.body.append(el);
  requestAnimationFrame(() => el.querySelector<HTMLElement>('[data-a]')?.focus());
  return { el, close };
}
