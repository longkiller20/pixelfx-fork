// Công pháp (arts): the first content of a fresh database. Only pixelfx effects shaped like a skill become arts: slashes,
// spells, bolts, blasts, shields, heals. Left out: whole moves that draw their own fighter, props (a campfire, a candle,
// a barrel), weather and scenery, beasts (they are monsters), firearms, hit sparks, status marks and interface pieces.
// The effects the game uses are copied into public/hieu-ung/ (tools/hieu-ung.mjs), nothing else of pixelfx.
// After the first start the database is the source: an admin edits arts, what each needs and where things drop.
//
// An art is learned by spending its required items: its own bí kíp (a manual, dropped by monsters) and some essence of
// its element, more for higher tiers, and Linh Tủy for the great ones. The two arts everyone had before (Phi Kiếm, Lôi
// Ấn Trận) are starters: known by all, nothing to spend.
//
// Types the server knows (params in brackets; see ART_PARAMS in balance.js):
//   melee  an arc in front                         [range, arc]
//   bolt   a projectile                            [range, speed, r]
//   zone   an area ahead, after a beat              [dist, r, delay, slow, slowDur]
// A zone may also be aimable (arts.aimable, aim_range; switched per art by an admin): dragged anywhere within aim_range
// px. The seed switches it on for the zones drawn where they land (at: target), off for the whole moves (at: front).
//   nova   an area round the caster                 [r, delay, slow, slowDur]
//   dash   a rush forward, hitting along the way   [dist, r]
//   heal   restores part of the caster's hp         [pct]
//   buff   raises one of the caster's stats a while [stat (atk|def|spd), pct, dur]
// `at` is where the effect is drawn: front (before the caster, turned with them), self (on the caster, following),
// target (where a zone lands), bolt (riding the projectile). `life` stops a looping effect after that many seconds.

export const ELEMENTS = {
  kim: { name: "Kim", mat: "mat_kim", matName: "Huyền Thiết Tinh", matDesc: "Tinh hoa kim loại, dùng lĩnh ngộ công pháp hệ Kim (đao kiếm, quyền cước)." },
  hoa: { name: "Hỏa", mat: "mat_hoa", matName: "Hỏa Linh Tinh", matDesc: "Tinh thạch ấm nóng, dùng lĩnh ngộ công pháp hệ Hỏa." },
  thuy: { name: "Thủy", mat: "mat_thuy", matName: "Thủy Linh Châu", matDesc: "Hạt châu chứa linh thủy, dùng lĩnh ngộ công pháp hệ Thủy." },
  bang: { name: "Băng", mat: "mat_bang", matName: "Băng Phách Tinh", matDesc: "Tinh thể lạnh buốt, dùng lĩnh ngộ công pháp hệ Băng." },
  loi: { name: "Lôi", mat: "mat_loi", matName: "Lôi Linh Châu", matDesc: "Hạt châu nổ lách tách, dùng lĩnh ngộ công pháp hệ Lôi." },
  moc: { name: "Mộc", mat: "mat_moc", matName: "Mộc Linh Tinh", matDesc: "Tinh hoa cỏ cây, dùng lĩnh ngộ công pháp hệ Mộc." },
  tho: { name: "Thổ", mat: "mat_tho", matName: "Hậu Thổ Tinh", matDesc: "Tinh hoa đất đá, dùng lĩnh ngộ công pháp hệ Thổ." },
  quang: { name: "Quang", mat: "mat_quang", matName: "Thánh Quang Tinh", matDesc: "Tinh thể phát sáng, dùng lĩnh ngộ công pháp hệ Quang." },
  am: { name: "Ám", mat: "mat_am", matName: "U Minh Tinh", matDesc: "Tinh thạch tỏa khí âm, dùng lĩnh ngộ công pháp hệ Ám." },
  huyen: { name: "Huyền", mat: "mat_huyen", matName: "Huyền Linh Tinh", matDesc: "Tinh thể huyền bí, dùng lĩnh ngộ công pháp hệ Huyền (phép thuật)." },
  phong: { name: "Phong", mat: "mat_phong", matName: "Phong Linh Châu", matDesc: "Hạt châu cuộn gió, dùng lĩnh ngộ công pháp hệ Phong." },
  di: { name: "Dị Giới", mat: "mat_di", matName: "Dị Giới Linh Kiện", matDesc: "Linh kiện lạ từ thế giới khác của đa vũ trụ, dùng lĩnh ngộ công pháp Dị Giới." },
  bao: { name: "Bạo", mat: "mat_bao", matName: "Bạo Viêm Phù", matDesc: "Lá bùa chứa lực nổ, dùng lĩnh ngộ công pháp hệ Bạo." },
  thu: { name: "Ngự Thú", mat: "mat_thu", matName: "Linh Thú Hồn", matDesc: "Hồn phách linh thú, dùng lĩnh ngộ công pháp ngự thú." },
};
// the rare essence the great arts also need
export const RARE = { key: "mat_linhtuy", name: "Linh Tủy", desc: "Tủy của linh mạch, cực hiếm. Công pháp cao cấp cần đến." };

// [pixelfx effect, name, element, type, tier (1-3), { at, life, ...params that differ from the type's defaults }]
const L = [
  // ---- fire
  ["fire/fire-breath", "Hỏa Long Tức", "hoa", "melee", 1, { range: 110, arc: 0.9, life: 1.2 }],
  ["fire/fire-ring", "Viêm Hoàn", "hoa", "nova", 2, {}],
  ["fire/fire-tornado", "Hỏa Long Quyển", "hoa", "zone", 2, { life: 2 }],
  ["fire/fireball", "Hỏa Cầu", "hoa", "bolt", 1, {}],
  ["fire/flame-pillar", "Liệt Diễm Trụ", "hoa", "zone", 2, { delay: 0.8 }],
  ["fire/flamethrower", "Liệt Hỏa Phún", "hoa", "melee", 2, { range: 120, arc: 0.7, life: 1.4 }],
  ["fire/meteor", "Lưu Tinh Hỏa Vũ", "hoa", "zone", 3, { r: 80, delay: 1.4 }],
  ["fire/spirit-flame", "U Linh Hỏa", "am", "bolt", 1, { speed: 260 }],
  // ---- explosions
  ["explosions/big-explosion", "Thiên Băng Địa Liệt", "bao", "zone", 3, { r: 100, delay: 0.5 }],
  ["explosions/dirt-explosion", "Địa Lôi Phù", "bao", "zone", 2, { delay: 0.3 }],
  ["explosions/implosion", "Hấp Tinh Bạo", "huyen", "nova", 2, { delay: 0.8 }],
  ["explosions/plasma-explosion", "Linh Năng Bạo", "di", "zone", 2, { delay: 0.2 }],
  ["explosions/small-explosion", "Tiểu Bạo Phù", "bao", "zone", 1, { delay: 0.2 }],
  ["explosions/smoke-bomb", "Yên Vụ Đạn", "bao", "zone", 1, { slow: 0.5, slowDur: 3, delay: 0.8 }],
  // ---- water
  ["water/geyser", "Thủy Long Trụ", "thuy", "zone", 2, { delay: 1.8 }],
  ["water/splash", "Thủy Bạo Thuật", "thuy", "zone", 1, { delay: 0.2 }],
  ["water/water-jet", "Thủy Tiễn", "thuy", "melee", 1, { range: 120, arc: 0.5, life: 1 }],
  ["water/water-orb", "Thủy Linh Cầu", "thuy", "bolt", 1, { speed: 280 }],
  ["water/wave-crash", "Nộ Đào Kích", "thuy", "zone", 2, { delay: 1.2, slow: 0.4, slowDur: 2 }],
  ["water/whirlpool", "Toàn Qua Thuật", "thuy", "zone", 2, { slow: 0.6, slowDur: 3, life: 2.4 }],
  // ---- ice
  ["ice/blizzard-vortex", "Băng Phong Quyển", "bang", "zone", 2, { slow: 0.5, slowDur: 3, life: 2.4 }],
  ["ice/freeze", "Đóng Băng Thuật", "bang", "zone", 2, { dist: 80, r: 40, slow: 0.8, slowDur: 3, delay: 0.6 }],
  ["ice/frost-breath", "Hàn Băng Tức", "bang", "melee", 1, { range: 110, arc: 0.9, life: 1.2 }],
  ["ice/frost-nova", "Băng Hoàn Bạo", "bang", "nova", 2, { slow: 0.5, slowDur: 2.5, delay: 0.6 }],
  ["ice/ice-crystal", "Băng Tinh Hộ Thể", "bang", "buff", 1, { stat: "def", pct: 20, dur: 10 }],
  ["ice/ice-lance", "Băng Mâu", "bang", "bolt", 1, {}],
  ["ice/ice-shatter", "Toái Băng Kích", "bang", "melee", 2, { range: 80 }],
  ["ice/ice-spikes", "Băng Thứ Trận", "bang", "zone", 2, { slow: 0.4, slowDur: 2, delay: 0.5 }],
  ["ice/icicle-fall", "Băng Trùy Lạc", "bang", "zone", 1, { r: 40, delay: 0.9 }],
  ["ice/snowflake-burst", "Tuyết Hoa Tán", "bang", "nova", 1, { slow: 0.3, slowDur: 2 }],
  // ---- lightning
  ["lightning/ball-lightning", "Cầu Lôi", "loi", "bolt", 2, { speed: 220, life: 3 }],
  ["lightning/chain-lightning", "Liên Hoàn Lôi", "loi", "melee", 2, { range: 140, arc: 0.6 }],
  ["lightning/charge-up", "Tụ Lôi Quyết", "loi", "buff", 1, { stat: "atk", pct: 25, dur: 8 }],
  ["lightning/electrified", "Lôi Thể", "loi", "buff", 2, { stat: "spd", pct: 25, dur: 8, life: 8 }],
  ["lightning/storm-cloud", "Lôi Vân Trận", "loi", "zone", 2, { slow: 0.3, slowDur: 2, life: 2.4 }],
  ["lightning/thunderclap", "Lôi Minh Chấn", "loi", "nova", 2, { delay: 0.3 }],
  ["lightning/zap-hit", "Điện Chưởng", "loi", "melee", 1, { range: 60 }],
  // ---- sci-fi: from other worlds of the multiverse
  ["scifi/emp-blast", "Phá Năng Bạo", "di", "nova", 2, { slow: 0.4, slowDur: 2, delay: 0.8 }],
  ["scifi/force-field", "Lực Trường Hộ Thuẫn", "di", "buff", 2, { stat: "def", pct: 40, dur: 8, life: 8 }],
  ["scifi/warp-in", "Không Gian Giáng Lâm", "di", "nova", 2, { delay: 1 }],
  ["scifi/warp-out", "Không Gian Độn", "di", "dash", 2, { dist: 220, r: 10 }],
  // ---- melee
  ["melee/claw-swipe", "Huyết Lang Trảo Kích", "kim", "melee", 1, {}],
  ["melee/dagger-flurry", "Loạn Nhận Phong", "kim", "melee", 1, { range: 56 }],
  ["melee/double-slash", "Thập Tự Trảm", "kim", "melee", 1, {}],
  ["melee/hammer-smash", "Lôi Chùy Kích", "kim", "melee", 2, { range: 80, arc: 1.2 }],
  ["melee/heavy-cleave", "Khai Sơn Trảm", "kim", "melee", 2, { range: 80, arc: 1.2 }],
  ["melee/scythe-reap", "U Minh Liêm Thu", "am", "melee", 2, { range: 90 }],
  ["melee/spear-sweep", "Hoành Tảo Thiên Quân", "kim", "melee", 1, { range: 100, arc: 1.2 }],
  ["melee/spin-slash", "Toàn Phong Trảm", "kim", "nova", 1, { r: 70 }],
  ["melee/sword-slash", "Nguyệt Nha Trảm", "kim", "melee", 1, {}],
  ["melee/thrust", "Xuyên Tâm Thứ", "kim", "melee", 1, { range: 100, arc: 0.4 }],
  ["melee/uppercut", "Thăng Long Quyền", "kim", "melee", 1, { range: 56 }],
  ["melee/whip-crack", "Phược Long Tiên Kích", "kim", "melee", 1, { range: 110, arc: 0.6 }],
  // ---- impacts
  ["impacts/ground-slam", "Liệt Địa Chấn", "tho", "nova", 2, { delay: 0.2 }],
  ["impacts/heavy-landing", "Thái Sơn Áp Đỉnh", "tho", "nova", 1, { r: 70 }],
  ["impacts/parry", "Cách Đáng Thuật", "kim", "buff", 1, { stat: "def", pct: 30, dur: 4 }],
  ["impacts/shield-block", "Kim Cương Thuẫn", "kim", "buff", 2, { stat: "def", pct: 45, dur: 5 }],
  // ---- projectiles
  ["projectiles/arrow", "Truy Phong Tiễn", "kim", "bolt", 1, { speed: 460 }],
  ["projectiles/energy-disc", "Năng Lượng Luân", "di", "bolt", 2, { speed: 340, r: 16 }],
  ["projectiles/magic-missile", "Huyền Quang Đạn", "huyen", "bolt", 1, { at: "front" }],
  // ---- spawn & death
  ["spawn/poof", "Yên Độn Thuật", "huyen", "dash", 1, { dist: 120, r: 10 }],
  ["spawn/respawn-beam", "Hồi Quang Phản Chiếu", "quang", "heal", 2, { pct: 0.35 }],
  ["spawn/summon-rise", "Triệu Hồi Ma Tướng", "am", "zone", 3, { delay: 1.6 }],
  // ---- arcane
  ["arcane/arcane-beam", "Huyền Quang Trụ", "huyen", "melee", 2, { range: 150, arc: 0.4, life: 1.2 }],
  ["arcane/arcane-missiles", "Huyền Quang Loạn Xạ", "huyen", "melee", 2, { range: 130, arc: 1 }],
  ["arcane/arcane-orb", "Huyền Linh Cầu", "huyen", "bolt", 2, { speed: 240, r: 16 }],
  ["arcane/blink-in", "Thuấn Di Giáng", "huyen", "dash", 1, { dist: 160, r: 10 }],
  ["arcane/blink-out", "Thuấn Di Độn", "huyen", "dash", 1, { dist: 160, r: 10 }],
  ["arcane/magic-circle-cast", "Pháp Trận Giáng Quang", "huyen", "zone", 2, { delay: 1.6 }],
  ["arcane/mana-burst", "Linh Lực Bạo", "huyen", "nova", 2, { delay: 0.6 }],
  ["arcane/portal", "Hư Không Môn", "huyen", "zone", 2, { slow: 0.5, slowDur: 2, life: 2.4 }],
  ["arcane/rune-circle", "Phù Văn Trận", "huyen", "zone", 1, { slow: 0.3, slowDur: 2, life: 2.4 }],
  ["arcane/spell-charge", "Tụ Linh Quyết", "huyen", "buff", 1, { stat: "atk", pct: 20, dur: 8, life: 1.6 }],
  ["arcane/star-fall", "Tinh Lạc Thuật", "huyen", "zone", 3, { r: 90, delay: 0.6 }],
  ["arcane/time-stop", "Thời Gian Đình Trệ", "huyen", "zone", 3, { r: 90, slow: 0.9, slowDur: 3, delay: 1.2 }],
  // ---- holy
  ["holy/blessing", "Thiên Ân Phù Hộ", "quang", "buff", 1, { stat: "def", pct: 20, dur: 10, life: 3 }],
  ["holy/divine-shield", "Thánh Quang Hộ Thuẫn", "quang", "buff", 2, { stat: "def", pct: 50, dur: 6, life: 6 }],
  ["holy/halo", "Thánh Hoàn", "quang", "buff", 1, { stat: "atk", pct: 15, dur: 10, life: 10 }],
  ["holy/heal", "Hồi Xuân Thuật", "quang", "heal", 1, { pct: 0.2 }],
  ["holy/heal-aoe", "Sinh Cơ Trận", "quang", "heal", 2, { pct: 0.3 }],
  ["holy/holy-pillar", "Thánh Quang Trụ", "quang", "zone", 2, { delay: 1 }],
  ["holy/resurrection", "Niết Bàn Trùng Sinh", "quang", "heal", 3, { pct: 0.6 }],
  ["holy/smite", "Thiên Phạt", "quang", "zone", 2, { delay: 0.6 }],
  ["holy/sunburst", "Liệt Nhật Thuật", "quang", "nova", 2, { life: 2 }],
  // ---- shadow
  ["shadow/black-hole", "Hắc Động Thôn Phệ", "am", "zone", 3, { r: 90, slow: 0.7, slowDur: 3, life: 3 }],
  ["shadow/curse", "Ác Chú", "am", "zone", 1, { dist: 80, r: 40, slow: 0.4, slowDur: 3, delay: 0.8 }],
  ["shadow/dark-explosion", "Ám Diệt Bạo", "am", "zone", 2, { delay: 1 }],
  ["shadow/eclipse", "Nhật Thực Thuật", "am", "nova", 3, { r: 110, life: 2.4 }],
  ["shadow/grasping-hands", "Quỷ Thủ Trảo", "am", "zone", 2, { slow: 0.6, slowDur: 2, delay: 0.6 }],
  ["shadow/hex-sigil", "Tà Phù Ấn", "am", "zone", 2, { delay: 2 }],
  ["shadow/life-steal", "Hấp Huyết Thuật", "am", "melee", 2, { at: "front", range: 110, arc: 0.6 }],
  ["shadow/necro-skulls", "Vong Linh Cốt Hỏa", "am", "nova", 2, { life: 2.4 }],
  ["shadow/shadow-flames", "Ám Viêm", "am", "zone", 1, { life: 2 }],
  ["shadow/shadow-tendrils", "Ám Ảnh Xúc Tu", "am", "zone", 2, { slow: 0.5, slowDur: 2, delay: 0.6 }],
  ["shadow/soul-drain", "Nhiếp Hồn Thuật", "am", "melee", 2, { range: 120, arc: 0.6, life: 1.6 }],
  ["shadow/void-orb", "Hư Không Cầu", "am", "bolt", 2, { speed: 200, r: 18 }],
  // ---- nature
  ["nature/acid-splash", "Toan Độc Tiễn", "moc", "zone", 1, { delay: 0.4 }],
  ["nature/boulder", "Phi Thạch Thuật", "tho", "zone", 2, { at: "front", dist: 140, delay: 0.9 }],
  ["nature/earth-spike", "Địa Thứ", "tho", "zone", 2, { delay: 0.6 }],
  ["nature/healing-bloom", "Mộc Linh Hồi Xuân", "moc", "heal", 2, { pct: 0.3 }],
  ["nature/leaf-storm", "Phong Diệp Quyển", "moc", "nova", 1, { r: 70, life: 2 }],
  ["nature/poison-cloud", "Độc Vụ Trận", "moc", "zone", 2, { r: 80, slow: 0.3, slowDur: 2, life: 2.6 }],
  ["nature/quake", "Địa Long Phiên Thân", "tho", "zone", 3, { r: 110, delay: 0.5, slow: 0.4, slowDur: 2 }],
  ["nature/root-snare", "Đằng Mạn Phược", "moc", "zone", 1, { dist: 80, r: 40, slow: 0.9, slowDur: 2.5, delay: 0.5 }],
  ["nature/spore-burst", "Độc Bào Tử", "moc", "zone", 1, { delay: 1.6 }],
  ["nature/thorns", "Kinh Cức Trận", "moc", "zone", 2, { delay: 0.5 }],
  ["nature/tornado", "Cuồng Phong Quyển", "phong", "zone", 2, { life: 2.4 }],
  ["nature/toxic-puddle", "Độc Đàm", "moc", "zone", 1, { slow: 0.4, slowDur: 2, life: 2.4 }],
  ["nature/vine-whip", "Đằng Tiên", "moc", "melee", 1, { at: "front", range: 110, arc: 0.6 }],
];

// arts a database seeded before had, from effects that aren't skills; the one-time migration in server/db.js takes them out
// (with their bí kíp, requirements and drops)
export const RETIRED_FX = [
  "moves/arrow-shot",
  "moves/corpse-devour",
  "moves/dash-strike",
  "moves/earth-stomp",
  "moves/fireball-throw",
  "moves/ground-pound",
  "moves/henshin-dragon",
  "moves/holy-smite",
  "moves/ice-lance-throw",
  "moves/lightning-call",
  "moves/meteor-call",
  "moves/pistol-shots",
  "moves/rocket-launcher",
  "moves/sword-combo",
  "moves/time-king-henshin",
  "fire/brazier",
  "fire/campfire",
  "fire/candle",
  "fire/torch",
  "explosions/barrel-explosion",
  "explosions/cartoon-pow",
  "explosions/firework-burst",
  "explosions/firework-rocket",
  "explosions/grenade",
  "explosions/nuke",
  "water/bubbles",
  "water/drip",
  "water/fountain",
  "water/rain-splash",
  "water/ripples",
  "water/waterfall",
  "lightning/plasma-ball",
  "lightning/spark-arc",
  "lightning/tesla-coil",
  "scifi/energy-core",
  "scifi/glitch",
  "scifi/hologram",
  "scifi/jetpack",
  "scifi/laser-grid",
  "scifi/scanner",
  "scifi/teleporter-pad",
  "scifi/tractor-beam",
  "impacts/blunt-hit",
  "impacts/bullet-impact",
  "impacts/crit-hit",
  "impacts/hit-flash",
  "impacts/hit-spark",
  "impacts/impact-frame",
  "impacts/ricochet",
  "projectiles/bullet-tracer",
  "projectiles/cannonball",
  "projectiles/flare",
  "projectiles/homing-missile",
  "projectiles/laser-bolt",
  "projectiles/muzzle-pistol",
  "projectiles/muzzle-shotgun",
  "projectiles/muzzle-smg",
  "projectiles/plasma-shot",
  "projectiles/rocket",
  "spawn/coin-drop",
  "spawn/disintegrate",
  "spawn/dissolve-burn",
  "spawn/egg-hatch",
  "spawn/shatter-death",
  "spawn/soul-rise",
  "spawn/spawn-portal",
  "holy/feather-burst",
  "status/bleeding",
  "status/burning",
  "status/charmed",
  "status/confused",
  "status/cursed",
  "status/frozen",
  "status/haste",
  "status/petrified",
  "status/poisoned",
  "status/rage",
  "status/sleep",
  "status/slowed",
  "status/stunned",
  "critters/bat",
  "critters/bird",
  "critters/butterfly",
  "critters/eyeball",
  "critters/fish-school",
  "critters/flying-skull",
  "critters/frog",
  "critters/ghost",
  "critters/jellyfish",
  "critters/slime",
  "critters/snake",
  "critters/wisp",
  "weather/aurora",
  "weather/blizzard",
  "weather/cherry-blossoms",
  "weather/clouds",
  "weather/falling-leaves",
  "weather/fireflies",
  "weather/fog",
  "weather/god-rays",
  "weather/rain",
  "weather/shooting-stars",
  "weather/snow",
  "weather/storm",
];

// the type's own defaults, then tiers make it stronger and slower to come back
export const TYPE_DEFAULTS = {
  melee: { at: "front", cd: 3, mult: 1.3, range: 64, arc: 1.4 },
  bolt: { at: "bolt", cd: 4, mult: 1.5, range: 300, speed: 380, r: 12 },
  zone: { at: "target", cd: 8, mult: 1.7, dist: 120, r: 60, delay: 0.5, slow: 0, slowDur: 0 },
  nova: { at: "self", cd: 8, mult: 1.5, r: 90, delay: 0.2, slow: 0, slowDur: 0 },
  dash: { at: "self", cd: 6, mult: 1.4, dist: 140, r: 26 },
  heal: { at: "self", cd: 15, mult: 0, pct: 0.2 },
  buff: { at: "self", cd: 20, mult: 0, stat: "atk", pct: 20, dur: 8 },
};
const TIER = { 1: { mult: 1, cd: 1, qty: 3, rare: 0 }, 2: { mult: 1.3, cd: 1.35, qty: 6, rare: 1 }, 3: { mult: 1.8, cd: 2, qty: 10, rare: 3 } };
const NON_PARAMS = new Set(["at", "life", "cd", "mult"]);
// how far a zone that lands where it is aimed can be put from the caster
export const ZONE_AIM = 280;

export const keyOf = (fx) => fx.replace(/[/-]/g, "_");
const round = (v) => Math.round(v * 100) / 100;

/** The arts table's first rows. */
export const ARTS_SEED = [
  // the two everyone already had: known by all from the start, nothing to spend. Phi Kiếm throws the weapon in hand.
  { key: "phikiem", name: "Phi Kiếm", desc: "Phóng vũ khí đang cầm bay thẳng về phía trước.", element: "kim", tier: 1, type: "bolt", cd: 2.5, mult: 1.5, params: { range: 240, speed: 360, r: 10 }, fx: "", at: "bolt", life: 0, starter: true, sort: 1 },
  { key: "loian", name: "Lôi Ấn Trận", desc: "Gọi sét đánh xuống một vùng phía trước, làm chậm kẻ địch.", element: "loi", tier: 1, type: "zone", cd: 9, mult: 1.4, params: { dist: 110, r: 60, delay: 0.35, slow: 0.5, slowDur: 2.5 }, fx: "lightning/lightning-strike", at: "target", life: 0, starter: true, sort: 2 },
  ...L.map(([fx, name, element, type, tier, o], i) => {
    const d = TYPE_DEFAULTS[type], t = TIER[tier], params = {};
    for (const [k, v] of Object.entries({ ...d, ...o })) if (!NON_PARAMS.has(k)) params[k] = v;

    return {
      key: keyOf(fx), name, desc: "", element, tier, type, cd: round((o.cd ?? d.cd) * t.cd), mult: round((o.mult ?? d.mult) * t.mult), params,
      fx, at: o.at ?? d.at, life: o.life ?? 0, starter: false, sort: 10 + i,
      aim: type === "zone" && (o.at ?? d.at) === "target" ? o.aim ?? ZONE_AIM : 0,
    };
  }),
];

/** Items: one bí kíp per art that isn't a starter, the essences, Linh Tủy. kind: book | material. */
export const ART_ITEMS_SEED = [
  ...Object.values(ELEMENTS).map((e, i) => ({ key: e.mat, name: e.matName, desc: e.matDesc, kind: "material", sort: 100 + i })),
  { key: RARE.key, name: RARE.name, desc: RARE.desc, kind: "material", sort: 120 },
  ...ARTS_SEED.filter((a) => !a.starter).map((a, i) => ({
    key: "bk_" + a.key, name: `Bí Kíp: ${a.name}`, desc: `Cần để lĩnh ngộ ${a.name} (${ELEMENTS[a.element].name}, bậc ${a.tier}).`, kind: "book", sort: 200 + i,
  })),
];

/** What each art needs: its bí kíp, its element's essence by tier, Linh Tủy for tiers 2 and 3. */
export const ART_REQS_SEED = ARTS_SEED.filter((a) => !a.starter).flatMap((a) => {
  const t = TIER[a.tier];
  return [
    { art: a.key, item: "bk_" + a.key, qty: 1 },
    { art: a.key, item: ELEMENTS[a.element].mat, qty: t.qty },
    ...(t.rare ? [{ art: a.key, item: RARE.key, qty: t.rare }] : []),
  ];
});

/** Where things drop. "*" is every monster that has common drops on (not the straw dummies). chance per kill, 0-1. */
export const DROPS_SEED = [
  ...Object.values(ELEMENTS).map((e) => ({ monster: "*", item: e.mat, chance: 0.04, min: 1, max: 2 })),
  { monster: "*", item: RARE.key, chance: 0.01, min: 1, max: 1 },
  ...ARTS_SEED.filter((a) => !a.starter).map((a) => ({ monster: "*", item: "bk_" + a.key, chance: [0, 0.006, 0.003, 0.001][a.tier], min: 1, max: 1 })),
];
