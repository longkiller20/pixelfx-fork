// A công pháp's effect, playing over and over on a small canvas, for the admin site: the same pixelfx effect the game
// draws, so an admin can see what an art looks like before turning it on or off. One animation loop runs every preview
// on the page; a preview off screen or taken off the page costs nothing.
import { createFrame, createFx, composite, stockActor } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";

// effects that dress a character get an invisible one, as in the game
const stock = stockActor(2);
const BLANK_ACTOR = { ...stock, pixels: new Uint32Array(stock.pixels.length) };
const LOOP_FOR = 1.6; // a looping effect is told to stop after this long (as in the game), then starts again
const REST = 0.35; // seconds of nothing between two plays

const live = new Set();
const seen = new WeakSet();
const watch = "IntersectionObserver" in window
  ? new IntersectionObserver((list) => {
      for (const e of list) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
    })
  : null;

export const hasFx = (id) => !!effects[id];

/** A canvas playing effect `id` (w × h on the page). An unknown or empty id gives a canvas that says so. */
export function fxPreview(id, { w = 160, h = 120 } = {}) {
  const cv = document.createElement("canvas");
  cv.className = "fxprev";
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  const mod = effects[id];
  if (!mod) {
    c.fillStyle = "#0b0912";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#a69cc4";
    c.font = "12px system-ui";
    c.textAlign = "center";
    c.fillText(id ? `không có hiệu ứng "${id}"` : "không có hiệu ứng riêng", w / 2, h / 2 - 4);
    c.fillText(id ? "" : "(ném vũ khí đang cầm)", w / 2, h / 2 + 12);
    return cv;
  }
  const [fw, fh] = mod.meta.size, [ox, oy] = mod.meta.origin ?? [fw / 2, fh / 2];
  const frame = createFrame(fw, fh), src = document.createElement("canvas");
  src.width = fw;
  src.height = fh;
  const sc = src.getContext("2d"), img = sc.createImageData(fw, fh);
  const p = { cv, c, mod, frame, src, sc, img, ox, oy, box: null, fx: null, t: 0, rest: 0, seed: 1 };
  start(p);
  live.add(p);
  watch?.observe(cv);
  if (!watch) seen.add(cv);
  if (live.size === 1) requestAnimationFrame(tick);
  return cv;
}

/**
 * Where the effect draws: played once ahead (a few frames over its length), the box round every lit pixel, so a small
 * spark in a big frame is shown big. Done the first time the preview is on screen.
 */
function measure(p) {
  const { mod, frame } = p, D = Math.min(mod.meta.loop ? LOOP_FOR : mod.meta.duration ?? 1, 4);
  const fx = createFx(mod, { seed: 7, x: p.ox, y: p.oy, actor: BLANK_ACTOR });
  const lit = (i) => frame.color[i] >>> 24 > 60 || Math.max(frame.light[i] & 255, (frame.light[i] >>> 8) & 255, (frame.light[i] >>> 16) & 255) > 50;
  let x0 = frame.w, y0 = frame.h, x1 = -1, y1 = -1;
  for (let n = 1; n <= 12; n++) {
    fx.update(D / 12);
    frame.color.fill(0);
    frame.light.fill(0);
    fx.draw(frame, "back");
    fx.draw(frame, "front");
    for (let y = 0; y < frame.h; y++)
      for (let x = 0; x < frame.w; x++)
        if (lit(y * frame.w + x)) (x < x0 && (x0 = x)), (x > x1 && (x1 = x)), (y < y0 && (y0 = y)), (y > y1 && (y1 = y));
  }
  if (x1 < 0) return { x: 0, y: 0, w: frame.w, h: frame.h };
  // a margin round it, and never zoomed in past 4×
  const { width: W, height: H } = p.cv, pad = 6;
  let bw = x1 - x0 + 1 + pad * 2, bh = y1 - y0 + 1 + pad * 2;
  const minW = W / 4, minH = H / 4;
  bw = Math.max(bw, minW, (bh * W) / H);
  bh = Math.max(bh, minH, (bw * H) / W);
  return { x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh };
}

function start(p) {
  p.fx = createFx(p.mod, { seed: (p.seed = (p.seed * 7919 + 13) % 1e6), x: p.ox, y: p.oy, actor: BLANK_ACTOR });
  p.t = 0;
}

let last = 0;
function tick(now) {
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
  last = now;
  for (const p of live) {
    if (!p.cv.isConnected) {
      // dropped once it has been off the page a while (the list moved to another page; a card in the modal is still on it)
      if ((p.gone = (p.gone ?? 0) + dt) > 2) live.delete(p), watch?.unobserve(p.cv);
      continue;
    }
    p.gone = 0;
    if (!seen.has(p.cv)) continue;
    if (!p.box) p.box = measure(p);
    step(p, dt);
  }
  if (live.size) requestAnimationFrame(tick);
  else last = 0;
}

function step(p, dt) {
  if (p.rest > 0) {
    p.rest -= dt;
    if (p.rest <= 0) start(p);
    return;
  }
  p.fx.update(dt);
  p.t += dt;
  if (p.mod.meta.loop && p.t > LOOP_FOR) p.fx.stop();
  if (p.fx.done() || p.t > 8) p.rest = REST;
  const { frame, img, c, cv, box } = p;
  frame.color.fill(0);
  frame.light.fill(0);
  p.fx.draw(frame, "back");
  p.fx.draw(frame, "front");
  img.data.fill(0);
  composite(frame, img.data, null);
  p.sc.putImageData(img, 0, 0);
  c.fillStyle = "#0b0912";
  c.fillRect(0, 0, cv.width, cv.height);
  // the drawn box filling the canvas (the frame scaled the same way, so nothing outside the box is cut off oddly)
  const k = Math.min(cv.width / box.w, cv.height / box.h);
  c.imageSmoothingEnabled = k < 1;
  c.drawImage(p.src, (cv.width - box.w * k) / 2 - box.x * k, (cv.height - box.h * k) / 2 - box.y * k, frame.w * k, frame.h * k);
}
