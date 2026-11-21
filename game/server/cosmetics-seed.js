// The Y Các a database starts with: every character there is (shared/nhan-vat.js; the free ones for their gender) and
// the basic flying sword. Rows already in the database are left alone, so an admin's names and prices stick; a character
// added to shared/nhan-vat.js becomes a new row at the next start.
import { SKINS, BASIC_SWORD } from "../shared/nhan-vat.js";

export { BASIC_SWORD };

/** [{ kind, g, idx, name, price, starter }] for every character. */
export const skinSeed = () => SKINS.map((s) => ({ kind: "skin", g: s.g, idx: s.idx, name: s.name, price: s.price, starter: !!s.starter }));

export const SWORDS_SEED = [{ kind: "sword", g: "a", idx: BASIC_SWORD, name: "Thanh Vân Kiếm", price: 0, starter: true }];
