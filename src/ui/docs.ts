// The guide, inside the app: the same articles as the documentation site, bundled so they open with no
// network. Links between articles stay in the app. Pictures are left to the site to keep the app small.
// @ts-expect-error the articles are a plain JavaScript module shared with the site generator
import { features } from '../../site/content.mjs';
import yueData from '../../site/content.yue.json' with { type: 'json' };
import { searchBox, type RegexText } from './regex.js';

export interface DocArticle { slug: string; title: string; group: string; summary: string; body: Array<[string, string]>; related: string[] }
interface YueArticle { title: string; group: string; summary: string; body: Array<[string, string]> }
export const ARTICLES: DocArticle[] = (features as Array<DocArticle & { body: Array<[string, string, unknown?]> }>).map((f) => ({ slug: f.slug, title: f.title, group: f.group, summary: f.summary, body: f.body.map(([h, t]) => [h, t] as [string, string]), related: f.related ?? [] }));
const YUE = yueData as unknown as Record<string, YueArticle>;
const yueOf = (a: DocArticle): YueArticle | undefined => (YUE[a.slug]?.body?.length === a.body.length ? YUE[a.slug] : undefined);

export type DocLang = 'en' | 'yue' | 'both';
/** One piece of text in the chosen language; "both" gives English then Cantonese. */
export function pick(lang: DocLang, en: string, yue?: string): string[] { return !yue || lang === 'en' ? [en] : lang === 'yue' ? [yue] : [en, yue]; }
export const docTitle = (a: DocArticle, lang: DocLang) => pick(lang, a.title, yueOf(a)?.title).join(' · ');

let current = ARTICLES[0]?.slug ?? '';
export const openDoc = (slug: string) => { if (ARTICLES.some((a) => a.slug === slug)) current = slug; };

export function docsView(view: HTMLElement, c: { lang: DocLang; tx: (k: string, v?: Record<string, string | number>) => string; esc: (s: unknown) => string; rx: RegexText }) {
  const { lang, tx, esc } = c;
  view.innerHTML = `<div class="docs"><aside class="docs-nav" aria-label="${esc(tx('docsArticles'))}"><h1 class="md-typescale-display-small">${esc(tx('docs'))}</h1><p class="muted">${esc(tx('docsNote'))}</p><span id="dq-host"></span><nav id="doc-list"></nav><p class="muted" id="doc-none" role="status" hidden>${esc(tx('noMatches'))}</p></aside><article class="docs-article" id="doc-article" tabindex="-1"></article></div>`;
  const list = view.querySelector<HTMLElement>('#doc-list')!, art = view.querySelector<HTMLElement>('#doc-article')!;
  const box = searchBox('docs-search', tx('docsSearch'), c.rx, { compact: true });
  view.querySelector('#dq-host')!.replaceWith(box.el);
  const text = (a: DocArticle) => { const y = yueOf(a); return `${a.title} ${a.group} ${a.summary} ${a.body.map((b) => b.join(' ')).join(' ')} ${y ? `${y.title} ${y.summary} ${y.body.map((b) => b.join(' ')).join(' ')}` : ''}`; };
  const paras = (en: string, yue?: string) => pick(lang, en, yue).map((t, i) => `<p${i ? ' lang="yue-Hant-HK" class="doc-yue"' : ''}>${esc(t)}</p>`).join('');
  function show(focus = false) {
    const a = ARTICLES.find((x) => x.slug === current) ?? ARTICLES[0]; if (!a) return;
    const y = yueOf(a);
    art.innerHTML = `<p class="doc-crumb">${esc(pick(lang, a.group, y?.group).join(' · '))}</p><h2>${esc(docTitle(a, lang))}</h2><div class="doc-lead">${paras(a.summary, y?.summary)}</div>
      ${a.body.map(([h, t], i) => `<section><h3>${esc(pick(lang, h, y?.body[i][0]).join(' · '))}</h3>${paras(t, y?.body[i][1])}</section>`).join('')}
      ${a.related.length ? `<h3>${esc(tx('docsRelated'))}</h3><div class="doc-related">${a.related.map((s) => ARTICLES.find((x) => x.slug === s)).filter(Boolean).map((r) => `<button type="button" class="doc-link" data-doc="${esc(r!.slug)}">${esc(docTitle(r!, lang))}</button>`).join('')}</div>` : ''}
      <p class="muted"><a href="https://ding-ding-projects.github.io/map-editor/${esc(a.slug)}/" target="_blank" rel="noopener noreferrer">${esc(tx('docsOnline'))}</a></p>`;
    art.querySelectorAll<HTMLElement>('[data-doc]').forEach((b) => b.addEventListener('click', () => { current = b.dataset.doc!; void draw(); show(true); }));
    art.scrollTop = 0; if (focus) art.focus();
  }
  let run = 0;
  async function draw() {
    const my = ++run;
    const hits = await box.filter(ARTICLES.map(text));
    if (my !== run) return;
    const shown = ARTICLES.filter((_a, i) => (hits ? hits[i] : true));
    let group = '';
    list.innerHTML = shown.map((a) => { const g = pick(lang, a.group, yueOf(a)?.group).join(' · '); const head = g !== group ? `<h2 class="doc-group">${esc(g)}</h2>` : ''; group = g; return `${head}<button type="button" class="doc-item${a.slug === current ? ' on' : ''}" data-doc="${esc(a.slug)}"${a.slug === current ? ' aria-current="page"' : ''}>${esc(docTitle(a, lang))}</button>`; }).join('');
    view.querySelector<HTMLElement>('#doc-none')!.hidden = shown.length > 0;
    list.querySelectorAll<HTMLElement>('[data-doc]').forEach((b) => b.addEventListener('click', () => { current = b.dataset.doc!; void draw(); show(true); }));
  }
  box.onChange(() => void draw());
  void draw(); show();
}
