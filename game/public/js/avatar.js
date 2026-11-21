// The players' look: the old game's chibi figure (shared/thoi-trang.js), 45 x 48 pixels, drawn twice the size. It is a
// stack of whole pictures, back to front: wings, halo, trousers, shirt, face, eyes, hair, glasses, mask, hat, the thing in
// hand, the pet; each one public/thoi-trang/<kind>/<idx>.png, or the figure's own (public/thoi-trang/goc/) where nothing
// is bought. The flying sword (public/phi-kiem/) lies under the feet when flying.
// The rig is the old game's, brought to life: its two frames (the second either the item's own load/<idx>.png, or the
// picture a pixel lower for what moves with the chest), alternating as it breathes, faster as it walks; on top of that
// a walk that bounces and steps the legs apart, a blink now and then, a lean forward and the thing in hand thrust out when
// it strikes, the legs tucked in the air. The pictures face right; the painter mirrors them to face left.
import { WHITE, mix, hex } from "/hieu-ung/core/index.js";
import { KINDS, KIND } from "/shared/thoi-trang.js";

export const GENDERS = ["m", "f"];
// drawn at S times; the feet's middle (x) and the line they stand on (y) in the 45 x 48 grid; where the legs start
const S = 2, FX = 23, FY = 40, LEGS = 35, GH = 48;
const GOC = "/thoi-trang/goc";

let meta = null, ready = null;
const pics = new Map(); // url -> picture | promise | null (missing)

/** Load the list of pictures and the figure's own once; resolves when characters can be drawn (items follow when worn). */
export function loadAvatars() {
  ready ??= (async () => {
    meta = await fetch("/assets.json").then((r) => r.json());
    await Promise.all(["ao", "quan", "khuonmat", "mat", "mat-load", "toc-m", "toc-f"].map((n) => load(`${GOC}/${n}.png`)));
  })();
  return ready;
}
export const avatarsReady = () => !!meta;

/** A picture's opaque pixels [x, y, color] (colors as the painter wants them), its size and its first and last rows. */
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
  let top = img.height, bottom = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const v = px[y * img.width + x];
      if (v >>> 24 > 100) {
        pts.push([x, y, (v | 0xff000000) >>> 0]);
        top = Math.min(top, y);
        bottom = y;
      }
    }
  return { w: img.width, h: img.height, pts, top, bottom, px };
}
function load(url) {
  const have = pics.get(url);
  if (have !== undefined) return have?.then ? have : Promise.resolve(have);
  const pr = read(url).then((v) => (pics.set(url, v), v), () => (pics.set(url, null), null));
  pics.set(url, pr);
  return pr;
}
/** A picture if it is here; otherwise null, and it is fetched (the character shows it a moment later). */
function pic(url) {
  const have = pics.get(url);
  if (have === undefined) load(url);
  return have && !have.then ? have : null;
}

/**
 * The layers a look wears, back to front: [kind, picture url, second-frame url (or null: the same a pixel lower, or not
 * moving, as the kind says)]. look: { g, <kind>: idx (0: the figure's own / nothing) }.
 */
function layers(look) {
  const out = [];
  for (const K of KINDS) {
    const i = look?.[K.key] | 0, have = meta?.fashion?.[K.key]?.[i];
    if (i > 0 && have) out.push([K, `/thoi-trang/${K.key}/${i}.png`, have === 2 ? `/thoi-trang/${K.key}/load/${i}.png` : null]);
    else if (K.base) out.push([K, K.key === "toc" ? `${GOC}/toc-${look?.g === "f" ? "f" : "m"}.png` : `${GOC}/${K.key}.png`, null]);
  }
  return out;
}

const SLOW = hex("#a060ff");
const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

/**
 * The pose from the character's state. st: { t, moving, air, fly, meditating, cast: { type, age } | null, busy }.
 * frame: the old game's second frame; up: the whole body raised; lean: the upper body forward; hand: the thing in hand
 * further out; legs: the legs stepped apart (one each way); tuck: the legs drawn up; blink: the eyes shut.
 */
export function poseOf(st) {
  const t = st.t ?? 0, P = { frame: 0, up: 0, lean: 0, hand: 0, legs: 0, tuck: 0, blink: false };
  if (st.air && !st.fly) {
    P.tuck = 1;
    P.up = 1;
  } else if (st.moving) {
    // a step every 0.14 s: the second frame, the body bouncing up, the legs apart
    P.frame = Math.floor(t / 0.14) & 1;
    P.up = P.frame;
    P.legs = P.frame;
    P.lean = 1;
  } else P.frame = Math.floor(t / (st.meditating ? 0.8 : 0.45)) & 1;
  // a blink every few seconds (each character on its own beat: t carries their id)
  P.blink = t % 3.3 < 0.13;
  const c = st.cast;
  if (st.busy) P.lean = 1;
  if (c && c.age < 0.5) {
    // into the strike and back: the upper body leans in, the thing in hand goes further
    const u = c.age / 0.5, k = u < 0.25 ? ease(u / 0.25) : 1 - ease((u - 0.25) / 0.75);
    P.lean = Math.round(2 * k);
    P.hand = Math.round(3 * k);
  }
  return P;
}

/**
 * Draw a character with its feet at the painter's origin (place it first; it mirrors for facing left). look: as above,
 * with sword (the flying sword's idx); st: the state poseOf reads, plus fly, flash and slow.
 */
export function drawAvatar(p, look, st) {
  if (!meta) return false;
  const P = poseOf(st);
  const tint = (c) => (st.flash ? WHITE : st.slow ? mix(c, SLOW, 0.35) : c);
  if (st.fly && look.sword !== undefined && look.sword !== null) drawFlySword(p, look.sword, 0, 1, tint);
  for (const [K, a, b] of layers(look)) {
    const second = P.frame === 1;
    let url = second && b ? b : a;
    // the eyes shut for a blink
    if (K.key === "mat" && P.blink) url = `${GOC}/mat-load.png`;
    const L = pic(url);
    if (!L) continue;
    // the second frame: the item's own picture where it has one (a hat's still a pixel lower), else the same a pixel
    // lower for what moves with the chest
    const dy0 = second ? (b ? (K.key === "non" ? 1 : 0) : K.bob) : 0;
    const upper = K.key !== "quan" && K.key !== "haoquang" && K.key !== "thucung";
    const dx0 = (upper ? P.lean : 0) + (K.key === "docamtay" ? P.hand : 0) - (K.back ?? 0);
    const y0 = GH - L.h - (K.lift ?? 0) - P.up;
    for (const [x, y, c] of L.pts) {
      let gx = x + dx0, gy = y0 + y + dy0;
      // the legs: stepped apart when walking, drawn up in the air
      if (K.key === "quan" && y + (GH - L.h) >= LEGS) {
        if (P.legs) gx += x < FX ? -1 : 1;
        if (P.tuck) gy -= 1;
      }
      const X = (gx - FX) * S, Y = (gy - FY) * S, col = tint(c);
      p.px(X, Y, col);
      p.px(X + 1, Y, col);
      p.px(X, Y + 1, col);
      p.px(X + 1, Y + 1, col);
    }
  }
  return true;
}

// ---- the flying sword: public/phi-kiem/<idx>-<name>/hinh.png (+ thong-tin.json: by, the row the feet stand on)
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

/** How tall a dressed character stands above its feet (world px), for name tags: the highest of what it wears. */
export function avatarTop(look) {
  if (!meta) return 70;
  let top = FY - 7;
  for (const [K, a] of layers(look)) {
    if (K.key === "thucung" || K.key === "haoquang") continue;
    const L = pic(a);
    if (L) top = Math.min(top, GH - L.h + L.top);
  }
  return (FY - top) * S + 2;
}

/**
 * One item to show in a picker (a canvas, filled as soon as the pictures are here): worn by the plain figure, so a shirt
 * looks like a shirt; a pet, a halo, wings on their own. A flying sword is itself. Shown at 1:1 (css scales it up).
 */
export function partCanvas(kind, g, i) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  c.className = "fpart";
  (async () => {
    await loadAvatars();
    let L;
    if (kind === "sword") {
      const e = meta.parts?.sword_a?.[i];
      if (!e) return;
      const s = await load(`/${e.dir}/hinh.png`);
      if (!s) return;
      return paint(c, [[s, 0, 0]], s.w, s.h);
    }
    // on their own: what isn't worn on the body; the head's things on the head only (cut at the neck), so they show big
    const alone = kind === "thucung" || kind === "haoquang" || kind === "canh" || kind === "docamtay";
    const head = ["toc", "non", "kinh", "matna", "mat", "khuonmat"].includes(kind);
    const look = { g, [kind]: i };
    const ls = alone ? [[KIND[kind], `/thoi-trang/${kind}/${i}.png`]] : layers(look);
    const got = (await Promise.all(ls.map(([, a]) => load(a)))).filter(Boolean);
    if (!got.length) return;
    L = got.map((s) => [s, 0, GH - s.h]);
    paint(c, L, 50, GH, head ? NECK : GH);
  })();
  return c;
}
// the row under the chin: a picture of a hat or a hair style is cut there
const NECK = 27;
/** Paint pictures [pic, x, y] on a canvas cut to what they cover above row `below` (and a pixel round). */
function paint(c, list, W, H, below = H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  list = list.map(([s, ox, oy]) => [{ pts: s.pts.filter(([, y]) => y + oy < below) }, ox, oy]);
  for (const [s, ox, oy] of list)
    for (const [x, y] of s.pts) {
      x0 = Math.min(x0, x + ox);
      y0 = Math.min(y0, y + oy);
      x1 = Math.max(x1, x + ox);
      y1 = Math.max(y1, y + oy);
    }
  if (x1 < 0) return;
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (const [s, ox, oy] of list) for (const [x, y, col] of s.pts) d[(y + oy - y0 + 1) * w + (x + ox - x0 + 1)] = col;
  c.getContext("2d").putImageData(img, 0, 0);
}
