// The players' look: one base figure dressed in a hair style and a robe chosen when the character is made (40 of each,
// for men and for women). The parts come from atlases in /avatar/ that tools/avatar/build.py cut from the artist's sheets
// and fitted to the base; here they are split into a rig and moved:
//   back hair → robe (torso, two sleeves, skirt, two boots) → head → front hair → face
// Every part is a list of pixels in the base figure's own grid (29 x 63, feet at the bottom middle), so a pose is just
// offsets: the upper body breathes and bobs, the sleeves turn about the shoulders, the skirt and the hair sway, the boots
// step. Nothing here is a canned frame: it all follows the character's state.
import { WHITE, mix, hex } from "/pixelfx/core/index.js";

export const GENDERS = ["m", "f"];
export const N_HAIR = 40, N_ROBE = 40;
const BW = 29, BH = 63, OX = 15; // the base grid, and the x of the line between the feet
// where the body is cut: shoulders (sleeve pivots), the waist, the boots
const SH_F = [22, 27], SH_B = [8, 27], ARM_Y0 = 24, ARM_Y1 = 46, SKIRT_Y = 44, FEET_Y = 57, BACK_HAIR_Y = 22;
// parts: 0 torso, 1 front sleeve, 2 back sleeve, 3 skirt, 4 front boot, 5 back boot
const TORSO = 0, ARM_F = 1, ARM_B = 2, SKIRT = 3, FOOT_F = 4, FOOT_B = 5;

let meta = null, sheets = null, ready = null;
const cache = new Map();

/** Load the atlases once; resolves when characters can be drawn. */
export function loadAvatars() {
  ready ??= (async () => {
    const m = await (await fetch("/avatar/avatar.json")).json();
    const names = ["base", "hair_m", "hair_f", "robe_m", "robe_f"];
    const imgs = await Promise.all(names.map((n) => pixels(`/avatar/${n}.png`)));
    sheets = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
    meta = m;
  })();
  return ready;
}
export const avatarsReady = () => !!meta;

async function pixels(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  // RGBA bytes read as little-endian words are exactly the painter's ABGR colors
  return { w: img.width, h: img.height, px: new Uint32Array(g.getImageData(0, 0, img.width, img.height).data.buffer) };
}

/** Cut a w x h block at (sx, sy) of a sheet into [x, y, color] with x, y in the base grid, shifted by (dx, dy). */
function cut(sheet, sx, sy, w, h, dx, dy) {
  const out = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = sheet.px[(sy + y) * sheet.w + sx + x];
      if (c >>> 24 > 128) out.push([x + dx, y + dy, (c | 0xff000000) >>> 0]);
    }
  return out;
}
const shade = (c, k) => ((255 << 24) | ((((c >>> 16) & 255) * k) << 16) | ((((c >>> 8) & 255) * k) << 8) | ((c & 255) * k)) >>> 0;

function rigFor(g, hair, robe) {
  const key = `${g}${hair}.${robe}`;
  let r = cache.get(key);
  if (r) return r;
  const base = cut(sheets.base, 0, 0, BW, BH, 0, 0);
  const [hx, hy, hw, hh, hdx, hdy] = meta[`hair_${g}`][hair];
  const [rx, ry, rw, rh, rdx, rdy] = meta[`robe_${g}`][robe];
  const hairPx = cut(sheets[`hair_${g}`], hx, hy, hw, hh, hdx, hdy);
  const robePx = cut(sheets[`robe_${g}`], rx, ry, rw, rh, rdx, rdy);
  r = {
    // the long ends behind the shoulders hang behind the robe; the rest sits on the head
    hairBack: hairPx.filter(([x, y]) => y >= BACK_HAIR_Y && x < 14),
    hairFront: hairPx.filter(([x, y]) => !(y >= BACK_HAIR_Y && x < 14)),
    head: base.filter(([, y]) => y <= 22),
    // the eyes, nose and mouth stay in front of any fringe
    face: base.filter(([x, y]) => y >= 12 && y <= 21 && x >= 12),
    robe: robePx.map(([x, y, c]) => {
      let part = TORSO;
      if (y >= FEET_Y) part = x < OX ? FOOT_B : FOOT_F;
      else if (y >= ARM_Y0 && y <= ARM_Y1 && x >= 21) part = ARM_F;
      else if (y >= ARM_Y0 && y <= ARM_Y1 && x <= 9) part = ARM_B;
      else if (y >= SKIRT_Y) part = SKIRT;
      return [x, y, c, part];
    }),
  };
  // the sleeves as lookup grids, for drawing them turned
  for (const [name, part, piv] of [["armF", ARM_F, SH_F], ["armB", ARM_B, SH_B]]) {
    const px = r.robe.filter((p) => p[3] === part);
    const m = new Map(px.map(([x, y, c]) => [y * 256 + x, c]));
    let R = 0;
    for (const [x, y] of px) R = Math.max(R, Math.hypot(x - piv[0], y - piv[1]));
    r[name] = { m, piv, R: Math.ceil(R) + 1 };
  }
  cache.set(key, r);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return r;
}

const SLOW = hex("#a060ff");
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Work out the pose from the character's state. st: { t, moving, air, cast: { type, age } | null, busy, meditating }.
 * Arm angles are radians, positive turning the hand back and down (screen space, facing right).
 */
export function poseOf(st) {
  const t = st.t, P = { bob: 0, lean: 0, armF: 0, armB: 0, skirt: 0.5, skirtW: 2.2, flare: 0, wind: 0, lift: 0, hairAmp: 0.8, hairW: 2.4, footF: [0, 0], footB: [0, 0] };
  if (st.air) {
    P.armF = -0.55;
    P.armB = 0.45;
    P.flare = 1.6;
    P.lift = 2;
    P.wind = 0.6;
    P.footF = [1, -1];
    P.footB = [-1, -2];
  } else if (st.moving) {
    // a step every 0.19 s: boots swap, the body rises on each, sleeves and skirt swing against the legs
    const ph = t * 16.5, s = Math.sin(ph);
    P.footF = [Math.round(s * 2), -Math.max(0, Math.round(Math.cos(ph) * 1.4))];
    P.footB = [-Math.round(s * 2), -Math.max(0, Math.round(-Math.cos(ph) * 1.4))];
    P.bob = Math.abs(Math.cos(ph)) > 0.6 ? -1 : 0;
    P.armF = -s * 0.32;
    P.armB = s * 0.32;
    P.lean = 1;
    P.skirt = 1.3;
    P.skirtW = 16.5;
    P.wind = 1.4;
    P.hairAmp = 1;
    P.hairW = 7;
  } else {
    // breathing
    P.bob = Math.sin(t * 2.4) > 0.3 ? 1 : 0;
    P.armF = 0.04 * Math.sin(t * 2.4);
    P.armB = -0.04 * Math.sin(t * 2.4);
  }
  if (st.meditating) P.armF = P.armB = 0;
  const c = st.cast;
  if (st.busy) P.armF = -1.5;
  else if (c && c.age < 0.5) {
    const u = c.age / 0.5;
    if (c.type === "melee") {
      // raise the sword arm high in front, cut down through the target, let it fall back
      P.armF = u < 0.2 ? -2.6 * (u / 0.2) : u < 0.45 ? -2.6 + 2.1 * ((u - 0.2) / 0.25) : -0.5 * (1 - (u - 0.45) / 0.55);
      P.lean = u > 0.2 && u < 0.7 ? 2 : 1;
    } else {
      // a palm thrust straight ahead, held, then lowered
      P.armF = -1.45 * (u < 0.15 ? u / 0.15 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      P.armB = 0.35 * (1 - u);
      P.lean = u < 0.3 ? -1 : 1;
    }
    P.wind += 0.6;
  }
  return P;
}

/**
 * Draw a character with its feet at the painter's origin (place it first; it mirrors for facing left). look: { g, hair,
 * robe }; st: the state poseOf reads, plus flash and slow for tints.
 */
export function drawAvatar(p, look, st) {
  if (!meta) return false;
  const g = GENDERS.includes(look.g) ? look.g : "m";
  const r = rigFor(g, clampI(look.hair, N_HAIR), clampI(look.robe, N_ROBE));
  const P = poseOf(st), t = st.t;
  const tint = (c) => (st.flash ? WHITE : st.slow ? mix(c, SLOW, 0.35) : c);
  const X = (x) => x - OX, Y = (y) => y - BH;
  // the upper body: breathing, bobbing and leaning (more the higher up)
  const upX = (y) => Math.round(P.lean * clamp01((48 - y) / 40));
  const upY = (y) => (y < FEET_Y - 1 ? P.bob : 0);
  const hairOff = (x, y) => {
    const w = clamp01((y - 8) / 30);
    return [
      Math.round(w * (P.hairAmp * Math.sin(t * P.hairW - y * 0.22) - P.wind * 2.2 * w)) + upX(y),
      -Math.round(w * P.lift) + upY(y),
    ];
  };
  for (const [x, y, c] of r.hairBack) {
    const [dx, dy] = hairOff(x, y);
    p.px(X(x + dx), Y(y + dy), tint(shade(c, 0.85)));
  }
  // robe: torso and skirt first, then the boots, then the sleeves turned about the shoulders
  for (const [x, y, c, part] of r.robe) {
    if (part === ARM_F || part === ARM_B) {
      // under the sleeve: the robe's own shadow, seen when the sleeve swings away
      p.px(X(x + upX(y)), Y(y + upY(y)), tint(shade(c, 0.55)));
      continue;
    }
    let dx = upX(y), dy = upY(y);
    if (part === SKIRT) {
      const k = clamp01((y - SKIRT_Y) / 14);
      dx = Math.round(k * (P.skirt * Math.sin(t * P.skirtW - y * 0.35) + P.flare * Math.sign(x - OX))) + Math.round(P.lean * 0.3);
      dy = 0;
    } else if (part === FOOT_F) [dx, dy] = P.footF;
    else if (part === FOOT_B) [dx, dy] = P.footB;
    p.px(X(x + dx), Y(y + dy), tint(c));
  }
  drawArm(p, r.armB, P.armB, upX(30), P.bob, tint, X, Y);
  for (const [x, y, c] of r.head) p.px(X(x + upX(y)), Y(y + upY(y)), tint(c));
  for (const [x, y, c] of r.hairFront) {
    const [dx, dy] = hairOff(x, y);
    p.px(X(x + dx), Y(y + dy), tint(c));
  }
  for (const [x, y, c] of r.face) p.px(X(x + upX(y)), Y(y + upY(y)), tint(c));
  drawArm(p, r.armF, P.armF, upX(30), P.bob, tint, X, Y);
  return true;
}

// a sleeve turned by a about its shoulder: every target pixel looks up where it came from, so no holes open up
function drawArm(p, arm, a, ox, oy, tint, X, Y) {
  const [px0, py0] = arm.piv, R = arm.R, cs = Math.cos(a), sn = Math.sin(a);
  if (Math.abs(a) < 0.03) {
    for (const [k, c] of arm.m) p.px(X((k & 255) + ox), Y((k >> 8) + oy), tint(c));
    return;
  }
  for (let ty = -R; ty <= R; ty++)
    for (let tx = -R; tx <= R; tx++) {
      // rotate back by -a
      const sx = Math.round(px0 + tx * cs + ty * sn), sy = Math.round(py0 - tx * sn + ty * cs);
      const c = arm.m.get(sy * 256 + sx);
      if (c) p.px(X(px0 + tx + ox), Y(py0 + ty + oy), tint(c));
    }
}

const clampI = (v, n) => Math.max(0, Math.min(n - 1, v | 0));

/** Draw one atlas part on its own (for the pickers): returns a canvas of that part at 1:1. */
export function partCanvas(kind, g, i) {
  if (!meta) return null;
  const key = `${kind}_${g}`, [x, y, w, h] = meta[key][i], s = sheets[key];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const img = new ImageData(new Uint8ClampedArray(w * h * 4), w, h), out = new Uint32Array(img.data.buffer);
  for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) out[j * w + k] = s.px[(y + j) * s.w + x + k];
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}

/** How tall a dressed character stands, for name tags: the base plus whatever the hair adds on top. */
export function avatarTop(look) {
  if (!meta) return 70;
  const g = GENDERS.includes(look.g) ? look.g : "m", h = meta[`hair_${g}`][clampI(look.hair, N_HAIR)];
  return BH - Math.min(0, h[5]);
}
