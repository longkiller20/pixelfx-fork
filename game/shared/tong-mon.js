// Tông Môn (sects): the ranks, what each may do, the emblems and the naming rules. Shared by the server, which enforces
// every rule (server/tong-mon.js), and the browser, which only uses them to show the right buttons. Nothing the browser
// decides from here is ever trusted. The numbers (cost, caps, rewards...) are settings "sect.*" in shared/balance.js.

/** The five ranks, highest first. A lower number outranks a higher one. */
export const RANKS = {
  1: { name: "Tông Chủ", short: "Chủ" },
  2: { name: "Phó Tông Chủ", short: "Phó" },
  3: { name: "Trưởng Lão", short: "Lão" },
  4: { name: "Nội Môn Đệ Tử", short: "Nội" },
  5: { name: "Ngoại Môn Đệ Tử", short: "Ngoại" },
};
export const LEADER = 1, VICE = 2, ELDER = 3, INNER = 4, OUTER = 5;

/**
 * What a rank may do. Acting on another member (kick, set rank) also needs `over`: only someone strictly lower, and a new
 * rank strictly lower than one's own.
 *   settings: the notice, how people join, the lowest level, the emblem
 *   review:   take or turn down applications
 *   kick:     send a lower member away
 *   promote:  move a lower member to another rank below one's own
 *   array:    raise the Hộ Sơn Đại Trận with the treasury
 *   transfer, disband: the Tông Chủ only
 */
export const CAN = {
  settings: (r) => r <= VICE,
  review: (r) => r <= ELDER,
  kick: (r) => r <= ELDER,
  promote: (r) => r <= ELDER,
  array: (r) => r <= VICE,
  transfer: (r) => r === LEADER,
  disband: (r) => r === LEADER,
};
/** Whether a member of rank `me` may act on one of rank `them` (strictly lower). */
export const over = (me, them) => me < them;
/** The ranks `me` may give someone: every rank strictly below their own, never Tông Chủ (that is a transfer). */
export const grantable = (me) => [VICE, ELDER, INNER, OUTER].filter((r) => r > me);

/** How people may join: anyone who meets the level at once, by application, or not at all. */
export const JOIN_MODES = { open: "Tự do gia nhập", apply: "Xét duyệt đơn", closed: "Đóng cửa" };

/** Emblems: icons from the Xianxia pack (public/xianxia/ui/ui_xianxia_<name>.png), by number. */
export const EMBLEMS = [
  "item_token", "item_compass", "item_furnace", "item_gourd", "item_jade_slip", "item_lantern", "item_lingzhi", "item_peach",
  "item_pill_bottle", "item_spirit_stone", "item_talisman", "status_golden_shield", "status_burn", "status_freeze", "status_swift", "status_seal",
];
export const emblemUrl = (i) => `/xianxia/ui/ui_xianxia_${EMBLEMS[i] ?? EMBLEMS[0]}.png`;

// ---------------------------------------------------------------- text from players
// characters that can make text look like something it isn't: control characters, zero-width ones, and the bidi
// overrides that turn text around (U+202E and the like); and < > so nothing ever looks like markup even where it would be escaped
const BAD_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿<>]/g;
/**
 * Names that would pass for the game or its staff, compared without accents or case. The long ones anywhere in the name
 * (spaces ignored: "Hệ Thống", "hethong"); the short ones only as a word of their own ("GM Tông", but "Mộ Dung" is fine).
 */
const RESERVED = ["admin", "hethong", "system", "quantri", "server", "maychu", "support", "hotro", "moderator", "bandieuhanh"];
const RESERVED_WORDS = ["gm", "mod", "bqt", "dvtt", "adm"];
const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

export const SECT_NAME_RE = /^[\p{L}\p{N} ]{2,16}$/u;
/** A sect name as it will be saved, or an error message (string starting with "!"). */
export function cleanSectName(raw) {
  const s = String(raw ?? "").normalize("NFC").replace(BAD_CHARS, "").trim().replace(/\s+/g, " ");
  if (!SECT_NAME_RE.test(s)) return "!Tên tông môn dài 2-16 ký tự, chỉ gồm chữ, số và khoảng trắng.";
  if (!/\p{L}/u.test(s)) return "!Tên tông môn cần có chữ.";
  const p = plain(s), joined = p.replace(/[^a-z0-9]/g, ""), words = p.split(/[^a-z0-9]+/);
  if (RESERVED.some((w) => joined.includes(w)) || words.some((w) => RESERVED_WORDS.includes(w))) return "!Tên này dễ bị nhầm với ban quản trị, hãy chọn tên khác.";
  return s;
}
/** Free text (a notice, an application): no hidden or markup characters, at most `max` long and `lines` lines. */
export function cleanText(raw, max, lines = 1) {
  let s = String(raw ?? "").normalize("NFC").replace(/\r\n?/g, "\n").replace(BAD_CHARS, "");
  s = s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, lines).join("\n");
  return [...s].slice(0, max).join("").trim();
}

// ---------------------------------------------------------------- levels
/** Sect exp needed in total to reach level L (level 1 needs none): expBase × (1^1.5 + 2^1.5 + ... + (L-1)^1.5). */
export function sectExpFor(L, expBase) {
  let t = 0;
  for (let k = 1; k < L; k++) t += Math.round(expBase * Math.pow(k, 1.5));
  return t;
}
/** How many members a sect of level L takes. */
export const memberCap = (L, S) => S.membersBase + S.membersPerLevel * (L - 1);
/** The open-world bonus (percent on hp, attack, defence) a sect of level L gives each member. */
export const sectBonus = (L, S) => Math.max(0, (L - 1) * S.bonusPerLevel);

/** What each kind of log line says (the server stores only the kind and the names). */
export const LOG_TEXT = {
  create: (a) => `${a.actor} khai lập tông môn.`,
  join: (a) => `${a.actor} gia nhập tông môn.`,
  accept: (a) => `${a.actor} thu nhận ${a.target}.`,
  leave: (a) => `${a.actor} rời tông môn.`,
  kick: (a) => `${a.actor} trục xuất ${a.target}.`,
  rank: (a) => `${a.actor} phong ${a.target} làm ${RANKS[a.amount]?.name ?? "?"}.`,
  auto: (a) => `${a.actor} đủ cống hiến, lên ${RANKS[a.amount]?.name ?? "?"}.`,
  transfer: (a) => `${a.actor} truyền chức Tông Chủ cho ${a.target}.`,
  donate: (a) => `${a.actor} quyên ${a.amount.toLocaleString("vi-VN")} linh thạch.`,
  levelup: (a) => `Tông môn lên cấp ${a.amount}!`,
  array: (a) => `${a.actor} khai mở Hộ Sơn Đại Trận.`,
  settings: (a) => `${a.actor} sửa quy định tông môn.`,
  admin: (a) => `Ban quản trị: ${a.target}.`,
};
