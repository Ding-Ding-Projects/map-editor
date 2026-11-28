import { describe, expect, it } from 'vitest';
import { MapTiles, visibleTiles, tileRect, TILE_BLOCKS, type Tile } from '../src/ui/maptiles.js';

interface Pic { name: string; closed: boolean; close(): void }

/** A loader that answers only when told to, so the order of arrivals is under the test's control. */
function loader() {
  const asked: Array<{ key: string; ok: () => Pic; fail: () => void }> = [];
  const load = (dim: string, [x, z]: Tile) => new Promise<Pic>((resolve, reject) => {
    const key = `${dim}:${x}:${z}`;
    asked.push({
      key,
      ok: () => { const pic: Pic = { name: key, closed: false, close() { pic.closed = true; } }; resolve(pic); return pic; },
      fail: () => reject(new Error('no')),
    });
  });
  return { asked, load };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('map tiles', () => {
  it('covers the whole view when zoomed far out, with the tiles on screen first', () => {
    const [w, h, scale] = [1920, 1080, 0.5];
    const shown = visibleTiles(-700, -900, scale, w, h, 0);
    const has = (bx: number, bz: number) => shown.some(([x, z]) => x === Math.floor(bx / TILE_BLOCKS) && z === Math.floor(bz / TILE_BLOCKS));
    for (const [px, py] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) expect(has(-700 + px / scale, -900 + py / scale)).toBe(true);
    const withRing = visibleTiles(-700, -900, scale, w, h);
    expect(withRing.length).toBeGreaterThan(shown.length);
    expect(withRing.slice(0, shown.length)).toEqual(shown);
  });

  it('places neighbouring tiles edge to edge at an uneven zoom', () => {
    const a = tileRect([0, 0], 3, 7, 0.9765625), right = tileRect([1, 0], 3, 7, 0.9765625), below = tileRect([0, 1], 3, 7, 0.9765625);
    expect(a.x + a.w).toBe(right.x);
    expect(a.y + a.h).toBe(below.y);
  });

  it('keeps the old picture on screen until its replacement has arrived', async () => {
    const { asked, load } = loader();
    const tiles = new MapTiles<Pic>(load, () => undefined, () => undefined);
    tiles.want('overworld', [[0, 0]]);
    const first = asked[0].ok(); await settle();
    tiles.invalidate();
    tiles.want('overworld', [[0, 0]]);
    expect(tiles.get('overworld', [0, 0])).toBe(first);
    expect(first.closed).toBe(false);
    const second = asked[1].ok(); await settle();
    expect(tiles.get('overworld', [0, 0])).toBe(second);
    expect(first.closed).toBe(true);
  });

  it('does not ask twice for a tile it has or is loading', async () => {
    const { asked, load } = loader();
    const tiles = new MapTiles<Pic>(load, () => undefined, () => undefined);
    tiles.want('overworld', [[0, 0]]);
    tiles.want('overworld', [[0, 0]]);
    asked[0].ok(); await settle();
    tiles.want('overworld', [[0, 0]]);
    expect(asked).toHaveLength(1);
  });

  it('loads a tile again when the world changed while it was on the way', async () => {
    const { asked, load } = loader();
    const tiles = new MapTiles<Pic>(load, () => undefined, () => undefined);
    tiles.want('overworld', [[0, 0]]);
    tiles.invalidate();
    asked[0].ok(); await settle();
    expect(asked).toHaveLength(2);
  });

  it('limits requests in flight and follows the latest view', async () => {
    const { asked, load } = loader();
    const tiles = new MapTiles<Pic>(load, () => undefined, () => undefined, 256, 2);
    tiles.want('overworld', [[0, 0], [1, 0], [2, 0]]);
    expect(asked).toHaveLength(2);
    tiles.want('overworld', [[9, 9]]);
    asked[0].ok(); await settle();
    expect(asked.map((a) => a.key)).toEqual(['overworld:0:0', 'overworld:1:0', 'overworld:9:9']);
  });

  it('reports a run of failures once and retries only when asked', async () => {
    const { asked, load } = loader();
    let reports = 0;
    const tiles = new MapTiles<Pic>(load, () => undefined, () => { reports++; });
    tiles.want('overworld', [[0, 0], [1, 0]]);
    asked[0].fail(); asked[1].fail(); await settle();
    expect(reports).toBe(1);
    expect(asked).toHaveLength(2);
    tiles.retry();
    tiles.want('overworld', [[0, 0]]);
    expect(asked).toHaveLength(3);
  });

  it('drops tiles not looked at for longest, never ones in view, and closes them all on dispose', async () => {
    const { asked, load } = loader();
    const tiles = new MapTiles<Pic>(load, () => undefined, () => undefined, 2);
    const pics: Pic[] = [];
    for (const x of [0, 1, 2]) { tiles.want('overworld', [[x, 0]]); pics.push(asked[x].ok()); await settle(); }
    expect(pics.map((p) => p.closed)).toEqual([true, false, false]);
    tiles.dispose();
    expect(pics.every((p) => p.closed)).toBe(true);
    tiles.want('overworld', [[5, 0]]);
    expect(asked).toHaveLength(3);
  });
});
