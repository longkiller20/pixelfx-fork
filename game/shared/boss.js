// Boss Thế Giới: a world boss an admin calls onto a map of the road. It stands in every Khu of that map at once (a copy
// in each, the same one), with one shared life: whoever hits it in whichever Khu takes from the same bar. It strikes
// those in front of it, and every so often roars: a counter-blow that strikes every player on the map, in every
// Khu; and every blow it takes is partly thrown back at whoever struck it (phản đòn). When it falls, a pool of linh
// thạch and tu vi is shared out by the damage each one did; whoever struck the last blow gets a bonus on top.
// Shared by the server (server/boss.js), the browser (public/js/boss.js) and the admin.
import { MAPS } from "./maps/index.js";

/** The bosses there are: each a rigged pixelfx figure (src/fx/boss/) and what it throws. */
export const BOSSES = {
  xavuong: {
    key: "xavuong", name: "Cửu U Xà Vương", title: "Ma Vương bảy đầu rắn từ Cửu U",
    fx: "boss/cuu-u-xa-vuong", roarFx: "boss/roar-wave", slamFx: "impacts/ground-slam", hitFx: "impacts/crit-hit",
    // the colours of what it throws: venom crimson and violet (each effect's palette)
    colors: {
      slam: ["#12040e", "#3a0a2a", "#6a1440", "#b0204a", "#e8506a", "#ffa0b8", "#fff0f4"],
      roar: ["#10030c", "#2e0828", "#5e1048", "#a8205a", "#e84a7a", "#ffa0c8", "#fff0f6"],
      hit: ["#1a0414", "#5a1040", "#c02a5a", "#ff7aa0", "#fff0f4"],
    },
    // its body, from its base (world px): half its width, its height; where its heads strike in front of it
    half: 70, tall: 148, slamAt: 96,
  },
};

export const BOSS_KEYS = Object.keys(BOSSES);
/** A boss's type as monsters are named in snapshots ("boss:xavuong"), and back. */
export const bossType = (key) => `boss:${key}`;
export const bossOf = (type) => (typeof type === "string" && type.startsWith("boss:") ? BOSSES[type.slice(5)] ?? null : null);

/** Where a boss may be called: a map of the road with monsters (not the safe starter town, the lake, a Gia Viên...). */
export const bossMaps = () => Object.keys(MAPS).filter((id) => !MAPS[id].instanced && !MAPS[id].nopk && !MAPS[id].peaceful && MAPS[id].mobs.some((m) => m.type !== "dummy"));

/** The rig's timeline (s), the same as src/fx/boss/_rig.js: when the slam lands, when the roar goes off. */
export const SLAM_HIT = 0.66, ROAR_HIT = 0.9;

// ---- the live numbers (settings boss.*), set by balance.js applyConfig; the admin's spawn may change hp and the pools
export const BOSS = {
  hp: 2000000, atk: 120, def: 120, spd: 40, slamCd: 3.5, slamMult: 2, slamReach: 150, aggro: 420, leash: 260,
  roarEvery: 25, roarPct: 18, thornsPct: 6, stones: 60000, exp: 120000, killBonus: 20, minutes: 60, minLevel: 1,
};
