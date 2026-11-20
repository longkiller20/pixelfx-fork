// Vọng Nguyệt Hồ: the fishing lake (shared/cau-ca.js), reached from the menu (▦ Thêm → Câu Cá), left by the way it came.
// Dusk under a rising moon. The water lies a row below the banks, as a lake does. One fishes only from the piers, and
// each pier is a Khu with a few numbered places (a straw mat each): Khu 1 and 2 over the shallows, 3 and 4 over the deep
// water either side of Thạch Đảo, 5 over the spirit spring on the clifftop. West to east: the shore with the Ngư Cụ
// stall, Khu 1, the reed bar, Khu 2, Thạch Đài, Khu 3, Thạch Đảo, Khu 4, the far shore, the cliff, Linh Tuyền and Khu 5.
// No monsters: a quiet place. Fallen in? The lake floor has steps back up to the piers.
import { canvas, box, ground, rows } from "./build.js";

const W = 160, F = 15;
const g = canvas(W, 20);
ground(g, 0, W - 1, F);
// a stone cliff closing the west end
box(g, 0, 1, 2, F - 1, "s");
// the shallows (two rows of water under the banks) and the deep water (three)
box(g, 22, 33, F + 1, F + 2, "w");
box(g, 39, 50, F + 1, F + 2, "w");
box(g, 57, 68, F + 1, F + 3, "w");
box(g, 75, 86, F + 1, F + 3, "w");
// the piers, level with the banks: each one a Khu
box(g, 22, 33, F, F, "b");
box(g, 39, 50, F, F, "b");
box(g, 57, 68, F, F, "b");
box(g, 75, 86, F, F, "b");
// Thạch Đài: a low rock on the bar between the shallows and the deep; Thạch Đảo, a stone isle between Khu 3 and Khu 4
box(g, 52, 55, F - 1, F - 1, "s");
box(g, 69, 74, F, F + 4, "s");
// steps up from the deep water's floor at each end of its piers
for (const x of [57, 68, 75, 86]) ground(g, x, x, F + 3);
// the far shore and the cliff in three steps
ground(g, 100, W - 1, 13);
ground(g, 105, W - 1, 11);
ground(g, 110, W - 1, 9);
// Linh Tuyền: the spring's pool on the clifftop, a row below its banks, with the jade pier of Khu 5 over it
box(g, 120, 143, 10, 11, "w");
box(g, 120, 131, 9, 9, "b");
// a stone cliff closing the east end
box(g, W - 2, W - 1, 2, 8, "s");

/** The fishing places, Khu by Khu: which water (zone) it is over, the row its pier stands on, its places (x, cells). */
export const KHU = [
  { id: 1, name: "Khu 1", zone: "ben", row: F, x0: 22, x1: 33, spots: [24.5, 27, 29.5, 32] },
  { id: 2, name: "Khu 2", zone: "ben", row: F, x0: 39, x1: 50, spots: [41.5, 44, 46.5, 49] },
  { id: 3, name: "Khu 3", zone: "ho", row: F, x0: 57, x1: 68, spots: [59.5, 62, 64.5, 67] },
  { id: 4, name: "Khu 4", zone: "ho", row: F, x0: 75, x1: 86, spots: [77.5, 80, 82.5, 85] },
  { id: 5, name: "Khu 5", zone: "tuyen", row: 9, x0: 120, x1: 131, spots: [122.5, 125.5, 128.5] },
];

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const fx = (x, id, o = {}, k = 1, row = F, h = 0) => ["fx", x, row, { id, o, k, h }];
// each pier: stilts down into the water, a straw mat at each place with its number, a lantern at its far end
const piers = [];
for (const k of KHU) {
  for (let x = k.x0 + 1; x <= k.x1; x += 3) piers.push(fx(x + 0.5, "fishing/props", { piece: "stilt", len: 40 }, 1, k.row + 1, -10));
  k.spots.forEach((x, i) => piers.push(fx(x, "fishing/props", { piece: "seat", n: i + 1, jade: k.zone === "tuyen" ? 1 : 0 }, 1, k.row)));
}
export const CAUCA = {
  id: "cauca",
  name: "Vọng Nguyệt Hồ",
  sub: "Hồ câu dưới trăng: không có yêu thú. Mua cần, mồi ở quầy Ngư Cụ, ra cầu câu (Khu 1-5) ngồi vào chỗ trống rồi thả câu. Cá quý ở Hồ Sâu và Linh Tuyền.",
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
    // the piers stand over the water, not on it: no water painted behind their planks
    dockWater: false,
  },
  mobs: [],
  spawn: { x: 7, row: F },
  portals: [{ x: 2.6, row: F, r: 0.8, to: "@back", msg: "Rời Vọng Nguyệt Hồ" }],
  // the stall where rods and bait are sold and fish bought: stand within r cells of x
  shop: { x: 12.5, row: F, r: 3.2 },
  // the fishing places (KHU above): one may cast only from a free place on a pier
  fishing: KHU,
  // words over places: [x, row, text, khu (its occupancy is shown beside it)]
  signs: [[12.5, F, "Ngư Cụ"], [20.6, F, "Khu 1 · Nước nông", 1], [37, F, "Khu 2 · Nước nông", 2], [54, F - 1, "Thạch Đài"], [56, F, "Khu 3 · Hồ Sâu", 3],
    [72, F, "Khu 4 · Hồ Sâu", 4], [118.6, 9, "Khu 5 · Linh Tuyền", 5]],
  props: [
    // the shore: the Ngư Cụ stall with the old fisherman, lanterns, a willow, reeds at the water
    fx(12.5, "fishing/stall", {}, 1.25),
    ["lantern", 18, F], ["lantern", 5, F],
    XX("bg_mid_02_05", 8.5, F, 2),
    fx(20.6, "farm/props", { piece: "sign" }), fx(37, "farm/props", { piece: "sign" }), fx(56, "farm/props", { piece: "sign" }),
    fx(72, "farm/props", { piece: "sign" }), fx(118.6, "farm/props", { piece: "sign" }, 1, 9),
    // the piers
    ...piers,
    ["lantern", 33.6, F], ["lantern", 50.6, F], ["lantern", 68.6, F], ["lantern", 86.6, F], ["lantern", 131.6, 9],
    // the reed bar between Khu 1 and 2: reeds, a boat pulled up
    fx(35.5, "fishing/props", { piece: "reeds" }, 1, F), fx(98, "fishing/props", { piece: "reeds" }, 1, F),
    fx(91, "fishing/props", { piece: "boat" }, 1, F, -2),
    // lily pads and lotus on the water, buoys, ripples
    fx(28, "fishing/props", { piece: "lily" }, 1, F + 1, -1), fx(45, "fishing/props", { piece: "lily", lotus: 1 }, 1, F + 1, -1),
    fx(63, "fishing/props", { piece: "lily", lotus: 1 }, 1, F + 1, -1), fx(81, "fishing/props", { piece: "lily" }, 1, F + 1, -1),
    fx(66, "fishing/props", { piece: "buoy" }, 1, F + 1, -2), fx(78, "fishing/props", { piece: "buoy" }, 1, F + 1, -2),
    ["fx", 31, F + 1, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 47, F + 1, { id: "water/ripples", h: -4, k: 1.2 }],
    ["fx", 60, F + 1, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 84, F + 1, { id: "water/ripples", h: -4, k: 1.2 }],
    // Thạch Đài and Thạch Đảo: pines on the rocks, a stone lantern, the old stele
    XX("bg_xianxia_deco_01_02", 53.5, F - 1, 4), XX("bg_mid_01_04", 71.5, F, 2, { f: 1 }), ["lantern", 73.5, F],
    // the far shore and the cliff
    XX("bg_mid_02_05", 94, F, 2, { f: 1 }), ["lantern", 96, F], XX("bg_mid_01_04", 102, 13, 2), ["lantern", 107, 11],
    // Linh Tuyền: spirit light over the pool, lotus, the spring's mist
    ["glow", 131.5, 10, { r: 120, c: "#7af0d8", a: 0.16, h: 20 }],
    fx(135, "fishing/props", { piece: "lily", lotus: 2 }, 1, 10, -1), fx(140, "fishing/props", { piece: "lily", lotus: 2 }, 1, 10, -1),
    ["fx", 137.5, 10, { id: "water/ripples", h: -4, k: 1.2 }],
    fx(134, "fishing/props", { piece: "spirit" }, 1, 10, -2),
    ["lantern", 114, 9], ["lantern", 146, 9], XX("bg_xianxia_deco_01_01", 148.5, 9, 5),
  ],
  grid: rows(g),
};
