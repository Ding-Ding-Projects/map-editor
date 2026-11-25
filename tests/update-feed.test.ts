import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module script without types
import { rewriteReleases } from '../scripts/update-feed.mjs';

const url = (n: string) => `https://github.com/Ding-Ding-Projects/map-editor/releases/download/v0.1.30/${n}`;

describe('update feed', () => {
  it('points every package at its release download', () => {
    const out = rewriteReleases('﻿a94a8fe5ccb19ba61c4c0873d391e987982fbbd3 MapEditor-0.1.30-full.nupkg 157957397\r\n', url);
    expect(out).toBe(`A94A8FE5CCB19BA61C4C0873D391E987982FBBD3 ${url('MapEditor-0.1.30-full.nupkg')} 157957397\n`);
  });
  it('keeps full and delta packages in order', () => {
    const out = rewriteReleases([
      '1111111111111111111111111111111111111111 MapEditor-0.1.30-full.nupkg 10',
      '2222222222222222222222222222222222222222 MapEditor-0.1.30-delta.nupkg 5',
    ].join('\n'), url);
    expect(out.trim().split('\n')).toHaveLength(2);
    expect(out).toContain('delta.nupkg 5');
  });
  it('refuses empty, malformed or unattached entries', () => {
    expect(() => rewriteReleases('', url)).toThrow(/empty/);
    expect(() => rewriteReleases('nothash MapEditor.nupkg 1', url)).toThrow(/Unexpected/);
    expect(() => rewriteReleases('1111111111111111111111111111111111111111 Missing.nupkg 1', () => undefined)).toThrow(/No https/);
    expect(() => rewriteReleases('1111111111111111111111111111111111111111 A.nupkg 1', () => 'http://insecure/A.nupkg')).toThrow(/No https/);
  });
});
