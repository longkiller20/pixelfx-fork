// Rigs for characters that come as finished sprites instead of the stock skeleton. Files starting with _ are helpers,
// not effects.
//   Rig      cut-out parts: polygons cut from the sprite, each turning about its own pivot (an arm about its shoulder), the
//            rest of the body warped by a field (hair in the wind). Drawn by inverse mapping, so a turn leaves no holes.
//   Serpent  a long body bent along its spine: every pixel knows where it sits on the spine (s, 0 at the head) and which
//            way is sideways there, and moves with a wave travelling down it.

import { hex } from "../../core/index.js";

/** A sprite spec ({ w, h, ox, oy, pal, rows }) as colors: { w, h, ox, oy, px: Uint32Array }. */
export function decode(spec) {
  const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-/:;<=>?@[]^_{|}~";
  const pal = spec.pal.map(hex), px = new Uint32Array(spec.w * spec.h);
  spec.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== ".") px[y * spec.w + x] = pal[KEYS.indexOf(row[x])];
  });
  return { w: spec.w, h: spec.h, ox: spec.ox, oy: spec.oy, px };
}

const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

export class Rig {
  /** parts: [{ name, poly: [[x, y]...], pivot: [x, y] }] in sprite pixels, front to back after the body; the first poly a pixel is in wins. */
  constructor(sprite, parts = []) {
    this.s = sprite;
    this.parts = parts;
    this.owner = new Int8Array(sprite.w * sprite.h).fill(-1);
    for (let y = 0; y < sprite.h; y++)
      for (let x = 0; x < sprite.w; x++) {
        if (!sprite.px[y * sprite.w + x]) continue;
        const k = parts.findIndex((p) => inside(p.poly, x + 0.5, y + 0.5));
        this.owner[y * sprite.w + x] = k;
      }
  }
  /**
   * Paint it with its feet at (x, y). pose: { [part]: angle (radians, + turns clockwise on screen) }, dx, dy for the whole body.
   * warp(sx, sy) -> [wx, wy] bends the body (not the parts); color(c, sx, sy, lx, ly) recolors or hides (0) a pixel, given its
   * place in the sprite and where it lands in local space.
   */
  draw(p, x, y, pose = {}, { warp, color } = {}) {
    const S = this.s, X = x - S.ox + (pose.dx ?? 0), Y = y - S.oy + (pose.dy ?? 0);
    const put = (c, sx, sy, dx, dy) => {
      const lx = X + dx, ly = Y + dy, v = color ? color(c, sx, sy, lx, ly) : c;
      if (v) p.px(lx, ly, v);
    };
    // the body: warped by inverse lookup, a few px of slack round the edge
    const pad = warp ? 4 : 0;
    for (let dy = -pad; dy < S.h + pad; dy++)
      for (let dx = -pad; dx < S.w + pad; dx++) {
        let sx = dx, sy = dy;
        if (warp) {
          const [wx, wy] = warp(dx, dy);
          sx = Math.round(dx - wx);
          sy = Math.round(dy - wy);
        }
        if (sx < 0 || sy < 0 || sx >= S.w || sy >= S.h) continue;
        const i = sy * S.w + sx;
        if (this.owner[i] === -1 && S.px[i]) put(S.px[i], sx, sy, dx, dy);
      }
    // the parts, each turned about its pivot
    this.parts.forEach((part, k) => {
      const a = pose[part.name] ?? 0, cs = Math.cos(a), sn = Math.sin(a), [px0, py0] = part.pivot;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [qx, qy] of part.poly) {
        const rx = px0 + (qx - px0) * cs - (qy - py0) * sn, ry = py0 + (qx - px0) * sn + (qy - py0) * cs;
        x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
      }
      for (let dy = Math.floor(y0) - 1; dy <= Math.ceil(y1) + 1; dy++)
        for (let dx = Math.floor(x0) - 1; dx <= Math.ceil(x1) + 1; dx++) {
          const ux = dx + 0.5 - px0, uy = dy + 0.5 - py0;
          const sx = Math.floor(px0 + ux * cs + uy * sn), sy = Math.floor(py0 - ux * sn + uy * cs);
          if (sx < 0 || sy < 0 || sx >= S.w || sy >= S.h) continue;
          const i = sy * S.w + sx;
          if (this.owner[i] === k) put(S.px[i], sx, sy, dx, dy);
        }
    });
  }
  /** Where a point of a part ends up for a pose, in local space with the feet at (x, y). */
  where(name, sx, sy, x, y, pose = {}) {
    const part = this.parts.find((q) => q.name === name), a = pose[name] ?? 0, [px0, py0] = part.pivot;
    const rx = px0 + (sx - px0) * Math.cos(a) - (sy - py0) * Math.sin(a), ry = py0 + (sx - px0) * Math.sin(a) + (sy - py0) * Math.cos(a);
    return [x - this.s.ox + (pose.dx ?? 0) + rx, y - this.s.oy + (pose.dy ?? 0) + ry];
  }
}

export class Serpent {
  /** spine: [[x, y]...] head to tail in sprite pixels. head: how much of s (0..1) moves as one rigid head. */
  constructor(sprite, spine, head = 0.12) {
    this.s = sprite;
    this.head = head;
    const L = [0];
    for (let i = 1; i < spine.length; i++) L.push(L[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
    const total = L[L.length - 1];
    this.cells = [];
    for (let y = 0; y < sprite.h; y++)
      for (let x = 0; x < sprite.w; x++) {
        const c = sprite.px[y * sprite.w + x];
        if (!c) continue;
        let best = Infinity, s = 0, nx = 0, ny = 0;
        for (let i = 1; i < spine.length; i++) {
          const [ax, ay] = spine[i - 1], [bx, by] = spine[i], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
          const u = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)), qx = ax + vx * u, qy = ay + vy * u;
          const d = (x - qx) ** 2 + (y - qy) ** 2;
          if (d < best) {
            best = d;
            s = (L[i - 1] + Math.sqrt(l2) * u) / total;
            const l = Math.sqrt(l2);
            nx = -vy / l;
            ny = vx / l;
          }
        }
        this.cells.push({ x, y, c, s, nx, ny });
      }
    this.buf = new Uint32Array((sprite.w + 24) * (sprite.h + 24));
    this.src = new Float32Array((sprite.w + 24) * (sprite.h + 24));
  }
  /**
   * Paint it with its top left at (x, y). bend(s) -> sideways px at s (the head moves as one, with bend(head)); shift(s) -> [dx, dy]
   * added on top; color(c, s, lx, ly) recolors or hides (0) a pixel.
   */
  draw(p, x, y, { bend, shift, color } = {}) {
    const S = this.s, P = 12, W = S.w + 2 * P, H = S.h + 2 * P, buf = this.buf, src = this.src;
    buf.fill(0);
    for (const q of this.cells) {
      const s = Math.max(q.s, this.head), b = bend ? bend(s) : 0, [ex, ey] = shift ? shift(q.s) : [0, 0];
      const nx = q.s < this.head ? 0 : q.nx, ny = q.s < this.head ? 1 : q.ny;
      const dx = Math.round(q.x + nx * b + ex) + P, dy = Math.round(q.y + ny * b + ey) + P;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      buf[dy * W + dx] = q.c;
      src[dy * W + dx] = q.s;
    }
    // a bend can open single-pixel cracks: close them from a neighbour
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        if (buf[k]) continue;
        if (buf[k - 1] && buf[k + 1] && Math.abs(src[k - 1] - src[k + 1]) < 0.05) (buf[k] = buf[k - 1]), (src[k] = src[k - 1]);
        else if (buf[k - W] && buf[k + W] && Math.abs(src[k - W] - src[k + W]) < 0.05) (buf[k] = buf[k - W]), (src[k] = src[k - W]);
      }
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (!buf[k]) continue;
        const lx = x + i - P, ly = y + j - P, v = color ? color(buf[k], src[k], lx, ly) : buf[k];
        if (v) p.px(lx, ly, v);
      }
  }
}
