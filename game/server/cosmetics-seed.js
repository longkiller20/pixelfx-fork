// The Y Các a database starts with: every fashion item of the old game (public/thoi-trang/<kind>/<idx>.png, the kinds in
// shared/thoi-trang.js), each named by its kind and number ("Tóc #12") at its kind's default price, the first few of the
// base kinds (hair, shirt, trousers, eyes, face) free (picked when a character is made); and the basic flying sword.
// Rows already in the database are left alone, so an admin's names and prices stick; a new picture dropped in the folder
// becomes a new row at the next start.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.js";
import { KINDS, itemName, BASIC_SWORD } from "../shared/thoi-trang.js";

export { BASIC_SWORD };
const DIR = join(ROOT, "public", "thoi-trang");

/** The idx numbers there are pictures of, for one kind, in order. */
export function fashionIdx(kind) {
  const d = join(DIR, kind);
  if (!existsSync(d)) return [];
  return readdirSync(d).map((f) => /^(\d+)\.png$/.exec(f)).filter(Boolean).map((m) => Number(m[1])).filter((i) => i > 0).sort((a, b) => a - b);
}

/** [{ kind, g, idx, name, price, starter }] for every picture there is. */
export function fashionSeed() {
  const out = [];
  for (const K of KINDS) {
    const list = fashionIdx(K.key);
    list.forEach((idx, i) => {
      const starter = i < (K.starters ?? 0);
      out.push({ kind: K.key, g: "a", idx, name: itemName(K.key, idx), price: starter ? 0 : K.price, starter });
    });
  }
  return out;
}

export const SWORDS_SEED = [{ kind: "sword", g: "a", idx: BASIC_SWORD, name: "Thanh Vân Kiếm", price: 0, starter: true }];
