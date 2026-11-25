// Guided "Take a tour": a small coach card anchored beside the real control, a highlight ring on it,
// "Step N of M", Back, Skip this step, Next and Close. Focus moves to the control; Esc closes; the
// arrow keys move. Steps whose control is not on screen say so and offer how to reveal it.

export interface TourStep {
  /** CSS selector of the live control this step explains. */
  target: string;
  title: string;
  body: string;
  /** When the control is not on screen: what to say, and an action that reveals it. */
  missing?: { text: string; label: string; reveal: () => void | Promise<void> };
}
export interface TourText { stepOf: (n: number, m: number, tour: string) => string; back: string; skip: string; next: string; done: string; close: string; notHere: string }

let active: { close: () => void } | undefined;
/** The first matching element that is actually on screen (a selector may list alternatives). */
const find = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.getClientRects().length > 0);

export function startTour(name: string, steps: TourStep[], t: TourText, opts: { start?: number; onStep?: (i: number) => void; onEnd?: (finished: boolean) => void } = {}) {
  active?.close();
  let i = Math.max(0, Math.min(opts.start ?? 0, steps.length - 1));
  const opener = document.activeElement as HTMLElement | null;
  const ring = document.createElement('div');
  ring.className = 'tour-ring'; ring.setAttribute('aria-hidden', 'true');
  const card = document.createElement('section');
  card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false'); card.setAttribute('aria-labelledby', 'tour-title');
  const live = document.createElement('div');
  live.className = 'tour-live'; live.setAttribute('aria-live', 'polite');
  document.body.append(ring, card, live);

  const place = () => {
    const step = steps[i];
    const el = find(step.target);
    const visible = !!el;
    if (visible) {
      el!.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      const r = el!.getBoundingClientRect();
      Object.assign(ring.style, { display: 'block', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      // Put the card beside the control: below if there is room, otherwise above; clamp into view.
      const cw = Math.min(360, innerWidth - 24), ch = card.offsetHeight || 220;
      let top = r.bottom + 16; if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 16);
      let left = Math.min(Math.max(12, r.left), innerWidth - cw - 12);
      if (r.width < 200 && r.right + cw + 16 < innerWidth && top === Math.max(12, r.top - ch - 16)) { left = r.right + 16; top = Math.max(12, Math.min(r.top, innerHeight - ch - 12)); }
      Object.assign(card.style, { left: `${left}px`, top: `${top}px`, width: `${cw}px` });
    } else {
      ring.style.display = 'none';
      Object.assign(card.style, { left: `${Math.max(12, (innerWidth - 360) / 2)}px`, top: '96px', width: `${Math.min(360, innerWidth - 24)}px` });
    }
    return { el, visible };
  };

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  function show() {
    const step = steps[i];
    const el = find(step.target);
    const visible = !!el;
    const last = i === steps.length - 1;
    card.innerHTML = `<header><small id="tour-step">${esc(t.stepOf(i + 1, steps.length, name))}</small><button class="tour-x" type="button" aria-label="${esc(t.close)}">×</button></header>
      <h2 id="tour-title">${esc(step.title)}</h2>
      <p>${esc(visible ? step.body : (step.missing?.text ?? t.notHere))}</p>
      ${!visible && step.missing ? `<button class="tour-reveal" type="button">${esc(step.missing.label)}</button>` : ''}
      <div class="tour-dots" aria-hidden="true">${steps.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'seen' : ''}"></i>`).join('')}</div>
      <footer><button class="tour-back" type="button" ${i === 0 ? 'disabled' : ''}>${esc(t.back)}</button><span></span>
        ${last ? '' : `<button class="tour-skip" type="button">${esc(t.skip)}</button>`}
        <button class="tour-next" type="button">${esc(last ? t.done : t.next)}</button></footer>`;
    card.querySelector('.tour-x')!.addEventListener('click', () => end(false));
    card.querySelector('.tour-back')!.addEventListener('click', () => go(i - 1));
    card.querySelector('.tour-skip')?.addEventListener('click', () => go(i + 1));
    card.querySelector('.tour-next')!.addEventListener('click', () => (last ? end(true) : go(i + 1)));
    card.querySelector('.tour-reveal')?.addEventListener('click', async () => { await step.missing!.reveal(); setTimeout(show, 350); });
    place();
    live.textContent = `${t.stepOf(i + 1, steps.length, name)}. ${step.title}. ${visible ? step.body : (step.missing?.text ?? t.notHere)}`;
    opts.onStep?.(i);
    // Focus the real control so keyboard users land on it; the card's Next is one Tab away.
    if (visible) { el!.classList.add('tour-target'); if (el!.tabIndex < 0 && !el!.matches('button, a, input, [tabindex], md-filled-button, md-outlined-button, md-filled-tonal-button, md-text-button')) el!.setAttribute('tabindex', '-1'); el!.focus({ preventScroll: true }); }
    else card.querySelector<HTMLElement>('.tour-reveal, .tour-next')?.focus();
  }
  function go(n: number) {
    document.querySelectorAll('.tour-target').forEach((e) => e.classList.remove('tour-target'));
    i = Math.max(0, Math.min(n, steps.length - 1));
    show();
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'ArrowRight' && !(e.target as HTMLElement).closest('input, textarea, md-outlined-text-field, md-slider')) { e.preventDefault(); if (i < steps.length - 1) go(i + 1); }
    else if (e.key === 'ArrowLeft' && !(e.target as HTMLElement).closest('input, textarea, md-outlined-text-field, md-slider')) { e.preventDefault(); if (i > 0) go(i - 1); }
  };
  const onMove = () => place();
  function end(finished: boolean) {
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true);
    document.querySelectorAll('.tour-target').forEach((e) => e.classList.remove('tour-target'));
    ring.remove(); card.remove(); live.remove();
    active = undefined;
    opts.onEnd?.(finished);
    opener?.focus?.();
  }
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', onMove); addEventListener('scroll', onMove, true);
  active = { close: () => end(false) };
  show();
  return active;
}
