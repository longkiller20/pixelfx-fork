#!/usr/bin/env python3
"""The Gamer house (Nhà Game Thủ): its picture brought to the game's size, and where its lights are.

The source (tools/gia-vien-nguon/nha-gamer.png, the user's picture, background already transparent) is drawn far bigger
than the game's people. It is shrunk to 0.45 across; down, each storey is shrunk so its floor lands exactly on a cell
line, three cells (96 px) apart, so people stand on the floors (planks on the server's grid) right where they are drawn:

    source y   0 .. 395   roof and top storey    x 0.45
             395 .. 600   middle storey          to 96 px
             600 .. 820   ground storey          to 96 px
             820 .. end   the base               x 0.45

Writes public/gia-vien/nha/gamer.png, and src/fx/home/_gamer.js: the neon tubes found in the picture (bright, saturated
cyan, magenta, orange runs), in the picture's own pixels, for the pixelfx effect home/gamer-house that makes them glow.

    python3 tools/gia-vien-nha.py
"""
from pathlib import Path
from PIL import Image
import numpy as np

G = Path(__file__).resolve().parent.parent
SRC = G / "tools/gia-vien-nguon/nha-gamer.png"
S = 0.45
BANDS = [(0, 395, None), (395, 600, 96), (600, 820, 96), (820, None, None)]  # (from, to, out height or None: x S)

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
out.save(G / "public/gia-vien/nha/gamer.png")

def my(sy):  # a source y in the picture as made
    for a, b, o0, o1 in ys:
        if a <= sy <= b:
            return o0 + (sy - a) * (o1 - o0) / (b - a)
    return ys[-1][3]
mx = lambda sx: sx * S

# ---- the neon tubes: runs of bright, saturated colour, long and thin
a = np.array(im).astype(int)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
mx3, mn3 = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
bright = (al > 200) & (mx3 > 225) & (mx3 - mn3 > 90)
kind = np.zeros(r.shape, int)
kind[bright & (b > 200) & (g > 170) & (r < 170)] = 1      # cyan
kind[bright & (r > 200) & (b > 170) & (g < 150)] = 2      # magenta
kind[bright & (r > 220) & (g > 120) & (b < 110)] = 3      # orange
from collections import deque
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
js.append(f"export const BANDS = {[[a, b, o0, o1] for a, b, o0, o1 in ys]};")
(G.parent / "src/fx/home/_gamer.js").write_text("\n".join(js) + "\n")
print("picture", out.size, "tubes", len(tubes))
