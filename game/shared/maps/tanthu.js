// Tân Thủ Thôn, side view: the starter town. Everything is drawn at the characters' own pixel size (one art pixel is one
// world pixel), so buildings and trees can be as big as they should be beside a person: doors taller than you, houses three
// times your height, the temple and pagoda towering. Terrain comes from the Frogatto tile art and the roofs from the Oriental
// Roof Tiles sheet (both CC0), the misty mountains and the pines from Crisisworks (CC-BY 4.0); see public/maps/tiles/CREDITS.md.
// The rest is painted in code (public/js/scenery.js).
//   cell   world px per grid cell
//   grid   one character per cell, top to bottom:
//          .  air        #  earth (grass on top where open above)        s  stone (terrace, steps, walls)
//          =  cloud: stand on it from above, jump up through it, down + jump drops through
//          b  bridge: like a cloud, with water under it      w  water      |  waterfall (water and falls are scenery)
//   props  [kind, x, floor row, options]: painted standing on the floor of that row
//   deco   [sheet col, sheet row, x, floor row]: a 16 px picture from the terrain sheet standing on the floor
//   spawn, spring (where you cultivate), portals: in cells, standing on the floor of `row`
export const TANTHU = {
  id: "tanthu",
  name: "Tân Thủ Thôn",
  sub: "Thôn khởi đầu: an toàn, không có yêu thú. Thử chiêu trên bù nhìn rơm dưới gốc đào tiên; ngồi thiền trên Thái Cực Đài để tu luyện.",
  terrain: "/maps/tiles/terrain.png",
  roof: "/maps/tiles/roof.png",
  mountains: "/maps/tiles/mountains.png",
  pines: "/maps/tiles/pines.png",
  cell: 32,
  pvp: false,
  // two straw dummies by the market, beside where newcomers appear: something to try the arts on
  mobs: [{ type: "dummy", x: 83, row: 15 }, { type: "dummy", x: 85.5, row: 15 }],
  spawn: { x: 89, row: 15 },
  spring: { x0: 48.8, x1: 53.2, row: 13 },
  portals: [{ x: 123, row: 18, r: 0.8, to: "bichlac", msg: "Tới Bích Lạc Lâm" }],
  props: [["pine", 12.9, 15, {"v": 0}], ["house", 15, 15, {"w": 9, "roof": 1}], ["lantern", 14.4, 15], ["cherry", 27.5, 15], ["lantern", 25.6, 15], ["house", 31, 15, {"w": 8, "roof": 3}], ["well", 41.2, 15], ["lantern", 42.5, 15], ["temple", 44.5, 13, {"w": 13}], ["taiji", 51, 13], ["lantern", 45, 13], ["lantern", 57, 13], ["bamboo", 60.2, 15], ["cherry", 62.5, 15], ["gate", 64.5, 15], ["lantern", 68.6, 15], ["pine", 78.2, 15, {"v": 1}], ["xx", 82, 15, {"n": "bg_xianxia_mid_04_06", "s": 2}], ["xx", 87.3, 15, {"n": "bg_mid_02_04", "s": 3}], ["xx", 85.4, 15, {"n": "bg_xianxia_deco_01_01", "s": 4}], ["xx", 79.8, 15, {"n": "bg_xianxia_deco_01_00", "s": 5}], ["spawnstone", 91, 15], ["lantern", 93.3, 15], ["house", 94, 15, {"w": 9, "roof": 2}], ["cherry", 104.2, 15], ["pagoda", 110.5, 13], ["pine", 117.6, 15, {"v": 2}], ["sign", 118.2, 15], ["lantern", 122.5, 18], ["cherry", 125, 18]],
  deco: [[16, 9, 21.3, 15], [18, 9, 40.2, 15], [17, 9, 61.4, 15], [16, 9, 92.6, 15], [18, 9, 108.2, 13], [17, 9, 113.8, 13], [16, 9, 123.6, 18]],
  grid: [
    "................................................................................................................................",
    "................................................................................................................................",
    "..............................................................................................................................ss",
    "..............................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||..................................................................====..................................................ss",
    "####||........................................................................................................................ss",
    "####||........................................................................................................................ss",
    "####||................................................................====....................................................ss",
    "####||......................................ssssssssssssss...............................................###########..........ss",
    "####||.....................................ssssssssssssssss.............................................#############.........ss",
    "####bbbbbbbbb#########################################################bbbbbbb##########################################.......ss",
    "####wwwwwwwww#########################################################wwwwwww##########################################s......ss",
    "####wwwwwwwww#########################################################wwwwwww##########################################ss.....ss",
    "#######################################################################################################################sssssssss",
    "#######################################################################################################################sssssssss"
  ],
};
