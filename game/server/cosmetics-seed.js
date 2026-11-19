// The wardrobe a fresh database starts with: only free things, 5 hair styles and 5 robes for each gender (chosen at
// creation), one weapon in hand and one flying sword. Their pictures are public/<kind>/<idx>-<name>/ (toc-nam, toc-nu,
// y-phuc-nam, y-phuc-nu, vu-khi, phi-kiem). Everything else (the old shop and the bảo vật) is gone, to be designed again
// one by one: a new thing is a new folder there plus a row an admin adds in the admin site. Rows already in the
// database are left alone, so an admin's changes stick; the migrations in db.js took the old items out of older ones.
export const COSMETICS_SEED = [
  { kind: "hair", g: "m", idx: 5, name: "Tử Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 8, name: "Huyền Vân Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 17, name: "Xích Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 21, name: "Lam Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 30, name: "Huyền Phát", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 14, name: "Xích Hoa Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 18, name: "Bạch Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 21, name: "Huyền Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 24, name: "Tử Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 34, name: "Xích Vân Kế", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 16, name: "Mộc Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 17, name: "Bạch Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 20, name: "Tử Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 21, name: "Lam Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 33, name: "Xích Bào", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 2, name: "Bạch Hoa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 21, name: "Xích Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 23, name: "Lục Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 25, name: "Bạch Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 31, name: "Bạch Vân Thường", price: 0, starter: true },
];

// the weapon in everyone's hand: the plain long sword (public/vu-khi/60-truongkiem/); for both genders ("a")
export const DEFAULT_WEAPON = 60;
export const WEAPONS_SEED = [{ kind: "weapon", g: "a", idx: DEFAULT_WEAPON, name: "Trường Kiếm", price: 0, starter: true }];

// the flying sword everyone rides once flight opens (fly.realm): Thanh Vân Kiếm (public/phi-kiem/0-thanhvankiem/)
export const BASIC_SWORD = 0;
export const SWORDS_SEED = [{ kind: "sword", g: "a", idx: BASIC_SWORD, name: "Thanh Vân Kiếm", price: 0, starter: true }];
