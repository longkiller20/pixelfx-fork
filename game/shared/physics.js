// Side-view movement, shared: the server moves everyone with it, and the browser runs the very same steps to move you the
// moment you press a key. Bodies are { x, y (the feet), vx, vy, ground, dropUntil }, in world px; y grows downward.
export const PHYS = {
  G: 1500, // gravity, px/s²
  JUMP: 610, // jump speed: about 124 px high, a little over three tiles
  FALL: 900, // fastest fall
  RUN: 1.6, // walking speed = the class's spd × this
  HW: 9, // half the body's width
  HH: 56, // the body's height, for bumping heads
  JUMP_BUFFER: 0.15, // a jump pressed this long before landing (or tapped between two server ticks) still happens
  STEP: 1 / 120, // longest step: nothing moves more than 8 px at once, so nothing tunnels through a tile
};

/**
 * Move a body for dt seconds. input: { dx (-1..1), jump (held), down (held) }, speed in px/s, M a map from mapInfo(), t the
 * current time (for dropping through planks).
 */
export function stepBody(b, input, speed, dt, M, t = 0) {
  for (let left = dt; left > 1e-6; left -= PHYS.STEP) step(b, input, speed, Math.min(PHYS.STEP, left), M, t);
}

function step(b, inp, speed, dt, M, t) {
  const T = M.T, HW = PHYS.HW;
  // down + jump on a plank: fall through it for a moment
  if (inp.down && inp.jump && b.ground === "plank") {
    b.dropUntil = t + 0.25;
    b.ground = false;
  } else if (inp.jump && b.ground) {
    b.vy = -PHYS.JUMP;
    b.ground = false;
  }
  // across: stop flush against walls
  const nx = Math.max(HW, Math.min(M.w - HW, b.x + inp.dx * speed * dt));
  if (nx !== b.x) {
    const edge = nx > b.x ? nx + HW : nx - HW, cx = Math.floor(edge / T);
    let blocked = false;
    for (let cy = Math.floor((b.y - PHYS.HH) / T); cy <= Math.floor((b.y - 1) / T); cy++) if (M.solid(cx, cy)) blocked = true;
    if (!blocked) b.x = nx;
    else b.x = nx > b.x ? cx * T - HW - 0.01 : (cx + 1) * T + HW + 0.01;
  }
  // up and down
  b.vy = Math.min(PHYS.FALL, b.vy + PHYS.G * dt);
  const ny = b.y + b.vy * dt, c0 = Math.floor((b.x - HW + 1) / T), c1 = Math.floor((b.x + HW - 1) / T);
  if (b.vy > 0) {
    // landing: crossing the top of a solid tile, or of a plank we were above and aren't dropping through
    const row = Math.floor(ny / T), top = row * T;
    let land = null;
    if (b.y <= top + 0.01 && ny >= top)
      for (let cx = c0; cx <= c1; cx++) {
        if (M.solid(cx, row)) land = "solid";
        else if (!land && M.plank(cx, row) && !(b.dropUntil > t)) land = "plank";
      }
    if (land) {
      b.y = top;
      b.vy = 0;
      b.ground = land;
    } else {
      b.y = ny;
      b.ground = false;
    }
  } else {
    // rising: heads bump solid tiles, but go up through planks
    const head = ny - PHYS.HH, row = Math.floor(head / T);
    let bump = false;
    for (let cx = c0; cx <= c1; cx++) if (M.solid(cx, row)) bump = true;
    if (bump && b.vy < 0) {
      b.y = (row + 1) * T + PHYS.HH;
      b.vy = 0;
    } else b.y = ny;
    if (b.vy === 0) b.ground = groundUnder(b, M, c0, c1, t);
  }
}

function groundUnder(b, M, c0, c1, t) {
  if (b.y % M.T > 0.01 && M.T - (b.y % M.T) > 0.01) return false;
  const row = Math.round(b.y / M.T);
  for (let cx = c0; cx <= c1; cx++) if (M.solid(cx, row)) return "solid";
  for (let cx = c0; cx <= c1; cx++) if (M.plank(cx, row) && !(b.dropUntil > t)) return "plank";
  return false;
}

/** Is there open space for a body standing at (x, y)? */
export function fits(x, y, M) {
  const T = M.T;
  for (let cy = Math.floor((y - PHYS.HH) / T); cy <= Math.floor((y - 1) / T); cy++)
    for (let cx = Math.floor((x - PHYS.HW) / T); cx <= Math.floor((x + PHYS.HW) / T); cx++) if (M.solid(cx, cy)) return false;
  return true;
}
