"""Cut the parts out of the atlases in tools/assets/atlases/ into one folder per part under public/:

  public/toc-nam/<idx>-<ten>/      hair styles for men     (toc-nu: for women)
  public/y-phuc-nam/<idx>-<ten>/   robes for men           (y-phuc-nu: for women)
  public/vu-khi/<idx>-<ten>/       weapons in hand
  public/phi-kiem/<idx>-<ten>/     flying swords

Each folder holds hinh.png (the part alone, trimmed) and thong-tin.json (what the game needs to place it: for hair and
robes where it sits on the base figure, dx/dy; for a weapon where the hand grips it, gx/gy, and whether it is a long arm
held upright; for a flying sword the row the feet stand on, by). idx is the number the game and the database use for the
part (cosmetics.idx, characters.hair...); <ten> is its name without accents or spaces. The server lists these folders
by itself (server/assets.js), so a new part is just a new folder. Run this again only after rebuilding an atlas:
  python3 tools/assets/split.py
"""
import json
import os
import re
import subprocess
import unicodedata
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
GAME = HERE.parent.parent
ATL = HERE / "atlases"
PUB = GAME / "public"


def slug(name):
    """'Thanh Vân Kiếm' -> 'thanhvankiem'."""
    s = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]", "", s)


def names():
    """Every part's name, from server/cosmetics-seed.js (also the ones no longer seeded)."""
    js = """
    import(process.argv[1]).then((m) => {
      const out = { hair: {}, robe: {}, weapon: {}, sword: {} };
      for (const c of m.ALL_COSMETICS) out[c.kind][c.g + c.idx] = c.name;
      for (const w of [...m.ALL_WEAPONS, ...m.SPECIAL_WEAPONS]) out.weapon[w.idx] = w.name;
      for (const w of m.ALL_SWORDS) out.sword[w.idx] = w.name;
      console.log(JSON.stringify(out));
    });"""
    out = subprocess.run(["node", "-e", js, str(GAME / "server" / "cosmetics-seed.js")], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def write(folder, img, info):
    folder.mkdir(parents=True, exist_ok=True)
    img.save(folder / "hinh.png", optimize=True)
    (folder / "thong-tin.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clear(kind_dir):
    """Take out the folders a previous run made (only folders named <number>-<name> with our two files in them)."""
    if not kind_dir.exists():
        return
    for d in kind_dir.iterdir():
        if d.is_dir() and re.fullmatch(r"\d+-[a-z0-9]*", d.name):
            for f in ("hinh.png", "thong-tin.json"):
                (d / f).unlink(missing_ok=True)
            if not any(d.iterdir()):
                d.rmdir()


def main():
    N = names()
    meta = json.loads((ATL / "avatar.json").read_text())
    count = {}
    # hair and robes: [x, y, w, h, dx, dy] in their gender's atlas
    for kind, folder in (("hair", "toc"), ("robe", "y-phuc")):
        for g, gname in (("m", "nam"), ("f", "nu")):
            sheet = Image.open(ATL / f"{kind}_{g}.png").convert("RGBA")
            out = PUB / f"{folder}-{gname}"
            clear(out)
            for i, (x, y, w, h, dx, dy) in enumerate(meta[f"{kind}_{g}"]):
                name = N[kind].get(f"{g}{i}", f"{folder} {gname} {i}")
                write(out / f"{i}-{slug(name)}", sheet.crop((x, y, x + w, y + h)), {"idx": i, "ten": name, "dx": dx, "dy": dy})
                count[out.name] = count.get(out.name, 0) + 1
    # weapons: where the hand grips each; long arms (and anything marked long) stand upright at rest
    sheet = Image.open(ATL / "weapons.png").convert("RGBA")
    out = PUB / "vu-khi"
    clear(out)
    for i, w in enumerate(json.loads((ATL / "weapons.json").read_text())):
        name = N["weapon"].get(str(i), w["name"])
        info = {"idx": i, "ten": name, "gx": w["gx"], "gy": w["gy"], "dai": bool(w.get("long", w["w"] > 62)), "goc": w["name"]}
        write(out / f"{i}-{slug(name)}", sheet.crop((w["x"], w["y"], w["x"] + w["w"], w["y"] + w["h"])), info)
        count["vu-khi"] = count.get("vu-khi", 0) + 1
    # flying swords: the row the feet stand on
    sheet = Image.open(ATL / "swords.png").convert("RGBA")
    out = PUB / "phi-kiem"
    clear(out)
    for i, w in enumerate(json.loads((ATL / "swords.json").read_text())):
        name = N["sword"].get(str(i), f"phi kiem {i}")
        write(out / f"{i}-{slug(name)}", sheet.crop((w["x"], w["y"], w["x"] + w["w"], w["y"] + w["h"])), {"idx": i, "ten": name, "by": w["by"]})
        count["phi-kiem"] = count.get("phi-kiem", 0) + 1
    print(", ".join(f"{k}: {v}" for k, v in count.items()))


main()
