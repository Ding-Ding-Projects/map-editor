import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script shared with the build
import { codeName, codeNameText, pickDish, releaseLines, photoResolves, PHOTO_BASE } from '../scripts/code-name.mjs';

const dishes = [1, 2, 3].map((n) => ({ id: `d${n}`, name: { en: `Dish ${n}`, zhHant: `點心${n}` }, jyutping: `dim2 sam1 ${n}` }));

describe('release code names', () => {
  it('gives the same dish for the same version and the next dish for the next release', () => {
    expect(pickDish(dishes, '0.1.3')).toEqual(pickDish(dishes, '0.1.3'));
    expect(pickDish(dishes, '0.1.3').id).not.toBe(pickDish(dishes, '0.1.4').id);
    expect(pickDish(dishes, 'v0.1.3-rc1')).toBeNull(); expect(pickDish(dishes, '0.0.4').id).toBe('d2');
  });
  it('skips broken entries and gives nothing without a catalogue or a version', () => {
    expect(pickDish([{ id: 'x' }, ...dishes], '0.0.0').id).toBe('d1');
    expect(pickDish([], '0.1.0')).toBeNull(); expect(pickDish(undefined, '0.1.0')).toBeNull(); expect(pickDish(dishes, 'unavailable')).toBeNull();
  });
  it('never fails a build when the catalogue cannot be reached', async () => {
    expect(await codeName('0.1.0', async () => { throw new Error('offline'); })).toBeNull();
    expect(await codeName('0.1.0', async () => ({ ok: false }))).toBeNull();
    expect(codeNameText(await codeName('0.0.1', async () => ({ ok: true, json: async () => ({ dishes }) })))).toBe('Dish 2 (點心2, dim2 sam1 2)');
    expect(codeNameText(null)).toBe('');
  });
});

describe('release note lines for the code name', () => {
  it('links the photo when the catalogue has a plain image path, and says so when it has none or cannot be reached', async () => {
    const dish = (image?: unknown) => [{ id: 'd1', name: { en: 'Har Gow', zhHant: '蝦餃' }, jyutping: 'haa1 gaau2', image }];
    const withPhoto = pickDish(dish({ path: 'images/d1-har-gow.png' }), '0.0.0');
    expect(withPhoto.photo).toBe(`${PHOTO_BASE}images/d1-har-gow.png`);
    expect(releaseLines(withPhoto)).toEqual(['Code name: Har Gow (蝦餃, haa1 gaau2)', `Photo of the dish, in the public catalogue: ${PHOTO_BASE}images/d1-har-gow.png`]);
    for (const bad of [undefined, {}, { path: '../secret.png' }, { path: 'https://elsewhere.example/x.png' }, { path: 'images/a b.png' }, { path: 'images/x.svg' }]) {
      const c = pickDish(dish(bad), '0.0.0');
      expect(c.photo, JSON.stringify(bad)).toBe('');
      expect(releaseLines(c)[1]).toMatch(/has none for this dish/);
    }
    expect(releaseLines(null)).toEqual([expect.stringMatching(/unavailable.*version only/)]);
    // A photo the catalogue names but has not published is never linked.
    expect(releaseLines(withPhoto, false)[1]).toMatch(/not published there yet/);
    expect(await photoResolves(withPhoto.photo, async () => ({ ok: false }) as Response)).toBe(false);
    expect(await photoResolves(withPhoto.photo, async () => ({ ok: true }) as Response)).toBe(true);
    expect(await photoResolves(withPhoto.photo, async () => { throw new Error('offline'); })).toBe(false);
    expect(await photoResolves('')).toBe(false);
  });
});
