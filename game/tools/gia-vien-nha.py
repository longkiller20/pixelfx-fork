#!/usr/bin/env python3
"""Ready-made houses drawn as one picture: each brought to the game's size, and where its lights are.

A source (tools/gia-vien-nguon/<file>, the user's picture, background already transparent) is drawn far bigger than the
game's people. It is shrunk to 0.45 across; down, each storey is shrunk so its floor lands exactly on a cell line, so
people stand on the floors (planks on the server's grid) right where they are drawn. BANDS lists them: (source y from,
to, out height in px or None for x 0.45). The Gamer house:

    source y   0 .. 395   roof and top storey    x 0.45
             395 .. 600   middle storey          to 96 px (three cells: one jump)
             600 .. 820   ground storey          to 96 px
             820 .. end   the base               x 0.45

Writes public/gia-vien/nha/<id>.png, and src/fx/home/_<id>.js for its pixelfx effect: the size, the bands (to place
things given in the source's pixels) and the lights found in the picture: neon tubes (bright, saturated cyan, magenta,
orange runs) for the Gamer house; lamps (bright warm blobs: lanterns, chandeliers, the base's lights) for Tiên Phủ.

    python3 tools/gia-vien-nha.py            every house
    python3 tools/gia-vien-nha.py tien_phu   one
"""
from pathlib import Path
from PIL import Image
import numpy as np

import sys
from collections import deque

G = Path(__file__).resolve().parent.parent
S = 0.45
HOUSES = {
    "gamer": {"src": "nha-gamer.png", "js": "_gamer.js", "bands": [(0, 395, None), (395, 600, 96), (600, 820, 96), (820, None, None)], "lights": "neon"},
    # Tiên Phủ: the top storey is lower (its floor 64 px over the middle one), the ground storey a jump under it
    "tien_phu": {"src": "nha-tien-phu.png", "js": "_tien-phu.js", "bands": [(0, 388, None), (388, 552, 64), (552, 768, 96), (768, None, None)], "lights": "lamps"},
}


def make(hid, cfg):
    SRC = G / "tools/gia-vien-nguon" / cfg["src"]
    BANDS = cfg["bands"]

    im = Image.open(SRC).convert("RGBA")
    W0, H0 = im.size
    W = round(W0 * S)
    parts, ys = [], []  # ys: (src y0, src y1, out y0, out y1) to map coordinates
    oy = 0
    for a, b, h in BANDS:
        b = H0 if b is None else b
        hh = h if h is not None else round((b - a) * S)
        # premultiplied, so the transparent edges don't bleed dark
        band = im.crop((0, a, W0, b)).resize((W, hh), Image.LANCZOS, reducing_gap=3.0)
        parts.append(band)
        ys.append((a, b, oy, oy + hh))
        oy += hh
    out = Image.new("RGBA", (W, oy))
    y = 0
    for p in parts:
        out.alpha_composite(p, (0, y))
        y += p.height
    out.save(G / f"public/gia-vien/nha/{hid}.png")

    def my(sy):  # a source y in the picture as made
        for a, b, o0, o1 in ys:
            if a <= sy <= b:
                return o0 + (sy - a) * (o1 - o0) / (b - a)
        return ys[-1][3]
    mx = lambda sx: sx * S
    bands_js = f"export const BANDS = {[[a, b, o0, o1] for a, b, o0, o1 in ys]};"
    if cfg["lights"] == "lamps":
        return lamps(hid, cfg, im, W, oy, mx, my, bands_js)

    # ---- the neon tubes: runs of bright, saturated colour, long and thin
    a = np.array(im).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx3, mn3 = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    bright = (al > 200) & (mx3 > 225) & (mx3 - mn3 > 90)
    kind = np.zeros(r.shape, int)
    kind[bright & (b > 200) & (g > 170) & (r < 170)] = 1      # cyan
    kind[bright & (r > 200) & (b > 170) & (g < 150)] = 2      # magenta
    kind[bright & (r > 220) & (g > 120) & (b < 110)] = 3      # orange
    seen = np.zeros(r.shape, bool)
    tubes = []
    H, Wd = r.shape
    for y0 in range(H):
        for x0 in range(Wd):
            k = kind[y0, x0]
            if not k or seen[y0, x0]:
                continue
            q, pts = deque([(y0, x0)]), []
            seen[y0, x0] = True
            while q:
                yy, xx = q.popleft()
                pts.append((yy, xx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    ny, nx = yy + dy, xx + dx
                    if 0 <= ny < H and 0 <= nx < Wd and not seen[ny, nx] and kind[ny, nx] == k:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(pts) < 40:
                continue
            P = np.array(pts)
            ya, yb, xa, xb = P[:, 0].min(), P[:, 0].max(), P[:, 1].min(), P[:, 1].max()
            w, h = xb - xa + 1, yb - ya + 1
            if max(w, h) < 24 or max(w, h) / max(1, min(w, h)) < 3.2:
                # not a tube (a sign, a screen, an icon): left to the effect's own pieces
                continue
            # a slanted tube: its two ends, from how its pixels lie
            cov = np.cov(P[:, 1], P[:, 0])
            slant = abs(cov[0, 1]) / np.sqrt(cov[0, 0] * cov[1, 1] + 1e-9) > 0.8
            if slant and cov[0, 1] < 0:
                e = ((xa, yb), (xb, ya))
            elif slant:
                e = ((xa, ya), (xb, yb))
            elif w >= h:
                e = ((xa, (ya + yb) / 2), (xb, (ya + yb) / 2))
            else:
                e = (((xa + xb) / 2, ya), ((xa + xb) / 2, yb))
            tubes.append([round(mx(e[0][0]), 1), round(my(e[0][1]), 1), round(mx(e[1][0]), 1), round(my(e[1][1]), 1), int(k)])
    # one tube found twice (its bright core and its rim): the same colour, lying along the same line, overlapping: one
    def same(a, b):
        if a[4] != b[4]:
            return False
        ha, hb = a[1] == a[3], b[1] == b[3]
        va, vb = a[0] == a[2], b[0] == b[2]
        if ha and hb and abs(a[1] - b[1]) <= 3:
            return min(a[2], b[2]) >= max(a[0], b[0]) - 2
        if va and vb and abs(a[0] - b[0]) <= 3:
            return min(a[3], b[3]) >= max(a[1], b[1]) - 2
        return False
    merged = True
    while merged:
        merged = False
        for i in range(len(tubes)):
            for j in range(i + 1, len(tubes)):
                A, B = tubes[i], tubes[j]
                if same(A, B):
                    if A[1] == A[3]:
                        y = round((A[1] + B[1]) / 2, 1)
                        tubes[i] = [min(A[0], B[0]), y, max(A[2], B[2]), y, A[4]]
                    else:
                        x = round((A[0] + B[0]) / 2, 1)
                        tubes[i] = [x, min(A[1], B[1]), x, max(A[3], B[3]), A[4]]
                    del tubes[j]
                    merged = True
                    break
            if merged:
                break
    tubes.sort(key=lambda t: (t[1], t[0]))

    js = ["// The Gamer house's neon tubes, found in its picture by game/tools/gia-vien-nha.py: [x0, y0, x1, y1, colour] in the",
          "// picture's pixels (public/gia-vien/nha/gamer.png), colour 1 cyan, 2 magenta, 3 orange. Do not edit by hand.",
          f"export const SIZE = [{W}, {oy}];",
          "export const TUBES = ["]
    js += [f"  [{', '.join(str(v) for v in t)}]," for t in tubes]
    js.append("];")
    js.append("/** A spot in the source picture (as drawn, 1774 x 887) in the picture's pixels. */")
    js.append(bands_js)
    (G.parent / "src/fx/home" / cfg["js"]).write_text("\n".join(js) + "\n")
    print(hid, "picture", out.size, "tubes", len(tubes))


def blobs(mask, min_px):
    """Connected bright spots of a mask: (cx, cy, size in px, w, h) each, in the source's pixels."""
    H, W = mask.shape
    seen = np.zeros(mask.shape, bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        q, pts = deque([(y0, x0)]), []
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(pts) >= min_px:
            P = np.array(pts)
            out.append((P[:, 1].mean(), P[:, 0].mean(), len(pts), P[:, 1].max() - P[:, 1].min() + 1, P[:, 0].max() - P[:, 0].min() + 1))
    return out


def lamps(hid, cfg, im, W, oy, mx, my, bands_js):
    """The warm lights of a picture (lanterns, chandeliers, lamps): bright, warm, a blob each."""
    a = np.array(im).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    warm = (al > 200) & (r > 240) & (g > 205) & (b < 200) & (r - b > 70)
    found = []
    for cx, cy, n, w, h in blobs(warm, 110):
        if w > 120 or h > 120:
            continue  # a big lit wall, not a lamp
        found.append([round(mx(cx), 1), round(my(cy), 1), round(min(14, max(3, (n ** 0.5) * S * 1.1)), 1)])
    found.sort(key=lambda l: (l[1], l[0]))
    js = [f"// {hid}'s lamps, found in its picture by game/tools/gia-vien-nha.py: [x, y, size] in the picture's pixels",
          f"// (public/gia-vien/nha/{hid}.png). Do not edit by hand.",
          f"export const SIZE = [{W}, {oy}];",
          "export const LAMPS = ["]
    js += [f"  [{', '.join(str(v) for v in l)}]," for l in found]
    js.append("];")
    js.append("/** How the source picture's rows map to this one's: [source y0, y1, out y0, y1], a band per storey. */")
    js.append(bands_js)
    (G.parent / "src/fx/home" / cfg["js"]).write_text("\n".join(js) + "\n")
    print(hid, "picture", (W, oy), "lamps", len(found))


for hid, cfg in HOUSES.items():
    if len(sys.argv) < 2 or hid in sys.argv[1:]:
        make(hid, cfg)
