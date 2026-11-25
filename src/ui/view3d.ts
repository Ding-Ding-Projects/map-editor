// 3D view: the selection drawn as isometric cubes on a canvas, with four turns, zoom and the top,
// left and right faces shaded so shapes read clearly. No WebGL needed, so it works everywhere.
import { blockColor } from '../core/colors.js';

export interface Volume { size: [number, number, number]; palette: string[]; cells: number[] }

/** Rotate a cell (x, z) a quarter turn `turn` times inside a box of width sx and depth sz. */
export function turnCell(x: number, z: number, sx: number, sz: number, turn: number): [number, number] {
  switch (((turn % 4) + 4) % 4) {
    case 1: return [sz - 1 - z, x];
    case 2: return [sx - 1 - x, sz - 1 - z];
    case 3: return [z, sx - 1 - x];
    default: return [x, z];
  }
}

const shadeOf = ([r, g, b]: [number, number, number], k: number) => `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})`;

/** Draw a volume; returns how many cubes were drawn (hidden ones inside solid blocks are skipped). */
export function drawVolume(canvas: HTMLCanvasElement, v: Volume, turn: number, zoom: number, background: string): number {
  const [sx, sy, sz] = v.size;
  const wide = turn % 2 === 1;
  const W = wide ? sz : sx, D = wide ? sx : sz;
  const tile = Math.max(2, zoom);
  const hw = tile, hh = tile / 2, vh = tile;
  const width = Math.ceil((W + D) * hw + 4), height = Math.ceil((W + D) * hh + sy * vh + 4);
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  // Occupancy for hiding cubes that are surrounded on the three visible sides.
  const filled = new Set<string>();
  const placed: Array<[number, number, number, number]> = [];
  for (let i = 0; i < v.cells.length; i += 4) {
    const [x, z] = turnCell(v.cells[i], v.cells[i + 2], sx, sz, turn);
    placed.push([x, v.cells[i + 1], z, v.cells[i + 3]]);
    filled.add(`${x},${v.cells[i + 1]},${z}`);
  }
  // Back to front: far corner first, low to high.
  placed.sort((a, b) => (a[0] + a[2]) - (b[0] + b[2]) || a[1] - b[1]);
  const ox = D * hw + 2, oy = sy * vh + 2;
  const colors = v.palette.map((n) => blockColor(n));
  let drawn = 0;
  for (const [x, y, z, p] of placed) {
    if (filled.has(`${x},${y + 1},${z}`) && filled.has(`${x + 1},${y},${z}`) && filled.has(`${x},${y},${z + 1}`)) continue;
    const cx = ox + (x - z) * hw, cy = oy + (x + z) * hh - y * vh;
    const c = colors[p];
    // Top face
    ctx.fillStyle = shadeOf(c, 1.08);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + hw, cy + hh); ctx.lineTo(cx, cy + 2 * hh); ctx.lineTo(cx - hw, cy + hh); ctx.closePath(); ctx.fill();
    // Left face
    ctx.fillStyle = shadeOf(c, 0.78);
    ctx.beginPath(); ctx.moveTo(cx - hw, cy + hh); ctx.lineTo(cx, cy + 2 * hh); ctx.lineTo(cx, cy + 2 * hh + vh); ctx.lineTo(cx - hw, cy + hh + vh); ctx.closePath(); ctx.fill();
    // Right face
    ctx.fillStyle = shadeOf(c, 0.6);
    ctx.beginPath(); ctx.moveTo(cx + hw, cy + hh); ctx.lineTo(cx, cy + 2 * hh); ctx.lineTo(cx, cy + 2 * hh + vh); ctx.lineTo(cx + hw, cy + hh + vh); ctx.closePath(); ctx.fill();
    drawn++;
  }
  return drawn;
}
