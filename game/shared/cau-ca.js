// Câu Cá: fishing at Vọng Nguyệt Hồ (shared/maps/cauca.js), a map of its own reached from the menu (▦ Thêm → Câu Cá).
// What the server and the browser both need: the rods, the baits, the fish, where on the map one fishes, how a fish is
// picked, and the reeling game's rules (the server runs it; the browser runs the same rules to draw it without lag).
//
// How a cast goes (the server decides every step, server/world.js):
//   1. Standing still at a fishing spot with a rod and a bait chosen, the player casts: the float lands on the water.
//   2. A wait (shorter with better bait), with a few nibbles that mean nothing: striking on a nibble pulls in an empty hook.
//   3. The bite: the float goes under. Strike within the window (longer with a better rod) or the fish takes the bait.
//      The bait is spent when the fish bites (struck in time or not); a cast reeled in before any bite costs nothing.
//   4. Reeling: a fish darts up and down a bar; holding raises the catch zone, letting go it sinks. While the zone is on
//      the fish the line comes in, otherwise it slips out. Full: landed, into the bag, with its weight in the Ngư Lục.
//      Empty: it got away.
// Rods are bought once (an item kept in the bag, kind "rod"); baits are bought by the handful (kind "bait"); fish are
// items too (kind "fish", their price is what the Ngư Cụ pays for one). Names and prices are in the items table, so an
// admin changes them in the admin's Vật phẩm tab; the numbers that make a rod or bait what it is are here.

/** The fishing map. It is copied into KHU_COUNT Khu (a world each, numbered, all alike), each for at most KHU_CAP people,
 * each with PLACES places on its pier. */
export const FISH_MAP = "cauca";
export const KHU_COUNT = 30, KHU_CAP = 20, PLACES = 8;
/** A Khu's world key, and back. */
export const khuKey = (n) => `cc:${n}`;
export const khuOf = (key) => (typeof key === "string" && key.startsWith("cc:") ? Number(key.slice(3)) : null);
/** How busy a Khu looks: 0 roomy (green), 1 filling (yellow), 2 nearly or quite full (red). */
export const khuLevel = (n) => (n >= 16 ? 2 : n >= 9 ? 1 : 0);
export const KHU_COLORS = ["#4ade80", "#facc15", "#f87171"];

/**
 * Rods. tier 1..4. bar: the catch zone's height on the reeling bar (0..1); power: how fast the line comes in on the fish;
 * luck: tips the catch towards rarer fish; hook: extra seconds to strike after a bite; reach: how far it casts (cells).
 * (Names and prices: the items table, an admin's.)
 */
export const RODS = {
  cc_can_truc: { name: "Trúc Can", tier: 1, price: 300, bar: 0.26, power: 1, luck: 0, hook: 0, reach: 3, look: "truc",
    desc: "Cần trúc của ngư phủ, dây gai, lưỡi đồng. Đủ để câu cá đồng ở Bến Thuyền." },
  cc_can_dong: { name: "Thanh Đồng Can", tier: 2, price: 3000, bar: 0.3, power: 1.15, luck: 0.2, hook: 0.15, reach: 3.5, look: "dong",
    desc: "Cần đồng xanh khắc vân sóng, vùng kéo rộng hơn, dễ gặp cá quý hơn." },
  cc_can_ngoc: { name: "Bích Ngọc Can", tier: 3, price: 15000, bar: 0.34, power: 1.3, luck: 0.45, hook: 0.3, reach: 4, look: "ngoc",
    desc: "Cần ngọc bích ngâm linh tuyền trăm năm, cá linh khó thoát." },
  cc_can_long: { name: "Kim Long Can", tier: 4, price: 60000, bar: 0.4, power: 1.5, luck: 0.8, hook: 0.45, reach: 4.5, look: "long",
    desc: "Cần vàng chạm rồng, dây tơ băng tằm. Cá tiên cũng khó thoát." },
};

/** Baits, spent one a bite. tier 1..4; speed: how much sooner a fish comes; luck: as a rod's. Tiên fish want tier 3 or up. */
export const BAITS = {
  cc_moi_giun: { name: "Giun Đất", tier: 1, price: 3, speed: 1, luck: 0, look: "giun", desc: "Giun đất béo ở bờ hồ. Cá thường rất thích." },
  cc_moi_tom: { name: "Tôm Tép", tier: 2, price: 10, speed: 1.2, luck: 0.12, look: "tom", desc: "Tôm tép tươi, cá to hay đớp." },
  cc_moi_linh: { name: "Linh Mễ Hoàn", tier: 3, price: 35, speed: 1.35, luck: 0.3, look: "linh", desc: "Viên mồi vo từ linh mễ, linh khí dẫn dụ linh ngư. Cá tiên bắt đầu để ý." },
  cc_moi_tien: { name: "Tiên Đào Nhị", tier: 4, price: 120, speed: 1.6, luck: 0.6, look: "tien", desc: "Nhị hoa đào tiên ngâm mật. Cá tiên khó cưỡng, cá to hơn." },
};

/** How rare: 0 junk, 1 Phàm, 2 Lương, 3 Linh, 4 Bảo, 5 Tiên. Colours for names and frames. */
export const RARITY = [
  { name: "Tạp vật", color: "#9a948a", w: 9 },
  { name: "Phàm", color: "#d8d4c8", w: 52 },
  { name: "Lương", color: "#6ad07a", w: 26 },
  { name: "Linh", color: "#6aa8ff", w: 9 },
  { name: "Bảo", color: "#c08aff", w: 2.4 },
  { name: "Tiên", color: "#ffd060", w: 0.35 },
];

/**
 * The catch. rarity (above), rate: how often it bites, against the others' rates (an admin changes it: the fish_rates
 * table, read into RATES), kg: its weight range, price: what the Ngư Cụ pays for one, fight: how wildly it darts (0..1),
 * look: how pixelfx draws it (fishing/fish). stones: a sunken chest, opened on the spot for linh thạch (not kept).
 */
export const FISH = {
  cc_ung_rach: { name: "Ủng Rách", rarity: 0, rate: 4, kg: [0.4, 1.2], price: 1, fight: 0.05, look: "ung", desc: "Chiếc ủng ai đánh rơi. Chẳng đáng mấy đồng." },
  cc_rong: { name: "Rong Thủy Linh", rarity: 0, rate: 4, kg: [0.1, 0.6], price: 2, fight: 0.05, look: "rong", desc: "Bó rong dưới đáy hồ, phơi khô bán được vài đồng." },
  cc_ca_ro: { name: "Cá Rô Đồng", rarity: 1, rate: 18, kg: [0.1, 0.5], price: 4, fight: 0.15, look: "ro", desc: "Cá rô đồng vảy sẫm, gai lưng sắc." },
  cc_ca_diec: { name: "Cá Diếc", rarity: 1, rate: 18, kg: [0.2, 0.9], price: 5, fight: 0.18, look: "diec", desc: "Cá diếc bạc, thịt ngọt." },
  cc_ca_chep: { name: "Cá Chép", rarity: 2, rate: 12, kg: [1, 6], price: 14, fight: 0.32, look: "chep", desc: "Cá chép vàng đồng, khoẻ và dai sức." },
  cc_ca_loc: { name: "Cá Lóc", rarity: 2, rate: 10, kg: [1, 5], price: 16, fight: 0.4, look: "loc", desc: "Cá lóc đầu rắn, giật rất mạnh." },
  cc_ca_tre: { name: "Cá Trê", rarity: 2, rate: 10, kg: [0.8, 4], price: 15, fight: 0.36, look: "tre", desc: "Cá trê râu dài sống ở đáy hồ sâu." },
  cc_ca_tam: { name: "Cá Tầm Bạc", rarity: 3, rate: 6, kg: [5, 25], price: 50, fight: 0.52, look: "tam", desc: "Cá tầm mình dài, giáp bạc. Lên tới vài chục cân." },
  cc_huyet_ly: { name: "Huyết Lý Ngư", rarity: 3, rate: 5, kg: [2, 8], price: 65, fight: 0.58, look: "huyet", desc: "Cá chép đỏ như máu, nghe nói từng nuốt huyết đan." },
  cc_bang_ngu: { name: "Băng Tinh Ngư", rarity: 3, rate: 4, kg: [0.5, 2], price: 85, fight: 0.62, look: "bang", desc: "Cá trong như băng, chỉ sống ở nước linh tuyền lạnh." },
  cc_ngoc_quy: { name: "Ngọc Giáp Quy", rarity: 4, rate: 3, kg: [3, 15], price: 200, fight: 0.66, look: "quy", desc: "Rùa mai ngọc biếc, sống cả trăm năm." },
  cc_kim_ly: { name: "Kim Lý Ngư", rarity: 4, rate: 2.5, kg: [2, 10], price: 260, fight: 0.74, look: "kim", desc: "Cá chép vàng ròng. Tương truyền vượt Long Môn thì hoá rồng." },
  cc_thanh_long: { name: "Thanh Long Ngư", rarity: 5, rate: 0.8, kg: [10, 60], price: 900, fight: 0.88, look: "long", desc: "Cá rồng xanh, râu dài, vảy toả lam quang. Hiếm vô cùng." },
  cc_hoa_phuong: { name: "Hỏa Phượng Ngư", rarity: 5, rate: 0.6, kg: [5, 30], price: 1200, fight: 0.95, look: "phuong", desc: "Cá vây như lông phượng, bơi đến đâu nước ấm đến đó." },
  cc_ruong: { name: "Rương Chìm", rarity: 3, rate: 2, kg: [4, 9], price: 0, fight: 0.3, look: "ruong", stones: [60, 400],
    desc: "Rương gỗ chìm dưới đáy hồ. Mở ra ngay, bên trong là linh thạch." },
};

/** The rates in use (fish key -> rate), as the admin set them; applyConfig fills it, FISH's rate until then. */
export const RATES = Object.fromEntries(Object.entries(FISH).map(([k, f]) => [k, f.rate]));
/** What a chest gives when opened, [min, max] linh thạch, as the admin set it (FISH's stones until then). */
export const CHEST = Object.fromEntries(Object.entries(FISH).filter(([, f]) => f.stones).map(([k, f]) => [k, [...f.stones]]));
export function setRates(r, chest = {}) {
  for (const k of Object.keys(FISH)) RATES[k] = Number.isFinite(r?.[k]) ? r[k] : FISH[k].rate;
  for (const k of Object.keys(CHEST)) CHEST[k] = chest[k] ?? [...FISH[k].stones];
}

/** Every item the fishing brings into the game, for the items table (kind, name, price, description). */
export const FISH_ITEMS = [
  ...Object.entries(RODS).map(([key, r], i) => ({ key, kind: "rod", name: r.name, price: r.price, desc: r.desc, sort: 400 + i })),
  ...Object.entries(BAITS).map(([key, b], i) => ({ key, kind: "bait", name: b.name, price: b.price, desc: b.desc, sort: 410 + i })),
  // (a chest too, for its name: it is never in the bag, its price is not used)
  ...Object.entries(FISH).map(([key, f], i) => ({ key, kind: "fish", name: f.name, price: f.price, desc: f.desc, sort: 420 + i })),
];

/** A rod's or bait's or fish's name and price as the admin set them (items), or as designed here. */
export const fishName = (key, items = {}) => items[key]?.name ?? RODS[key]?.name ?? BAITS[key]?.name ?? FISH[key]?.name ?? key;
export const fishPrice = (key, items = {}) => items[key]?.price ?? RODS[key]?.price ?? BAITS[key]?.price ?? FISH[key]?.price ?? 0;

/**
 * The chance of each catch with this rod and bait: [[key, p], ...], largest first. Each starts from its rate; luck (the
 * rod's plus the bait's) makes junk rarer and the rarer fish likelier (× 1 + luck × (rarity − 1) × 0.5); Tiên fish only
 * bite a bait of tier 3 or more. rodKey/baitKey may be null: the bare rates.
 */
export function odds(rodKey, baitKey, rates = RATES) {
  const rod = RODS[rodKey], bait = BAITS[baitKey], L = (rod?.luck ?? 0) + (bait?.luck ?? 0);
  const out = Object.entries(FISH).map(([k, f]) => {
    let w = Math.max(0, rates[k] ?? f.rate);
    if (f.rarity === 0) w /= 1 + 2 * L;
    else w *= 1 + L * (f.rarity - 1) * 0.5;
    if (f.rarity === 5 && bait && bait.tier < 3) w = 0;
    return [k, w];
  });
  const total = out.reduce((s, [, p]) => s + p, 0) || 1;
  return out.filter(([, p]) => p > 0).map(([k, p]) => [k, p / total]).sort((a, b) => b[1] - a[1]);
}
/** Pick a fish (rnd: a function giving 0..1). */
export function rollFish(rodKey, baitKey, rnd = Math.random) {
  const list = odds(rodKey, baitKey);
  let u = rnd();
  for (const [k, p] of list) if ((u -= p) <= 0) return k;
  return list[list.length - 1]?.[0] ?? null;
}
/** Its weight in grams: most are small, the big ones rare; a tier 4 bait tips it bigger. */
export function rollWeight(key, baitKey, rnd = Math.random) {
  const f = FISH[key], [a, b] = f.kg, e = (BAITS[baitKey]?.tier ?? 1) >= 4 ? 1.5 : 2.2;
  return Math.round((a + (b - a) * Math.pow(rnd(), e)) * 1000);
}
export const kgText = (g) => `${(g / 1000).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} cân`;

/** The seconds of a cast: a first wait, then the window to strike. */
export const CAST = {
  wait: [4, 13], // seconds before the bite (divided by the bait's speed)
  nibbles: 3, // up to this many nibbles before it
  window: 1.05, // seconds to strike once it bites (plus the rod's hook), counted on the server, plus a little for the wire
  grace: 0.25,
  cooldown: 1.2, // between one cast ending and the next
};

/**
 * The reeling game, a step of dt seconds. s: { f fish 0..1, fv, ft its target, fn when it picks a new one, z zone centre,
 * zv, p progress 0..1, t seconds in }. hold: whether the player holds. fight 0..1, rod: RODS entry. rnd for the fish's
 * darts (the server's own random; the browser only draws what the server sends). Returns "land", "lost" or null.
 */
export const REEL = { start: 0.3, gain: 0.17, drain: 0.13, up: 3.2, down: 2.4, vmax: 1.3, bounce: 0.3, limit: 60 };
export function reelZone(s, hold, rod, dt) {
  s.zv += (hold ? REEL.up : -REEL.down) * dt;
  s.zv = Math.max(-REEL.vmax, Math.min(REEL.vmax, s.zv));
  s.z += s.zv * dt;
  const h = rod.bar / 2;
  if (s.z < h) (s.z = h), (s.zv = -s.zv * REEL.bounce);
  if (s.z > 1 - h) (s.z = 1 - h), (s.zv = s.zv > 0 ? -s.zv * REEL.bounce : s.zv);
}
export function reelStep(s, hold, fight, rod, dt, rnd = Math.random) {
  s.t += dt;
  // the fish: picks a spot, swims there (faster and more often the wilder it is), now and then darts
  if (s.t >= s.fn) {
    const far = fight > 0.5 && rnd() < fight * 0.5;
    s.ft = far ? (s.f < 0.5 ? 0.7 + rnd() * 0.28 : 0.02 + rnd() * 0.28) : Math.max(0.03, Math.min(0.97, s.f + (rnd() * 2 - 1) * (0.2 + fight * 0.5)));
    s.fn = s.t + (1.7 - fight * 1.25) * (0.6 + rnd() * 0.8);
  }
  const k = 2 + fight * 7;
  s.fv += ((s.ft - s.f) * k - s.fv * (2.5 + (1 - fight) * 2)) * dt;
  const vmax = 0.35 + fight * 1.1;
  s.fv = Math.max(-vmax, Math.min(vmax, s.fv));
  s.f = Math.max(0.02, Math.min(0.98, s.f + s.fv * dt));
  reelZone(s, hold, rod, dt);
  const on = Math.abs(s.f - s.z) <= rod.bar / 2;
  s.p += (on ? REEL.gain * rod.power * (1.15 - fight * 0.45) : -REEL.drain * (0.8 + fight * 0.5)) * dt;
  s.on = on;
  if (s.p >= 1) return "land";
  if (s.p <= 0 || s.t > REEL.limit) return "lost";
  return null;
}
export const reelStart = () => ({ f: 0.3, fv: 0, ft: 0.3, fn: 0.6, z: 0.2, zv: 0, p: REEL.start, t: 0, on: false });
