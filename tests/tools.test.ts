import { describe, expect, it } from 'vitest';
import { coordinates, fromBase64, jsonToTypeScript, toBase64 } from '../src/ui/tools.js';

describe('built-in tools', () => {
  it('round-trips Unicode through Base64 and rejects junk', () => {
    expect(toBase64('點心 dim sum')).toBe(Buffer.from('點心 dim sum').toString('base64'));
    expect(fromBase64(toBase64('點心 dim sum'))).toBe('點心 dim sum');
    expect(fromBase64('aGk')).toBe('hi'); // missing padding
    expect(() => fromBase64('not base64!')).toThrow(/Base64/);
  });
  it('makes TypeScript interfaces, merging list items and marking missing keys optional', () => {
    const ts = jsonToTypeScript('{"name":"S","spawn":{"x":0,"y":64},"players":[{"name":"A","op":true},{"name":"B"}],"tags":["a","b"],"odd key":null}', 'World');
    expect(ts).toContain('export interface World {');
    expect(ts).toContain('  spawn: Spawn;');
    expect(ts).toContain('  players: Player[];');
    expect(ts).toContain('  op?: boolean;');
    expect(ts).toContain('  tags: string[];');
    expect(ts).toContain('  "odd key": null;');
    expect(jsonToTypeScript('[1, "a"]', 'List')).toContain('export type List = (number | string)[];');
    expect(() => jsonToTypeScript('{oops', 'X')).toThrow();
  });
  it('finds chunk, region and Nether positions, including negative ones', () => {
    expect(coordinates(1234, -567)).toEqual({ chunk: [77, -36], inChunk: [2, 9], region: 'r.2.-2.mca', nether: [154, -71], overworldFromNether: [9872, -4536] });
  });
});
