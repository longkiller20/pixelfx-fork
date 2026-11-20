// Gia Viên: a player's own homestead (shared/gia-vien.js). The same map for everyone, but every player has their own
// copy of it on the server (an instance only they enter), with their house, animals and herbs on it. Left to right: a
// cliff, the house plot (the house the player owns stands on it), the farm's fenced pen, the herb garden's beds, the way out.
import { canvas, box, ground, rows } from "./build.js";
import { LAYOUT } from "../gia-vien.js";

const W = 104, Hh = 20, F = LAYOUT.floor;
const g = canvas(W, Hh);
ground(g, 0, W - 1, F);
// a stone cliff on the left and the right: the edges of the homestead
box(g, 0, 1, 2, F - 1, "s");
box(g, W - 2, W - 1, 2, F - 1, "s");

// the farm's fixtures and the garden's beds as pixelfx props ("fx": drawn live, k the scale), the zone signs
const fx = (x, id, o, k = 1, row = F) => ["fx", x, row, { id, o, k }];
const props = [
  // Nhà Ở: a sign at its edge
  fx(37.5, "farm/props", { piece: "sign" }),
  ["lantern", 38.6, F],
  // Nông Trại: fences round the pen, the coop, a trough, a haystack
  ...[40, 41, 42].map((x) => fx(x + 0.5, "farm/props", { piece: "fence" })),
  ...[64, 65, 66].map((x) => fx(x + 0.5, "farm/props", { piece: "fence" })),
  fx(43.8, "farm/props", { piece: "sign" }),
  fx(61, "farm/props", { piece: "coop" }),
  fx(47, "farm/props", { piece: "trough", full: 1 }),
  fx(57, "farm/props", { piece: "haystack" }),
  // Vườn Dược: the sign; its beds are drawn by the game with what grows in them
  fx(69, "farm/props", { piece: "sign" }),
  ["lantern", 97, F],
  ["pine", 99.5, F, { v: 1 }],
  ["cherry", 67.5, F],
];

export const GIAVIEN = {
  id: "giavien",
  name: "Gia Viên",
  sub: "Gia viên của riêng đạo hữu: nhà ở, nuôi gia súc, trồng dược thảo.",
  music: "1-liyan",
  instanced: true,
  cell: 32,
  pvp: false,
  mobs: [],
  spawn: { x: 38.5, row: F },
  // the way out: back to wherever they came from (the server decides; "@back")
  portals: [{ x: 100.5, row: F, r: 0.8, to: "@back", msg: "Rời Gia Viên" }],
  // words written on the signs (by the game, over them)
  signs: [[37.5, F, "Nhà Ở"], [43.8, F, "Nông Trại"], [69, F, "Vườn Dược"]],
  props,
  deco: [],
  grid: rows(g),
};
