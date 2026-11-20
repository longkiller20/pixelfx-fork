import { hex, TAU } from "../../core/index.js";
import { draw as drawFish } from "./fish.js";

export const meta = {
  name: "Fish landed",
  desc: "A catch flies out of the water: a splash and spray, the fish flopping up an arc towards the angler, a burst of light in its rarity's colour at the top, then gone into the bag.",
  tags: ["fishing", "catch", "splash", "reward", "one-shot"],
  size: [200, 160],
  origin: [100, 136],
  duration: 1.6,
  loop: false,
  fps: 24,
  bg: "dark",
  options: { look: "chep", dir: -1, color: "#6aa8ff", water: "#9ad8ff", seed: 1 },
};

const ease = (u) => 1 - (1 - u) * (1 - u);

export function draw(p, t, o) {
  const D = meta.duration, u = Math.min(1, t / D), dir = o.dir < 0 ? -1 : 1, W = hex(o.water ?? "#9ad8ff"), C = hex(o.color ?? "#6aa8ff");
  // the splash where it broke the surface: a ring opening, spray thrown up and falling back
  if (u < 0.6) {
    const v = u / 0.6;
    for (let k = -1; k <= 1; k += 2)
      for (let i = 0; i < 14; i++) {
        const r = 4 + v * 28 + i * 0.6;
        p.dot(k * r, Math.sin(i) * 1.2, W, (1 - v) * 0.8);
      }
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 15 - 0.5) * 2.2, sp = 50 + (i % 4) * 22, tt = v * 0.9;
      const x = Math.cos(a) * sp * tt, y = Math.sin(a) * sp * tt + 160 * tt * tt;
      if (y < 4) p.dot(x, y, W, 1 - v);
    }
    p.glow(0, -2, 18, W, 0.3 * (1 - v));
  }
  // the fish: an arc up and over towards the angler, turning along it, flopping
  const a = ease(Math.min(1, u / 0.85)), x = dir * a * 70, y = -Math.sin(a * Math.PI * 0.85) * 92 - a * 10;
  const tx = p.tx, ty = p.ty, fx = p.fx;
  if (u < 0.92) {
    const ang = -dir * (0.9 - a * 1.6);
    p.place(tx + x * fx, ty + y, dir < 0, ang);
    drawFish(p, t, { look: o.look, flop: 1, outline: "#140c18" });
    p.place(tx, ty, fx < 0);
  }
  // at the top, a burst of its colour; at the end, a twinkle where it went into the bag
  const top = Math.abs(u - 0.42);
  if (top < 0.2) {
    const k = 1 - top / 0.2;
    p.glow(x, y, 30 * k + 8, C, 0.35 * k);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + u * 3, r = 14 + (1 - k) * 26;
      p.dot(x + Math.cos(ang) * r, y + Math.sin(ang) * r, C, k);
    }
  }
  if (u > 0.85) {
    const k = 1 - (u - 0.85) / 0.15, ex = dir * 70, ey = -Math.sin(0.85 * Math.PI) * 92 - 10;
    for (let i = -3; i <= 3; i++) (p.dot(ex + i, ey, hex("#ffffff"), k), p.dot(ex, ey + i, hex("#ffffff"), k));
    p.glow(ex, ey, 10, C, 0.4 * k);
  }
}
