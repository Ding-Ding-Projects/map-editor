import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script shared with the build
import { codeName, codeNameText, pickDish } from '../scripts/code-name.mjs';

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
