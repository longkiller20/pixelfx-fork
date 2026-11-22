// Cửu U Xà Quật: the first Phó Bản (shared/pho-ban.js). A serpent den far under the Nine Netherworlds: violet stone,
// venom glowing green in the pools, bones and old shrines, three halls one after another:
//   the gate hall      where the party arrives and rises again after a fall in the first hall (no monsters)
//   Xà Huyệt           the serpents' burrow: humps of stone, a broken shrine; snakes, toads and slimes
//   Độc Chướng Đầm     the venom marsh: two pools crossed on ledges (the venom burns and throws one back), bats, spirit
//                      fires and great eyes in the air; the Thanh Xà Thống Lĩnh at its far end
//   Cửu U Xà Đàn       the serpent altar: a wide floor for the fight, the altar raised behind; Cửu U Xà Vương
// Each hall is closed off from the next by a seal (phong ấn, `stages[i].seal`) that opens when it is cleared; each has
// a checkpoint (`check`) where whoever falls there rises. One copy per run (instanced), reached only through the
// dungeon. Layout in code (./build.js); see tanthu.js for the characters and fields.
import { canvas, box, ground, rows } from "./build.js";

const W = 200, F = 15;
const g = canvas(W, 20);
ground(g, 0, W - 1, F, "s");
// stone walls closing both ends
box(g, 0, 1, 0, F - 1, "s");
box(g, W - 2, W - 1, 0, F - 1, "s");
// a low roof of hanging rock over the whole den
for (let x = 2; x < W - 2; x++) box(g, x, x, 0, (x * 7) % 5 === 0 ? 2 : (x * 3) % 4 === 0 ? 1 : 0, "s");
// Xà Huyệt: humps of stone, a ledge over the middle
ground(g, 30, 35, 14, "s");
ground(g, 52, 58, 14, "s");
ground(g, 54, 56, 13, "s");
box(g, 41, 46, 11, 11, "k");
// Độc Chướng Đầm: two venom pools, each crossed on ledges
box(g, 82, 92, F, 17, "l");
box(g, 83, 85, 13, 13, "k");
box(g, 89, 91, 13, 13, "k");
box(g, 85, 89, 10, 10, "k");
box(g, 106, 116, F, 17, "l");
box(g, 107, 109, 13, 13, "k");
box(g, 113, 115, 13, 13, "k");
ground(g, 120, 126, 14, "s");
// Cửu U Xà Đàn: the altar raised at the back
ground(g, 186, 197, 14, "s");
ground(g, 189, 197, 13, "s");

/**
 * The halls in cells: x0..x1 along the floor, where one rises after falling there (check), the seal at its far end
 * (none for the last), and spots for its monsters [x, row, up] (fliers wait `up` cells over the floor).
 */
export const STAGES = [
  { x0: 2, x1: 68, check: 7, seal: 70,
    spots: [[24, F, 0], [28, F, 0], [33, 14, 0], [38, F, 0], [43, F, 0], [44, 11, 0], [48, F, 0], [55, 13, 0], [61, F, 0], [65, F, 0], [26, F, 0], [50, F, 0]] },
  { x0: 72, x1: 128, check: 75, seal: 130,
    spots: [[80, F, 4], [87, 10, 3], [96, F, 3], [100, F, 4], [104, F, 2], [111, F, 4], [118, F, 3], [123, 14, 0], [98, F, 0], [94, F, 4]] },
  { x0: 132, x1: 197, check: 136, seal: null,
    boss: [160, F],
    spots: [[150, F, 0], [160, F, 0], [182, F, 0], [190, 13, 0], [155, F, 3], [176, F, 3], [165, F, 4], [185, F, 3]] },
];

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const DUSK = { tint: "#2a0a3a", k: 0.5, d: 0.35 };
const VENOM = (x) => ["glow", x, F, { h: 4, r: 110, c: "#7aff5a", a: 0.22, f: 0.6 }];
const FIRE = (x, row) => ["fx", x, row, { id: "fire/spirit-flame", h: 4, k: 0.8 }];
const BRAZIER = (x, row = F) => ["fx", x, row, { id: "fire/brazier", h: 0, k: 0.8 }];
export const XAQUAT = {
  id: "xaquat",
  name: "Cửu U Xà Quật",
  sub: "Phó bản: hang rắn dưới đáy Cửu U. Ba tầng hang, mỗi tầng bị phong ấn tới khi diệt sạch tầng trước. Chạm vào đầm độc sẽ bị thiêu và hất trở lại bờ.",
  music: "5-forgottentombambience",
  // a copy per run (server/pho-ban.js), never stood up with the other maps
  entry: "dungeon",
  instanced: true,
  cell: 32,
  pvp: false,
  // nobody fights anybody here but the den's monsters
  nopk: true,
  dungeon: "xaquat",
  stages: STAGES,
  // the venom: it burns off this share of sinh lực and throws one back onto the last ground they stood on
  hurt: { cell: "l", hit: 0.15, msg: "Bị độc chướng thiêu đốt!" },
  theme: {
    sky: ["#06030a", "#120818", "#1e0c28", "#2c1238", "#3e1a48"],
    isles: false,
    cloud: ["#2a1438", "#1e0e2a"],
    // no moon under the earth
    heaven: [],
    mountains: { ridge: ["#1a0a24", "#10061a"] },
    earth: ["#0e0812", "#140c1a", "#1a1022", "#22142c", "#2c1a38", "#3a2248"],
    grass: ["#1a2a1a", "#22381e", "#2e4a24", "#3e5e2a", "#5a7a34"],
    rim: "#08040c",
    liquid: "venom",
    platform: "bluestone",
    motes: "spores",
    tiles: { tint: "#2a0a3a", k: 0.4, d: 0.35 },
  },
  mobs: [],
  spawn: { x: 7, row: F },
  portals: [],
  signs: [[12, F, "Cửa Xà Quật"], [36, F, "Xà Huyệt"], [76, F, "Độc Chướng Đầm"], [140, F, "Cửu U Xà Đàn"]],
  props: [
    // the gate hall: a dark gateway, braziers, a stele, lanterns
    XX("bg_mid_02_00", 5, F, 2, DUSK), XX("bg_near_02_02", 12, F, 3), BRAZIER(3.5), BRAZIER(16), ["lantern", 9, F],
    ["glow", 9, F, { h: 40, r: 120, c: "#b06aff", a: 0.16 }],
    // Xà Huyệt: bones, a broken shrine, spirit fire, dead trees
    ["tomb", 27, F, { v: 1 }], ["tomb", 39, F, { v: 2 }], ["tomb", 63, F, { v: 0 }],
    XX("bg_xianxia_near_03_02", 22, F, 2), XX("bg_near_02_03", 55, 13, 4), XX("bg_xianxia_near_03_02", 66, F, 2, { f: 1 }),
    FIRE(33, 14), FIRE(55, 13), XX("bg_near_01_04", 47, F, 3),
    // Độc Chướng Đầm: the pools' glow, reeds and stones, spirit fire
    VENOM(87), VENOM(111), XX("bg_near_01_02", 79, F, 4), XX("bg_near_01_04", 98, F, 3), XX("bg_near_01_02", 122, 14, 4, { f: 1 }),
    FIRE(96, F), FIRE(124, 14), ["fx", 101, F, { id: "shadow/shadow-flames", h: 40, k: 0.6 }],
    // Cửu U Xà Đàn: pillars, braziers, the altar with its flame, skulls circling
    XX("bg_xianxia_near_03_03", 145, F, 3), XX("bg_xianxia_near_03_03", 181, F, 3, { f: 1 }), BRAZIER(150), BRAZIER(178),
    XX("bg_mid_02_02", 193, 13, 2, DUSK), XX("bg_xianxia_near_03_04", 193, 13, 3),
    ["fx", 193, 13, { id: "shadow/necro-skulls", h: 46, k: 1.1 }], ["glow", 193, 13, { h: 60, r: 90, c: "#b04aff", a: 0.25 }],
    ["glow", 165, F, { h: 60, r: 200, c: "#7a2aff", a: 0.12 }],
    // the seals (phong ấn): walls of crimson light, gone once the hall before them is cleared (`seal`: its number)
    ["fx", STAGES[0].seal, F, { id: "chinhta/barrier", o: { side: "t" }, h: 0, k: 1.1, seal: 0 }],
    ["fx", STAGES[1].seal, F, { id: "chinhta/barrier", o: { side: "t" }, h: 0, k: 1.1, seal: 1 }],
  ],
  grid: rows(g),
};
