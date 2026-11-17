#!/usr/bin/env python3
"""Draw the round frames of the action buttons, in the Xianxia pack's style (gold, ink outline, jade), as pixel art.

  python3 tools/xianxia/rings.py        (needs Pillow and numpy; writes public/xianxia/ui/ring_*.png)

The pack has square buttons and panels but no round frame, so these are drawn here, pixel by pixel: a bevelled metal band
lit from the top left, a dark ink outline inside and out, engraved notches along the band, gems set at the four (or eight)
points, and a thin coloured rim around the icon. The middle is left clear for the button's icon. Released as CC0 like the
pack.
"""
import math
import os

import numpy as np
from PIL import Image

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "xianxia", "ui"))
INK = (26, 14, 8)
METALS = {
    # dark, mid, light, highlight
    "gold": ((92, 52, 16), (160, 104, 34), (222, 168, 66), (255, 232, 150)),
    "silver": ((58, 64, 78), (118, 128, 146), (184, 194, 210), (240, 246, 255)),
    "jade": ((22, 70, 48), (44, 128, 86), (92, 192, 132), (196, 250, 210)),
}
GEMS = {
    "jade": ((16, 90, 60), (60, 210, 140), (210, 255, 230)),
    "azure": ((16, 56, 120), (80, 170, 255), (220, 244, 255)),
    "violet": ((60, 24, 110), (170, 110, 255), (240, 220, 255)),
    "sky": ((20, 90, 110), (110, 220, 240), (235, 255, 255)),
    "ruby": ((110, 10, 30), (230, 60, 70), (255, 210, 210)),
}
# name: (size in pixels, band metal, gem colour, gems at 4 or 8 points)
RINGS = {
    "ring_main": (64, "gold", "jade", 8),
    "ring_art_azure": (48, "gold", "azure", 4),
    "ring_art_violet": (48, "gold", "violet", 4),
    "ring_jump": (48, "silver", "sky", 4),
    "ring_item": (36, "jade", "ruby", 4),
}


def ring(n, metal, gem, points):
    c = n / 2
    ro = c - 0.5  # outer edge
    band = max(3.5, n / 11)  # band width
    ri = ro - 1 - band  # inner edge of the band
    img = np.zeros((n, n, 4), np.uint8)
    dk, md, lt, hi = METALS[metal]
    g0, g1, g2 = GEMS[gem]
    gem_r = ro - 1 - band / 2  # gem centres sit on the middle of the band
    gem_s = max(2, round(n / 16))
    # the four cardinal gems are full size; with eight, the diagonal ones are smaller studs
    gems = [
        (c + gem_r * math.cos(2 * math.pi * k / points - math.pi / 2), c + gem_r * math.sin(2 * math.pi * k / points - math.pi / 2), gem_s if k % (points // 4) == 0 else gem_s - 1.5)
        for k in range(points)
    ]
    for y in range(n):
        for x in range(n):
            px, py = x + 0.5 - c, y + 0.5 - c
            d = math.hypot(px, py)
            if d > ro:
                continue
            col = None
            if d > ro - 1:
                col = INK
            elif d > ri:
                # the band: lit from the top left on its outer half, from the bottom right on its inner half (a bevel)
                nx, ny = px / d, py / d
                light = -(nx * -0.6 + ny * -0.8)  # 1 where the band faces the light
                t = (d - ri) / band  # 0 inner .. 1 outer
                bevel = light if t > 0.5 else -light * 0.6
                v = bevel * 0.5 + 0.5
                col = hi if v > 0.86 else lt if v > 0.55 else md if v > 0.25 else dk
                # engraved notches every 15 degrees on the middle line of the band
                ang = (math.degrees(math.atan2(py, px)) + 360) % 15
                if abs(t - 0.5) < 0.22 and (ang < 1.6 or ang > 13.4):
                    col = dk if col != dk else INK
            elif d > ri - 1:
                col = INK
            elif d > ri - 2.2:
                col = g0  # a thin dark rim of the gem's colour around the icon
            if col is None:
                continue
            img[y, x] = (*col, 255)
    # gems: an inked diamond with a bright facet and a highlight
    for gx, gy, gs in gems:
        for y in range(n):
            for x in range(n):
                dx, dy = x + 0.5 - gx, y + 0.5 - gy
                m = abs(dx) + abs(dy)
                if m <= gs + 0.6:
                    img[y, x] = (*INK, 255)
                if m <= gs - 0.4:
                    img[y, x] = (*(g2 if dx + dy < -gs * 0.6 else g1 if dx + dy < 0.5 else g0), 255)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (n, metal, gem, points) in RINGS.items():
        Image.fromarray(ring(n, metal, gem, points)).save(os.path.join(OUT, name + ".png"), optimize=True)
        print(name, n)


if __name__ == "__main__":
    main()
