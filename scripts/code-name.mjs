// A code name for each release: one dish from the public dim sum catalogue, chosen by the version
// number so the same version always gets the same dish. Nothing from the catalogue is stored here.
// Run: node scripts/code-name.mjs 0.1.121
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';

/** The dish for a version: releases count up through the catalogue in its own order and wrap round. */
export function pickDish(dishes, version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  const list = (Array.isArray(dishes) ? dishes : []).filter((d) => d?.id && d?.name?.en && d?.name?.zhHant);
  if (!m || !list.length) return null;
  const n = Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
  const d = list[n % list.length];
  return { id: String(d.id).slice(0, 40), en: String(d.name.en).slice(0, 120), yue: String(d.name.zhHant).slice(0, 60), jyutping: typeof d.jyutping === 'string' ? d.jyutping.slice(0, 120) : '' };
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = await codeName(process.argv[2] ?? '');
  console.log(c ? `Code name: ${codeNameText(c)}` : 'Code name: unavailable (the public dim sum catalogue could not be reached)');
}
