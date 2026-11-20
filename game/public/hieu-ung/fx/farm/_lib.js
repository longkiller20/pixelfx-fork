// The farm's kit: animals and plants for a homestead, side view, facing right, standing on y = 0. Every animal loops
// one way or the other: idle (pecking, grazing, sniffing, a blink, a tail) or walking (o.walk: legs stepping, the body
// bobbing), so a game can switch between them while it moves the animal itself. Plants take o.stage 0..3 (just sown,
// young, grown, ripe for picking) and sway; ripe ones glint. Built with the critters' Grid: shaded parts, then a 1 px
// outline picked per side.
import { hex, mix, TAU } from "../../core/index.js";
export { Grid, shift, curve, shadow } from "../critters/_lib.js";

/** A color lit from the top left: (nx, ny) a normal in -1..1; C a ramp dark..bright of at least 4. */
export function lit(C, nx, ny, base = 2) {
  const k = -nx * 0.55 - ny * 0.85;
  const i = Math.max(0, Math.min(C.length - 1, base + (k > 0.55 ? 2 : k > 0.15 ? 1 : k < -0.55 ? -2 : k < -0.2 ? -1 : 0)));
  return C[i];
}

/** The outline: darkest on the shadowed side (bottom right), a touch lighter where the light falls. */
export const rim = (dark, mid) => (x, y, nx, ny) => (nx < 0 || ny < 0 ? dark : mix(dark, mid, 0.35));

/** A walking step at loop phase u (0..1): leg swing -1..1 for the near and far legs, and the body's bob (0..1). */
export function gait(u, n = 2) {
  const a = u * TAU * n;
  return { near: Math.sin(a), far: Math.sin(a + Math.PI), bob: Math.abs(Math.cos(a)) };
}

/** A few ramps the farm shares. */
export const RAMP = {
  hen: ["#3a2a2a", "#8a7468", "#c9b8a8", "#efe6da", "#ffffff"],
  comb: ["#6a1420", "#b8283a", "#ef4a50", "#ff8a7a"],
  beak: ["#6a3a08", "#c8841a", "#f0b830", "#ffe27a"],
  pig: ["#4a2028", "#a85a68", "#e08c98", "#f6b6bc", "#ffe0e0"],
  cow: ["#1a1418", "#3a3034", "#cfc6bc", "#efe8de", "#ffffff"],
  duck: ["#2e3438", "#8a96a0", "#d8dee2", "#f4f8fa", "#ffffff"],
  leaf: ["#0e2a14", "#1c5024", "#2f7a32", "#52a83e", "#8ed05a", "#d4f590"],
  soil: ["#1e130c", "#3a2414", "#5a3a20", "#7a5230", "#9c7044"],
  wood: ["#24140a", "#4a2c14", "#7a4a22", "#a8703a", "#d29a5a"],
};
export const H = (a) => a.map(hex);

/** How far a point at height h (0 at the soil, 1 at the top) leans with the breeze at loop time t (px). */
export const sway = (t, D, h, amp = 1.2, phase = 0) => Math.sin((t / D) * TAU + phase) * amp * h * h;

/**
 * A ripe plant's glint: a small four-point star that blooms and fades at (x, y), once per loop at its own time,
 * plus a soft light; c the star's color.
 */
export function glint(p, t, D, x, y, at, c, k = 0.5) {
  const a = (((t - at) % D) + D) % D, L = 0.5;
  if (a > L) return;
  const s = Math.sin((a / L) * Math.PI), r = Math.round(1 + s * 2);
  for (let i = -r; i <= r; i++) (p.dot(x + i, y, c, s), p.dot(x, y + i, c, s));
  p.glow(x, y, 4 + s * 4, c, k * s);
}
