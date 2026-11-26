// Right-click menus and dropdowns: one list with its own regex-builder search field.
import { searchBox, type RegexText } from './regex.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
let deps: { rx: RegexText; search: () => string; none: () => string } | undefined;

/** `shortcut` is the key that does the same thing here, taken from where the key is registered so the two cannot drift. */
export type MenuItem = [label: string, run: () => void, shortcut?: string];

/** Open a menu at a point. `current` marks the chosen entry of a dropdown. */
export function contextMenu(x: number, y: number, label: string, items: MenuItem[], restore?: HTMLElement, current = -1, showTitle = false) {
  if (!deps) return;
  document.querySelector('.ctx-menu')?.remove();
  const m = document.createElement('div');
  m.className = 'ctx-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', label);
  const box = searchBox('menu-search', deps.search(), deps.rx, { compact: true });
  const list = document.createElement('div'); list.className = 'ctx-list';
  const role = current >= 0 ? 'menuitemradio' : 'menuitem';
  list.innerHTML = items.map(([text, , key], i) => `<button type="button" role="${role}" ${current >= 0 ? `aria-checked="${i === current}"` : ''} ${key ? `aria-keyshortcuts="${esc(key.replace(/Ctrl/g, 'Control'))}"` : ''} data-i="${i}"><span class="lbl">${esc(text)}</span>${key ? `<kbd aria-hidden="true">${esc(key)}</kbd>` : ''}</button>`).join('') + `<p class="muted ctx-none" hidden>${esc(deps.none())}</p>`;
  if (showTitle) { const h = document.createElement('p'); h.className = 'ctx-title'; h.textContent = label; m.append(h); } // a menu opened from the palette has no button beside it to say what it is
  m.append(box.el, list);
  // Inside a modal dialog the menu must be the dialog's descendant and in the top layer, or it is inert.
  const host = restore?.closest('md-dialog') ?? document.body;
  if (host !== document.body) m.slot = 'content';
  host.append(m);
  if (host !== document.body && 'showPopover' in m) { m.popover = 'manual'; m.showPopover(); }
  const r = m.getBoundingClientRect();
  Object.assign(m.style, { left: `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`, top: `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px` });
  const shown = () => Array.from(list.querySelectorAll<HTMLElement>('button:not([hidden])'));
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); };
  const outside = (e: Event) => { if (!m.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => {
    if (!m.contains(document.activeElement)) return;
    const b = shown(); const k = b.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); restore?.focus(); }
    else if (e.key === 'ArrowDown' && b.length) { e.preventDefault(); b[(k + 1) % b.length].focus(); }
    else if (e.key === 'ArrowUp' && b.length) { e.preventDefault(); if (k <= 0) box.input.focus(); else b[k - 1].focus(); }
    else if (e.key === 'Enter' && document.activeElement === box.input && b.length) { e.preventDefault(); b[0].click(); }
  };
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true);
  box.onChange(async () => {
    const hits = await box.filter(items.map(([text]) => text));
    list.querySelectorAll<HTMLElement>('button').forEach((b, i) => { b.hidden = hits ? !hits[i] : false; });
    list.querySelector<HTMLElement>('.ctx-none')!.hidden = shown().length > 0;
  });
  list.querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => { close(); items[Number(b.dataset.i)][1](); restore?.focus(); }));
  (list.querySelector<HTMLElement>('[aria-checked=true]') ?? shown()[0])?.focus();
}

const labelOf = (s: HTMLSelectElement) => s.selectedOptions[0]?.textContent?.trim() || '…';

/** Swap one native dropdown for a button that opens the searchable menu. The select stays as the value holder. */
function enhance(s: HTMLSelectElement) {
  if (s.dataset.menu) return;
  s.dataset.menu = '1'; s.hidden = true;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'select-button'; b.setAttribute('aria-haspopup', 'menu');
  const sync = () => { b.textContent = labelOf(s); b.disabled = s.disabled; };
  sync(); s.after(b);
  s.addEventListener('change', sync);
  new MutationObserver(sync).observe(s, { childList: true, subtree: true, attributes: true });
  b.addEventListener('focus', sync);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const opts = Array.from(s.options); const r = b.getBoundingClientRect();
    const name = (s.closest('label')?.querySelector('span')?.textContent ?? s.getAttribute('aria-label') ?? s.closest('label')?.firstChild?.textContent ?? '').trim();
    contextMenu(r.left, r.bottom + 4, name || labelOf(s), opts.map((o) => [o.textContent?.trim() || '…', () => { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); sync(); }]), b, s.selectedIndex);
  });
}

/** Every dropdown in the app, now and later, opens the searchable menu. */
export function initMenus(d: NonNullable<typeof deps>) {
  deps = d;
  const all = (root: ParentNode) => root.querySelectorAll<HTMLSelectElement>('select').forEach(enhance);
  all(document);
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => { if (n instanceof HTMLSelectElement) enhance(n); else if (n instanceof Element) all(n); }); }).observe(document.body, { childList: true, subtree: true });
}
