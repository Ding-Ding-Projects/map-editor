// A code name for each release: one dish from the public dim sum catalogue, chosen by the version
// number so the same version always gets the same dish. Nothing from the catalogue is stored here.
// Run: node scripts/code-name.mjs 0.1.121
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PHOTO_BASE = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/';
export const CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';

/** The dish for a version: releases count up through the catalogue in its own order and wrap round. */
export function pickDish(dishes, version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  const list = (Array.isArray(dishes) ? dishes : []).filter((d) => d?.id && d?.name?.en && d?.name?.zhHant);
  if (!m || !list.length) return null;
  const n = Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
  const d = list[n % list.length];
  // The photo stays in the public catalogue; only a link to it is given, and only for a plain image path there.
  const img = typeof d.image?.path === 'string' && /^images\/[A-Za-z0-9._-]{1,120}\.(png|jpe?g|webp)$/.test(d.image.path) ? `${PHOTO_BASE}${d.image.path}` : '';
  return { id: String(d.id).slice(0, 40), en: String(d.name.en).slice(0, 120), yue: String(d.name.zhHant).slice(0, 60), jyutping: typeof d.jyutping === 'string' ? d.jyutping.slice(0, 120) : '', photo: img };
}

/** Fetches the catalogue and picks; null when it cannot be reached, so a build never fails on this. */
export async function codeName(version, fetchFn = fetch) {
  try {
    const res = await fetchFn(CATALOG_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return pickDish((await res.json()).dishes, version);
  } catch { return null; }
}

export const codeNameText = (c) => (c ? `${c.en} (${c.yue}${c.jyutping ? `, ${c.jyutping}` : ''})` : '');

/** The lines a release note carries: the dish and a link to its photo, or a plain statement that there is none. */
export function releaseLines(c, photoThere = Boolean(c?.photo)) {
  if (!c) return ['Code name: unavailable (the public dim sum catalogue could not be reached). This release is identified by its version only.'];
  const none = c.photo ? 'Photo: the catalogue names one for this dish but it is not published there yet, so this release is identified by its name and version only.'
    : 'Photo: the catalogue has none for this dish, so this release is identified by its name and version only.';
  return [`Code name: ${codeNameText(c)}`, c.photo && photoThere ? `Photo of the dish, in the public catalogue: ${c.photo}` : none];
}

/** Whether the photo link answers, so a release note never carries a dead link. Any failure counts as no. */
export async function photoResolves(url, fetchFn = fetch) {
  if (!url) return false;
  try { const r = await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) }); return r.ok; } catch { return false; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = await codeName(process.argv[2] ?? '');
  console.log(releaseLines(c, await photoResolves(c?.photo)).join('\n'));
}
