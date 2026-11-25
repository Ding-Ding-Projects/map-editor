// Writes the Squirrel.Windows update feeds served by the documentation site:
//   <out>/MapEditor/RELEASES and <out>/MapEditorDeploy/RELEASES
// Each line points at the .nupkg attached to the latest GitHub release by its full https URL,
// so the packages themselves are downloaded from the release, not copied into the site.
// Usage: node scripts/update-feed.mjs <out-dir>   (GH_TOKEN optional, GITHUB_REPOSITORY optional)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPS = ['MapEditor', 'MapEditorDeploy'];

/** Rewrites "SHA1 file.nupkg size" lines so the file is an absolute release URL. Throws on anything unexpected. */
export function rewriteReleases(text, urlFor) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('RELEASES is empty');
  return lines.map((line) => {
    const m = /^([0-9a-fA-F]{40})\s+(\S+\.nupkg)\s+(\d+)$/.exec(line.trim().replace(/^﻿/, ''));
    if (!m) throw new Error(`Unexpected RELEASES line: ${line}`);
    const url = urlFor(m[2]);
    if (!url || !url.startsWith('https://')) throw new Error(`No https download for ${m[2]}`);
    return `${m[1].toUpperCase()} ${url} ${m[3]}`;
  }).join('\n') + '\n';
}

async function main(out) {
  const repo = process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/map-editor';
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'map-editor-feed' };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!res.ok) { console.log(`No latest release (${res.status}); no update feed written.`); return; }
  const rel = await res.json();
  const assets = new Map(rel.assets.map((a) => [a.name, a.browser_download_url]));
  for (const id of APPS) {
    const feedUrl = assets.get(`RELEASES-${id}`);
    if (!feedUrl) { console.log(`${rel.tag_name} has no RELEASES-${id}; skipped.`); continue; }
    const text = await (await fetch(feedUrl, { headers: { 'user-agent': 'map-editor-feed' } })).text();
    const feed = rewriteReleases(text, (name) => assets.get(name));
    mkdirSync(path.join(out, id), { recursive: true });
    writeFileSync(path.join(out, id, 'RELEASES'), feed);
    console.log(`Feed ${id} -> ${rel.tag_name}: ${feed.trim().split('\n').length} package(s)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ?? 'site/dist/updates').catch((e) => { console.error(e.message); process.exit(1); });
}
