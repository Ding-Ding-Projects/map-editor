// Builds every form from one source tree into dist/.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
let commit = process.env.SOURCE_COMMIT ?? 'unavailable';
let builtAt = process.env.SOURCE_DATE ?? null;
try {
  if (commit === 'unavailable') commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  if (!builtAt) builtAt = new Date(Number(execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: root }).toString().trim()) * 1000).toISOString();
} catch { /* not a git checkout: provenance stays honestly unavailable */ }

const dist = path.join(root, 'dist');
mkdirSync(path.join(dist, 'ui'), { recursive: true });
// Changelog from the real commit history (subject line only), newest first.
let changelog = [];
try {
  const out = execFileSync('git', ['log', '-200', '--format=%H%x1f%cI%x1f%s'], { cwd: root }).toString().trim();
  changelog = out ? out.split('\n').map((l) => { const [sha, date, subject] = l.split('\x1f'); return { sha, date, subject }; }) : [];
} catch { /* not a checkout: the About screen says the changelog is unavailable */ }
// Updated-at comes from the source commit time, never the clock of whoever builds it.
writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify({ version: pkg.version, commit, builtAt, changelog }, null, 2));

const common = { bundle: true, sourcemap: true, logLevel: 'info', legalComments: 'linked' };
await build({ ...common, entryPoints: [path.join(root, 'src/ui/regex-worker.ts')], outfile: path.join(dist, 'ui/regex-worker.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
await build({ ...common, entryPoints: [path.join(root, 'src/ui/main.ts')], outfile: path.join(dist, 'ui/app.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
copyFileSync(path.join(root, 'src/ui/index.html'), path.join(dist, 'ui/index.html'));
copyFileSync(path.join(root, 'src/ui/styles.css'), path.join(dist, 'ui/app.css'));
// TinyMCE is self-hosted next to the UI (GPL licence key); only the files the editor loads.
for (const part of ['tinymce.min.js', 'license.md', 'themes', 'models', 'icons', 'skins', 'plugins/lists', 'plugins/link', 'plugins/table', 'plugins/autolink']) {
  cpSync(path.join(root, 'node_modules/tinymce', part), path.join(dist, 'ui/tinymce', part), { recursive: true });
}
await build({ ...common, entryPoints: [path.join(root, 'src/server/server.ts')], outfile: path.join(dist, 'server/server.mjs'), format: 'esm', platform: 'node', target: 'node22',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
for (const app of ['desktop', 'deploy']) {
  await build({ ...common, entryPoints: [path.join(root, `src/${app}/preload.ts`)], outfile: path.join(dist, `${app}/preload.cjs`), format: 'cjs', platform: 'node', target: 'node22', external: ['electron'] });
  await build({ ...common, entryPoints: [path.join(root, `src/${app}/main.ts`)], outfile: path.join(dist, `${app}/main.cjs`), format: 'cjs', platform: 'node', target: 'node22', external: ['electron'] });
}
await build({ ...common, entryPoints: [path.join(root, 'src/deploy/ui.ts')], outfile: path.join(dist, 'deploy/ui.js'), format: 'esm', platform: 'browser', target: 'es2022', minify: true });
copyFileSync(path.join(root, 'src/deploy/index.html'), path.join(dist, 'deploy/index.html'));
copyFileSync(path.join(root, 'src/ui/styles.css'), path.join(dist, 'deploy/app.css'));
console.log(`Built ${pkg.version} at commit ${commit}`);
