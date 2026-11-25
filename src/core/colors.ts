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
  gold_block: [246, 208, 61], iron_block: [220, 220, 220], diamond_block: [98, 237, 228], emerald_block: [42, 203, 87],
  redstone_block: [175, 24, 5], lapis_block: [30, 67, 140], coal_block: [16, 15, 15], copper_block: [192, 107, 79],
  netherite_block: [66, 61, 63], quartz_block: [236, 230, 223], amethyst_block: [133, 97, 191], prismarine: [99, 156, 151],
  sandstone: [216, 203, 155], red_sandstone: [186, 99, 29], smooth_stone: [158, 158, 158], polished_andesite: [132, 134, 133],
  white_concrete: [207, 213, 214], black_concrete: [8, 10, 15], red_concrete: [142, 32, 32], blue_concrete: [44, 46, 143],
  green_concrete: [73, 91, 36], yellow_concrete: [240, 175, 21], orange_concrete: [224, 97, 0], light_blue_concrete: [35, 137, 198],
  white_wool: [233, 236, 236], black_wool: [20, 21, 25], red_wool: [160, 39, 34], blue_wool: [53, 57, 157],
  dark_oak_planks: [66, 43, 20], birch_planks: [192, 175, 121], jungle_planks: [160, 115, 80], acacia_planks: [168, 90, 50],
  cherry_planks: [226, 178, 172], mangrove_planks: [117, 54, 48], bamboo_planks: [193, 173, 80], hay_block: [166, 136, 38],
  pumpkin: [198, 118, 24], melon: [111, 145, 30], cactus: [85, 127, 43], sugar_cane: [148, 192, 101], kelp: [88, 141, 50],
  dirt_path: [148, 121, 65], farmland: [81, 44, 15], rooted_dirt: [144, 103, 76], calcite: [223, 224, 220], dripstone_block: [134, 107, 92],
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
