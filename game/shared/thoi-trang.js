// Thời trang: the characters' look, from the old game. One chibi figure, 45 x 48 pixels, dressed in layers; every layer is
// a whole 45 x 48 picture (some 50 x 50), bottom left on the bottom left, so they stack straight on each other. The
// pictures are public/thoi-trang/<kind>/<idx>.png; a second frame of the same (wings beating, a pet's step, a shirt's
// sway) is public/thoi-trang/<kind>/load/<idx>.png where there is one. The figure everyone has (what idx 0 means: a
// plain shirt and shorts, the bare face, the eyes, the default hair for their gender) is public/thoi-trang/goc/.
// Shared by the server (what can be bought and worn), the browser (drawing: public/js/avatar.js) and the admin.

/**
 * The kinds, in the order they are drawn (back to front). name: as the game says it; price: the default in the shop
 * (the admin's cosmetics table is what counts); base: idx 0 is a picture everyone wears (else 0 is nothing); lift:
 * pixels to raise it (pets and the halo stand in front of the feet in the old pictures; here, on them); back: pixels
 * behind the figure (a pet at its owner's heels, not over them); bob: whether it
 * moves with the chest on the breathing frame (trousers and a halo on the ground stay); starters: how many are free.
 */
export const KINDS = [
  { key: "canh", name: "Cánh", price: 3000, bob: 1 },
  { key: "haoquang", name: "Hào quang", price: 5000, bob: 0, lift: 4 },
  { key: "quan", name: "Quần", price: 400, bob: 0, base: true, starters: 8 },
  { key: "ao", name: "Áo", price: 500, bob: 1, base: true, starters: 8 },
  { key: "khuonmat", name: "Khuôn mặt", price: 300, bob: 1, base: true, starters: 4 },
  { key: "mat", name: "Mắt", price: 200, bob: 1, base: true, starters: 8 },
  { key: "toc", name: "Tóc", price: 500, bob: 1, base: true, starters: 10 },
  { key: "kinh", name: "Kính", price: 400, bob: 1 },
  { key: "matna", name: "Mặt nạ", price: 800, bob: 1 },
  { key: "non", name: "Nón", price: 600, bob: 1 },
  { key: "docamtay", name: "Đồ cầm tay", price: 800, bob: 1 },
  { key: "thucung", name: "Thú cưng", price: 4000, bob: 1, lift: 7, back: 8 },
];
export const KIND_KEYS = KINDS.map((k) => k.key);
export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
/** Everything that can be worn, with the flying sword (its own pictures: public/phi-kiem). */
export const WEAR_KINDS = [...KIND_KEYS, "sword"];
export const KIND_NAME = { ...Object.fromEntries(KINDS.map((k) => [k.key, k.name])), sword: "Phi kiếm" };
/** What can be taken off to nothing (the rest go back to the figure's own: idx 0). */
export const isBase = (kind) => !!KIND[kind]?.base;

/** The flying sword everyone rides once flight opens (public/phi-kiem/0-thanhvankiem/). */
export const BASIC_SWORD = 0;

/** A look as the server keeps it: { g, canh, ..., thucung, sword }, every kind a whole number (0: the figure's own / nothing). */
export function cleanLook(look) {
  const out = { g: look?.g === "f" ? "f" : "m" };
  for (const k of KIND_KEYS) {
    const v = Number(look?.[k] ?? 0);
    out[k] = Number.isInteger(v) && v >= 0 && v < 65536 ? v : 0;
  }
  out.sword = Number.isInteger(Number(look?.sword)) ? Number(look.sword) : BASIC_SWORD;
  return out;
}
/** The idx numbers making a name: "Tóc #12". */
export const itemName = (kind, idx) => `${KIND_NAME[kind] ?? kind} #${idx}`;
