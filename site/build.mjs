// Builds the documentation site into site/dist: a landing page plus one article per feature.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { features } from './content.mjs';
import { buildSync } from 'esbuild';

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

// Two languages side by side: every text is written once per language and the reader picks English, Cantonese or both.
// The choice is kept in the browser; without scripts the page reads in English.
let yueContent = {};
try { yueContent = JSON.parse(readFileSync(path.join(here, 'content.yue.json'), 'utf8')); } catch { /* Cantonese articles not written yet */ }
const L = (en, yue) => (yue ? `<span data-l="en" lang="en">${esc(en)}</span><span data-l="yue" lang="yue-Hant-HK">${esc(yue)}</span>` : esc(en));
const yueOf = (f) => yueContent[f.slug] && Array.isArray(yueContent[f.slug].body) && yueContent[f.slug].body.length === f.body.length ? yueContent[f.slug] : undefined;
// The picture shown when a link to the site is shared: the same file as social-preview.png at the repository root.
const SITE = 'https://ding-ding-projects.github.io';
const preview = readFileSync(path.join(root, 'social-preview.png'));
const previewName = `social-preview.${createHash('sha256').update(preview).digest('hex').slice(0, 10)}.png`; // a new address whenever the picture changes
let pagePath = '';
function page(title, desc, main, active = 'guide') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${base}${pagePath}"><meta property="og:site_name" content="Map Editor">
<meta property="og:image" content="${SITE}${base}${previewName}"><meta property="og:image:width" content="1280"><meta property="og:image:height" content="640"><meta property="og:image:alt" content="Map Editor with a world open: the top-down map, the Fill tool and the block palette.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}${base}${previewName}"><meta name="theme-color" content="#2f6b2e">
<link rel="icon" type="image/svg+xml" href="${base}favicon.svg"><link rel="stylesheet" href="${base}site.css">
<script>try{var l=localStorage.getItem('map-editor-site.lang');if(l==='yue'||l==='both')document.documentElement.dataset.lang=l}catch(e){}</script></head><body>
<header class="top"><a class="brand" href="${base}"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="title">Map Editor</span></a>
<nav aria-label="Site"><a href="${base}"${active === 'guide' ? ' aria-current="page"' : ''}>${L('Guide', '指南')}</a><a href="${base}downloads/"${active === 'downloads' ? ' aria-current="page"' : ''}>${L('Downloads', '下載')}</a><a href="${repo}/commits/main">${L('Changelog', '更新紀錄')}</a><a href="${repo}">${L('Source', '原始碼')}</a><a href="#tour" data-tour="page">${L('Take a tour', '睇下導覽')}</a></nav>
<div class="lang-switch" role="group" aria-label="Language"><button type="button" data-set-lang="en" aria-pressed="true">English</button><button type="button" data-set-lang="yue" aria-pressed="false">粵語</button><button type="button" data-set-lang="both" aria-pressed="false">EN + 粵</button></div></header>
<main>${main}</main>
<footer><div><span>Map Editor ${esc(pkg.version)} · updated ${esc(stamp)} · <a href="${repo}/commit/${esc(commit)}">${esc(commit.slice(0, 7) || 'unavailable')}</a></span>
<span>${L('This site documents and downloads Map Editor; it is not the editor. Based on Amulet Map Editor, which needs its own licence. Minecraft is a trademark of Mojang Synergies AB; not affiliated with Mojang or Microsoft.', '呢個網站係 Map Editor 嘅說明同下載頁，唔係編輯器本身。基於 Amulet Map Editor，使用要跟返佢自己嘅授權。Minecraft 係 Mojang Synergies AB 嘅商標；同 Mojang 或者 Microsoft 冇關係。')}</span></div></footer>
<script>(function(){var k='map-editor-site.lang',d=document.documentElement;function set(l){if(l==='en')delete d.dataset.lang;else d.dataset.lang=l;d.lang=l==='yue'?'yue-Hant-HK':'en';document.querySelectorAll('[data-set-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.setLang===l))});try{l==='en'?localStorage.removeItem(k):localStorage.setItem(k,l)}catch(e){}}set(d.dataset.lang||'en');document.querySelectorAll('[data-set-lang]').forEach(function(b){b.addEventListener('click',function(){set(b.dataset.setLang)})})})();</script>
<script src="${base}tour.js" defer></script><script src="${base}dock.js" defer></script>
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
  { k: 'Desktop', t: 'On your PC', b: 'A Windows app that opens worlds straight from your saves folder. Nothing leaves your computer.', c: 'build.bat --run', yk: '桌面版', yt: '喺你部電腦', yb: '一個 Windows 程式，直接開你存檔資料夾入面嘅世界。乜都唔會離開你部電腦。', slug: 'desktop-app', cls: 'w1' },
  { k: 'Web app', t: 'On your network', b: 'One command starts it in Docker. Anyone on your network opens the link; the first person becomes the owner.', c: 'node scripts/setup.mjs', yk: '網頁版', yt: '喺你個網絡', yb: '一句指令就喺 Docker 開到。同一個網絡嘅人開條連結就用得；第一個入嚟嘅人做擁有者。', slug: 'web-app', cls: 'w2' },
  { k: 'Appliance', t: 'On a spare PC', b: 'Flash the image to a USB drive or import it into VirtualBox. It boots straight into Map Editor.', c: 'Map Editor Deploy', yk: '一體機映像', yt: '喺一部閒置電腦', yb: '將映像寫入 USB 手指，或者匯入 VirtualBox，一開機就直接入 Map Editor。', slug: 'appliance', cls: 'w3' },
];
const bento = [
  ['editing', 'Fill, replace, clone, delete, waterlog', 'Amulet’s tools, with a safety limit and missing chunks skipped, never invented.', '填充、替換、複製、刪除、注水', 'Amulet 嘅工具，有安全上限；未生成嘅區塊會跳過，唔會自己作出嚟。', 'b-wide'],
  ['editing', 'Panels you arrange', 'Dock, tab and float the map, tools, history and notes.', '面板任你擺', '地圖、工具、歷史同筆記都可以停靠、疊做分頁或者浮動。', 'b-sec'],
  ['worlds', 'Worlds in, worlds out', 'Upload a .zip, download it again, or start a flat world.', '世界入得又出得', '上載 .zip，再下載返，或者開一個新嘅平地世界。', ''],
  ['appearance', 'Any colour you can type', 'Names, HEX, OKLCH, CMYK and more. The whole theme follows.', '打得出嘅顏色都得', '顏色名、HEX、OKLCH、CMYK 等等都收，成個主題會跟住變。', 'b-ter'],
  ['languages', 'English, 粵語 or both', 'With two separate funny-level sliders.', '英文、粵語，或者兩樣', '仲有兩條獨立嘅搞笑程度滑桿。', ''],
  ['deploy-app', 'One-click deploy', 'Docker, VirtualBox and verified USB flashing, then the working link.', '一撳就部署', 'Docker、VirtualBox，同埋會驗證嘅 USB 寫入，做完畀你一條用得嘅連結。', 'b-wide b-pri'],
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(path.join(here, 'site.css'), path.join(out, 'site.css'));
copyFileSync(path.join(here, 'tour.js'), path.join(out, 'tour.js'));
// The article workspace: dockview bundled into one script (its styles come with it).
buildSync({ entryPoints: [path.join(here, 'dock.entry.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: path.join(out, 'dock.js'), logLevel: 'silent' });
copyFileSync(path.join(here, 'favicon.svg'), path.join(out, 'favicon.svg'));
copyFileSync(path.join(root, 'social-preview.png'), path.join(out, previewName)); // byte-identical to the file at the repository root
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
// list the workflow saves (SITE_RELEASES). Without it, the page points at the releases list.
let releases = [];
try { releases = JSON.parse(readFileSync(process.env.SITE_RELEASES ?? path.join(here, 'releases.json'), 'utf8')); } catch { /* not available */ }
const rel = releases.find((r) => !r.draft && !r.prerelease && (r.assets ?? []).some((a) => a.name === 'Map.EditorSetup.exe'));
const asset = (n) => rel?.assets.find((a) => a.name === n);
pagePath = '';
writeFileSync(path.join(out, 'index.html'), page('Map Editor', 'A Minecraft world editor for your desk, your whole network, or a spare PC. Every edit can be undone.', `
<section class="hero"><div class="hero-copy">
<span class="pill">${L('Java Edition 1.18 and newer, and Bedrock Edition', 'Java 版 1.18 或以上，同埋基岩版')} · v${esc(pkg.version)}</span>
<h1><span data-l="en" lang="en">Edit your world.<br><span>Undo anything.</span></span><span data-l="yue" lang="yue-Hant-HK">改你個世界。<br><span>改錯都返得轉頭。</span></span></h1>
<p>${L('A Minecraft world editor for your desk, your whole network, or a spare PC. Every fill, replace and clone is saved to its own history, so nothing is ever one click from gone.', '一個 Minecraft 世界編輯器，放喺你部電腦、成個屋企網絡，或者一部閒置電腦都得。每次填充、替換同複製都會記落自己嘅歷史，唔會一撳就冇咗。')}</p>
<p class="actions">${asset('Map.EditorSetup.exe') ? `<a class="btn filled" href="${esc(asset('Map.EditorSetup.exe').browser_download_url)}" download>${L('Download for Windows', '下載 Windows 版')} · ${esc(rel.tag_name)}</a><a class="btn outlined" href="${base}downloads/">${L('All downloads', '全部下載')}</a>` : `<a class="btn filled" href="${base}downloads/">${L('Get Map Editor', '攞 Map Editor')}</a>`}<a class="btn outlined" href="${base}web-app/">${L('Run it with Docker', '用 Docker 行')}</a></p></div>
<div class="hero-art"><div class="map" role="img" aria-label="Top-down map of a river valley with a selected area">${mosaic(18, 12)}</div><div class="sel" aria-hidden="true"><span class="wash"></span></div><div class="cursor" aria-hidden="true"></div>
<div class="chip c1" aria-hidden="true"><small>Fill finished</small><b>53,248 blocks</b></div>
<div class="chip c2" aria-hidden="true"><span class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg></span><span><small>History</small><b>Rolled back to 16:38:52</b></span></div></div></section>
<section class="band-wrap"><h2>${L('Three ways to run it', '三種用法')}</h2><div class="ways">${ways.map((w) => `<a class="way ${w.cls}" href="${base}${w.slug}/"><small>${L(w.k, w.yk)}</small><strong>${L(w.t, w.yt)}</strong><span>${L(w.b, w.yb)}</span><code>${esc(w.c)}</code></a>`).join('')}</div></section>
<section class="band-wrap"><h2>${L('How the pieces fit', '各部分點樣夾埋')}</h2><p class="muted">${L('Choose a box to read about it. Every way of running Map Editor uses the same editor and the same history.', '揀一格就睇到佢嘅說明。Map Editor 點樣行都好，用嘅都係同一個編輯器、同一套歷史。')}</p>
<figure class="diagram"><svg viewBox="0 0 960 360" role="group" aria-label="Diagram: three ways to run Map Editor, all using the same editor core and edit history">
${[['desktop-app', 40, 30, 'Desktop app', 'Windows, opens your saves'], ['web-app', 360, 30, 'Docker web app', 'Any browser on your network'], ['appliance', 680, 30, 'Appliance image', 'VM, USB or Raspberry Pi'], ['deploy-app', 680, 250, 'Map Editor Deploy', 'One click onto a machine'], ['editing', 200, 140, 'Editor core', 'Map, tools, structures, biomes'], ['edit-history', 200, 250, 'Edit history', 'Private Git history; undo anything'], ['extensions', 520, 140, 'Extensions', 'Your own commands, with consent']].map(([slug, x, y, t, b]) => `<a href="${base}${slug}/" class="dnode"><rect x="${x}" y="${y}" width="240" height="80" rx="22"/><text x="${Number(x) + 20}" y="${Number(y) + 34}" class="dt">${esc(t)}</text><text x="${Number(x) + 20}" y="${Number(y) + 58}" class="db">${esc(b)}</text></a>`).join('')}
<path class="dedge" d="M160 110 L300 140 M480 110 L360 140 M800 110 L440 140 M320 220 L320 250 M520 180 L440 180 M800 250 L800 110"/></svg></figure></section>
<section class="dark"><div><div><h2><span data-l="en" lang="en">Your history,<br>not your world’s problem.</span><span data-l="yue" lang="yue-Hant-HK">歷史歸歷史，<br>唔會搞亂你個世界。</span></h2><p>${L('Edits are recorded in a private Git history in the app’s own folder, never inside your world. Rolling back is a new entry too, so even an undo can be undone.', '每次改動都記喺程式自己資料夾入面嘅私人 Git 歷史，唔會放入你個世界。還原本身都係一筆新紀錄，所以連還原都可以再還原。')}</p><p><a href="${base}edit-history/">${L('How history works →', '歷史點樣運作 →')}</a></p></div>
<ol>${[['16:41:07', 'Filled 64×13×64 with stone bricks', 'a41c9e2'], ['16:38:52', 'Replaced water with air', '9f03b71'], ['16:44:30', 'Rolled back to 16:38:52', 'c07e1d3', 'hot'], ['16:30:19', 'Cloned the lighthouse', '5d2e0aa']].map(([t, x, h, hot]) => `<li${hot ? ' class="hot"' : ''}><code>${t}</code><b>${esc(x)}</b><code>${h}</code></li>`).join('')}</ol></div></section>
<section class="band-wrap"><h2>${L('Everything inside', '入面有咩')}</h2><div class="bento">${bento.map(([slug, t, b, yt, yb, cls]) => `<a class="tile ${cls}" href="${base}${slug}/"><strong>${L(t, yt)}</strong><span>${L(b, yb)}</span><em>${L('Read the article →', '睇文章 →')}</em></a>`).join('')}</div>
<h2 class="all">${L('Every article', '全部文章')}</h2><div class="grid">${features.map((f) => `<a class="card" href="${base}${f.slug}/"><small>${L(f.group, yueOf(f)?.group)}</small><strong>${L(f.title, yueOf(f)?.title)}</strong><span>${L(f.summary, yueOf(f)?.summary)}</span></a>`).join('')}</div></section>`));
for (const f of features) {
  mkdirSync(path.join(out, f.slug), { recursive: true });
  const rel = f.related.map((s) => features.find((x) => x.slug === s)).filter(Boolean);
  pagePath = `${f.slug}/`;
  const y = yueOf(f);
  writeFileSync(path.join(out, f.slug, 'index.html'), page(`${f.title} · Map Editor`, f.summary, `
<section class="article-hero"><p class="crumb"><a href="${base}">${L('Guide', '指南')}</a> › ${L(f.group, y?.group)}</p><h1>${L(f.title, y?.title)}</h1><p class="lead">${L(f.summary, y?.summary)}</p></section>
<div class="article-body"><nav class="toc" aria-label="On this page"><strong>${L('On this page', '呢頁有咩')}</strong>${f.body.map(([h], i) => `<a href="#s${i}">${L(h, y?.body[i][0])}</a>`).join('')}</nav>
<article>${f.body.map(([h, t, img], i) => `<h2 id="s${i}">${L(h, y?.body[i][0])}</h2><p>${L(t, y?.body[i][1])}</p>${img ? `<figure><img src="${base}screenshots/${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" width="1440" height="900"><figcaption>${esc(img.alt)}</figcaption></figure>` : ''}`).join('')}</article></div>
<section class="band-wrap suggested"><h2>${L('Suggested articles', '推介文章')}</h2><div class="grid">${rel.map((r) => `<a class="card" href="${base}${r.slug}/"><small>${L(r.group, yueOf(r)?.group)}</small><strong>${L(r.title, yueOf(r)?.title)}</strong><span>${L(r.summary, yueOf(r)?.summary)}</span></a>`).join('')}</div></section>`));
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
const mib = (b) => `${(b / 1048576).toFixed(b > 104857600 ? 0 : 1)} MiB`;
const DOWNLOADS = [
  ['Map.EditorSetup.exe', 'Map Editor for Windows', 'The desktop app. Opens worlds from your saves folder; updates itself.', 'desktop-app', 'Windows 版 Map Editor', '桌面程式。直接開你存檔資料夾嘅世界；會自己更新。'],
  ['Map.Editor.DeploySetup.exe', 'Map Editor Deploy for Windows', 'One-click deploy to Docker, VirtualBox, VMware or a USB drive.', 'deploy-app', 'Windows 版 Map Editor Deploy', '一撳就部署去 Docker、VirtualBox、VMware 或者 USB 手指。'],
  ['map-editor-appliance-x86_64.ova', 'Appliance for VirtualBox or VMware', 'Import it and the web app starts on boot.', 'appliance', 'VirtualBox 或 VMware 用嘅一體機映像', '匯入之後，一開機網頁版就會行。'],
  ['map-editor-appliance-x86_64.img.xz', 'Appliance for a USB drive or spare PC', 'Unpack, then write the .img to a drive.', 'appliance', 'USB 手指或閒置電腦用嘅一體機映像', '解壓之後，將 .img 寫入隻碟。'],
  ['map-editor-appliance-rpi-arm64.img.xz', 'Appliance for Raspberry Pi 4 and 5', 'Unpack, then write the .img to an SD card.', 'appliance', 'Raspberry Pi 4 同 5 用嘅一體機映像', '解壓之後，將 .img 寫入 SD 卡。'],
];
mkdirSync(path.join(out, 'downloads'), { recursive: true });
pagePath = 'downloads/';
writeFileSync(path.join(out, 'downloads', 'index.html'), page('Downloads · Map Editor', 'Download Map Editor for Windows, Docker, a virtual machine, a USB drive or a Raspberry Pi.', `
<section class="article-hero"><p class="crumb"><a href="${base}">${L('Guide', '指南')}</a> › ${L('Downloads', '下載')}</p><h1>${L('Downloads', '下載')}</h1><p class="lead">${rel ? L(`Map Editor ${rel.tag_name}, published ${String(rel.published_at).slice(0, 10)}. Every file below comes from that release.`, `Map Editor ${rel.tag_name}，${String(rel.published_at).slice(0, 10)} 發佈。下面每個檔案都係嚟自呢個版本。`) : L('The newest files are on the releases page.', '最新嘅檔案喺發佈頁。')}</p></section>
<section class="band-wrap"><div class="dl-grid">${rel ? DOWNLOADS.filter(([n]) => asset(n)).map(([n, t, b, slug, yt, yb]) => `<div class="dl-card"><strong>${L(t, yt)}</strong><span>${L(b, yb)}</span><a class="btn filled" href="${esc(asset(n).browser_download_url)}" download>${L('Download', '下載')} <small>${esc(mib(asset(n).size))}</small></a><a href="${base}${slug}/">${L('How it works →', '點樣運作 →')}</a></div>`).join('') : ''}
<div class="dl-card"><strong>Docker</strong><span>${L('Run the web app on any machine with Docker.', '有 Docker 嘅機都行到網頁版。')}</span><code>docker run -d -p 8420:8420 -v map-editor-data:/data -v "$PWD/worlds:/worlds" ghcr.io/ding-ding-projects/map-editor:${rel ? esc(rel.tag_name.replace(/^v/, '')) : 'latest'}</code><a href="${base}web-app/">${L('How it works →', '點樣運作 →')}</a></div></div>
<p class="muted">${L('Reading on a phone?', '用手機睇？')} <a href="${base}map-editor-guide-phone.pdf">${L('The whole guide as a phone-sized PDF', '成份指南嘅手機尺寸 PDF（英文）')}</a>. ${rel ? `Checksums: <a href="${esc(rel.html_url)}">${esc(rel.tag_name)} on GitHub</a> lists SHA256SUMS for the appliance images. ` : ''}${L('The Windows installers are not code-signed, so Windows SmartScreen may ask before running them.', 'Windows 安裝檔冇程式碼簽署，所以 Windows SmartScreen 開之前可能會問你一次。')} All releases: <a href="${repo}/releases">${repo.replace('https://', '')}/releases</a>.</p></section>`, 'downloads'));
writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Site built: ${features.length + 1} pages in ${out}`);
