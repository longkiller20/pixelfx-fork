// Chính Tà Chiến Trường: the battlefield of Chính Tà Phân Tranh (shared/chinh-ta.js, server/chinh-ta.js). Flat ground end
// to end, nothing to hide behind or climb: a fair field. Dusk, the sky split, gold over the west and blood red over the
// east. West, Chính Phái's camp under its gold banners; east, Tà Phái's under crimson ones; each closed by a kết giới (a
// wall of light only its own side passes, and where nobody hits or is hit). In the middle, the Chính Tà stele, half sun,
// half moon. Reached only by being picked for a battle: there is no road in or out. See tanthu.js for the fields.
import { canvas, box, ground, rows } from "./build.js";

const W = 140, F = 15;
const g = canvas(W, 20);
ground(g, 0, W - 1, F);
// stone walls closing both ends
box(g, 0, 1, 0, F - 1, "s");
box(g, W - 2, W - 1, 0, F - 1, "s");

/** The camps (cells): x0..x1 along the floor of `row`. Its own side rises again there, and is safe there. */
export const CAMPS = { c: { x0: 2, x1: 15, row: F }, t: { x0: W - 16, x1: W - 2, row: F } };

const XX = (n, x, row, s, o = {}) => ["xx", x, row, { n, s, ...o }];
const fx = (x, id, o = {}, k = 1, row = F, h = 0) => ["fx", x, row, { id, o, k, h }];
const FLAG = (x, side, k = 1) => fx(x, "chinhta/flag", { side }, k);
const BRAZIER = (x) => ["fx", x, F, { id: "fire/brazier", h: 0, k: 0.8 }];
export const CHIENTRUONG = {
  id: "chientruong",
  name: "Chính Tà Chiến Trường",
  sub: "Chiến trường Chính Tà Phân Tranh: Chính Phái ở phía tây, Tà Phái ở phía đông. Hết giờ, phe nhiều lượt hạ gục hơn thắng. Bị hạ thì hồi sinh ở doanh trại; trong kết giới doanh trại không ai đánh được ai.",
  // its own background music: the battle
  music: "4-lavaareatheme",
  // one battle at a time, made when it starts (server/chinh-ta.js): never stood up with the other maps
  entry: "event",
  instanced: true,
  cell: 32,
  // players fight each other here, on the arena's numbers (no buffs: everyone on the same footing)
  pvp: true,
  camps: CAMPS,
  theme: {
    sky: ["#1a1024", "#3a1a34", "#6a2a3a", "#b0583a", "#f0b060"],
    heaven: [["bg_far_01_03", 520, 26, { tint: "#ffe08a", k: 0.4 }], ["bg_far_01_03", 3900, 30, { tint: "#ff3a3a", k: 0.6 }], ["bg_xianxia_far_04_01", 1600, 40, { tint: "#5a2a4a", k: 0.5 }], ["bg_xianxia_far_03_02", 2800, 34, { tint: "#5a2a4a", k: 0.5 }]],
    mountains: { tint: "#3a1a2e", k: 0.55, dark: 0.2 },
    // no isles floating over a battlefield
    isles: false,
    grass: ["#2a1e1a", "#3a2a1e", "#4e3a24", "#6a5030", "#8a6a3e"],
    motes: "embers",
    tiles: { tint: "#3a2418", k: 0.3, d: 0.25 },
  },
  mobs: [],
  spawn: { x: W / 2, row: F },
  portals: [],
  signs: [[8.5, F, "Doanh trại Chính Phái"], [W - 8.5, F, "Doanh trại Tà Phái"], [W / 2, F, "Chính Tà Thạch Bia"]],
  props: [
    // Chính Phái's camp: gold banners, braziers, its kết giới at the edge
    FLAG(3.5, "c", 1.2), FLAG(13.5, "c", 1.2), FLAG(8.5, "c", 1.6), BRAZIER(5.5), BRAZIER(11.5),
    ["lantern", 6.8, F], ["lantern", 10.2, F],
    fx(CAMPS.c.x1, "chinhta/barrier", { side: "c" }, 1, F, 0),
    ["glow", 8.5, F, { h: 40, r: 160, c: "#ffd56a", a: 0.18 }],
    // the field: old swords in the ground, a broken banner, torches, the stele in the middle
    ["lantern", 30, F], ["lantern", 52, F], ["lantern", 88, F], ["lantern", 110, F],
    XX("bg_mid_01_04", 24, F, 2), XX("bg_mid_01_04", 116, F, 2, { f: 1 }),
    FLAG(40, "c", 0.8), FLAG(100, "t", 0.8),
    fx(W / 2, "chinhta/stele", {}, 1.4),
    ["glow", W / 2, F, { h: 50, r: 140, c: "#ffffff", a: 0.12 }],
    BRAZIER(W / 2 - 6), BRAZIER(W / 2 + 6),
    // Tà Phái's camp: crimson banners, braziers, its kết giới
    fx(CAMPS.t.x0, "chinhta/barrier", { side: "t" }, 1, F, 0),
    FLAG(W - 3.5, "t", 1.2), FLAG(W - 13.5, "t", 1.2), FLAG(W - 8.5, "t", 1.6), BRAZIER(W - 5.5), BRAZIER(W - 11.5),
    ["lantern", W - 6.8, F], ["lantern", W - 10.2, F],
    ["glow", W - 8.5, F, { h: 40, r: 160, c: "#ff3a4a", a: 0.2 }],
  ],
  grid: rows(g),
};
