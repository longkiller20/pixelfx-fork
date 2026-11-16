// The side-view town, drawn at the characters' own pixel size: one art pixel is one world pixel. That lets buildings and trees
// be as big as they really are beside a person: doors taller than you, houses three times your height, a temple and a pagoda
// towering over the street, cherry trees above the roofs.
//   terrain  Frogatto's old tile art (CC0): earth, grass, stone bricks, flowers, 16 px tiles, four to a 32 px map cell
//   roofs    the Oriental Roof Tiles sheet (CC0): an end piece and a repeating middle, in four colours, for every roof
//   the rest walls, doors, lattice windows, pillars, lanterns, cherry trees, bamboo, clouds, water and sky are painted here
// Everything still is painted once into one picture of the whole map; the far scenery (sky, peaks, isles, cloud) slides behind
// at its own pace, and water moves every frame.
import { hex, mix } from "/pixelfx/core/index.js";

const C = (h) => hex(h);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0;
  }
  rect(x, y, w, h, c) {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** A rect shaded top to bottom between two colours with an ordered dither. */
  grad(x, y, w, h, a, b) {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, dith(x + i, y + j) < j / Math.max(1, h - 1) ? b : a);
  }
  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c);
  }
  /** Copy a picture (Uint32 pixels, w x h) with its top left at (x, y), optionally mirrored; transparent pixels skipped. */
  blit(src, sw, sx0, sy0, w, h, x, y, flip = false) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const c = src[(sy0 + j) * sw + sx0 + (flip ? w - 1 - i : i)];
        if (c >>> 24 > 128) this.set(x + i, y + j, c | 0xff000000);
      }
  }
}

async function loadPixels(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, px: new Uint32Array(d.buffer.slice(0)) };
}

// ---------------------------------------------------------------- colours of the painted pieces
const P = {
  ink: C("#1a1420"),
  stone: [C("#2e2c3e"), C("#4a4860"), C("#66647e"), C("#8a88a2"), C("#b4b2c8")],
  wood: [C("#2a160e"), C("#4a2616"), C("#6a3a20"), C("#8a5430"), C("#a8703e")],
  red: [C("#4a0e10"), C("#7a1a1c"), C("#a82a26"), C("#d0402e"), C("#ec6a48")],
  gold: [C("#6a4612"), C("#a8781c"), C("#d8a832"), C("#f4d070"), C("#fff0b8")],
  plaster: [C("#9a8a72"), C("#bcae94"), C("#d8ccb2"), C("#ece2cc")],
  paper: [C("#8a5420"), C("#d08a30"), C("#f0b850"), C("#ffe0a0")],
  pink: [C("#7a2a52"), C("#b44c80"), C("#dc74a6"), C("#f39ec4"), C("#ffc8de"), C("#ffe8f2")],
  bark: [C("#2a1a12"), C("#43291c"), C("#5e3c28"), C("#7a5236")],
  bamboo: [C("#1e3a18"), C("#2e5a22"), C("#46842e"), C("#6aac44"), C("#9ad068")],
  cloth: [[C("#5a1418"), C("#a8302c"), C("#e8d8bc")], [C("#16305a"), C("#2e5aa0"), C("#e2e8f4")]],
  jade: [C("#0b2a1e"), C("#1e7a52"), C("#3cc888"), C("#9af0c8"), C("#e0fff0")],
};

// ---------------------------------------------------------------- the painted pieces, all at one art pixel per world pixel
function lattice(B, x, y, w, h) {
  B.rect(x - 2, y - 2, w + 4, h + 4, P.wood[0]);
  B.rect(x - 1, y - 1, w + 2, h + 2, P.wood[2]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const bar = i % 6 === 2 || j % 6 === 2;
      B.set(x + i, y + j, bar ? P.wood[1] : j < h / 2 ? P.paper[3] : P.paper[2]);
    }
}

function pillar(B, x, top, bottom, w = 8) {
  for (let y = top; y < bottom; y++)
    for (let i = 0; i < w; i++) B.set(x + i, y, i === 0 ? P.red[0] : i === 1 ? P.red[3] : i === w - 1 ? P.red[0] : i > w - 3 ? P.red[1] : P.red[2]);
  B.rect(x - 2, bottom - 6, w + 4, 6, P.stone[2]);
  B.rect(x - 2, bottom - 6, w + 4, 1, P.stone[4]);
}

function door(B, cx, floor, w, h) {
  const x = Math.round(cx - w / 2), y = floor - h;
  B.rect(x - 4, y - 6, w + 8, h + 6, P.red[1]);
  B.rect(x - 4, y - 6, w + 8, 2, P.red[3]);
  B.rect(x, y, w, h, P.wood[2]);
  B.rect(x + Math.floor(w / 2) - 1, y, 2, h, P.wood[0]);
  for (let j = 6; j < h - 4; j += 10) {
    B.rect(x + 2, y + j, w - 4, 1, P.wood[1]);
    for (let i = 4; i < w - 3; i += 6) B.set(x + i, y + j + 4, P.gold[2]);
  }
  B.disc(x + Math.floor(w / 2) - 5, y + Math.floor(h / 2), 2, P.gold[3]);
  B.disc(x + Math.floor(w / 2) + 4, y + Math.floor(h / 2), 2, P.gold[3]);
}

function walls(B, x, w, top, floor) {
  // plaster with a dithered shadow under the eaves, a stone footing, a timber beam
  B.grad(x, top, w, floor - top, P.plaster[1], P.plaster[2]);
  B.grad(x, top, w, 14, P.plaster[0], P.plaster[1]);
  for (let y = top + 22; y < floor - 12; y += 18) for (let i = 0; i < w; i++) if (hash(x + i, y) > 0.55) B.set(x + i, y, P.plaster[1]);
  B.rect(x, top, w, 6, P.wood[2]);
  B.rect(x, top, w, 1, P.wood[4]);
  B.rect(x, top + 5, w, 1, P.wood[0]);
  B.rect(x - 4, floor - 10, w + 8, 10, P.stone[1]);
  B.rect(x - 4, floor - 10, w + 8, 2, P.stone[3]);
  for (let i = 0; i < w + 8; i += 14) B.rect(x - 4 + i, floor - 8, 1, 8, P.stone[0]);
}

const PROPS = {
  house(B, x, floor, o, R) {
    const w = o.w * 32, top = floor - 128;
    walls(B, x, w, top, floor);
    const n = Math.max(2, Math.round(w / 96));
    for (let k = 0; k <= n; k++) pillar(B, Math.round(x + (k * (w - 10)) / n), top + 6, floor - 4, 10);
    door(B, x + w / 2, floor - 10, 40, 92);
    for (let k = 0; k < n; k++) {
      const cx = x + ((k + 0.5) * w) / n;
      if (Math.abs(cx - (x + w / 2)) < 40) continue;
      lattice(B, Math.round(cx - 15), top + 30, 30, 26);
    }
    R.draw(B, x - 28, x + w + 28, top + 14, o.roof ?? 0);
    // red lanterns hanging from the eaves
    for (const lx of [x + 18, x + w - 26]) {
      B.rect(lx + 3, top + 14, 1, 10, P.ink);
      B.grad(lx, top + 24, 8, 12, P.red[3], P.red[1]);
      B.rect(lx + 1, top + 23, 6, 1, P.gold[2]);
      B.rect(lx + 1, top + 36, 6, 1, P.gold[2]);
    }
  },
  temple(B, x, floor, o, R) {
    const w = o.w * 32, cx = Math.round(x + w / 2), top = floor - 138;
    // the main hall: a broad stair, red pillars, a great door under a gold plaque
    for (let s = 0; s < 3; s++) B.rect(cx - 70 - s * 12, floor - 8 + s * 0 - (2 - s) * 8, 140 + s * 24, 8, P.stone[2 + (s & 1)]);
    walls(B, x, w, top, floor - 24);
    for (let k = 0; k <= 6; k++) pillar(B, Math.round(x + (k * (w - 12)) / 6), top + 6, floor - 24, 12);
    door(B, cx, floor - 24, 64, 100);
    for (const s of [-1, 1]) for (const d of [1, 2]) lattice(B, cx + s * (40 + d * 50) - (s < 0 ? 34 : 0), top + 34, 34, 40);
    R.draw(B, x - 34, x + w + 34, top + 14, 2);
    // the upper storey and its own roof, a plaque between
    const uw = 200, ux = cx - uw / 2, ut = top + 14 - 104 - 58;
    walls(B, ux, uw, ut, top + 14 - 96);
    for (let k = 0; k <= 3; k++) pillar(B, Math.round(ux + (k * (uw - 10)) / 3), ut + 6, top + 14 - 96, 10);
    B.rect(cx - 40, ut + 16, 80, 26, P.gold[1]);
    B.rect(cx - 37, ut + 19, 74, 20, P.red[0]);
    for (let i = 0; i < 4; i++) B.rect(cx - 28 + i * 16, ut + 24, 8, 10, P.gold[3]);
    R.draw(B, ux - 22, ux + uw + 22, ut + 12, 2);
    // a jade pearl on the ridge
    B.disc(cx, ut + 12 - 104 + 2, 5, P.jade[2]);
    B.disc(cx - 1, ut + 12 - 104 + 1, 2, P.jade[4]);
  },
  pagoda(B, cx, floor, o, R) {
    // two storeys, each with its own roof, and a gold spire
    let base = floor;
    for (const [w, h, roofW] of [[150, 70, 0], [120, 58, 0]]) {
      const x = cx - w / 2, top = base - h;
      walls(B, x, w, top, base);
      for (let k = 0; k <= 2; k++) pillar(B, Math.round(x + (k * (w - 10)) / 2), top + 6, base - 4, 10);
      lattice(B, cx - 14, top + 20, 28, 30);
      R.draw(B, x - 24 - roofW, x + w + 24 + roofW, top + 10, 0);
      base = top + 10 - 96;
    }
    B.rect(cx - 2, base - 40, 4, 48, P.gold[2]);
    B.rect(cx - 1, base - 40, 1, 48, P.gold[4]);
    for (let k = 0; k < 4; k++) B.rect(cx - 7 + k, base - 30 + k * 7, 14 - k * 2, 3, P.gold[1]);
    B.disc(cx, base - 44, 4, P.gold[3]);
  },
  gate(B, x, floor, o, R) {
    // a paifang: two tall red pillars on stone, two beams, a gold plaque, a roof
    const span = 150;
    for (const px of [x, x + span]) {
      B.rect(px - 8, floor - 18, 30, 18, P.stone[2]);
      B.rect(px - 8, floor - 18, 30, 3, P.stone[4]);
      pillar(B, px, floor - 210, floor - 18, 14);
    }
    for (const [y, h] of [[floor - 196, 14], [floor - 150, 10]]) {
      B.rect(x - 22, y, span + 58, h, P.red[1]);
      B.rect(x - 22, y, span + 58, 2, P.red[3]);
      B.rect(x - 22, y + h - 2, span + 58, 2, P.red[0]);
    }
    B.rect(x + span / 2 - 34, floor - 182, 82, 32, P.gold[1]);
    B.rect(x + span / 2 - 31, floor - 179, 76, 26, P.ink);
    for (let i = 0; i < 3; i++) B.rect(x + span / 2 - 20 + i * 20, floor - 174, 10, 16, P.gold[3]);
    R.draw(B, x - 40, x + span + 54, floor - 196 + 6, 3);
  },
  lantern(B, cx, floor) {
    // a stone lantern a little lower than a person's shoulder: foot, shaft, the light box, a capped roof
    const S = P.stone;
    B.rect(cx - 12, floor - 8, 24, 8, S[1]);
    B.rect(cx - 12, floor - 8, 24, 2, S[3]);
    B.rect(cx - 5, floor - 34, 10, 26, S[2]);
    B.rect(cx - 5, floor - 34, 2, 26, S[4]);
    B.rect(cx + 3, floor - 34, 2, 26, S[1]);
    B.rect(cx - 11, floor - 38, 22, 4, S[2]);
    B.rect(cx - 9, floor - 52, 18, 14, S[1]);
    B.grad(cx - 6, floor - 50, 12, 10, P.paper[3], P.paper[1]);
    B.rect(cx - 16, floor - 56, 32, 4, S[2]);
    B.rect(cx - 16, floor - 56, 32, 1, S[4]);
    B.rect(cx - 11, floor - 60, 22, 4, S[3]);
    B.rect(cx - 3, floor - 65, 6, 5, S[3]);
  },
  cherry(B, cx, floor) {
    // a big old cherry: a twisting trunk well above the roofs, boughs, then billows of blossom lit from the top left
    const H = 250;
    for (let y = 0; y < H - 60; y++) {
      const wob = Math.round(Math.sin(y * 0.05) * 4), w = Math.round(16 - (y / H) * 8);
      for (let i = 0; i < w; i++) B.set(cx - w / 2 + i + wob, floor - y, i < 2 ? P.bark[3] : i > w - 3 ? P.bark[0] : hash(cx + i, y) > 0.8 ? P.bark[0] : P.bark[1 + (i < w / 3 ? 1 : 0)]);
    }
    const bough = (x0, y0, dx, dy, len) => {
      for (let t = 0; t < len; t++) for (let k = -2; k <= 2; k++) B.set(x0 + dx * t, y0 + dy * t + k, k < -1 ? P.bark[3] : P.bark[1]);
    };
    bough(cx, floor - 150, -1.2, -0.5, 60);
    bough(cx, floor - 175, 1.2, -0.55, 64);
    bough(cx, floor - 190, -0.4, -0.8, 40);
    const blobs = [[-80, -200, 34], [-40, -232, 40], [10, -246, 44], [62, -228, 40], [96, -196, 32], [-60, -176, 28], [40, -186, 32], [0, -200, 34], [-100, -168, 22], [110, -168, 20]];
    for (const [bx, by, r] of blobs) B.disc(cx + bx, floor + by + 6, r, P.pink[0]);
    for (const [bx, by, r] of blobs)
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r) continue;
          const lit = (-x - y) / (r * 1.5) + 0.5, d = dith(cx + bx + x, floor + by + y);
          const c = lit > 0.95 + d * 0.2 ? P.pink[4] : lit > 0.6 + d * 0.25 ? P.pink[3] : lit > 0.2 + d * 0.25 ? P.pink[2] : P.pink[1];
          B.set(cx + bx + x, floor + by + y, c);
        }
    for (let i = 0; i < 160; i++) {
      const a = hash(cx, i, 3) * 6.28, d = Math.sqrt(hash(cx, i, 4)) * 110;
      B.set(cx + Math.cos(a) * d, floor - 210 + Math.sin(a) * d * 0.4, hash(cx, i, 5) > 0.5 ? P.pink[5] : P.pink[1]);
    }
    // fallen petals on the ground
    for (let i = 0; i < 40; i++) B.set(cx - 90 + hash(cx, i, 7) * 180, floor - 1 - (hash(cx, i, 8) > 0.7 ? 1 : 0), P.pink[3]);
  },
  bamboo(B, cx, floor) {
    for (let s = 0; s < 5; s++) {
      const bx = cx - 24 + s * 11 + Math.round(hash(cx, s) * 4), h = 210 + Math.round(hash(cx, s, 2) * 70);
      for (let j = 0; j < h; j++) {
        const knot = (j + s * 7) % 26 < 2;
        for (let i = 0; i < 6; i++) B.set(bx + i, floor - j, knot ? (i === 0 ? P.bamboo[0] : P.bamboo[4]) : i === 0 ? P.bamboo[0] : i === 1 ? P.bamboo[3] : i === 5 ? P.bamboo[1] : P.bamboo[2]);
      }
      for (let l = 0; l < 7; l++) {
        const ly = floor - h + 8 + l * 22, dir = (l + s) & 1 ? 1 : -1, len = 18 + Math.round(hash(cx, s * 9 + l) * 10);
        for (let k = 0; k < len; k++) {
          const y = ly + Math.round(k * 0.45);
          B.set(bx + 3 + dir * (3 + k), y, k < len * 0.6 ? P.bamboo[3] : P.bamboo[2]);
          B.set(bx + 3 + dir * (3 + k), y + 1, P.bamboo[1]);
        }
      }
    }
  },
  taiji(B, cx, floor) {
    // the dais: three wide stone steps, gold studs; the floating taiji itself is drawn live
    for (let s = 0; s < 3; s++) {
      const w = 220 - s * 40, y = floor - 10 - s * 10;
      B.rect(cx - w / 2, y, w, 10, P.stone[1 + s]);
      B.rect(cx - w / 2, y, w, 2, P.stone[3 + (s > 0 ? 1 : 0)]);
      for (let i = -w / 2 + 10; i < w / 2 - 6; i += 20) B.rect(cx + i, y + 5, 3, 3, P.gold[2]);
    }
  },
  well(B, cx, floor, o, R) {
    B.rect(cx - 30, floor - 30, 60, 30, P.stone[1]);
    B.rect(cx - 30, floor - 30, 60, 4, P.stone[3]);
    for (let j = 0; j < 26; j += 9) for (let i = (j / 9) % 2 ? 8 : 0; i < 60; i += 16) B.rect(cx - 30 + i, floor - 26 + j, 1, 9, P.stone[0]);
    B.rect(cx - 28, floor - 100, 6, 70, P.wood[2]);
    B.rect(cx + 22, floor - 100, 6, 70, P.wood[2]);
    B.rect(cx - 30, floor - 100, 60, 5, P.wood[1]);
    B.rect(cx - 1, floor - 95, 2, 34, P.ink);
    B.grad(cx - 7, floor - 62, 14, 12, P.wood[3], P.wood[1]);
  },
  stall(B, x, floor, o) {
    const w = o.w * 32, [d, m, l] = P.cloth[o.style ?? 0];
    B.rect(x + 4, floor - 110, 6, 110, P.wood[1]);
    B.rect(x + w - 10, floor - 110, 6, 110, P.wood[1]);
    B.rect(x, floor - 42, w, 8, P.wood[3]);
    B.rect(x, floor - 42, w, 2, P.wood[4]);
    B.grad(x + 4, floor - 34, w - 8, 34, P.wood[2], P.wood[0]);
    // goods: jars, rolls of cloth, baskets of fruit
    for (let i = 10, k = 0; i < w - 20; i += 18, k++) {
      if (k % 3 === 0) {
        B.grad(x + i, floor - 62, 14, 20, P.jade[2], P.jade[0]);
        B.rect(x + i + 3, floor - 64, 8, 2, P.ink);
      } else if (k % 3 === 1) {
        B.grad(x + i, floor - 56, 14, 14, P.paper[2], P.paper[0]);
      } else for (let f = 0; f < 5; f++) B.disc(x + i + 4 + (f % 3) * 3, floor - 48 - Math.floor(f / 3) * 5, 3, f & 1 ? P.red[3] : P.gold[3]);
    }
    // the striped awning, scalloped at the front
    for (let j = 0; j < 22; j++) for (let i = -10; i < w + 10; i++) B.set(x + i, floor - 132 + j, j > 19 ? d : Math.floor((i + 40) / 14) % 2 ? m : l);
    for (let i = -10; i < w + 10; i += 14) for (let k = 0; k < 7; k++) B.rect(x + i + k, floor - 110, 14 - k * 2, 1, m), B.rect(x + i + 3, floor - 110 + 3, 8, 2, m);
  },
  spawnstone(B, cx, floor) {
    // a stele that brings travellers here: grey stone, a glowing jade rune, a tortoise plinth
    B.grad(cx - 40, floor - 22, 80, 22, P.stone[2], P.stone[0]);
    B.rect(cx - 40, floor - 22, 80, 3, P.stone[4]);
    B.grad(cx - 22, floor - 132, 44, 110, P.stone[3], P.stone[1]);
    B.rect(cx - 22, floor - 132, 3, 110, P.stone[4]);
    B.rect(cx - 26, floor - 140, 52, 8, P.stone[3]);
    B.rect(cx - 26, floor - 140, 52, 2, P.stone[4]);
    B.grad(cx - 7, floor - 118, 14, 70, P.jade[3], P.jade[1]);
    B.rect(cx - 3, floor - 114, 6, 62, P.jade[4]);
  },
};

// a cloud you can stand on: flat white top, billows under it, a faint jade glow inside
function cloudCell(B, x, y, leftEnd, rightEnd, seed) {
  const W = C("#ffffff"), L = C("#eef4ff"), M = C("#cddcf4"), D = C("#9cb0dc");
  for (let i = 0; i < 32; i++) {
    const inL = leftEnd ? 8 - i : -1, inR = rightEnd ? i - 23 : -1, cut = Math.max(0, inL, inR);
    const depth = 13 + Math.round(Math.sin(i * 0.5 + seed * 2.1) * 2.5) - cut;
    for (let j = cut; j < depth; j++) B.set(x + i, y + j, j === cut ? W : j < cut + 4 ? L : j < depth - 3 ? M : D);
  }
  B.rect(x + 10 + (seed % 3) * 4, y + 6, 3, 2, P.jade[3]);
}

function bridgeCell(B, x, y, leftEnd, rightEnd) {
  for (let i = 0; i < 32; i++) {
    const c = i % 8 === 7 ? P.wood[0] : i % 8 === 0 ? P.wood[4] : P.wood[2];
    B.rect(x + i, y, 1, 9, c);
    B.set(x + i, y + 9, P.wood[0]);
  }
  for (let i = 0; i < 32; i++) B.set(x + i, y - 20 + Math.round(Math.sin((i / 32) * Math.PI) * 4), P.bark[3]);
  if (leftEnd || rightEnd) {
    const px = leftEnd ? x : x + 28;
    B.rect(px, y - 26, 4, 26, P.wood[1]);
    B.rect(px, y - 28, 4, 2, P.gold[2]);
  }
  B.rect(x + 15, y - 22, 2, 22, P.wood[1]);
}

// ---------------------------------------------------------------- the far scenery, layer by layer, at half size (it's far away)
function layers(w, h) {
  const top = [C("#24306a"), C("#3a58a0"), C("#6a94d0"), C("#a8c8ea"), C("#f2dcc4")];
  const skyA = new Uint32Array(h), skyB = new Uint32Array(h), skyK = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const u = Math.min(0.999, y / (h * 0.8)), i = Math.floor(u * 4), k = u * 4 - i, step = Math.floor(k * 4) / 4;
    skyA[y] = mix(top[i], top[i + 1], step);
    skyB[y] = mix(top[i], top[i + 1], Math.min(1, step + 0.25));
    skyK[y] = (k - step) * 4;
  }
  const mk = () => new Buf(w, h);
  const far = mk(), isles = mk(), mid = mk(), near = mk(), cloud = mk();
  const ridge = (B, base, amp, freq, seed, cols, snow) => {
    for (let x = 0; x < w; x++) {
      const v = Math.sin((x / w) * Math.PI * 2 * freq + seed) * 0.5 + Math.sin((x / w) * Math.PI * 2 * freq * 2.7 + seed * 2) * 0.3 + Math.sin((x / w) * Math.PI * 2 * freq * 6.1 + seed * 3) * 0.12;
      const t = Math.round(base - amp * (0.55 + 0.45 * v));
      for (let y = Math.max(0, t); y < h; y++) {
        const d = y - t;
        B.set(x, y, snow && d < 3 && v > 0.1 ? cols[2] : d < 1 ? cols[1] : cols[0]);
      }
    }
  };
  ridge(far, h * 0.6, h * 0.34, 3, 1.3, [C("#8a9ccc"), C("#b4c4e4"), C("#e8eefa")], true);
  ridge(mid, h * 0.72, h * 0.22, 5, 4.1, [C("#5a6ea8"), C("#7a8ec0"), C("#a0b4d8")], false);
  ridge(near, h * 0.84, h * 0.13, 9, 2.2, [C("#3a4c80"), C("#4a5e94"), C("#4a5e94")], false);
  for (let x = 6; x < w; x += 9 + Math.floor(hash(x, 1) * 9)) {
    let t = 0;
    while (t < h && !near.get(x, t)) t++;
    const th = 8 + Math.floor(hash(x, 2) * 8);
    for (let j = 0; j < th; j++) for (let i = -Math.floor(j / 2.2); i <= Math.floor(j / 2.2); i++) near.set(x + i, t - th + j + 2, C("#2e3e6c"));
  }
  for (let y = Math.round(h * 0.64); y < h * 0.72; y++) for (let x = 0; x < w; x++) if (!mid.get(x, y) && hash(x >> 3, y, 7) > 0.35) mid.set(x, y, C("#c8d6ee"));
  for (let n = 0; n < 4; n++) {
    const cx = Math.round((n + 0.3 + hash(n, 9) * 0.4) * (w / 4)), cy = Math.round(h * (0.2 + hash(n, 8) * 0.18)), r = 12 + Math.round(hash(n, 7) * 10);
    for (let x = -r; x <= r; x++) {
      const d = Math.round((1 - (x / r) ** 2) * r * 1.3);
      for (let y = 0; y < d; y++) isles.set(cx + x, cy + y, y < 2 ? C("#6aa06a") : y < 4 ? C("#4a7a58") : C("#6a6a96"));
    }
    if (n % 2 === 0) {
      for (let j = 0; j < 9; j++) for (let i = -3; i <= 3; i++) isles.set(cx + i, cy - j, j > 6 ? C("#3a4c80") : C("#d8ccb2"));
      for (let i = -5; i <= 5; i++) isles.set(cx + i, cy - 8 - (Math.abs(i) < 4 ? 1 : 0), C("#2c3656"));
    }
    for (let y = cy + 2; y < cy + r * 2.5; y++) isles.set(cx + r - 4, y, (y & 3) === 0 ? C("#ffffff") : C("#bfe4ff"));
  }
  for (let n = 0; n < 9; n++) {
    const cx = Math.round(hash(n, 11) * w), cy = Math.round(h * (0.08 + hash(n, 12) * 0.28)), s = 4 + Math.round(hash(n, 13) * 5);
    for (let k = 0; k < 4; k++) cloud.disc(cx + (k - 1.5) * s * 1.4, cy - (k % 2) * s * 0.5, s, k % 2 ? C("#ffffff") : C("#eef4ff"));
    for (let x = cx - s * 4; x < cx + s * 4; x++) for (let y = cy + s * 0.6; y < cy + s; y++) cloud.px[Math.round(y) * w + x] = 0;
  }
  return { sky: { a: skyA, b: skyB, k: skyK }, list: [[cloud, 0.08, 0.05], [far, 0.12, 0.08], [isles, 0.2, 0.12], [mid, 0.3, 0.2], [near, 0.5, 0.35]] };
}

const WATER = ["#0e3a6a", "#16548e", "#2274b4", "#3a98d4", "#8ad0f4", "#ffffff"].map(C);

// ---------------------------------------------------------------- the whole scene
export async function buildScene(M) {
  const [ts, rf] = await Promise.all([loadPixels(M.def.terrain), loadPixels(M.def.roof)]);
  const T = M.T, cols = M.cols, rows = M.rows, SW = M.w, SH = M.h, S = new Buf(SW, SH);
  const at = (cx, cy) => M.cell(cx, cy);
  const solid = (ch) => ch === "#" || ch === "s";
  const sub = (scol, srow, x, y) => S.blit(ts.px, ts.w, scol * 16, srow * 16, 16, 16, x, y);
  // roofs: the end piece is 111 px wide, the middle repeats every 16 px; colour v is a row of the atlas
  const RE = 111, RM = 16, RH = 114;
  const roofs = {
    draw(B, x0, x1, eaveY, v) {
      const n = Math.max(0, Math.round((x1 - x0 - 2 * RE) / RM)), w = 2 * RE + n * RM, x = Math.round((x0 + x1) / 2 - w / 2), y = eaveY - RH + 10;
      B.blit(rf.px, rf.w, 0, v * RH, RE, RH, x, y);
      for (let k = 0; k < n; k++) B.blit(rf.px, rf.w, RE, v * RH, RM, RH, x + RE + k * RM, y);
      B.blit(rf.px, rf.w, 0, v * RH, RE, RH, x + RE + n * RM, y, true);
    },
  };
  // buildings and trees first: the ground's front edge, bridges and clouds go over them
  const ordered = [...M.def.props].sort((a, b) => (["cherry", "bamboo"].includes(a[0]) ? 0 : 1) - (["cherry", "bamboo"].includes(b[0]) ? 0 : 1));
  for (const [kind, x, row, o] of ordered) {
    if (kind === "sign") sub(19, 7, Math.round(x * T), row * T - 16);
    else if (PROPS[kind]) PROPS[kind](S, Math.round(x * T), row * T, o ?? {}, roofs);
  }
  const water = [], falls = [];
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const ch = at(cx, cy), x = cx * T, y = cy * T;
      if (ch === "#") {
        const open = !solid(at(cx, cy - 1));
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            const h = hash(cx * 2 + i, cy * 2 + j);
            if (open && j === 0) sub([1, 2, 3, 5][Math.floor(h * 4)], 2, x + i * 16, y);
            else sub(...(h > 0.5 ? [10, 0] : [10, 1]), x + i * 16, y + j * 16);
          }
        // grass blades and the odd flower standing on the top
        if (open) for (let i = 0; i < 2; i++) {
          const h = hash(cx, i, 31);
          if (h > 0.7) sub([2, 3, 4, 5][Math.floor(h * 13) % 4], 1, x + i * 16, y - 16);
          else if (h < 0.06) sub(6, 0, x + i * 16, y - 16);
        }
        // a dark rim where earth meets open air at the sides
        for (const [dir, edge] of [[-1, 0], [1, T - 1]]) if (!solid(at(cx + dir, cy)) && at(cx + dir, cy) !== "w") S.rect(x + edge, y + (open ? 6 : 0), 1, T, C("#231a14"));
      } else if (ch === "s") {
        const open = !solid(at(cx, cy - 1));
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            const h = hash(cx * 2 + i, cy * 2 + j, 5);
            if (open && j === 0) sub([9, 11, 14, 15][Math.floor(h * 4)], 8, x + i * 16, y);
            else sub(...[[9, 9], [10, 9], [15, 10], [8, 10], [9, 10]][Math.floor(h * 5)], x + i * 16, y + j * 16);
          }
      } else if (ch === "=") cloudCell(S, x, y, at(cx - 1, cy) !== "=", at(cx + 1, cy) !== "=", cx);
      else if (ch === "b") {
        bridgeCell(S, x, y, at(cx - 1, cy) !== "b", at(cx + 1, cy) !== "b");
        if (at(cx, cy + 1) === "w") water.push([cx, cy, true]);
      } else if (ch === "w") water.push([cx, cy, at(cx, cy - 1) !== "w" && at(cx, cy - 1) !== "b"]);
      else if (ch === "|") falls.push([cx, cy]);
    }
  // tall flowering plants from the sheet: two tiles high
  for (const [c, r, x, row] of M.def.deco ?? []) (sub(c, r - 1, Math.round(x * T), row * T - 32), sub(c, r, Math.round(x * T), row * T - 16));

  const LW = 640, LH = Math.ceil(SH / 2), far = layers(LW, LH);
  const lanterns = M.def.props.filter((p) => p[0] === "lantern").map(([, x, row]) => [x * T, row * T - 44]);

  /** Paint the window (camX, camY, VW x VH world px) into out (Uint32Array, VW x VH) at time t. */
  function paint(out, VW, VH, camX, camY, t) {
    const SPX = S.px, A = far.sky.a, Bk = far.sky.b, K = far.sky.k;
    for (let sy = 0; sy < VH; sy++) {
      const wy = camY + sy, o = sy * VW, row = wy * SW, hy = Math.min(LH - 1, wy >> 1);
      for (let sx = 0; sx < VW; sx++) {
        const wx = camX + sx;
        let c = wy < SH && wx < SW ? SPX[row + wx] : 0;
        if (!c) {
          c = dith(wx >> 1, hy) < K[hy] ? Bk[hy] : A[hy];
          for (let li = far.list.length - 1; li >= 0; li--) {
            const [L, px, py] = far.list[li], lx = (((Math.floor((camX * px + sx) / 2) + (li === 0 ? Math.floor(t * 2) : 0)) % LW) + LW) % LW;
            const ly = Math.floor((sy + camY * py - 40 * (1 - py)) / 2);
            if (ly < 0 || ly >= LH) continue;
            const v = L.px[ly * LW + lx];
            if (v) {
              c = v;
              break;
            }
          }
        }
        out[o + sx] = c;
      }
    }
    // water behind whatever is painted over it: a rolling bright surface, a deep body with drifting light, falls pouring
    const x0 = Math.floor(camX / T) - 1, x1 = Math.ceil((camX + VW) / T) + 1, y0 = Math.floor(camY / T) - 1, y1 = Math.ceil((camY + VH) / T) + 1;
    const put = (wx, wy, c) => {
      const sx = wx - camX, sy = wy - camY;
      if (sx >= 0 && sy >= 0 && sx < VW && sy < VH && !SPX[wy * SW + wx]) out[sy * VW + sx] = c;
    };
    for (const [cx, cy, top] of water) {
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const wx = cx * T + x, wy = cy * T + y, depth = (cy - 15) * T + y;
          // shallow light near the top fading to deep blue, dithered between bands, thin ripples drifting
          const band = depth / 18, d = dith(wx, wy);
          let k = 4 - Math.min(3, Math.floor(band + d * 0.9));
          if (top && y < 2) k = Math.sin(wx * 0.3 - t * 4) > 0.2 ? 5 : 4;
          if (Math.abs(Math.sin(wx * 0.07 + Math.sin(wy * 0.2 + t) * 2 - t * 1.5)) < 0.04 && depth > 4) k = Math.min(5, k + 1);
          if (hash(wx, wy, Math.floor(t * 4)) > 0.997) k = 5;
          put(wx, wy, WATER[k]);
        }
    }
    for (const [cx, cy] of falls) {
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      const L = at(cx - 1, cy) !== "|", R = at(cx + 1, cy) !== "|", foot = at(cx, cy + 1) !== "|";
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const wx = cx * T + x, wy = cy * T + y, s = hash(wx >> 1, Math.floor((wy - t * 140) / 10), 9);
          let k = s > 0.82 ? 5 : s > 0.6 ? 4 : s > 0.25 ? 3 : 2;
          if ((L && x < 3) || (R && x > T - 4)) k = x === 0 || x === T - 1 ? 0 : 1;
          if (foot && y > T - 12 && hash(wx, wy, Math.floor(t * 12)) > 0.3) k = 5;
          put(wx, wy, WATER[k]);
        }
    }
  }
  return { paint, lanterns };
}
