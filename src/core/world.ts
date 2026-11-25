// A Java Edition world on disk: level.dat, dimensions and their region files.
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Chunk, type BlockState } from './chunk.js';
import { RegionFile } from './region.js';
import { getCompound, getList, getNumber, getString, readNbt, writeNbt, nbt, TagType, type CompoundTag, type NamedTag } from './nbt.js';
import { randomBytes } from 'node:crypto';

export type Dimension = 'overworld' | 'nether' | 'end';

export const DIMENSION_DIRS: Record<Dimension, string> = {
  overworld: 'region',
  nether: path.join('DIM-1', 'region'),
  end: path.join('DIM1', 'region'),
};

export interface WorldInfo {
  path: string;
  name: string;
  dataVersion?: number;
  versionName?: string;
  dimensions: Dimension[];
  spawn?: { x: number; y: number; z: number };
}

export function isWorldFolder(dir: string) {
  return existsSync(path.join(dir, 'level.dat'));
}

export async function readLevelDat(dir: string): Promise<NamedTag> {
  return readNbt(gunzipSync(await fs.readFile(path.join(dir, 'level.dat'))));
}

export async function worldInfo(dir: string): Promise<WorldInfo> {
  const level = await readLevelDat(dir);
  const data = getCompound(level.tag, 'Data');
  const version = getCompound(data, 'Version');
  const dims = (Object.keys(DIMENSION_DIRS) as Dimension[]).filter((d) => existsSync(path.join(dir, DIMENSION_DIRS[d])));
  const sx = getNumber(data, 'SpawnX'), sy = getNumber(data, 'SpawnY'), sz = getNumber(data, 'SpawnZ');
  return {
    path: dir,
    name: getString(data, 'LevelName') ?? path.basename(dir),
    dataVersion: getNumber(data, 'DataVersion'),
    versionName: getString(version, 'Name'),
    dimensions: dims.length ? dims : ['overworld'],
    spawn: sx !== undefined && sy !== undefined && sz !== undefined ? { x: sx, y: sy, z: sz } : undefined,
  };
}

/** Rename the world inside level.dat (the name Minecraft and the worlds list show). */
export async function setLevelName(dir: string, name: string): Promise<void> {
  const { nbt } = await import('./nbt.js');
  const level = await readLevelDat(dir);
  const data = getCompound(level.tag, 'Data');
  if (!data) throw new Error('level.dat has no Data compound');
  data.value.set('LevelName', nbt.string(name));
  const file = path.join(dir, 'level.dat');
  await fs.writeFile(file + '.tmp', gzipSync(writeNbt(level)));
  await fs.rename(file + '.tmp', file);
}

/** Find world folders one level below each given folder (for example `.minecraft/saves`). */
export async function discoverWorlds(roots: string[]): Promise<WorldInfo[]> {
  const out: WorldInfo[] = [];
  for (const root of roots) {
    let entries: string[] = [];
    try { entries = await fs.readdir(root); } catch { continue; }
    for (const e of entries) {
      const dir = path.join(root, e);
      if (!isWorldFolder(dir)) continue;
      try { out.push(await worldInfo(dir)); } catch { /* unreadable world: skip, the open dialog reports it */ }
    }
  }
  return out;
}

export class World {
  // Entities (mobs, item frames, armour stands) live in their own region files under entities/.
  private entityRegions = new Map<string, RegionFile>();
  private entityChunks = new Map<string, NamedTag>();
  private dirtyEntities = new Set<string>();
  private regions = new Map<string, RegionFile>();
  private chunks = new Map<string, Chunk>();
  private dirtyChunks = new Set<string>();

  private constructor(public dir: string, public info: WorldInfo) {}

  static async open(dir: string): Promise<World> {
    if (!isWorldFolder(dir)) throw new Error(`No level.dat in ${dir}`);
    return new World(dir, await worldInfo(dir));
  }

  private regionPath(dim: Dimension, rx: number, rz: number) {
    return path.join(this.dir, DIMENSION_DIRS[dim], `r.${rx}.${rz}.mca`);
  }

  private async region(dim: Dimension, rx: number, rz: number, create = false): Promise<RegionFile | undefined> {
    const key = `${dim}:${rx}:${rz}`;
    let r = this.regions.get(key);
    if (r) return r;
    const p = this.regionPath(dim, rx, rz);
    if (existsSync(p)) r = RegionFile.parse(new Uint8Array(await fs.readFile(p)));
    else if (create) r = RegionFile.empty();
    else return undefined;
    this.regions.set(key, r);
    return r;
  }

  /** Every chunk coordinate on disk for a dimension. */
  async listChunks(dim: Dimension): Promise<Array<[number, number]>> {
    const dir = path.join(this.dir, DIMENSION_DIRS[dim]);
    let files: string[] = [];
    try { files = await fs.readdir(dir); } catch { return []; }
    const out: Array<[number, number]> = [];
    for (const f of files) {
      const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f);
      if (!m) continue;
      const rx = Number(m[1]), rz = Number(m[2]);
      const r = await this.region(dim, rx, rz);
      if (!r) continue;
      for (const [lx, lz] of r.chunks()) out.push([rx * 32 + lx, rz * 32 + lz]);
    }
    return out;
  }

  async chunk(dim: Dimension, cx: number, cz: number, create = false): Promise<Chunk | undefined> {
    const key = `${dim}:${cx}:${cz}`;
    const cached = this.chunks.get(key);
    if (cached) return cached;
    const r = await this.region(dim, Math.floor(cx / 32), Math.floor(cz / 32), create);
    if (!r) return undefined;
    const tag = r.read(cx, cz);
    let c: Chunk | undefined;
    if (tag) c = Chunk.fromNbt(cx, cz, tag);
    else if (create) c = Chunk.createEmpty(cx, cz, this.info.dataVersion ?? 4189);
    if (c) this.chunks.set(key, c);
    return c;
  }

  async getBlock(dim: Dimension, x: number, y: number, z: number): Promise<BlockState | undefined> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    return c?.getBlock(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
  }

  /** Set a block; chunks that do not exist yet are skipped (never invents terrain) unless create is true. */
  async setBlock(dim: Dimension, x: number, y: number, z: number, b: BlockState, create = false): Promise<boolean> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16), create);
    if (!c) return false;
    c.setBlock(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, b);
    this.dirtyChunks.add(`${dim}:${c.cx}:${c.cz}`);
    return true;
  }

  async getBlockEntity(dim: Dimension, x: number, y: number, z: number) {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    return c?.getBlockEntity(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
  }

  async setBlockEntity(dim: Dimension, x: number, y: number, z: number, tag: CompoundTag | undefined): Promise<boolean> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    if (!c) return false;
    c.setBlockEntity(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, tag);
    this.dirtyChunks.add(`${dim}:${c.cx}:${c.cz}`);
    return true;
  }

  /** Set the biome of the cell holding a block; missing chunks are skipped. */
  async setBiome(dim: Dimension, x: number, y: number, z: number, biome: string): Promise<boolean> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    if (!c) return false;
    c.setBiome(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, biome);
    this.dirtyChunks.add(`${dim}:${c.cx}:${c.cz}`);
    return true;
  }

  async getBiome(dim: Dimension, x: number, y: number, z: number): Promise<string | undefined> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    return c?.getBiome(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
  }

  private entityRegionPath(dim: Dimension, rx: number, rz: number) {
    return path.join(this.dir, path.dirname(DIMENSION_DIRS[dim]), 'entities', `r.${rx}.${rz}.mca`);
  }

  private async entityChunk(dim: Dimension, cx: number, cz: number, create = false): Promise<NamedTag | undefined> {
    const key = `${dim}:${cx}:${cz}`;
    const hit = this.entityChunks.get(key);
    if (hit) return hit;
    const rx = Math.floor(cx / 32), rz = Math.floor(cz / 32), rkey = `${dim}:${rx}:${rz}`;
    let r = this.entityRegions.get(rkey);
    if (!r) {
      const p = this.entityRegionPath(dim, rx, rz);
      if (existsSync(p)) r = RegionFile.parse(new Uint8Array(await fs.readFile(p)));
      else if (create) r = RegionFile.empty();
      else return undefined;
      this.entityRegions.set(rkey, r);
    }
    let tag = r.read(cx, cz);
    if (!tag && create) tag = { name: '', tag: nbt.compound({ DataVersion: nbt.int(this.info.dataVersion ?? 4189), Position: nbt.intArray(Int32Array.from([cx, cz])), Entities: nbt.list(TagType.Compound, []) }) };
    if (tag) this.entityChunks.set(key, tag);
    return tag;
  }

  /** Entities whose position lies inside a box (block coordinates, inclusive). */
  async entitiesIn(dim: Dimension, box: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }): Promise<CompoundTag[]> {
    const out: CompoundTag[] = [];
    for (let cx = Math.floor(box.x1 / 16); cx <= Math.floor(box.x2 / 16); cx++) for (let cz = Math.floor(box.z1 / 16); cz <= Math.floor(box.z2 / 16); cz++) {
      const t = await this.entityChunk(dim, cx, cz);
      for (const e of getList(t?.tag, 'Entities') ?? []) {
        const pos = getList(e, 'Pos')?.map((v) => (v.type === TagType.Double ? v.value : NaN)) ?? [];
        if (pos.length === 3 && e.type === TagType.Compound && pos[0] >= box.x1 && pos[0] < box.x2 + 1 && pos[1] >= box.y1 && pos[1] < box.y2 + 1 && pos[2] >= box.z1 && pos[2] < box.z2 + 1) out.push(e);
      }
    }
    return out;
  }

  /** Add an entity at its Pos. A fresh UUID is given so a copy never clashes with the original. */
  async addEntity(dim: Dimension, entity: CompoundTag): Promise<boolean> {
    const pos = getList(entity, 'Pos')?.map((v) => (v.type === TagType.Double ? v.value : NaN)) ?? [];
    if (pos.length !== 3 || pos.some((v) => !Number.isFinite(v))) return false;
    const cx = Math.floor(pos[0] / 16), cz = Math.floor(pos[2] / 16);
    if (!(await this.chunk(dim, cx, cz))) return false; // never invent terrain for an entity
    const t = (await this.entityChunk(dim, cx, cz, true))!;
    const m = new Map(entity.value);
    const id = randomBytes(16);
    m.set('UUID', nbt.intArray(Int32Array.from([0, 4, 8, 12].map((i) => id.readInt32BE(i)))));
    const list = [...(getList(t.tag, 'Entities') ?? []), nbt.compound(m)];
    (t.tag as CompoundTag).value.set('Entities', nbt.list(TagType.Compound, list));
    this.dirtyEntities.add(`${dim}:${cx}:${cz}`);
    return true;
  }

  get unsavedChunks() { return this.dirtyChunks.size; }

  /** Write every changed chunk (and entity chunk) back to its region file. Returns the changed file paths. */
  async save(): Promise<string[]> {
    const entityFiles = new Set<string>();
    for (const key of this.dirtyEntities) {
      const [dim, cxs, czs] = key.split(':') as [Dimension, string, string];
      const cx = Number(cxs), cz = Number(czs), rx = Math.floor(cx / 32), rz = Math.floor(cz / 32);
      const r = this.entityRegions.get(`${dim}:${rx}:${rz}`)!;
      r.write(cx, cz, this.entityChunks.get(key)!);
      entityFiles.add(`${dim}:${rx}:${rz}`);
    }
    this.dirtyEntities.clear();
    for (const k of entityFiles) {
      const [dim, rx, rz] = k.split(':') as [Dimension, string, string];
      const p = this.entityRegionPath(dim, Number(rx), Number(rz));
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p + '.tmp', this.entityRegions.get(k)!.serialize());
      await fs.rename(p + '.tmp', p);
    }
    const touched = new Map<string, { dim: Dimension; rx: number; rz: number }>();
    for (const key of this.dirtyChunks) {
      const [dim, cxs, czs] = key.split(':') as [Dimension, string, string];
      const cx = Number(cxs), cz = Number(czs);
      const c = this.chunks.get(key)!;
      const rx = Math.floor(cx / 32), rz = Math.floor(cz / 32);
      const r = (await this.region(dim, rx, rz, true))!;
      r.write(cx, cz, c.toNbt());
      touched.set(`${dim}:${rx}:${rz}`, { dim, rx, rz });
    }
    const written: string[] = [];
    for (const { dim, rx, rz } of touched.values()) {
      const r = this.regions.get(`${dim}:${rx}:${rz}`)!;
      const p = this.regionPath(dim, rx, rz);
      await fs.mkdir(path.dirname(p), { recursive: true });
      const tmp = p + '.tmp';
      await fs.writeFile(tmp, r.serialize());
      await fs.rename(tmp, p); // atomic replace so a crash never leaves half a region
      r.dirty = false;
      written.push(p);
    }
    this.dirtyChunks.clear();
    return written;
  }

  /** Drop cached data so the next read comes from disk (after a history restore). */
  reload() {
    this.regions.clear();
    this.chunks.clear();
    this.dirtyChunks.clear();
  }
}

/** Create a minimal 1.21 world on disk. Used by tests and by "New world". */
export async function createWorld(dir: string, name: string, dataVersion = 4189, spawnY = 64): Promise<void> {
  const { nbt } = await import('./nbt.js');
  await fs.mkdir(path.join(dir, 'region'), { recursive: true });
  const level: NamedTag = {
    name: '',
    tag: nbt.compound({
      Data: nbt.compound({
        LevelName: nbt.string(name),
        DataVersion: nbt.int(dataVersion),
        Version: nbt.compound({ Name: nbt.string('1.21.4'), Id: nbt.int(dataVersion) }),
        SpawnX: nbt.int(0), SpawnY: nbt.int(spawnY), SpawnZ: nbt.int(0),
      }),
    }),
  };
  await fs.writeFile(path.join(dir, 'level.dat'), gzipSync(writeNbt(level)));
}
