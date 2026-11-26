// Builds every form from one source tree into dist/.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.APP_VERSION || pkg.version;
let commit = process.env.SOURCE_COMMIT ?? 'unavailable';
let builtAt = process.env.SOURCE_DATE ?? null;
try {
  if (commit === 'unavailable') commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  if (!builtAt) builtAt = new Date(Number(execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: root }).toString().trim()) * 1000).toISOString();
} catch { /* not a git checkout: provenance stays honestly unavailable */ }

const dist = path.join(root, 'dist');
mkdirSync(path.join(dist, 'ui'), { recursive: true });
// Changelog from the real commit history, newest first.
let changelog = [];
try {
  const out = execFileSync('git', ['log', '-200', '--format=%H%x1f%cI%x1f%s%x1f%b%x1e'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString();
  // The body is kept (without trailers such as Co-Authored-By) so About can show the full note for each change.
  changelog = out.split('\x1e').map((l) => l.replace(/^\n+/, '')).filter(Boolean).map((l) => { const [sha, date, subject, body = ''] = l.split('\x1f'); return { sha, date, subject, body: body.split('\n').filter((x) => !/^[A-Za-z-]+-[Bb]y: |^Claude-Session: /.test(x)).join('\n').trim().slice(0, 4000) }; });
} catch { /* not a checkout: the About screen says the changelog is unavailable */ }
// Updated-at comes from the source commit time, never the clock of whoever builds it.
// Release code name: a dish from the public dim sum catalogue, by version. Left out when the catalogue cannot be reached.
const { codeName: pickCodeName } = await import('./code-name.mjs');
const codeName = process.env.NO_CODE_NAME ? null : await pickCodeName(version);
writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify({ version: version, commit, builtAt, codeName, changelog }, null, 2));

const common = { bundle: true, sourcemap: true, logLevel: 'info', legalComments: 'linked' };
// The documentation site's tour script is committed so the site builds without installing anything.
await build({ ...common, entryPoints: [path.join(root, 'src/site/tour.ts')], outfile: path.join(root, 'site/tour.js'), format: 'iife', platform: 'browser', target: 'es2020', minify: true, sourcemap: false, legalComments: 'none' });
await build({ ...common, entryPoints: [path.join(root, 'src/ui/regex-worker.ts')], outfile: path.join(dist, 'ui/regex-worker.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
await build({ ...common, entryPoints: [path.join(root, 'src/ui/main.ts')], outfile: path.join(dist, 'ui/app.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
copyFileSync(path.join(root, 'src/ui/index.html'), path.join(dist, 'ui/index.html'));
copyFileSync(path.join(root, 'src/ui/styles.css'), path.join(dist, 'ui/app.css'));
// Bundled fonts (SIL Open Font License): the app never fetches fonts from the network.
export const FONT_FILES = [
  ['@fontsource-variable/roboto-flex/files/roboto-flex-latin-standard-normal.woff2', 'roboto-flex-latin.woff2'],
  ['@fontsource-variable/roboto-flex/files/roboto-flex-latin-ext-standard-normal.woff2', 'roboto-flex-latin-ext.woff2'],
  ['@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2', 'roboto-mono-latin.woff2'],
  ['@fontsource-variable/roboto-mono/files/roboto-mono-latin-ext-wght-normal.woff2', 'roboto-mono-latin-ext.woff2'],
];
for (const app of ['ui', 'deploy']) {
  mkdirSync(path.join(dist, app, 'fonts'), { recursive: true });
  copyFileSync(path.join(root, 'src/ui/favicon.svg'), path.join(dist, app, 'favicon.svg'));
  for (const [from, to] of FONT_FILES) copyFileSync(path.join(root, 'node_modules', from), path.join(dist, app, 'fonts', to));
  copyFileSync(path.join(root, 'node_modules/@fontsource-variable/roboto-flex/LICENSE'), path.join(dist, app, 'fonts', 'OFL-roboto-flex.txt'));
  copyFileSync(path.join(root, 'node_modules/@fontsource-variable/roboto-mono/LICENSE'), path.join(dist, app, 'fonts', 'OFL-roboto-mono.txt'));
}
// TinyMCE is self-hosted next to the UI (GPL licence key); only the files the editor loads.
for (const part of ['tinymce.min.js', 'license.md', 'themes', 'models', 'icons', 'skins', 'plugins/lists', 'plugins/link', 'plugins/table', 'plugins/autolink']) {
  cpSync(path.join(root, 'node_modules/tinymce', part), path.join(dist, 'ui/tinymce', part), { recursive: true });
}
// Built-in extensions ship next to the server as plain folders, exactly like user extensions.
cpSync(path.join(root, 'extensions'), path.join(dist, 'extensions'), { recursive: true });
await build({ ...common, entryPoints: [path.join(root, 'src/server/server.ts')], outfile: path.join(dist, 'server/server.mjs'), format: 'esm', platform: 'node', target: 'node22',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
for (const app of ['desktop', 'deploy']) {
  await build({ ...common, entryPoints: [path.join(root, `src/${app}/preload.ts`)], outfile: path.join(dist, `${app}/preload.cjs`), format: 'cjs', platform: 'node', target: 'node22', external: ['electron'] });
  await build({ ...common, entryPoints: [path.join(root, `src/${app}/main.ts`)], outfile: path.join(dist, `${app}/main.cjs`), format: 'cjs', platform: 'node', target: 'node22', external: ['electron'] });
}
await build({ ...common, entryPoints: [path.join(root, 'src/deploy/ui.ts')], outfile: path.join(dist, 'deploy/ui.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
copyFileSync(path.join(root, 'src/deploy/index.html'), path.join(dist, 'deploy/index.html'));
copyFileSync(path.join(root, 'assets/icon.png'), path.join(dist, 'icon.png')); // window icon where the program file carries none (Linux, development)
copyFileSync(path.join(root, 'src/ui/styles.css'), path.join(dist, 'deploy/app.css'));
console.log(`Built ${version} at commit ${commit}`);
