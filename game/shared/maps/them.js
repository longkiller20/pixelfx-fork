// Maps added beyond the code: whole maps an AI (through the MCP's save_map) or the owner made, written by
// tools/ban-do.mjs, which checks every one before it is saved (see that tool for the rules). Read by ./index.js, which
// puts them after the maps designed in code; a new map shows after the game restarts. The part between BEGIN and END is
// JSON: keep it that way (the tool rewrites it). Each map has the fields of the maps in code (see tanthu.js), with the
// grid as its rows of characters, plus `town: true` for a safe map with no monsters that is still on the Truyền Tống
// Trận's list.
export const MAPS_THEM = /* BEGIN */ {
  "maps": []
} /* END */;
