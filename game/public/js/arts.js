// Công pháp in the browser: an icon for every art, drawn from the art's own pixelfx effect, and the words for its
// element and type. Icons are made a few at a time in idle moments and kept, so opening the list of 200+ arts never stalls.
import { createFrame, createFx, composite, stockActor } from "/pixelfx/core/index.js";
import { effects } from "/pixelfx/fx/index.js";
import { ARTS } from "/shared/balance.js";
import { ELEMENTS } from "/shared/arts-seed.js";

export const TYPE_NAME = { melee: "Cận chiến", bolt: "Phóng xa", zone: "Vùng", nova: "Quanh thân", dash: "Lướt", heal: "Hồi phục", buff: "Tăng lực" };
export const STAT_NAME = { atk: "Công", def: "Thủ", spd: "Tốc độ" };
export const elementName = (e) => ELEMENTS[e]?.name ?? e;
// arts that have no effect of their own keep the pack's icons
const FIXED = { phikiem: "/xianxia/ui/skill_s2.png", loian: "/xianxia/ui/skill_s3.png" };

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

/** One line about what an art does, from its numbers. */
export function artLine(a) {
  const parts = [TYPE_NAME[a.type] ?? a.type, `hồi ${a.cd}s`];
  if (a.mult) parts.push(`${Math.round(a.mult * 100)}% công`);
  if (a.type === "heal") parts.push(`hồi ${Math.round(a.pct * 100)}% sinh lực`);
  if (a.type === "buff") parts.push(`+${a.pct}% ${STAT_NAME[a.stat] ?? a.stat} trong ${a.dur}s`);
  if (a.slow) parts.push(`làm chậm ${a.slowDur}s`);
  return parts.join(" · ");
}

const cache = new Map(); // art key -> data URL
const waiting = new Map(); // art key -> [callbacks]
const queue = [];

/** The art's icon as a URL; cb(url) is called when it is ready (at once if it already is). */
export function artIcon(key, cb) {
  if (FIXED[key]) return cb(FIXED[key]);
  if (cache.has(key)) return cb(cache.get(key));
  if (waiting.has(key)) return waiting.get(key).push(cb);
  waiting.set(key, [cb]);
  queue.push(key);
  if (queue.length === 1) setTimeout(work, 0);
}

function work() {
  const until = performance.now() + 12;
  while (queue.length && performance.now() < until) {
    const key = queue.shift();
    let url = "";
    try {
      url = render(ARTS[key]?.fx);
    } catch {}
    cache.set(key, url);
    for (const cb of waiting.get(key) ?? []) cb(url);
    waiting.delete(key);
  }
  if (queue.length) (window.requestIdleCallback ?? setTimeout)(work);
}

// play the effect to its fullest moment (the one with the most lit pixels of a few tries), crop it, fit it in 64 px
function render(id) {
  const mod = effects[id];
  if (!mod) return "";
  const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin ?? [w / 2, h / 2], D = mod.meta.duration ?? 1;
  const frame = createFrame(w, h);
  const fx = createFx(mod, { seed: 7, x: ox, y: oy, actor: BLANK_ACTOR });
  let best = null, bestN = -1, t = 0;
  for (const at of [0.35, 0.5, 0.7].map((k) => Math.min(D * k, 4))) {
    fx.update(at - t);
    t = at;
    frame.color.fill(0);
    frame.light.fill(0);
    fx.draw(frame, "back");
    fx.draw(frame, "front");
    let n = 0;
    for (let i = 0; i < frame.color.length; i++) if (frame.color[i] >>> 24 > 140) n++;
    if (n > bestN) (bestN = n), (best = frame.color.slice());
  }
  // the bounding box of what was drawn
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (best[y * w + x] >>> 24 > 140) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return "";
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const img = src.getContext("2d").createImageData(w, h);
  frame.color.set(best);
  frame.light.fill(0);
  composite(frame, img.data, null);
  src.getContext("2d").putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = out.height = 64;
  const c = out.getContext("2d"), bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(58 / bw, 58 / bh, 6);
  c.imageSmoothingEnabled = k < 1;
  c.drawImage(src, x0, y0, bw, bh, (64 - bw * k) / 2, (64 - bh * k) / 2, bw * k, bh * k);
  return out.toDataURL();
}
