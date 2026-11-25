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

function page(title, desc, main, active = 'guide') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<link rel="icon" type="image/svg+xml" href="${base}favicon.svg"><link rel="stylesheet" href="${base}site.css"></head><body>
<header class="top"><a class="brand" href="${base}"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="title">Map Editor</span></a>
<nav aria-label="Site"><a href="${base}"${active === 'guide' ? ' aria-current="page"' : ''}>Guide</a><a href="${base}downloads/"${active === 'downloads' ? ' aria-current="page"' : ''}>Downloads</a><a href="${repo}/commits/main">Changelog</a><a href="${repo}">Source</a><a href="#tour" data-tour="page">Take a tour</a></nav></header>
<main>${main}</main>
<footer><div><span>Map Editor ${esc(pkg.version)} · updated ${esc(stamp)} · <a href="${repo}/commit/${esc(commit)}">${esc(commit.slice(0, 7) || 'unavailable')}</a></span>
<span>This site documents and downloads Map Editor; it is not the editor. Based on Amulet Map Editor, which needs its own licence. Minecraft is a trademark of Mojang Synergies AB; not affiliated with Mojang or Microsoft.</span></div></footer>
<script src="${base}tour.js" defer></script>
</body></html>`;
}

function mosaic(cols, rows) {
  const pal = ['#3e6b30', '#4a7a38', '#567f3f', '#6f8a4a', '#2c5a86', '#356a9a', '#6a6f72', '#d8cfa3', '#7c6a4a'];
  let out = '';
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const d = Math.abs(x - (Math.floor(cols / 2) - 1 + Math.round(3 * Math.sin(z / 2.1))));
    const n = (x * 31 + z * 17 + x * z) % 13;
    out += `<i style="background:${d < 2 ? pal[4 + (n % 2)] : d === 2 ? pal[7] : n === 0 ? pal[6] : n === 1 ? pal[8] : pal[n % 4]}"></i>`;
  }
  return out;
}

const ways = [
  { k: 'Desktop', t: 'On your PC', b: 'A Windows app that opens worlds straight from your saves folder. Nothing leaves your computer.', c: 'build.bat --run', slug: 'desktop-app', cls: 'w1' },
  { k: 'Web app', t: 'On your network', b: 'One command starts it in Docker. Anyone on your network opens the link; the first person becomes the owner.', c: 'node scripts/setup.mjs', slug: 'web-app', cls: 'w2' },
  { k: 'Appliance', t: 'On a spare PC', b: 'Flash the image to a USB drive or import it into VirtualBox. It boots straight into Map Editor.', c: 'Map Editor Deploy', slug: 'appliance', cls: 'w3' },
];
const bento = [
  ['editing', 'Fill, replace, clone, delete, waterlog', 'Amulet’s tools, with a safety limit and missing chunks skipped, never invented.', 'b-wide'],
  ['editing', 'Panels you arrange', 'Dock, tab and float the map, tools, history and notes.', 'b-sec'],
  ['worlds', 'Worlds in, worlds out', 'Upload a .zip, download it again, or start a flat world.', ''],
  ['appearance', 'Any colour you can type', 'Names, HEX, OKLCH, CMYK and more. The whole theme follows.', 'b-ter'],
  ['languages', 'English, 粵語 or both', 'With two separate funny-level sliders.', ''],
  ['deploy-app', 'One-click deploy', 'Docker, VirtualBox and verified USB flashing, then the working link.', 'b-wide b-pri'],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(path.join(here, 'site.css'), path.join(out, 'site.css'));
copyFileSync(path.join(here, 'tour.js'), path.join(out, 'tour.js'));
copyFileSync(path.join(here, 'favicon.svg'), path.join(out, 'favicon.svg'));
mkdirSync(path.join(out, 'screenshots'), { recursive: true });
// Every screenshot an article names is copied, so an article cannot point at a missing picture.
const shots = new Set(['tour.png', 'extensions-consent.png', 'about.png', ...features.flatMap((f) => f.body.map((b) => b[2]?.src).filter(Boolean))]);
for (const f of shots) copyFileSync(path.join(root, 'docs', 'screenshots', f), path.join(out, 'screenshots', f));
// Bundled fonts (SIL Open Font License): the site never fetches fonts from another host.
mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const [from, to] of [['roboto-flex/files/roboto-flex-latin-standard-normal.woff2', 'roboto-flex-latin.woff2'], ['roboto-flex/files/roboto-flex-latin-ext-standard-normal.woff2', 'roboto-flex-latin-ext.woff2'],
  ['roboto-mono/files/roboto-mono-latin-wght-normal.woff2', 'roboto-mono-latin.woff2'], ['roboto-mono/files/roboto-mono-latin-ext-wght-normal.woff2', 'roboto-mono-latin-ext.woff2']]) {
  copyFileSync(path.join(root, 'node_modules/@fontsource-variable', from), path.join(out, 'fonts', to));
}
const groups = [...new Set(features.map((f) => f.group))];
writeFileSync(path.join(out, 'index.html'), page('Map Editor', 'A Minecraft world editor for your desk, your whole network, or a spare PC. Every edit can be undone.', `
<section class="hero"><div class="hero-copy">
<span class="pill">Java Edition 1.18 and newer · v${esc(pkg.version)}</span>
<h1>Edit your world.<br><span>Undo anything.</span></h1>
<p>A Minecraft world editor for your desk, your whole network, or a spare PC. Every fill, replace and clone is saved to its own history, so nothing is ever one click from gone.</p>
<p class="actions"><a class="btn filled" href="${base}downloads/">Get Map Editor</a><a class="btn outlined" href="${base}web-app/">Run it with Docker</a></p></div>
<div class="hero-art"><div class="map" role="img" aria-label="Top-down map of a river valley with a selected area">${mosaic(18, 12)}</div><div class="sel" aria-hidden="true"><span class="wash"></span></div><div class="cursor" aria-hidden="true"></div>
<div class="chip c1" aria-hidden="true"><small>Fill finished</small><b>53,248 blocks</b></div>
<div class="chip c2" aria-hidden="true"><span class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg></span><span><small>History</small><b>Rolled back to 16:38:52</b></span></div></div></section>
<section class="band-wrap"><h2>Three ways to run it</h2><div class="ways">${ways.map((w) => `<a class="way ${w.cls}" href="${base}${w.slug}/"><small>${esc(w.k)}</small><strong>${esc(w.t)}</strong><span>${esc(w.b)}</span><code>${esc(w.c)}</code></a>`).join('')}</div></section>
<section class="dark"><div><div><h2>Your history,<br>not your world’s problem.</h2><p>Edits are recorded in a private Git history in the app’s own folder, never inside your world. Rolling back is a new entry too, so even an undo can be undone.</p><p><a href="${base}edit-history/">How history works →</a></p></div>
<ol>${[['16:41:07', 'Filled 64×13×64 with stone bricks', 'a41c9e2'], ['16:38:52', 'Replaced water with air', '9f03b71'], ['16:44:30', 'Rolled back to 16:38:52', 'c07e1d3', 'hot'], ['16:30:19', 'Cloned the lighthouse', '5d2e0aa']].map(([t, x, h, hot]) => `<li${hot ? ' class="hot"' : ''}><code>${t}</code><b>${esc(x)}</b><code>${h}</code></li>`).join('')}</ol></div></section>
<section class="band-wrap"><h2>Everything inside</h2><div class="bento">${bento.map(([slug, t, b, cls]) => `<a class="tile ${cls}" href="${base}${slug}/"><strong>${esc(t)}</strong><span>${esc(b)}</span><em>Read the article →</em></a>`).join('')}</div>
<h2 class="all">Every article</h2><div class="grid">${features.map((f) => `<a class="card" href="${base}${f.slug}/"><small>${esc(f.group)}</small><strong>${esc(f.title)}</strong><span>${esc(f.summary)}</span></a>`).join('')}</div></section>`));
for (const f of features) {
  mkdirSync(path.join(out, f.slug), { recursive: true });
  const rel = f.related.map((s) => features.find((x) => x.slug === s)).filter(Boolean);
  writeFileSync(path.join(out, f.slug, 'index.html'), page(`${f.title} · Map Editor`, f.summary, `
<section class="article-hero"><p class="crumb"><a href="${base}">Guide</a> › ${esc(f.group)}</p><h1>${esc(f.title)}</h1><p class="lead">${esc(f.summary)}</p></section>
<div class="article-body"><nav class="toc" aria-label="On this page"><strong>On this page</strong>${f.body.map(([h], i) => `<a href="#s${i}">${esc(h)}</a>`).join('')}</nav>
<article>${f.body.map(([h, t, img], i) => `<h2 id="s${i}">${esc(h)}</h2><p>${esc(t)}</p>${img ? `<figure><img src="${base}screenshots/${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" width="1440" height="900"><figcaption>${esc(img.alt)}</figcaption></figure>` : ''}`).join('')}</article></div>
<section class="band-wrap suggested"><h2>Suggested articles</h2><div class="grid">${rel.map((r) => `<a class="card" href="${base}${r.slug}/"><small>${esc(r.group)}</small><strong>${esc(r.title)}</strong><span>${esc(r.summary)}</span></a>`).join('')}</div></section>`));
}
// Phone edition: every article on one page, laid out for a phone-sized PDF page. The site workflow
// prints it to map-editor-guide-phone.pdf with headless Chrome.
mkdirSync(path.join(out, 'phone'), { recursive: true });
writeFileSync(path.join(out, 'phone', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Map Editor guide, phone edition</title><link rel="stylesheet" href="${base}site.css"><style>
@page { size: 90mm 160mm; margin: 8mm 6mm; }
body { font-size: 11pt; line-height: 1.45; background: #fff; color: #181d17; }
main { max-width: 560px; margin: 0 auto; padding: 12px; }
h1 { font-size: 26pt; line-height: 1; margin: 0 0 8px; font-stretch: 120%; font-weight: 950; }
h2.art { font-size: 17pt; margin: 18px 0 4px; break-before: page; font-weight: 900; }
h3 { font-size: 12pt; margin: 12px 0 2px; }
p { margin: 0 0 8px; } img { max-width: 100%; height: auto; border-radius: 8px; } figure { margin: 6px 0 10px; } figcaption { font-size: 8pt; color: #42493f; }
.toc { position: static; background: none; padding: 0; border-radius: 0; margin: 8px 0; } .toc a { display: block; color: inherit; text-decoration: none; padding: 1px 0; font-size: 10pt; } .muted { color: #42493f; font-size: 9pt; }
</style></head><body><main>
<h1>Map Editor guide</h1><p class="muted">Phone edition · v${esc(pkg.version)} · built from ${esc(commit.slice(0, 7) || 'an unknown commit')} on ${esc(stamp)}</p>
<nav class="toc">${features.map((f, i) => `<a href="#a${i}">${esc(f.title)}</a>`).join('')}</nav>
${features.map((f, i) => `<h2 class="art" id="a${i}">${esc(f.title)}</h2><p><em>${esc(f.summary)}</em></p>${f.body.map(([h, t, img]) => `<h3>${esc(h)}</h3><p>${esc(t)}</p>${img ? `<figure><img src="${base}screenshots/${esc(img.src)}" alt="${esc(img.alt)}"><figcaption>${esc(img.alt)}</figcaption></figure>` : ''}`).join('')}`).join('')}
</main></body></html>`);

// Downloads: buttons for the newest release that carries the Windows installer, from the release
// list the workflow saves (SITE_RELEASES). Without it, the page points at the releases list.
let releases = [];
try { releases = JSON.parse(readFileSync(process.env.SITE_RELEASES ?? path.join(here, 'releases.json'), 'utf8')); } catch { /* not available */ }
const rel = releases.find((r) => !r.draft && !r.prerelease && (r.assets ?? []).some((a) => a.name === 'Map.EditorSetup.exe'));
const asset = (n) => rel?.assets.find((a) => a.name === n);
const mib = (b) => `${(b / 1048576).toFixed(b > 104857600 ? 0 : 1)} MiB`;
const DOWNLOADS = [
  ['Map.EditorSetup.exe', 'Map Editor for Windows', 'The desktop app. Opens worlds from your saves folder; updates itself.', 'desktop-app'],
  ['Map.Editor.DeploySetup.exe', 'Map Editor Deploy for Windows', 'One-click deploy to Docker, VirtualBox, VMware or a USB drive.', 'deploy-app'],
  ['map-editor-appliance-x86_64.ova', 'Appliance for VirtualBox or VMware', 'Import it and the web app starts on boot.', 'appliance'],
  ['map-editor-appliance-x86_64.img.xz', 'Appliance for a USB drive or spare PC', 'Unpack, then write the .img to a drive.', 'appliance'],
  ['map-editor-appliance-rpi-arm64.img.xz', 'Appliance for Raspberry Pi 4 and 5', 'Unpack, then write the .img to an SD card.', 'appliance'],
];
mkdirSync(path.join(out, 'downloads'), { recursive: true });
writeFileSync(path.join(out, 'downloads', 'index.html'), page('Downloads · Map Editor', 'Download Map Editor for Windows, Docker, a virtual machine, a USB drive or a Raspberry Pi.', `
<section class="article-hero"><p class="crumb"><a href="${base}">Guide</a> › Downloads</p><h1>Downloads</h1><p class="lead">${rel ? `Map Editor ${esc(rel.tag_name)}, published ${esc(String(rel.published_at).slice(0, 10))}. Every file below comes from that release.` : 'The newest files are on the releases page.'}</p></section>
<section class="band-wrap"><div class="dl-grid">${rel ? DOWNLOADS.filter(([n]) => asset(n)).map(([n, t, b, slug]) => `<div class="dl-card"><strong>${esc(t)}</strong><span>${esc(b)}</span><a class="btn filled" href="${esc(asset(n).browser_download_url)}" download>Download <small>${esc(mib(asset(n).size))}</small></a><a href="${base}${slug}/">How it works →</a></div>`).join('') : ''}
<div class="dl-card"><strong>Docker</strong><span>Run the web app on any machine with Docker.</span><code>docker run -d -p 8420:8420 -v map-editor-data:/data -v "$PWD/worlds:/worlds" ghcr.io/ding-ding-projects/map-editor:${rel ? esc(rel.tag_name.replace(/^v/, '')) : 'latest'}</code><a href="${base}web-app/">How it works →</a></div></div>
<p class="muted">Reading on a phone? <a href="${base}map-editor-guide-phone.pdf">The whole guide as a phone-sized PDF</a>. ${rel ? `Checksums: <a href="${esc(rel.html_url)}">${esc(rel.tag_name)} on GitHub</a> lists SHA256SUMS for the appliance images. ` : ''}The Windows installers are not code-signed, so Windows SmartScreen may ask before running them. All releases: <a href="${repo}/releases">${repo.replace('https://', '')}/releases</a>.</p></section>`, 'downloads'));
writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Site built: ${features.length + 1} pages in ${out}`);
