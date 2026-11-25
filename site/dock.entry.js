// Article pages as a workspace: the article, its contents and the suggested articles are panels you can
// drag, split, float and stack. The layout is kept in this browser; Reset layout puts it back, and
// Plain page returns to the ordinary scrolling page. Without this script the page is that ordinary page.
import { createDockview } from 'dockview-core/dist/dockview-core.js';

const LAYOUT = 'map-editor-site.layout.v1', PLAIN = 'map-editor-site.plain';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };

function start() {
  const body = document.querySelector('.article-body'), article = body?.querySelector('article'), toc = body?.querySelector('.toc'), suggested = document.querySelector('.suggested');
  if (!body || !article || !toc) return;
  const bar = document.createElement('div');
  bar.className = 'dock-bar';
  bar.innerHTML = '<button type="button" id="dock-toggle" aria-pressed="false"></button><button type="button" id="dock-reset">Reset layout</button><span class="dock-hint">Drag a tab to move it, drop it on an edge to split, or drag it out to float.</span>';
  body.before(bar);
  const toggle = bar.querySelector('#dock-toggle'), reset = bar.querySelector('#dock-reset'), hint = bar.querySelector('.dock-hint');
  const wide = matchMedia('(min-width: 900px)');
  const home = { article: article.parentElement, toc: toc.parentElement, grid: suggested?.querySelector('.grid') ?? null };
  let api, host;

  function arrange() {
    api.clear();
    api.addPanel({ id: 'article', component: 'article', title: 'Article' });
    api.addPanel({ id: 'toc', component: 'toc', title: 'On this page', position: { referencePanel: 'article', direction: 'right' }, initialWidth: 300 });
    if (home.grid) api.addPanel({ id: 'suggested', component: 'suggested', title: 'Suggested articles', position: { referencePanel: 'toc', direction: 'below' } });
    api.getPanel('article')?.api.setActive();
  }
  function open() {
    if (api) return;
    host = document.createElement('div'); host.className = 'site-dock dockview-theme-site';
    body.before(host); body.hidden = true; if (suggested) suggested.hidden = true;
    const wrap = (el, cls) => { const d = document.createElement('div'); d.className = `dock-panel ${cls}`; d.append(el); return d; };
    const parts = { article: wrap(article, 'dock-article'), toc: wrap(toc, 'dock-toc'), suggested: home.grid ? wrap(home.grid, 'dock-suggested') : null };
    api = createDockview(host, {
      theme: { name: 'site', className: 'dockview-theme-site', colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', gap: 8, dndTabIndicator: 'fill' },
      createComponent: ({ name }) => ({ element: parts[name] ?? document.createElement('div'), init: () => undefined }),
    });
    let restored = false;
    try { const saved = read(LAYOUT); if (saved) { api.fromJSON(JSON.parse(saved)); restored = Boolean(api.getPanel('article') && api.getPanel('toc')); } } catch { restored = false; }
    if (!restored) arrange();
    api.onDidLayoutChange(() => write(LAYOUT, JSON.stringify(api.toJSON())));
    reset.hidden = false; hint.hidden = false;
  }
  function close() {
    if (!api) return;
    home.article.append(article); home.toc.prepend(toc); if (home.grid && suggested) suggested.append(home.grid);
    api.dispose(); api = undefined; host.remove(); host = undefined;
    body.hidden = false; if (suggested) suggested.hidden = false;
    reset.hidden = true; hint.hidden = true;
  }
  function sync() {
    const plain = read(PLAIN) === '1' || !wide.matches;
    toggle.hidden = !wide.matches;
    toggle.textContent = plain ? 'Workspace view' : 'Plain page';
    toggle.setAttribute('aria-pressed', String(!plain));
    if (plain) close(); else open();
  }
  toggle.addEventListener('click', () => { write(PLAIN, read(PLAIN) === '1' ? null : '1'); sync(); });
  reset.addEventListener('click', () => { write(LAYOUT, null); if (api) arrange(); });
  wide.addEventListener('change', sync);
  // Contents links scroll the article inside its panel.
  toc.addEventListener('click', (e) => { const a = e.target.closest?.('a[href^="#"]'); const t = a && document.getElementById(a.getAttribute('href').slice(1)); if (t && api) { e.preventDefault(); api.getPanel('article')?.api.setActive(); t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); history.replaceState(null, '', a.getAttribute('href')); } });
  reset.hidden = true; hint.hidden = true;
  sync();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
