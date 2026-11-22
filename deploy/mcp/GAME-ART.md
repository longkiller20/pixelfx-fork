# Art for Đa Vũ Trụ Tu Tiên: what the game needs, and how to put it in

The game is a Vietnamese xianxia (tu tiên) side-view web MMO drawn entirely with the pixelfx library (`src/fx`). Every
monster, character and boss is a pixelfx effect: code that draws pixels, no image files. Read `skill` (the method) and
`authoring` (the file contract) before writing one; this page says what the game expects of each kind.

The owner (quản trị) says what they want, often in Vietnamese ("thêm một con hồ ly lửa ở Linh Thủy", "boss rồng băng cho
sự kiện tối nay", "nhân vật nữ áo đỏ bán 800 linh thạch"). Names players see are Vietnamese (Hỏa Hồ, Băng Long Vương…);
ids and keys are lower-case ASCII (`critters/hoa-ho`, `hoa_ho`, `banglong`).

Always: make it, `render_effect` it, look at the picture, fix the worst thing, render again (three rounds at least). A
figure that reads as mush at 1x is not done. Then put it in, then check it in the game (`game_logs` after a restart).

## A monster (yêu thú)

- **Look**: a looping effect in `critters/<name>`, facing **right**, its **feet at the origin** (a flier: its middle).
  The game draws it at 1.4x, flips it when it faces left, lunges it forward a few pixels when it strikes and flashes it
  when hit, so the effect only has to live where it stands: idle breathing, a blink, a tail or wing beat.
  Size: about 24-48 px tall (`meta.size` like `[96, 72]`, `meta.origin` at the feet). Look at `critters/frog`,
  `critters/snake`, `critters/bat`, `critters/wisp`, `critters/_lib.js` (shared helpers) first.
- **From a picture**: `image_to_figure kind=critter` (add `fly: true` for a flier); it breathes, bobs and leans.
- **In the game**: `create_monster` with its numbers (see the tool's description for numbers by map), its drops (items
  from `list_rows items`), and `place` it on a map (`list_maps`: maps with `spawnsAllowed`). Live at once, no restart.
  More of them, or elsewhere: `place_monster`. Fewer: `update_spawn` / `remove_spawn`.

## A character (nhân vật, sold in the Y Các)

- **Look**: `nhanvat/<name>`, a picture rigged by `nhanvat/_rig.js` (read it, and `nhanvat/kiem-khach.js`). The figure is
  about **84 px tall**, faces **right**, feet in the middle of the bottom row. Each pixel carries a part letter:
  `u` body and head, `h` long hair hanging behind (sways, trails when running and flying), `a` the near (front) arm
  (swings, thrusts on a strike), `r` the far arm (behind the body), `s` the hem of the robe (sways), `L` `R` the legs
  (step). `hair: [y0, y1]`, `skirt: [y0, y1]`, `legs: y` say where those bands are; `eyes: [[x0, x1, y0, y1]]` the eyes
  that blink, `skin` the skin colour's letter.
- **From a picture** (the usual way): the owner uploads a full-body picture with a clear background on the dashboard
  (Trợ lý AI → Ảnh); `list_uploads`, then `image_to_figure kind=nhanvat`. Look at `contact.png` (idle), `contact-walk.png`
  and `parts.png`. The automatic split guesses: the arms beyond the torso's width, the hair behind the back in the hair's
  colour, the hem and the legs by height. Correct it with `parts`:
  - `{"boxes": [["a", 30, 30, 42, 52], ["h", 2, 10, 14, 60, "dark"]]}`: set a part over a box (x0, y0, x1, y1 in the
    figure's pixels, the grid in parts.png is every 10 px); a 6th field keeps it to dark, light or a `#rrggbb` colour.
  - `legs`, `skirt`, `hair`, `fx` (the feet's x), `eyes`, `skin` override the guesses.
  - Or edit `records/<id>/lab.json` (one letter per pixel) and pass it as `lab`.
  Run again with the same `id` until walking and striking look right: the front arm swings, the hair trails, no part
  tears away from the body.
- **In the game**: `register_character` (name, gender m/f/a, price) puts it on sale; the game restarts.

## A world boss (Boss Thế Giới)

- **Look**: `boss/<name>`, a big picture (about **148 px tall**, up to ~240 wide) rigged by `boss/_rig.js` (read its
  header and `boss/cuu-u-xa-vuong.js`). It faces the viewer. Parts: `H` head and horns (thrown back in a roar), `h` hair
  (streams), `u` chest, `a` `b` the arms on the left and right of the picture (claws raised, thrust), `k` cloth at the
  waist, `T` what stands on the ground (legs, a serpent's coils: a wave runs along it), `1`..`9` heads on necks (serpents,
  tentacles, a hydra's heads: they weave and all strike at once; give each its eye in `heads` and where its neck joins
  the body in `roots`). `face`, `shoulders`, `waist` place the motions.
- **From a picture**: `image_to_figure kind=boss`, then look at `contact-slam.png` and `contact-roar.png`: on a slam the
  arms and heads must lunge forward and down; on a roar the head goes back and the arms up. The automatic split is only
  bands (head, arms, waist, ground): almost always give `parts` (boxes per head, `heads`, `roots`, `face`, `shoulders`).
- **In the game**: `register_boss` (key, name, title, and `colors` for its slam, roar and hit effects, taken from its
  own palette: 7 colours dark to bright for slam and roar, 5 for hits); the game restarts. Then `spawn_boss` on a map
  (`boss_status` lists the maps), with life and reward pools. `announce` it.

## A whole map (bản đồ)

A map of the road: a side view, 20 rows of 32 px cells (16-24 allowed), 60-240 columns, with its own sky, monsters, scenery
and at least one Truyền Tống Trận. Once saved it is on every array's list, and the game's Khu, placed monsters and bosses
work on it like on the maps in code.

1. `map_guide`: the rules, the tiles, every prop and its options, the theme, and the pictures, music, effects and monsters
   there are. `get_map linhthuy` (a lake), `bichlac` (a forest), `uminh` (tombs), `mavuc` (lava): read one or two.
2. **The terrain** as strokes (`layout`), not typed rows: `["ground", 0, 139, 15]` (floor at row 15 over the whole width),
   then cut and raise: `["box", 34, 62, 15, 17, "w"]` a lake, `["box", 34, 62, 15, 15, "b"]` a bridge over it,
   `["ground", 44, 52, 14, "s"]` a stone isle, `["box", 66, 70, 11, 11, "="]` a cloud to jump on, steps up a cliff.
   A player climbs 3 cells and jumps gaps of about 4: keep every part reachable from the spawn. Leave the top rows open (sky).
3. **Where things stand**: `spawn` by the west end; a Truyền Tống Trận (`portals`) near it and another at the far end;
   `mobs` spread along the way, away from the spawn, with fliers' `up` 2-4; a `spring` (where one cultivates) somewhere
   safe-ish. Use the monsters of the database (make new ones first with `create_monster` if the place needs its own);
   numbers in line with the maps of the same stage.
4. **The look**: `theme` (sky 5 colours, grass 5, earth 6, motes, mountains tint, heaven pictures, liquid, platform set) to
   say where it is (snow, desert, swamp, night, fire), then props every 4-6 columns: trees (`pine`, `cherry`, `bamboo`,
   pictures `xx` with `s` 2 for trees, 4-5 for small things, `tint` to match the light), `lantern`s, rocks, a few `fx`
   (water ripples on lakes, spirit flames, fireflies) and `glow`s. Names players see (name, sub, portal msg) in Vietnamese.
5. `preview_map`: fix every problem, read every warning, look at the picture (props standing on nothing, monsters in
   the spawn, a part nobody can reach), and preview again. Then `save_map` (the game restarts), `announce` it.

## Other effects

Art for skills, scenery or events uses the same library (`search_effects`), but the game needs code to use them: that is
work for the agent with the repository open (Claude Code on the VPS), not for these tools alone.

## Rules

- Never recreate a specific existing game's or show's characters, art or logos. Generic motifs (a fox spirit, a dragon,
  a sword immortal) are fine.
- Keep the game fair: new monsters' numbers in line with the map's others (`list_rows monsters`), rewards in line too.
- Ask the owner before removing things players own, mass gifts, or restarts while many are online (`game_overview`).
