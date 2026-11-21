// Nhân vật: what a player looks like is one whole character, bought as a whole in the Y Các (no hair, robe or hat apart).
// Each is a rigged pixelfx figure, src/fx/nhanvat/<key>.js (copied into public/hieu-ung by tools/hieu-ung.mjs): its
// pixels, and the rig that moves them (the hair and the hem sway, the legs step, the arms swing and strike, the eyes
// blink). A new character is a new file there and a new line here; its price and whether it is sold are the admin's
// (the cosmetics table, kind "skin", idx as below). The other thing to buy is the flying sword (public/phi-kiem).
// Shared by the server (what can be bought and worn), the browser (public/js/avatar.js) and the admin.

/**
 * The characters, by idx (cosmetics.idx, characters.skin). g: who can wear it (m, f, or a: anyone); price: the default
 * in the shop; starter: free, and what a new character of that gender is.
 */
export const SKINS = [
  { idx: 1, key: "kiem-khach", fx: "nhanvat/kiem-khach", name: "Bạch Y Kiếm Khách", g: "m", price: 0, starter: true },
  { idx: 2, key: "tien-tu", fx: "nhanvat/tien-tu", name: "Tử Y Tiên Tử", g: "f", price: 0, starter: true },
];
export const SKIN = Object.fromEntries(SKINS.map((s) => [s.idx, s]));
/** What a character of gender g is when nothing else is picked (characters.skin 0). */
export const defaultSkin = (g) => (SKINS.find((s) => s.starter && s.g === g) ?? SKINS.find((s) => s.starter) ?? SKINS[0]).idx;
/** The idx a look is drawn with: its own if there is such a character, else its gender's first. */
export const skinOf = (look) => (SKIN[look?.skin] ? look.skin : defaultSkin(look?.g === "f" ? "f" : "m"));

/** The kinds sold in the Y Các, each worn in the characters column of the same name. */
export const KIND_KEYS = ["skin"];
export const WEAR_KINDS = ["skin", "sword"];
export const KIND_NAME = { skin: "Nhân vật", sword: "Phi kiếm" };

/** The flying sword everyone rides once flight opens (public/phi-kiem/0-thanhvankiem/). */
export const BASIC_SWORD = 0;

/** A look as the server keeps it: { g, skin, sword }. */
export function cleanLook(look) {
  const g = look?.g === "f" ? "f" : "m";
  return { g, skin: skinOf({ g, skin: Number(look?.skin) }), sword: Number.isInteger(Number(look?.sword)) ? Number(look.sword) : BASIC_SWORD };
}
