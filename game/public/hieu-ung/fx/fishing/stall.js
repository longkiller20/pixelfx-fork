import { hex, mix, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";
import { lit } from "../farm/_lib.js";

export const meta = {
  name: "Fishmonger's stall",
  desc: "A lakeside tackle stall: thatched roof, an old fisherman in a conical hat puffing a long pipe behind the counter, baskets, rods on a rack, dried fish swaying, a net, a lantern.",
  tags: ["fishing", "stall", "shop", "npc", "fisherman", "building", "loop"],
  size: [176, 128],
  origin: [88, 124],
  duration: 3.2,
  loop: true,
  fps: 12,
  bg: "ground",
  options: {},
};

const H = (a) => a.map(hex);
const WOOD = H(["#1e1008", "#3e2414", "#6a4224", "#946238", "#b88a5a"]);
const STRAW = H(["#3a2a0c", "#7a5a1a", "#b08a30", "#dcb850", "#f6e08a"]);
const ROBE = H(["#141e2a", "#2a3e52", "#44607a", "#6a8aa4", "#a8c4d8"]);
const SKIN = H(["#6a3a2a", "#b0785a", "#e0a882", "#f6cfa8", "#ffe6cc"]);
const BEARD = H(["#6a6a72", "#a8a8b0", "#d8d8e0", "#f0f0f6", "#ffffff"]);
const FISH = H(["#2a3440", "#5a6a7a", "#9aa8b4", "#d2dae0", "#f4f8fa"]);
const DRIED = H(["#3a1a08", "#7a3a14", "#b06a2a", "#d89a50", "#f0c888"]);
const NET = hex("#c8c0a0"), INK = hex("#0c0810"), RED = H(["#4a0a10", "#8a1a24", "#c83a3a", "#f07060", "#ffc0a0"]);
const JADE = H(["#0a2a1e", "#1a5a3e", "#2a9a62", "#6ad89a", "#c8ffe0"]);
const G = new Grid(-88, -124, 176, 128);

function post(g, x, y0, y1, w = 5) {
  g.shade(x, y0, x + w - 1, y1, (px, py) => (px < x + 1 ? WOOD[3] : px > x + w - 1.5 ? WOOD[1] : Math.floor(py / 7) % 4 === 0 ? WOOD[1] : WOOD[2]));
}

export function draw(p, t, o) {
  const D = meta.duration, u = (t % D) / D, g = G.clear();
  // ---- the back: a plank wall under the roof
  g.shade(-60, -92, 52, -30, (x, y) => (Math.floor(x + 60) % 11 === 0 ? WOOD[0] : y < -90 ? WOOD[2] : WOOD[1]));
  // shelves on the wall with jars of bait and a coil of line
  g.shade(-56, -66, -10, -64, () => WOOD[3]);
  for (const [x, c] of [[-52, JADE], [-44, RED], [-36, STRAW], [-26, JADE]]) g.shade(x, -74, x + 5, -67, (px, py) => (py < -73 ? WOOD[3] : lit(c, (px - x - 2.5) / 3, (py + 70) / 4, 2)));
  g.ellipse(-16, -70, 4, 3, (nx, ny) => (Math.hypot(nx, ny) < 0.5 ? WOOD[1] : NET));

  // ---- the old fisherman behind the counter: a conical hat, white beard, a long pipe (nods now and then)
  const nod = u > 0.7 && u < 0.8 ? Math.sin(((u - 0.7) / 0.1) * Math.PI) * 1.5 : 0;
  const breathe = Math.sin(u * TAU * 2) * 0.5;
  g.poly([[-14, -32], [-11, -52 + breathe], [9, -52 + breathe], [12, -32]], (x, y) => lit(ROBE, x / 14, (y + 42) / 10, 2));
  g.line(-1, -52, -1, -36, ROBE[1]);
  g.ellipse(-1, -60 + nod, 6, 6.5, (nx, ny) => lit(SKIN, nx, ny, 2));
  // the beard, long and white
  g.poly([[-6, -58 + nod], [4, -58 + nod], [2, -44 + nod], [-1, -40 + nod], [-4, -44 + nod]], (x, y) => lit(BEARD, x / 6, (y + 50) / 10, 2));
  // eyes: closed in a blink
  const blink = u > 0.42 && u < 0.46;
  for (const ex of [-4, 2]) blink ? g.line(ex - 1, -61 + nod, ex + 1, -61 + nod, SKIN[0]) : g.set(ex, -61 + nod, INK);
  g.line(-5, -63 + nod, -3, -63 + nod, BEARD[2]), g.line(1, -63 + nod, 3, -63 + nod, BEARD[2]);
  // the nón lá
  g.poly([[-17, -64 + nod], [-1, -76 + nod], [15, -64 + nod]], (x, y) => (Math.floor(x * 0.5 + y) % 3 === 0 ? STRAW[2] : y < -72 + nod ? STRAW[4] : STRAW[3]));
  g.line(-17, -64 + nod, 15, -64 + nod, STRAW[1]);
  // the pipe, from his mouth out to the right, a glowing bowl
  g.line(1, -55 + nod, 16, -50, WOOD[1]);
  g.shade(15, -54, 18, -50, () => WOOD[2]);

  // ---- the counter: planks, a basket of fish, a basket of bait, a scale
  g.shade(-62, -32, 54, 0, (x, y) => (y < -30 ? WOOD[4] : y < -28 ? WOOD[3] : Math.floor(y) % 6 === 0 ? WOOD[1] : Math.floor(x + 62) % 23 === 0 ? WOOD[0] : WOOD[2]));
  // a basket of silver fish
  g.ellipse(-38, -33, 13, 5, (nx, ny) => (ny > 0 ? (Math.floor((nx + 1) * 9) % 2 ? STRAW[1] : STRAW[2]) : 0));
  for (let k = 0; k < 5; k++) {
    const fx = -47 + k * 4.5, fy = -36 - (k % 2) * 2;
    g.ellipse(fx, fy, 3.2, 1.6, (nx, ny) => lit(FISH, nx, ny, 2));
    g.set(fx + 2, fy - 0.5, INK);
  }
  g.shade(-51, -34, -25, -28, (x, y) => (Math.floor(x * 0.7 + y) % 3 ? STRAW[2] : STRAW[1]));
  // a pot of worms
  g.shade(22, -40, 32, -30, (x, y) => (y < -39 ? WOOD[3] : x < 23 ? WOOD[3] : x > 31 ? WOOD[0] : WOOD[1]));
  for (let k = 0; k < 4; k++) g.set(24 + k * 2, -41 - (k % 2) + Math.sin(u * TAU * 2 + k) * 0.6, hex("#e8789a"));
  // a steelyard hanging from the roof
  g.line(40, -86, 40, -60, NET);
  g.line(34, -60, 48, -60, WOOD[2]);
  g.ellipse(46, -56, 2.5, 2, (nx, ny) => lit(FISH, nx, ny, 1));

  // ---- the posts, the thatched roof, a sign, the lantern
  post(g, -66, -96, 0);
  post(g, 54, -96, 0);
  g.poly([[-80, -88], [-60, -116], [56, -116], [74, -88], [60, -86], [-70, -86]], (x, y) => {
    const s = Math.floor(x * 0.33 + Math.floor((y + 120) / 6) * 1.7) % 4;
    return y > -90 ? STRAW[1] : s === 0 ? STRAW[2] : y < -110 ? STRAW[4] : STRAW[3];
  });
  // ragged straw ends along the eave
  for (let x = -78; x < 72; x += 3) g.line(x, -87, x + (x % 2), -84 + ((x * 7) % 3), STRAW[(x & 4) ? 1 : 2]);
  g.line(-62, -116, 58, -116, STRAW[1]);
  // a board hung on the eave (the game writes "Ngư Cụ" over it), a carved fish on it
  g.shade(-20, -84, 18, -72, (x, y) => (y < -83 ? WOOD[4] : y > -73 ? WOOD[0] : WOOD[3]));
  g.ellipse(-1, -78, 6, 2.6, (nx, ny) => lit(RED, nx, ny, 2));
  g.poly([[-7, -78], [-11, -81], [-11, -75]], RED[2]);

  // ---- dried fish swaying on a string from the eave (left), a net drying on the left post
  for (let k = 0; k < 4; k++) {
    const sx = -58 + k * 7, sw = Math.sin(u * TAU + k * 0.8) * 1.5, y0 = -84;
    g.line(sx, y0, sx + sw * 0.4, y0 + 8, NET);
    g.shade(sx - 2 + sw, y0 + 8, sx + 2 + sw, y0 + 18, (x, y) => (y > y0 + 16 ? DRIED[1] : x < sx + sw ? DRIED[3] : DRIED[2]));
    g.poly([[sx - 3 + sw, y0 + 21], [sx + sw, y0 + 17], [sx + 3 + sw, y0 + 21]], DRIED[1]);
  }
  g.line(-80, -72, -67, -74, WOOD[2]);
  g.shade(-79, -71, -68, -24, (x, y) => {
    const sag = Math.sin(((x + 80) / 13) * Math.PI) * 3, yy = y - sag;
    return (Math.floor(x + yy + 200) % 5 === 0 || Math.floor(x - yy + 200) % 5 === 0) && yy < -24 - Math.abs(x + 73) * 0.8 ? NET : 0;
  });

  // ---- a rack of rods at the right, a barrel in front
  g.line(60, -2, 66, -60, WOOD[2]);
  for (const [x, c, h] of [[62, STRAW[3], 92], [66, WOOD[3], 86], [70, JADE[2], 98], [74, RED[2], 80]]) {
    g.line(x, -2, x + 6, -h, c);
    for (let i = 0; i < 18; i++) g.set(x + 6 + i * 0.2, -h + i * 2.5, NET, 0.5);
  }
  g.shade(-86, -22, -70, 0, (x, y) => (Math.floor(y + 22) % 8 < 1.2 ? WOOD[0] : lit(WOOD, (x + 78) / 8, 0, 2)));

  // ---- the outline, then it goes onto the painter
  g.outline((x, y, nx, ny) => (ny < 0 || nx < 0 ? INK : mix(INK, hex("#3a2a4a"), 0.45)));
  g.draw(p, 1, 0, 0);
  // the pipe's ember and its smoke, the lantern's light
  const ember = 0.6 + 0.4 * Math.sin(u * TAU * 3);
  p.dot(17, -54, hex("#ffb040"), ember);
  p.glow(17, -54, 4, hex("#ff8a30"), 0.25 * ember);
  for (let k = 0; k < 6; k++) {
    const v = (u * 1.5 + k / 6) % 1;
    p.dot(18 + Math.sin(v * TAU * 1.5 + k) * 3 + v * 6, -56 - v * 34, hex("#d8d8e8"), (1 - v) * 0.6);
    if (k % 2 === 0) p.dot(19 + Math.sin(v * TAU * 1.5 + k) * 3 + v * 6, -56 - v * 34, hex("#d8d8e8"), (1 - v) * 0.35);
  }
  // a paper lantern on the right post
  const ls = Math.sin(u * TAU) * 1.2;
  p.line(57, -86, 57 + ls * 0.3, -80, hex("#3a2010"));
  p.disc(57 + ls, -74, 5, hex("#c8321e"), 1);
  p.disc(56 + ls, -75, 3, hex("#ff9a5a"), 1);
  p.line(53 + ls, -79, 61 + ls, -79, hex("#3a2010"));
  p.line(53 + ls, -69, 61 + ls, -69, hex("#3a2010"));
  p.glow(57 + ls, -74, 26, hex("#ffb060"), 0.22 + 0.05 * Math.sin(u * TAU * 2));
}
