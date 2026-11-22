#!/usr/bin/env node
// Turn a picture (a PNG with a clear background) into a rigged pixelfx figure: a whole character for the game's Y Các,
// a world boss, or a monster (a critter). The picture is brought down to pixel art (each output pixel the main colour
// of the source pixels under it), held to a palette, split into the parts its rig moves, and written as an effect file
// you can render, check and tune like any other.
//
//   node tools/from-image.mjs <picture.png> --kind nhanvat|boss|critter --id <category>/<name> [options]
//
//   --kind nhanvat   a character (src/fx/nhanvat/_rig.js): hair and hem sway, legs step, arms swing and strike. Faces right.
//   --kind boss      a world boss (src/fx/boss/_rig.js): breathes, slams, roars, falls. Faces the viewer.
//   --kind critter   a monster (src/fx/critters/_picture.js): breathes, bobs, leans into a bite. Faces right.
//   --name "Tên"     its name (meta.name)            --desc "…"   what it is (meta.desc)
//   --height N       its height in pixels (default: nhanvat 84, boss 148, critter 40)
//   --colors N       at most N colours (default: nhanvat 60, boss 110, critter 32)
//   --flip           mirror it (the picture faces left; characters and critters must face right)
//   --fly            (critter) it flies: hovers, its middle at the anchor
//   --parts <file>   JSON that corrects the automatic split (see below), coordinates in output pixels
//   --lab <file>     a whole label grid (JSON array of strings, one letter per pixel) instead of the automatic split
//   --force          overwrite an existing effect file
//
// Writes src/fx/<id>.js, then renders records/<id>/contact.png (the figure in motion) and records/<id>/parts.png (the
// figure coloured by part, 4x, a grid line every 10 px, the part letters in the legend) and records/<id>/lab.json (the
// label grid: edit it and pass it back with --lab). Look at both; fix the split with --parts or --lab; run it again.
//
// The parts. nhanvat: u body, h the hair behind, a the near (front) arm, r the far arm, s the hem, L R the legs.
// boss: H head and horns, h hair, u chest, a b the arms (left, right in the picture), k the cloth at the waist, T what
// stands on the ground (legs, a tail, coils), 1..9 a serpent's or tentacle's head and neck (give `heads` and `roots`).
// critter: no parts (it moves as one).
// --parts JSON (every field optional):
//   { "fx": 21,                         the x of the feet (the anchor)
//     "legs": 73, "skirt": [62, 72], "hair": [10, 50],       (nhanvat) the rows where the legs start, the hem, the hair
//     "eyes": [[28, 32, 26, 27]], "skin": "#f4c8a0",         (nhanvat) eye boxes [x0, x1, y0, y1] that blink, the skin colour
//     "face": [x, y], "shoulders": [[x, y], [x, y]], "waist": y,   (boss)
//     "heads": { "1": [x, y] }, "roots": { "1": [x, y] },          (boss) each serpent's eye and where its neck joins
//     "boxes": [["a", x0, y0, x1, y1], ["h", x0, y0, x1, y1, "dark"]] }   set a part over a box, in order; a 6th
//                                        field keeps it to "dark", "light" or a "#rrggbb" colour (±40 per channel)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { decodePNG, encodePNG } from "./lib/png.mjs";
import { ROOT, loadEffect, renderFrames, contactSheet, save } from "./lib/fxlib.mjs";

const args = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) pos.push(a);
  else if (["flip", "fly", "force"].includes(a.slice(2))) flags[a.slice(2)] = true;
  else flags[a.slice(2)] = args[++i];
}
const die = (m) => (console.error(`✖ ${m}`), process.exit(1));
const [file] = pos, kind = flags.kind, id = flags.id;
if (!file || !kind || !id) die("usage: node tools/from-image.mjs <picture.png> --kind nhanvat|boss|critter --id <category>/<name> [--name …] (see the top of this file)");
if (!["nhanvat", "boss", "critter"].includes(kind)) die("--kind: nhanvat, boss or critter");
if (!/^[a-z]+\/[a-z0-9-]+$/.test(id)) die("--id: <category>/<name>, lower case, e.g. nhanvat/hoa-yeu");
const cat = id.split("/")[0], want = { nhanvat: "nhanvat", boss: "boss", critter: "critters" }[kind];
if (cat !== want) die(`a ${kind} goes in ${want}/ (--id ${want}/${id.split("/")[1]})`);
const OUT = join(ROOT, "src", "fx", `${id}.js`);
if (existsSync(OUT) && !flags.force) die(`${OUT} exists (--force to overwrite)`);
const H = Number(flags.height ?? { nhanvat: 84, boss: 148, critter: 40 }[kind]);
// the rigs' letters: a character's rig has 75; a boss and a critter carry their own list
const AL_FIG = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+-=?@^~";
const AL_BIG = AL_FIG + "!()[]{}<>/|:;,_'" + [...Array(64)].map((_, i) => String.fromCharCode(0xc0 + i)).filter((c) => c !== "×" && c !== "÷").join("");
const NC = Math.min(Number(flags.colors ?? { nhanvat: 60, boss: 110, critter: 32 }[kind]), kind === "nhanvat" ? AL_FIG.length : AL_BIG.length);
if (!(H >= 12 && H <= 260)) die("--height: 12 to 260");
const parts = flags.parts ? JSON.parse(readFileSync(flags.parts, "utf8")) : {};

// ---------------------------------------------------------------- 1. the picture, cropped to what is there
const src = decodePNG(readFileSync(file));
let x0 = src.w, x1 = -1, y0 = src.h, y1 = -1;
for (let y = 0; y < src.h; y++)
  for (let x = 0; x < src.w; x++)
    if (src.rgba[(y * src.w + x) * 4 + 3] >= 128) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
if (x1 < 0) die("the picture has nothing in it (no pixel with alpha ≥ 128): it needs a clear background around the figure");
const SW = x1 - x0 + 1, SH = y1 - y0 + 1;
let opaque = 0;
for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.rgba[(y * src.w + x) * 4 + 3] >= 128) opaque++;
if (opaque / (src.w * src.h) > 0.97) console.warn("!! almost every pixel is opaque: is the background really clear? (remove it first)");
const sp = (x, y) => {
  const xx = flags.flip ? x1 - x : x0 + x, o = ((y0 + y) * src.w + xx) * 4;
  return [src.rgba[o], src.rgba[o + 1], src.rgba[o + 2], src.rgba[o + 3]];
};

// ---------------------------------------------------------------- 2. down to pixel art: K source pixels per pixel, bottom-anchored
const K = SH / H, W = Math.max(1, Math.round(SW / K));
const img = Array.from({ length: H }, () => new Array(W).fill(null)); // [r, g, b] or null
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const ys = Math.floor(j * K), ye = Math.max(ys + 1, Math.floor((j + 1) * K)), xs = Math.floor(i * K), xe = Math.max(xs + 1, Math.min(SW, Math.floor((i + 1) * K)));
    // the middle of the cell (its edges are where the picture smeared neighbours together), unless that is too small
    const my = Math.floor((ye - ys) / 4), mx = Math.floor((xe - xs) / 4);
    let cells = [], all = 0, solid = 0;
    for (const [a0, a1, b0, b1] of [[ys + my, ye - my, xs + mx, xe - mx], [ys, ye, xs, xe]]) {
      cells = [];
      for (let y = a0; y < a1; y++)
        for (let x = b0; x < b1; x++) {
          const c = sp(x, y);
          if (a0 === ys) all++;
          if (c[3] >= 128) cells.push(c), a0 === ys && solid++;
        }
      if (cells.length >= 2) break;
    }
    if (!all) for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) all++, sp(x, y)[3] >= 128 && solid++;
    if (solid / Math.max(1, all) < 0.5 || !cells.length) continue;
    // the most common colour (in coarse buckets), then the median of that bucket
    const buckets = new Map();
    for (const c of cells) {
      const k = `${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`;
      (buckets.get(k) ?? buckets.set(k, []).get(k)).push(c);
    }
    const best = [...buckets.values()].sort((a, b) => b.length - a.length)[0];
    const med = (n) => best.map((c) => c[n]).sort((a, b) => a - b)[best.length >> 1];
    img[j][i] = [med(0), med(1), med(2)];
  }
// pinholes: an empty pixel with at least 7 of 8 neighbours filled takes their median
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    if (img[y][x]) continue;
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && img[y + dy][x + dx]) nb.push(img[y + dy][x + dx]);
    if (nb.length >= 7) img[y][x] = [0, 1, 2].map((n) => nb.map((c) => c[n]).sort((a, b) => a - b)[nb.length >> 1]);
  }

// ---------------------------------------------------------------- 3. a palette of at most NC colours (k-means, seeded; bright, saturated colours weigh more)
const X = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img[y][x]) X.push([x, y, ...img[y][x]]);
if (X.length < 20) die(`only ${X.length} pixels at --height ${H}: give a bigger height or a bigger picture`);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const px = X.map((p) => [p[2], p[3], p[4]]), wt = px.map((c) => 1 + (Math.max(...c) - Math.min(...c)) / 40);
let C = [px[Math.floor(rnd() * px.length)]];
const near = px.map((c) => d2(c, C[0]));
while (C.length < Math.min(NC, px.length)) {
  let s = 0;
  for (let i = 0; i < px.length; i++) s += near[i] * wt[i];
  if (s === 0) break;
  let r = rnd() * s, k = 0;
  for (; k < px.length - 1 && (r -= near[k] * wt[k]) > 0; k++);
  C.push(px[k].slice());
  for (let i = 0; i < px.length; i++) near[i] = Math.min(near[i], d2(px[i], px[k]));
}
let lab = new Array(px.length).fill(0);
for (let it = 0; it < 18; it++) {
  for (let i = 0; i < px.length; i++) {
    let b = 0, bd = Infinity;
    for (let k = 0; k < C.length; k++) {
      const dd = d2(px[i], C[k]);
      if (dd < bd) (bd = dd), (b = k);
    }
    lab[i] = b;
  }
  const sum = C.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < px.length; i++) {
    const s = sum[lab[i]];
    (s[0] += px[i][0] * wt[i]), (s[1] += px[i][1] * wt[i]), (s[2] += px[i][2] * wt[i]), (s[3] += wt[i]);
  }
  C = C.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
}
C = C.map((c) => c.map((v) => Math.round(v)));
// darkest first; the unused ones dropped
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const used = [...new Set(lab)].sort((a, b) => lum(C[a]) - lum(C[b]));
const order = new Map(used.map((k, i) => [k, i]));
const AL = kind === "nhanvat" ? AL_FIG : AL_BIG;
const pal = used.map((k) => "#" + C[k].map((v) => v.toString(16).padStart(2, "0")).join(""));
const grid = Array.from({ length: H }, () => new Array(W).fill("."));
X.forEach((p, i) => (grid[p[1]][p[0]] = AL[order.get(lab[i])]));
const colorAt = (x, y) => (grid[y]?.[x] && grid[y][x] !== "." ? C[used[AL.indexOf(grid[y][x])]] : null);

// ---------------------------------------------------------------- 4. the parts
const rowsWith = (y) => grid[y].reduce((n, c) => n + (c !== "." ? 1 : 0), 0);
let top = 0;
while (top < H && !rowsWith(top)) top++;
const fig = H - top; // the figure's own height (rows from its top to the ground)
// the feet's x: the middle of what touches the ground (the bottom 8% of rows)
const footXs = [];
for (let y = H - Math.max(2, Math.round(fig * 0.08)); y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] !== ".") footXs.push(x);
footXs.sort((a, b) => a - b);
const fx = parts.fx ?? (footXs.length ? footXs[footXs.length >> 1] : W >> 1);
const L = Array.from({ length: H }, () => new Array(W).fill("."));
const Y = (f) => Math.round(top + fig * f);
// the body's half width around fx, from the rows where the arms are not (the waist)
const runAt = (y) => {
  if (grid[y][fx] === ".") return [fx, fx];
  let a = fx, b = fx;
  while (a > 0 && grid[y][a - 1] !== ".") a--;
  while (b < W - 1 && grid[y][b + 1] !== ".") b++;
  return [a, b];
};
const meta = {};
if (kind === "nhanvat") {
  const legs = parts.legs ?? Y(0.87), skirt = parts.skirt ?? [Y(0.74), legs - 1], hair = parts.hair ?? [Y(0.12), Y(0.6)];
  // the torso: half the narrowest run through fx in the chest band (the arms widen the others)
  const runs = [];
  for (let y = Y(0.3); y < Y(0.6); y++) runs.push(runAt(y));
  const half = Math.max(3, Math.round(runs.map(([a, b]) => (b - a) / 2).sort((a, b) => a - b)[Math.floor(runs.length * 0.3)] ?? 6));
  // the hair's colour: the most common one behind the body in the hair band (where the long hair hangs)
  const tally = new Map();
  for (let y = hair[0]; y <= hair[1]; y++) for (let x = 0; x < fx - half; x++) if (grid[y][x] !== ".") tally.set(grid[y][x], (tally.get(grid[y][x]) ?? 0) + 1);
  const hairCol = C[used[AL.indexOf([...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "A")]];
  const hairy = (c) => c && d2(c, hairCol) < 60 * 60;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === ".") continue;
      let p = "u";
      if (y >= legs) p = x < fx ? "L" : "R";
      else if (y >= skirt[0]) p = "s";
      else if (y >= Y(0.28) && x > fx + half) p = "a";
      else if (y >= Y(0.28) && x < fx - half && !(y <= hair[1] && hairy(colorAt(x, y)))) p = "r";
      else if (y >= hair[0] && y <= hair[1] && x < fx - half * 0.6 && hairy(colorAt(x, y))) p = "h";
      L[y][x] = p;
    }
  Object.assign(meta, { legs, skirt, hair, eyes: parts.eyes ?? [], skin: parts.skin });
} else if (kind === "boss") {
  const waist = parts.waist ?? Y(0.55), face = parts.face ?? null;
  const half = Math.round(W * 0.18);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === ".") continue;
      let p;
      if (y < Y(0.25)) p = "H";
      else if (y < waist) p = x < fx - half ? "a" : x > fx + half ? "b" : "u";
      else if (y < Y(0.76)) p = "k";
      else p = "T";
      L[y][x] = p;
    }
  // the face: the middle of the head's pixels
  const head = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[y][x] === "H") head.push([x, y]);
  const mid = (a, n) => a.map((p) => p[n]).sort((p, q) => p - q)[a.length >> 1] ?? 0;
  meta.face = face ?? [mid(head, 0), mid(head, 1)];
  meta.shoulders = parts.shoulders ?? [[fx - half, Y(0.35)], [fx + half, Y(0.35)]];
  meta.waist = waist;
  meta.heads = parts.heads ?? {};
  meta.roots = parts.roots ?? {};
}
// the corrections, in order
for (const b of parts.boxes ?? []) {
  const [p, bx0, by0, bx1, by1, only] = b;
  const ref = typeof only === "string" && only.startsWith("#") ? [1, 3, 5].map((i) => parseInt(only.slice(i, i + 2), 16)) : null;
  for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++)
    for (let x = Math.max(0, bx0); x <= Math.min(W - 1, bx1); x++) {
      const c = colorAt(x, y);
      if (!c) continue;
      if (only === "dark" && lum(c) > 90) continue;
      if (only === "light" && lum(c) < 140) continue;
      if (ref && ref.some((v, i) => Math.abs(v - c[i]) > 40)) continue;
      L[y][x] = p;
    }
}
// a whole grid given instead
if (flags.lab) {
  const g = JSON.parse(readFileSync(flags.lab, "utf8"));
  if (g.length !== H || g.some((r) => r.length !== W)) die(`--lab: ${H} rows of ${W} letters expected (the size this run made); run without --lab to get records/${id}/lab.json`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] !== ".") L[y][x] = g[y][x] === "." ? "u" : g[y][x];
}
const OK = { nhanvat: "uhraLRs", boss: "HhuabkT123456789", critter: "u" }[kind];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] !== "." && kind !== "critter" && !OK.includes(L[y][x])) die(`part "${L[y][x]}" at (${x}, ${y}) is not one of ${OK}`);
if (kind === "boss") for (const k of Object.keys(meta.heads)) if (!meta.roots[k]) die(`heads.${k} needs roots.${k}`);

// ---------------------------------------------------------------- 5. the effect file
const name = flags.name ?? id.split("/")[1].replace(/-/g, " ");
const desc = flags.desc ?? `${name}: from a picture by tools/from-image.mjs.`;
const js = (v) => JSON.stringify(v);
const rows = (a) => a.map((r) => `    ${js(r.join(""))},`).join("\n");
const skinLetter = meta.skin ? (() => {
  const want = [1, 3, 5].map((i) => parseInt(meta.skin.slice(i, i + 2), 16));
  let b = 0;
  pal.forEach((h, i) => d2([1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)), want) < d2([1, 3, 5].map((k) => parseInt(pal[b].slice(k, k + 2), 16)), want) && (b = i));
  return AL[b];
})() : AL[pal.length - 1];
let code;
if (kind === "nhanvat") {
  const sw = Math.max(72, W + 29), sh = H + 16;
  code = `// ${name}: a whole character for the Y Các, from a picture (tools/from-image.mjs), rigged by ./_rig.js.
import { makeFigure, poseOf, drawFigure, ANIMS } from "./_rig.js";

export const meta = {
  name: ${js(name)},
  desc: ${js(desc + " Rigged: hair, hem, legs, arms. options.anim: idle walk attack jump fly.")},
  tags: ["nhanvat", "character", "rig", "xianxia", "loop"],
  size: [${sw}, ${sh}],
  origin: [${sw >> 1}, ${H + 12}],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { anim: "walk" },
};

/** The figure: its colors (darkest first), its pixels one letter each ('.' empty), and which part of the rig each is. */
export const FIGURE = makeFigure({
  w: ${W}, h: ${H}, fx: ${fx},
  hair: ${js(meta.hair)}, skirt: ${js(meta.skirt)}, legs: ${meta.legs},
  eyes: ${js(meta.eyes)}, skin: ${js(skinLetter)},
  pal: ${js(pal)},
  px: [
${rows(grid)}
  ],
  lab: [
${rows(L)}
  ],
});

export function draw(p, t, o) {
  drawFigure(p, FIGURE, poseOf(ANIMS[o.anim] ? ANIMS[o.anim](t) : ANIMS.idle(t)));
}
`;
} else if (kind === "boss") {
  const sw = W + 67, sh = H + 52;
  code = `// ${name}: a world boss, from a picture (tools/from-image.mjs), rigged by ./_rig.js (breathes, slams, roars, falls).
import { makeBoss, poseOf, drawBoss, ANIMS } from "./_rig.js";

export const meta = {
  name: ${js(name)},
  desc: ${js(desc + " A rigged world boss. options.anim: idle, walk, slam, roar, dead.")},
  tags: ["boss", "character", "rig", "xianxia", "loop"],
  size: [${sw}, ${sh}],
  origin: [${sw >> 1}, ${H + 38}],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { anim: "slam" },
};

/** Its colors (darkest first), its pixels one letter each ('.' empty), which part each is, and where things are (see ./_rig.js). */
export const FIGURE = makeBoss({
  w: ${W}, h: ${H}, fx: ${fx}, face: ${js(meta.face)}, shoulders: ${js(meta.shoulders)}, waist: ${meta.waist},
  heads: ${js(meta.heads)},
  roots: ${js(meta.roots)},
  al: ${js(AL.slice(0, pal.length))},
  pal: ${js(pal)},
  px: [
${rows(grid)}
  ],
  lab: [
${rows(L)}
  ],
});

export function draw(p, t, o) {
  drawBoss(p, FIGURE, poseOf((ANIMS[o.anim] ?? ANIMS.idle)(t), FIGURE));
}
`;
} else {
  const sw = W + 24, sh = H + 20 + (flags.fly ? 4 : 0);
  code = `// ${name}: a monster, from a picture (tools/from-image.mjs), kept alive by ./_picture.js (breathes, bobs, leans in).
import { makePicture, drawPicture } from "./_picture.js";

export const meta = {
  name: ${js(name)},
  desc: ${js(desc)},
  tags: ["critter", "monster", "animal", ${flags.fly ? '"flying", ' : '"ground", '}"loop"],
  size: [${sw}, ${sh}],
  origin: [${sw >> 1}, ${flags.fly ? sh >> 1 : H + 10}],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "${flags.fly ? "sky" : "ground"}",
  options: { anim: "idle", seed: 1 },
};

const FIGURE = makePicture({
  w: ${W}, h: ${H}, fx: ${fx}, fly: ${!!flags.fly},
  al: ${js(AL.slice(0, pal.length))},
  pal: ${js(pal)},
  px: [
${rows(grid)}
  ],
});

export function draw(p, t, o) {
  drawPicture(p, FIGURE, t, o.anim);
}
`;
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, code);
console.log(`✔ ${OUT}: ${W}×${H} px, ${pal.length} colours`);

// ---------------------------------------------------------------- 6. what to look at
const REC = join(ROOT, "records", ...id.split("/"));
mkdirSync(REC, { recursive: true });
writeFileSync(join(REC, "lab.json"), JSON.stringify(L.map((r) => r.join("")), null, 0).replace(/","/g, '",\n"'));
const PCOL = { u: [255, 160, 0], h: [230, 230, 255], a: [255, 255, 0], r: [0, 200, 255], s: [255, 0, 160], L: [0, 220, 90], R: [0, 120, 255], H: [60, 90, 255], b: [200, 255, 0], k: [255, 0, 0], T: [150, 80, 30] };
const Z = 4, legend = 14, pw = W * Z, ph = H * Z + legend, out = new Uint8ClampedArray(pw * ph * 4);
for (let i = 0; i < pw * ph; i++) out.set([24, 22, 30, 255], i * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = colorAt(x, y);
    if (!c) continue;
    const pc = PCOL[L[y][x]] ?? [255, 255, 255].map((v, i) => (L[y][x].charCodeAt(0) * (i + 3) * 37) % 255);
    const v = c.map((cv, i) => cv * 0.4 + pc[i] * 0.6);
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) out.set([...v, 255], ((y * Z + dy) * pw + x * Z + dx) * 4);
  }
for (let y = 0; y < H * Z; y++) for (let x = 0; x < pw; x++) if ((x % (10 * Z) === 0 || y % (10 * Z) === 0) && !(x % 2)) out.set([90, 90, 110, 255], (y * pw + x) * 4);
// the legend: one swatch per part present
let lx = 2;
for (const p of [...new Set(L.flat().filter((c) => c !== "."))]) {
  const pc = PCOL[p] ?? [255, 255, 255];
  for (let y = H * Z + 3; y < H * Z + 11 && lx + 8 < pw; y++) for (let x = lx; x < lx + 8; x++) out.set([...pc, 255], (y * pw + x) * 4);
  lx += 12;
}
writeFileSync(join(REC, "parts.png"), encodePNG(pw, ph, out));
try {
  const fx = await loadEffect(id);
  const anims = { nhanvat: ["idle", "walk", "attack"], boss: ["idle", "slam", "roar"], critter: ["idle", "walk", "attack"] }[kind];
  for (const a of anims) {
    const r = renderFrames(fx, { options: { anim: a } });
    save(join(REC, a === anims[0] ? "contact.png" : `contact-${a}.png`), contactSheet(fx, r, { title: `${id} · ${a}` }));
  }
  console.log(`✔ records/${id}/contact.png (+ contact-${anims[1]}.png, contact-${anims[2]}.png): the figure moving`);
} catch (e) {
  console.warn(`!! could not render it: ${e.message}`);
}
console.log(`✔ records/${id}/parts.png: the parts (${[...new Set(L.flat().filter((c) => c !== "."))].join(" ")}); records/${id}/lab.json to edit them`);
try {
  execFileSync(process.execPath, [join(ROOT, "tools", "index.mjs")], { stdio: "ignore" });
} catch {}
