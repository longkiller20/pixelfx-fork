// How each công pháp fights, one by one (what they are: shared/cong-phap.js; how they look: public/js/cong-phap.js).
// Every art gets the world `w`, the caster `p`, and `c`: { t (now), dir (1 right, -1 left), ax, ay (aim), to (the spot it
// was dragged to, or null), aim (how far it may be dragged), atk (the caster's attack as they cast) }. It sends "art" events for the browsers to draw
// ({ e: "art", id, a, ph (the phase), x, y, f, ... }) and deals its damage on the world's clock (w.at).
import { PLAYER_R, MONSTERS, ARTS } from "../shared/balance.js";
import { fits, zoneLanding } from "../shared/physics.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const R = Math.round;

/** Everyone hostile to p within r of (x, y) (r counts their body too). */
const near = (w, p, x, y, r) => w.targetsOf(p).filter((e) => Math.hypot(e.x - x, e.y - y) <= r + PLAYER_R);
/** Whether e stands on the ground (players and walking monsters; flying monsters and players in the air don't). */
const grounded = (e) => (e.kind === "p" ? !!e.ground && !e.flying : !MONSTERS[e.type]?.fly);
/** A straw dummy is planted in the ground: hit, never moved. */
const planted = (e) => e.kind === "m" && MONSTERS[e.type]?.style === "none";
/** Something with a body that falls (players, walking monsters): thrown up by vy. */
const toss = (e, vy) => {
  if (planted(e)) return;
  if (e.kind === "p" ? !e.flying : !MONSTERS[e.type]?.fly) (e.vy = Math.min(e.vy ?? 0, -vy)), (e.ground = false);
};
/** Moved sideways by dx, never into a wall. */
function shove(w, e, dx) {
  if (planted(e)) return;
  if (e.kind === "m" && MONSTERS[e.type]?.fly) return w.move(e, dx, 0);
  const s = Math.sign(dx);
  for (let d = 0; d < Math.abs(dx); d += 2) {
    if (!fits(e.x + s * 2, e.y, w.map)) break;
    e.x += s * 2;
  }
}
const show = (w, p, a, ph, x, y, f, more = {}) => w.ev({ e: "art", id: p.id, a, ph, x: R(x), y: R(y), f, ...more });

export const CAST = {
  /**
   * Phi Kiếm: the weapon in hand flies out, runs through up to three enemies (each one it passes takes less), and at the
   * end of its reach (or a wall) turns and flies back to the hand, cutting again whoever is in its way.
   */
  phikiem(w, p, c) {
    w.bolts.push({
      id: w.newId(), owner: p, art: "phikiem", x: p.x + c.ax * 16, y: p.y + c.ay * 16, vx: c.ax * 460, vy: c.ay * 460, left: 260, r: 12, atk: c.atk, mult: 1.3,
      pierce: 3, falloff: 0.7, back: true, hit: new Set(),
    });
  },

  /**
   * Lôi Ấn Trận: a lightning seal is cut into the ground where it is dragged (or ahead); it charges, then three bolts fall
   * on it one after another; the last numbs whoever it strikes.
   */
  loian(w, p, c) {
    const art = "loian";
    let x = clamp(p.x + c.dir * ARTS.loian.aimDist, 20, w.map.w - 20), y = p.y;
    if (c.to) [x, y] = w.zoneSpot(p, c.to, c.aim);
    else y = zoneLanding(w.map, x, p.y - 30);
    show(w, p, art, "seal", x, y, c.dir);
    // the strokes of lightning/lightning-strike: 0.76, 1.04 and 1.26 s after the seal
    [[0.76, 0.75], [1.04, 0.55], [1.26, 0.6, true]].forEach(([at, mult, numb]) =>
      w.at(c.t + at, () => {
        if (p.gone) return;
        for (const e of near(w, p, x, y, 56)) {
          if (numb) e.slowUntil = w.t + 2.5;
          w.damage(p, c.atk, e, mult);
        }
      }));
  },

  /**
   * Địa Chấn Cước: a stomp, and the shock runs along the ground: five stone spikes burst up one after another, each a
   * stride further, following the ground's rise and fall and stopping at a wall. Whoever stands on the ground over a
   * spike is thrown into the air and slowed; anyone in the air is untouched. Each enemy is hit once.
   */
  dia_chan_cuoc(w, p, c) {
    const art = "dia_chan_cuoc";
    p.busyUntil = c.t + 0.35;
    show(w, p, art, "stomp", p.x, p.y, c.dir);
    const hit = new Set();
    let x = p.x, y = p.y;
    for (let i = 0; i < 5; i++) {
      const nx = x + c.dir * (i === 0 ? 56 : 46);
      if (nx < 20 || nx > w.map.w - 20 || !fits(nx, y - 2, w.map)) break;
      const ny = zoneLanding(w.map, nx, y - 30);
      if (Math.abs(ny - y) > 40) break; // a cliff or a drop: the shock stops at the edge
      (x = nx), (y = ny);
      const sx = x, sy = y, at = c.t + 0.12 + i * 0.13;
      w.at(at, () => !p.gone && show(w, p, art, "spike", sx, sy, c.dir, { i }));
      // nature/earth-spike rams up 0.34 s in
      w.at(at + 0.34, () => {
        if (p.gone) return;
        for (const e of w.targetsOf(p)) {
          if (hit.has(e) || !grounded(e) || Math.abs(e.x - sx) > 30 + PLAYER_R || Math.abs(e.y - sy) > 40) continue;
          hit.add(e);
          toss(e, 330);
          e.slowUntil = w.t + 1.5;
          w.damage(p, c.atk, e, 1.7);
        }
      });
    }
  },

  /**
   * Tam Tuyệt Kiếm: three forms, stepping forward with each, the caster planted until it ends: a cut, a crossing double
   * cut (two hits), and a two-handed cleave into the ground that throws the enemy back.
   */
  tam_tuyet_kiem(w, p, c) {
    const art = "tam_tuyet_kiem", dir = c.dir;
    p.busyUntil = p.rootUntil = c.t + 1.5;
    p.face = dir;
    show(w, p, art, "combo", p.x, p.y, dir);
    const step = (px) => w.at(c.t + px[0], () => !p.gone && !p.dead && shove(w, p, dir * px[1]));
    step([0.5, 10]);
    step([1.04, 10]);
    // the hits of melee/sword-slash (0.06), melee/double-slash (+0.06, +0.16) and melee/heavy-cleave (+0.335)
    const cut = (at, range, arc, mult, last) =>
      w.at(c.t + at, () => {
        if (p.gone || p.dead) return;
        const cs = Math.cos(arc / 2);
        for (const e of w.targetsOf(p)) {
          const dx = e.x - p.x, dy = e.y - 26 - (p.y - 26), d = Math.hypot(dx, dy);
          if (d > range + PLAYER_R || (d > 12 && (dx * dir) / d < cs)) continue;
          if (last) {
            shove(w, e, dir * 40);
            toss(e, 200);
          }
          w.damage(p, c.atk, e, mult);
        }
        if (last) show(w, p, art, "crack", p.x + dir * 40, p.y, dir);
      });
    cut(0.06, 70, 1.9, 0.8);
    cut(0.56, 74, 1.9, 0.55);
    cut(0.66, 74, 1.9, 0.55);
    cut(1.375, 92, 2.1, 1.9, true);
  },

  /**
   * Lưu Tinh Hỏa Vũ: a rain of six meteors on the spot it is dragged to (or ahead), falling over two seconds at spread-out
   * points around it; each blasts where it lands, and the crater burns three more times.
   */
  luu_tinh_hoa_vu(w, p, c) {
    const art = "luu_tinh_hoa_vu";
    let cx = clamp(p.x + c.dir * ARTS.luu_tinh_hoa_vu.aimDist, 20, w.map.w - 20), cy = p.y;
    if (c.to) [cx, cy] = w.zoneSpot(p, c.to, c.aim);
    else cy = zoneLanding(w.map, cx, p.y - 30);
    // spread over the area: a shuffled row of offsets, a little jitter on each
    const offs = [-84, 36, -24, 92, -56, 8].map((o) => o + (Math.random() * 16 - 8));
    offs.forEach((o, i) => {
      const x = clamp(cx + o, 20, w.map.w - 20), y = zoneLanding(w.map, x, cy - 40), at = c.t + i * 0.32;
      w.at(at, () => !p.gone && show(w, p, art, "meteor", x, y, c.dir, { i }));
      // fire/meteor strikes the ground 0.62 s in; then the crater burns
      [[0.62, 48, 0.65], [1.12, 36, 0.15], [1.62, 36, 0.15], [2.12, 36, 0.15]].forEach(([d, r, mult]) =>
        w.at(at + d, () => {
          if (p.gone) return;
          for (const e of near(w, p, x, y - 10, r)) w.damage(p, c.atk, e, mult);
        }));
    });
  },

  /**
   * Diệt Thế Thần Bạo: the caster stands still gathering everything they have for 1.6 s, the power pulling enemies around
   * towards the blast point; then it goes off before them: crushing at its heart, weaker towards the edge, throwing
   * everyone out and up. If the caster falls first, it fizzles.
   */
  diet_the_than_bao(w, p, c) {
    const art = "diet_the_than_bao", dir = c.dir, CHARGE = 1.6, R0 = 240;
    p.busyUntil = p.rootUntil = c.t + CHARGE + 0.15;
    p.face = dir;
    show(w, p, art, "charge", p.x, p.y, dir);
    const spot = () => {
      const x = clamp(p.x + dir * 120, 20, w.map.w - 20);
      return [x, zoneLanding(w.map, x, p.y - 30)];
    };
    for (let k = 0.2; k < CHARGE; k += 0.2)
      w.at(c.t + k, () => {
        if (p.gone || p.dead) return;
        const [bx, by] = spot();
        for (const e of near(w, p, bx, by, 260)) if (Math.abs(e.x - bx) > 10) shove(w, e, Math.sign(bx - e.x) * 7);
      });
    w.at(c.t + CHARGE, () => {
      if (p.gone) return;
      if (p.dead) return show(w, p, art, "fizzle", p.x, p.y, dir);
      const [bx, by] = spot();
      show(w, p, art, "boom", bx, by, dir);
      for (const e of near(w, p, bx, by - 20, R0)) {
        const k = clamp(1 - Math.hypot(e.x - bx, e.y - by) / (R0 + PLAYER_R), 0, 1);
        shove(w, e, (Math.sign(e.x - bx) || dir) * (30 + 50 * k));
        toss(e, 120 + 260 * k);
        e.slowUntil = w.t + 2;
        w.damage(p, c.atk, e, 1.2 + 2.4 * k);
      }
    });
  },
};

/**
 * A flying Phi Kiếm, each tick (the world's stepBolts calls this for bolts that pierce): it passes through enemies,
 * weakening, and once out of reach, out of enemies to pierce, or into a wall, turns back to its owner's hand.
 * Returns false when it is gone.
 */
export function stepReturning(w, b, DT) {
  if (b.returning) {
    const o = b.owner, dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
    if (d < 22 || o.dead) return false;
    const v = 520;
    (b.vx = (dx / d) * v), (b.vy = (dy / d) * v);
  }
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.left -= Math.hypot(b.vx, b.vy) * DT;
  for (const e of w.targetsOf(b.owner)) {
    if (b.hit.has(e) || Math.hypot(e.x - b.x, e.y - b.y) > b.r + PLAYER_R) continue;
    b.hit.add(e);
    w.damage(b.owner, b.atk, e, b.mult);
    b.mult *= b.falloff;
    if (!b.returning && --b.pierce <= 0) turn(b);
  }
  if (!b.returning && (b.left <= 0 || w.map.solid(Math.floor(b.x / w.map.T), Math.floor((b.y - 30) / w.map.T)) || b.x < 0 || b.x > w.map.w)) turn(b);
  // flying back it never stays out long (an owner who warped away)
  if (b.returning) b.back += DT;
  return !(b.returning && b.back > 3);
}
function turn(b) {
  b.returning = true;
  b.hit = new Set();
  b.back = 0;
}
