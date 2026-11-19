// What the monsters look like. Players are drawn by avatar.js.
import { TARGET_SPRITE, WHITE } from "/hieu-ung/core/index.js";

// ---- the straw dummy
const DUMMY_PX = [];
for (let r = 0; r < TARGET_SPRITE.h; r++)
  for (let x = 0; x < TARGET_SPRITE.w; x++) {
    const c = TARGET_SPRITE.data[r * TARGET_SPRITE.w + x];
    if (c) DUMMY_PX.push([x - TARGET_SPRITE.ax, r - TARGET_SPRITE.h, c]);
  }
export function drawDummy(p, sway, flash) {
  for (const [x, y, c] of DUMMY_PX) p.px(x + Math.round(((-y - 6) / 46) * sway), y, flash ? WHITE : c);
}
