// Linh Thủy Đàm: a wide spirit lake past the forest. Plank walkways run from island to island over deep water: a little
// isle with a lotus basin, a big isle with a pavilion. Schools of fish leap over the water and jellyfish drift above it;
// slimes crawl in the reed marsh on the far shore. A waterfall pours off the eastern cliff, and stairs climb it to the road
// on to the old tombs. Layout in code (./build.js); see tanthu.js for what the characters, props and fields mean.
import { canvas, box, ground, rows } from "./build.js";

const g = canvas(170, 20);
ground(g, 0, 169, 18);
// the west shore
ground(g, 0, 19, 15);
// the lake, three rows deep, and the walkways and isles over it
box(g, 20, 120, 15, 17, "w");
box(g, 20, 44, 15, 15, "b");
ground(g, 45, 58, 14);
box(g, 59, 78, 15, 15, "b");
ground(g, 79, 96, 13);
ground(g, 81, 94, 12);
box(g, 97, 120, 15, 15, "b");
// the reed marsh, with two shallow pools
ground(g, 121, 145, 15);
box(g, 128, 131, 15, 16, "w");
box(g, 139, 141, 15, 16, "w");
// the eastern cliff: three steps up
ground(g, 146, 169, 13);
ground(g, 152, 169, 11);
ground(g, 157, 169, 9);

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const RIPPLE = (x) => ["fx", x, 15, { id: "water/ripples", h: -4, k: 1.2 }];
export const LINHTHUY = {
  id: "linhthuy",
  name: "Linh Thủy Đàm",
  sub: "Hồ linh thủy mênh mông. Đàn ngư yêu vọt khỏi mặt nước, thủy mẫu tinh lơ lửng trên hồ, nhuyễn yêu bò trong đầm lau.",
  cell: 32,
  pvp: false,
  theme: {
    sky: ["#28406e", "#4870a4", "#86b2d4", "#cfe6ee", "#ffe6cc"],
    heaven: [["bg_xianxia_far_03_00", 60, 70], ["bg_xianxia_mid_04_00", 700, 30], ["bg_xianxia_far_04_01", 1300, 40], ["bg_xianxia_far_03_02", 1800, 20]],
    grass: ["#1a3a2c", "#285442", "#386e52", "#56895e", "#88b07a"],
    motes: "spores",
  },
  mobs: [
    { type: "fish_school", x: 32, row: 15, up: 2 }, { type: "fish_school", x: 68, row: 15, up: 2 }, { type: "fish_school", x: 108, row: 15, up: 2 },
    { type: "jellyfish", x: 40, row: 15, up: 4 }, { type: "jellyfish", x: 73, row: 15, up: 4 }, { type: "jellyfish", x: 114, row: 15, up: 4 },
    { type: "slime", x: 52, row: 14 }, { type: "slime", x: 125, row: 15 }, { type: "slime", x: 135, row: 15 }, { type: "slime", x: 143, row: 15 },
  ],
  spawn: { x: 7, row: 15 },
  portals: [
    { x: 2.5, row: 15, r: 0.8, to: "bichlac", msg: "Về Bích Lạc Lâm" },
    { x: 166, row: 9, r: 0.8, to: "uminh", msg: "Tới U Minh Cổ Mộ" },
  ],
  props: [
    // the west shore: willows, a stone lantern, a stone bridge's arch where the walkway starts
    XX("bg_mid_02_05", 9, 15, 2), ["lantern", 15, 15], XX("bg_xianxia_deco_01_02", 17.5, 15, 4), ["sign", 4.6, 15],
    // ripples on the open water
    RIPPLE(25), RIPPLE(37), RIPPLE(63), RIPPLE(74), RIPPLE(102), RIPPLE(117),
    // the little isle: a weeping willow over the water, a stone lantern, a jade rock, orchids
    XX("bg_mid_02_05", 48, 14, 2), ["lantern", 53.5, 14], XX("bg_xianxia_deco_01_02", 56.5, 14, 4, { f: 1 }), XX("bg_xianxia_deco_01_01", 51, 14, 5),
    // the big isle: a pavilion under a pine, lanterns, orchids
    XX("bg_mid_01_04", 84, 12, 2, { f: 1 }), XX("bg_mid_01_00", 89.5, 12, 2), ["lantern", 81.5, 13], ["lantern", 95, 13], XX("bg_xianxia_deco_01_01", 93, 12, 5),
    // the marsh: willows, reeds, mushrooms, bubbles in the pools
    XX("bg_mid_02_05", 124, 15, 2, { f: 1 }), XX("bg_near_01_04", 133, 15, 3, { tint: "#2a5a3a", k: 0.6 }), XX("bg_near_01_04", 137.5, 15, 3, { tint: "#2a5a3a", k: 0.6, f: 1 }),
    XX("bg_xianxia_deco_01_00", 144, 15, 5), ["fx", 129.5, 15, { id: "water/bubbles", h: -8, k: 1 }], ["fx", 140, 15, { id: "water/bubbles", h: -8, k: 1 }],
    // the cliff: a waterfall cliff far behind, pines on the steps, the road on
    XX("bg_mid_01_04", 155, 11, 2, { f: 1 }), ["lantern", 160, 9], ["sign", 168.5, 9],
    // a spring pouring out of a rock at the foot of the cliff, into the last pool of the marsh
    ["fx", 140, 15, { id: "water/waterfall", h: -18, k: 1.2, f: 1 }],
  ],
  grid: rows(g),
};
