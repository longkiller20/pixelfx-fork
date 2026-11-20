// Gia Viên: each player's own homestead, a private map of three parts, left to right:
//   Nhà Ở      a plot to build a house on, a cell (32 px) at a time like a side-view sandbox: solid blocks, platforms,
//              back walls and furniture, each bought with spirit stones and placed by hand; taken down, it goes back to stock
//   Nông Trại  a fenced pen for animals (hens, ducks, pigs, cows): fed, they give eggs, milk... after a while
//   Vườn Dược  a row of soil beds for herbs: sown, they grow on their own and are picked when ripe
// What the animals and herbs give is kept in the bag for later (alchemy, crafting); for now it is only collected.
// This file is shared: the server checks every rule with it (server/gia-vien.js), the browser shows it. Numbers that an
// admin tunes (the unlock cost, caps) are settings "home.*" in shared/balance.js.

export const HOME_MAP = "giavien";

/** The layout, in cells. floor: the row the ground starts at (people stand on its top edge). */
export const LAYOUT = {
  floor: 16,
  // where building is allowed: columns x0..x1, rows y0..floor-1
  house: { x0: 3, x1: 36, y0: 2 },
  // the pen the animals wander in (px are worked out from these)
  farm: { x0: 41, x1: 65 },
  // the soil beds, by their column (one cell each)
  plots: [71, 74, 77, 80, 83, 86, 89, 92],
};

/**
 * What can be built. layer: "f" solid or platform in front (it blocks or carries people), "b" a wall behind, "d" a
 * thing standing in the room (furniture: w x h cells, its bottom left on the cell placed; wall: hangs on a back wall,
 * hang: hangs from a block above; otherwise stands on a floor). art: an atlas tile of public/gia-vien/khoi.png, or a
 * pixelfx effect (fx, and its options). price: spirit stones each.
 */
export const BLOCKS = {
  // ---- solid blocks
  go: { name: "Ván Gỗ", layer: "f", solid: true, price: 6, atlas: 0, group: "khoi" },
  thung: { name: "Thùng Gỗ", layer: "f", solid: true, price: 8, atlas: 1, group: "khoi" },
  go_tron: { name: "Gỗ Tròn", layer: "f", solid: true, price: 8, atlas: 19, group: "khoi" },
  tre: { name: "Khối Tre", layer: "f", solid: true, price: 8, fx: "home/furniture", o: { piece: "bamboo" }, group: "khoi" },
  da_xam: { name: "Đá Xám", layer: "f", solid: true, price: 8, atlas: 2, group: "khoi" },
  da_cat: { name: "Đá Cát", layer: "f", solid: true, price: 8, atlas: 3, group: "khoi" },
  da_xanh: { name: "Đá Xanh", layer: "f", solid: true, price: 12, atlas: 4, group: "khoi" },
  dat_nung: { name: "Đất Nung", layer: "f", solid: true, price: 10, atlas: 5, group: "khoi" },
  ngoi_xam: { name: "Ngói Xám", layer: "f", solid: true, price: 14, atlas: 6, group: "mai" },
  ngoi_lam: { name: "Ngói Lam", layer: "f", solid: true, price: 14, atlas: 7, group: "mai" },
  ngoi_do: { name: "Ngói Đỏ", layer: "f", solid: true, price: 14, atlas: 8, group: "mai" },
  ngoi_ngoc: { name: "Ngói Ngọc", layer: "f", solid: true, price: 16, atlas: 9, group: "mai" },
  // ---- platforms: stand on them, jump up through them, down + jump to drop
  hien_xam: { name: "Hiên Ngói Xám", layer: "f", plank: true, price: 10, atlas: 10, group: "mai" },
  hien_lam: { name: "Hiên Ngói Lam", layer: "f", plank: true, price: 10, atlas: 11, group: "mai" },
  hien_do: { name: "Hiên Ngói Đỏ", layer: "f", plank: true, price: 10, atlas: 12, group: "mai" },
  hien_ngoc: { name: "Hiên Ngói Ngọc", layer: "f", plank: true, price: 12, atlas: 13, group: "mai" },
  san_go: { name: "Sàn Gỗ", layer: "f", plank: true, price: 5, fx: "home/furniture", o: { piece: "platform" }, group: "khoi" },
  van_dai: { name: "Vân Đài", layer: "f", plank: true, price: 20, atlas: 14, group: "khoi" },
  // ---- walls behind
  vach_giay: { name: "Vách Giấy", layer: "b", price: 4, fx: "home/furniture", o: { piece: "paperwall" }, group: "vach" },
  vach_go: { name: "Vách Gỗ", layer: "b", price: 4, fx: "home/furniture", o: { piece: "woodwall" }, group: "vach" },
  vach_da: { name: "Vách Đá Xanh", layer: "b", price: 5, atlas: 15, group: "vach" },
  vach_dat: { name: "Vách Đất Nung", layer: "b", price: 5, atlas: 16, group: "vach" },
  // ---- furniture
  cua: { name: "Cửa Gỗ", layer: "d", w: 1, h: 2, price: 120, fx: "home/furniture", o: { piece: "door" }, group: "noi_that" },
  cua_so: { name: "Cửa Sổ Song", layer: "d", w: 1, h: 1, wall: true, price: 80, fx: "home/furniture", o: { piece: "window" }, group: "noi_that" },
  ban: { name: "Bàn Trà", layer: "d", w: 1, h: 1, price: 150, fx: "home/furniture", o: { piece: "table" }, group: "noi_that" },
  ghe: { name: "Ghế Tựa", layer: "d", w: 1, h: 1, price: 80, fx: "home/furniture", o: { piece: "chair" }, group: "noi_that" },
  giuong: { name: "Giường", layer: "d", w: 2, h: 1, price: 300, fx: "home/furniture", o: { piece: "bed" }, group: "noi_that" },
  ke_sach: { name: "Kệ Sách", layer: "d", w: 1, h: 2, price: 250, fx: "home/furniture", o: { piece: "shelf" }, group: "noi_that" },
  binh_hoa: { name: "Bình Hoa", layer: "d", w: 1, h: 1, price: 100, fx: "home/furniture", o: { piece: "vase" }, group: "noi_that" },
  tranh: { name: "Tranh Thủy Mặc", layer: "d", w: 1, h: 1, wall: true, price: 150, fx: "home/furniture", o: { piece: "scroll" }, group: "noi_that" },
  den_long: { name: "Đèn Lồng", layer: "d", w: 1, h: 1, hang: true, price: 120, fx: "home/lantern", live: true, group: "noi_that" },
  lo_dan: { name: "Lò Luyện Đan", layer: "d", w: 1, h: 2, price: 2000, fx: "home/furnace", live: true, group: "noi_that" },
  ruong: { name: "Rương", layer: "d", w: 1, h: 1, price: 200, atlas: 18, group: "noi_that" },
  thung_ruou: { name: "Thùng Rượu", layer: "d", w: 1, h: 1, price: 120, atlas: 17, group: "noi_that" },
};
export const BLOCK_GROUPS = { khoi: "Khối", mai: "Mái", vach: "Vách", noi_that: "Nội thất" };

/**
 * The animals. price to buy one, feed: spirit stones a meal; fed, it gives `product` (an item) after `cycle` seconds,
 * collected by hand, then it wants feeding again.
 */
export const ANIMALS = {
  ga: { name: "Gà", fx: "farm/chicken", price: 800, feed: 10, cycle: 1800, product: "gv_trung_ga", scale: 1.6 },
  vit: { name: "Vịt", fx: "farm/duck", price: 1200, feed: 12, cycle: 2700, product: "gv_trung_vit", scale: 1.6 },
  lon: { name: "Lợn", fx: "farm/pig", price: 3000, feed: 30, cycle: 7200, product: "gv_mo_lon", scale: 1.7 },
  bo: { name: "Bò", fx: "farm/cow", price: 6000, feed: 50, cycle: 10800, product: "gv_sua_bo", scale: 1.8 },
};

/** The herbs: seed costs spirit stones, grows for `grow` seconds, gives min..max of its item when picked. */
export const CROPS = {
  linh_thao: { name: "Linh Thảo", fx: "farm/linh-thao", seed: 30, grow: 1200, item: "gv_linh_thao", min: 2, max: 4 },
  kim_ngan_hoa: { name: "Kim Ngân Hoa", fx: "farm/kim-ngan-hoa", seed: 60, grow: 2400, item: "gv_kim_ngan_hoa", min: 2, max: 3 },
  nhan_sam: { name: "Nhân Sâm", fx: "farm/nhan-sam", seed: 150, grow: 7200, item: "gv_nhan_sam", min: 1, max: 2 },
  linh_chi: { name: "Linh Chi", fx: "farm/linh-chi", seed: 300, grow: 14400, item: "gv_linh_chi", min: 1, max: 2 },
};

/** What the farm gives, as items (kind material, not sold): kept in the bag for alchemy and crafting to come. */
export const HOME_ITEMS = [
  { key: "gv_trung_ga", name: "Trứng Gà", desc: "Trứng gà nuôi ở Gia Viên. Sẽ dùng để luyện đan, nấu ăn khi các tính năng đó ra mắt." },
  { key: "gv_trung_vit", name: "Trứng Vịt", desc: "Trứng vịt nuôi ở Gia Viên. Sẽ dùng để luyện đan, nấu ăn khi các tính năng đó ra mắt." },
  { key: "gv_mo_lon", name: "Mỡ Lợn", desc: "Mỡ lợn nuôi ở Gia Viên. Sẽ dùng để chế tác khi tính năng đó ra mắt." },
  { key: "gv_sua_bo", name: "Sữa Bò", desc: "Sữa bò nuôi ở Gia Viên. Sẽ dùng để luyện đan, nấu ăn khi các tính năng đó ra mắt." },
  { key: "gv_linh_thao", name: "Linh Thảo", desc: "Dược thảo trồng ở Vườn Dược. Nguyên liệu luyện đan (sắp ra mắt)." },
  { key: "gv_kim_ngan_hoa", name: "Kim Ngân Hoa", desc: "Dược hoa trồng ở Vườn Dược. Nguyên liệu luyện đan (sắp ra mắt)." },
  { key: "gv_nhan_sam", name: "Nhân Sâm", desc: "Nhân sâm trồng ở Vườn Dược. Nguyên liệu luyện đan quý (sắp ra mắt)." },
  { key: "gv_linh_chi", name: "Linh Chi", desc: "Linh chi trồng ở Vườn Dược. Nguyên liệu luyện đan quý (sắp ra mắt)." },
];

/** How far a herb has grown at `now` (ms): 0 just sown, 1 young, 2 grown, 3 ripe. */
export function cropStage(plantedAt, readyAt, now = Date.now()) {
  const a = new Date(plantedAt).getTime(), b = new Date(readyAt).getTime();
  if (now >= b) return 3;
  const u = (now - a) / Math.max(1, b - a);
  return u < 0.3 ? 0 : u < 0.65 ? 1 : 2;
}
/** Whether cell (cx, cy) is where building is allowed. */
export const inHouse = (cx, cy) => cx >= LAYOUT.house.x0 && cx <= LAYOUT.house.x1 && cy >= LAYOUT.house.y0 && cy < LAYOUT.floor;
/** The cells a thing of `kind` placed at (cx, cy) covers (its bottom left there, growing up and right). */
export function cellsOf(kind, cx, cy) {
  const b = BLOCKS[kind], w = b?.w ?? 1, h = b?.h ?? 1, out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([cx + i, cy - j]);
  return out;
}

/**
 * What is built in one home, cell by cell, and the rules of where things go (the same rules on the server, which
 * decides, and in the browser, which shows a green or red outline before you click).
 *   f  a solid block or platform in front, per cell
 *   b  a back wall, per cell
 *   d  furniture: stored at its anchor (bottom left) and covering w x h cells
 */
export class HomeGrid {
  constructor(base) {
    this.base = base; // the plain map (mapInfo): its ground and cliffs
    this.f = new Map();
    this.b = new Map();
    this.d = new Map(); // anchor "cx,cy" -> kind
    this.dAt = new Map(); // any covered cell "cx,cy" -> anchor "cx,cy"
  }
  static key(cx, cy) {
    return `${cx},${cy}`;
  }
  load(list) {
    for (const [l, cx, cy, k] of list) this.set(l, cx, cy, k);
    return this;
  }
  set(layer, cx, cy, kind) {
    const K = HomeGrid.key(cx, cy);
    if (layer === "d") {
      this.d.set(K, kind);
      for (const [x, y] of cellsOf(kind, cx, cy)) this.dAt.set(HomeGrid.key(x, y), K);
    } else this[layer].set(K, kind);
  }
  del(layer, cx, cy) {
    const K = HomeGrid.key(cx, cy);
    if (layer === "d") {
      const kind = this.d.get(K);
      if (kind) for (const [x, y] of cellsOf(kind, cx, cy)) this.dAt.delete(HomeGrid.key(x, y));
      this.d.delete(K);
    } else this[layer].delete(K);
  }
  get(layer, cx, cy) {
    return this[layer].get(HomeGrid.key(cx, cy)) ?? null;
  }
  /** The furniture covering a cell: [anchorX, anchorY, kind] or null. */
  dCover(cx, cy) {
    const K = this.dAt.get(HomeGrid.key(cx, cy));
    if (!K) return null;
    const [x, y] = K.split(",").map(Number);
    return [x, y, this.d.get(K)];
  }
  solidAt(cx, cy) {
    const k = this.f.get(HomeGrid.key(cx, cy));
    return !!(k && BLOCKS[k]?.solid);
  }
  plankAt(cx, cy) {
    const k = this.f.get(HomeGrid.key(cx, cy));
    return !!(k && BLOCKS[k]?.plank);
  }
  /** The map as people move on it: the plain map's ground, plus the blocks built. */
  wrap() {
    const base = this.base, m = Object.create(base);
    m.solid = (cx, cy) => base.solid(cx, cy) || this.solidAt(cx, cy);
    m.plank = (cx, cy) => base.plank(cx, cy) || this.plankAt(cx, cy);
    return m;
  }
  // what holds a cell up: the ground, a block, a wall
  firm(cx, cy) {
    return this.base.solid(cx, cy) || this.f.has(HomeGrid.key(cx, cy));
  }
  floorUnder(cx, cy) {
    return this.base.solid(cx, cy + 1) || this.base.plank(cx, cy + 1) || this.f.has(HomeGrid.key(cx, cy + 1));
  }
  /** Whether furniture of `kind` at (cx, cy) has what it needs: a floor under it, a wall behind it, a beam over it. */
  held(kind, cx, cy) {
    const b = BLOCKS[kind], cells = cellsOf(kind, cx, cy);
    if (b.wall) return cells.every(([x, y]) => this.b.has(HomeGrid.key(x, y)));
    if (b.hang) return cells.filter(([, y]) => y === cy - (b.h ?? 1) + 1).every(([x, y]) => this.firm(x, y - 1));
    return cells.filter(([, y]) => y === cy).every(([x, y]) => this.floorUnder(x, y));
  }
  /**
   * Why `kind` can't go at (cx, cy), or null if it can. bodies: [x, y] of people (feet), so a solid block is never put
   * on top of someone; fits(x, y, map) is the physics' check.
   */
  canPut(kind, cx, cy, bodies = [], fits = null) {
    const b = BLOCKS[kind];
    if (!b) return "Không có vật liệu này.";
    const cells = b.layer === "d" ? cellsOf(kind, cx, cy) : [[cx, cy]];
    if (!cells.every(([x, y]) => inHouse(x, y))) return "Chỉ xây được trong khu Nhà Ở.";
    if (b.layer === "f") {
      if (this.f.has(HomeGrid.key(cx, cy))) return "Ô này đã có khối.";
      if (b.solid && this.dAt.has(HomeGrid.key(cx, cy))) return "Ô này đang có đồ đạc.";
      // a block hangs on something: a block or the ground beside it, or a wall behind it
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.firm(cx + dx, cy + dy) || this.plankAt(cx + dx, cy + dy));
      if (!near && !this.b.has(HomeGrid.key(cx, cy))) return "Khối phải tựa vào mặt đất, khối khác hoặc vách.";
      if (b.solid && fits) {
        this.f.set(HomeGrid.key(cx, cy), kind);
        const m = this.wrap(), ok = bodies.every(([x, y]) => fits(x, y, m));
        this.f.delete(HomeGrid.key(cx, cy));
        if (!ok) return "Có người đang đứng ở đó.";
      }
      return null;
    }
    if (b.layer === "b") {
      if (this.b.has(HomeGrid.key(cx, cy))) return "Ô này đã có vách.";
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.firm(cx + dx, cy + dy) || this.b.has(HomeGrid.key(cx + dx, cy + dy)));
      if (!near && !this.f.has(HomeGrid.key(cx, cy))) return "Vách phải nối với mặt đất, khối hoặc vách khác.";
      return null;
    }
    for (const [x, y] of cells) {
      if (this.dAt.has(HomeGrid.key(x, y))) return "Chỗ này đã có đồ đạc.";
      if (this.solidAt(x, y) || this.base.solid(x, y)) return "Chỗ này bị khối chắn.";
    }
    if (!this.held(kind, cx, cy)) return b.wall ? "Cần có vách phía sau để treo." : b.hang ? "Cần có khối phía trên để treo." : "Cần có sàn bên dưới.";
    return null;
  }
  /** Why what is at (layer, cx, cy) can't be taken down, or null. Furniture resting on it must go first. */
  canTake(layer, cx, cy) {
    if (layer === "d") return this.d.has(HomeGrid.key(cx, cy)) ? null : "Ô này không có đồ đạc.";
    if (!this[layer].has(HomeGrid.key(cx, cy))) return "Ô này không có gì.";
    const kind = this[layer].get(HomeGrid.key(cx, cy));
    this[layer].delete(HomeGrid.key(cx, cy));
    let bad = null;
    for (const [K, k] of this.d) {
      const [x, y] = K.split(",").map(Number);
      if (Math.abs(x - cx) <= 3 && Math.abs(y - cy) <= 3 && !this.held(k, x, y)) bad = `Hãy dỡ ${BLOCKS[k].name} trước.`;
    }
    this[layer].set(HomeGrid.key(cx, cy), kind);
    return bad;
  }
}
