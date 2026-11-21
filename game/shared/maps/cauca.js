// Vọng Nguyệt Hồ: the fishing lake (shared/cau-ca.js), reached from the menu (▦ Thêm → Câu Cá), left by the way it came.
// The server runs it as KHU_COUNT Khu, a copy each (a world each, numbered, all alike), each for at most KHU_CAP people:
// arriving, one is put in the first Khu with room, and may move to another. Dusk under a rising moon; the water lies a
// row below the banks, as a lake does. West to east: the shore with the Ngư Cụ stall, the fishing pier with its eight
// numbered places (one fishes only there, one person a place), Thạch Đài on the bar, the open deep water with a boat and
// buoys, the far shore and the cliff with the spirit spring's light. No monsters. Fallen in? Steps lead back up.
import { canvas, box, ground, rows } from "./build.js";
import { PLACES } from "../cau-ca.js";

const W = 96, F = 15;
const g = canvas(W, 20);
ground(g, 0, W - 1, F);
// a stone cliff closing the west end
box(g, 0, 1, 2, F - 1, "s");
// the shallows under the pier (two rows of water under the banks), the deep water past Thạch Đài (three)
box(g, 22, 43, F + 1, F + 2, "w");
box(g, 49, 76, F + 1, F + 3, "w");
// the pier, level with the bank, its places along it
box(g, 22, 43, F, F, "b");
const SPOTS = Array.from({ length: PLACES }, (_, i) => 23.5 + i * 2.6);
// Thạch Đài: a low rock on the bar; steps up out of the deep water at both ends
box(g, 45, 47, F - 1, F - 1, "s");
ground(g, 49, 49, F + 3);
ground(g, 76, 76, F + 3);
// the far shore and the cliff in two steps, the spring's light on top
ground(g, 84, W - 1, 13);
ground(g, 89, W - 1, 11);
box(g, W - 2, W - 1, 2, 10, "s");

/** The fishing pier: the row it stands on, its span, its places (x, cells). */
export const PIER = { id: 1, name: "Cầu câu", row: F, x0: 22, x1: 43, spots: SPOTS };

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const fx = (x, id, o = {}, k = 1, row = F, h = 0) => ["fx", x, row, { id, o, k, h }];
// the pier: stilts down into the water, a straw mat at each place with its number
const pier = [];
for (let x = 23; x <= 43; x += 3) pier.push(fx(x + 0.5, "fishing/props", { piece: "stilt", len: 40 }, 1, F + 1, -10));
SPOTS.forEach((x, i) => pier.push(fx(x, "fishing/props", { piece: "seat", n: i + 1 })));

export const CAUCA = {
  id: "cauca",
  name: "Vọng Nguyệt Hồ",
  sub: "Hồ câu dưới trăng: không có yêu thú. Mua cần, mồi ở quầy Ngư Cụ, ra cầu câu ngồi vào một trong 8 chỗ rồi thả câu. Ở hồ không đánh, không dùng công pháp, không ngự kiếm. Hồ chia 30 khu, mỗi khu tối đa 20 người.",
  // its own background music, always this one (public/nhac-nen/2-asianstringsuite/)
  music: "2-asianstringsuite",
  // entered from the menu, not by a road: the way out goes back to wherever one came from. Run as numbered copies (Khu).
  entry: "menu",
  instanced: true,
  cell: 32,
  pvp: false,
  // a quiet lake: no attacks, no arts, no flying sword here (the server refuses them; the fishing buttons take their place)
  peaceful: true,
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
  // the fishing pier: one may cast only from a free place on it
  fishing: [PIER],
  // words over places: [x, row, text, pier (its places taken are shown beside it)]
  signs: [[12.5, F, "Ngư Cụ"], [20.6, F, "Cầu câu", 1], [46, F - 1, "Thạch Đài"]],
  props: [
    // the shore: the Ngư Cụ stall with the old fisherman, lanterns, a willow, the pier's sign and reeds at the water
    fx(12.5, "fishing/stall", {}, 1.25),
    ["lantern", 18, F], ["lantern", 5, F],
    XX("bg_mid_02_05", 8.5, F, 2),
    fx(20.6, "farm/props", { piece: "sign" }),
    ...pier,
    ["lantern", 43.6, F],
    // the bar and Thạch Đài: reeds, the old stele, a pine
    fx(44.5, "fishing/props", { piece: "reeds" }, 1, F), XX("bg_xianxia_deco_01_02", 46.5, F - 1, 4), XX("bg_mid_01_04", 48.2, F, 2, { f: 1 }),
    // the deep water: a boat at anchor, buoys, lily pads and lotus, ripples
    fx(60, "fishing/props", { piece: "boat" }, 1, F + 1, -2),
    fx(55, "fishing/props", { piece: "buoy" }, 1, F + 1, -2), fx(70, "fishing/props", { piece: "buoy" }, 1, F + 1, -2),
    fx(27, "fishing/props", { piece: "lily" }, 1, F + 1, -1), fx(37, "fishing/props", { piece: "lily", lotus: 1 }, 1, F + 1, -1),
    fx(66, "fishing/props", { piece: "lily", lotus: 1 }, 1, F + 1, -1), fx(73, "fishing/props", { piece: "lily", lotus: 2 }, 1, F + 1, -1),
    ["fx", 30, F + 1, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 40, F + 1, { id: "water/ripples", h: -4, k: 1.2 }],
    ["fx", 53, F + 1, { id: "water/ripples", h: -4, k: 1.2 }], ["fx", 68, F + 1, { id: "water/ripples", h: -4, k: 1.2 }],
    // the far shore and the cliff, the spring's light and mist on top
    fx(78, "fishing/props", { piece: "reeds" }, 1, F), XX("bg_mid_02_05", 80.5, F, 2, { f: 1 }), ["lantern", 82.5, F],
    XX("bg_mid_01_04", 86, 13, 2), ["lantern", 88, 13], ["lantern", 91, 11],
    ["glow", 92.5, 11, { r: 90, c: "#7af0d8", a: 0.16, h: 20 }], fx(92.5, "fishing/props", { piece: "spirit" }, 1, 11, -2),
  ],
  grid: rows(g),
};
