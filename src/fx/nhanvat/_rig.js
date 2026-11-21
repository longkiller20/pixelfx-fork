// The rig every whole character (src/fx/nhanvat/*.js) shares. A character is one picture, its pixels each marked with the
// part of the body it belongs to; a pose moves the parts and the picture comes alive:
//   h  the long hair behind the back: sways from the crown down, trails behind when running or flying
//   r  the far arm: swings against the legs when walking, draws back on a strike
//   L R the legs: step, lift and tuck
//   s  the hem: swings with the walk, flares in the air
//   u  everything else (head, chest, the near hair): breathes, bobs with the steps, leans into a strike
//   a  the near arm: swings, thrusts forward on a strike
// Where an arm moves away, what was under it is filled from the robe beside it, so it never leaves a hole.
// The pictures face right; feet in the middle of the bottom row at (0, 0). Nothing here is a canned frame.
import { hex, TAU } from "../../core/index.js";

const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+-=?@^~";

/** Read a character's data ({ w, h, fx, pal, px, lab, hair, skirt, legs, eyes, skin }) into its parts. */
export function makeFigure(d) {
  const pal = d.pal.map(hex), at = (x, y) => (d.px[y]?.[x] && d.px[y][x] !== "." ? pal[AL.indexOf(d.px[y][x])] : 0);
  const lab = (x, y) => d.lab[y]?.[x] ?? ".";
  const parts = { h: [], r: [], L: [], R: [], s: [], u: [], a: [], under: [] };
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      const c = at(x, y), l = lab(x, y);
      if (!c) continue;
      parts[l].push([x - d.fx, y - d.h, c]);
      // under an arm: the body's own color nearest along the row (the robe the arm hid), a step darker
      if (l === "a" || l === "r")
        for (let k = 1; k <= 6; k++) {
          const xs = l === "a" ? [x - k] : [x - k, x + k], hit = xs.find((xx) => lab(xx, y) === "u" && at(xx, y));
          if (hit !== undefined) {
            parts.under.push([x - d.fx, y - d.h, shade(at(hit, y), 0.86)]);
            break;
          }
        }
    }
  const skin = pal[AL.indexOf(d.skin)];
  // the eyes shut: skin over them, a dark lash along the bottom row
  const lash = pal[0];
  const blink = d.eyes.flatMap(([x0, x1, y0, y1]) => {
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x - d.fx, y - d.h, y === y1 ? lash : skin]);
    return out;
  });
  return { ...parts, blink, width: d.w, height: d.h, hair: d.hair.map((v) => v - d.h), skirt: d.skirt.map((v) => v - d.h), legs: d.legs - d.h, top: topOf(d) - d.h };
}
const topOf = (d) => d.px.findIndex((r) => /[^.]/.test(r));
const shade = (c, k) => ((c & 0xff000000) | ((((c >>> 16) & 255) * k) << 16) | ((((c >>> 8) & 255) * k) << 8) | ((c & 255) * k)) >>> 0;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

/**
 * The pose from what the character is doing. st: { t (seconds; each character its own offset), moving, air, vy, fly,
 * meditating, cast: { age } | null, busy }. Returns how far each part moves, in pixels.
 */
export function poseOf(st) {
  const t = st.t ?? 0;
  const P = { bob: 0, lean: 0, aX: 0, aY: 0, rX: 0, rY: 0, LX: 0, LY: 0, RX: 0, RY: 0, sway: 0, trail: 0, lift: 0, flare: 0, blink: false, t };
  // breathing: the chest rises and falls; the hair and the hem drift
  const br = Math.sin((t / (st.meditating ? 3.2 : 2.4)) * TAU);
  P.bob = br > 0.35 ? 1 : 0;
  P.sway = Math.sin((t / 2.4) * TAU);
  if (st.fly) {
    // riding the sword: still legs, everything streaming back
    P.trail = -3;
    P.flare = -1;
    P.lean = 1;
  } else if (st.air) {
    // the legs drawn up, the hem flared, the hair lifted (up) or streaming (down)
    P.LY = P.RY = -2;
    P.LX = 1;
    P.RX = -1;
    P.flare = 1;
    P.lift = (st.vy ?? 0) > 0 ? -1 : 1;
    P.trail = st.moving ? -2 : 0;
  } else if (st.moving) {
    // a step every 0.32 s: each foot forward and lifted in turn, the body up between, the arms against the legs
    const ph = (t / 0.64) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    P.LX = Math.round(2 * s);
    P.RX = -P.LX;
    P.LY = s > 0.3 ? -Math.round(Math.abs(c) < 0.7 ? 1 : 0) - (c < 0 ? 1 : 0) : 0;
    P.RY = s < -0.3 ? -Math.round(Math.abs(c) < 0.7 ? 1 : 0) - (c > 0 ? 1 : 0) : 0;
    P.bob = Math.abs(s) < 0.5 ? -1 : 0;
    P.aX = Math.round(-1.5 * s);
    P.rX = Math.round(1.5 * s);
    P.lean = 1;
    P.trail = -1.6;
    P.sway = Math.sin(ph * 2) * 0.6;
  }
  // a blink every few seconds
  P.blink = t % 3.7 < 0.12;
  if (st.busy) P.lean = 1;
  const c = st.cast;
  if (c && c.age < 0.5) {
    // the strike: a short draw back, the near arm thrust out and up, the far arm back, the body leaning in
    const u = c.age / 0.5, k = u < 0.2 ? -ease(u / 0.2) * 0.4 : u < 0.35 ? -0.4 + 1.4 * ease((u - 0.2) / 0.15) : 1 - ease((u - 0.35) / 0.65);
    P.aX = Math.round(5 * k);
    P.aY = -Math.round(2 * Math.max(0, k));
    P.rX = -Math.round(2 * Math.max(0, k));
    P.lean = Math.round(2 * k);
    P.trail = Math.min(P.trail, -1.5 * Math.max(0, k));
  }
  return P;
}

/** Draw a character in a pose at the painter's origin (its feet). tint: a function over colors (a hit's white flash, a slow). */
export function drawFigure(p, F, P, tint = (c) => c) {
  const put = (x, y, c) => p.px(x, y, tint(c));
  const [h0, h1] = F.hair, [s0, s1] = F.skirt;
  // the upper body's offsets: the bob for all of it, the lean growing toward the head
  const upY = P.bob + 0, leanAt = (y) => Math.round(P.lean * clamp01((F.legs - y) / (F.legs - F.top)) * 1.2);
  // the hair behind: still at the crown, swaying more toward its ends
  for (const [x, y, c] of F.h) {
    const k = clamp01((y - h0) / (h1 - h0)), wave = Math.sin(P.t * 2.6 - y * 0.14) * 0.8 + P.sway * 0.7;
    put(x + leanAt(y) + Math.round(k * (wave + P.trail)), y + upY + Math.round(k * k * P.lift * 2), c);
  }
  // the far arm, then what the arms hid, the legs, the hem
  for (const [x, y, c] of F.under) put(x + leanAt(y), y + upY, c);
  for (const [x, y, c] of F.r) put(x + leanAt(y) + P.rX, y + upY + P.rY, c);
  for (const [x, y, c] of F.L) put(x + P.LX, y + P.LY, c);
  for (const [x, y, c] of F.R) put(x + P.RX, y + P.RY, c);
  // the waist where it meets the hem, also where it was: the body bobbing up leaves no gap above the hem
  if (upY < 0) for (const [x, y, c] of F.u) if (y >= s0 - 2) put(x + leanAt(y), y, c);
  // the hem hangs from the hips (it doesn't bob): it swings, trails, and flares out on both sides in the air
  for (const [x, y, c] of F.s) {
    const k = clamp01((y - s0) / (s1 - s0 + 1));
    put(x + Math.round(k * (P.sway * 0.9 + P.trail * 0.5 + P.flare * (x < 0 ? -1 : 1))), y, c);
  }
  // the body and head, the eyes shut for a blink, the near arm in front
  for (const [x, y, c] of F.u) put(x + leanAt(y), y + upY, c);
  if (P.blink) for (const [x, y, c] of F.blink) put(x + leanAt(y), y + upY, c);
  for (const [x, y, c] of F.a) put(x + leanAt(y) + P.aX, y + upY + P.aY, c);
}

/** How tall the character stands above its feet (for a name over it). */
export const heightOf = (F) => -F.top;

/** Poses to preview a character with (pixelfx's render tool, the game's Y Các): t in seconds. */
export const ANIMS = {
  idle: (t) => ({ t }),
  walk: (t) => ({ t, moving: true }),
  attack: (t) => ({ t, cast: { age: t % 1.2 } }),
  jump: (t) => ({ t, air: true, vy: (t % 1.2) < 0.6 ? -1 : 1 }),
  fly: (t) => ({ t, fly: true }),
};
