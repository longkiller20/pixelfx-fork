// Render the weapons pixelfx draws in code (src/core/rig.js WEAPONS) flat, pointing right, at the game's weapon size,
// and write them as pixel grids to pixelfx-weapons.json; build.py (or `build.py --pixelfx-only`) adds them to the
// weapons atlas after the pack's 90. All of them, the pistol and the rocket launcher too: it is a multiverse. The whip's
// handle comes with a lash drawn here (in pixelfx the lash is the effect's own).
//
//   node tools/xianxia/pixelfx-weapons.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WEAPONS } from "../../../src/core/rig.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// name in pixelfx: scale (game pixels per pixelfx unit), turn (the bow's length lies across, so it is turned to lie along)
const PICK = {
  sword: { s: 1.8 },
  greatsword: { s: 1.75 },
  dagger: { s: 1.8 },
  spear: { s: 1.45 },
  hammer: { s: 1.45 },
  scythe: { s: 1.55 },
  claw: { s: 1.9 },
  bow: { s: 1.5, turn: true, long: true },
  pistol: { s: 1.9 },
  launcher: { s: 1.5 },
  handle: { s: 1.8, lash: true, long: false }, // a whip hangs forward, it is not stood upright like a polearm
};
const INK = [24, 16, 20];
const out = [];
for (const [name, o] of Object.entries(PICK)) {
  const pts = new Map(); // "x,y" -> [r, g, b]; later strokes win, as in pixelfx
  const put = (i, k, c) => {
    const [a, b] = o.turn ? [-k, i] : [i, k];
    pts.set(`${Math.round(a * o.s)},${Math.round(b * o.s)}`, [c & 255, (c >>> 8) & 255, (c >>> 16) & 255]);
  };
  const T = (i, k, c) => put(i, k, c);
  T.at = (i, k) => [i, k, 0];
  try {
    WEAPONS[name].draw(T, { two: false }, [0, 0, 0]);
  } catch {
    // the bow strings itself through pixelfx's own frame buffer, which isn't there outside a scene: string it here
  }
  if (name === "bow") for (let k = -17; k <= 17; k += 0.4) put(-1, k, 0xffe8edf6);
  // the whip's lash: a leather cord from the handle's end, sagging and thinning towards a pale tip
  if (o.lash)
    for (let i = 6.8; i <= 34; i += 0.25) {
      const u = (i - 6.8) / 27.2, k = 7 * u * u - 1.5 * Math.sin(u * Math.PI);
      put(i, k, u > 0.88 ? 0xffd8e4f0 : 0xff2a4a7a);
      if (u < 0.5) put(i, k + 0.6, 0xff18305a);
    }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of pts.keys()) {
    const [x, y] = key.split(",").map(Number);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  // one pixel of ink round the outside, like the pack's weapons
  const w = x1 - x0 + 3, h = y1 - y0 + 3, px = Array.from({ length: h }, () => Array(w).fill(null));
  for (const [key, c] of pts) {
    const [x, y] = key.split(",").map(Number);
    px[y - y0 + 1][x - x0 + 1] = c;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!px[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => Array.isArray(px[y + dy]?.[x + dx]) && px[y + dy][x + dx] !== INK)) px[y][x] = "ink";
  const rows = px.map((r) => r.map((c) => (c === "ink" ? INK : c)));
  // the grip: pixelfx's fist sits at (0, 0)
  const [gx, gy] = [-x0 + 1, -y0 + 1];
  out.push({ name: "pixelfx_" + name, w, h, gx, gy, long: o.long, px: rows.map((r) => r.map((c) => (c ? c.map((v) => v.toString(16).padStart(2, "0")).join("") : "")).join(" ")) });
  console.log(name, w, "x", h, "grip", gx, gy);
}
writeFileSync(join(HERE, "pixelfx-weapons.json"), JSON.stringify(out, null, 0));
