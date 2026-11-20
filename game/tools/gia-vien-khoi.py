#!/usr/bin/env python3
"""Cut the Gia Viên's building pictures out of tile sheets into one sheet, public/gia-vien/khoi.png, and write where
each one is to shared/gia-vien-khoi.js (name -> [x, y, w, h] in pixels). A block is one 32 px cell; furniture is w x h
cells, its picture padded to exactly that (standing on the bottom, centred), so the game anchors every picture the same
way: the bottom middle of its bottom-left cell.

Three styles, for a cultivation multiverse: the ancient East (the game's own sheets, the sunset temple, the classical
temple), the modern world (bricks, tiles, concrete, a modern home's furniture) and the far future (steel, lights,
machines). Every source is CC0; see public/gia-vien/CREDITS.md. The outside sheets are kept in tools/gia-vien-nguon/.

    python3 tools/gia-vien-khoi.py
"""
from pathlib import Path
from PIL import Image

G = Path(__file__).resolve().parent.parent
N = G / "tools/gia-vien-nguon"
T = 32
open_ = lambda p: Image.open(p).convert("RGBA")

TT = open_(G / "public/maps/tiles/terrain.png")    # Frogatto's old tile art, 16 px
XT = open_(G / "public/xianxia/terrain.png")       # Xianxia Pixel Pack, 32 px: rows bamboo, bluestone, cloud, redclay
RF = open_(G / "public/maps/tiles/roof.png")       # Oriental Roof Tiles: grey, blue, red, jade, 114 px apart
ER = open_(N / "eris-scifi.png")                   # Eris, Sci-fi platform tiles, 32 px
TB = open_(N / "techblocks.png")                   # bart, Sci-fi platformer tiles (techblocks), 32 px
ST = open_(N / "sunset-temple.png")                # Pyromantic, Sunset Temple tiles
CT = open_(N / "classical-temple.png")             # surt, Classical temple tiles, 16 px
SB = open_(N / "sandy-bricks.png")                 # Sandy bricks tile set, 32 px
BB = open_(N / "basic-bricks.png")                 # Basic bricks: six 32 px tiles, 1 px apart
CM = open_(N / "comm-terminal.png")                # Communication terminal, drawn at 2x
CL = lambda n: open_(N / "crimelike" / f"{n}.png")  # Crimelike furniture, 32 px

def crop(img, x, y, w, h):
    return img.crop((x, y, x + w, y + h))
def tt(x, y):  # a 16 px cell of the Frogatto sheet, doubled
    return crop(TT, x, y, 16, 16).resize((T, T), Image.NEAREST)
def xt(tile, row):  # a Xianxia tile by its index in terrain.json's list, from a set's row
    return crop(XT, tile * T, row * T, T, T)
def rf(k, part):  # a roof colour's tiles (rows of scales) or its scalloped eave
    return crop(RF, 90, k * 114 + (50 if part == "tile" else 80), T, T)
def cell(img, cx, cy, w=1, h=1):  # cells of a 32 px sheet
    return crop(img, cx * T, cy * T, w * T, h * T)
def shrink(img, x, y, s):  # a big framed panel (s px square) brought down to one 32 px block
    return crop(img, x, y, s, s).resize((T, T), Image.BOX)
def side(*imgs):  # pictures side by side
    out = Image.new("RGBA", (sum(i.width for i in imgs), max(i.height for i in imgs)))
    x = 0
    for i in imgs:
        out.alpha_composite(i, (x, out.height - i.height))
        x += i.width
    return out
def trim(img):  # cut the empty margin off
    return img.crop(img.getbbox())
def x2(img):  # doubled, crisp
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)
# name: (picture, cells wide, cells high). Names are what shared/gia-vien.js calls them.
P = {
    # ---- the ancient East: the game's own sheets
    "plank": (tt(16, 64), 1, 1),            # Ván Gỗ
    "crate": (tt(64, 64), 1, 1),            # Thùng Gỗ
    "grey": (tt(32, 80), 1, 1),             # Đá Xám
    "sand": (tt(48, 80), 1, 1),             # Đá Cát
    "bluestone": (xt(7, 1), 1, 1),          # Đá Xanh (ground_body_M)
    "redclay": (xt(7, 3), 1, 1),            # Đất Nung
    "roof_grey": (rf(0, "tile"), 1, 1),     # Ngói xám, lam, đỏ, ngọc
    "roof_blue": (rf(1, "tile"), 1, 1),
    "roof_red": (rf(2, "tile"), 1, 1),
    "roof_jade": (rf(3, "tile"), 1, 1),
    "eave_grey": (rf(0, "eave"), 1, 1),     # Hiên ngói (the scalloped edge)
    "eave_blue": (rf(1, "eave"), 1, 1),
    "eave_red": (rf(2, "eave"), 1, 1),
    "eave_jade": (rf(3, "eave"), 1, 1),
    "cloud_plat": (xt(13, 2), 1, 1),        # Vân Đài (platform_top_M of the cloud set)
    "wall_blue": (xt(22, 1), 1, 1),         # Vách Đá Xanh (backwall_M)
    "wall_red": (xt(22, 3), 1, 1),          # Vách Đất Nung
    "barrel": (tt(0, 128), 1, 1),           # Thùng Rượu
    "chest": (tt(16, 128), 1, 1),           # Rương
    "logend": (tt(48, 64), 1, 1),           # Gỗ Tròn
    # ---- temples (Đền Đài): the sunset temple's dusk-violet stone, the classical temple's marble
    "temple_brick": (cell(ST, 0, 8), 1, 1),                 # Gạch Đền
    "temple_pillar": (cell(ST, 1, 3, 1, 3), 1, 3),          # Cột Đền
    "temple_banner": (cell(ST, 6, 6, 2, 4), 2, 4),          # Phướn Đền
    "temple_relief": (cell(ST, 1, 7, 4, 4), 4, 4),          # Phù Điêu
    "marble_wall": (crop(CT, 288, 304, T, T), 1, 1),        # Đá Cẩm Thạch
    "marble_column": (trim(crop(CT, 64, 384, 16, 96)), 1, 3),  # Cột Cẩm Thạch
    "marble_statue": (x2(trim(crop(CT, 256, 384, 16, 32))), 1, 2),  # Tượng Thần, doubled
    "marble_altar": (trim(crop(CT, 256, 352, 32, 32)), 1, 1),  # Bàn Đá
    # ---- the modern world (Hiện Đại)
    "brick_grey": (crop(SB, 192, 0, T, T), 1, 1),           # Gạch Xám
    **{f"tile_{i}": (crop(BB, 1 + 33 * i, 1, T, T), 1, 1) for i in range(6)},  # Đá Ong, Gạch Hoa ...
    "concrete": (shrink(ER, 384, 160, 96), 1, 1),             # Bê Tông
    "sofa": (side(CL("sofa_up_1"), CL("sofa_up_2")), 2, 1),
    "bed_modern": (side(CL("bed_wooden_e"), CL("bed_wooden_w")), 2, 1),
    "pool_table": (side(CL("pooltable_e"), CL("pooltable_w")), 2, 1),
    "bathtub": (CL("bath_full_w"), 1, 1),
    "kitchen": (CL("counter_metal"), 1, 1),
    "counter": (CL("counter_wooden_red2"), 1, 1),
    "desk": (CL("desk1"), 1, 1),
    "stove": (CL("oven1"), 1, 1),
    "piano": (CL("organ"), 1, 1),
    "speaker": (CL("speaker"), 1, 1),
    "hifi": (CL("hifi"), 1, 1),
    # ---- the far future (Khoa Huyễn)
    "steel_bevel": (cell(TB, 0, 2), 1, 1),                  # Thép Vát
    "steel_vent": (cell(TB, 1, 2), 1, 1),                   # Khối Tản Nhiệt
    "steel_rivet": (cell(TB, 0, 3), 1, 1),                  # Thép Đinh Tán
    "steel_frame": (cell(TB, 2, 3), 1, 1),                  # Khung Thép
    "steel_plate": (cell(TB, 4, 3), 1, 1),                  # Vách Thép
    "steel_cross": (cell(TB, 6, 3), 1, 1),                  # Vách Mạch
    "steel_grille": (cell(TB, 7, 2), 1, 1),                 # Vách Lưới
    "light_block": (shrink(ER, 480, 160, 96), 1, 1),          # Khối Đèn Lam
    "hazard": (shrink(ER, 576, 256, 96), 1, 1),               # Khối Cảnh Báo
    "rust_block": (shrink(ER, 576, 160, 96), 1, 1),           # Khối Gỉ Sét
    "steel_floor": (cell(ER, 1, 6), 1, 1),                  # Sàn Thép
    "server": (cell(ER, 0, 2, 2, 2), 2, 2),                 # Máy Chủ
    "console": (cell(ER, 2, 4, 1, 2), 1, 2),                # Tủ Điều Khiển
    "metal_box": (cell(ER, 3, 5), 1, 1),                    # Hộp Kim Loại
    "terminal": (CM.resize((T, T), Image.NEAREST), 1, 1),   # Trạm Truyền Tin
}

# pack: one row per height, left to right, 32 columns wide
COLS = 32
order = sorted(P.items(), key=lambda kv: (kv[1][2], 0))  # by height, else as listed
rows, pos, x, y, rowh, lasth = [], {}, 0, 0, 0, None
for name, (img, w, h) in order:
    if lasth is not None and (h != lasth or x + w > COLS):
        y += rowh
        x, rowh = 0, 0
    pos[name] = (x, y, w, h)
    x += w
    rowh = max(rowh, h)
    lasth = h
H = y + rowh

out = Image.new("RGBA", (COLS * T, H * T), (0, 0, 0, 0))
for name, (img, w, h) in P.items():
    cx, cy, _, _ = pos[name]
    W, HH = w * T, h * T
    if img.width > W or img.height > HH:
        raise SystemExit(f"{name}: {img.size} does not fit {w}x{h} cells")
    out.alpha_composite(img, (cx * T + (W - img.width) // 2, cy * T + HH - img.height))
out.save(G / "public/gia-vien/khoi.png")

js = ["// Where each building picture is in public/gia-vien/khoi.png: [x, y, w, h] in pixels. Made by tools/gia-vien-khoi.py.",
      "export const KHOI = {"]
for name in P:
    cx, cy, w, h = pos[name]
    js.append(f"  {name}: [{cx * T}, {cy * T}, {w * T}, {h * T}],")
js.append("};")
(G / "shared/gia-vien-khoi.js").write_text("\n".join(js) + "\n")
print(len(P), "pictures ->", G / "public/gia-vien/khoi.png", out.size)
