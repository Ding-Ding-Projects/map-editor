// Three small pieces shared across the app:
//  - a two-key confirmation for anything destructive,
//  - the QR code for pairing an authenticator (drawn here, never by an online service),
//  - the celebration shown when a personal-vocabulary file is dropped on the window.
import qrcode from 'qrcode-generator';

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The dark squares of a QR code for `text`, row by row. */
export function qrMatrix(text: string): boolean[][] {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** A QR code as SVG: always black on white with a four-module quiet zone, whatever the theme. */
export function qrSvg(text: string, label: string, size = 220): string {
  const m = qrMatrix(text), quiet = 4, n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return `<svg class="qr" role="img" aria-label="${esc(label)}" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** The parts of an otpauth link, for showing beside the QR code. */
export function otpauthParts(uri: string): { secret: string; algorithm: string; digits: string; period: string; issuer: string; account: string } {
  const u = new URL(uri); const q = u.searchParams;
  const label = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  return { secret: q.get('secret') ?? '', algorithm: q.get('algorithm') ?? 'SHA1', digits: q.get('digits') ?? '6', period: q.get('period') ?? '30', issuer: q.get('issuer') ?? label.split(':')[0] ?? '', account: label.includes(':') ? label.split(':').slice(1).join(':') : label };
}

export interface SuperText { title: string; key1: string; key2: string; keyOn: string; slide: string; slideLocked: string; exit: string; hint: string; done: string }

/**
 * Two-key confirmation: both keys must be turned before the slider unlocks, and nothing happens
 * until the slider reaches the end. Emergency exit and Escape always leave without acting.
 */
export function superConfirm(what: string, t: SuperText): Promise<boolean> {
  return new Promise((resolve) => {
    const back = document.activeElement as HTMLElement | null;
    const el = document.createElement('div');
    el.className = 'super-confirm'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'sc-title'); el.setAttribute('aria-describedby', 'sc-what');
    el.innerHTML = `<div class="sc-card"><h2 id="sc-title">${esc(t.title)}</h2><p id="sc-what" class="sc-what">${esc(what)}</p>
      <p class="sc-hint">${esc(t.hint)}</p>
      <div class="sc-keys"><button type="button" class="sc-key" data-icon="key" aria-pressed="false" data-k="1">${esc(t.key1)}</button><button type="button" class="sc-key" data-icon="key" aria-pressed="false" data-k="2">${esc(t.key2)}</button></div>
      <label class="sc-slide"><span id="sc-slide-label">${esc(t.slideLocked)}</span><input type="range" min="0" max="100" value="0" step="1" disabled aria-labelledby="sc-slide-label"><span class="sc-track" aria-hidden="true"><span class="sc-fill"></span></span></label>
      <p class="sc-status" role="status" aria-live="polite"></p>
      <div class="sc-actions"><button type="button" class="sc-exit" data-icon="x">${esc(t.exit)}</button></div></div>`;
    document.body.append(el);
    const keys = Array.from(el.querySelectorAll<HTMLButtonElement>('.sc-key'));
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!, fill = el.querySelector<HTMLElement>('.sc-fill')!, status = el.querySelector<HTMLElement>('.sc-status')!, label = el.querySelector<HTMLElement>('#sc-slide-label')!;
    let finished = false;
    const finish = (ok: boolean) => { if (finished) return; finished = true; document.removeEventListener('keydown', onKey, true); el.remove(); back?.focus?.(); resolve(ok); };
    const sync = () => {
      const both = keys.every((k) => k.getAttribute('aria-pressed') === 'true');
      range.disabled = !both; label.textContent = both ? t.slide : t.slideLocked;
      if (!both) { range.value = '0'; fill.style.width = '0%'; }
      el.classList.toggle('armed', both);
    };
    keys.forEach((k) => k.addEventListener('click', () => { const on = k.getAttribute('aria-pressed') !== 'true'; k.setAttribute('aria-pressed', String(on)); status.textContent = on ? t.keyOn : ''; sync(); }));
    range.addEventListener('input', () => { fill.style.width = `${range.value}%`; });
    const settle = () => { if (range.disabled) return; if (Number(range.value) >= 100) { status.textContent = t.done; el.classList.add('done'); setTimeout(() => finish(true), 260); } else { range.value = '0'; fill.style.width = '0%'; } };
    range.addEventListener('change', settle);
    el.querySelector('.sc-exit')!.addEventListener('click', () => finish(false));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('button, input:not([disabled])')); const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    };
    document.addEventListener('keydown', onKey, true);
    el.querySelector<HTMLElement>('.sc-exit')!.focus(); // the safe choice has focus first
  });
}

/** The headline for a dropped vocabulary file: its own name when it gives one, never anything else from it. */
export function vocabHeadline(raw: unknown, neutral: string): string {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const name = [o.$name, o.name, o.title].find((v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 60) as string | undefined;
  return name?.trim() ?? neutral;
}

/** A full-window level-up that does not block: it comes in, holds about three seconds and leaves. */
export function levelUp(headline: string, sub: string) {
  document.querySelector('.level-up')?.remove();
  const el = document.createElement('div');
  el.className = 'level-up'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="lu-burst" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><p class="lu-sub">${esc(sub)}</p><h2>${esc(headline)}</h2>`;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 3300);
  setTimeout(() => el.remove(), 3900);
}
