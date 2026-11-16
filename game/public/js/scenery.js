// The side-view town, drawn: Kenney's Pixel Platformer tiles (CC0) for the ground, planks, water and greenery, and the
// xianxia pieces (pagoda houses, the temple, the gate, stone lanterns, cherry trees, bamboo, the taiji dais) painted in code
// at the same pixel size. Everything is painted once at half the world's size (a tile is 18 px there, 36 in the world) and
// doubled on screen, so every pixel stays square and sharp. Behind it all, layers of mountains, floating isles and cloud
// slide past slower than the town.
import { hex, mix } from "/pixelfx/core/index.js";

const C = (h) => hex(h);
const FALL = ["#1a5a9a", "#2e8ad0", "#4ab4ee", "#9adcff", "#ffffff"].map((h) => C(h));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clear = 0;

class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c);
  }
}

const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

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

// ---------------------------------------------------------------- the palette of the hand-painted pieces
const P = {
  ink: C("#1d1626"), ink2: C("#2b2135"),
  stone: [C("#3e3a52"), C("#5a5674"), C("#7a7696"), C("#a29ec0"), C("#c8c4de")],
  wood: [C("#3a1e14"), C("#5a2e1c"), C("#7a4426"), C("#9a5e34")],
  red: [C("#5a1416"), C("#8a2024"), C("#b8302c"), C("#e04a3a")],
  gold: [C("#7a5214"), C("#b8801e"), C("#e8b438"), C("#ffe08a")],
  plaster: [C("#b8a890"), C("#d8ccb2"), C("#f0e6d0")],
  paper: [C("#c88a3a"), C("#f0b850"), C("#ffe2a0")],
  roofs: [
    [C("#1c2238"), C("#2c3656"), C("#3e4c78"), C("#5a6ca0")],
    [C("#163024"), C("#20483a"), C("#2e6650"), C("#4a8a6c")],
    [C("#3a1418"), C("#5a1e22"), C("#7c2a2c"), C("#a8443c")],
  ],
  pink: [C("#a03c6a"), C("#d76a9a"), C("#f38bb5"), C("#f7b0cc"), C("#ffd6e6")],
  bamboo: [C("#24461e"), C("#3a6a2a"), C("#5a9a3a"), C("#8ac85a")],
  bark: [C("#3a2418"), C("#5a3a26"), C("#7a5236")],
  cloth: [[C("#7a2026"), C("#c8483c"), C("#f0e0c8")], [C("#1e3a6a"), C("#3a6ab8"), C("#e8eef8")]],
  jade: [C("#0b2a1e"), C("#22a06a"), C("#5cf0a0"), C("#c8ffe0")],
};

// a curved tiled roof between x0 and x1 (eaves overhanging), its ridge at y, `h` px tall; tips curl up at the ends
function roof(B, x0, x1, y, h, R) {
  for (let j = 0; j < h; j++) {
    const k = j / Math.max(1, h - 1), inset = Math.round((1 - k) * (h * 0.9)), a = x0 + inset, b = x1 - inset;
    for (let x = a; x <= b; x++) {
      const c = j === 0 ? P.gold[2] : j === h - 1 ? R[0] : (x + (j & 1) * 2) % 4 === 0 ? R[1] : j < 2 ? R[3] : R[2];
      B.set(x, y + j, c);
    }
    B.set(a - 1, y + j, P.ink);
    B.set(b + 1, y + j, P.ink);
  }
  // the ridge, gold, and the upturned tips
  B.rect(x0 + Math.round(h * 0.9) - 1, y - 1, x1 - x0 - Math.round(h * 1.8) + 3, 1, P.ink);
  for (const [sx, dir] of [[x0, -1], [x1, 1]]) {
    B.set(sx + dir, y + h - 2, P.gold[2]);
    B.set(sx + dir * 2, y + h - 3, P.gold[3]);
    B.set(sx + dir * 2, y + h - 4, P.gold[2]);
  }
  B.rect(x0 - 1, y + h, x1 - x0 + 3, 1, P.ink);
}

function lattice(B, x, y, w, h, lit = true) {
  B.rect(x - 1, y - 1, w + 2, h + 2, P.wood[0]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) B.set(x + i, y + j, i % 3 === 1 || j % 3 === 1 ? P.wood[1] : lit ? P.paper[(i + j) % 5 === 0 ? 2 : 1] : P.plaster[0]);
}

const PROPS = {
  house(B, x, y, o = {}) {
    const w = (o.w ?? 6) * 18, R = P.roofs[o.style ?? 0], wallH = 30;
    // stone footing, plaster walls between red-brown posts, a beam
    B.rect(x, y - 3, w, 3, P.stone[1]);
    B.rect(x, y - 3, w, 1, P.stone[3]);
    B.rect(x + 2, y - 3 - wallH, w - 4, wallH, P.plaster[1]);
    for (let j = 0; j < wallH; j += 6) B.rect(x + 2, y - 3 - wallH + j, w - 4, 1, P.plaster[0]);
    for (let px = x + 2; px <= x + w - 5; px += 18) B.rect(px, y - 3 - wallH, 3, wallH, P.red[1]), B.rect(px, y - 3 - wallH, 1, wallH, P.red[2]);
    B.rect(x + w - 5, y - 3 - wallH, 3, wallH, P.red[1]);
    B.rect(x + 2, y - 3 - wallH, w - 4, 3, P.wood[1]);
    B.rect(x + 2, y - 3 - wallH, w - 4, 1, P.wood[3]);
    // the door in the middle, windows either side
    const dx = x + Math.round(w / 2) - 7;
    B.rect(dx - 1, y - 24, 16, 21, P.wood[0]);
    B.rect(dx, y - 23, 14, 20, P.wood[2]);
    B.rect(dx + 6, y - 23, 2, 20, P.wood[1]);
    B.set(dx + 4, y - 13, P.gold[3]);
    B.set(dx + 9, y - 13, P.gold[3]);
    B.rect(dx - 2, y - 26, 18, 2, P.red[2]);
    for (let wx = x + 9; wx + 10 < dx - 2; wx += 18) lattice(B, wx, y - 24, 9, 8);
    for (let wx = dx + 21; wx + 10 < x + w - 4; wx += 18) lattice(B, wx, y - 24, 9, 8);
    roof(B, x - 6, x + w + 5, y - 3 - wallH - 13, 13, R);
    // a red lantern hanging off the eaves
    B.rect(x + 4, y - 3 - wallH + 2, 1, 3, P.ink);
    B.rect(x + 3, y - 3 - wallH + 5, 3, 4, P.red[3]);
  },
  temple(B, x, y, o = {}) {
    const w = (o.w ?? 13) * 18, R = P.roofs[2];
    // a grand hall: red pillars, gold plaque, two roofs
    B.rect(x + 6, y - 46, w - 12, 46, P.plaster[1]);
    for (let j = 0; j < 46; j += 7) B.rect(x + 6, y - 46 + j, w - 12, 1, P.plaster[0]);
    for (let px = x + 8; px < x + w - 8; px += 22) B.rect(px, y - 46, 5, 46, P.red[1]), B.rect(px + 1, y - 46, 1, 46, P.red[3]), B.rect(px, y - 4, 5, 4, P.stone[2]);
    const cx = x + Math.round(w / 2);
    B.rect(cx - 13, y - 34, 26, 34, P.wood[0]);
    B.rect(cx - 12, y - 33, 24, 33, P.red[2]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) B.set(cx - 9 + i * 6, y - 28 + j * 6, P.gold[2]);
    B.rect(cx, y - 33, 1, 33, P.red[0]);
    for (let wx = x + 16; wx < cx - 22; wx += 22) lattice(B, wx, y - 36, 12, 16);
    for (let wx = cx + 20; wx < x + w - 26; wx += 22) lattice(B, wx, y - 36, 12, 16);
    roof(B, x - 8, x + w + 7, y - 46 - 16, 16, R);
    // the upper storey and its roof, a gold plaque between
    B.rect(cx - 30, y - 62 - 16, 60, 16, P.red[1]);
    B.rect(cx - 16, y - 62 - 13, 32, 9, P.gold[1]);
    B.rect(cx - 15, y - 62 - 12, 30, 7, P.gold[2]);
    for (let i = 0; i < 4; i++) B.rect(cx - 11 + i * 7, y - 62 - 10, 3, 3, P.red[0]);
    roof(B, cx - 44, cx + 44, y - 62 - 16 - 14, 14, R);
    // a gem on the ridge
    B.rect(cx - 1, y - 62 - 16 - 20, 3, 6, P.jade[2]);
    B.set(cx, y - 62 - 16 - 21, P.jade[3]);
  },
  pagoda(B, x, y) {
    const R = P.roofs[0];
    for (let tier = 0; tier < 3; tier++) {
      const w = 40 - tier * 9, h = 16, by = y - tier * (h + 9), cx = x;
      B.rect(cx - w / 2 + 3, by - h, w - 6, h, P.plaster[1]);
      B.rect(cx - w / 2 + 3, by - h, 2, h, P.red[1]);
      B.rect(cx + w / 2 - 5, by - h, 2, h, P.red[1]);
      lattice(B, cx - 3, by - h + 4, 6, 7);
      roof(B, cx - w / 2 - 4, cx + w / 2 + 3, by - h - 8, 8, R);
    }
    B.rect(x - 1, y - 3 * 25 - 14, 2, 12, P.gold[2]);
    B.disc(x, y - 3 * 25 - 15, 2, P.gold[3]);
  },
  gate(B, x, y) {
    // a paifang: two red pillars on stone feet, a beam, a gold plaque, a little roof
    for (const px of [x, x + 52]) {
      B.rect(px - 3, y - 6, 10, 6, P.stone[2]);
      B.rect(px - 3, y - 6, 10, 1, P.stone[4]);
      B.rect(px, y - 58, 5, 52, P.red[2]);
      B.rect(px, y - 58, 1, 52, P.red[3]);
      B.rect(px + 4, y - 58, 1, 52, P.red[0]);
    }
    B.rect(x - 4, y - 50, 65, 5, P.red[1]);
    B.rect(x - 4, y - 50, 65, 1, P.red[3]);
    B.rect(x + 18, y - 46, 21, 10, P.gold[1]);
    B.rect(x + 19, y - 45, 19, 8, P.ink2);
    for (let i = 0; i < 3; i++) B.rect(x + 22 + i * 6, y - 43, 3, 4, P.gold[3]);
    roof(B, x - 12, x + 68, y - 70, 12, P.roofs[1]);
  },
  lantern(B, x, y) {
    // a stone lantern: foot, post, the light box, a little roof, a knob
    B.rect(x - 5, y - 3, 11, 3, P.stone[1]);
    B.rect(x - 2, y - 14, 5, 11, P.stone[2]);
    B.rect(x - 2, y - 14, 1, 11, P.stone[3]);
    B.rect(x - 5, y - 16, 11, 2, P.stone[2]);
    B.rect(x - 4, y - 23, 9, 7, P.stone[1]);
    B.rect(x - 2, y - 22, 5, 5, P.paper[1]);
    B.rect(x - 1, y - 21, 3, 3, P.paper[2]);
    B.rect(x - 7, y - 25, 15, 2, P.stone[2]);
    B.rect(x - 5, y - 27, 11, 2, P.stone[3]);
    B.rect(x - 1, y - 29, 3, 2, P.stone[3]);
  },
  cherry(B, x, y) {
    // trunk and branches
    B.rect(x - 2, y - 26, 5, 26, P.bark[1]);
    B.rect(x - 2, y - 26, 1, 26, P.bark[2]);
    B.rect(x + 2, y - 26, 1, 26, P.bark[0]);
    for (let i = 0; i < 8; i++) (B.set(x - 3 - i, y - 22 - i, P.bark[1]), B.set(x + 3 + i, y - 24 - i, P.bark[1]));
    // the blossom: overlapping clouds of pink, dark under, light on top
    const blobs = [[-12, -34, 9], [0, -40, 11], [12, -34, 9], [-6, -28, 7], [8, -28, 7], [-18, -28, 6], [18, -29, 6]];
    for (const [bx, by, r] of blobs) B.disc(x + bx, y + by + 2, r, P.pink[0]);
    for (const [bx, by, r] of blobs) B.disc(x + bx, y + by, r, P.pink[2]);
    for (const [bx, by, r] of blobs) B.disc(x + bx - 2, y + by - 3, Math.max(2, r - 4), P.pink[3]);
    for (let i = 0; i < 26; i++) {
      const a = hash(x, i, 3) * 6.28, d = hash(x, i, 4) * 18;
      B.set(x + Math.cos(a) * d * 1.3, y - 34 + Math.sin(a) * d * 0.7, hash(x, i, 5) > 0.5 ? P.pink[4] : P.pink[1]);
    }
  },
  bamboo(B, x, y) {
    for (let s = 0; s < 4; s++) {
      const bx = x - 6 + s * 4, h = 44 + Math.round(hash(x, s) * 16);
      for (let j = 0; j < h; j++) {
        const knot = (j + s * 3) % 9 === 0;
        B.set(bx, y - j, knot ? P.bamboo[0] : P.bamboo[2]);
        B.set(bx + 1, y - j, knot ? P.bamboo[1] : P.bamboo[3]);
      }
      for (let l = 0; l < 4; l++) {
        const ly = y - h + 4 + l * 7, dir = (l + s) & 1 ? 1 : -1;
        for (let k = 0; k < 6; k++) B.set(bx + dir * (2 + k), ly + (k >> 1), k < 3 ? P.bamboo[2] : P.bamboo[1]);
      }
    }
  },
  taiji(B, x, y) {
    // the dais: three stone steps; the floating taiji is drawn live
    B.rect(x - 36, y - 4, 72, 4, P.stone[1]);
    B.rect(x - 36, y - 4, 72, 1, P.stone[3]);
    B.rect(x - 28, y - 8, 56, 4, P.stone[2]);
    B.rect(x - 28, y - 8, 56, 1, P.stone[4]);
    for (let i = -24; i <= 24; i += 8) B.set(x + i, y - 6, P.gold[2]);
  },
  well(B, x, y) {
    B.rect(x - 10, y - 10, 21, 10, P.stone[1]);
    B.rect(x - 10, y - 10, 21, 2, P.stone[3]);
    for (let i = 0; i < 21; i += 5) B.rect(x - 10 + i, y - 8, 1, 8, P.stone[0]);
    B.rect(x - 9, y - 30, 2, 20, P.wood[2]);
    B.rect(x + 8, y - 30, 2, 20, P.wood[2]);
    roof(B, x - 14, x + 14, y - 38, 7, P.roofs[1]);
    B.rect(x, y - 28, 1, 10, P.ink);
    B.rect(x - 2, y - 18, 5, 4, P.wood[3]);
  },
  stall(B, x, y, o = {}) {
    const w = (o.w ?? 3) * 18, [d, m, l] = P.cloth[o.style ?? 0];
    B.rect(x + 2, y - 30, 2, 30, P.wood[1]);
    B.rect(x + w - 4, y - 30, 2, 30, P.wood[1]);
    B.rect(x, y - 12, w, 3, P.wood[3]);
    B.rect(x + 2, y - 9, w - 4, 9, P.wood[1]);
    // goods: jars and bundles
    for (let i = 4; i < w - 6; i += 7) {
      B.rect(x + i, y - 17, 5, 5, i % 2 ? P.jade[1] : P.paper[0]);
      B.rect(x + i + 1, y - 18, 3, 1, P.ink2);
    }
    // the striped awning
    for (let j = 0; j < 8; j++) for (let i = -3; i < w + 3; i++) B.set(x + i, y - 38 + j, j === 7 ? d : Math.floor((i + 9) / 6) % 2 ? m : l);
    for (let i = -3; i < w + 3; i += 6) B.rect(x + i, y - 30, 3, 2, m);
  },
  spawnstone(B, x, y) {
    // a stele that brings travellers here: grey stone, a glowing jade rune
    B.rect(x - 10, y - 4, 21, 4, P.stone[1]);
    B.rect(x - 7, y - 34, 15, 30, P.stone[2]);
    B.rect(x - 7, y - 34, 2, 30, P.stone[3]);
    B.rect(x - 9, y - 37, 19, 3, P.stone[3]);
    B.rect(x - 2, y - 28, 5, 14, P.jade[1]);
    B.rect(x - 1, y - 27, 3, 12, P.jade[2]);
  },
};

// ---------------------------------------------------------------- the far scenery, layer by layer
function layers(w, h) {
  // the sky: a gradient in a few flat steps, blended with an ordered dither so it reads as pixels, not stripes
  const top = [C("#24306a"), C("#3a58a0"), C("#6a94d0"), C("#a8c8ea"), C("#f2dcc4")];
  const skyA = new Uint32Array(h), skyB = new Uint32Array(h), skyK = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const u = Math.min(0.999, y / (h * 0.78)), i = Math.floor(u * 4), k = u * 4 - i, step = Math.floor(k * 4) / 4;
    skyA[y] = mix(top[i], top[i + 1], step);
    skyB[y] = mix(top[i], top[i + 1], Math.min(1, step + 0.25));
    skyK[y] = (k - step) * 4;
  }
  const sky = { a: skyA, b: skyB, k: skyK };
  const mk = () => new Buf(w, h);
  // far peaks, pale; then isles floating; then nearer mountains wrapped in mist; then hills with pines
  const far = mk(), isles = mk(), mid = mk(), near = mk(), cloud = mk();
  const ridge = (B, base, amp, freq, seed, cols, snow) => {
    for (let x = 0; x < w; x++) {
      const v = Math.sin((x / w) * Math.PI * 2 * freq + seed) * 0.5 + Math.sin((x / w) * Math.PI * 2 * freq * 2.7 + seed * 2) * 0.3 + Math.sin((x / w) * Math.PI * 2 * freq * 6.1 + seed * 3) * 0.12;
      const top = Math.round(base - amp * (0.55 + 0.45 * v));
      for (let y = Math.max(0, top); y < h; y++) {
        const d = y - top;
        B.set(x, y, snow && d < 3 && v > 0.1 ? cols[2] : d < 1 ? cols[1] : cols[0]);
      }
    }
  };
  ridge(far, h * 0.62, h * 0.32, 3, 1.3, [C("#8a9ccc"), C("#b4c4e4"), C("#e8eefa")], true);
  ridge(mid, h * 0.74, h * 0.2, 5, 4.1, [C("#5a6ea8"), C("#7a8ec0"), C("#a0b4d8")], false);
  ridge(near, h * 0.84, h * 0.12, 9, 2.2, [C("#3a4c80"), C("#4a5e94"), C("#4a5e94")], false);
  // pines on the near hills
  for (let x = 6; x < w; x += 9 + Math.floor(hash(x, 1) * 9)) {
    let top = 0;
    while (top < h && !near.get(x, top)) top++;
    const th = 8 + Math.floor(hash(x, 2) * 8);
    for (let j = 0; j < th; j++) for (let i = -Math.floor(j / 2.2); i <= Math.floor(j / 2.2); i++) near.set(x + i, top - th + j + 2, C("#2e3e6c"));
  }
  // mist between the mountains: soft pale bands
  for (let y = Math.round(h * 0.66); y < h * 0.74; y++) for (let x = 0; x < w; x++) if (!mid.get(x, y) && hash(x >> 3, y, 7) > 0.35) mid.set(x, y, C("#c8d6ee"));
  // floating isles: rock hanging under grass, a tiny pagoda, a waterfall spilling off
  for (let n = 0; n < 4; n++) {
    const cx = Math.round((n + 0.3 + hash(n, 9) * 0.4) * (w / 4)), cy = Math.round(h * (0.22 + hash(n, 8) * 0.18)), r = 12 + Math.round(hash(n, 7) * 10);
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
  // clouds drifting
  for (let n = 0; n < 9; n++) {
    const cx = Math.round(hash(n, 11) * w), cy = Math.round(h * (0.08 + hash(n, 12) * 0.3)), s = 4 + Math.round(hash(n, 13) * 5);
    for (let k = 0; k < 4; k++) cloud.disc(cx + (k - 1.5) * s * 1.4, cy - (k % 2) * s * 0.5, s, k % 2 ? C("#ffffff") : C("#eef4ff"));
    for (let x = cx - s * 4; x < cx + s * 4; x++) for (let y = cy + s * 0.6; y < cy + s; y++) cloud.set(x, y, 0);
  }
  return { sky, list: [[cloud, 0.08, 0.05], [far, 0.12, 0.08], [isles, 0.2, 0.12], [mid, 0.3, 0.2], [near, 0.5, 0.35]] };
}

// ---------------------------------------------------------------- the whole scene
export async function buildScene(M) {
  const ts = await loadPixels(M.def.tileset), TS = M.def.tile, cols = M.cols, rows = M.rows, k = M.def.scale;
  const SW = cols * TS, SH = rows * TS, S = new Buf(SW, SH);
  const tile = (idx, cx, cy, flip = false) => {
    const tc = ts.w / TS, sx = (idx % tc) * TS, sy = Math.floor(idx / tc) * TS;
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        const c = ts.px[(sy + y) * ts.w + sx + (flip ? TS - 1 - x : x)];
        if (c >>> 24 > 128) S.set(cx * TS + x, cy * TS + y, c | 0xff000000);
      }
  };
  const at = (cx, cy) => M.cell(cx, cy);
  const solidCh = (ch) => ch === "#" || ch === "s";
  // props first: they stand behind the ground's front edge and the planks
  for (const [kind, x, row, o] of M.def.props) if (PROPS[kind]) PROPS[kind](S, Math.round(x * TS), row * TS, o);
  else if (kind === "sign") tile(85, Math.floor(x), row - 1);
  const water = [], falls = [];
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const ch = at(cx, cy);
      if (ch === "#") {
        const open = !solidCh(at(cx, cy - 1)), L = solidCh(at(cx - 1, cy)), R = solidCh(at(cx + 1, cy));
        if (open) tile(!L && !R ? 0 : !L ? 1 : !R ? 3 : 2, cx, cy);
        else tile(5, cx, cy);
      } else if (ch === "s") stoneTile(S, cx * TS, cy * TS, !solidCh(at(cx, cy - 1)), hash(cx, cy));
      else if (ch === "=") cloudTile(S, cx * TS, cy * TS, at(cx - 1, cy) !== "=", at(cx + 1, cy) !== "=", cx);
      else if (ch === "b") {
        bridgeTile(S, cx * TS, cy * TS, at(cx - 1, cy) !== "b", at(cx + 1, cy) !== "b");
        if (at(cx, cy + 1) === "w") water.push([cx, cy, true]);
      } else if (ch === "w") water.push([cx, cy, at(cx, cy - 1) !== "w" && at(cx, cy - 1) !== "b"]);
      else if (ch === "|") falls.push([cx, cy]);
    }
  for (const [idx, cx, cy] of M.def.tiles) tile(idx, cx, cy);

  // water tiles as pixels: the surface (33) and the body (73), the waterfall (74) and where it lands (54)
  const grab = (idx) => {
    const tc = ts.w / TS, sx = (idx % tc) * TS, sy = Math.floor(idx / tc) * TS, out = new Uint32Array(TS * TS);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) out[y * TS + x] = ts.px[(sy + y) * ts.w + sx + x];
    return out;
  };
  const WT = { top: grab(33), body: grab(73) };
  const LW = 640, LH = SH, far = layers(LW, LH);
  const lanterns = M.def.props.filter((p) => p[0] === "lantern").map(([, x, row]) => [x * TS * k, row * TS * k - 44]);
  const lights = M.def.props.filter((p) => p[0] === "house" || p[0] === "temple").map(([, x, row, o]) => [x * TS * k, row * TS * k, (o?.w ?? 6) * TS * k]);

  /** Paint the window (camX, camY, VW x VH world px) into out (a Uint32Array of VW x VH), at time t. */
  function paint(out, VW, VH, camX, camY, t) {
    const SPX = S.px;
    for (let sy = 0; sy < VH; sy++) {
      const wy = camY + sy, hy = wy >> 1, o = sy * VW, row = hy * SW, sr = Math.min(LH - 1, hy), skA = far.sky.a[sr], skB = far.sky.b[sr], skK = far.sky.k[sr];
      for (let sx = 0; sx < VW; sx++) {
        const hx = (camX + sx) >> 1;
        let c = hy < SH && hx < SW ? SPX[row + hx] : 0;
        if (!c) {
          // the far scenery, nearest layer first: each slides at its own pace, and wraps round
          c = BAYER[((hy & 3) << 2) | (((camX + sx) >> 1) & 3)] < skK ? skB : skA;
          for (let li = far.list.length - 1; li >= 0; li--) {
            const [L, px, py] = far.list[li], lx = (((Math.floor((camX * px + sx) / 2) + (li === 0 ? Math.floor(t * 2) : 0)) % LW) + LW) % LW;
            const ly = Math.floor((wy - camY * (1 - py) - 40 * (1 - py)) / 2);
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
    // water, alive: the surface rolls sideways, the body shimmers, falls pour down
    const x0 = Math.floor(camX / (TS * k)) - 1, x1 = Math.ceil((camX + VW) / (TS * k)) + 1, y0 = Math.floor(camY / (TS * k)) - 1, y1 = Math.ceil((camY + VH) / (TS * k)) + 1;
    const roll = Math.floor(t * 9);
    // water goes behind anything painted over it (a bridge's deck, a prop in front of a fall)
    const put = (wx, wy, c) => {
      const sx = wx - camX, sy = wy - camY;
      if (sx >= 0 && sy >= 0 && sx < VW && sy < VH && c >>> 24 > 128 && !SPX[(wy >> 1) * SW + (wx >> 1)]) out[sy * VW + sx] = c | 0xff000000;
    };
    for (const [cx, cy, top] of water) {
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      const src = top ? WT.top : WT.body;
      for (let y = 0; y < TS * k; y++)
        for (let x = 0; x < TS * k; x++) {
          const tx = x >> 1, ty = y >> 1;
          let c = src[ty * TS + ((tx + (top ? roll : 0)) % TS)];
          if (!top && Math.sin((cx * TS + tx) * 0.5 + ty * 0.3 - t * 3) > 0.92) c = mix(c, 0xffffffff, 0.35);
          if (hash(cx * TS + tx, cy * TS + ty, Math.floor(t * 4)) > 0.994) c = 0xffffffff;
          put(cx * TS * k + x, cy * TS * k + y, c);
        }
    }
    // falls: one sheet of water across all its columns, streaks pouring down, darker at its edges, foaming where it lands
    for (const [cx, cy] of falls) {
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      const L = at(cx - 1, cy) !== "|", R = at(cx + 1, cy) !== "|", foot = at(cx, cy + 1) !== "|";
      for (let ty = 0; ty < TS; ty++)
        for (let tx = 0; tx < TS; tx++) {
          const gx = cx * TS + tx, gy = cy * TS + ty, s = hash(gx, Math.floor((gy - t * 70) / 6), 9);
          let c = s > 0.8 ? FALL[4] : s > 0.55 ? FALL[3] : s > 0.2 ? FALL[2] : FALL[1];
          if ((L && tx < 2) || (R && tx > TS - 3)) c = tx === 0 || tx === TS - 1 ? FALL[0] : FALL[1];
          if (foot && ty > TS - 7 && hash(gx, gy, Math.floor(t * 10)) > 0.35) c = FALL[4];
          for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) put(gx * k + i, gy * k + j, c);
        }
    }
  }
  return { paint, lanterns, lights };
}

function stoneTile(B, x, y, top, r) {
  const s = P.stone;
  for (let j = 0; j < 18; j++)
    for (let i = 0; i < 18; i++) {
      const row = Math.floor(j / 6), off = row & 1 ? 9 : 0, mortar = j % 6 === 5 || (i + off) % 18 === 0;
      let c = mortar ? s[0] : (i + off) % 18 === 1 || j % 6 === 0 ? s[2] : s[1];
      if (!mortar && hash(x + i, y + j) > 0.93) c = s[0];
      B.set(x + i, y + j, c);
    }
  if (top) {
    B.rect(x, y, 18, 2, s[3]);
    B.rect(x, y, 18, 1, s[4]);
    B.rect(x, y + 2, 18, 1, P.gold[1]);
  }
}

// a floating cloud you can stand on: a flat white top, billows under it, a jade glow at the core
function cloudTile(B, x, y, leftEnd, rightEnd, seed) {
  const W = C("#ffffff"), L = C("#eaf2ff"), M = C("#c6d6f2"), D = C("#94a8d8");
  for (let i = 0; i < 18; i++) {
    const edge = (leftEnd && i < 4) || (rightEnd && i > 13), d = leftEnd ? 4 - i : rightEnd ? i - 13 : 0, cut = edge ? Math.max(0, d) : 0;
    const depth = 7 + Math.round(Math.sin(i * 0.9 + seed * 2.1) * 1.5) - cut;
    for (let j = cut; j < depth; j++) B.set(x + i, y + j, j === cut ? W : j < 3 ? L : j < depth - 2 ? M : D);
  }
  for (let i = 3; i < 15; i += 6) B.set(x + i + (seed % 3), y + 4, C("#9ff8d8"));
}

function bridgeTile(B, x, y, leftEnd, rightEnd) {
  // planks across, a rope rail above on posts
  for (let i = 0; i < 18; i++) {
    const c = i % 6 === 5 ? P.wood[0] : i % 6 === 0 ? P.wood[3] : P.wood[2];
    B.rect(x + i, y, 1, 5, c);
    B.set(x + i, y + 5, P.wood[0]);
  }
  for (let i = 0; i < 18; i++) B.set(x + i, y - 9 + Math.round(Math.sin((i / 18) * Math.PI) * 2), P.bark[2]);
  if (leftEnd || rightEnd) {
    const px = leftEnd ? x : x + 16;
    B.rect(px, y - 12, 2, 12, P.wood[1]);
    B.rect(px, y - 13, 2, 1, P.gold[2]);
  }
  B.rect(x + 8, y - 10, 1, 10, P.bark[1]);
}
