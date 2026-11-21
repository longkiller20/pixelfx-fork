// A world boss's roar, the blast it throws at everyone (its counter-blow): a dark-red aura swells round it, then three
// rings of fire tear out along the floor one after another, a column of heat rises, and embers and ash are thrown
// wide; it all burns down to a glowing scorch and goes. The floor ring and motes come from the arcane helpers
// (../arcane/_lib.js), whose motes follow Sprite Fusion's open-source mana heal
// (https://www.spritefusion.com/pixel-art-vfx/heal), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, cycle, smooth, ease, sparkle, TAU, WHITE, Rng } from "../../core/index.js";
import { floorRing, mote } from "../arcane/_lib.js";

export const meta = {
  name: "Roar wave",
  desc: "A boss's roar: a dark-red aura swells, three rings of fire tear out along the floor, heat rises, embers and ash fly wide, a scorch fades.",
  tags: ["boss", "roar", "shockwave", "fire", "aoe", "one-shot"],
  size: [420, 220],
  origin: [210, 170],
  duration: 2,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1a0306", "#3e0710", "#7a1014", "#c0281a", "#f0602a", "#ffb04a", "#fff0c0"], seed: 4, reach: 150 },
};

const SY = 0.22;

export function drawBack(p, t, o) {
  const C = fit(o.palette, 7), R = o.reach;
  // the aura gathering (0..0.5), then the scorch cooling
  const gather = smooth(0, 0.45, t) * (1 - smooth(0.5, 0.8, t));
  p.glow(0, -60, 90 * gather + 10, C[2], 0.5 * gather);
  p.glow(0, -40, 50 * gather + 5, C[4], 0.35 * gather);
  const scorch = smooth(0.5, 0.6, t) * (1 - smooth(1.4, 2, t));
  if (scorch > 0) {
    p.glow(0, 0, R * 0.7, C[3], 0.3 * scorch);
    floorRing(p, 0, 0, R * 0.35, SY, C[2], 0.8 * scorch);
  }
}

export function draw(p, t, o) {
  const C = fit(o.palette, 7), R = o.reach, S = o.seed ?? 4;
  // the aura: dark flames licking up round him while he draws breath
  const gather = smooth(0, 0.45, t) * (1 - smooth(0.5, 0.65, t));
  if (gather > 0)
    cycle(t, 0.5, 30, S, 0.35, (age, life, r) => {
      const a = r.range(0, TAU), rr = r.range(30, 70) * (1 - age / life * 0.6), q = age / life;
      mote(p, Math.cos(a) * rr * 0.6, -20 - Math.abs(Math.sin(a)) * 80 - q * 30, -Math.cos(a) * 20, -60, q < 0.5 ? C[4] : C[3], 1, gather * (1 - q), 0.3);
    });
  // three rings of fire racing out along the floor, the first the brightest
  for (let i = 0; i < 3; i++) {
    const t0 = 0.5 + i * 0.12, u = (t - t0) / 0.7;
    if (u <= 0 || u >= 1) continue;
    const r = 8 + ease.outQuart(u) * R * (1 - i * 0.12), k = 1 - smooth(0.55, 1, u);
    floorRing(p, 0, 0, r, SY, u < 0.15 ? WHITE : i === 0 ? C[5] : C[4], k);
    floorRing(p, 0, 0, r - 1, SY, i === 0 ? C[5] : C[4], k);
    floorRing(p, 0, 0, r + 1, SY, C[5], k * 0.9);
    floorRing(p, 0, 0, r - 2.5, SY, C[3], k * 0.8);
    floorRing(p, 0, 0, r - 4, SY, C[2], k * 0.5);
    floorRing(p, 0, 0, r + 2, SY, C[6], k * 0.5);
    p.glow(r * 0.7, 0, 18, C[4], 0.25 * k);
    p.glow(-r * 0.7, 0, 18, C[4], 0.25 * k);
  }
  // the white flash of the roar
  if (t > 0.48 && t < 0.62) {
    const k = 1 - Math.abs(t - 0.53) / 0.09;
    sparkle(p, 0, -70, 26 * k, WHITE, C[5], 0.9 * k);
    p.glow(0, -60, 110, C[5], 0.6 * k);
  }
  // embers and ash thrown wide from the blast, rising and drifting
  const R2 = new Rng(S * 31 + 7);
  for (let i = 0; i < 70; i++) {
    const a = R2.range(-Math.PI, 0), sp = R2.range(50, 160), life = R2.range(0.8, 1.4), t0 = 0.5 + R2.range(0, 0.15), q = (t - t0) / life;
    if (q <= 0 || q >= 1) continue;
    const x = Math.cos(a) * sp * q * 1.2, y = Math.sin(a) * sp * q * 0.55 - 20 * q + 40 * q * q - 10;
    const c = q < 0.3 ? C[6] : q < 0.6 ? C[5] : q < 0.85 ? C[3] : C[1];
    mote(p, x, y, Math.cos(a) * sp * (1 - q), Math.sin(a) * sp * (1 - q), c, R2.chance(0.2) ? 1.2 : 0.7, 1 - smooth(0.7, 1, q), 0.25);
  }
}
