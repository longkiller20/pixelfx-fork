import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Lake props",
  desc: "A fishing lake's pieces, standing on y = 0 (the floor or the waterline): dock stilt, reeds, lily pads with pink or jade lotus, a moored boat, a buoy, a spirit spring's mist.",
  tags: ["fishing", "lake", "dock", "lotus", "boat", "reeds", "prop", "loop"],
  size: [96, 96],
  origin: [48, 80],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { piece: "lily", lotus: 0 },
};

const H = (a) => a.map(hex);
const WOOD = H(["#1e1008", "#3e2414", "#6a4224", "#946238", "#b88a5a"]);
const LEAF = H(["#0a2414", "#164a26", "#24703a", "#3e9a4e", "#7ac86a"]);
const REED = H(["#2a2a10", "#4a5020", "#6e7a34", "#98a050", "#c8c880"]);
const PINK = H(["#5a1430", "#a8385e", "#e8789a", "#ffb0c8", "#ffe8f0"]);
const JADE = H(["#0a2a1e", "#1a6a4e", "#3ab88a", "#8af0c8", "#e0fff4"]);
const RED = H(["#4a0a10", "#8a1a24", "#d83a3a", "#ff7a6a", "#ffd0c0"]);
const WH = H(["#5a6070", "#a8b0c0", "#e8ecf4", "#ffffff", "#ffffff"]);
const STRAW = H(["#4a3410", "#8a6a20", "#c0a040", "#e8d070", "#fff0b0"]);
const K = hex("#140c18");
const G = new Grid(-48, -80, 96, 96);
const out = (g) => g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? K : mix(K, hex("#3a2a4a"), 0.45)));

const PIECES = {
  // a dock post from the waterline (y = 0, a little under it) up to the planks 62 px above
  stilt(g) {
    g.shade(-2, -62, 2, 6, (x, y) => (x < -1 ? WOOD[3] : x > 1 ? WOOD[1] : Math.floor(y / 5) % 3 === 0 ? WOOD[1] : WOOD[2]));
    // a cross brace and the green line where the water wets it
    g.line(-2, -40, -9, -56, WOOD[2]);
    g.shade(-2, -3, 2, 0, () => LEAF[1]);
  },
  // reeds and cattails on the shore, swaying
  reeds(g, t, D) {
    for (let k = 0; k < 9; k++) {
      const x0 = -14 + k * 3.4, h = 26 + ((k * 7) % 5) * 5, sw = Math.sin((t / D) * TAU + k * 0.7) * 2.2;
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push([x0 + sw * (i / 8) ** 2, -(i / 8) * h]);
      g.tube(pts, 0.6, (u) => (u > 0.8 ? REED[4] : k % 2 ? REED[2] : REED[3]));
      if (k % 3 === 1) g.tube([[x0 + sw * 0.8, -h + 2], [x0 + sw * 0.85, -h - 6]], 1.4, WOOD[2]);
    }
  },
  // lily pads on the water, and a lotus (1 pink, 2 jade: the spirit spring's)
  lily(g, t, D, o) {
    for (const [x, r] of [[-12, 7], [4, 9], [16, 5]]) {
      g.shade(x - r, -2, x + r, 1.5, (px, py) => {
        const nx = (px - x) / r, ny = (py + 0.2) / 2;
        if (nx * nx + ny * ny > 1 || (Math.abs(nx - 0.5) < 0.12 && py < 0)) return 0;
        return py < -1 ? LEAF[4] : nx > 0.5 ? LEAF[2] : LEAF[3];
      });
    }
    if (o.lotus) {
      const C = o.lotus === 2 ? JADE : PINK, by = -3 + Math.sin((t / D) * TAU) * 0.6;
      for (let k = -2; k <= 2; k++) {
        const a = k * 0.45 - Math.PI / 2;
        g.poly([[4, by], [4 + Math.cos(a - 0.25) * 6, by + Math.sin(a - 0.25) * 8], [4 + Math.cos(a) * 8, by + Math.sin(a) * 10], [4 + Math.cos(a + 0.25) * 6, by + Math.sin(a + 0.25) * 8]], (x, y) => (y < by - 7 ? C[4] : y < by - 4 ? C[3] : C[2]));
      }
      g.ellipse(4, by - 2, 2, 1.4, STRAW[3]);
    }
  },
  // a small boat moored by the dock, rocking on the water
  boat(g, t, D) {
    const a = Math.sin((t / D) * TAU) * 1.2;
    g.poly([[-30, -10 + a], [30, -10 - a], [24, 4 - a * 0.5], [-24, 4 + a * 0.5]], (x, y) => (y < -8 ? WOOD[4] : y > 1 ? WOOD[0] : Math.floor(y) % 4 === 0 ? WOOD[1] : WOOD[2]));
    g.poly([[-30, -10 + a], [-36, -16 + a], [-27, -11 + a]], WOOD[3]);
    g.poly([[30, -10 - a], [36, -16 - a], [27, -11 - a]], WOOD[3]);
    // a woven bamboo awning
    g.shade(-12, -30, 12, -10, (x, y) => {
      const r = Math.hypot(x / 12, (y + 10) / 20);
      if (r > 1) return 0;
      if (r < 0.62) return WOOD[0];
      return Math.floor(x * 0.8 + y * 0.3) % 3 === 0 ? STRAW[1] : y < -24 ? STRAW[4] : x > 4 ? STRAW[2] : STRAW[3];
    });
    g.line(-34, -16, -40, -2, hex("#c8b890"));
  },
  // a red and white buoy bobbing
  buoy(g, t, D) {
    const b = Math.sin((t / D) * TAU * 1.5) * 1.5;
    g.ellipse(0, -4 + b, 5, 5, (nx, ny) => lit(Math.floor((ny + 1) * 2.5) % 2 ? WH : RED, nx, ny, 2));
    g.line(0, -9 + b, 0, -14 + b, WOOD[2]);
  },
  // the spirit spring's mist: drawn by draw() itself (nothing solid)
  spirit() {},
};

export function draw(p, t, o) {
  const D = meta.duration, g = G.clear(), piece = PIECES[o.piece] ? o.piece : "lily";
  PIECES[piece](g, t, D, o);
  if (piece !== "spirit") out(g), g.draw(p, 1, 0, 0);
  if (piece === "lily" && o.lotus === 2) p.glow(4, -6, 14, hex("#7af0d8"), 0.2 + 0.08 * Math.sin((t / D) * TAU));
  if (piece === "spirit") {
    // wisps of mist and motes of qi rising off the water and fading
    for (let k = 0; k < 14; k++) {
      const v = ((t / D) + k / 14) % 1, x = Math.sin(k * 2.7) * 40 + Math.sin(v * TAU + k) * 4, y = -v * 60;
      p.dot(x, y, hex(k % 3 ? "#9af0e0" : "#ffffff"), Math.sin(v * Math.PI) * 0.9);
      if (k % 4 === 0) p.glow(x, y, 6, hex("#7af0d8"), Math.sin(v * Math.PI) * 0.18);
    }
    p.glowLine(-40, -2, 40, -2, 8, hex("#7af0d8"), 0.12);
  }
}
