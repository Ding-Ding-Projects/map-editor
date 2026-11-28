// The editor map is drawn from square tiles that are kept after they load. A redraw paints what is
// already here straight away and only asks for what is missing, so moving or resizing never blanks it.

/** Chunks along one side of a tile. */
export const TILE_CHUNKS = 16;
/** Blocks along one side of a tile. */
export const TILE_BLOCKS = TILE_CHUNKS * 16;

export type Tile = [tx: number, tz: number];

/** Tiles under a view plus a ring around it, the ones on screen first and nearest the middle first. */
export function visibleTiles(originX: number, originZ: number, scale: number, width: number, height: number, margin = 1): Tile[] {
  const x0 = Math.floor(originX / TILE_BLOCKS), x1 = Math.floor((originX + width / scale) / TILE_BLOCKS);
  const z0 = Math.floor(originZ / TILE_BLOCKS), z1 = Math.floor((originZ + height / scale) / TILE_BLOCKS);
  const midX = (originX + width / scale / 2) / TILE_BLOCKS - 0.5, midZ = (originZ + height / scale / 2) / TILE_BLOCKS - 0.5;
  const out: Array<{ tile: Tile; ring: number; far: number }> = [];
  for (let tz = z0 - margin; tz <= z1 + margin; tz++) for (let tx = x0 - margin; tx <= x1 + margin; tx++) {
    out.push({ tile: [tx, tz], ring: tx < x0 || tx > x1 || tz < z0 || tz > z1 ? 1 : 0, far: Math.hypot(tx - midX, tz - midZ) });
  }
  return out.sort((a, b) => a.ring - b.ring || a.far - b.far).map((t) => t.tile);
}

/** Where a tile lands on the canvas. Neighbours share rounded edges, so no seam shows between them. */
export function tileRect(tile: Tile, originX: number, originZ: number, scale: number) {
  const x = Math.round((tile[0] * TILE_BLOCKS - originX) * scale), y = Math.round((tile[1] * TILE_BLOCKS - originZ) * scale);
  return { x, y, w: Math.round(((tile[0] + 1) * TILE_BLOCKS - originX) * scale) - x, h: Math.round(((tile[1] + 1) * TILE_BLOCKS - originZ) * scale) - y };
}

interface Entry<T> { image: T; version: number }

export class MapTiles<T extends { close(): void }> {
  private kept = new Map<string, Entry<T>>();
  private loading = new Set<string>();
  private failed = new Set<string>();
  private wanted: Array<{ key: string; dim: string; tile: Tile }> = [];
  private version = 0;
  private done = false;

  constructor(
    private load: (dim: string, tile: Tile) => Promise<T>,
    private arrived: () => void,
    private broke: (error: unknown) => void,
    private limit = 256,
    private parallel = 4,
  ) {}

  /** The tile as last loaded. It may be out of date while its replacement is on the way. */
  get(dim: string, tile: Tile): T | undefined { return this.kept.get(`${dim}:${tile[0]}:${tile[1]}`)?.image; }

  /** Say which tiles the view needs now, most urgent first. */
  want(dim: string, tiles: Tile[]): void {
    this.wanted = tiles.map((tile) => ({ key: `${dim}:${tile[0]}:${tile[1]}`, dim, tile }));
    // Re-inserting moves a tile to the young end, so the ones not looked at for longest are dropped first.
    for (const { key } of this.wanted) { const e = this.kept.get(key); if (e) { this.kept.delete(key); this.kept.set(key, e); } }
    this.pump();
  }

  /** The world changed: every tile is loaded again, and stays on screen until its replacement arrives. */
  invalidate(): void { this.version++; this.failed.clear(); }

  /** Ask again for tiles that could not be loaded. */
  retry(): void { this.failed.clear(); }

  dispose(): void {
    this.done = true;
    for (const e of this.kept.values()) e.image.close();
    this.kept.clear(); this.wanted = [];
  }

  private pump(): void {
    for (const w of this.wanted) {
      if (this.done || this.loading.size >= this.parallel) return;
      if (this.loading.has(w.key) || this.failed.has(w.key) || this.kept.get(w.key)?.version === this.version) continue;
      void this.fetch(w);
    }
  }

  private async fetch(w: { key: string; dim: string; tile: Tile }): Promise<void> {
    const asked = this.version;
    this.loading.add(w.key);
    try {
      const image = await this.load(w.dim, w.tile);
      if (this.done) { image.close(); return; }
      this.kept.get(w.key)?.image.close();
      this.kept.set(w.key, { image, version: asked });
      this.trim();
      this.arrived();
    } catch (error) {
      // One message for a run of failures, not one per tile.
      if (asked === this.version && !this.done) { const first = !this.failed.size; this.failed.add(w.key); if (first) this.broke(error); }
    } finally {
      this.loading.delete(w.key);
      this.pump();
    }
  }

  private trim(): void {
    const room = Math.max(this.limit, this.wanted.length);
    if (this.kept.size <= room) return;
    const needed = new Set(this.wanted.map((w) => w.key));
    for (const [key, e] of this.kept) {
      if (this.kept.size <= room) break;
      if (!needed.has(key)) { e.image.close(); this.kept.delete(key); }
    }
  }
}
