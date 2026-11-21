import { hex, mix, TAU } from "../../core/index.js";

export const meta = {
  name: "Wedding banner frame",
  desc: "A wedding banner frame of any size: a gold rim with round corners, plum silk, pearls, heart medallions at the corners, a heart bow on top; a glint runs round it.",
  tags: ["love", "wedding", "frame", "banner", "ui", "border", "loop"],
  size: [200, 52],
  origin: [0, 0],
  duration: 3,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { w: 200, h: 52, fill: 1 },
};

const H = (a) => a.map(hex);
const GOLD = H(["#3a1a04", "#7a4a0c", "#c8861a", "#f0c040", "#ffe88a", "#fffbe0"]);
const PLUM = H(["#1c0616", "#2a0a20", "#3a0e2c", "#4e1438", "#641c46"]);
const PINK = H(["#5a0a2a", "#a8285a", "#ff5a8a", "#ffa0c0", "#ffe0ec"]);
const K = hex("#12040e"), WHITE = hex("#ffffff");

/** A point at distance s along the rim's middle (a rounded rectangle), for the glint. */
function along(w, h, s, inset) {
  const x0 = inset, y0 = inset, x1 = w - 1 - inset, y1 = h - 1 - inset, W = x1 - x0, Hh = y1 - y0, L = 2 * (W + Hh);
  s = ((s % L) + L) % L;
  if (s < W) return [x0 + s, y0];
  if (s < W + Hh) return [x1, y0 + (s - W)];
  if (s < 2 * W + Hh) return [x1 - (s - W - Hh), y1];
  return [x0, y1 - (s - 2 * W - Hh)];
}
/** A small heart (5 x 5) whose top left is (x, y). */
function heart(p, x, y, C, a = 1) {
  const rows = [".X.X.", "XHXPX", "XPPPX", ".XPX.", "..X.."];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const ch = rows[r][c];
      if (ch !== ".") p.dot(x + c, y + r, ch === "X" ? K : ch === "H" ? C[4] : C[2], a);
    }
}

export function draw(p, t, o) {
  const w = Math.max(40, Math.round(o.w ?? meta.options.w)), h = Math.max(24, Math.round(o.h ?? meta.options.h)), u = t / meta.duration;
  const R = 6; // corner radius
  // how far (x, y) is inside the rounded rectangle's edge (negative: outside)
  const hw = w / 2, hh = h / 2;
  const depth = (x, y) => {
    const qx = Math.abs(x - hw) - (hw - R), qy = Math.abs(y - hh) - (hh - R);
    return R - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = depth(x + 0.5, y + 0.5);
      if (d < 0) continue;
      // lit from the top left: the rim's top and left a step brighter, its bottom and right a step darker
      const lit = (y < h / 2 ? 1 : 0) + (x < w / 2 ? 0 : -0) - (y > h - 4 ? 1 : 0);
      let c;
      if (d < 1) c = K;
      else if (d < 2) c = GOLD[Math.max(1, Math.min(5, 3 + lit))];
      else if (d < 3) c = GOLD[Math.max(1, Math.min(5, 2 + lit))];
      else if (d < 4) c = GOLD[1];
      else if (d < 5) c = K;
      else if (o.fill === 0) continue;
      else {
        // the silk: darker toward the edges and the bottom, in hard steps, a soft sheen across the top third
        const v = y / h, e = Math.min(x, w - 1 - x) / Math.max(1, Math.min(w / 2, 24));
        let i = v < 0.32 ? 4 : v < 0.6 ? 3 : v < 0.85 ? 2 : 1;
        if (e < 0.35) i = Math.max(0, i - 1);
        c = PLUM[i];
        // a faint checker of hearts in the silk, every 12 px, offset row by row
        if (((x + (Math.floor(y / 12) % 2) * 6) % 12 === 6) && y % 12 === 6) c = mix(c, PINK[1], 0.5);
      }
      p.px(x, y, c);
    }
  // pearls along the inner edge of the rim, twinkling one after another
  const step = 7, pearls = [];
  for (let x = 14; x < w - 14; x += step) if (Math.abs(x - w / 2) > 16) pearls.push([x, 6]), pearls.push([x, h - 7]);
  for (let y = 14; y < h - 13; y += step) pearls.push([6, y], [w - 7, y]);
  pearls.forEach(([x, y], i) => {
    const tw = Math.max(0, Math.sin((u * 2 - i / pearls.length * 3) * TAU));
    p.px(x, y, tw > 0.85 ? WHITE : i % 2 ? PINK[3] : GOLD[4]);
  });
  // the corners: a round gold medallion on each, a heart in it
  const medal = (cx, cy) => {
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const r = Math.hypot(x, y);
        if (r > 5.2) continue;
        p.px(cx + x, cy + y, r > 4.3 ? K : r > 3.2 ? GOLD[x + y < 0 ? 4 : 2] : PLUM[0]);
      }
    heart(p, cx - 2, cy - 2, PINK);
  };
  for (const [cx, cy] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]]) medal(cx, cy);
  // the bow on top: two gold ribbon loops, two tails, a big heart in the knot that beats
  const mx = Math.round(w / 2);
  for (const sgn of [-1, 1]) {
    for (let y = -3; y <= 3; y++)
      for (let x = 0; x <= 9; x++) {
        const nx = (x - 5) / 5, ny = y / 3.4;
        const r = nx * nx + ny * ny;
        if (r > 1) continue;
        p.px(mx + sgn * (4 + x), 4 + y, r > 0.62 ? K : r > 0.3 ? GOLD[y < 0 ? 4 : 2] : GOLD[1]);
      }
    for (let i = 0; i < 3; i++) p.px(mx + sgn * (3 + i), 8 + i, i === 2 ? K : GOLD[i % 2 ? 2 : 3]);
  }
  const beat = Math.max(0, Math.sin(u * TAU * 2));
  const big = ["..XX.XX..", ".XHHXPPX.", "XHHPPPPPX", "XHPPPPPPX", ".XPPPPPX.", "..XPPPX..", "...XPX...", "....X...."];
  for (let r = 0; r < big.length; r++)
    for (let c = 0; c < 9; c++) {
      const ch = big[r][c];
      if (ch !== ".") p.px(mx - 4 + c, r, ch === "X" ? K : ch === "H" ? PINK[4] : PINK[2]);
    }
  p.glow(mx, 3, 6 + beat * 4, PINK[2], 0.2 + beat * 0.25);
  // a glint running round the rim, with a short fading tail
  const L = 2 * (w + h - 8);
  for (let k = 0; k < 6; k++) {
    const [gx, gy] = along(w, h, u * L - k * 2, 2);
    p.dot(Math.round(gx), Math.round(gy), k ? GOLD[5] : WHITE, 1 - k / 6);
  }
  const [gx, gy] = along(w, h, u * L, 2);
  p.glow(gx, gy, 5, GOLD[4], 0.35);
}
