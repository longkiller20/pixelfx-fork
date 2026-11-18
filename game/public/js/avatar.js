// The players' look: one base figure dressed in a hair style and a robe chosen when the character is made (40 of each,
// for men and for women). The parts come from atlases in /avatar/ that tools/avatar/build.py cut from the artist's sheets
// and fitted to the base; here they are split into a rig and moved:
//   back hair → robe (torso, the front sleeve, skirt, two boots) → head → front hair → face
// Every part is a list of pixels in the base figure's own grid (29 x 63, feet at the bottom middle), so a pose is just
// offsets: the upper body breathes and bobs, the front sleeve turns about its shoulder when casting, the skirt and the hair sway, the boots
// step. Nothing here is a canned frame: it all follows the character's state.
import { WHITE, mix, hex } from "/pixelfx/core/index.js";

export const GENDERS = ["m", "f"];
export const N_HAIR = 40, N_ROBE = 40;
const BW = 29, BH = 63, OX = 15; // the base grid, and the x of the line between the feet
// where the body is cut: shoulders (sleeve pivots), the waist, the boots
// the front hand, from the shoulder with the arm hanging; and how a weapon sits in it at rest: pointing forward and down
const HAND = [2, 15], WEAPON_REST = 0.38, WEAPON_REST_LONG = -1.3;
const SH_F = [22, 27], ARM_Y0 = 24, ARM_Y1 = 43, SKIRT_Y = 44, FEET_Y = 57, BACK_HAIR_Y = 22;
// parts: 0 torso, 1 front sleeve, 3 skirt (the back sleeve stays with the torso: on most robes it is the cape or the back hem), 4 front boot, 5 back boot
const TORSO = 0, ARM_F = 1, SKIRT = 3, FOOT_F = 4, FOOT_B = 5;

let meta = null, sheets = null, ready = null;
const cache = new Map();

/** Load the atlases once; resolves when characters can be drawn. */
export function loadAvatars() {
  ready ??= (async () => {
    const [m, wm, sm] = await Promise.all(["/avatar/avatar.json", "/xianxia/weapons.json", "/xianxia/swords.json"].map((u) => fetch(u).then((r) => r.json())));
    const names = ["base", "hair_m", "hair_f", "robe_m", "robe_f"];
    const imgs = await Promise.all([...names.map((n) => pixels(`/avatar/${n}.png`)), pixels("/xianxia/weapons.png"), pixels("/xianxia/swords.png")]);
    sheets = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
    // weapons (Xianxia Pixel Pack): for everyone, drawn pointing right with the hand's grip at (gx, gy)
    sheets.weapon_a = imgs[names.length];
    // [x, y, w, h, grip x, grip y, held upright at rest]: long arms are, and so is anything marked long (a bow)
    m.weapon_a = wm.map((w) => [w.x, w.y, w.w, w.h, w.gx, w.gy, w.long ?? w.w > 62]);
    // flying swords (ngự kiếm phi hành; tools/swords/): pointing right, the feet stand on row `by`
    sheets.sword_a = imgs[names.length + 1];
    m.sword_a = sm.map((w) => [w.x, w.y, w.w, w.h, w.by]);
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
      else if (y >= SKIRT_Y) part = SKIRT;
      return [x, y, c, part];
    }),
  };
  r.at = new Map(r.robe.map(([x, y, c]) => [y * 256 + x, c]));
  // the hem's right edge at the waist line, where the robe's body under the sleeve ends
  r.hemR = Math.max(21, ...r.robe.filter(([, y, , part]) => y === SKIRT_Y && part === SKIRT).map(([x]) => x));
  // the torso under the front sleeve, which the artist never drew: rebuilt so a raised arm leaves the robe whole. Row by
  // row, the body's edge runs from the shoulder's width down to the hem's, inside the sleeve's own outline only; it is
  // filled with the cloth just inside it (repeating its last few columns), with a dark outline on the new edge.
  {
    const robeAt = new Map(r.robe.filter((q) => q[3] !== ARM_F).map(([x, y, c]) => [y * 256 + x, c]));
    const arm = new Set(r.robe.filter((q) => q[3] === ARM_F).map(([x, y]) => y * 256 + x));
    const rowMax = (y) => Math.max(-1, ...r.robe.filter((q) => q[1] === y && q[3] !== ARM_F).map((q) => q[0]));
    const top = Math.min(26, Math.max(21, rowMax(ARM_Y0 - 1))), bottom = Math.min(27, r.hemR);
    r.under = [];
    for (let y = ARM_Y0; y <= ARM_Y1; y++) {
      const edge = Math.round(top + ((bottom - top) * (y - ARM_Y0)) / (ARM_Y1 - ARM_Y0));
      let last = 20;
      while (last > 8 && !robeAt.has(y * 256 + last)) last--;
      for (let x = last + 1; x <= edge; x++) {
        if (!arm.has(y * 256 + x)) continue;
        const src = robeAt.get(y * 256 + (last - ((x - last - 1) % 3))) ?? robeAt.get(y * 256 + last);
        if (src) r.under.push([x, y, x === edge ? shade(src, 0.35) : shade(src, 0.9)]);
      }
    }
  }
  // the sleeves as lookup grids, for drawing them turned
  // where this robe's front fist is: its skin-coloured pixels low on the front sleeve (the weapon is held there)
  {
    let sx = 0, sy = 0, n = 0;
    for (const [x, y, c, part] of r.robe) {
      if (part !== ARM_F || y < 33) continue;
      const R = c & 255, G = (c >>> 8) & 255, B = (c >>> 16) & 255;
      if (R > 170 && R - B > 45 && G > 110 && G < R && B < G + 10 && B > 60) (sx += x), (sy += y), n++;
    }
    r.hand = n >= 3 ? [sx / n - SH_F[0], sy / n - SH_F[1]] : HAND;
  }
  for (const [name, part, piv] of [["armF", ARM_F, SH_F]]) {
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
  // every offset here is either a rigid shift of a whole part or a shear that grows steadily along the body, so neighbouring
  // rows never move apart by more than a pixel: the cloth bends but never tears
  const t = st.t, P = { bob: 0, lean: 0, armF: 0, swingF: 0, skirt: 0, sway: 0, wind: 0, lift: 0, footF: [0, 0], footB: [0, 0] };
  if (st.air) {
    P.lift = 2;
    P.wind = 0.5;
    P.skirt = -1;
    P.footF = [1, -1];
    P.footB = [0, -2];
  } else if (st.moving) {
    // a step every 0.19 s: boots swap, the body dips as each lands, sleeves and skirt swing against the legs
    const ph = t * 16.5, s = Math.sin(ph), c = Math.cos(ph);
    P.footF = [Math.round(s), c > 0.3 ? -1 : 0];
    P.footB = [-Math.round(s), c < -0.3 ? -1 : 0];
    P.bob = Math.abs(c) < 0.5 ? 1 : 0;
    P.lean = 1;
    P.skirt = -s * 1.2;
    P.sway = Math.sin(ph * 0.5) * 0.6;
    P.wind = 1.4;
  } else {
    // breathing: the chest settles a pixel, the hair and hem drift
    P.bob = Math.sin(t * 2.4) > 0.3 ? 1 : 0;
    P.sway = Math.sin(t * 1.7) * 0.8;
    P.skirt = Math.sin(t * 1.3) * 0.6;
  }
  const c = st.cast;
  // a long weapon has its own angle (null: upright at rest): turning it with the arm would sweep it across the face
  P.longW = null;
  if (st.busy) P.armF = -1.5;
  else if (c && c.age < 0.5) {
    const u = c.age / 0.5;
    if (c.type === "melee") {
      // raise the sword arm high in front, cut down through the target, let it fall back
      P.armF = u < 0.2 ? -2.6 * (u / 0.2) : u < 0.45 ? -2.6 + 2.1 * ((u - 0.2) / 0.25) : -0.5 * (1 - (u - 0.45) / 0.55);
      P.lean = u > 0.2 && u < 0.7 ? 2 : 1;
      // a polearm: drawn back over the shoulder, then brought down in a chop in front
      P.longW = u < 0.2 ? -1.3 - 0.7 * (u / 0.2) : u < 0.45 ? -2.0 + 2.3 * ((u - 0.2) / 0.25) : 0.3 - 1.6 * ((u - 0.45) / 0.55);
    } else {
      // a palm thrust straight ahead, held, then lowered
      const k = u < 0.15 ? u / 0.15 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      P.armF = -1.45 * k;
      // a polearm: levelled and thrust straight ahead
      P.longW = -1.3 * (1 - k);
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
  const P = poseOf(st);
  const tint = (c) => (st.flash ? WHITE : st.slow ? mix(c, SLOW, 0.35) : c);
  const X = (x) => x - OX, Y = (y) => y - BH;
  // riding a flying sword: it lies under the feet
  const fly = st.fly && look.sword !== undefined && look.sword !== null;
  // one lean for the whole body, strongest at the head, nothing at the feet; the bob moves everything above the boots down
  // (only ever down: overlapping rows hide each other, a gap would show)
  const lean = (y) => Math.round(P.lean * clamp01((FEET_Y - y) / FEET_Y));
  const bob = (y) => (y < FEET_Y ? P.bob : 0);
  // the skirt swings from the waist: 0 at the waist, full at the hem
  const hem = (y) => Math.round(P.skirt * clamp01((y - SKIRT_Y) / (FEET_Y - SKIRT_Y)));
  // hair hangs from the crown and sways as one piece, streaming back in the wind
  const hairDX = (y) => {
    const w = clamp01((y - 8) / 30);
    return Math.round(w * P.sway - w * w * P.wind * 2.2) + lean(y);
  };
  const hairDY = (y) => -Math.round(clamp01((y - 8) / 30) * P.lift) + bob(y);
  // first, so the boots stand on the blade and the body hides the ornament round the guard
  if (fly) drawFlySword(p, look.sword, 0, 1, tint);
  for (const [x, y, c] of r.hairBack) p.px(X(x + hairDX(y)), Y(y + hairDY(y)), tint(shade(c, 0.85)));
  // robe: torso and skirt, then the boots; the sleeves are drawn on their own (nothing left behind where they were)
  for (const [x, y, c, part] of r.robe) {
    if (part === ARM_F) continue;
    let dx = lean(y), dy = bob(y);
    if (part === SKIRT) dx += hem(y);
    else if (part === FOOT_F) [dx, dy] = P.footF;
    else if (part === FOOT_B) [dx, dy] = P.footB;
    p.px(X(x + dx), Y(y + dy), tint(c));
  }
  for (const [x, y, c] of r.under) p.px(X(x + lean(y)), Y(y + bob(y)), tint(c));
  for (const [x, y, c] of r.head) p.px(X(x + lean(y)), Y(y + bob(y)), tint(c));
  for (const [x, y, c] of r.hairFront) p.px(X(x + hairDX(y)), Y(y + hairDY(y)), tint(c));
  for (const [x, y, c] of r.face) p.px(X(x + lean(y)), Y(y + bob(y)), tint(c));
  // the weapon, in the front hand: it turns with the arm about the shoulder, the fist drawn over its grip
  if (look.weapon !== undefined && look.weapon !== null) {
    const a = P.armF, [sx, sy] = SH_F, [hx, hy] = r.hand;
    const handX = sx + hx * Math.cos(a) - hy * Math.sin(a), handY = sy + hx * Math.sin(a) + hy * Math.cos(a);
    // long arms (spears, halberds, staves) stand upright at rest; swords and the like point forward, clear of the ground
    const long = !!meta.weapon_a[look.weapon]?.[6];
    drawWeapon(p, look.weapon, X(Math.round(handX) + lean(sy)) + 0.5, Y(Math.round(handY) + bob(sy)) + 0.5, long ? P.longW ?? WEAPON_REST_LONG : WEAPON_REST + a, tint, true);
  }
  drawArm(p, r.armF, P.armF, P.swingF, lean, bob, tint, X, Y);
  return true;
}

// A sleeve. Small swings (walking) are a shear: the cuff moves, the shoulder stays, every row whole and crisp. Big moves
// (casting, a jump) turn it about the shoulder, every target pixel looking up where it came from so no holes open up.
function drawArm(p, arm, a, swing, lean, bob, tint, X, Y) {
  const [px0, py0] = arm.piv;
  if (Math.abs(a) < 0.05) {
    const len = Math.max(1, arm.R - 1);
    for (const [k, c] of arm.m) {
      const x = k & 255, y = k >> 8;
      p.px(X(x + lean(y) + Math.round(swing * clamp01((y - py0) / len))), Y(y + bob(y)), tint(c));
    }
    return;
  }
  const R = arm.R, cs = Math.cos(a), sn = Math.sin(a), ox = lean(py0), oy = bob(py0);
  for (let ty = -R; ty <= R; ty++)
    for (let tx = -R; tx <= R; tx++) {
      // rotate back by -a
      const sx = Math.round(px0 + tx * cs + ty * sn), sy = Math.round(py0 - tx * sn + ty * cs);
      const c = arm.m.get(sy * 256 + sx);
      if (c) p.px(X(px0 + tx + ox), Y(py0 + ty + oy), tint(c));
    }
}

/**
 * One weapon from the atlas, turned by `angle` (radians, 0 = pointing right, growing clockwise on screen) about its grip,
 * the grip at (x, y) in the painter's space; or about its middle when grip is false (a flying sword).
 */
export function drawWeapon(p, i, x, y, angle, tint = (c) => c, grip = false) {
  const m = meta?.weapon_a?.[i];
  if (!m) return;
  const [wx, wy, w, h, gx, gy] = m, sh = sheets.weapon_a, ax = grip ? gx : w / 2, ay = grip ? gy : h / 2;
  const cs = Math.cos(angle), sn = Math.sin(angle), R = Math.ceil(Math.hypot(Math.max(ax, w - ax), Math.max(ay, h - ay))) + 1;
  const ox = Math.floor(x), oy = Math.floor(y);
  for (let ty = -R; ty <= R; ty++)
    for (let tx = -R; tx <= R; tx++) {
      // where this screen pixel comes from in the unturned weapon
      const u = Math.round(ax + tx * cs + ty * sn), v = Math.round(ay - tx * sn + ty * cs);
      if (u < 0 || v < 0 || u >= w || v >= h) continue;
      const c = sh.px[(wy + v) * sh.w + wx + u];
      if (c >>> 24 > 128) p.px(ox + tx, oy + ty, tint((c | 0xff000000) >>> 0));
    }
}

/**
 * A flying sword lying flat under the feet at (x, y) in the painter's space, pointing the way the painter faces; it rides
 * a little behind the body, the tail (its dragon, its flowers) trailing.
 */
export function drawFlySword(p, i, x, y, tint = (c) => c) {
  const m = meta?.sword_a?.[i] ?? meta?.sword_a?.[0];
  if (!m) return;
  const [sx, sy, w, h, by] = m, sh = sheets.sword_a, ox = Math.round(x - w * 0.55), oy = Math.round(y - by);
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const c = sh.px[(sy + v) * sh.w + sx + u];
      if (c >>> 24 > 128) p.px(ox + u, oy + v, tint((c | 0xff000000) >>> 0));
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
