// A small, safe Markdown renderer for text that comes from outside the app (release notes, commit
// messages). Everything is escaped first; only a fixed set of tags is produced, links are limited to
// http, https and mailto, and relative links are resolved against a base or left as plain text.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const EMOJI: Record<string, string> = { tada: '🎉', rocket: '🚀', bug: '🐛', sparkles: '✨', warning: '⚠️', white_check_mark: '✅', x: '❌', memo: '📝', lock: '🔒', fire: '🔥', wrench: '🔧', zap: '⚡', art: '🎨', package: '📦', books: '📚', globe_with_meridians: '🌐', construction: '🚧', heart: '❤️', '+1': '👍', thumbsup: '👍', eyes: '👀', star: '⭐', hammer: '🔨', recycle: '♻️', boom: '💥' };

// A line break inside a paragraph is a space, except between two Chinese, Japanese or Korean characters.
const CJK_END = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]$/, CJK_START = /^\s*[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;

/** A link target that is safe to put in href, or undefined. */
export function safeHref(raw: string, base?: string): string | undefined {
  const t = raw.trim();
  if (/^(https?:|mailto:)/i.test(t)) { try { return new URL(t).href; } catch { return undefined; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) return undefined; // javascript:, data:, protocol-relative
  if (!base) return undefined;
  try { const u = new URL(t, base); return /^https?:$/.test(u.protocol) ? u.href : undefined; } catch { return undefined; }
}

/** Longest paragraph or line that gets inline formatting. */
export const MAX_INLINE = 4000;

function inline(text: string, base?: string): string {
  // A very long line is shown as plain text: the patterns below are only run on text of bounded length, so hostile input cannot make them slow.
  if (text.length > MAX_INLINE) return esc(text);
  const keep: string[] = [];
  const hold = (html: string) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_m, c: string) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => { const h = safeHref(href, base); return h ? hold(`<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`) : hold(esc(label)); });
  s = s.replace(/\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g, (m) => { const h = safeHref(m); return h ? hold(`<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(m)}</a>`) : m; });
  s = esc(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>').replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/:([a-z0-9_+]+):/g, (m, n: string) => EMOJI[n] ?? m);
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => keep[Number(i)]);
}

/** Markdown to a fixed, safe subset of HTML. Empty or blank input gives an empty string. */
export function renderMarkdown(src: string, opts: { base?: string } = {}): string {
  const lines = src.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n');
  const out: string[] = []; let para: string[] = []; let list: 'ul' | 'ol' | undefined;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.reduce((t, l) => t + (CJK_END.test(t) && CJK_START.test(l) ? '' : ' ') + l.trim()), opts.base)}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = undefined; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); flushList(); const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); const n = Math.min(6, h[1].length + 2); out.push(`<h${n}>${inline(h[2].replace(/\s#+\s*$/, ''), opts.base)}</h${n}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    const li = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara(); const kind = li[1] ? 'ul' : 'ol';
      if (list !== kind) { flushList(); out.push(`<${kind}>`); list = kind; }
      const task = /^\[([ xX])\]\s+(.*)$/.exec(li[3]);
      out.push(task ? `<li>${task[1] === ' ' ? '☐' : '☑'} ${inline(task[2], opts.base)}</li>` : `<li>${inline(li[3], opts.base)}</li>`); continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) { flushPara(); flushList(); out.push(`<blockquote>${inline(q[1], opts.base)}</blockquote>`); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}
