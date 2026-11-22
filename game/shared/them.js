// What was added to the game beyond what is designed in code: whole characters (the Y Các's "Nhân vật") and world bosses,
// each a pixelfx figure in src/fx/ (made with the pixelfx skill, or from a picture with tools/from-image.mjs at the
// repository's root). Written by tools/them.mjs, which the MCP's register tools and the VPS's AI agent call; read by
// shared/nhan-vat.js and shared/boss.js. The part between BEGIN and END is JSON: keep it that way (the tool rewrites it).
//   skins:  { idx, key, fx, name, g (m | f | a), price, starter: false }
//   bosses: { key, name, title, fx, roarFx, slamFx, hitFx, colors: { slam, roar, hit }, half, tall, slamAt }
export const THEM = /* BEGIN */ {
  "skins": [],
  "bosses": []
} /* END */;

export const EXTRA_SKINS = THEM.skins;
export const EXTRA_BOSSES = Object.fromEntries(THEM.bosses.map((b) => [b.key, b]));
