// The wardrobe a fresh database starts with: 40 hair styles and 40 robes for each gender, matching the atlases in
// public/avatar/. Five of each are free at creation (starter); the rest are sold for spirit stones. This only seeds the
// cosmetics table: rows already there are left alone, so prices and names changed by an admin stick (tools/cosmetics.mjs).
export const COSMETICS_SEED = [
  { kind: "hair", g: "m", idx: 0, name: "Huyền Lưu Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 1, name: "Lam Thiên Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 2, name: "Lam Lưu Phát 2", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 3, name: "Xích Vân Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 4, name: "Hỏa Lưu Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 5, name: "Tử Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 6, name: "Lam Vân Phát 2", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 7, name: "Bạch Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 8, name: "Huyền Vân Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 9, name: "Lam Long Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 10, name: "Tử Lưu Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 11, name: "Bạch Vân Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 12, name: "Huyền Linh Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 13, name: "Xích Phong Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 14, name: "Bích Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 15, name: "Lam Tinh Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 16, name: "Lam Phong Phát 2", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 17, name: "Xích Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 18, name: "Lam Linh Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 19, name: "Ngân Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 20, name: "Lam Hà Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 21, name: "Lam Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 22, name: "Hỏa Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 23, name: "Tử Vân Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 24, name: "Thanh Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 25, name: "Hỏa Vân Phát", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 26, name: "Lam Nguyệt Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 27, name: "Lam Tiên Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 28, name: "Huyền Phong Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 29, name: "Lam Phong Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 30, name: "Huyền Phát", price: 0, starter: true },
  { kind: "hair", g: "m", idx: 31, name: "Phấn Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 32, name: "Tử Linh Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 33, name: "Lam Vân Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 34, name: "Lam Phát 2", price: 500, starter: false },
  { kind: "hair", g: "m", idx: 35, name: "Xích Lưu Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 36, name: "Lam Đế Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 37, name: "Ngân Vân Phát", price: 300, starter: false },
  { kind: "hair", g: "m", idx: 38, name: "Lam Lưu Phát", price: 150, starter: false },
  { kind: "hair", g: "m", idx: 39, name: "Tử Phong Phát", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 0, name: "Xích Linh Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 1, name: "Bạch Liên Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 2, name: "Lam Liên Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 3, name: "Xích Tiên Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 4, name: "Hỏa Liên Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 5, name: "Tử Linh Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 6, name: "Bạch Tiên Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 7, name: "Xích Nguyệt Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 8, name: "Lam Nguyệt Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 9, name: "Tử Liên Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 10, name: "Huyền Linh Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 11, name: "Bạch Hoa Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 12, name: "Xích Liên Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 13, name: "Thanh Vân Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 14, name: "Xích Hoa Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 15, name: "Tử Tiên Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 16, name: "Hỏa Vân Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 17, name: "Huyền Nguyệt Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 18, name: "Bạch Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 19, name: "Lam Ngọc Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 20, name: "Thanh Hoa Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 21, name: "Huyền Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 22, name: "Lam Linh Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 23, name: "Xích Ngọc Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 24, name: "Tử Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 25, name: "Bạch Nguyệt Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 26, name: "Huyền Liên Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 27, name: "Xích Tuyết Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 28, name: "Lam Vân Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 29, name: "Hỏa Hoa Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 30, name: "Lam Tiên Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 31, name: "Phấn Vân Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 32, name: "Tử Hoa Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 33, name: "Bạch Linh Kế", price: 500, starter: false },
  { kind: "hair", g: "f", idx: 34, name: "Xích Vân Kế", price: 0, starter: true },
  { kind: "hair", g: "f", idx: 35, name: "Lam Hoa Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 36, name: "Huyền Hoa Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 37, name: "Tử Nguyệt Kế", price: 150, starter: false },
  { kind: "hair", g: "f", idx: 38, name: "Lục Vân Kế", price: 300, starter: false },
  { kind: "hair", g: "f", idx: 39, name: "Phấn Hoa Kế", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 0, name: "Lam Long Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 1, name: "Xích Kiếm Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 2, name: "Lam Linh Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 3, name: "Tử Kiếm Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 4, name: "Mộc Kiếm Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 5, name: "Lam Vân Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 6, name: "Xích Vân Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 7, name: "Huyền Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 8, name: "Lục Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 9, name: "Tử Linh Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 10, name: "Mộc Đạo Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 11, name: "Ngân Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 12, name: "Xích Tiên Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 13, name: "Lam Tiên Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 14, name: "Tử Đạo Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 15, name: "Hỏa Đạo Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 16, name: "Mộc Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 17, name: "Bạch Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 18, name: "Lam Thiên Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 19, name: "Xích Đạo Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 20, name: "Tử Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 21, name: "Lam Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 22, name: "Mộc Linh Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 23, name: "Xích Linh Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 24, name: "Lam Huyền Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 25, name: "Lam Đạo Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 26, name: "Hỏa Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 27, name: "Xích Huyền Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 28, name: "Thanh Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 29, name: "Tử Tiên Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 30, name: "Mộc Vân Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 31, name: "Lam Kiếm Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 32, name: "Hỏa Vân Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 33, name: "Xích Bào", price: 0, starter: true },
  { kind: "robe", g: "m", idx: 34, name: "Ngân Đạo Bào", price: 300, starter: false },
  { kind: "robe", g: "m", idx: 35, name: "Lam Phong Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 36, name: "Hỏa Kiếm Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 37, name: "Lục Đạo Bào", price: 500, starter: false },
  { kind: "robe", g: "m", idx: 38, name: "Tử Vân Bào", price: 150, starter: false },
  { kind: "robe", g: "m", idx: 39, name: "Bạch Đạo Bào", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 0, name: "Lam Tiên Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 1, name: "Xích Hoa Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 2, name: "Bạch Hoa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 3, name: "Tử Sa Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 4, name: "Bạch Nguyệt Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 5, name: "Hỏa Hoa Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 6, name: "Lam Linh Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 7, name: "Xích Vân Thường", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 8, name: "Bạch Nghê Thường", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 9, name: "Ngân Sa Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 10, name: "Tử Vân Thường", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 11, name: "Bạch Vân Thường 2", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 12, name: "Xích Lưu Tiên Quần", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 13, name: "Bạch Lưu Tiên Quần", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 14, name: "Bạch Tiên Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 15, name: "Tử Hoa Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 16, name: "Xích Tiên Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 17, name: "Lam Vân Thường", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 18, name: "Hỏa Vân Thường", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 19, name: "Lam Lưu Tiên Quần", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 20, name: "Tử Linh Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 21, name: "Xích Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 22, name: "Bạch Linh Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 23, name: "Lục Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 24, name: "Lam Hoa Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 25, name: "Bạch Sa Y", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 26, name: "Hỏa Sa Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 27, name: "Lam Sa Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 28, name: "Bạch Thần Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 29, name: "Tử Lưu Tiên Quần", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 30, name: "Xích Nguyệt Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 31, name: "Bạch Vân Thường", price: 0, starter: true },
  { kind: "robe", g: "f", idx: 32, name: "Lam Nguyệt Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 33, name: "Bạch Vũ Y", price: 150, starter: false },
  { kind: "robe", g: "f", idx: 34, name: "Xích Linh Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 35, name: "Bạch Phượng Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 36, name: "Bích Sa Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 37, name: "Bạch Hậu Y", price: 300, starter: false },
  { kind: "robe", g: "f", idx: 38, name: "Tử Tiên Y", price: 500, starter: false },
  { kind: "robe", g: "f", idx: 39, name: "Bạch Sa Y 2", price: 500, starter: false },
];

// weapons (Xianxia Pixel Pack, CC0): for everyone (gender "a"); idx is the place in public/xianxia/weapons.json
export const DEFAULT_WEAPON = 60;
export const WEAPONS_SEED = [
  { kind: "weapon", g: "a", idx: 0, name: "Khách Binh I", price: 120, starter: false }, // blade_01_00
  { kind: "weapon", g: "a", idx: 1, name: "Khách Binh II", price: 120, starter: false }, // blade_01_01
  { kind: "weapon", g: "a", idx: 2, name: "Khách Binh III", price: 120, starter: false }, // blade_01_02
  { kind: "weapon", g: "a", idx: 3, name: "Khách Binh IV", price: 120, starter: false }, // blade_01_03
  { kind: "weapon", g: "a", idx: 4, name: "Khách Binh V", price: 120, starter: false }, // blade_01_04
  { kind: "weapon", g: "a", idx: 5, name: "Khách Binh VI", price: 120, starter: false }, // blade_01_05
  { kind: "weapon", g: "a", idx: 6, name: "Ám Binh I", price: 150, starter: false }, // dark_01_00
  { kind: "weapon", g: "a", idx: 7, name: "Ám Binh II", price: 150, starter: false }, // dark_01_01
  { kind: "weapon", g: "a", idx: 8, name: "Ám Binh III", price: 150, starter: false }, // dark_01_02
  { kind: "weapon", g: "a", idx: 9, name: "Ám Binh IV", price: 150, starter: false }, // dark_01_03
  { kind: "weapon", g: "a", idx: 10, name: "Ám Binh V", price: 150, starter: false }, // dark_01_04
  { kind: "weapon", g: "a", idx: 11, name: "Ám Binh VI", price: 150, starter: false }, // dark_01_05
  { kind: "weapon", g: "a", idx: 12, name: "Mộc Thiền Trượng", price: 0, starter: true }, // evo_chanzhang_00
  { kind: "weapon", g: "a", idx: 13, name: "Kim Liên Trượng", price: 400, starter: false }, // evo_chanzhang_01
  { kind: "weapon", g: "a", idx: 14, name: "Pháp Luân Trượng", price: 800, starter: false }, // evo_chanzhang_02
  { kind: "weapon", g: "a", idx: 15, name: "Đại Thừa Thiền Trượng", price: 1500, starter: false }, // evo_chanzhang_03
  { kind: "weapon", g: "a", idx: 16, name: "Đoản Đao", price: 150, starter: false }, // evo_dao_00
  { kind: "weapon", g: "a", idx: 17, name: "Huyết Lôi Đao", price: 400, starter: false }, // evo_dao_01
  { kind: "weapon", g: "a", idx: 18, name: "Xích Diễm Đao", price: 800, starter: false }, // evo_dao_02
  { kind: "weapon", g: "a", idx: 19, name: "Phượng Hoàng Đao", price: 1500, starter: false }, // evo_dao_03
  { kind: "weapon", g: "a", idx: 20, name: "Phất Trần", price: 0, starter: true }, // evo_fuchen_00
  { kind: "weapon", g: "a", idx: 21, name: "Kim Ti Phất Trần", price: 400, starter: false }, // evo_fuchen_01
  { kind: "weapon", g: "a", idx: 22, name: "Kim Vân Phất Trần", price: 800, starter: false }, // evo_fuchen_02
  { kind: "weapon", g: "a", idx: 23, name: "Thái Thanh Phất Trần", price: 1500, starter: false }, // evo_fuchen_03
  { kind: "weapon", g: "a", idx: 24, name: "Đồng Kích", price: 150, starter: false }, // evo_ji_00
  { kind: "weapon", g: "a", idx: 25, name: "Bạch Ngân Kích", price: 400, starter: false }, // evo_ji_01
  { kind: "weapon", g: "a", idx: 26, name: "Kim Quang Kích", price: 800, starter: false }, // evo_ji_02
  { kind: "weapon", g: "a", idx: 27, name: "Thái Dương Thần Kích", price: 1500, starter: false }, // evo_ji_03
  { kind: "weapon", g: "a", idx: 28, name: "Thiết Kiếm", price: 150, starter: false }, // evo_jian_00
  { kind: "weapon", g: "a", idx: 29, name: "Thanh Phong Kiếm", price: 400, starter: false }, // evo_jian_01
  { kind: "weapon", g: "a", idx: 30, name: "Băng Phách Kiếm", price: 800, starter: false }, // evo_jian_02
  { kind: "weapon", g: "a", idx: 31, name: "Thiên Lam Thần Kiếm", price: 1500, starter: false }, // evo_jian_03
  { kind: "weapon", g: "a", idx: 32, name: "Mộc Thương", price: 150, starter: false }, // evo_qiang_00
  { kind: "weapon", g: "a", idx: 33, name: "Tử Điện Thương", price: 400, starter: false }, // evo_qiang_01
  { kind: "weapon", g: "a", idx: 34, name: "Lôi Linh Thương", price: 800, starter: false }, // evo_qiang_02
  { kind: "weapon", g: "a", idx: 35, name: "Tử Tiêu Thần Thương", price: 1500, starter: false }, // evo_qiang_03
  { kind: "weapon", g: "a", idx: 36, name: "Trọng Binh I", price: 150, starter: false }, // heavy_01_00
  { kind: "weapon", g: "a", idx: 37, name: "Trọng Binh II", price: 150, starter: false }, // heavy_01_01
  { kind: "weapon", g: "a", idx: 38, name: "Trọng Binh III", price: 150, starter: false }, // heavy_01_02
  { kind: "weapon", g: "a", idx: 39, name: "Trọng Binh IV", price: 150, starter: false }, // heavy_01_03
  { kind: "weapon", g: "a", idx: 40, name: "Trọng Binh V", price: 150, starter: false }, // heavy_01_04
  { kind: "weapon", g: "a", idx: 41, name: "Trọng Binh VI", price: 150, starter: false }, // heavy_01_05
  { kind: "weapon", g: "a", idx: 42, name: "Viễn Binh I", price: 200, starter: false }, // ranged_01_00
  { kind: "weapon", g: "a", idx: 43, name: "Viễn Binh II", price: 200, starter: false }, // ranged_01_01
  { kind: "weapon", g: "a", idx: 44, name: "Viễn Binh III", price: 200, starter: false }, // ranged_01_02
  { kind: "weapon", g: "a", idx: 45, name: "Viễn Binh IV", price: 200, starter: false }, // ranged_01_03
  { kind: "weapon", g: "a", idx: 46, name: "Viễn Binh V", price: 200, starter: false }, // ranged_01_04
  { kind: "weapon", g: "a", idx: 47, name: "Viễn Binh VI", price: 200, starter: false }, // ranged_01_05
  { kind: "weapon", g: "a", idx: 48, name: "Pháp Khí I", price: 250, starter: false }, // relic_01_00
  { kind: "weapon", g: "a", idx: 49, name: "Pháp Khí II", price: 250, starter: false }, // relic_01_01
  { kind: "weapon", g: "a", idx: 50, name: "Pháp Khí III", price: 250, starter: false }, // relic_01_02
  { kind: "weapon", g: "a", idx: 51, name: "Pháp Khí IV", price: 250, starter: false }, // relic_01_03
  { kind: "weapon", g: "a", idx: 52, name: "Pháp Khí V", price: 250, starter: false }, // relic_01_04
  { kind: "weapon", g: "a", idx: 53, name: "Pháp Khí VI", price: 250, starter: false }, // relic_01_05
  { kind: "weapon", g: "a", idx: 54, name: "Pháp Bảo I", price: 250, starter: false }, // relic_02_00
  { kind: "weapon", g: "a", idx: 55, name: "Pháp Bảo II", price: 250, starter: false }, // relic_02_01
  { kind: "weapon", g: "a", idx: 56, name: "Pháp Bảo III", price: 250, starter: false }, // relic_02_02
  { kind: "weapon", g: "a", idx: 57, name: "Pháp Bảo IV", price: 250, starter: false }, // relic_02_03
  { kind: "weapon", g: "a", idx: 58, name: "Pháp Bảo V", price: 250, starter: false }, // relic_02_04
  { kind: "weapon", g: "a", idx: 59, name: "Pháp Bảo VI", price: 250, starter: false }, // relic_02_05
  { kind: "weapon", g: "a", idx: 60, name: "Trường Kiếm", price: 0, starter: true }, // tier1_a_00
  { kind: "weapon", g: "a", idx: 61, name: "Khảm Đao", price: 0, starter: true }, // tier1_a_01
  { kind: "weapon", g: "a", idx: 62, name: "Hồng Anh Thương", price: 0, starter: true }, // tier1_a_02
  { kind: "weapon", g: "a", idx: 63, name: "Phàm Binh IV", price: 100, starter: false }, // tier1_a_03
  { kind: "weapon", g: "a", idx: 64, name: "Phàm Binh V", price: 100, starter: false }, // tier1_a_04
  { kind: "weapon", g: "a", idx: 65, name: "Phàm Khí I", price: 100, starter: false }, // tier1_b_00
  { kind: "weapon", g: "a", idx: 66, name: "Phàm Khí II", price: 100, starter: false }, // tier1_b_01
  { kind: "weapon", g: "a", idx: 67, name: "Phàm Khí IV", price: 100, starter: false }, // tier1_b_03
  { kind: "weapon", g: "a", idx: 68, name: "Phàm Khí V", price: 100, starter: false }, // tier1_b_04
  { kind: "weapon", g: "a", idx: 69, name: "Phàm Khí VI", price: 100, starter: false }, // tier1_b_05
  { kind: "weapon", g: "a", idx: 70, name: "Linh Binh I", price: 300, starter: false }, // tier2_a_00
  { kind: "weapon", g: "a", idx: 71, name: "Linh Binh II", price: 300, starter: false }, // tier2_a_01
  { kind: "weapon", g: "a", idx: 72, name: "Linh Binh III", price: 300, starter: false }, // tier2_a_02
  { kind: "weapon", g: "a", idx: 73, name: "Linh Binh IV", price: 300, starter: false }, // tier2_a_03
  { kind: "weapon", g: "a", idx: 74, name: "Linh Binh V", price: 300, starter: false }, // tier2_a_04
  { kind: "weapon", g: "a", idx: 75, name: "Linh Khí I", price: 300, starter: false }, // tier2_b_00
  { kind: "weapon", g: "a", idx: 76, name: "Linh Khí II", price: 300, starter: false }, // tier2_b_01
  { kind: "weapon", g: "a", idx: 77, name: "Linh Khí IV", price: 300, starter: false }, // tier2_b_03
  { kind: "weapon", g: "a", idx: 78, name: "Linh Khí V", price: 300, starter: false }, // tier2_b_04
  { kind: "weapon", g: "a", idx: 79, name: "Linh Khí VI", price: 300, starter: false }, // tier2_b_05
  { kind: "weapon", g: "a", idx: 80, name: "Tiên Binh I", price: 800, starter: false }, // tier3_a_00
  { kind: "weapon", g: "a", idx: 81, name: "Tiên Binh II", price: 800, starter: false }, // tier3_a_01
  { kind: "weapon", g: "a", idx: 82, name: "Tiên Binh III", price: 800, starter: false }, // tier3_a_02
  { kind: "weapon", g: "a", idx: 83, name: "Tiên Binh IV", price: 800, starter: false }, // tier3_a_03
  { kind: "weapon", g: "a", idx: 84, name: "Tiên Binh V", price: 800, starter: false }, // tier3_a_04
  { kind: "weapon", g: "a", idx: 85, name: "Tiên Khí I", price: 800, starter: false }, // tier3_b_00
  { kind: "weapon", g: "a", idx: 86, name: "Tiên Khí II", price: 800, starter: false }, // tier3_b_01
  { kind: "weapon", g: "a", idx: 87, name: "Tiên Khí IV", price: 800, starter: false }, // tier3_b_03
  { kind: "weapon", g: "a", idx: 88, name: "Tiên Khí V", price: 800, starter: false }, // tier3_b_04
  { kind: "weapon", g: "a", idx: 89, name: "Tiên Khí VI", price: 800, starter: false }, // tier3_b_05
];
