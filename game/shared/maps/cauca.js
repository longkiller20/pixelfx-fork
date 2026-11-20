// Vọng Nguyệt Hồ: the fishing lake (shared/cau-ca.js), reached from the menu (▦ Thêm → Câu Cá), left by the way it came.
// Dusk under a rising moon. West to east: the shore where one arrives, with the Ngư Cụ stall (rods, bait, selling fish);
// a long wooden dock on stilts over the shallows (Bến Thuyền); Thạch Đài, a rock in the middle of the deep water (Hồ
// Sâu) with the dock going on past it to the far shore; then the cliff, three steps up, and on top the spirit spring
// (Linh Tuyền) between jade-lotus stepping clouds. No monsters: a quiet place.
// The dock stands a row over the water, so anyone along it casts down onto open water. `fishing`: which water
// columns belong to which spot (a cast lands on the first water below the player, ahead of them by the rod's reach).
import { canvas, box, ground, rows } from "./build.js";

const W = 150, F = 15;
const g = canvas(W, 20);
ground(g, 0, W - 1, F);
// a stone cliff closing the west end
box(g, 0, 1, 2, F - 1, "s");
// the lake: shallow by the west shore, deep past the rock
box(g, 23, 45, 15, 16, "w");
box(g, 46, 76, 15, 18, "w");
// Thạch Đài: a rock standing out of the deep water
box(g, 50, 55, 14, 18, "s");
// the dock, a row over the water on stilts (low enough to climb back onto from the shallows' floor), from the shore to the rock and on to the far shore
box(g, 23, 49, 14, 14, "b");
box(g, 56, 76, 14, 14, "b");
// a step up out of the deep water at the far shore; the far shore, and the cliff in three steps
ground(g, 74, 76, 17);
ground(g, 77, 96, 14);
ground(g, 97, 149, 13);
ground(g, 103, 149, 11);
ground(g, 108, 149, 9);
// Linh Tuyền: the spring's pool on the clifftop, jade-lotus clouds to stand on over it
box(g, 116, 137, 9, 11, "w");
box(g, 119, 121, 7, 7, "=");
box(g, 125, 127, 7, 7, "=");
box(g, 131, 133, 7, 7, "=");
// a stone cliff closing the east end
box(g, W - 2, W - 1, 2, 8, "s");

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const fx = (x, id, o = {}, k = 1, row = F, h = 0) => ["fx", x, row, { id, o, k, h }];
// the dock's stilts: a post every few cells, from under the planks down into the water
const stilts = [];
for (let x = 24; x <= 76; x += 3) if (x < 50 || x > 55) stilts.push(fx(x + 0.5, "fishing/props", { piece: "stilt" }, 1, F, -8));

export const CAUCA = {
  id: "cauca",
  name: "Vọng Nguyệt Hồ",
  sub: "Hồ câu dưới trăng: không có yêu thú. Mua cần, mồi ở quầy Ngư Cụ, ra bến gỗ thả câu. Cá quý ở Hồ Sâu và Linh Tuyền.",
  // its own background music, always this one (public/nhac-nen/2-asianstringsuite/)
  music: "2-asianstringsuite",
  // entered from the menu, not by a road: the way out goes back to wherever one came from
  entry: "menu",
  cell: 32,
  pvp: false,
  theme: {
    sky: ["#161a3e", "#2c3670", "#5a5a96", "#a07ea6", "#f0b08a"],
    heaven: [["bg_far_01_03", 380, 26, { tint: "#ffe8c8", k: 0.15 }], ["bg_xianxia_far_04_01", 1100, 40, { tint: "#6a5a9a", k: 0.4 }], ["bg_xianxia_far_03_02", 1700, 30, { tint: "#6a5a9a", k: 0.4 }]],
    mountains: { tint: "#3a3a6e", k: 0.55, dark: 0.15 },
    grass: ["#1a2e2c", "#24443c", "#30584a", "#4a7458", "#78986a"],
    motes: "spores",
    tiles: { tint: "#2a2a5a", k: 0.25, d: 0.1 },
  },
  mobs: [],
  spawn: { x: 7, row: F },
  portals: [{ x: 2.6, row: F, r: 0.8, to: "@back", msg: "Rời Vọng Nguyệt Hồ" }],
  // the stall where rods and bait are sold and fish bought: stand within r cells of x
  shop: { x: 12.5, row: F, r: 3.2 },
  // which water is which fishing spot (columns x0..x1)
  fishing: [
    { x0: 23, x1: 45, zone: "ben" },
    { x0: 46, x1: 76, zone: "ho" },
    { x0: 116, x1: 137, zone: "tuyen" },
  ],
  // words over the spots (drawn by the game)
  signs: [[12.5, F, "Ngư Cụ"], [27, 14, "Bến Thuyền"], [52.5, 14, "Thạch Đài · Hồ Sâu"], [112, 9, "Linh Tuyền"]],
  props: [
    // the shore: the Ngư Cụ stall with the old fisherman, a lantern, willows, the boat pulled up
    fx(12.5, "fishing/stall", {}, 1.25),
    ["lantern", 18, F], ["lantern", 5, F],
    XX("bg_mid_02_05", 8.5, F, 2),
    fx(21, "fishing/props", { piece: "reeds" }, 1, F),
    // the dock: lanterns on posts, a moored boat, lily pads and lotus on the shallows
    ...stilts,
    ["lantern", 33, 14], ["lantern", 47, 14], ["lantern", 62, 14], ["lantern", 73, 14],
    fx(40, "fishing/props", { piece: "boat" }, 1, 15, -6),
    fx(28, "fishing/props", { piece: "lily" }, 1, 15, -1), fx(36.5, "fishing/props", { piece: "lily", lotus: 1 }, 1, 15, -1),
    fx(44, "fishing/props", { piece: "lily" }, 1, 15, -1), fx(66, "fishing/props", { piece: "lily", lotus: 1 }, 1, 15, -1),
    ["fx", 30, 15, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 59, 15, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 71, 15, { id: "water/ripples", h: -4, k: 1.2 }],
    // Thạch Đài: a pine on the rock, a stone lantern, the old stele
    XX("bg_mid_01_04", 52.5, 14, 2, { f: 1 }), XX("bg_xianxia_deco_01_02", 54.5, 14, 4),
    fx(49, "fishing/props", { piece: "buoy" }, 1, 15, -2), fx(58, "fishing/props", { piece: "buoy" }, 1, 15, -2),
    // the far shore and the cliff: reeds, willows, a waterfall from the spring down the cliff
    fx(79, "fishing/props", { piece: "reeds" }, 1, 14), XX("bg_mid_02_05", 86, 14, 2, { f: 1 }), ["lantern", 92, 14],
    XX("bg_mid_01_04", 100, 13, 2), ["lantern", 106, 11],
    // Linh Tuyền: spirit light over the pool, lotus, the spring's mist
    ["glow", 126.5, 9, { r: 120, c: "#7af0d8", a: 0.16, h: 20 }],
    fx(123, "fishing/props", { piece: "lily", lotus: 2 }, 1, 9, -1), fx(130, "fishing/props", { piece: "lily", lotus: 2 }, 1, 9, -1),
    ["fx", 118, 9, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 135, 9, { id: "water/ripples", h: -4, k: 1.2 }],
    fx(126.5, "fishing/props", { piece: "spirit" }, 1, 9, -2),
    ["lantern", 113, 9], ["lantern", 141, 9], XX("bg_xianxia_deco_01_01", 143.5, 9, 5),
  ],
  grid: rows(g),
};
