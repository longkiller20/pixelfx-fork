#!/usr/bin/env python3
"""Cut the Gia Viên's building blocks out of the game's tile sheets into one strip, public/gia-vien/khoi.png: one
32 x 32 tile each, in the order of ATLAS below (shared/gia-vien.js refers to them by that number). The 16 px tiles of the
Frogatto sheet are doubled; the Xianxia and roof tiles are already 32 px. Everything here is CC0 (see CREDITS.md).

    python3 tools/gia-vien-khoi.py
"""
from pathlib import Path
from PIL import Image

G = Path(__file__).resolve().parent.parent
TT = Image.open(G / "public/maps/tiles/terrain.png").convert("RGBA")   # Frogatto's old tile art, 16 px
XT = Image.open(G / "public/xianxia/terrain.png").convert("RGBA")      # Xianxia Pixel Pack, 32 px: rows bamboo, bluestone, cloud, redclay
RF = Image.open(G / "public/maps/tiles/roof.png").convert("RGBA")      # Oriental Roof Tiles: grey, blue, red, jade, 114 px apart

def tt(x, y):  # a 16 px cell of the Frogatto sheet, doubled
    return TT.crop((x, y, x + 16, y + 16)).resize((32, 32), Image.NEAREST)
def xt(tile, row):  # a Xianxia tile by its index in terrain.json's list, from a set's row
    return XT.crop((tile * 32, row * 32, tile * 32 + 32, row * 32 + 32))
def rf(k, part):  # a roof colour's tiles (rows of scales) or its scalloped eave
    y = k * 114 + (50 if part == "tile" else 80)
    return RF.crop((90, y, 122, y + 32))

# index: (what, picture)
ATLAS = [
    ("plank", tt(16, 64)),        # 0 Ván Gỗ
    ("crate", tt(64, 64)),        # 1 Thùng Gỗ
    ("grey", tt(32, 80)),         # 2 Đá Xám
    ("sand", tt(48, 80)),         # 3 Đá Cát
    ("bluestone", xt(7, 1)),      # 4 Đá Xanh (ground_body_M)
    ("redclay", xt(7, 3)),        # 5 Đất Nung
    ("roof_grey", rf(0, "tile")), # 6..9 Ngói xám, lam, đỏ, ngọc
    ("roof_blue", rf(1, "tile")),
    ("roof_red", rf(2, "tile")),
    ("roof_jade", rf(3, "tile")),
    ("eave_grey", rf(0, "eave")), # 10..13 Hiên ngói (the scalloped edge)
    ("eave_blue", rf(1, "eave")),
    ("eave_red", rf(2, "eave")),
    ("eave_jade", rf(3, "eave")),
    ("cloud_plat", xt(13, 2)),    # 14 Vân Đài (platform_top_M of the cloud set)
    ("wall_blue", xt(22, 1)),     # 15 Vách Đá Xanh (backwall_M)
    ("wall_red", xt(22, 3)),      # 16 Vách Đất Nung
    ("barrel", tt(0, 128)),       # 17 Thùng Rượu
    ("chest", tt(16, 128)),       # 18 Rương
    ("logend", tt(48, 64)),       # 19 Gỗ Tròn
]

out = Image.new("RGBA", (32 * len(ATLAS), 32), (0, 0, 0, 0))
for i, (_, img) in enumerate(ATLAS):
    out.alpha_composite(img, (i * 32, 0))
out.save(G / "public/gia-vien/khoi.png")
print(len(ATLAS), "tiles ->", G / "public/gia-vien/khoi.png")
