// Gia Viên: each player's own homestead, a private map of three parts, left to right:
//   Nhà Ở      a ready-made house (HOUSES below): bought whole, it stands on the house plot; people walk in, climb
//              to the upper floor, and its walls and floors carry them like the ground. Unlocking the Gia Viên comes
//              with the default house; others are to be bought.
//   Nông Trại  a fenced pen for animals (hens, ducks, pigs, cows): fed, they give eggs, milk... after a while
//   Vườn Dược  a row of soil beds for herbs: sown, they grow on their own and are picked when ripe
// What the animals and herbs give is kept in the bag for later (alchemy, crafting); for now it is only collected.
// This file is shared: the server checks every rule with it (server/gia-vien.js), the browser shows it. Numbers that an
// admin tunes (the unlock cost, caps) are settings "home.*" in shared/balance.js.

export const HOME_MAP = "giavien";

/** The layout, in cells. floor: the row the ground starts at (people stand on its top edge). */
export const LAYOUT = {
  floor: 16,
  // the house plot: columns x0..x1, rows y0..floor-1 (a house is designed to fit in it)
  house: { x0: 3, x1: 36, y0: 2 },
  // the pen the animals wander in (px are worked out from these)
  farm: { x0: 41, x1: 65 },
  // the soil beds, by their column (one cell each)
  plots: [71, 74, 77, 80, 83, 86, 89, 92],
};

/**
 * The pieces houses are made of. layer: "f" solid or platform in front (it blocks or carries people), "b" a wall
 * behind, "d" a thing standing in the room (furniture: w x h cells, its bottom left on its cell). art: a picture in
 * public/gia-vien/khoi.png (named in shared/gia-vien-khoi.js), or a pixelfx effect (fx, and its options).
 */
export const BLOCKS = {
  // ---- solid blocks
  go: { name: "Ván Gỗ", layer: "f", solid: true, atlas: "plank" },
  thung: { name: "Thùng Gỗ", layer: "f", solid: true, atlas: "crate" },
  go_tron: { name: "Gỗ Tròn", layer: "f", solid: true, atlas: "logend" },
  tre: { name: "Khối Tre", layer: "f", solid: true, fx: "home/furniture", o: { piece: "bamboo" } },
  da_xam: { name: "Đá Xám", layer: "f", solid: true, atlas: "grey" },
  da_cat: { name: "Đá Cát", layer: "f", solid: true, atlas: "sand" },
  da_xanh: { name: "Đá Xanh", layer: "f", solid: true, atlas: "bluestone" },
  dat_nung: { name: "Đất Nung", layer: "f", solid: true, atlas: "redclay" },
  ngoi_xam: { name: "Ngói Xám", layer: "f", solid: true, atlas: "roof_grey" },
  ngoi_lam: { name: "Ngói Lam", layer: "f", solid: true, atlas: "roof_blue" },
  ngoi_do: { name: "Ngói Đỏ", layer: "f", solid: true, atlas: "roof_red" },
  ngoi_ngoc: { name: "Ngói Ngọc", layer: "f", solid: true, atlas: "roof_jade" },
  // ---- platforms: stand on them, jump up through them, down + jump to drop
  hien_xam: { name: "Hiên Ngói Xám", layer: "f", plank: true, atlas: "eave_grey" },
  hien_lam: { name: "Hiên Ngói Lam", layer: "f", plank: true, atlas: "eave_blue" },
  hien_do: { name: "Hiên Ngói Đỏ", layer: "f", plank: true, atlas: "eave_red" },
  hien_ngoc: { name: "Hiên Ngói Ngọc", layer: "f", plank: true, atlas: "eave_jade" },
  san_an: { name: "Sàn", layer: "f", plank: true, hidden: true },
  san_go: { name: "Sàn Gỗ", layer: "f", plank: true, fx: "home/furniture", o: { piece: "platform" } },
  van_dai: { name: "Vân Đài", layer: "f", plank: true, atlas: "cloud_plat" },
  // ---- walls behind
  vach_giay: { name: "Vách Giấy", layer: "b", fx: "home/furniture", o: { piece: "paperwall" } },
  vach_go: { name: "Vách Gỗ", layer: "b", fx: "home/furniture", o: { piece: "woodwall" } },
  vach_da: { name: "Vách Đá Xanh", layer: "b", atlas: "wall_blue" },
  vach_dat: { name: "Vách Đất Nung", layer: "b", atlas: "wall_red" },
  // ---- furniture
  cua: { name: "Cửa Gỗ", layer: "d", w: 1, h: 2, fx: "home/furniture", o: { piece: "door" } },
  cua_so: { name: "Cửa Sổ Song", layer: "d", w: 1, h: 1, wall: true, fx: "home/furniture", o: { piece: "window" } },
  ban: { name: "Bàn Trà", layer: "d", w: 1, h: 1, fx: "home/furniture", o: { piece: "table" } },
  ghe: { name: "Ghế Tựa", layer: "d", w: 1, h: 1, fx: "home/furniture", o: { piece: "chair" } },
  giuong: { name: "Giường", layer: "d", w: 2, h: 1, fx: "home/furniture", o: { piece: "bed" } },
  ke_sach: { name: "Kệ Sách", layer: "d", w: 1, h: 2, fx: "home/furniture", o: { piece: "shelf" } },
  binh_hoa: { name: "Bình Hoa", layer: "d", w: 1, h: 1, fx: "home/furniture", o: { piece: "vase" } },
  tranh: { name: "Tranh Thủy Mặc", layer: "d", w: 1, h: 1, wall: true, fx: "home/furniture", o: { piece: "scroll" } },
  den_long: { name: "Đèn Lồng", layer: "d", w: 1, h: 1, hang: true, fx: "home/lantern", live: true },
  lo_dan: { name: "Lò Luyện Đan", layer: "d", w: 1, h: 2, fx: "home/furnace", live: true },
  ruong: { name: "Rương", layer: "d", w: 1, h: 1, atlas: "chest" },
  thung_ruou: { name: "Thùng Rượu", layer: "d", w: 1, h: 1, atlas: "barrel" },
  // ---- Đền Đài: temple stone of the sunset temple and the marble of the classical one
  gach_den: { name: "Gạch Đền", layer: "f", solid: true, atlas: "temple_brick" },
  da_cam_thach: { name: "Đá Cẩm Thạch", layer: "f", solid: true, atlas: "marble_wall" },
  vach_den: { name: "Vách Gạch Đền", layer: "b", atlas: "temple_brick" },
  vach_cam_thach: { name: "Vách Cẩm Thạch", layer: "b", atlas: "marble_wall" },
  cot_den: { name: "Cột Đền", layer: "d", w: 1, h: 3, atlas: "temple_pillar" },
  cot_cam_thach: { name: "Cột Cẩm Thạch", layer: "d", w: 1, h: 3, atlas: "marble_column" },
  tuong_than: { name: "Tượng Thần", layer: "d", w: 1, h: 2, atlas: "marble_statue" },
  ban_da: { name: "Bàn Đá", layer: "d", w: 1, h: 1, atlas: "marble_altar" },
  phuong: { name: "Phướn Đền", layer: "d", w: 2, h: 4, wall: true, atlas: "temple_banner" },
  phu_dieu: { name: "Phù Điêu", layer: "d", w: 4, h: 4, wall: true, atlas: "temple_relief" },
  // ---- Hiện Đại: the modern world
  gach_xam: { name: "Gạch Xám", layer: "f", solid: true, atlas: "brick_grey" },
  da_ong: { name: "Đá Ong", layer: "f", solid: true, atlas: "tile_0" },
  da_ong_xay: { name: "Đá Ong Xây", layer: "f", solid: true, atlas: "tile_1" },
  gach_hoa_xam: { name: "Gạch Hoa Xám", layer: "f", solid: true, atlas: "tile_2" },
  gach_hoa_ngoc: { name: "Gạch Hoa Ngọc", layer: "f", solid: true, atlas: "tile_3" },
  gach_hoa_vang: { name: "Gạch Hoa Vàng", layer: "f", solid: true, atlas: "tile_4" },
  gach_hoa_nau: { name: "Gạch Hoa Nâu", layer: "f", solid: true, atlas: "tile_5" },
  be_tong: { name: "Bê Tông", layer: "f", solid: true, atlas: "concrete" },
  kinh: { name: "Kính Cường Lực", layer: "f", solid: true, fx: "home/furniture", o: { piece: "glass" } },
  vach_gach: { name: "Vách Gạch Xám", layer: "b", atlas: "brick_grey" },
  vach_be_tong: { name: "Vách Bê Tông", layer: "b", atlas: "concrete" },
  sofa: { name: "Sofa", layer: "d", w: 2, h: 1, atlas: "sofa" },
  giuong_nem: { name: "Giường Nệm", layer: "d", w: 2, h: 1, atlas: "bed_modern" },
  ban_bia: { name: "Bàn Bi-a", layer: "d", w: 2, h: 1, atlas: "pool_table" },
  bon_tam: { name: "Bồn Tắm", layer: "d", w: 1, h: 1, atlas: "bathtub" },
  tu_bep: { name: "Tủ Bếp", layer: "d", w: 1, h: 1, atlas: "kitchen" },
  bep_ga: { name: "Bếp Ga", layer: "d", w: 1, h: 1, atlas: "stove" },
  quay_go: { name: "Quầy Gỗ", layer: "d", w: 1, h: 1, atlas: "counter" },
  ban_lam_viec: { name: "Bàn Làm Việc", layer: "d", w: 1, h: 1, atlas: "desk" },
  dan_piano: { name: "Đàn Piano", layer: "d", w: 1, h: 1, atlas: "piano" },
  dan_am_thanh: { name: "Dàn Âm Thanh", layer: "d", w: 1, h: 1, atlas: "hifi" },
  loa: { name: "Loa", layer: "d", w: 1, h: 1, atlas: "speaker" },
  // ---- Khoa Huyễn: steel, light and machines of the far future
  thep_vat: { name: "Thép Vát", layer: "f", solid: true, atlas: "steel_bevel" },
  thep_dinh: { name: "Thép Đinh Tán", layer: "f", solid: true, atlas: "steel_rivet" },
  khung_thep: { name: "Khung Thép", layer: "f", solid: true, atlas: "steel_frame" },
  tan_nhiet: { name: "Khối Tản Nhiệt", layer: "f", solid: true, atlas: "steel_vent" },
  den_lam: { name: "Khối Đèn Lam", layer: "f", solid: true, atlas: "light_block" },
  canh_bao: { name: "Khối Cảnh Báo", layer: "f", solid: true, atlas: "hazard" },
  gi_set: { name: "Thép Gỉ", layer: "f", solid: true, atlas: "rust_block" },
  san_thep: { name: "Sàn Thép", layer: "f", plank: true, atlas: "steel_floor" },
  vach_thep: { name: "Vách Thép", layer: "b", atlas: "steel_plate" },
  vach_mach: { name: "Vách Mạch", layer: "b", atlas: "steel_cross" },
  vach_luoi: { name: "Vách Lưới", layer: "b", atlas: "steel_grille" },
  may_chu: { name: "Máy Chủ", layer: "d", w: 2, h: 2, atlas: "server" },
  tu_dieu_khien: { name: "Tủ Điều Khiển", layer: "d", w: 1, h: 2, atlas: "console" },
  cua_thep: { name: "Cửa Thép Trượt", layer: "d", w: 1, h: 2, fx: "home/furniture", o: { piece: "metaldoor" } },
  hop_kim_loai: { name: "Hộp Kim Loại", layer: "d", w: 1, h: 1, atlas: "metal_box" },
  tram_truyen_tin: { name: "Trạm Truyền Tin", layer: "d", w: 1, h: 1, atlas: "terminal" },
};

/**
 * Ready-made houses: bought whole, each a list of pieces [layer, cx, cy, kind] on the house plot (LAYOUT.house),
 * furniture by its bottom-left cell. price in spirit stones (0: comes with unlocking the Gia Viên).
 */
export const HOUSES = {
  co_trach: { name: "Thanh Vân Cổ Trạch", price: 0, desc: "Ngôi nhà gỗ hai tầng mái ngói đỏ cong vút, đi kèm khi mở khoá Gia Viên. Tầng dưới có lò luyện đan, bàn trà, kệ sách; tầng trên là phòng ngủ.", cells: coTrach() },
  gamer: {
    name: "Nhà Game Thủ",
    price: 150000,
    desc: "Căn nhà ba tầng rực đèn neon của game thủ đa vũ trụ: phòng stream phông xanh, quầy bar, máy arcade; phòng khách TV lớn, tủ figure; phòng ngủ và góc gaming ba màn hình, ban công dù tím.",
    ...picHouse({ file: "gamer", x: 231, ground: 370, w: 798, h: 400, fx: "home/gamer-house", floors: [[13, 55, 1715], [10, 160, 1655]] }),
  },
  tien_phu: {
    name: "Lăng Vân Tiên Phủ",
    price: 500000,
    desc: "Tiên phủ ba tầng mái ngói lưu ly, cổng trận pháp, tĩnh thất ngồi thiền, giá kiếm linh quang, thác nước từ đảo bay đổ xuống hồ sen, cây anh đào bên hiên.",
    // the top storey is lower than the others (its floor two cells over the middle one)
    ...picHouse({ file: "tien_phu", x: 240, ground: 335, w: 798, h: 389, fx: "home/tien-phu", floors: [[13, 20, 1750], [11, 230, 1620]] }),
  },
};
export const DEFAULT_HOUSE = "co_trach";
/**
 * What a house costs now: the admin's setting home.price.<id> (prices, from shared/balance.js HOME.prices) or else its
 * price here. 0: not for sale (the default house; or one an admin only gives).
 */
export const housePrice = (id, prices = {}) => (id === DEFAULT_HOUSE || !HOUSES[id] ? 0 : prices[id] ?? HOUSES[id].price);
/** The pieces of a house (none for an unknown one). */
export const houseCells = (id) => HOUSES[id]?.cells ?? [];

/**
 * A house drawn as one picture (pic: its file, where its top left stands in world px, its size) instead of pieces, from a
 * picture the user drew (game/tools/gia-vien-nha.py brings it to size: 0.45 across, each storey squeezed so its floor
 * falls on a cell line). file: its name in public/gia-vien/nha/; x: where its left edge stands (world px); ground: the
 * picture's row the ground floor stands on (it is put at row 16); floors: [row, from, to] each upper floor, from and to
 * in the source picture's px. Floors are planks hidden under the picture (one can jump up through them, ↓ + jump to drop);
 * live: the pixelfx effect that makes it move, in two halves (part 0, 1) drawn at the picture's top left plus
 * parts[part] (its file in src/fx/home/).
 */
function picHouse({ file, x, ground, w, h, fx, floors }) {
  const T = 32, S = 0.45, y = 16 * T - ground, out = [];
  for (const [row, a, b] of floors) {
    const x0 = x + a * S, x1 = x + b * S;
    for (let cx = Math.floor(x0 / T); cx * T < x1; cx++) if (Math.min(x1, cx * T + T) - Math.max(x0, cx * T) >= 16) out.push(["f", cx, row, "san_an"]);
  }
  return { pic: { src: `/gia-vien/nha/${file}.png`, x, y, w, h }, live: [{ fx, parts: [0, w - 480] }], cells: out };
}

/**
 * Thanh Vân Cổ Trạch, the default house: two floors and a curved red roof, its door on the right (the side people come
 * from). Columns 7..28, the ground floor rows 11..15 under a wooden floor (row 10) one can jump up through, by a step
 * (row 13) inside the door; the upper floor rows 6..9; the roof rises in tiers from row 5 to row 2, a scalloped eave at
 * the end of each tier and one between the floors.
 */
function coTrach() {
  const out = [], put = (l, x, y, k) => out.push([l, x, y, k]);
  const X0 = 7, X1 = 28;
  // back walls: paper panels between wooden posts below, wood with paper windows above
  for (let x = X0 + 1; x < X1; x++) {
    const post = (x - X0) % 5 === 0;
    for (let y = 11; y <= 15; y++) put("b", x, y, post ? "vach_go" : "vach_giay");
    for (let y = 6; y <= 9; y++) put("b", x, y, post || y === 6 ? "vach_go" : "vach_giay");
    put("b", x, 10, "vach_go"); // behind the floor between them
  }
  // behind the doorway, and over it
  for (let y = 13; y <= 15; y++) put("b", X1, y, "vach_go");
  // the outer walls of blue stone, the right one open at the bottom for the door
  for (let y = 6; y <= 15; y++) put("f", X0, y, "da_xanh");
  for (let y = 6; y <= 12; y++) put("f", X1, y, "da_xanh");
  // the upper floor (a platform), a step up to it inside the door, eaves between the floors
  for (let x = X0 + 1; x < X1; x++) put("f", x, 10, "san_go");
  for (let x = 24; x <= 26; x++) put("f", x, 13, "san_go");
  for (const x of [X0 - 2, X0 - 1, X1 + 1, X1 + 2]) put("f", x, 10, "hien_do");
  // the roof: four tiers of red tiles, each ending in a scalloped eave
  [[5, X0 - 2, X1 + 2], [4, X0, X1], [3, X0 + 2, X1 - 2], [2, X0 + 5, X1 - 5]].forEach(([y, a, b]) => {
    for (let x = a; x <= b; x++) put("f", x, y, "ngoi_do");
    put("f", a - 1, y, "hien_do");
    put("f", b + 1, y, "hien_do");
  });
  put("f", X0 - 4, 5, "hien_do");
  put("f", X1 + 4, 5, "hien_do");
  // downstairs: the alchemy furnace, a chest, tea table and chairs, a bookshelf, a vase, wine by the step
  put("d", 9, 15, "lo_dan");
  put("d", 11, 15, "ruong");
  put("d", 14, 15, "ghe");
  put("d", 15, 15, "ban");
  put("d", 16, 15, "ghe");
  put("d", 19, 15, "ke_sach");
  put("d", 21, 15, "binh_hoa");
  put("d", 25, 15, "thung_ruou");
  put("d", 26, 15, "thung_ruou");
  put("d", 17, 12, "tranh");
  put("d", 22, 12, "cua_so");
  put("d", 13, 11, "den_long");
  put("d", 20, 11, "den_long");
  put("d", X1, 15, "cua");
  // upstairs: the bed, a vase, shelf, a table and chair, a chest; windows and a scroll on the walls
  put("d", 9, 9, "giuong");
  put("d", 11, 9, "binh_hoa");
  put("d", 14, 9, "ke_sach");
  put("d", 18, 9, "ban");
  put("d", 19, 9, "ghe");
  put("d", 25, 9, "ruong");
  put("d", 11, 7, "cua_so");
  put("d", 16, 7, "tranh");
  put("d", 22, 7, "cua_so");
  put("d", 21, 6, "den_long");
  // lanterns under the outer eaves
  put("d", X0 - 2, 11, "den_long");
  put("d", X1 + 2, 11, "den_long");
  return out;
}

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
/** The cells a thing of `kind` placed at (cx, cy) covers (its bottom left there, growing up and right). */
export function cellsOf(kind, cx, cy) {
  const b = BLOCKS[kind], w = b?.w ?? 1, h = b?.h ?? 1, out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([cx + i, cy - j]);
  return out;
}

/**
 * One home's house, cell by cell (the server moves people on it, the browser draws it).
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
}
