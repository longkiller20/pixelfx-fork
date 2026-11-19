// Công pháp in the browser: an icon for every art, and the words for its element and type. Each art's icon is its own
// picture, public/cong-phap/<n>-<name>/icon.png (drawn ahead from its pixelfx effect by tools/arts/icons.mjs, or by an
// artist), so they all show at once; an art with no folder (one added since) has its icon drawn here, a few at a time.
import { createFrame, createFx, composite, stockActor } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { ARTS } from "/shared/balance.js";
import { ELEMENTS } from "/shared/cong-phap.js";

export const elementName = (e) => ELEMENTS[e]?.name ?? e;
// arts that have no effect of their own keep the pack's icons
export const FIXED = { phikiem: "/xianxia/ui/skill_s2.png", loian: "/xianxia/ui/skill_s3.png" };

// effects that dress a character (frost, poison, auras) are given an invisible one, so pixelfx's stand-in never shows
const stock = stockActor(2);
export const BLANK_ACTOR = { ...stock, pixels: new Uint32Array(stock.pixels.length) };

/**
 * How much bigger to draw an art's effect. pixelfx draws for its 38 px stand-in, our characters are 63 px: effects on or
 * by the body (shields, auras, slashes, whole moves) grow by 63/38 so they wrap the character; scenery-sized ones (a
 * meteor, a storm) a bit less, so they don't fill the screen; projectiles less again. An admin's fx_scale wins.
 */
export function artScale(a) {
  if (a.scale > 0) return a.scale;
  if (a.at === "bolt") return 1.3;
  const meta = effects[a.fx]?.meta;
  if (a.at === "self" || a.at === "front" || meta?.actor) return 1.65;
  return Math.max(...(meta?.size ?? [0])) > 260 ? 1.2 : 1.4;
}

/** One line about what an art does (each art's own words, shared/cong-phap.js) and how long it takes to come back. */
export function artLine(a) {
  return `${a.line} · hồi ${String(a.cd).replace(".", ",")}s`;
}

const cache = new Map(); // art key -> data URL
const waiting = new Map(); // art key -> [callbacks]
const queue = [];

// every art's own icon, drawn ahead into public/cong-phap/<n>-<name>/icon.png (tools/arts/icons.mjs): key -> folder
let folders = null;
const foldersReady = fetch("/assets.json")
  .then((r) => r.json())
  .then((a) => (folders = a.arts ?? {}))
  .catch(() => (folders = {}));

/** The art's icon as a URL; cb(url) is called when it is ready (at once if it already is). */
export function artIcon(key, cb) {
  if (folders?.[key]) return cb(`/${folders[key]}/icon.png`);
  if (!folders) return void foldersReady.then(() => artIcon(key, cb));
  if (FIXED[key]) return cb(FIXED[key]);
  // no folder for it (an art added since): drawn here; the latest asked first, so the cards on screen fill first
  const fx = ARTS[key]?.icon ?? "";
  if (cache.has(fx)) return cb(cache.get(fx));
  if (waiting.has(fx)) return waiting.get(fx).push(cb);
  waiting.set(fx, [cb]);
  queue.unshift(fx);
  if (queue.length === 1) setTimeout(work, 0);
}

function done(fx, url) {
  cache.set(fx, url);
  for (const cb of waiting.get(fx) ?? []) cb(url);
  waiting.delete(fx);
}

function work() {
  const until = performance.now() + 12;
  while (queue.length && performance.now() < until) {
    const fx = queue.shift();
    let url = "";
    try {
      url = renderIcon(fx)?.toDataURL() ?? "";
    } catch {}
    done(fx, url);
  }
  // a timeout too: while the game draws every frame, the browser may never be idle, and the icons would never come
  if (queue.length) window.requestIdleCallback ? requestIdleCallback(work, { timeout: 100 }) : setTimeout(work, 16);
}

/**
 * An effect's icon on a 64 px canvas, or null when it draws nothing: the effect played to its fullest moment (the one
 * with the most lit pixels of a few tries), cropped and fitted. Used by tools/arts/icons.mjs to make the cong-phap folders too.
 */
export function renderIcon(id) {
  const mod = effects[id];
  if (!mod) return null;
  const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin ?? [w / 2, h / 2], D = mod.meta.duration ?? 1;
  const frame = createFrame(w, h);
  const fx = createFx(mod, { seed: 7, x: ox, y: oy, actor: BLANK_ACTOR });
  // a pixel counts when it is solid colour or bright light (glows, flames and beams are mostly light)
  const lit = (C, L, i) => C[i] >>> 24 > 140 || Math.max(L[i] & 255, (L[i] >>> 8) & 255, (L[i] >>> 16) & 255) > 70;
  let best = null, bestN = -1, t = 0;
  for (const at of [0.2, 0.35, 0.5, 0.7, 0.9].map((k) => Math.min(D * k, 4))) {
    fx.update(at - t);
    t = at;
    frame.color.fill(0);
    frame.light.fill(0);
    fx.draw(frame, "back");
    fx.draw(frame, "front");
    let n = 0;
    for (let i = 0; i < frame.color.length; i++) if (lit(frame.color, frame.light, i)) n++;
    if (n > bestN) (bestN = n), (best = { color: frame.color.slice(), light: frame.light.slice() });
  }
  // the box round what was drawn, leaving out the few farthest sparks (2% each side), which would shrink the rest
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lit(best.color, best.light, y * w + x)) xs.push(x), ys.push(y);
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const cut = xs.length > 60 ? Math.floor(xs.length * 0.02) : 0;
  const x0 = xs[cut], x1 = xs[xs.length - 1 - cut], y0 = ys[cut], y1 = ys[ys.length - 1 - cut];
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const img = src.getContext("2d").createImageData(w, h);
  // a faint wash of light or colour over the whole effect (a flash, a haze) would show as a box round the icon: dropped
  for (let i = 0; i < best.color.length; i++) {
    const L = best.light[i];
    if (Math.max(L & 255, (L >>> 8) & 255, (L >>> 16) & 255) < 40) best.light[i] = 0;
    if (best.color[i] >>> 24 < 60) best.color[i] = 0;
  }
  frame.color.set(best.color);
  frame.light.set(best.light);
  composite(frame, img.data, null);
  src.getContext("2d").putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = out.height = 64;
  const c = out.getContext("2d"), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // a long thin thing (an arrow, a beam) is laid along the diagonal, so it fills the icon instead of a thin line across it
  const long = Math.max(bw, bh) / Math.min(bw, bh) > 3.5;
  const fit = long ? 80 : 58, k = Math.min(fit / Math.max(bw, bh), long ? 99 : 58 / Math.min(bw, bh), 6);
  c.imageSmoothingEnabled = k < 1;
  c.translate(32, 32);
  if (long) c.rotate(bw > bh ? -Math.PI / 4 : Math.PI / 4);
  c.drawImage(src, x0, y0, bw, bh, (-bw * k) / 2, (-bh * k) / 2, bw * k, bh * k);
  return out;
}
