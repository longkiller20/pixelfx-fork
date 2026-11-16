// What everything looks like: the three schools' characters (rigged from the pixelfx sprites), the monsters, the
// dragon, the corpse puppet, and the world's backdrop.
import { decode, Rig, Serpent } from "/pixelfx/fx/moves/_sprite-rig.js";
import { FIGHTER, ARMOR, DRAGON } from "/pixelfx/fx/moves/_henshin-art.js";
import { BOY, KING } from "/pixelfx/fx/moves/_timeking-art.js";
import { PUPPET } from "/pixelfx/fx/moves/corpse-devour.js";
import { DRAGON_SPINE, DRAGON_MOUTH } from "/pixelfx/fx/moves/henshin-dragon.js";
import { HERO2, TARGET_SPRITE, hex, mix, WHITE } from "/pixelfx/core/index.js";

// ---- the three schools
const fighter = new Rig(decode(FIGHTER), [
  { name: "armF", poly: [[41, 21], [47, 22], [49, 30], [55, 31], [55, 43], [45, 43], [42, 34], [40, 28]], pivot: [42, 24] },
  { name: "armB", poly: [[24, 24], [30, 24], [30, 31], [28, 35], [28, 46], [15, 46], [15, 33], [21, 29]], pivot: [28, 26] },
]);
const armor = new Rig(decode(ARMOR), [
  { name: "armF", poly: [[28, 20], [41, 20], [41, 37], [31, 37], [28, 31]], pivot: [29, 24] },
  { name: "armB", poly: [[0, 19], [13, 19], [13, 29], [11, 47], [0, 47]], pivot: [12, 23] },
]);
const boy = new Rig(decode(BOY), [
  { name: "armF", poly: [[25, 24], [33, 24], [33, 48], [26, 48], [26, 34]], pivot: [27, 26] },
  { name: "armB", poly: [[2, 24], [10, 24], [12, 34], [12, 47], [2, 47]], pivot: [10, 25] },
]);
const king = new Rig(decode(KING), []);

// the corpse master: the stock figure at twice the size in a Taoist's dark violet robe
const PRIEST_PAL = { k: "#0b0812", A: "#e8d8b8", B: "#b49ad0", C: "#7c62a8", D: "#4c3874", E: "#5e4886", F: "#3a2a5a", G: "#251a3c", J: "#180f28", m: "#58f0a0" };
const priest = (() => {
  const W = 24, H = 38, px = new Uint32Array(W * 2 * H * 2);
  HERO2.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "." || !PRIEST_PAL[ch]) return;
    const c = hex(PRIEST_PAL[ch]);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) px[(y * 2 + j) * W * 2 + x * 2 + i] = c;
  }));
  return new Rig({ w: W * 2, h: H * 2, ox: W, oy: H * 2, px }, [
    { name: "armF", poly: [[28, 30], [42, 30], [42, 52], [28, 52]], pivot: [30, 32] },
  ]);
})();

export const LOOKS = {
  long: { base: fighter, form: armor, h: 66, color: "#ff6a3a" },
  time: { base: boy, form: king, h: 84, color: "#ffd84a" },
  corpse: { base: priest, form: priest, h: 76, color: "#7dffb0" },
};

const SLOW = hex("#a060ff"), HAIR_X = 28;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Draw a character with its feet at the painter's origin. st: { cls, form, t (seconds, for idle motion), moving, cast:
 * { s, age } | null, busy, slow, flash, ghost }.
 */
export function drawCharacter(p, st) {
  const look = LOOKS[st.cls], rig = st.form ? look.form : look.base, t = st.t;
  const pose = { armF: 0, armB: 0, dx: 0, dy: 0 };
  if (st.air) {
    // in the air: arms flung up a little, legs tucked by a pixel
    pose.armF = -0.6;
    pose.armB = 0.4;
  } else if (st.moving) {
    pose.dy = Math.floor(t * 8) & 1 ? -1 : 0;
    pose.armF = Math.sin(t * 10) * 0.22;
    pose.armB = -Math.sin(t * 10) * 0.22;
  } else pose.dy = Math.floor(t * 2) & 1;
  const c = st.cast;
  if (st.busy) pose.armF = -1.1;
  else if (c && c.age < 0.45) {
    const u = c.age / 0.45;
    if (c.type === "melee") pose.armF = u < 0.25 ? -1.8 : 0.7 * (1 - u);
    else if (c.type === "transform") (pose.armF = -2.6 * (1 - u)), (pose.armB = 0.5 * (1 - u)), (pose.dy -= u < 0.5 ? 2 : 0);
    else (pose.armF = -1.2 * (1 - u * u)), (pose.dx = u < 0.3 ? 1 : 0);
  }
  rig.draw(p, 0, 0, pose, {
    fill: true,
    warp: rig === fighter ? (x, y) => [clamp01((HAIR_X - x) / 12) * clamp01((36 - y) / 10) * Math.sin(t * 5 - y * 0.32) * (st.moving ? 1.6 : 0.8), 0]
      : rig === king ? (x, y) => [y > 48 ? ((y - 48) / 37) * (x < 24 ? 1 : x > 56 ? -1 : 0.3) * 1.6 * Math.sin(t * 4 - y * 0.2) : 0, 0]
      : null,
    color: (col) => (st.flash ? WHITE : st.slow ? mix(col, SLOW, 0.35) : col),
  });
}

// ---- monsters and summons
const DUMMY_PX = [];
for (let r = 0; r < TARGET_SPRITE.h; r++)
  for (let x = 0; x < TARGET_SPRITE.w; x++) {
    const c = TARGET_SPRITE.data[r * TARGET_SPRITE.w + x];
    if (c) DUMMY_PX.push([x - TARGET_SPRITE.ax, r - TARGET_SPRITE.h, c]);
  }
export function drawDummy(p, sway, flash) {
  for (const [x, y, c] of DUMMY_PX) p.px(x + Math.round(((-y - 6) / 46) * sway), y, flash ? WHITE : c);
}

const PCOL = Object.fromEntries(Object.entries(PUPPET.colors).map(([k, v]) => [k, hex(v)]));
const puppetCells = (open) => {
  const out = [];
  for (let r = 0; r < PUPPET.h; r++) {
    const row = (open && PUPPET.jaw[r]) || PUPPET.body[r] || "";
    for (let c = 0; c < row.length; c++) if (row[c] !== ".") out.push([c - PUPPET.ax, r - PUPPET.h, PCOL[row[c]], row[c] === "e"]);
  }
  return out;
};
const PUPPET_SHUT = puppetCells(false), PUPPET_OPEN = puppetCells(true);
const TALISMAN = ["#c8a040", "#ecd27a", "#c42a2a"].map(hex), EYE = hex("#7dffb0");
export function drawPuppet(p, biting, lift, t) {
  for (const [x, y, c, eye] of biting ? PUPPET_OPEN : PUPPET_SHUT) {
    p.px(x, y - lift, c);
    if (eye) p.light(x, y - lift, EYE, 0.9);
  }
  // the talisman over its face
  const sw = Math.round(Math.sin(t * 9) * 0.8);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 3; i++) p.px(1 + i + (j > 5 ? sw : 0), -36 + j - lift, i === 1 && j > 1 && j < 7 ? TALISMAN[2] : TALISMAN[j === 0 ? 0 : 1]);
}

export const dragon = new Serpent(decode(DRAGON), DRAGON_SPINE, 0.13);
export const DRAGON_SIZE = [117, 114], MOUTH = DRAGON_MOUTH;
