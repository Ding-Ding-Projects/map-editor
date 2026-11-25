import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DimSum, trimCatalog } from '../src/server/dimsum.js';

const sample = { dishes: [
  { id: 'hk-dish-0001', name: { en: 'Classic Har Gow', zhHant: '蝦餃' }, jyutping: 'haa1 gaau2', category: 'steamed-dim-sum', description: { en: 'Shrimp dumpling.', yue: '蒸餃。' }, image: { path: 'images/x.png', alt: { en: 'Har gow', yue: '蝦餃' } }, imagePrompt: 'long text not needed' },
  { id: '', name: { en: 'No id' } },
  { id: 'hk-dish-0002', name: { en: 'Siu Mai' } },
] };
const fakeFetch = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { etag: '"rev1"' } })) as unknown as typeof fetch;

describe('dim sum catalogue', () => {
  it('keeps only complete dishes and the fields the card uses', () => {
    const c = trimCatalog(sample, 'r');
    expect(c.dishes).toHaveLength(1);
    expect(c.dishes[0]).toEqual({ id: 'hk-dish-0001', name: { en: 'Classic Har Gow', zhHant: '蝦餃' }, jyutping: 'haa1 gaau2', category: 'steamed-dim-sum', description: { en: 'Shrimp dumpling.', yue: '蒸餃。' }, alt: { en: 'Har gow', yue: '蝦餃' } });
    expect(() => trimCatalog({}, 'r')).toThrow(/no dishes/);
    expect(() => trimCatalog({ dishes: [{ id: 'x' }] }, 'r')).toThrow(/no usable/);
  });
  it('caches with source and revision, and keeps the cache when offline', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'me-ds-'));
    const a = await new DimSum(dir, fakeFetch(sample)).random();
    expect(a).toMatchObject({ total: 1, revision: '"rev1"', image: null, dish: { id: 'hk-dish-0001' } });
    const cached = JSON.parse(await readFile(path.join(dir, 'dimsum', 'catalog.json'), 'utf8'));
    expect(cached.source).toMatch(/dim-sum-photos/);
    const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect((await new DimSum(dir, offline).random()).dish.id).toBe('hk-dish-0001');
    await expect(new DimSum(await mkdtemp(path.join(os.tmpdir(), 'me-ds-')), offline).random()).rejects.toThrow(/offline/);
    await expect(new DimSum(await mkdtemp(path.join(os.tmpdir(), 'me-ds-')), fakeFetch({}, 404)).random()).rejects.toThrow(/404/);
  });
});
