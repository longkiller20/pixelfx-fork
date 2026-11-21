// A xianxia teleport array (truyền tống trận) set in the floor. The floor ring, runes and rising motes follow this
// library's rune circle (arcane/rune-circle.js), whose glow and specks follow Sprite Fusion's open-source mana heal
// (https://www.spritefusion.com/pixel-art-vfx/heal), MIT License, Copyright (c) 2026 Hugo Duprez.
import { PAL, fit, cycle, smooth, ease, sparkle, TAU, WHITE, hex } from "../../core/index.js";
import { floorRing, glyph, mote } from "./_lib.js";

// turning an eighth a loop keeps the octagon, its 8 pillars and the 16 runes seamless
const D = 4, R = 50, RR = 33, RI = 21, SY = 0.3, NR = 16, LIP = 5;

export const meta = {
  name: "Teleport array",
  desc: "A teleport array in the floor: an octagonal stone dais with gold trim, a turning ring of runes, eight lit studs, a column of light and motes rising.",
  tags: ["arcane", "teleport", "array", "portal", "xianxia", "ground", "loop"],
  size: [136, 124],
  origin: [68, 100],
  duration: D,
  loop: true,
  fps: 24,
  bg: "ground",
  options: { palette: PAL.ice, seed: 3 },
};

const STONE = ["#1a1c2a", "#2a2e42", "#3c425c", "#555d7c", "#7480a0"].map(hex);
const GOLD = ["#5a3608", "#a8701a", "#e8b438", "#ffe48a"].map(hex);
const at = (g, r) => [Math.cos(g) * r, Math.sin(g) * r * SY];
const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// the octagon's edge at angle g: its radius there (flat sides, corners at the eighths)
const octR = (g, r) => (r * Math.cos(Math.PI / 8)) / Math.cos(((((g % (TAU / 8)) + TAU / 8) % (TAU / 8)) - Math.PI / 8));

/** The dais: its top in perspective (lit from the top left), a gold trim round it, and its front face below. */
function dais(p) {
  for (let y = -Math.ceil(R * SY) - 1; y <= Math.ceil(R * SY) + 1; y++)
    for (let x = -R - 1; x <= R + 1; x++) {
      const g = Math.atan2(y / SY, x), d = Math.hypot(x, y / SY), e = octR(g, R);
      if (d > e) continue;
      // the trim: gold on the edge, the far side darker; the slab inside: stone, brighter to the top left, its joints
      if (d > e - 2.2) p.px(x, y, Math.sin(g) < 0 ? GOLD[1] : d > e - 1.1 ? GOLD[2] : GOLD[3]);
      else {
        const lit = -x * 0.012 - y * 0.03 + 0.5, joint = Math.abs(((g + TAU) % (TAU / 8)) - TAU / 16) < 0.02 && d > RI + 2;
        p.px(x, y, joint ? STONE[0] : STONE[lit > 0.62 ? 3 : lit > 0.38 ? 2 : 1]);
      }
    }
  // the front face: the octagon's near edge dropped LIP px, each facet its own shade, a dark line at the floor
  for (let x = -R; x <= R; x++) {
    const g = Math.acos(Math.max(-1, Math.min(1, x / R))), y0 = Math.sin(g) * octR(g, R) * SY;
    const facet = Math.floor(((g + TAU / 16) / TAU) * 8);
    for (let k = 1; k <= LIP; k++) p.px(x, y0 + k, k === LIP ? STONE[0] : k === 1 ? GOLD[1] : STONE[facet % 2 ? 1 : 2]);
  }
}

function rings(p, C, t, far) {
  const ph = t / D, spin = (ph * TAU) / 8, keep = far ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0;
  const chase = ph * TAU * 2, lit = (g, w) => gap(g, chase) < w || gap(g, chase + Math.PI) < w;
  const tone = (g, hi, lo) => (Math.sin(g) < 0 ? lo : hi);
  floorRing(p, 0, 0, RR + 6, SY, (g) => (lit(g, 0.2) ? WHITE : lit(g, 0.45) ? C[6] : tone(g, C[5], C[4])), 1, keep);
  floorRing(p, 0, 0, RI, SY, (g) => tone(g, C[6], C[5]), 1, keep);
  floorRing(p, 0, 0, 9, SY, (g) => tone(g, WHITE, C[6]), 1, keep);
  // eight studs at the octagon's corners, lighting as the chase passes
  for (let j = 0; j < 8; j++) {
    const g = (j * TAU) / 8 + TAU / 16;
    if (Math.sin(g) < 0 !== far) continue;
    const [x, y] = at(g, R - 5), hot = lit(g, 0.35);
    p.px(x, y, hot ? WHITE : C[5]);
    p.px(x - 1, y, hot ? C[6] : C[4]);
    p.px(x + 1, y, hot ? C[6] : C[4]);
    p.px(x, y - 1, hot ? C[6] : C[4]);
    p.glow(x, y, hot ? 9 : 5, C[5], hot ? 0.5 : 0.18);
  }
  // the runes ride round the band, flat to the viewer, bright in front
  const gs = [...Array(NR).keys()].map((k) => [k, spin + ((k + 0.5) * TAU) / NR]).filter(([, g]) => Math.sin(g) < 0 === far);
  gs.sort((a, b) => Math.sin(a[1]) - Math.sin(b[1]));
  for (const [k, g] of gs) {
    const [x, y] = at(g, RR), hot = lit(g, 0.18);
    glyph(p, [1, 4, 2, 6][k % 4], x, y - 1, hot ? WHITE : far ? C[4] : C[6], 1, hot ? C[5] : far ? C[2] : C[3]);
    p.glow(x, y - 2, hot ? 9 : 5, C[5], hot ? 0.45 : far ? 0.1 : 0.2);
  }
}

// motes rising up the column on a slow helix; twinkles hanging in it
function motes(p, C, t, S, far) {
  cycle(t, D, 60, S * 7 + 1, (g) => g.range(1.3, 2.2), (age, life, r) => {
    const g0 = r.range(0, TAU), r0 = r.range(6, RR), q = age / life, g = g0 + q * r.range(0.8, 1.6);
    if (Math.sin(g) < 0 !== far) return;
    const rr = r0 * (1 - 0.4 * q), h = 2 + ease.outQuad(q) * r.range(40, 78), x = Math.cos(g) * rr, y = Math.sin(g) * rr * SY - h;
    const a = Math.min(1, q * 5) * (1 - smooth(0.6, 1, q)), big = r.chance(0.2);
    mote(p, x, y, -Math.sin(g) * rr * 0.6, -44 * (1 - q) - 12, r.chance(0.35) ? WHITE : r.chance(0.6) ? C[6] : C[5], big ? 1.1 : r.range(0.55, 0.9), a, big ? 0.5 : 0.3);
  });
  cycle(t, D, 10, S * 7 + 2, 0.5, (age, life, r) => {
    const g = r.range(0, TAU);
    if (Math.sin(g) < 0 !== far) return;
    const rr = r.range(4, RI), x = Math.cos(g) * rr, y = Math.sin(g) * rr * SY - r.range(10, 60), k = Math.sin((age / life) * Math.PI);
    sparkle(p, x, y, 1 + 2.2 * k, C[6], C[5], 0.35 * k);
  });
}

export function drawBack(p, t, o) {
  const C = fit(o.palette, 8), pulse = 0.85 + 0.15 * Math.sin((t / D) * TAU * 4);
  dais(p);
  p.glow(0, 0, R * 1.3, C[4], 0.22 * pulse);
  // the column of light standing over the array, fading as it rises
  for (let h = 0; h < 90; h += 6) p.glow(0, -h, 22, C[4], 0.12 * pulse * (1 - h / 100));
  rings(p, C, t, true);
  motes(p, C, t, o.seed, true);
}

export function draw(p, t, o) {
  const C = fit(o.palette, 8), chase = (t / D) * TAU * 2;
  rings(p, C, t, false);
  motes(p, C, t, o.seed, false);
  for (const g of [chase, chase + Math.PI]) {
    const [x, y] = at(g, RR + 6);
    sparkle(p, x, y, 2.4 + Math.sin(t * 30) * 0.8, C[6], C[5], 0.5);
    p.glow(x, y, 12, C[5], 0.35);
  }
}
