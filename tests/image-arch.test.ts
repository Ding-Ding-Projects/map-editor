import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script without type declarations
import { imageArchitectures } from '../scripts/image-arch.mjs';

function tarEntry(name: string, body: string): Buffer {
  const data = Buffer.from(body);
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write('0000644\0', 100);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('0', 156);
  header.write('ustar\0', 257);
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

function archive(arch: string): Buffer {
  return Buffer.concat([
    tarEntry('abc.json', JSON.stringify({ architecture: arch, os: 'linux' })),
    tarEntry('manifest.json', JSON.stringify([{ Config: 'abc.json', RepoTags: ['map-editor:1'] }])),
    Buffer.alloc(1024),
  ]);
}

describe('saved image architecture check', () => {
  it('reads the architecture of each saved image', () => {
    expect(imageArchitectures(archive('arm64'))).toEqual([{ tags: ['map-editor:1'], architecture: 'arm64', os: 'linux' }]);
    expect(imageArchitectures(archive('amd64'))[0].architecture).toBe('amd64');
  });
  it('rejects an archive without a manifest', () => {
    expect(() => imageArchitectures(Buffer.concat([tarEntry('x.txt', 'hi'), Buffer.alloc(1024)]))).toThrow(/manifest/);
  });
});
