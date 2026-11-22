// A critter from a picture (tools/from-image.mjs --kind critter): one pixel-art figure that breathes, bobs and squashes
// as it waits, sways as a flier hovers, and leans into a strike. The game moves it about and lunges it when it bites;
// this only keeps it alive where it stands. Faces right; feet in the middle of the bottom row at (0, 0) (a flier: its
// middle there).
import { hex, TAU } from "../../core/index.js";

/** Read a picture's data ({ w, h, fx, al, pal, px, fly }) into its pixels, rows from the feet up. */
export function makePicture(d) {
  const pal = d.pal.map(hex), pts = [];
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      const ch = d.px[y][x];
      if (ch !== ".") pts.push([x - d.fx, y - d.h, pal[d.al.indexOf(ch)], (d.h - y) / d.h]);
    }
  return { pts, w: d.w, h: d.h, fly: !!d.fly };
}

/** Draw it at time t (s): anim idle (breathing), walk (a bouncing step), attack (a lean forward and back). */
export function drawPicture(p, F, t, anim = "idle") {
  let bob = 0, sq = 0, lean = 0;
  if (F.fly) bob = Math.round(Math.sin(t * TAU * 0.8) * 2);
  else if (anim === "walk") {
    const ph = (t * 2.4) % 1;
    bob = -Math.round(Math.abs(Math.sin(ph * Math.PI)) * 2);
    sq = ph < 0.12 ? 1 : 0;
  } else sq = Math.sin(t * TAU * 0.55) > 0.4 ? 1 : 0;
  if (anim === "attack") {
    const u = (t % 1.2) / 1.2;
    lean = u < 0.35 ? -2 * (u / 0.35) : u < 0.5 ? 4 : 4 * (1 - (u - 0.5) / 0.5);
  }
  const fy = F.fly ? -Math.round(F.h / 2) : 0;
  for (const [x, y, c, up] of F.pts) {
    // a squash: the top comes down a pixel, the lower half stays; a lean: the top goes further than the feet
    const yy = y + bob + fy + (sq && up > 0.5 ? 1 : 0), xx = x + Math.round(lean * up);
    p.px(xx, yy, c);
  }
}

export const ANIMS = ["idle", "walk", "attack"];
