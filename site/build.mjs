// Builds the documentation site into site/dist: a landing page plus one article per feature.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { features } from './content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
let commit = process.env.SOURCE_COMMIT ?? '', when = process.env.SOURCE_DATE ?? '';
try { commit ||= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); when ||= execFileSync('git', ['log', '-1', '--format=%cI'], { cwd: root }).toString().trim(); } catch { /* not a checkout */ }
const base = process.env.SITE_BASE ?? '/map-editor/';
const repo = 'https://github.com/Ding-Ding-Projects/map-editor';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stamp = when ? `${when.replace('T', ' ').replace(/([+-]\d\d:\d\d|Z)$/, ' UTC$1').replace('UTC Z', 'UTC')}` : 'unavailable';

function page(title, desc, main) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<link rel="stylesheet" href="${base}site.css"></head><body>
<header class="top"><a class="brand" href="${base}"><span class="logo" aria-hidden="true"></span><span class="title">Map Editor</span></a>
<nav aria-label="Site"><a href="${base}">Features</a><a href="${repo}/releases">Downloads</a><a href="${repo}">Source</a></nav></header>
<main>${main}</main>
<footer><p>Map Editor ${esc(pkg.version)} · updated ${esc(stamp)} · <a href="${repo}/commit/${esc(commit)}">${esc(commit.slice(0, 7) || 'unavailable')}</a></p>
<p>This site explains, documents and downloads Map Editor. It is not the editor itself. Based on Amulet Map Editor; using it needs an Amulet licence. Minecraft is a trademark of Mojang Synergies AB; not affiliated with Mojang or Microsoft.</p></footer>
</body></html>`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(path.join(here, 'site.css'), path.join(out, 'site.css'));
const groups = [...new Set(features.map((f) => f.group))];
writeFileSync(path.join(out, 'index.html'), page('Map Editor', 'A Minecraft world editor that runs as a desktop app, a Docker web app or an appliance image.', `
<section class="hero"><h1>Edit Minecraft worlds anywhere you like</h1>
<p>A desktop app, a web app for your whole network, and an appliance image for a spare PC. Every edit can be undone.</p>
<p class="actions"><a class="btn filled" href="${repo}/releases">Downloads</a><a class="btn outlined" href="${base}web-app/">Run it with Docker</a></p></section>
${groups.map((g) => `<section><h2>${esc(g)}</h2><div class="grid">${features.filter((f) => f.group === g).map((f) => `<a class="card" href="${base}${f.slug}/"><h3>${esc(f.title)}</h3><p>${esc(f.summary)}</p></a>`).join('')}</div></section>`).join('')}`));
for (const f of features) {
  mkdirSync(path.join(out, f.slug), { recursive: true });
  const rel = f.related.map((s) => features.find((x) => x.slug === s)).filter(Boolean);
  writeFileSync(path.join(out, f.slug, 'index.html'), page(`${f.title} · Map Editor`, f.summary, `
<article><p class="crumb"><a href="${base}">Features</a> › ${esc(f.group)}</p><h1>${esc(f.title)}</h1><p class="lead">${esc(f.summary)}</p>
${f.body.map(([h, t]) => `<h2>${esc(h)}</h2><p>${esc(t)}</p>`).join('')}
<section class="suggested"><h2>Suggested articles</h2><div class="grid">${rel.map((r) => `<a class="card" href="${base}${r.slug}/"><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p></a>`).join('')}</div></section></article>`));
}
writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Site built: ${features.length + 1} pages in ${out}`);
