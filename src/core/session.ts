// One open world plus its history: the unit every front end (desktop, web, appliance) drives.
import { World, type Dimension } from './world.js';
import { WorldHistory, type HistoryAction } from './history.js';
import { blockColor, shade } from './colors.js';
import { parseBlock } from './chunk.js';
import * as ops from './ops.js';
import { captureStructure, encodeStructure, placeStructure, type Structure } from './structure.js';

export interface OperationRequest {
  op: ops.OperationName;
  dimension: Dimension;
  box: ops.Box;
  block?: string;
  from?: string;
  to?: string;
  biome?: string;
  dest?: { x: number; y: number; z: number };
}

const PAST: Record<ops.OperationName, HistoryAction> = { fill: 'filled', replace: 'replaced', delete: 'deleted', clone: 'cloned', waterlog: 'waterlogged', biome: 'biome set' };

export class EditSession {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(public world: World, public history: WorldHistory) {}

  static async open(dataDir: string, worldPath: string) {
    const history = await WorldHistory.open(dataDir, worldPath);
    return new EditSession(await World.open(worldPath), history);
  }

  /** Run edits one at a time so two clients can never interleave writes to one world. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  run(req: OperationRequest) {
    return this.serial(async () => {
      const { world } = this;
      let res: ops.OpResult;
      switch (req.op) {
        case 'fill': res = await ops.fill(world, req.dimension, req.box, parseBlock(req.block ?? '')); break;
        case 'replace': res = await ops.replace(world, req.dimension, req.box, parseBlock(req.from ?? ''), parseBlock(req.to ?? '')); break;
        case 'delete': res = await ops.deleteBlocks(world, req.dimension, req.box); break;
        case 'waterlog': res = await ops.waterlog(world, req.dimension, req.box); break;
        case 'biome': res = await ops.setBiome(world, req.dimension, req.box, req.biome ?? ''); break;
        case 'clone':
          if (!req.dest) throw new Error('Clone needs a destination');
          res = await ops.clone(world, req.dimension, req.box, req.dest); break;
        default: throw new Error(`Unknown operation ${String((req as { op: unknown }).op)}`);
      }
      // Every operation is saved and recorded straight away so it can always be undone.
      await world.save();
      const n = ops.normalize(req.box);
      const size = `${n.x2 - n.x1 + 1}×${n.y2 - n.y1 + 1}×${n.z2 - n.z1 + 1}`;
      const what = req.op === 'fill' ? ` with ${req.block}` : req.op === 'replace' ? ` ${req.from} with ${req.to}` : req.op === 'clone' ? ` to ${req.dest!.x}, ${req.dest!.y}, ${req.dest!.z}` : req.op === 'biome' ? ` to ${req.biome}` : '';
      let entry;
      try { entry = await this.history.record(PAST[req.op], `${req.op[0].toUpperCase()}${req.op.slice(1)} ${size}${what}`); }
      catch (e) { console.error('History write failed; the edit itself was saved.', e); } // never fail the edit for a history write
      return { ...res, history: entry };
    });
  }

  /** The selection as a structure file (.nbt). */
  exportStructure(dim: Dimension, box: ops.Box) {
    return this.serial(async () => encodeStructure(await captureStructure(this.world, dim, box, this.world.info.dataVersion ?? 4189)));
  }

  /** Place a structure with its origin at a corner; saved and recorded like any edit, so it can be undone. */
  placeStructure(dim: Dimension, s: Structure, at: { x: number; y: number; z: number }, name: string) {
    return this.serial(async () => {
      const res = await placeStructure(this.world, dim, s, at);
      await this.world.save();
      let entry;
      try { entry = await this.history.record('placed', `Placed ${name} (${s.size.join('×')}) at ${at.x}, ${at.y}, ${at.z}`); }
      catch (e) { console.error('History write failed; the edit itself was saved.', e); }
      return { ...res, history: entry };
    });
  }

  restore(sha: string) {
    return this.serial(async () => {
      const entry = await this.history.restore(sha);
      this.world.reload();
      return entry;
    });
  }

  /**
   * RGBA pixels of a vertical cut through the world: along x at a fixed z (axis 'z'), or along z at a
   * fixed x (axis 'x'). Row 0 is the top (y1). Air and missing chunks are transparent.
   */
  async renderSlice(dim: Dimension, axis: 'x' | 'z', at: number, from: number, to: number, y0: number, y1: number): Promise<{ width: number; height: number; px: Uint8Array }> {
    const a = Math.min(from, to), b = Math.max(from, to), lo = Math.max(-64, Math.min(y0, y1)), hi = Math.min(319, Math.max(y0, y1));
    const width = b - a + 1, height = hi - lo + 1;
    if (width < 1 || width > 1024 || height < 1) throw new Error('Slice must be 1 to 1024 blocks wide.');
    const px = new Uint8Array(width * height * 4);
    for (let i = 0; i < width; i++) {
      const x = axis === 'z' ? a + i : at, z = axis === 'z' ? at : a + i;
      const c = await this.world.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
      if (!c) continue;
      for (let y = hi; y >= lo; y--) {
        const bl = c.getBlock(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
        if (!bl || /(^|:)(air|cave_air|void_air)$/.test(bl.name)) continue;
        const [r, g, bb] = shade(blockColor(bl.name), y, y + 1);
        const o = ((hi - y) * width + i) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = bb; px[o + 3] = 255;
      }
    }
    return { width, height, px };
  }

  /** The highest non-air block in one column, as the top-down map shows it. */
  async topBlock(dim: Dimension, x: number, z: number): Promise<{ y: number; block: string } | undefined> {
    const c = await this.world.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    const top = c?.top(((x % 16) + 16) % 16, ((z % 16) + 16) % 16);
    return top ? { y: top.y, block: top.block.name } : undefined;
  }

  /** RGBA pixels (16x16 per chunk) for a rectangle of chunks, top-down. */
  async renderChunks(dim: Dimension, cx0: number, cz0: number, w: number, h: number): Promise<Uint8Array> {
    if (w * h > 64 * 64) throw new Error('Render area too large');
    const px = new Uint8Array(w * 16 * h * 16 * 4);
    const stride = w * 16;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = await this.world.chunk(dim, cx0 + i, cz0 + j);
      if (!c) continue;
      const heights: number[] = new Array(256);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const top = c.top(x, z);
        const o = ((j * 16 + z) * stride + i * 16 + x) * 4;
        if (!top) continue;
        heights[z * 16 + x] = top.y;
        const [r, g, b] = shade(blockColor(top.block.name), top.y, z > 0 ? heights[(z - 1) * 16 + x] : undefined);
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    return px;
  }
}
