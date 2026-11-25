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

describe('file converter', () => {
  it('reads gzip NBT (as level.dat is stored) into readable JSON', async () => {
    const { readNbtFile } = await import('../src/ui/tools.js');
    const { nbt, writeNbt } = await import('../src/core/nbt.js');
    const { gzipSync } = await import('node:zlib');
    const data = gzipSync(writeNbt({ name: '', tag: nbt.compound({ Data: nbt.compound({ LevelName: nbt.string('Island'), Time: nbt.long(42n), Pos: nbt.intArray(Int32Array.from([1, 2])) }) }) }));
    expect(await readNbtFile(new Uint8Array(data))).toEqual({ Data: { LevelName: 'Island', Time: '42L', Pos: [1, 2] } });
  });
});

describe('server.properties editor', () => {
  it('changes and adds keys while keeping comments and order', async () => {
    const { parseProperties, setProperty, printProperties } = await import('../src/ui/tools.js');
    const lines = parseProperties('#Minecraft server properties\nmotd=Hello\n\npvp=true\nquery.port=25565');
    setProperty(lines, 'pvp', 'false'); setProperty(lines, 'max-players', '8'); setProperty(lines, 'motd', 'two\nlines');
    expect(printProperties(lines)).toBe('#Minecraft server properties\nmotd=two lines\n\npvp=false\nquery.port=25565\nmax-players=8');
  });
});
