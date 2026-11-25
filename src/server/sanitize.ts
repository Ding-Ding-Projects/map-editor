// Notes are rich text typed by people. Before a note is stored, every tag is rebuilt from an allow-list,
// so nothing that can run (scripts, event handlers, script links, frames) is ever kept.
const TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'span', 'div',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'img', 'figure', 'figcaption']);
const VOID = new Set(['br', 'hr', 'img']);
const ATTRS: Record<string, string[]> = { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'] };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const unesc = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gi, (_, n: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" }[n.toLowerCase()] ?? ''));

function safeUrl(value: string, tag: string): boolean {
  const v = value.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  if (v.startsWith('#') || v.startsWith('/') && !v.startsWith('//')) return true;
  if (/^https?:/.test(v) || (tag === 'a' && /^mailto:/.test(v))) return true;
  return tag === 'img' && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/.test(v);
}

export function sanitizeNotes(html: string): string {
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*$/gi, '');
  return text.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>?/g, (_m, close: string, rawName: string, rest: string) => {
    const name = rawName.toLowerCase();
    if (!TAGS.has(name)) return '';
    if (close) return VOID.has(name) ? '' : `</${name}>`;
    let out = `<${name}`;
    for (const a of rest.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      const key = a[1].toLowerCase(), value = unesc(a[2] ?? a[3] ?? a[4] ?? '');
      if (!(ATTRS[name] ?? []).includes(key)) continue;
      if ((key === 'href' || key === 'src') && !safeUrl(value, name)) continue;
      if ((key === 'width' || key === 'height' || key === 'colspan' || key === 'rowspan') && !/^\d{1,4}$/.test(value)) continue;
      out += ` ${key}="${esc(value)}"`;
    }
    if (name === 'a') out += ' rel="noopener noreferrer"';
    return out + '>';
  });
}
