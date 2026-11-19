"""Cut the 30 flying swords (phi kiếm, for ngự kiếm phi hành) out of source.png into tools/assets/atlases/swords.png + .json
(then run tools/assets/split.py: each sword gets its folder in public/phi-kiem/).

source.png is a 6 x 5 sheet of swords painted on a soft, glowing backdrop. Each cell's sword is found by its detail: the
backdrop is smooth, the sword's pixels are sharp, so a pixel is kept where the colour changes fast between neighbours
(closed and hole-filled), or where it stands well apart from the backdrop's colour right beside the sword. The glow is
left behind. Each sword is then trimmed and scaled down by SCALE (the sheet is painted at about three screen pixels per
art pixel) and packed in a row. Run: python3 tools/swords/build.py
"""
from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "atlases"
UI = HERE.parent.parent / "public" / "xianxia" / "ui"
COLS, ROWS, SCALE = 6, 5, 3
EDGE, APART = 40, 60  # how sharp a change marks the sword; how far from the backdrop's colour still counts as sword


def grow(m, r):
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                o |= np.roll(np.roll(m, dy, 0), dx, 1)
    return o


def shrink(m, r):
    return ~grow(~m, r)


def box(x, r):
    pad = ((r + 1, r), (r + 1, r)) + ((0, 0),) * (x.ndim - 2)
    c = np.cumsum(np.cumsum(np.pad(x, pad), 0), 1)
    return c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]


def fill_small(m, most):
    """Fill the holes in m no bigger than `most` pixels (a speck of flat colour inside the sword, not the gap in a ring)."""
    h, w = m.shape
    seen, m = m.copy(), m.copy()
    for sy in range(h):
        for sx in range(w):
            if seen[sy, sx]:
                continue
            comp, q, edge = [(sy, sx)], deque([(sy, sx)]), False
            seen[sy, sx] = True
            while q:
                y, x = q.popleft()
                edge |= y in (0, h - 1) or x in (0, w - 1)
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
                        comp.append((ny, nx))
            if not edge and len(comp) <= most:
                for y, x in comp:
                    m[y, x] = True
    return m


def cut(a):
    gx, gy = np.zeros(a.shape[:2]), np.zeros(a.shape[:2])
    gx[:, 1:] = np.abs(np.diff(a, axis=1)).sum(2)
    gy[1:, :] = np.abs(np.diff(a, axis=0)).sum(2)
    m = shrink(grow(np.maximum(gx, gy) > EDGE, 3), 3)
    # the backdrop right beside the sword: the blurred colour of the pixels that aren't sword
    w = (~grow(m, 2)).astype(float)
    est = box(a * w[..., None], 14) / np.maximum(box(w, 14), 1e-3)[..., None]
    m |= (np.abs(a - est).sum(2) > APART) & grow(m, 5)
    m = shrink(fill_small(m, 80), 1)
    return near_main(m, 14)


def parts(m):
    """The connected pieces of m, biggest first."""
    h, w = m.shape
    seen, out = ~m, []
    for sy, sx in zip(*np.nonzero(m)):
        if seen[sy, sx]:
            continue
        comp, q = [(sy, sx)], deque([(sy, sx)])
        seen[sy, sx] = True
        while q:
            y, x = q.popleft()
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
                        comp.append((ny, nx))
        out.append(comp)
    return sorted(out, key=len, reverse=True)


def near_main(m, r):
    """Keep the sword itself and the bits close to it (petals, sparks); drop specks of the next row's swords."""
    ps = parts(m)
    main = np.zeros_like(m)
    for y, x in ps[0]:
        main[y, x] = True
    reach, out = grow(main, r), main.copy()
    for p in ps[1:]:
        if any(reach[y, x] for y, x in p):
            for y, x in p:
                out[y, x] = True
    return out


def main():
    src = np.asarray(Image.open(HERE / "source.png").convert("RGB")).astype(float)
    H, W, _ = src.shape
    swords = []
    for r in range(ROWS):
        for c in range(COLS):
            y0, y1, x0, x1 = H * r // ROWS, H * (r + 1) // ROWS, W * c // COLS, W * (c + 1) // COLS
            a = src[y0:y1, x0:x1]
            m = cut(a)
            ys, xs = np.nonzero(m)
            a, m = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1], m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            # scale down: average the colour of the sword's own pixels in each block; a block is sword if half of it is
            h, w = -(-m.shape[0] // SCALE) * SCALE, -(-m.shape[1] // SCALE) * SCALE
            A = np.zeros((h, w, 3)); A[: a.shape[0], : a.shape[1]] = a
            M = np.zeros((h, w)); M[: m.shape[0], : m.shape[1]] = m
            blk = lambda x: x.reshape(h // SCALE, SCALE, w // SCALE, SCALE, *x.shape[2:]).sum((1, 3))
            n = blk(M)
            rgb = blk(A * M[..., None]) / np.maximum(n, 1)[..., None]
            alpha = (n >= SCALE * SCALE / 2) * 255
            swords.append(np.dstack([rgb, alpha]).astype(np.uint8))
    # one row, 2 px apart
    gap = 2
    sheet = Image.new("RGBA", (sum(s.shape[1] + gap for s in swords), max(s.shape[0] for s in swords)))
    meta, x = [], 0
    for s in swords:
        sheet.paste(Image.fromarray(s, "RGBA"), (x, 0))
        # the blade's row (where the feet stand): the middle of the opaque pixels near the point, the right fifth
        a = s[:, :, 3] > 0
        tip = a[:, s.shape[1] * 4 // 5:]
        ys = np.nonzero(tip)[0]
        meta.append({"x": x, "y": 0, "w": int(s.shape[1]), "h": int(s.shape[0]), "by": int(round(ys.mean())) if len(ys) else s.shape[0] // 2})
        x += s.shape[1] + gap
    sheet.save(OUT / "swords.png", optimize=True)
    (OUT / "swords.json").write_text(json.dumps(meta, separators=(",", ":")))
    # the fly button's icon: the basic sword, turned to point up and right
    icon = Image.fromarray(swords[0], "RGBA").rotate(35, resample=Image.NEAREST, expand=True)
    icon = icon.crop(icon.getbbox())
    icon.thumbnail((48, 48), Image.NEAREST)
    icon.save(UI / "fly_sword.png", optimize=True)
    print(len(meta), "swords,", sheet.size)


main()
