// Export a list of records as CSV, JSON, Markdown or HTML, entirely in the page.
export type ExportFormat = 'csv' | 'json' | 'md' | 'html';
export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json', 'md', 'html'];

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };
const mdCell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const htmlEsc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Turn rows into a file body. CSV cells that a spreadsheet would run as a formula are quoted with a leading '. */
export function exportRows(rows: Array<Record<string, unknown>>, columns: string[], format: ExportFormat, title: string): { body: string; type: string; ext: string } {
  switch (format) {
    case 'json': return { body: JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))), null, 2), type: 'application/json', ext: 'json' };
    case 'md': return { body: `# ${title}\n\n| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${columns.map((c) => mdCell(r[c])).join(' | ')} |`).join('\n')}\n`, type: 'text/markdown', ext: 'md' };
    case 'html': return { body: `<!doctype html><meta charset="utf-8"><title>${htmlEsc(title)}</title><h1>${htmlEsc(title)}</h1><table border="1" cellpadding="4"><thead><tr>${columns.map((c) => `<th>${htmlEsc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${htmlEsc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>\n`, type: 'text/html', ext: 'html' };
    default: return { body: `${columns.join(',')}\r\n${rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n')}\r\n`, type: 'text/csv', ext: 'csv' };
  }
}

/** Download a file made by exportRows. */
export function downloadRows(rows: Array<Record<string, unknown>>, columns: string[], format: ExportFormat, title: string, fileBase: string) {
  const f = exportRows(rows, columns, format, title);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([f.body], { type: f.type }));
  a.download = `${fileBase}.${f.ext}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A small Export menu button: one item per format. */
export function exportButton(label: string, names: Record<ExportFormat, string>, onPick: (f: ExportFormat) => void): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'export-wrap';
  wrap.innerHTML = `<md-outlined-button class="export-btn" aria-haspopup="menu" aria-expanded="false">${label}</md-outlined-button><div class="export-menu" role="menu" hidden>${EXPORT_FORMATS.map((f) => `<button type="button" role="menuitem" data-fmt="${f}">${names[f]}</button>`).join('')}</div>`;
  const btn = wrap.querySelector<HTMLElement>('.export-btn')!, menu = wrap.querySelector<HTMLElement>('.export-menu')!;
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector<HTMLElement>('button')?.focus(); });
  menu.addEventListener('keydown', (e) => {
    const items = Array.from(menu.querySelectorAll<HTMLElement>('button')); const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { close(); btn.focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  menu.querySelectorAll<HTMLElement>('[data-fmt]').forEach((b) => b.addEventListener('click', () => { close(); onPick(b.dataset.fmt as ExportFormat); }));
  // The listener removes itself once the button has left the page, so re-rendering does not pile them up.
  const outside = (e: Event) => { if (!wrap.isConnected) { document.removeEventListener('pointerdown', outside); return; } if (!wrap.contains(e.target as Node)) close(); };
  document.addEventListener('pointerdown', outside);
  return wrap;
}
