// Top-down map colours. Data colours (not UI chrome), roughly the vanilla map palette.
const EXACT: Record<string, [number, number, number]> = {
  grass_block: [95, 144, 58], dirt: [134, 96, 67], coarse_dirt: [119, 85, 59], podzol: [91, 63, 24],
  stone: [125, 125, 125], cobblestone: [122, 122, 122], deepslate: [80, 80, 82], andesite: [136, 136, 136],
  granite: [149, 103, 85], diorite: [188, 188, 188], tuff: [108, 109, 102], bedrock: [85, 85, 85],
  sand: [219, 207, 163], red_sand: [190, 102, 33], gravel: [131, 127, 126], clay: [160, 166, 179],
  water: [63, 104, 201], lava: [207, 92, 15], ice: [145, 183, 253], packed_ice: [141, 180, 250],
  snow: [249, 254, 254], snow_block: [249, 254, 254], powder_snow: [248, 253, 253],
  oak_leaves: [59, 110, 36], birch_leaves: [94, 131, 60], spruce_leaves: [55, 91, 55], jungle_leaves: [48, 120, 28],
  acacia_leaves: [66, 108, 30], dark_oak_leaves: [44, 88, 22], mangrove_leaves: [62, 112, 32], cherry_leaves: [231, 169, 195],
  azalea_leaves: [90, 117, 45], flowering_azalea_leaves: [107, 121, 64],
  oak_log: [109, 85, 50], spruce_log: [58, 37, 16], birch_log: [216, 215, 210], oak_planks: [162, 130, 78],
  spruce_planks: [114, 84, 48], stone_bricks: [122, 121, 122], bricks: [150, 97, 83], glass: [200, 228, 234],
  netherrack: [97, 38, 38], soul_sand: [81, 62, 50], basalt: [73, 72, 77], blackstone: [42, 35, 40],
  end_stone: [219, 222, 158], obsidian: [15, 10, 24], terracotta: [152, 94, 67], mycelium: [111, 99, 105],
  moss_block: [89, 109, 45], mud: [60, 57, 60], short_grass: [95, 144, 58], tall_grass: [95, 144, 58],
};

const FALLBACKS: Array<[RegExp, [number, number, number]]> = [
  [/leaves$/, [60, 110, 35]], [/_log$|_wood$/, [102, 76, 51]], [/planks$/, [150, 120, 75]],
  [/wool$|carpet$|concrete$/, [200, 200, 200]], [/glass/, [200, 228, 234]], [/ore$/, [125, 125, 125]],
  [/flower|tulip|poppy|dandelion|orchid/, [180, 120, 60]], [/grass|fern|bush/, [95, 144, 58]],
];

export function blockColor(name: string): [number, number, number] {
  const short = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  const hit = EXACT[short];
  if (hit) return hit;
  for (const [re, c] of FALLBACKS) if (re.test(short)) return c;
  let h = 0;
  for (const ch of short) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [90 + (h % 90), 90 + ((h >> 8) % 90), 90 + ((h >> 16) % 90)];
}

/** Shade by height so terrain reads as relief. */
export function shade([r, g, b]: [number, number, number], y: number, northY: number | undefined): [number, number, number] {
  const f = northY === undefined ? 1 : y > northY ? 1.1 : y < northY ? 0.86 : 1;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(r), c(g), c(b)];
}
