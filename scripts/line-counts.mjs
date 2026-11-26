// Counts the lines of the tracked files at this commit, by kind and by part of the project.
// Left out, and said so in the output: the design canvas export (design/), the generated guide pages
// (docs/features/<category>/), the generated API collection, lock files and pictures.
// Run: node scripts/line-counts.mjs          (add --json for the numbers alone)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = { ts: 'TypeScript', mjs: 'JavaScript', js: 'JavaScript', css: 'CSS', html: 'HTML', sh: 'Shell', ps1: 'PowerShell', bat: 'Batch', py: 'Python', md: 'Markdown', yml: 'YAML' };
export const EXCLUDED = ['design/', 'docs/features/*/ (generated guide pages)', 'docs/postman/ (generated)', 'package-lock.json', 'pictures and fonts'];
const skip = (f) => f.startsWith('design/') || /^docs\/features\/[^/]+\//.test(f) || f.startsWith('docs/postman/') || f === 'package-lock.json';
const partOf = (f) => (f.startsWith('tests/') ? 'Tests' : f.endsWith('.css') ? 'Styles' : f.startsWith('src/') ? 'Source' : /^(scripts|site|appliance|\.github)\//.test(f) ? 'Build, site and release' : 'Documents and other');

/** Counts from a list of [file, text]. Lines are newline-separated; a blank line holds only white space. */
export function countLines(files) {
  const kinds = {}, parts = {}; let total = 0, nonBlank = 0, counted = 0;
  for (const [file, text] of files) {
    const kind = KINDS[file.split('.').pop() ?? ''];
    if (!kind || skip(file)) continue;
    const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
    const filled = lines.filter((l) => l.trim()).length;
    kinds[kind] = (kinds[kind] ?? 0) + lines.length; parts[partOf(file)] = (parts[partOf(file)] ?? 0) + lines.length;
    total += lines.length; nonBlank += filled; counted++;
  }
  return { kinds, parts, total, nonBlank, files: counted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const r = countLines(tracked.map((f) => { try { return [f, readFileSync(path.join(root, f), 'utf8')]; } catch { return [f, '']; } }));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r)); }
  else {
    const n = (x) => x.toLocaleString('en');
    console.log('Lines of code at this commit (node scripts/line-counts.mjs):');
    for (const [k, v] of Object.entries(r.kinds).sort((a, b) => b[1] - a[1])) console.log(`- ${k}: ${n(v)}`);
    console.log(`By part: ${Object.entries(r.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${n(v)}`).join(' · ')}`);
    console.log(`Total: ${n(r.total)} lines in ${n(r.files)} files, ${n(r.nonBlank)} not blank.`);
    console.log(`Not counted: ${EXCLUDED.join(', ')}.`);
  }
}
