import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeHref } from '../src/ui/markdown.js';

describe('safe Markdown', () => {
  it('renders headings, lists, emphasis, code and emoji names', () => {
    const h = renderMarkdown('# Title\n\nSome **bold** and *soft* text with `code` :tada:\n\n- one\n- two\n\n1. first\n2) second\n\n```\n<b>raw</b>\n```');
    expect(h).toContain('<h3>Title</h3>'); expect(h).toContain('<strong>bold</strong>'); expect(h).toContain('<em>soft</em>');
    expect(h).toContain('<code>code</code>'); expect(h).toContain('🎉'); expect(h).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(h).toContain('<ol><li>first</li><li>second</li></ol>'); expect(h).toContain('<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>');
  });
  it('escapes HTML and never produces script, handlers or unsafe links', () => {
    const h = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>\n[x](javascript:alert(1)) [y](data:text/html,hi) [z](//evil.example/a)\n[ok](https://example.org/a?b=1&c="2")');
    expect(h).not.toMatch(/<script|<img|javascript:|data:text|href="\/\//i);
    expect(h).toContain('&lt;script&gt;'); expect(h).toContain('href="https://example.org/a?b=1&amp;c=%222%22"'); expect(h).toContain('rel="noopener noreferrer"');
  });
  it('resolves relative links only when a base is given', () => {
    expect(renderMarkdown('[notes](docs/a.md)')).toBe('<p>notes</p>');
    expect(renderMarkdown('[notes](docs/a.md)', { base: 'https://example.org/repo/' })).toContain('href="https://example.org/repo/docs/a.md"');
    expect(safeHref('../x', 'https://example.org/a/b/')).toBe('https://example.org/a/x'); expect(safeHref('vbscript:x', 'https://example.org/')).toBeUndefined();
  });
  it('links bare addresses, joins wrapped lines and gives nothing for blank text', () => {
    expect(renderMarkdown('see https://example.org/x.')).toBe('<p>see <a href="https://example.org/x" target="_blank" rel="noopener noreferrer">https://example.org/x</a>.</p>');
    expect(renderMarkdown('a\nb')).toBe('<p>a b</p>'); expect(renderMarkdown('世界，\n你好')).toBe('<p>世界，你好</p>'); expect(renderMarkdown('  \n\n')).toBe('');
  });
  it('stays quick on hostile input', () => {
    const t = Date.now(); renderMarkdown(`${'*'.repeat(20000)}${'['.repeat(20000)}${'_a'.repeat(20000)}`); expect(Date.now() - t).toBeLessThan(2000);
  });
});
