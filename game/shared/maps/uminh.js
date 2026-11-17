// U Minh Cổ Mộ: the old tombs under a full moon. A graveyard of mounds, tablets and leaning slabs where ghosts drift and
// spirit fire burns; a stone mausoleum on a terrace, with a moon gate, guardian lions and an altar where skulls circle a
// green flame; a dead wood of black trees where bats hang about the broken walkways; and a watchtower on the rise to the
// east, over the stair down into the abyss. Layout in code (./build.js); see tanthu.js for the characters and fields.
import { canvas, box, ground, rows } from "./build.js";

const g = canvas(160, 20);
ground(g, 0, 159, 15);
// burial mounds
ground(g, 20, 26, 14);
ground(g, 44, 50, 14);
// the mausoleum: a stone terrace, an upper terrace for the gate and altar
ground(g, 60, 92, 14, "s");
ground(g, 62, 90, 13, "s");
ground(g, 69, 85, 12, "s");
ground(g, 71, 83, 11, "s");
// the dead wood: humps, a stone, broken walkways up among the branches
ground(g, 100, 106, 14);
ground(g, 112, 118, 14);
ground(g, 114, 118, 13);
box(g, 104, 110, 10, 10, "b");
box(g, 120, 126, 9, 9, "b");
// the rise to the watchtower and the stair down to the abyss
ground(g, 132, 159, 14);
ground(g, 137, 159, 12);
box(g, 135, 136, 13, 13, "s");
box(g, 137, 137, 12, 12, "s");

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const NIGHT = { tint: "#1a1838", k: 0.35, d: 0.25 };
const FIRE = (x, row) => ["fx", x, row, { id: "fire/spirit-flame", h: 4, k: 0.8 }];
const PALE = (x, row) => ["glow", x, row, { h: 30, r: 46, c: "#7ff0ff", a: 0.22, f: 2 }];
export const UMINH = {
  id: "uminh",
  name: "U Minh Cổ Mộ",
  sub: "Nghĩa địa cổ dưới trăng tròn. Âm hồn lang thang giữa mộ, quỷ hỏa trôi quanh lăng, huyết bức treo mình trong rừng chết.",
  cell: 32,
  pvp: false,
  theme: {
    sky: ["#05040e", "#0d0b22", "#1c1940", "#302c58", "#4a4268"],
    isles: false,
    cloud: ["#3a3658", "#2a2848"],
    heaven: [["bg_far_01_03", 260, 14, { tint: "#d8e0ff", k: 0.2 }], ["bg_far_01_03", 1360, 24, { tint: "#d8e0ff", k: 0.2 }]],
    mountains: { tint: "#14122e", k: 0.75, dark: 0.35 },
    earth: ["#100d12", "#171318", "#1e191f", "#262027", "#2f2831", "#3d343f"],
    grass: ["#181d18", "#232a22", "#30362b", "#434734", "#5e6046"],
    rim: "#08060a",
    motes: "souls",
    // the pack's blue stone, under the moon
    tiles: { tint: "#1a1838", k: 0.45, d: 0.4 },
  },
  mobs: [
    { type: "ghost", x: 17, row: 15, up: 1 }, { type: "ghost", x: 35, row: 15, up: 1 }, { type: "ghost", x: 53, row: 15, up: 1 },
    { type: "wisp", x: 42, row: 15, up: 2 }, { type: "wisp", x: 77, row: 11, up: 2 }, { type: "wisp", x: 128, row: 15, up: 2 },
    { type: "bat", x: 102, row: 15, up: 4 }, { type: "bat", x: 107, row: 10, up: 2 }, { type: "bat", x: 123, row: 9, up: 2 },
  ],
  spawn: { x: 7, row: 15 },
  portals: [
    { x: 2.5, row: 15, r: 0.8, to: "linhthuy", msg: "Về Linh Thủy Đàm" },
    { x: 157, row: 12, r: 0.8, to: "mavuc", msg: "Xuống Huyết Diễm Ma Uyên" },
  ],
  props: [
    // the way in: a dark gateway, a fence, a hanging lantern with pale ghost-light
    XX("bg_mid_02_00", 9, 15, 2, NIGHT), XX("bg_near_02_04", 15, 15, 3), XX("bg_near_02_00", 18, 15, 3), PALE(17.4, 13),
    // the graveyard: mounds with steles, tablets, leaning slabs; spirit fire over some; dead trees, steles
    ["tomb", 12.5, 15, { v: 0 }], ["tomb", 23, 14, { v: 1 }], ["tomb", 28, 15, { v: 2 }], ["tomb", 31.5, 15, { v: 0 }], ["tomb", 39, 15, { v: 2 }],
    ["tomb", 47, 14, { v: 1 }], ["tomb", 52.5, 15, { v: 0 }], ["tomb", 56, 15, { v: 2 }], ["tomb", 35, 15, { v: 1 }],
    XX("bg_near_01_00", 26, 15, 2), XX("bg_near_02_02", 42, 15, 3), XX("bg_near_01_00", 58, 15, 2, { f: 1 }), XX("bg_near_02_00", 37, 15, 3), PALE(36.4, 13),
    FIRE(23, 14), FIRE(31.5, 15), FIRE(47, 14), FIRE(56, 15),
    // the mausoleum: lions at the stair, pillars, the moon gate, the altar with skulls circling green flame, a cauldron
    XX("bg_near_02_01", 64, 13, 3), XX("bg_near_02_01", 88, 13, 3, { f: 1 }), XX("bg_xianxia_near_03_03", 70.5, 11, 3), XX("bg_xianxia_near_03_03", 83.5, 11, 3, { f: 1 }),
    XX("bg_mid_02_02", 77, 11, 2, NIGHT), XX("bg_xianxia_near_03_04", 77, 11, 3), XX("bg_near_02_03", 66.5, 13, 4),
    ["fx", 77, 11, { id: "shadow/necro-skulls", h: 46, k: 1.1 }], ["glow", 77, 11, { h: 60, r: 70, c: "#6aff8a", a: 0.25 }],
    ["fx", 66.5, 13, { id: "shadow/shadow-flames", h: 40, k: 0.7 }],
    // the dead wood: black trees, a boulder, reeds
    XX("bg_near_01_00", 97, 15, 2), XX("bg_xianxia_near_03_02", 109, 14, 2), XX("bg_near_01_00", 123, 15, 2, { f: 1 }), XX("bg_near_01_02", 115.5, 13, 4),
    XX("bg_near_01_04", 103, 14, 3), XX("bg_near_01_04", 129, 15, 3, { f: 1 }),
    // the rise: the watchtower against the moon, a stele, lanterns down to the abyss
    XX("bg_mid_02_01", 145, 12, 2, NIGHT), XX("bg_near_02_02", 139.5, 12, 3), XX("bg_near_02_00", 153, 12, 3), PALE(152.4, 10), ["sign", 158.5, 12],
  ],
  grid: rows(g),
};
