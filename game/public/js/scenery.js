// The side-view town, drawn at the characters' own pixel size: one art pixel is one world pixel. That lets buildings and trees
// be as big as they really are beside a person: doors taller than you, houses three times your height, a temple and a pagoda
// towering over the street, cherry trees above the roofs.
//   ground   the Xianxia Pixel Pack (CC0): bamboo-forest earth, blue stone, cloud platforms; and its golden palace, gate and
//            pagoda, and the far palaces and isles on the clouds
//   terrain  Frogatto's old tile art (CC0): tall flowering plants and the signpost
//   roofs    the Oriental Roof Tiles sheet (CC0): an end piece and a repeating middle, in four colours, for every roof
//   the rest walls, doors, lattice windows, pillars, lanterns, cherry trees, bamboo, clouds, water and sky are painted here
// Everything still is painted once into one picture of the whole map; the far scenery (sky, peaks, isles, cloud) slides behind
// at its own pace, and water moves every frame.
import { hex, mix } from "/hieu-ung/core/index.js";

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

/** A picture at 1/s size (s = 1, 2, 3, 4...): each s x s block averaged, transparent if mostly empty. */
function shrunk(img, s) {
  if (s <= 1) return img;
  const w = Math.floor(img.w / s), h = Math.floor(img.h / s), px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = 0; j < s; j++)
        for (let i = 0; i < s; i++) {
          const c = img.px[(y * s + j) * img.w + x * s + i];
          if (c >>> 24 > 128) (r += c & 255), (g += (c >>> 8) & 255), (b += (c >>> 16) & 255), n++;
        }
      if (n * 2 >= s * s) px[y * w + x] = ((255 << 24) | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
    }
  return { w, h, px };
}

/** A picture at half size: each 2 x 2 block averaged (transparent if mostly empty). For far-away scenery. */
function halve(img) {
  const w = img.w >> 1, h = img.h >> 1, px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = img.px[(y * 2 + dy) * img.w + x * 2 + dx];
        if (c >>> 24 > 128) (r += c & 255), (g += (c >>> 8) & 255), (b += (c >>> 16) & 255), n++;
      }
      if (n >= 2) px[y * w + x] = ((255 << 24) | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
    }
  return { w, h, px };
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
  // a grave: v 0 an upright tablet on a plinth, v 1 an earth mound with its stele behind, v 2 an old slab leaning, cracked
  tomb(B, cx, floor, o) {
    const v = o.v ?? 0, S = [C("#1c1a26"), C("#34323f"), C("#4a4858"), C("#625f72"), C("#7e7a90")], moss = [C("#28331f"), C("#3c4a2a")];
    const slab = (x, y, w, h, lean = 0) => {
      for (let j = 0; j < h; j++) {
        const dx = Math.round(lean * (h - j)), round = j < 3 ? 3 - j : 0;
        for (let i = round; i < w - round; i++) B.set(x + i + dx, y + j, i === round || j === 0 ? S[4] : i >= w - round - 2 ? S[1] : j > h - 4 ? S[2] : S[3]);
        B.set(x + round - 1 + dx, y + j, S[0]);
        B.set(x + w - round + dx, y + j, S[0]);
      }
      for (let i = 3; i < w - 3; i++) B.set(x + i, y - 1, S[0]);
      // carved lines, a little moss
      for (let j = 6; j < h - 6; j += 4) for (let i = 4; i < w - 4; i++) if (hash(x + i, j, 3) > 0.35) B.set(x + i + Math.round(lean * (h - j)), y + j, S[1]);
      for (let i = 0; i < w; i++) if (hash(x + i, y, 5) > 0.6) B.set(x + i, y + h - 1, moss[hash(i, y, 6) > 0.5 ? 1 : 0]);
    };
    if (v === 1) {
      slab(cx - 7, floor - 34, 14, 26);
      for (let i = -20; i <= 20; i++) {
        const hgt = Math.round(Math.sqrt(1 - (i / 21) ** 2) * 14);
        for (let j = 0; j < hgt; j++) B.set(cx + i, floor - j - 1, j === hgt - 1 ? moss[1] : j > hgt - 4 ? moss[0] : P.bark[j % 3 === 0 ? 0 : 1]);
      }
    } else if (v === 2) {
      slab(cx - 9, floor - 24, 18, 22, 0.3);
      for (let j = 6; j < 18; j++) B.set(cx - 2 + (j % 3) + Math.round(0.3 * (22 - j)), floor - 24 + j, S[0]);
    } else {
      B.rect(cx - 12, floor - 6, 24, 6, S[2]);
      B.rect(cx - 12, floor - 6, 24, 1, S[4]);
      B.rect(cx - 12, floor - 1, 24, 1, S[0]);
      slab(cx - 8, floor - 34, 16, 28);
    }
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
function layers(w, h, th) {
  const top = th.sky.map(C);
  const skyA = new Uint32Array(h), skyB = new Uint32Array(h), skyK = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const u = Math.min(0.999, y / (h * 0.8)), i = Math.floor(u * 4), k = u * 4 - i, step = Math.floor(k * 4) / 4;
    skyA[y] = mix(top[i], top[i + 1], step);
    skyB[y] = mix(top[i], top[i + 1], Math.min(1, step + 0.25));
    skyK[y] = (k - step) * 4;
  }
  const mk = () => new Buf(w, h);
  const isles = mk(), cloud = mk();
  for (let n = 0; n < (th.isles ? 4 : 0); n++) {
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
  const [ca, cb] = (th.cloud ?? ["#ffffff", "#eef4ff"]).map(C);
  for (let n = 0; n < (th.clouds === false ? 0 : 9); n++) {
    const cx = Math.round(hash(n, 11) * w), cy = Math.round(h * (0.08 + hash(n, 12) * 0.28)), s = 4 + Math.round(hash(n, 13) * 5);
    for (let k = 0; k < 4; k++) cloud.disc(cx + (k - 1.5) * s * 1.4, cy - (k % 2) * s * 0.5, s, k % 2 ? ca : cb);
    for (let x = cx - s * 4; x < cx + s * 4; x++) for (let y = cy + s * 0.6; y < cy + s; y++) cloud.px[Math.round(y) * w + x] = 0;
  }
  return { sky: { a: skyA, b: skyB, k: skyK }, cloud, isles };
}

const PINES = [[8, 164], [172, 296], [304, 424]], PINE_FOOT = 304; // the trunks end at row 303 of the sheet
const WATER = ["#0e3a6a", "#16548e", "#2274b4", "#3a98d4", "#8ad0f4", "#ffffff"].map(C);

// ---------------------------------------------------------------- the whole scene
// ---------------------------------------------------------------- earth: painted per pixel, in quiet tones that sit with
// the pack's blue stone and clouds; a mossy grass cap, rounded corners, a dark rim on open sides, soil darker with depth
const vnoise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const EARTH = ["#1c140f", "#261b14", "#30231a", "#3a2b1f", "#463425", "#5a4430"].map(C);
const RIM = C("#160e09");
const GRASS = ["#1d3a22", "#2b5230", "#3b6a3a", "#547f45", "#7c9d5a"].map(C);
const SILT = ["#4a4636", "#5e5a44", "#767052"].map(C);
const PEBBLE = ["#2a221c", "#4a4038", "#5e5448"].map(C);
// (stone comes from the pack)
const _BRICK = ["#1e2030", "#3c4462", "#4d5778", "#5e6a8e", "#7380a6", "#96a2c4"].map(C);
const _COPING = ["#262a3c", "#7c86aa", "#a6b0d0", "#d0d8ee"].map(C);

/** Grass thickness along the world x: 5 to 8 px, gently rolling. */
const grassDepth = (wx) => 5 + Math.round(vnoise(wx / 9, 0, 41) * 3);

function earthCell(S, M, cx, cy, T, pal) {
  const { earth: EARTH, grass: GRASS, rim: RIM } = pal;
  const at = (x, y) => M.cell(x, y), solidC = (ch) => ch === "#" || ch === "s" || ch === "r";
  const up = at(cx, cy - 1), sky = !solidC(up) && up !== "w" && up !== "|", wet = up === "w";
  const openL = !solidC(at(cx - 1, cy)), openR = !solidC(at(cx + 1, cy)), openD = !solidC(at(cx, cy + 1));
  const x0 = cx * T, y0 = cy * T;
  for (let j = 0; j < T; j++)
    for (let i = 0; i < T; i++) {
      const wx = x0 + i, wy = y0 + j;
      // rounded corners where the top meets an open side
      if (sky && ((openL && i + j < 2) || (openR && T - 1 - i + j < 2))) continue;
      const g = grassDepth(wx);
      let c;
      const sideGrass = sky && ((openL && i < 2) || (openR && i > T - 3)) && j < g + 2 + Math.round(hash(wx, cy, 3) * 3);
      if (sky && (j < g || sideGrass)) {
        // grass: a bright lip, a body with lighter flecks, a dark underside
        const fleck = vnoise(wx / 3, wy / 3, 7) + dith(wx, wy) * 0.35;
        c = j === 0 ? GRASS[4] : j === 1 ? GRASS[3] : j >= g - 1 && !sideGrass ? GRASS[1] : fleck > 0.8 ? GRASS[3] : GRASS[2];
        if (sideGrass && ((openL && i === 0) || (openR && i === T - 1))) c = GRASS[0];
      } else if (sky && j === g && hash(wx, 0, 9) > 0.35) c = GRASS[0]; // ragged roots under the turf
      else if (wet && j < 4) c = j === 0 ? SILT[2] : SILT[j < 2 ? 1 : 0];
      else {
        // earth: soft blotches and thin strata, quantised with an ordered dither, darker with depth
        const n = vnoise(wx / 7, wy / 5, 1) * 0.65 + vnoise(wx / 2.5, wy / 2.5, 2) * 0.35 + Math.sin(wy * 0.55 + vnoise(wx / 12, 0, 5) * 4) * 0.08;
        // darker the further below the town's floor (the spawn's level), the same in every column so cells never show seams
        const deep = Math.max(0, Math.min(1, (wy - M.spawn.y) / (T * 4)));
        const v = n * 2.2 + 1.9 - deep * 1.6 + (dith(wx, wy) - 0.5) * 0.7;
        c = EARTH[Math.max(1, Math.min(4, Math.round(v)))];
        // pebbles on an 8 px grid
        const gx = wx >> 3, gy = wy >> 3, h = hash(gx, gy, 77);
        if (h > 0.965) {
          const px = (gx << 3) + 2 + Math.floor(hash(gx, gy, 78) * 3), py = (gy << 3) + 2 + Math.floor(hash(gx, gy, 79) * 3);
          const dx = wx - px, dy = wy - py;
          if (dx >= 0 && dx < 3 && dy >= 0 && dy < 2) c = dy === 0 ? PEBBLE[dx === 0 ? 1 : 2] : PEBBLE[1];
          else if (dx >= -1 && dx <= 3 && dy >= -1 && dy <= 2 && !(Math.abs(dx - 1) === 2 && (dy === -1 || dy === 2))) c = PEBBLE[0];
        }
        if (sky && j === g + 1) c = EARTH[1];
      }
      // open sides: a dark rim, and just inside it a lit left face / shaded right face
      if ((openL && i === 0) || (openR && i === T - 1) || (openD && j === T - 1)) c = RIM;
      else if (!(sky && j < g) && openL && i === 1) c = EARTH[5];
      else if (!(sky && j < g) && openR && i === T - 2) c = EARTH[0];
      S.set(wx, wy, c);
    }
  // grass blades standing on the turf
  if (sky)
    for (let i = 0; i < T; i++) {
      const wx = x0 + i, h = hash(wx, cy, 11);
      if ((openL && i < 2) || (openR && i > T - 3)) continue;
      const tall = h > 0.82 ? 3 : h > 0.62 ? 2 : h > 0.4 ? 1 : 0;
      for (let k = 1; k <= tall; k++) S.set(wx, y0 - k, k === tall ? GRASS[4] : GRASS[3]);
    }
}


// ---------------------------------------------------------------- the ground: the Xianxia Pixel Pack's terrain sets (CC0)
// 32 px tiles, one per map cell: bamboo-forest earth for "#", blue stone for "s", cloud for "=". Each cell picks the top or
// body tile, and its left end, right end, lone or middle form from its neighbours; middles mix three variants at random.
const XT = { sets: null, px: null, w: 0 };
async function loadTerrain() {
  if (XT.px) return XT;
  const [meta, img] = await Promise.all([fetch("/xianxia/terrain.json").then((r) => r.json()), loadPixels("/xianxia/terrain.png")]);
  XT.sets = meta.sets;
  XT.tiles = Object.fromEntries(meta.tiles.map((t, i) => [t, i]));
  XT.px = img.px;
  XT.w = img.w;
  return XT;
}
// the atlas as this map wants it: shaded for its light (night, fire) when the theme says so
let TILEPX = null;
function tile(S, set, name, x, y) {
  const row = XT.sets.indexOf(set), col = XT.tiles[name];
  if (row < 0 || col === undefined) return;
  S.blit(TILEPX ?? XT.px, XT.w, col * 32, row * 32, 32, 32, x, y);
}
const middle = (base, cx, cy) => {
  const h = hash(cx, cy, 71);
  return `${base}_${h < 0.5 ? "M" : h < 0.75 ? "M2" : "M3"}`;
};
// How far a set's surface tile is raised so its solid ground meets the floor line the physics stands on: the bamboo
// earth has a 9 px fringe of dry grass above its soil, which would leave everything standing on grass tips.
const LIFT = { bamboo: 6, bluestone: 0, cloud: 0, redclay: 12 };
// the same for the floating ledges' tops: the red clay ones have a fringe of dry grass over their rock
const PLIFT = { bamboo: 5, bluestone: 0, cloud: 0, redclay: 11 };
/**
 * One solid cell from a set: the surface where open sky is above it, the body otherwise. An end tile (with its rounded,
 * see-through edge) only where the side is open air; against water, a waterfall or a bridge the middle tile, so no gap
 * shows between the earth and the water.
 */
function groundCell(S, M, set, cx, cy, T) {
  const at = (x, y) => M.cell(x, y), closed = (ch) => ch === "#" || ch === "s" || ch === "r" || ch === "w" || ch === "|" || ch === "b" || ch === "l";
  const up = at(cx, cy - 1), surface = up === "." || up === "=" || up === "k";
  const L = !closed(at(cx - 1, cy)), R = !closed(at(cx + 1, cy));
  const pick = (base) => (L && R ? `${base}_S` : L ? `${base}_L` : R ? `${base}_R` : middle(base, cx, cy));
  if (surface && LIFT[set]) {
    // the body fills the cell, the surface sits on it raised: its grass stands above the floor, over the props' feet
    tile(S, set, pick("ground_body"), cx * T, cy * T);
    tile(S, set, pick("ground_top"), cx * T, cy * T - LIFT[set]);
  } else tile(S, set, pick(surface ? "ground_top" : "ground_body"), cx * T, cy * T);
}
/** A floating platform from a set (cloud for "=", the map's own for "k"): its top on the cell, its underside below. */
function cloudPlatform(S, M, cx, cy, T, set = "cloud", ch = "=") {
  const L = M.cell(cx - 1, cy) !== ch, R = M.cell(cx + 1, cy) !== ch;
  const end = L && R ? "S" : L ? "L" : R ? "R" : null;
  const lift = PLIFT[set] ?? 0;
  if (M.cell(cx, cy + 1) === ".") tile(S, set, `platform_under_${end ?? "M"}`, cx * T, (cy + 1) * T - lift);
  tile(S, set, end ? `platform_top_${end}` : middle("platform_top", cx, cy), cx * T, cy * T - lift);
}

// ---------------------------------------------------------------- each map's look: sky, far scenery, earth, liquids, motes
// A map's def.theme overrides any of these; the starter town uses them as they are.
const DEFAULT_THEME = {
  sky: ["#24306a", "#3a58a0", "#6a94d0", "#a8c8ea", "#f2dcc4"], // top to horizon
  isles: true, // the little floating isles far away
  clouds: true,
  cloud: ["#ffffff", "#eef4ff"],
  // pictures high in the sky [name, x, y, { half (default true), tint, k }]: the palaces of the heavens
  heaven: [["bg_xianxia_far_03_00", 40, 70], ["bg_xianxia_far_03_02", 520, 20], ["bg_xianxia_far_04_00", 1020, 60], ["bg_xianxia_far_04_01", 1620, 30]],
  mountains: { tint: null, k: 0 }, // the misty peaks (Crisisworks), tinted towards `tint` by k; or { ridge: [far, near] } colours
  earth: ["#1c140f", "#261b14", "#30231a", "#3a2b1f", "#463425", "#5a4430"],
  grass: ["#1d3a22", "#2b5230", "#3b6a3a", "#547f45", "#7c9d5a"],
  rim: "#160e09",
  liquid: "water", // or "lava"
  platform: "bluestone", // the set the "k" ledges are drawn from
  dockWater: true, // water painted behind a bridge's planks (a bridge on the water); false: a pier above it
  motes: "petals", // what drifts in the air: petals, leaves, spores, embers, souls
};
const LAVA = ["#3a0604", "#7a1206", "#c02a0c", "#f05a14", "#ffa63a", "#fff0a0"].map(C);
/** A picture shifted towards a colour (k 0..1) and darkened by d: night and fire tints for the far scenery. */
function tinted(img, tint, k, d = 0) {
  if (!tint || (!k && !d)) return img;
  const t = C(tint), tr = t & 255, tg = (t >>> 8) & 255, tb = (t >>> 16) & 255, px = new Uint32Array(img.px.length);
  for (let i = 0; i < px.length; i++) {
    const c = img.px[i];
    if (!(c >>> 24)) continue;
    const f = 1 - d, r = ((c & 255) * (1 - k) + tr * k) * f, g = (((c >>> 8) & 255) * (1 - k) + tg * k) * f, b = (((c >>> 16) & 255) * (1 - k) + tb * k) * f;
    px[i] = ((c >>> 24) << 24 | (b << 16) | (g << 8) | r) >>> 0;
  }
  return { w: img.w, h: img.h, px };
}
/** A far range of jagged peaks in two colours (back, front), for maps with no misty mountains: the abyss's black crags. */
function ridge(w, h, back, front) {
  const B = new Buf(w, h), b = C(back), f = C(front);
  const line = (y0, amp, seed, c) => {
    for (let x = 0; x < w; x++) {
      const n = vnoise(x / 60, 0, seed) * 0.6 + vnoise(x / 17, 0, seed + 1) * 0.3 + vnoise(x / 5, 0, seed + 2) * 0.1;
      const top = Math.round(y0 - n * amp);
      for (let y = top; y < h; y++) B.set(x, y, c);
    }
  };
  line(h * 0.75, h * 0.7, 3, b);
  line(h * 0.95, h * 0.45, 9, f);
  return B;
}

export async function buildScene(M) {
  const th = { ...DEFAULT_THEME, ...(M.def.theme ?? {}) };
  const pal = { earth: th.earth.map(C), grass: th.grass.map(C), rim: C(th.rim) };
  const XB = (n) => loadPixels(`/xianxia/bg/${n}.png`);
  const [ts, rf, mt0, pn, , palace, tower, ...sky] = await Promise.all([
    loadPixels(M.def.terrain ?? "/maps/tiles/terrain.png"), loadPixels(M.def.roof ?? "/maps/tiles/roof.png"), loadPixels(M.def.mountains ?? "/maps/tiles/mountains.png"),
    loadPixels(M.def.pines ?? "/maps/tiles/pines.png"), loadTerrain(),
    XB("bg_xianxia_mid_03_01"), XB("bg_xianxia_mid_04_07"),
    ...th.heaven.map(([n]) => XB(n)),
  ]);
  const tt = th.tiles;
  TILEPX = tt ? tinted({ w: XT.w, h: XT.px.length / XT.w, px: XT.px }, tt.tint, tt.k ?? 0, tt.d ?? 0).px : null;
  const mt = th.mountains.ridge ? ridge(1400, 320, ...th.mountains.ridge) : tinted(mt0, th.mountains.tint, th.mountains.k ?? 0, th.mountains.dark ?? 0);
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
    else if (kind === "pine") {
      // Crisisworks' Asian mountain pines, at half their size: still four times a person's height
      const [a, b] = PINES[(o?.v ?? 0) % PINES.length];
      S.blit(pn.px, pn.w, a, 0, b - a, PINE_FOOT, Math.round(x * T - (b - a) / 2), row * T - PINE_FOOT + 2);
    }
    else if (kind === "temple") {
      // the golden palace (Xianxia Pixel Pack), on its own marble base, in the middle of the terrace
      const cx = Math.round((x + (o?.w ?? 13) / 2) * T);
      S.blit(palace.px, palace.w, 0, 0, palace.w, palace.h, cx - (palace.w >> 1), row * T - palace.h);
    } else if (kind === "xx") {
      // a piece of scenery from the Xianxia Pixel Pack, shrunk by o.s, standing on the floor at x (its middle); o.f mirrors
      // it, o.dy sinks it into the ground (or lifts it, negative), o.tint/o.k/o.d shade it for the map's light
      const img = tinted(shrunk(await loadPixels(`/xianxia/bg/${o.n}.png`), o.s ?? 1), o.tint, o.k ?? 0, o.d ?? 0);
      // stand it on its lowest drawn pixel, not on the bottom of its picture: many have empty rows under them
      let foot = img.h - 1;
      while (foot > 0 && !img.px.subarray(foot * img.w, (foot + 1) * img.w).some((c) => c >>> 24 > 128)) foot--;
      // ...and at x put its foot (a tree's trunk, a lantern's post), not the middle of its picture: a leaning pine's
      // trunk is far from the middle, which left trees hanging off ledges. The foot: the drawn pixels of its lowest rows.
      let sum = 0, n = 0;
      for (let y = Math.max(0, foot - 5); y <= foot; y++)
        for (let i = 0; i < img.w; i++) if (img.px[y * img.w + i] >>> 24 > 128) (sum += i), n++;
      const fx = n ? sum / n : img.w / 2, ax = o.f ? img.w - 1 - fx : fx;
      S.blit(img.px, img.w, 0, 0, img.w, img.h, Math.round(x * T - ax), row * T - foot + 1 + (o.dy ?? 0), !!o.f);
    } else if (kind === "pagoda") S.blit(tower.px, tower.w, 0, 0, tower.w, tower.h, Math.round(x * T) - (tower.w >> 1), row * T - tower.h);
    else if (PROPS[kind]) PROPS[kind](S, Math.round(x * T), row * T, o ?? {}, roofs);
  }
  const water = [], falls = [];
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const ch = at(cx, cy), x = cx * T, y = cy * T;
      if (ch === "#") earthCell(S, M, cx, cy, T, pal);
      else if (ch === "s") groundCell(S, M, "bluestone", cx, cy, T);
      else if (ch === "r") groundCell(S, M, "redclay", cx, cy, T);
      else if (ch === "=") cloudPlatform(S, M, cx, cy, T);
      else if (ch === "k") cloudPlatform(S, M, cx, cy, T, th.platform, "k");
      else if (ch === "b") {
        bridgeCell(S, x, y, at(cx - 1, cy) !== "b", at(cx + 1, cy) !== "b");
        // (a pier standing over the water, th.dockWater false: nothing behind its planks but the air)
        if (at(cx, cy + 1) === "w" && th.dockWater !== false) water.push([cx, cy, true]);
      } else if (ch === "w" || ch === "l") water.push([cx, cy, at(cx, cy - 1) !== ch && at(cx, cy - 1) !== "b"]);
      else if (ch === "|") falls.push([cx, cy]);
    }
  for (const w of water) w[3] = surf(w[0], w[1]);
  // tall flowering plants from the sheet: two tiles high
  for (const [c, r, x, row] of M.def.deco ?? []) (sub(c, r - 1, Math.round(x * T), row * T - 32), sub(c, r, Math.round(x * T), row * T - 16));

  const LW = 640, LH = Math.ceil(SH / 2), far = layers(LW, LH, th);
  const heaven = new Buf(2200, 220);
  th.heaven.forEach(([, x, y, o = {}], i) => {
    const img = tinted(o.half === false ? sky[i] : halve(sky[i]), o.tint, o.k ?? 0, o.d ?? 0);
    heaven.blit(img.px, img.w, 0, 0, img.w, img.h, x, y);
  });
  const LIQ = th.liquid === "lava" ? LAVA : WATER;
  // the mist on the peaks is see-through; a map with a moon behind them makes it solid, so the moon doesn't show through
  // the mist in stripes
  const mtCut = th.mountains.solid ? 8 : 128, mtDrop = th.mountains.drop ?? 0;
  // the mountains' feet sit a little above the town's floor line, their peaks well up the sky
  const mtOff = mt.h - SH + 40;
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
          // far away, nearest first: floating isles, then the misty mountains (Crisisworks), then drifting cloud, then sky
          const ix = (((Math.floor((camX * 0.25 + sx) / 2)) % LW) + LW) % LW, iy = Math.floor((sy + camY * 0.15 - 30) / 2);
          c = iy >= 0 && iy < LH ? far.isles.px[iy * LW + ix] : 0;
          if (!c) {
            const mx = (((Math.floor(camX * 0.15) + sx) % mt.w) + mt.w) % mt.w, my = sy + Math.floor(camY * 0.1) + mtOff - mtDrop;
            const v = my >= 0 && my < mt.h ? mt.px[my * mt.w + mx] : 0;
            if (v >>> 24 > mtCut) c = v | 0xff000000;
          }
          if (!c) {
            // the heavens (Xianxia Pixel Pack): high up, slower than the mountains
            const hx = (((Math.floor(camX * 0.07) + sx) % heaven.w) + heaven.w) % heaven.w, hy = sy + Math.floor(camY * 0.05) - 10;
            c = hy >= 0 && hy < heaven.h ? heaven.px[hy * heaven.w + hx] : 0;
          }
          if (!c) {
            const cx = (((Math.floor((camX * 0.08 + sx) / 2) + Math.floor(t * 2)) % LW) + LW) % LW, cy = Math.floor((sy + camY * 0.05) / 2);
            c = cy >= 0 && cy < LH ? far.cloud.px[cy * LW + cx] : 0;
          }
          if (!c) c = dith(wx >> 1, hy) < K[hy] ? Bk[hy] : A[hy];
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
    for (const [cx, cy, top, sr] of water) {
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const wx = cx * T + x, wy = cy * T + y, depth = (cy - sr) * T + y;
          // shallow light near the top fading to deep blue, dithered between bands, thin ripples drifting
          const band = depth / 18, d = dith(wx, wy);
          let k = 4 - Math.min(3, Math.floor(band + d * 0.9));
          if (top && y < 2) k = Math.sin(wx * 0.3 - t * 4) > 0.2 ? 5 : 4;
          if (Math.abs(Math.sin(wx * 0.07 + Math.sin(wy * 0.2 + t) * 2 - t * 1.5)) < 0.04 && depth > 4) k = Math.min(5, k + 1);
          if (hash(wx, wy, Math.floor(t * 4)) > 0.997) k = 5;
          put(wx, wy, LIQ[k]);
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
          put(wx, wy, LIQ[k]);
        }
    }
  }
  // lights painted over the scene: lanterns' warm pools, and any "glow" the map places (lava, spirit fire, rune circles)
  const glows = M.def.props.filter((p) => p[0] === "glow").map(([, x, row, o = {}]) => ({ x: x * T, y: row * T - (o.h ?? 0), r: o.r ?? 40, c: o.c ?? "#ffb84a", a: o.a ?? 0.3, f: o.f ?? 1 }));
  // a pool's depth counts from its own surface, whatever row it lies at
  function surf(cx, cy) {
    let y = cy;
    while (y > 0 && (at(cx, y - 1) === "w" || at(cx, y - 1) === "l" || at(cx, y - 1) === "b")) y--;
    return y;
  }
  return { paint, lanterns, glows, theme: th };
}
