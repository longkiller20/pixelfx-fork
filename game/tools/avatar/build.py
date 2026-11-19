#!/usr/bin/env python3
"""Build the character atlases in tools/assets/atlases/ from the artist's sheets in tools/avatar/src/ (then run
tools/assets/split.py: the game uses one folder per part, public/toc-nam/<idx>-<name>/ and so on). The base figure goes
straight to public/nhan-vat/than-goc.png.

  python3 tools/avatar/build.py        (needs Pillow and numpy)

src/base.png    the bald base figure, drawn large on a pixel grid of about 15.5 px; read back to its native 29 x 63
src/hair_m.png  40 hair styles for men, 8 x 5, transparent background   (hair_f.png: for women)
src/robe_m.png  40 robes for men, 8 x 5, transparent background         (robe_f.png: for women)

Every part is cut out, scaled down to the base figure's size and fitted onto it:
  - a robe stands on the base's feet, with its collar centred under the chin;
  - a hair style is slid over the head until it covers the scalp while leaving the eyes, nose and mouth clear.
The output is one atlas per sheet plus avatar.json: for each part, where it sits in its atlas and where it goes on the base.
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "atlases"))
BASE = os.path.normpath(os.path.join(HERE, "..", "..", "public", "nhan-vat", "than-goc.png"))
SCALE = 0.25  # sheet px -> base px, the same for every sheet (they were drawn at one size)
BASE_GRID = (15.52, 8.25, 8.0)  # pixel size and x, y offset of the base sheet's grid


# ---------------------------------------------------------------- the base figure
def read_base():
    a = np.array(Image.open(os.path.join(SRC, "base.png")).convert("RGBA"))
    px, ox, oy = BASE_GRID
    H, W = a.shape[:2]
    nx, ny = int((W - ox) / px), int((H - oy) / px)
    out = np.zeros((ny, nx, 4), np.uint8)
    for j in range(ny):
        for i in range(nx):
            # the middle of each cell, away from the soft edges between cells
            y0, y1 = int(oy + (j + 0.3) * px), int(oy + (j + 0.7) * px)
            x0, x1 = int(ox + (i + 0.3) * px), int(ox + (i + 0.7) * px)
            out[j, i] = np.median(a[y0:y1, x0:x1].reshape(-1, 4), axis=0)
    out[..., 3] = np.where(out[..., 3] > 128, 255, 0)
    ys, xs = np.nonzero(out[..., 3])
    return out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


# ---------------------------------------------------------------- cutting a sheet into 40 parts
def label(m):
    """4-connected components of a mask."""
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = n
        while q:
            y, x = q.popleft()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def cut_sheet(name):
    """Each piece goes to the 8 x 5 cell its centre falls in. Pieces that run into a neighbour's (a long tail touching the
    next row) are split by growing outward from each cell's centre, so every pixel joins the part it is joined to most
    closely."""
    a = np.array(Image.open(os.path.join(SRC, name + ".png")).convert("RGBA"))
    m = a[..., 3] > 100
    lab, n = label(m)
    H, W = m.shape
    cw, ch = W / 8, H / 5
    flat = lab.ravel()
    yy, xx = np.indices(m.shape)
    cnt = np.bincount(flat, minlength=n + 1)
    sy = np.bincount(flat, yy.ravel(), n + 1)
    sx = np.bincount(flat, xx.ravel(), n + 1)
    owner = np.full(n + 1, -1)
    for i in range(1, n + 1):
        if cnt[i] >= 20:
            owner[i] = int(sy[i] / cnt[i] // ch) * 8 + int(sx[i] / cnt[i] // cw)
    own = owner[lab]
    own[lab == 0] = -1
    for i in range(1, n + 1):
        if cnt[i] < 20:
            continue
        ys, xs = np.nonzero(lab == i)
        if xs.max() - xs.min() <= cw * 1.15 and ys.max() - ys.min() <= ch * 1.15:
            continue
        comp = lab == i
        q = deque()
        for k in range(40):
            cy, cx = (k // 8 + 0.5) * ch, (k % 8 + 0.5) * cw
            d = (ys - cy) ** 2 + (xs - cx) ** 2
            j = d.argmin()
            if d[j] < (0.3 * ch) ** 2:
                own[ys[j], xs[j]] = 1000 + k
                q.append((ys[j], xs[j]))
        own[comp & (own < 1000)] = -2
        while q:
            y, x = q.popleft()
            for y2, x2 in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= y2 < H and 0 <= x2 < W and own[y2, x2] == -2:
                    own[y2, x2] = own[y, x]
                    q.append((y2, x2))
        own[comp] -= 1000
    parts = []
    for k in range(40):
        mk = own == k
        ys, xs = np.nonzero(mk)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        p = a[y0:y1, x0:x1].copy()
        p[..., 3] = np.where(mk[y0:y1, x0:x1], 255, 0)
        parts.append(p)
    return parts


# ---------------------------------------------------------------- scaling down
def shrink(a, s):
    """Box-filter a part down by s: a pixel is solid when about half its block is, coloured by the solid pixels in it, and
    the rim is darkened back into an outline (the thin ink lines of the original wash out otherwise)."""
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
    m = cov / np.maximum(cnt, 1) > 0.45
    out = np.zeros((oh, ow, 4), np.float32)
    out[..., :3] = col / np.maximum(cov, 1)[..., None]
    out[..., 3] = m * 255
    pad = np.pad(m, 1)
    rim = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out[rim, :3] = out[rim, :3] * 0.45 + np.array([20, 12, 16]) * 0.55
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- fitting onto the base
def regions(base):
    """Masks on the base: the scalp a hair style must cover, and the face it should keep clear of (the face is drawn over
    any fringe anyway, so covering it is only a mild cost)."""
    BH, BW = base.shape[:2]
    solid = base[..., 3] > 0
    scalp, face, mouth = (np.zeros((BH, BW), bool) for _ in range(3))
    scalp[:11] = solid[:11]
    scalp[11:18, :8] = solid[11:18, :8]
    face[11:18, 12:27] = solid[11:18, 12:27]
    mouth[18:22, 17:28] = solid[18:22, 17:28]
    return scalp, face, mouth


def fit_hair(h, base, masks):
    scalp, face, mouth = masks
    BH, BW = base.shape[:2]
    hm = h[..., 3] > 0
    Hh, Wh = hm.shape
    best = None
    for dy in range(-Hh, BH):
        for dx in range(-Wh, BW):
            y0, y1, x0, x1 = max(0, dy), min(BH, dy + Hh), max(0, dx), min(BW, dx + Wh)
            if y1 <= y0 or x1 <= x0:
                continue
            cov = np.zeros((BH, BW), bool)
            cov[y0:y1, x0:x1] = hm[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
            loss = (scalp & ~cov).sum() * 1.5 + (face & cov).sum() * 0.6 + (mouth & cov).sum() * 0.3
            loss += max(0, -dy - 8) * 3  # not perched far above the skull
            if best is None or loss < best[0]:
                best = (loss, dx, dy)
    return best[1], best[2]


def fit_robe(r, base):
    """Hem on the floor; the collar (the top few rows) centred on the neck."""
    BH = base.shape[0]
    m = r[..., 3] > 0
    ys, xs = np.nonzero(m[: max(3, int(m.shape[0] * 0.06))])
    return int(round(15.5 - xs.mean())), BH - r.shape[0]


def main():
    os.makedirs(OUT, exist_ok=True)
    base = read_base()
    BH, BW = base.shape[:2]
    Image.fromarray(base).save(BASE)
    masks = regions(base)
    meta = {"base": {"w": BW, "h": BH, "ox": 15, "oy": BH}, "scale": SCALE}
    for key in ["hair_m", "hair_f", "robe_m", "robe_f"]:
        parts = [shrink(p, SCALE) for p in cut_sheet(key)]
        fits = [fit_hair(p, base, masks) if key.startswith("hair") else fit_robe(p, base) for p in parts]
        cw, ch = max(p.shape[1] for p in parts), max(p.shape[0] for p in parts)
        atlas = np.zeros((5 * ch, 8 * cw, 4), np.uint8)
        items = []
        for k, (p, (dx, dy)) in enumerate(zip(parts, fits)):
            h, w = p.shape[:2]
            x0, y0 = (k % 8) * cw, (k // 8) * ch
            atlas[y0 : y0 + h, x0 : x0 + w] = p
            items.append([x0, y0, w, h, int(dx), int(dy)])
        Image.fromarray(atlas).save(os.path.join(OUT, key + ".png"), optimize=True)
        meta[key] = items
        print(key, "->", atlas.shape[1], "x", atlas.shape[0])
    with open(os.path.join(OUT, "avatar.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
