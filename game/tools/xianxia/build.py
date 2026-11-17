#!/usr/bin/env python3
"""Take what the game uses from the Xianxia Pixel Pack v2.1 (CC0) and put it in public/xianxia/.

  python3 tools/xianxia/build.py /path/to/Xianxia_Pixel_Pack        (needs Pillow and numpy)
  python3 tools/xianxia/build.py --pixelfx-only                     (just re-add pixelfx's weapons to the atlas)

  terrain.png + terrain.json   the bamboo (earth), bluestone (stone) and cloud (cloud platforms) sets, 32 px tiles,
                               one row per set, in the order of TILES below
  weapons.png + weapons.json   all 90 weapons, scaled to the characters' size, with where the hand holds each; then
                               pixelfx's own weapons (pixelfx-weapons.json, from pixelfx-weapons.mjs) after them
  bg/, ui/                     the buildings, far scenery and interface pieces the game uses, copied as they are
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

PACK = sys.argv[1] if len(sys.argv) > 1 else "Xianxia_Pixel_Pack"
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "xianxia"))
SETS = ["bamboo", "bluestone", "cloud"]
TILES = [
    "ground_top_L", "ground_top_M", "ground_top_M2", "ground_top_M3", "ground_top_R", "ground_top_S",
    "ground_body_L", "ground_body_M", "ground_body_M2", "ground_body_M3", "ground_body_R", "ground_body_S",
    "platform_top_L", "platform_top_M", "platform_top_M2", "platform_top_M3", "platform_top_R", "platform_top_S",
    "platform_under_L", "platform_under_M", "platform_under_R", "platform_under_S",
    "backwall_M", "backwall_M2", "backwall_M3",
]
BG = [
    "bg_xianxia_mid_03_01",  # golden palace: the temple on the terrace
    "bg_xianxia_mid_03_05",  # golden gate
    "bg_xianxia_mid_04_07",  # pagoda on the hill
    "bg_xianxia_far_03_00",  # palace on the clouds, far away
    "bg_xianxia_far_03_02",  # floating isle with a waterfall
    "bg_xianxia_far_04_00",  # gate of heaven on clouds
    "bg_xianxia_far_04_01",  # white pagoda on clouds
    "bg_xianxia_mid_04_06",  # immortal peach tree, by the market
    "bg_mid_02_04",  # scholar's rock
    "bg_xianxia_deco_01_01",  # orchids
    "bg_xianxia_deco_01_00",  # lingzhi mushrooms
]
UI = [
    "ui_xianxia_panel_01_ink", "ui_xianxia_panel_01_jade", "ui_xianxia_panel_01_silk", "ui_xianxia_panel_01_rosewood",
    "ui_xianxia_button_01_jade_normal", "ui_xianxia_button_01_jade_hover", "ui_xianxia_button_01_jade_pressed",
    "ui_xianxia_button_01_silk_normal", "ui_xianxia_button_01_silk_hover", "ui_xianxia_button_01_silk_pressed",
    "ui_xianxia_bar_01_frame", "ui_xianxia_bar_01_hp", "ui_xianxia_bar_01_mp", "ui_xianxia_bar_01_spirit",
    "ui_xianxia_01_corner_tl", "ui_xianxia_01_corner_tr", "ui_xianxia_01_corner_bl", "ui_xianxia_01_corner_br",
    "ui_xianxia_01_divider_cloud", "ui_xianxia_01_divider_jade", "ui_xianxia_01_cursor_sword",
    "ui_xianxia_item_pill_bottle", "ui_xianxia_item_spirit_stone", "ui_xianxia_item_gourd", "ui_xianxia_item_peach",
    "ui_xianxia_item_lingzhi", "ui_xianxia_item_token", "ui_xianxia_item_jade_slip", "ui_xianxia_item_furnace",
    "ui_xianxia_item_lantern", "ui_xianxia_item_compass", "ui_xianxia_item_talisman",
    "ui_xianxia_status_swift", "ui_xianxia_status_golden_shield", "ui_xianxia_status_burn", "ui_xianxia_status_freeze",
    "ui_xianxia_status_seal", "ui_xianxia_status_poison", "ui_xianxia_status_paralyze", "ui_xianxia_status_bleed",
]
WEAPON_SCALE = 0.45


def shrink(a, s):
    """Box-filter down by s: solid where about half the block is, coloured by its solid pixels; the rim darkened back
    into an outline so the thin ink lines don't wash out."""
    H, W = a.shape[:2]
    oh, ow = int(np.ceil(H * s)), int(np.ceil(W * s))
    al = (a[..., 3] > 128).astype(np.float32)
    rgb = a[..., :3].astype(np.float32) * al[..., None]
    ys = np.repeat((np.arange(H) * s).astype(int)[:, None], W, 1)
    xs = np.repeat((np.arange(W) * s).astype(int)[None, :], H, 0)
    cnt, cov, col = np.zeros((oh, ow)), np.zeros((oh, ow)), np.zeros((oh, ow, 3))
    np.add.at(cnt, (ys, xs), 1)
    np.add.at(cov, (ys, xs), al)
    np.add.at(col, (ys, xs), rgb)
    m = cov / np.maximum(cnt, 1) > 0.4
    out = np.zeros((oh, ow, 4), np.float32)
    out[..., :3] = col / np.maximum(cov, 1)[..., None]
    out[..., 3] = m * 255
    pad = np.pad(m, 1)
    rim = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out[rim, :3] = out[rim, :3] * 0.5 + np.array([24, 16, 20]) * 0.5
    return np.clip(out, 0, 255).astype(np.uint8)


# the action buttons' icons: one frame of a grey effect from the pack, tinted (dark, mid, light), cropped and fitted to 64 px
ICONS = {
    "skill_s1": ("xf_moon_arc", 1, ((10, 60, 50), (60, 220, 160), (230, 255, 240))),  # Kiếm Khí Trảm: a jade crescent cut
    "skill_s2": ("xf_flying_sword", 3, ((10, 40, 70), (80, 190, 255), (235, 250, 255))),  # Phi Kiếm: a ring of flying swords
    "skill_s3": ("xf_tribulation", 2, ((50, 20, 90), (200, 140, 255), (255, 250, 200))),  # Lôi Ấn Trận: tribulation lightning
    "skill_jump": ("xf_crane", 2, ((20, 50, 70), (170, 230, 255), (255, 255, 255))),  # Nhảy: a crane taking off
}


def skill_icons():
    for out, (name, frame, (d, m, l)) in ICONS.items():
        frames = sorted(os.listdir(os.path.join(PACK, "fx", name + "_frames")))
        a = np.array(Image.open(os.path.join(PACK, "fx", name + "_frames", frames[frame])).convert("RGBA")).astype(np.float32)
        ys, xs = np.nonzero(a[..., 3] > 40)
        a = a[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        lum = a[..., :3].mean(2, keepdims=True) / 255
        d, m, l = (np.array(c, np.float32) for c in (d, m, l))
        rgb = np.where(lum < 0.5, d + (m - d) * (lum / 0.5), m + (l - m) * ((lum - 0.5) / 0.5))
        img = Image.fromarray(np.dstack([rgb, a[..., 3:]]).clip(0, 255).astype(np.uint8))
        img.thumbnail((56, 56), Image.NEAREST)
        canvas = Image.new("RGBA", (64, 64))
        canvas.alpha_composite(img, ((64 - img.width) // 2, (64 - img.height) // 2))
        canvas.save(os.path.join(OUT, "ui", out + ".png"))


def append_pixelfx():
    """Add the weapons pixelfx draws (tools/xianxia/pixelfx-weapons.json) to the end of the weapons atlas, as a new row
    below the pack's. Any pixelfx weapons already there are dropped first, so running this twice changes nothing."""
    src = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pixelfx-weapons.json")))
    items = [i for i in json.load(open(os.path.join(OUT, "weapons.json"))) if not i["name"].startswith("pixelfx_")]
    sheet = np.array(Image.open(os.path.join(OUT, "weapons.png")).convert("RGBA"))
    top = max(i["y"] + i["h"] for i in items)
    sheet = sheet[:top]
    row_h = max(w["h"] for w in src)
    width = max(sheet.shape[1], sum(w["w"] + 2 for w in src))
    grown = np.zeros((top + row_h, width, 4), np.uint8)
    grown[:top, : sheet.shape[1]] = sheet
    x = 0
    for w in src:
        for j, row in enumerate(w["px"]):
            for k, c in enumerate(row.split(" ")):
                if c:
                    grown[top + j, x + k] = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
        item = {"name": w["name"], "x": x, "y": top, "w": w["w"], "h": w["h"], "gx": w["gx"], "gy": w["gy"]}
        if w.get("long") is not None:  # set only where the length alone would decide wrong (a bow, a whip)
            item["long"] = w["long"]
        items.append(item)
        x += w["w"] + 2
    Image.fromarray(grown).save(os.path.join(OUT, "weapons.png"), optimize=True)
    with open(os.path.join(OUT, "weapons.json"), "w") as f:
        json.dump(items, f, separators=(",", ":"))
    print("pixelfx weapons", len(src), "added; atlas", grown.shape[1], "x", grown.shape[0], len(items), "items")


def main():
    os.makedirs(os.path.join(OUT, "bg"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "ui"), exist_ok=True)
    # terrain: one row per set
    atlas = Image.new("RGBA", (32 * len(TILES), 32 * len(SETS)))
    for j, s in enumerate(SETS):
        for i, t in enumerate(TILES):
            atlas.paste(Image.open(os.path.join(PACK, "terrain", f"tr_xianxia_set_{s}_{t}.png")).convert("RGBA"), (i * 32, j * 32))
    atlas.save(os.path.join(OUT, "terrain.png"), optimize=True)
    with open(os.path.join(OUT, "terrain.json"), "w") as f:
        json.dump({"size": 32, "sets": SETS, "tiles": TILES}, f)
    # weapons: scaled, packed in rows, each with its grip (the hand's place: a fifth of the way along the shaft)
    names = sorted(n[:-4] for n in os.listdir(os.path.join(PACK, "weapons")) if n.endswith(".png"))
    parts = [shrink(np.array(Image.open(os.path.join(PACK, "weapons", n + ".png")).convert("RGBA")), WEAPON_SCALE) for n in names]
    cw, ch = max(p.shape[1] for p in parts), max(p.shape[0] for p in parts)
    cols = 10
    rows = (len(parts) + cols - 1) // cols
    sheet = np.zeros((rows * ch, cols * cw, 4), np.uint8)
    items = []
    for k, (n, p) in enumerate(zip(names, parts)):
        h, w = p.shape[:2]
        x0, y0 = (k % cols) * cw, (k // cols) * ch
        sheet[y0 : y0 + h, x0 : x0 + w] = p
        # the grip: for a sword-sized weapon on the handle, just behind the guard when there is one (a column much taller
        # than the handle's), else near the butt end; at the height the shaft runs through there
        heights = [(p[:, x, 3] > 0).sum() for x in range(w)]
        near = heights[: max(3, int(w * 0.45))]
        handle = float(np.median([v for v in near if v > 0] or [1]))
        guard = max(range(len(near)), key=lambda x: near[x])
        if w > 62:  # polearms and staves: held a quarter of the way up the shaft
            gx = round(w * 0.25)
        else:
            gx = max(2, guard - 3) if near[guard] >= handle * 1.8 and guard >= 5 else max(2, round(w * 0.14))
        col = np.nonzero(p[:, gx, 3])[0]
        gy = int(round(col.mean())) if len(col) else h // 2
        items.append({"name": n, "x": x0, "y": y0, "w": w, "h": h, "gx": gx, "gy": gy})
    Image.fromarray(sheet).save(os.path.join(OUT, "weapons.png"), optimize=True)
    with open(os.path.join(OUT, "weapons.json"), "w") as f:
        json.dump(items, f, separators=(",", ":"))
    for n in BG:
        shutil.copy(os.path.join(PACK, "backgrounds", n + ".png"), os.path.join(OUT, "bg", n + ".png"))
    for n in UI:
        shutil.copy(os.path.join(PACK, "ui", n + ".png"), os.path.join(OUT, "ui", n + ".png"))
    skill_icons()
    append_pixelfx()
    shutil.copy(os.path.join(PACK, "LICENSE.txt"), os.path.join(OUT, "LICENSE.txt"))
    print("terrain", atlas.size, "weapons", sheet.shape[1], "x", sheet.shape[0], len(items), "items")


if __name__ == "__main__":
    append_pixelfx() if PACK == "--pixelfx-only" else main()
