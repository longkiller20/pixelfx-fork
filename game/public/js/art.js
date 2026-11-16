// What everything looks like: the three schools' characters (rigged from the pixelfx sprites), the monsters, the
// dragon, the corpse puppet, and the world's backdrop.
import { decode, Rig, Serpent } from "/pixelfx/fx/moves/_sprite-rig.js";
import { FIGHTER, ARMOR, DRAGON } from "/pixelfx/fx/moves/_henshin-art.js";
import { BOY, KING } from "/pixelfx/fx/moves/_timeking-art.js";
import { PUPPET } from "/pixelfx/fx/moves/corpse-devour.js";
import { DRAGON_SPINE, DRAGON_MOUTH } from "/pixelfx/fx/moves/henshin-dragon.js";
import { HERO2, TARGET_SPRITE, hex, mix, WHITE } from "/pixelfx/core/index.js";
import { WORLD, ZONES, SPRING } from "/shared/balance.js";

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

/**
 * Draw a character with its feet at the painter's origin. st: { cls, form, t (seconds, for idle motion), moving, cast:
 * { s, age } | null, busy, slow, flash, ghost }.
 */
export function drawCharacter(p, st) {
  const look = LOOKS[st.cls], rig = st.form ? look.form : look.base, t = st.t;
  const pose = { armF: 0, armB: 0, dx: 0, dy: 0 };
  if (st.moving) {
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

// ---- the world's backdrop, painted once: a Uint32Array of WORLD.w x WORLD.h
const rnd = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const GROUND = 200;

export function paintWorld() {
  const W = WORLD.w, H = WORLD.h, out = new Uint32Array(W * H);
  const C = (h) => hex(h);
  const sky = [C("#0b0912"), C("#110d1c"), C("#181226"), C("#201833"), C("#2a1f40")];
  const far = C("#1d1830"), farL = C("#2a2344"), near = C("#241c38"), nearL = C("#33284d");
  const plaza = [C("#3a3450"), C("#3f3857"), C("#36304b")], mortar = C("#29243b"), edge = C("#5a527a");
  const grass = [C("#2c4a2e"), C("#305234"), C("#284329"), C("#365c39")], tuft = C("#4a7a44"), dirt = [C("#5a4632"), C("#4e3c2b")];
  const sand = [C("#8a6a44"), C("#82633f"), C("#93724a")], sandD = C("#6e5236"), ringStone = C("#5a3a2a"), ringL = C("#7a5038");
  const water = C("#1d5a6a"), waterL = C("#3aa0b0"), waterD = C("#164552");
  for (let x = 0; x < W; x++) {
    const ym = 110 + 30 * Math.sin(x / 140) + 18 * Math.sin(x / 53 + 2) + 8 * Math.sin(x / 17);
    const yn = 160 + 16 * Math.sin(x / 90 + 1) + 9 * Math.sin(x / 31);
    for (let y = 0; y < GROUND; y++) {
      let c = sky[Math.min(4, Math.floor((y / GROUND) * 5 + rnd(x, y) * 0.6))];
      if (rnd(x, y, 3) > 0.996 && y < 120) c = mix(c, C("#d8d0ff"), 0.6);
      if (y >= ym) c = y < ym + 1.5 ? farL : far;
      if (y >= yn) c = y < yn + 1.5 ? nearL : near;
      out[y * W + x] = c;
    }
  }
  const arena = { x: 1500, y: 550, rx: 270, ry: 300 };
  for (let y = GROUND; y < H; y++)
    for (let x = 0; x < W; x++) {
      const z = x < ZONES[0].x1 ? 0 : x < ZONES[1].x1 ? 1 : 2, r = rnd(x, y, 7);
      let c;
      if (z === 0) {
        const row = Math.floor((y - GROUND) / 14), off = row & 1 ? 12 : 0;
        c = (y - GROUND) % 14 === 13 || (x + off) % 24 === 0 ? mortar : plaza[Math.floor(rnd(Math.floor((x + off) / 24), row, 2) * 3)];
      } else if (z === 1) {
        c = grass[Math.floor(rnd(x >> 2, y >> 2, 5) * 4)];
        if (r > 0.985) c = tuft;
        if (Math.abs(y - 470 - 12 * Math.sin(x / 60)) < 16 + 4 * rnd(x >> 3, 1)) c = dirt[r > 0.5 ? 0 : 1];
      } else {
        const dx = (x - arena.x) / arena.rx, dy = (y - arena.y) / arena.ry, d = Math.hypot(dx, dy);
        c = sand[Math.floor(r * 3)];
        if (d > 1) c = sandD;
        else if (d > 0.965) c = d > 0.985 ? ringL : ringStone;
      }
      if (y === GROUND) c = edge;
      // the spirit vein's pool
      const sx = (x - SPRING.x) / (SPRING.r * 0.9), sy = (y - SPRING.y) / (SPRING.r * 0.42), s = Math.hypot(sx, sy);
      if (s < 1) c = s > 0.88 ? waterL : s > 0.55 ? water : r > 0.5 ? water : waterD;
      out[y * W + x] = c;
    }
  // gates between the zones: posts with lanterns
  const post = C("#3a2418"), postL = C("#6a3e24"), lantern = C("#ffcc66");
  for (const gx of [ZONES[0].x1, ZONES[1].x1])
    for (let py = GROUND + 20; py < H; py += 90)
      for (let j = 0; j < 22; j++)
        for (let i = -2; i <= 2; i++) {
          const y = py - j, x = gx + i;
          out[y * W + x] = j > 18 && Math.abs(i) < 2 ? lantern : i < 0 ? postL : post;
        }
  return out;
}
