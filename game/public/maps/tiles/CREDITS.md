# Tiles: sources and licences

The **CC0** files are public domain: free for any use, commercial included, no attribution required (credit is given anyway). The
**CC-BY 4.0** files are free for any use, commercial included, **as long as the author is credited**: keep this file, and the
credits in the game's README, with the game.

| File | What | Source | Licence |
|---|---|---|---|
| `terrain.png` | Earth, grass, stone bricks, plants. Backdrop keyed out, the purple earth recoloured brown. | *old frogatto tile art*, OpenGameArt (https://opengameart.org/content/old-frogatto-tile-art), via the CC0 collection https://github.com/Tiddybub/2d-assets | CC0 |
| `mountains.png` | Misty mountains over a pine forest, the far background. Tinted cool jade-blue, its pale sky made see-through. | *Asian Mountain Forest BG* by **Crisisworks**, OpenGameArt (https://opengameart.org/content/asian-mountain-forest-bg) | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/) |
| `pines.png` | Three Asian mountain pines, at half size. | *Asian Mountain Trees* by **Crisisworks**, OpenGameArt (https://opengameart.org/content/asian-mountain-trees) | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/) |
| `roof.png` | Curved oriental tiled roof: an end piece and a 16 px repeating middle, in grey, blue, red and jade. Cut from the original sheet and recoloured. | *Oriental Roof Tiles*, OpenGameArt (https://opengameart.org/content/oriental-roof-tiles), via https://github.com/Tiddybub/2d-assets | CC0 |

Also used, from `public/xianxia/` (licence text in `public/xianxia/LICENSE.txt`):

| Files | What | Source | Licence |
|---|---|---|---|
| `xianxia/terrain.png` | Bamboo-forest earth, blue stone, cloud platforms (32 px tiles) | *Xianxia Pixel Pack v2.1* | CC0 |
| `xianxia/bg/*` | Golden palace, pagoda, palaces and isles on the clouds | *Xianxia Pixel Pack v2.1* | CC0 |
| `xianxia/weapons.png` | 90 weapons, scaled to 45% | *Xianxia Pixel Pack v2.1* | CC0 |
| `xianxia/ui/*` | Panels, buttons, bars, item and status icons, sword cursor | *Xianxia Pixel Pack v2.1* | CC0 |
| `xianxia/weapons.png` (last row) | 8 bảo vật: pixelfx's own code-drawn weapons (sword, greatsword, dagger, spear, hammer, scythe, claw, bow), rendered flat by `tools/xianxia/pixelfx-weapons.mjs` | pixelfx (this repository) | MIT |
| `xianxia/ui/ring_*.png` | Round frames of the action buttons, drawn for this game in the pack's style by `tools/xianxia/rings.py` | this project | CC0 |

Everything else in the town (walls, doors, windows, pillars, the gate, lanterns, cherry trees, bamboo, water, sky and the
floating isles) is drawn in code in `public/js/scenery.js`.
