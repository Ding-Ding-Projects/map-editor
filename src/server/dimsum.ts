// Dim sum surprise: bilingual dish names and descriptions from the public Ding-Ding-Projects
// dim-sum catalog. Metadata is fetched by the server (so the page keeps its strict CSP), trimmed to
// what the card shows, and cached in the data folder with its source and revision. Dish photos are
// published only as encrypted release volumes, so the card shows "Public image unavailable".
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 32 * 1024 * 1024;

export interface Dish { id: string; name: { en: string; zhHant: string }; jyutping?: string; category?: string; description: { en: string; yue: string }; alt?: { en: string; yue: string } }
export interface Catalog { source: string; revision: string; fetchedAt: string; dishes: Dish[] }

/** Keeps only well-formed dishes and only the fields the card uses. */
export function trimCatalog(raw: unknown, revision: string, source = CATALOG_URL): Catalog {
  const list = (raw as { dishes?: unknown[] })?.dishes;
  if (!Array.isArray(list)) throw new Error('The dim sum catalog has no dishes list.');
  const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');
  const dishes: Dish[] = [];
  for (const d of list as Array<Record<string, any>>) {
    const en = str(d?.name?.en, 120), zh = str(d?.name?.zhHant, 60);
    if (!str(d?.id, 40) || !en || !zh) continue;
    dishes.push({
      id: str(d.id, 40), name: { en, zhHant: zh }, jyutping: str(d.jyutping, 120) || undefined, category: str(d.category, 60) || undefined,
      description: { en: str(d?.description?.en), yue: str(d?.description?.yue) },
      alt: d?.image?.alt ? { en: str(d.image.alt.en, 200), yue: str(d.image.alt.yue, 200) } : undefined,
    });
  }
  if (!dishes.length) throw new Error('The dim sum catalog has no usable dishes.');
  return { source, revision, fetchedAt: new Date().toISOString(), dishes };
}

export class DimSum {
  private mem: Catalog | undefined;
  constructor(private dir: string, private fetchImpl: typeof fetch = fetch, private url = CATALOG_URL) {}
  private get file() { return path.join(this.dir, 'dimsum', 'catalog.json'); }

  async catalog(): Promise<Catalog> {
    if (!this.mem) { try { this.mem = JSON.parse(await fs.readFile(this.file, 'utf8')) as Catalog; } catch { /* no cache yet */ } }
    const stale = !this.mem || Date.now() - Date.parse(this.mem.fetchedAt) > MAX_AGE_MS;
    if (stale) {
      try { this.mem = await this.refresh(); } catch (e) { if (!this.mem) throw e; /* offline: keep the cached copy */ }
    }
    return this.mem!;
  }

  private async refresh(): Promise<Catalog> {
    const res = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`The dim sum catalog answered ${res.status}.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('The dim sum catalog is larger than expected.');
    const cat = trimCatalog(JSON.parse(text), res.headers.get('etag') ?? res.headers.get('last-modified') ?? 'unknown', this.url);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(`${this.file}.tmp`, JSON.stringify(cat));
    await fs.rename(`${this.file}.tmp`, this.file);
    return cat;
  }

  async random(): Promise<{ dish: Dish; total: number; source: string; revision: string; image: null }> {
    const c = await this.catalog();
    return { dish: c.dishes[Math.floor(Math.random() * c.dishes.length)], total: c.dishes.length, source: c.source, revision: c.revision, image: null };
  }
}
