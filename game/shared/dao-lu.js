// Đạo Lữ: two people of different gender become dao lu (a married pair). Shared by the server, the browser and the admin.
//  - Hảo cảm (affinity): one number per pair, 0..NEED, raised only by giving Hoa Hồng (ROSE) to a Đạo Hữu (a friend).
//    Every rose adds the setting daolu.rose_points; at NEED (100) one may propose.
//  - Cầu hôn (a proposal) names one of the RINGS; when it is accepted the one who proposed pays its price in spirit stones
//    and both wear the ring (a pair). The ring's buff counts for both, for good, while they are dao lu.
//  - Ly hôn (divorce): either may; the rings are gone and so is their buff; the affinity is back to 0.
// Names, prices (the items table) and buffs (the ring_buffs table) are the admin's; the looks are pixelfx (src/fx/love).

/** The rose (an item in the bag, bought in the Đạo Lữ panel). */
export const ROSE = "dl_hoa_hong";
/** Affinity needed to propose, and its most. */
export const NEED = 100;

/**
 * The three wedding rings, cheapest first. look: the pixelfx picture (love/ring's ring); buff: % more hp, atk, def, spd
 * for both while they are dao lu (the defaults; the ring_buffs table is what counts).
 */
export const RINGS = {
  dl_nhan_dong_tam: {
    tier: 1, look: "dongtam", name: "Đồng Tâm Giới", price: 5000, buff: { hp: 3, atk: 3, def: 3, spd: 0 },
    desc: "Nhẫn bạc khảm ngọc bích: hai người đồng lòng.",
  },
  dl_nhan_uyen_uong: {
    tier: 2, look: "uyenuong", name: "Uyên Ương Giới", price: 30000, buff: { hp: 6, atk: 6, def: 6, spd: 2 },
    desc: "Đôi nhẫn vàng lồng vào nhau, hồng ngọc hình trái tim: uyên ương không rời.",
  },
  dl_nhan_thien_duyen: {
    tier: 3, look: "thienduyen", name: "Thiên Duyên Giới", price: 120000, buff: { hp: 10, atk: 10, def: 10, spd: 5 },
    desc: "Nhẫn vàng hồng với kim cương tinh tú, sao nhỏ xoay quanh: duyên trời định.",
  },
};
export const RING_KEYS = Object.keys(RINGS);
export const STATS = ["hp", "atk", "def", "spd"];
export const STAT_NAME = { hp: "Sinh lực", atk: "Công", def: "Thủ", spd: "Tốc độ" };

/** The items to seed (names and prices an admin may change later). */
export const DL_ITEMS = [
  { key: ROSE, name: "Hoa Hồng", kind: "gift", price: 50, sort: 600, desc: "Tặng Đạo Hữu khác giới để tăng hảo cảm. Đủ 100 hảo cảm thì cầu hôn được." },
  ...RING_KEYS.map((k, i) => ({ key: k, name: RINGS[k].name, kind: "ring", price: RINGS[k].price, sort: 610 + i, desc: RINGS[k].desc })),
];

// ---- the live buffs (rebuilt by applyConfig from the ring_buffs table)
export const RING_BUFF = Object.fromEntries(RING_KEYS.map((k) => [k, { ...RINGS[k].buff }]));
/** Take the admin's buffs: rows [{ key, hp, atk, def, spd }]; a ring with no row keeps its default. */
export function setRingBuffs(rows) {
  for (const k of RING_KEYS) RING_BUFF[k] = { ...RINGS[k].buff };
  for (const r of rows ?? []) if (RING_BUFF[r.key]) RING_BUFF[r.key] = Object.fromEntries(STATS.map((s) => [s, Number(r[s]) || 0]));
}
/** The buff (in %) of the ring a dao lu wears, for one stat; 0 without a ring. */
export const ringPct = (ring, stat) => RING_BUFF[ring]?.[stat] ?? 0;
/** "+6% Sinh lực · +6% Công ..." */
export const buffText = (b) => STATS.filter((s) => b?.[s]).map((s) => `+${b[s]}% ${STAT_NAME[s]}`).join(" · ") || "không";
/** A ring's name and price as the admin set them (the items table), else the defaults. */
export const ringName = (k, items) => items?.[k]?.name ?? RINGS[k]?.name ?? k;
export const ringPrice = (k, items) => (items?.[k] ? Number(items[k].price) : RINGS[k]?.price ?? 0);
/** Two people may be dao lu only if their genders differ. */
export const pairOk = (g1, g2) => (g1 === "m" || g1 === "f") && (g2 === "m" || g2 === "f") && g1 !== g2;
