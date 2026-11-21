// The players' look: one whole character each (shared/nhan-vat.js), a rigged pixelfx figure from
// /hieu-ung/fx/nhanvat/<key>.js (its pixels, each marked with the part of the body it is), moved by the rig in
// /hieu-ung/fx/nhanvat/_rig.js: it breathes, the long hair and the hem sway and trail, the legs step, the arms swing and
// strike, the eyes blink. Nothing is a canned frame: the pose follows the character's state every frame. The flying sword
// (public/phi-kiem/) lies under the feet when flying. The figures face right; the painter mirrors them to face left.
import { WHITE, mix, hex } from "/hieu-ung/core/index.js";
import { poseOf, drawFigure } from "/hieu-ung/fx/nhanvat/_rig.js";
import { SKIN, SKINS, skinOf } from "/shared/nhan-vat.js";

export const GENDERS = ["m", "f"];

let meta = null, ready = null;
const figures = new Map(); // skin idx -> FIGURE | promise | null (missing)
const pics = new Map(); // url -> picture | promise | null (the flying swords)

/** Load the list of pictures and the characters' figures; resolves when characters can be drawn. */
export function loadAvatars() {
  ready ??= (async () => {
    const [m] = await Promise.all([fetch("/assets.json").then((r) => r.json()), ...SKINS.filter((s) => s.starter).map((s) => loadFigure(s.idx))]);
    meta = m;
  })();
  return ready;
}
export const avatarsReady = () => !!meta;

function loadFigure(i) {
  const have = figures.get(i);
  if (have !== undefined) return have?.then ? have : Promise.resolve(have);
  const s = SKIN[i];
  const pr = s ? import(`/hieu-ung/fx/${s.fx}.js`).then((m) => (figures.set(i, m.FIGURE), m.FIGURE), () => (figures.set(i, null), null)) : Promise.resolve(null);
  figures.set(i, pr);
  return pr;
}
/** A character's figure if it is here; otherwise null, and it is fetched (the character shows a moment later). */
function figure(look) {
  const i = skinOf(look), have = figures.get(i);
  if (have === undefined) loadFigure(i);
  return have && !have.then ? have : null;
}

const SLOW = hex("#a060ff");

/**
 * Draw a character with its feet at the painter's origin (place it first; it mirrors for facing left). look: { g, skin,
 * sword }; st: { t, moving, air, vy, fly, meditating, cast: { age } | null, busy, flash, slow }.
 */
export function drawAvatar(p, look, st) {
  if (!meta) return false;
  const F = figure(look);
  if (!F) return false;
  const tint = st.flash ? () => WHITE : st.slow ? (c) => mix(c, SLOW, 0.35) : undefined;
  if (st.fly && look.sword !== undefined && look.sword !== null) drawFlySword(p, look.sword, 0, 1, tint);
  drawFigure(p, F, poseOf(st), tint);
  return true;
}

// ---- the flying sword: public/phi-kiem/<idx>-<name>/hinh.png (+ thong-tin.json: by, the row the feet stand on)
async function read(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const px = new Uint32Array(g.getImageData(0, 0, img.width, img.height).data.buffer), pts = [];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const v = px[y * img.width + x];
      if (v >>> 24 > 100) pts.push([x, y, (v | 0xff000000) >>> 0]);
    }
  return { w: img.width, h: img.height, pts };
}
function load(url) {
  const have = pics.get(url);
  if (have !== undefined) return have?.then ? have : Promise.resolve(have);
  const pr = read(url).then((v) => (pics.set(url, v), v), () => (pics.set(url, null), null));
  pics.set(url, pr);
  return pr;
}
function pic(url) {
  const have = pics.get(url);
  if (have === undefined) load(url);
  return have && !have.then ? have : null;
}
/** A flying sword lying flat under the feet at (x, y) in the painter's space, pointing the way the painter faces. */
export function drawFlySword(p, i, x, y, tint = (c) => c) {
  const list = meta?.parts?.sword_a;
  if (!list) return;
  const e = list[i] ?? list[Object.keys(list)[0]];
  if (!e) return;
  const S2 = pic(`/${e.dir}/hinh.png`);
  if (!S2) return;
  const by = e.by ?? S2.h >> 1, ox = Math.round(x - S2.w * 0.55), oy = Math.round(y - by);
  for (const [u, v, c] of S2.pts) p.px(ox + u, oy + v, tint(c));
}

/** How tall a character stands above its feet (world px), for name tags. */
export function avatarTop(look) {
  const F = meta && figure(look);
  return F ? -F.top + 2 : 90;
}

/**
 * One thing to show in a picker (a canvas, filled as soon as it is here): a character standing still, or a flying sword.
 * Shown at 1:1 (css scales it up). kind: "skin" or "sword"; g: the gender (a character drawn for it); i: its idx.
 */
export function partCanvas(kind, g, i) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  c.className = "fpart";
  (async () => {
    await loadAvatars();
    const pts = [];
    if (kind === "sword") {
      const e = meta.parts?.sword_a?.[i];
      const s = e && (await load(`/${e.dir}/hinh.png`));
      if (!s) return;
      pts.push(...s.pts);
    } else {
      const F = await loadFigure(skinOf({ g, skin: i }));
      if (!F) return;
      // a still pose with the eyes open; the painter just collects the pixels
      drawFigure({ px: (x, y, col) => pts.push([x, y, col]) }, F, poseOf({ t: 1 }));
    }
    paint(c, pts);
  })();
  return c;
}
/** Paint pixels [x, y, color] on a canvas cut to what they cover (and a pixel round). */
function paint(c, pts) {
  if (!pts.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (const [x, y, col] of pts) d[(y - y0 + 1) * w + (x - x0 + 1)] = col;
  c.getContext("2d").putImageData(img, 0, 0);
}
