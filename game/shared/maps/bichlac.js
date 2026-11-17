// Bích Lạc Lâm: the green forest east of the starter town. A grassy hill, a pond with a plank bridge and frogs on its banks,
// a deep wood of great pines and bamboo where snakes slide over the floor and birds keep to the branch walkways, a flower
// meadow full of butterflies, and a stone rise up to a gate that leads on to the lake.
// The first hunting ground: its monsters are the weakest. Layout in code (./build.js); see tanthu.js for what the
// characters, props and fields mean.
import { canvas, box, ground, rows } from "./build.js";

const g = canvas(160, 20);
ground(g, 0, 159, 15);
// a grassy hill, three steps up and down
ground(g, 22, 40, 14);
ground(g, 26, 36, 13);
ground(g, 29, 33, 12);
// the pond: three rows deep, a plank bridge across the middle, open water at its banks
box(g, 44, 61, 15, 17, "w");
box(g, 46, 59, 15, 15, "b");
// the deep wood: a root-hump, and walkways in the branches
ground(g, 70, 74, 14);
box(g, 76, 83, 11, 11, "b");
box(g, 86, 92, 8, 8, "b");
box(g, 94, 99, 11, 11, "b");
// the stone rise to the east gate: three steps with stone faces
ground(g, 130, 159, 14);
ground(g, 136, 159, 13);
ground(g, 141, 159, 12);
box(g, 130, 130, 14, 14, "s");
box(g, 136, 136, 13, 13, "s");
box(g, 141, 141, 12, 12, "s");

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
export const BICHLAC = {
  id: "bichlac",
  name: "Bích Lạc Lâm",
  sub: "Rừng xanh phía đông thôn. Ếch độc quanh hồ, rắn xanh dưới tán cây, linh điểu trên cành, bướm huyễn ở đồng hoa.",
  cell: 32,
  pvp: false,
  theme: {
    sky: ["#1a4452", "#2a7080", "#64aeb0", "#bfe0c8", "#f6ecc8"],
    isles: false,
    heaven: [["bg_far_01_00", 120, 40], ["bg_far_01_00", 1300, 60]],
    mountains: { tint: "#3a7a5a", k: 0.25 },
    grass: ["#1a3a1c", "#265a26", "#367a30", "#4f9a3e", "#86c05a"],
    motes: "leaves",
  },
  mobs: [
    { type: "frog", x: 42, row: 15 }, { type: "frog", x: 63, row: 15 }, { type: "frog", x: 66, row: 15 },
    { type: "snake", x: 72, row: 14 }, { type: "snake", x: 85, row: 15 }, { type: "snake", x: 93, row: 15 },
    { type: "bird", x: 79, row: 11, up: 2 }, { type: "bird", x: 89, row: 8, up: 2 }, { type: "bird", x: 97, row: 11, up: 2 },
    { type: "butterfly", x: 108, row: 15, up: 3 }, { type: "butterfly", x: 116, row: 15, up: 3 }, { type: "butterfly", x: 124, row: 15, up: 3 },
  ],
  spawn: { x: 7, row: 15 },
  portals: [
    { x: 2.5, row: 15, r: 0.8, to: "tanthu", msg: "Về Tân Thủ Thôn" },
    { x: 157, row: 12, r: 0.8, to: "linhthuy", msg: "Tới Linh Thủy Đàm" },
  ],
  props: [
    // the way in from the town: bamboo and a great pine
    XX("bg_mid_01_03", 13, 15, 2), ["pine", 10, 15, { v: 1 }], XX("bg_xianxia_deco_01_03", 18.5, 15, 4), ["sign", 5.2, 15],
    // the hill: a gnarled pine on top, bamboo on its flank, orchids
    XX("bg_mid_01_03", 24.5, 14, 2), XX("bg_mid_01_04", 31, 12, 2), XX("bg_xianxia_deco_01_01", 37.5, 14, 4),
    // the pond: willows on both banks, lotus at its edges, ripples
    XX("bg_mid_02_05", 41, 15, 2), XX("bg_mid_02_05", 64, 15, 2, { f: 1 }),
    XX("bg_xianxia_deco_01_04", 44.9, 15, 4, { dy: 18 }), XX("bg_xianxia_deco_01_04", 60.6, 15, 4, { dy: 18, f: 1 }),
    ["fx", 45, 15, { id: "water/ripples", h: -6, k: 1 }], ["fx", 60.5, 15, { id: "water/ripples", h: -6, k: 1 }],
    // the deep wood: great pines, bamboo, a scholar's rock, mushrooms, fireflies under the canopy, leaves falling
    ["pine", 69, 15, { v: 0 }], XX("bg_mid_01_03", 77, 15, 2), ["pine", 88, 15, { v: 2 }], XX("bg_mid_01_03", 95, 15, 2, { f: 1 }),
    XX("bg_mid_02_04", 73, 14, 3), XX("bg_xianxia_deco_01_00", 67.5, 15, 4), XX("bg_xianxia_deco_01_00", 91, 15, 5),
    ["bamboo", 82.5, 15], ["bamboo", 98.5, 15],
    // the meadow: flowers, orchids, a jade rock, a rest pavilion
    XX("bg_xianxia_deco_01_05", 106, 15, 2), XX("bg_xianxia_deco_01_05", 118, 15, 2, { f: 1 }), XX("bg_xianxia_deco_01_01", 101.5, 15, 4),
    XX("bg_xianxia_deco_01_01", 113, 15, 4, { f: 1 }), XX("bg_xianxia_deco_01_02", 111, 15, 3), XX("bg_mid_02_03", 123, 15, 2),
    XX("bg_xianxia_deco_01_00", 127.5, 15, 5),
    // the stone rise and the gate east
    XX("bg_mid_01_04", 134, 14, 2, { f: 1 }), XX("bg_xianxia_deco_01_03", 139, 13, 4), XX("bg_mid_02_00", 150, 12, 2),
    ["lantern", 145.5, 12], ["lantern", 154.5, 12], ["sign", 158.5, 12],
    ["glow", 80, 15, { h: 40, r: 70, c: "#c8ff8a", a: 0.12 }], ["glow", 115, 15, { h: 40, r: 70, c: "#c8ff8a", a: 0.12 }],
  ],
  grid: rows(g),
};
