// The rig of a world boss (src/fx/boss/*.js). A boss is one picture whose pixels are each marked with the part of the
// body they belong to; a pose (computed from what it is doing, no canned frames) says how far each part moves. The
// moves are blended into one smooth field over the whole picture (each part's pull fading into its neighbours' over a
// few pixels), and the picture is drawn backwards through it: every pixel on screen asks which pixel of the picture
// lands there. So however the parts move, the figure never tears and never shows a hole.
//
// The parts (the letters in `lab`):
//   1..9  a serpent's head and neck: sways, rears, strikes; it moves most at the head, not at all where the neck joins
//   H     the head, horns and face: thrown back in a roar
//   h     the hair: streams and flares
//   u     the chest and shoulders: breathes
//   a b   the arms (left, right in the picture): claws raised, thrust
//   k     the cloth at the waist: sways, more toward its hem
//   T     the coiled tail: a wave runs along it, stronger toward its ends
// The pictures face the viewer; the ground is the bottom row, (0, 0) is `fx` along it.
import { hex } from "../../core/index.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const outQuart = (u) => 1 - Math.pow(1 - clamp01(u), 4);

/** The strike's timeline (s): heads drawn back, thrown out (the blow lands at `hit`), held, back. Keep shared/boss.js in step. */
export const SLAM = { windup: 0.55, hit: 0.66, hold: 0.95, end: 1.45 };
/** The roar: it rears up, the counter-blow goes off at `hit`. */
export const ROAR = { hit: 0.9, end: 1.8 };

const PAD = 18; // how far (px) a part may move beyond the picture's edge
const BLUR = 2; // how many pixels a part's pull fades into its neighbours' over (box radius, three passes)

/**
 * Read a boss's data: { w, h, fx, al, pal, px, lab, heads: { "1": [x, y], ... } (each serpent's eye), roots: { "1": [x, y] }
 * (where its neck joins the body), face: [x, y] (the middle of the face), shoulders: [[x, y], [x, y]], waist: y }.
 * Precomputes, for every place on a padded grid, how much each motion pulls it.
 */
export function makeBoss(d) {
  const pal = d.pal.map(hex), W = d.w, H = d.h, GW = W + PAD * 2, GH = H + PAD * 2, N = GW * GH;
  const color = new Array(N).fill(null), part = new Array(W * H).fill(".");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = d.px[y][x];
      if (ch === ".") continue;
      color[(y + PAD) * GW + x + PAD] = pal[d.al.indexOf(ch)];
      part[y * W + x] = d.lab[y][x];
    }
  // the motions: each a vector the pose sets every frame
  const snakes = Object.keys(d.heads);
  const CH = ["up", "head", "hair", "a", "b", "skirt", "tc", "ts", ...snakes.map((s) => "s" + s)];
  const C = CH.length, at = Object.fromEntries(CH.map((c, i) => [c, i]));
  // how much each pixel of the picture follows each motion
  const raw = new Float32Array(N * C), solid = new Float32Array(N);
  // a serpent moves most at its head: the distance along its own pixels from its eye, against the farthest
  const along = {};
  for (const s of snakes) {
    const dist = new Map(), q = [[d.heads[s][0], d.heads[s][1]]];
    dist.set(q[0][1] * W + q[0][0], 0);
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i], g = dist.get(y * W + x);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || part[ny * W + nx] !== s || dist.has(ny * W + nx)) continue;
        dist.set(ny * W + nx, g + 1);
        q.push([nx, ny]);
      }
    }
    let far = 1;
    for (const g of dist.values()) far = Math.max(far, g);
    along[s] = (x, y) => {
      const g = dist.get(y * W + x);
      return g === undefined ? 0.6 : Math.pow(1 - g / far, 1.4);
    };
  }
  const [fx0, fy0] = d.face, [[ax, ay], [bx, by]] = d.shoulders, TW = (2 * Math.PI) / 64;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = part[y * W + x];
      if (k === ".") continue;
      const i = (y + PAD) * GW + x + PAD, r = (c, v) => (raw[i * C + at[c]] = v);
      solid[i] = 1;
      if (k !== "T") r("up", k === "k" ? clamp01(1 - (y - d.waist) / 40) : 1);
      if (k === "H") r("head", 1);
      if (k === "h") {
        const out = clamp01(Math.hypot(x - fx0, y - fy0) / 45);
        r("head", 0.7 * (1 - out)), r("hair", out);
      }
      if (k === "a") r("a", clamp01(Math.hypot(x - ax, y - ay) / 34));
      if (k === "b") r("b", clamp01(Math.hypot(x - bx, y - by) / 34));
      if (k === "k") r("skirt", clamp01((y - d.waist) / 40));
      if (k === "T" || k === "k") {
        const amp = Math.pow(clamp01((Math.abs(x - d.fx) - 12) / 90), 1.2) * (k === "k" ? 0.3 : 1);
        r("tc", amp * Math.cos(x * TW)), r("ts", amp * Math.sin(x * TW));
      }
      if (d.heads[k]) r("s" + k, along[k](x, y));
    }
  // blur every motion (and how solid each place is) so that parts fade into each other, then even out
  const tmp = new Float32Array(N);
  const blur = (a, stride, off) => {
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < GH; y++) {
        let s = 0;
        for (let x = 0; x <= BLUR && x < GW; x++) s += a[(y * GW + x) * stride + off];
        for (let x = 0; x < GW; x++) {
          tmp[y * GW + x] = s;
          const o = x - BLUR, n = x + BLUR + 1;
          if (o >= 0) s -= a[(y * GW + o) * stride + off];
          if (n < GW) s += a[(y * GW + n) * stride + off];
        }
      }
      for (let x = 0; x < GW; x++) {
        let s = 0;
        for (let y = 0; y <= BLUR && y < GH; y++) s += tmp[y * GW + x];
        for (let y = 0; y < GH; y++) {
          a[(y * GW + x) * stride + off] = s;
          const o = y - BLUR, n = y + BLUR + 1;
          if (o >= 0) s -= tmp[o * GW + x];
          if (n < GH) s += tmp[n * GW + x];
        }
      }
    }
  };
  for (let c = 0; c < C; c++) blur(raw, C, c);
  blur(solid, 1, 0);
  const pull = new Float32Array(N * C), known = new Uint8Array(N);
  for (let i = 0; i < N; i++)
    if (solid[i] > 1e-3) {
      known[i] = 1;
      for (let c = 0; c < C; c++) pull[i * C + c] = raw[i * C + c] / solid[i];
    }
  // past the figure's edge, each place moves as the nearest place that knows
  let edge = [];
  for (let i = 0; i < N; i++) if (known[i]) edge.push(i);
  while (edge.length) {
    const next = [];
    for (const i of edge) {
      const x = i % GW, y = (i / GW) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < GW - 1 ? i + 1 : -1, y > 0 ? i - GW : -1, y < GH - 1 ? i + GW : -1]) {
        if (j < 0 || known[j]) continue;
        known[j] = 1;
        for (let c = 0; c < C; c++) pull[j * C + c] = pull[i * C + c];
        next.push(j);
      }
    }
    edge = next;
  }
  // which way each serpent strikes: from where its neck joins out to its head
  const dirs = snakes.map((s) => {
    const [hx, hy] = d.heads[s], [rx, ry] = d.roots[s], l = Math.hypot(hx - rx, hy - ry) || 1;
    return [(hx - rx) / l, (hy - ry) / l];
  });
  // kept sparse: for each place, only the motions that move it
  const start = new Int32Array(N + 1), chans = [], weights = [];
  for (let i = 0; i < N; i++) {
    start[i] = chans.length;
    for (let c = 0; c < C; c++) if (Math.abs(pull[i * C + c]) > 0.002) chans.push(c), weights.push(pull[i * C + c]);
  }
  start[N] = chans.length;
  return { W, H, GW, GH, N, C, CH, color, start, chans: Uint8Array.from(chans), weights: Float32Array.from(weights), fx: d.fx, snakes, dirs, dx: new Float32Array(N), dy: new Float32Array(N) };
}

/**
 * A pose from a boss's state: { t, moving, slam: { age }, roar: { age }, dead: { age } }, for the boss F.
 * Returns the motion vectors ([dx, dy] px, by name) and the whole figure's shake.
 */
export function poseOf(st, F) {
  const t = st.t ?? 0, V = {}, n = F?.snakes.length ?? 7;
  const v = (k, x, y) => (V[k] = [x, y]);
  // breathing; the hair drifting; the cloth swaying; the serpents weaving each to its own rhythm
  v("up", 0, Math.sin(t * 2.1) > 0.3 ? 1 : 0);
  v("head", 0, 0);
  v("hair", Math.sin(t * 1.5) * 1.4, Math.sin(t * 1.1) * 0.6);
  v("a", 0, Math.sin(t * 2.1 + 0.6) * 0.8);
  v("b", 0, Math.sin(t * 2.1 + 1.4) * 0.8);
  v("skirt", Math.sin(t * 1.7) * 1.2, 0);
  let wave = 1.2, phase = t * 2.2;
  for (let i = 0; i < n; i++) v("s" + (i + 1), Math.cos(t * 1.8 + i * 1.7) * 2.6, Math.sin(t * 2.3 + i * 2.3) * 2);
  const P = { V, shakeX: 0, t };
  if (st.moving) {
    // slithering: a strong wave down the coils, the body rocking with it
    wave = 3;
    phase = t * 7;
    V.up[1] += Math.round(Math.sin(t * 7));
    V.skirt[0] += Math.sin(t * 7) * 1.5;
  }
  const dir = (i) => F?.dirs[i] ?? [i < 4 ? -1 : 1, 0];
  const sl = st.slam;
  if (sl && sl.age < SLAM.end) {
    // every head drawn back and up, then thrown out and down at once; the claws rake forward with them
    const a = sl.age;
    let k;
    if (a < SLAM.windup) k = -ease(a / SLAM.windup);
    else if (a < SLAM.hit) k = -1 + 2.2 * outQuart((a - SLAM.windup) / (SLAM.hit - SLAM.windup));
    else if (a < SLAM.hold) k = 1.2;
    else k = 1.2 * (1 - ease((a - SLAM.hold) / (SLAM.end - SLAM.hold)));
    for (let i = 0; i < n; i++) {
      const [ux, uy] = dir(i), S = V["s" + (i + 1)];
      S[0] += ux * 9 * k;
      S[1] += uy * 9 * k + (k > 0 ? 7 * k : 4 * k);
    }
    V.a[0] -= 3 * k, V.a[1] += 3 * Math.abs(k);
    V.b[0] += 3 * k, V.b[1] += 3 * Math.abs(k);
    V.head[1] += k > 0 ? 2 * k : -k;
    V.up[1] += k > 0 ? Math.round(2 * k) : 0;
    if (a > SLAM.hit && a < SLAM.hold) P.shakeX = Math.round(Math.sin(a * 90) * 1.2);
  }
  const ro = st.roar;
  if (ro && ro.age < ROAR.end) {
    // it rears up: the head thrown back, claws spread high, every serpent raised and splayed; then it all shakes
    const a = ro.age, up = a < ROAR.hit ? ease(a / ROAR.hit) : 1 - ease((a - ROAR.hit) / (ROAR.end - ROAR.hit));
    V.head[1] -= 3 * up;
    V.up[1] -= 2 * up;
    V.hair[1] -= 3 * up;
    V.a[0] -= 3 * up, V.a[1] -= 6 * up;
    V.b[0] += 3 * up, V.b[1] -= 6 * up;
    for (let i = 0; i < n; i++) {
      const [ux] = dir(i), S = V["s" + (i + 1)];
      S[0] += ux * 4 * up;
      S[1] -= 6 * up;
    }
    wave += 1.5 * up;
    if (a > ROAR.hit - 0.15 && a < ROAR.hit + 0.6) P.shakeX = Math.round(Math.sin(a * 80) * 2);
  }
  if (st.dead) {
    // it falls: the body slumps, every head droops to the ground, the coils go still
    const k = ease(Math.min(1, st.dead.age / 1.2));
    V.up[1] += 14 * k;
    V.head[1] += 4 * k;
    V.a[1] += 6 * k, V.b[1] += 6 * k;
    for (let i = 0; i < n; i++) {
      const [ux] = dir(i), S = V["s" + (i + 1)];
      S[0] = S[0] * (1 - k) + ux * 3 * k;
      S[1] = S[1] * (1 - k) + 18 * k;
    }
    wave *= 1 - k;
  }
  // the tail's wave, A sin(phase + c x), split into its two halves (see makeBoss)
  v("tc", 0, wave * Math.sin(phase));
  v("ts", 0, wave * Math.cos(phase));
  return P;
}

/** Draw a boss in a pose at the painter's origin (the middle of its base). tint: over every color (a hit's flash). */
export function drawBoss(p, F, P, tint = (c) => c) {
  const { GW, GH, N, C, CH, start, chans, weights, color, dx, dy } = F;
  const vx = new Float32Array(C), vy = new Float32Array(C);
  for (let c = 0; c < C; c++) [vx[c], vy[c]] = P.V[CH[c]] ?? [0, 0];
  // where each place on the grid moves to
  for (let i = 0; i < N; i++) {
    let sx = 0, sy = 0;
    for (let k = start[i], e = start[i + 1]; k < e; k++) {
      const w = weights[k], c = chans[k];
      sx += w * vx[c];
      sy += w * vy[c];
    }
    dx[i] = sx;
    dy[i] = sy;
  }
  // and backwards: for each place on screen, the place in the picture that lands there (a few steps of p = q - d(p))
  const ox = -F.fx - PAD + P.shakeX, oy = -F.H - PAD;
  for (let qy = 0; qy < GH; qy++)
    for (let qx = 0; qx < GW; qx++) {
      let px = qx, py = qy;
      for (let it = 0; it < 4; it++) {
        const j = Math.round(py) * GW + Math.round(px);
        if (j < 0 || j >= N) break;
        px = qx - dx[j];
        py = qy - dy[j];
      }
      const sx = Math.round(px), sy = Math.round(py);
      if (sx < 0 || sy < 0 || sx >= GW || sy >= GH) continue;
      const c = color[sy * GW + sx];
      if (c) p.px(qx + ox, qy + oy, tint(c));
    }
}

/** Poses to preview a boss with (pixelfx's render tool, the admin): t in seconds. */
export const ANIMS = {
  idle: (t) => ({ t }),
  walk: (t) => ({ t, moving: true }),
  slam: (t) => ({ t, slam: { age: t % 2 } }),
  roar: (t) => ({ t, roar: { age: t % 2.4 } }),
  dead: (t) => ({ t, dead: { age: Math.min(t, 1.5) } }),
};
