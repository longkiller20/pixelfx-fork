// Huyết Diễm Ma Uyên: the blood-fire abyss under the tombs. A red-clay cavern under a blood moon, its roof hung with
// stalactites; rivers of lava crossed on stone ledges (falling in burns), a lava fall pouring from the roof, black dragon
// pillars and braziers, and a rune altar where a void orb turns. Flaming skulls and great eyeballs keep it, and shoot.
// The road ends at an obsidian gate: the next map is still to come. Layout in code (./build.js); see tanthu.js for the
// characters and fields.
import { canvas, box, ground, rows } from "./build.js";

const g = canvas(170, 20);
// the entrance ledge from the tombs, the cavern floor
ground(g, 0, 14, 12, "r");
ground(g, 15, 169, 15, "r");
box(g, 15, 15, 12, 14, "r");
// the roof over the middle of the cavern, ragged with stalactites
for (let x = 40; x <= 140; x++) box(g, x, x, 0, (x * 7) % 5 === 0 ? 3 : (x * 3) % 4 === 0 ? 2 : 1, "r");
// three lava pools, each crossed on ledges
box(g, 28, 44, 15, 17, "l");
box(g, 30, 32, 13, 13, "k");
box(g, 35, 37, 13, 13, "k");
box(g, 40, 42, 13, 13, "k");
box(g, 69, 84, 15, 17, "l");
box(g, 70, 72, 13, 13, "k");
box(g, 75, 77, 12, 12, "k");
box(g, 80, 82, 13, 13, "k");
box(g, 74, 78, 9, 9, "k");
box(g, 116, 127, 15, 17, "l");
box(g, 117, 119, 13, 13, "k");
box(g, 123, 125, 13, 13, "k");
// a fall of lava from the roof into the third pool
box(g, 119, 122, 0, 3, "r");
box(g, 120, 121, 4, 14, "|");
// the rune altar on its raised floor
ground(g, 88, 108, 13, "r");
ground(g, 86, 87, 14, "r");
ground(g, 109, 110, 14, "r");
// up to the obsidian gate
ground(g, 140, 169, 13, "r");
ground(g, 150, 169, 11, "r");
ground(g, 139, 139, 14, "r");
ground(g, 148, 149, 12, "r");

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const RED = { tint: "#4a0806", k: 0.55, d: 0.35 };
const LAVA = (x) => ["glow", x, 15, { h: 4, r: 110, c: "#ff5a14", a: 0.32, f: 0.6 }];
const BRAZIER = (x, row) => ["fx", x, row, { id: "fire/brazier", h: 0, k: 0.8 }];
export const MAVUC = {
  id: "mavuc",
  name: "Huyết Diễm Ma Uyên",
  sub: "Vực lửa dưới lòng cổ mộ, dưới vầng huyết nguyệt. Phi đầu lâu và ma nhãn canh giữ, bắn từ xa. Rơi xuống dòng nham thạch sẽ bị bỏng.",
  cell: 32,
  pvp: false,
  // standing in lava burns: this share of sinh lực each second
  hurt: { cell: "l", perSec: 0.18 },
  theme: {
    sky: ["#0a0204", "#240508", "#4e0c0c", "#7e1a10", "#c0441a"],
    isles: false,
    cloud: ["#4a1410", "#3a0e0c"],
    heaven: [["bg_far_01_03", 640, 18, { tint: "#ff2a10", k: 0.65 }], ["bg_far_01_03", 1820, 30, { tint: "#ff2a10", k: 0.65 }]],
    mountains: { ridge: ["#2a0a0c", "#160608"] },
    earth: ["#140a0a", "#1e0e0c", "#28120e", "#321812", "#3e1e16", "#52281c"],
    grass: ["#2a0e0a", "#3a140c", "#4e1c10", "#6a2814", "#8a3a1a"],
    rim: "#0a0404",
    liquid: "lava",
    platform: "redclay",
    motes: "embers",
    // the pack's red clay and stone, darkened and burnt by the glow
    tiles: { tint: "#3a0806", k: 0.3, d: 0.35 },
  },
  mobs: [
    { type: "flying_skull", x: 36, row: 15, up: 5 }, { type: "flying_skull", x: 77, row: 15, up: 6 }, { type: "flying_skull", x: 122, row: 15, up: 5 },
    { type: "eyeball", x: 57, row: 15, up: 3 }, { type: "eyeball", x: 98, row: 13, up: 4 }, { type: "eyeball", x: 145, row: 13, up: 3 },
  ],
  spawn: { x: 7, row: 12 },
  portals: [
    { x: 2.5, row: 12, r: 0.8, to: "uminh", msg: "Lên U Minh Cổ Mộ" },
    { x: 166, row: 11, r: 0.8, to: null, msg: "Cánh cổng hắc diệu thạch vẫn còn phong ấn: vùng đất mới sẽ mở rộng sau." },
  ],
  props: [
    // the entrance: a stele, a black pillar, a cauldron with fire
    XX("bg_near_02_02", 9, 12, 3, RED), XX("bg_xianxia_near_03_00", 13, 12, 3), XX("bg_near_02_03", 5.5, 12, 4, RED), BRAZIER(5.5, 11.2),
    // the first lava pool: flame pillars rising out of it, boulders, standing stones
    LAVA(36), ["fx", 33.5, 15, { id: "fire/flame-pillar", k: 0.9, every: 2.5 }], XX("bg_near_01_02", 24, 15, 3, RED), XX("bg_xianxia_mid_04_04", 50, 15, 3, RED),
    XX("bg_xianxia_mid_04_05", 46, 15, 3, RED), XX("bg_xianxia_near_03_03", 55, 15, 2), XX("bg_xianxia_near_03_03", 64, 15, 2, { f: 1 }), BRAZIER(59.5, 15),
    // the second pool, with a fire tornado turning over it
    LAVA(76), ["fx", 77, 15, { id: "fire/fire-tornado", h: 10, k: 1.1 }], XX("bg_near_01_02", 86, 15, 4, RED),
    // the rune altar: the circle burning on the floor, a void orb turning above it, dragon pillars with braziers, an altar table
    ["fx", 98, 13, { id: "shadow/void-orb", h: 70, k: 1 }], ["glow", 98, 13, { h: 70, r: 90, c: "#b060ff", a: 0.3 }],
    XX("bg_xianxia_near_03_03", 90, 13, 2), XX("bg_xianxia_near_03_03", 106, 13, 2, { f: 1 }), BRAZIER(92.5, 13), BRAZIER(103.5, 13),
    XX("bg_xianxia_near_03_04", 98, 13, 3), ["fx", 98, 13, { id: "arcane/rune-circle", h: -6, k: 1.4 }],
    // the third pool under the lava fall
    LAVA(121), ["glow", 120.5, 9, { r: 70, c: "#ff7a2a", a: 0.25 }], ["fx", 125.5, 15, { id: "fire/flame-pillar", k: 0.8, every: 3.5 }], XX("bg_near_01_02", 131, 15, 3, RED),
    // the obsidian gate: standing stones, pillars, braziers, the sealed way on
    XX("bg_xianxia_mid_04_04", 145, 13, 3, RED), XX("bg_xianxia_near_03_00", 156, 11, 2), XX("bg_xianxia_near_03_00", 163, 11, 2, { f: 1 }),
    XX("bg_mid_02_02", 160, 11, 2, { tint: "#2a0606", k: 0.7, d: 0.3 }), BRAZIER(153, 11), BRAZIER(167.5, 11), ["fx", 160, 11, { id: "arcane/portal", h: 40, k: 1, o: { palette: ["#1a0408", "#4a0a12", "#8a1a1a", "#d04020", "#ff8a40", "#ffe0a0"] } }],
    ["fx", 160, 11, { id: "shadow/shadow-flames", h: 0, k: 0.9 }],
  ],
  grid: rows(g),
};
