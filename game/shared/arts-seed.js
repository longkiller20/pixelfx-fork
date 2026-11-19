// Công pháp (arts): the first content of a fresh database. Every combat-capable effect pixelfx has becomes an art a player
// can learn; ui, transitions and pickups are left out (they are interface pieces, screen wipes and coins, not skills).
// After the first start the database is the source: an admin edits arts, what each needs and where things drop.
//
// An art is learned by spending its required items: its own bí kíp (a manual, dropped by monsters) and some essence of
// its element, more for higher tiers, and Linh Tủy for the great ones. The two arts everyone had before (Phi Kiếm, Lôi
// Ấn Trận) are starters: known by all, nothing to spend.
//
// Types the server knows (params in brackets; see ART_PARAMS in balance.js):
//   melee  an arc in front                         [range, arc]
//   bolt   a projectile                            [range, speed, r]
//   zone   an area ahead, after a beat              [dist, r, delay, slow, slowDur, aim]
//          aim > 0: the player can drag it anywhere within aim px (the ones drawn where they land: at target)
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
  // ---- moves: whole attacks with their own wind-up
  ["moves/arrow-shot", "Xạ Nhật Tiễn", "kim", "bolt", 1, { at: "front" }],
  ["moves/corpse-devour", "Luyện Thi Thôn Phệ", "am", "zone", 3, { at: "front", dist: 96, delay: 2.4 }],
  ["moves/dash-strike", "Ảnh Bộ Trảm", "kim", "dash", 2, { at: "front" }],
  ["moves/earth-stomp", "Địa Chấn Cước", "tho", "zone", 2, { at: "front", dist: 96, delay: 0.8 }],
  ["moves/fireball-throw", "Hỏa Cầu Thuật", "hoa", "bolt", 2, { at: "front" }],
  ["moves/ground-pound", "Thiên Cân Trụy", "tho", "nova", 2, { delay: 1.2 }],
  ["moves/henshin-dragon", "Long Hồn Biến", "quang", "buff", 3, { stat: "atk", pct: 60, dur: 15 }],
  ["moves/holy-smite", "Thánh Quang Phạt", "quang", "zone", 2, { at: "front", dist: 96, delay: 0.9 }],
  ["moves/ice-lance-throw", "Băng Mâu Thuật", "bang", "bolt", 2, { at: "front" }],
  ["moves/lightning-call", "Triệu Lôi Thuật", "loi", "zone", 2, { at: "front", dist: 96, delay: 1 }],
  ["moves/meteor-call", "Thiên Thạch Giáng", "hoa", "zone", 3, { at: "front", dist: 90, r: 90, delay: 3.2 }],
  ["moves/pistol-shots", "Tam Liên Xạ", "di", "bolt", 2, { at: "front" }],
  ["moves/rocket-launcher", "Phích Lịch Hỏa Tiễn", "di", "bolt", 3, { at: "front", r: 30 }],
  ["moves/sword-combo", "Tam Tuyệt Kiếm", "kim", "melee", 2, { at: "front", range: 80 }],
  ["moves/time-king-henshin", "Thời Vương Biến", "huyen", "buff", 3, { stat: "def", pct: 60, dur: 15 }],
  // ---- fire
  ["fire/brazier", "Hỏa Bồn Tế", "hoa", "buff", 1, { at: "target", life: 4, stat: "atk", pct: 15, dur: 10 }],
  ["fire/campfire", "Lô Hỏa Dưỡng Thân", "hoa", "heal", 1, { at: "target", pct: 0.15, life: 2.5 }],
  ["fire/candle", "Tâm Đăng Thuật", "hoa", "heal", 1, { at: "target", pct: 0.1, life: 2 }],
  ["fire/fire-breath", "Hỏa Long Tức", "hoa", "melee", 1, { range: 110, arc: 0.9, life: 1.2 }],
  ["fire/fire-ring", "Viêm Hoàn", "hoa", "nova", 2, {}],
  ["fire/fire-tornado", "Hỏa Long Quyển", "hoa", "zone", 2, { life: 2 }],
  ["fire/fireball", "Hỏa Cầu", "hoa", "bolt", 1, {}],
  ["fire/flame-pillar", "Liệt Diễm Trụ", "hoa", "zone", 2, { delay: 0.8 }],
  ["fire/flamethrower", "Liệt Hỏa Phún", "hoa", "melee", 2, { range: 120, arc: 0.7, life: 1.4 }],
  ["fire/meteor", "Lưu Tinh Hỏa Vũ", "hoa", "zone", 3, { r: 80, delay: 1.4 }],
  ["fire/spirit-flame", "U Linh Hỏa", "am", "bolt", 1, { speed: 260 }],
  ["fire/torch", "Cử Hỏa Bộ", "hoa", "buff", 1, { at: "target", life: 3, stat: "spd", pct: 15, dur: 8 }],
  // ---- explosions
  ["explosions/barrel-explosion", "Bạo Dược Thùng", "bao", "zone", 2, { delay: 1.6 }],
  ["explosions/big-explosion", "Thiên Băng Địa Liệt", "bao", "zone", 3, { r: 100, delay: 0.5 }],
  ["explosions/cartoon-pow", "Bạo Quyền", "bao", "melee", 1, { range: 70 }],
  ["explosions/dirt-explosion", "Địa Lôi Phù", "bao", "zone", 2, { delay: 0.3 }],
  ["explosions/firework-burst", "Yên Hoa Tán", "bao", "zone", 1, { delay: 1.2 }],
  ["explosions/firework-rocket", "Yên Hoa Tiễn", "bao", "zone", 2, { delay: 1.4 }],
  ["explosions/grenade", "Lôi Hỏa Đạn", "bao", "zone", 2, { delay: 2.2 }],
  ["explosions/implosion", "Hấp Tinh Bạo", "huyen", "nova", 2, { delay: 0.8 }],
  ["explosions/nuke", "Diệt Thế Thần Bạo", "bao", "zone", 3, { dist: 160, r: 140, delay: 0.6 }],
  ["explosions/plasma-explosion", "Linh Năng Bạo", "di", "zone", 2, { delay: 0.2 }],
  ["explosions/small-explosion", "Tiểu Bạo Phù", "bao", "zone", 1, { delay: 0.2 }],
  ["explosions/smoke-bomb", "Yên Vụ Đạn", "bao", "zone", 1, { slow: 0.5, slowDur: 3, delay: 0.8 }],
  // ---- water
  ["water/bubbles", "Bào Ảnh Thuật", "thuy", "nova", 1, { r: 60, slow: 0.4, slowDur: 2, life: 2 }],
  ["water/drip", "Thủy Tích Xuyên Thạch", "thuy", "bolt", 1, { speed: 300 }],
  ["water/fountain", "Linh Tuyền Dưỡng Thân", "thuy", "heal", 2, { at: "target", pct: 0.3, life: 2.5 }],
  ["water/geyser", "Thủy Long Trụ", "thuy", "zone", 2, { delay: 1.8 }],
  ["water/rain-splash", "Vũ Lạc Thuật", "thuy", "zone", 1, { slow: 0.3, slowDur: 2, life: 2 }],
  ["water/ripples", "Liên Y Ba", "thuy", "nova", 1, { r: 70, life: 1.6 }],
  ["water/splash", "Thủy Bạo Thuật", "thuy", "zone", 1, { delay: 0.2 }],
  ["water/water-jet", "Thủy Tiễn", "thuy", "melee", 1, { range: 120, arc: 0.5, life: 1 }],
  ["water/water-orb", "Thủy Linh Cầu", "thuy", "bolt", 1, { speed: 280 }],
  ["water/waterfall", "Bộc Bố Giáng", "thuy", "zone", 2, { life: 2 }],
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
  ["lightning/plasma-ball", "Lôi Cầu Trận", "loi", "zone", 1, { life: 2 }],
  ["lightning/spark-arc", "Lôi Hồ Trận", "loi", "zone", 1, { life: 2 }],
  ["lightning/storm-cloud", "Lôi Vân Trận", "loi", "zone", 2, { slow: 0.3, slowDur: 2, life: 2.4 }],
  ["lightning/tesla-coil", "Lôi Tháp", "loi", "nova", 2, { life: 2.4 }],
  ["lightning/thunderclap", "Lôi Minh Chấn", "loi", "nova", 2, { delay: 0.3 }],
  ["lightning/zap-hit", "Điện Chưởng", "loi", "melee", 1, { range: 60 }],
  // ---- sci-fi: from other worlds of the multiverse
  ["scifi/emp-blast", "Phá Năng Bạo", "di", "nova", 2, { slow: 0.4, slowDur: 2, delay: 0.8 }],
  ["scifi/energy-core", "Năng Lượng Hạch", "di", "zone", 1, { life: 2 }],
  ["scifi/force-field", "Lực Trường Hộ Thuẫn", "di", "buff", 2, { stat: "def", pct: 40, dur: 8, life: 8 }],
  ["scifi/glitch", "Nhiễu Loạn Thân", "di", "buff", 1, { stat: "spd", pct: 20, dur: 6, life: 6 }],
  ["scifi/hologram", "Huyễn Ảnh Trận", "di", "zone", 1, { slow: 0.3, slowDur: 2, life: 2.4 }],
  ["scifi/jetpack", "Phi Hành Khí", "di", "dash", 2, { dist: 180, life: 1.2 }],
  ["scifi/laser-grid", "Quang Võng Trận", "di", "zone", 2, { life: 2.4 }],
  ["scifi/scanner", "Thấu Thị Thuật", "di", "buff", 1, { stat: "atk", pct: 15, dur: 10, life: 3 }],
  ["scifi/teleporter-pad", "Truyền Tống Trận", "di", "dash", 2, { dist: 200, r: 10, life: 1.6 }],
  ["scifi/tractor-beam", "Nhiếp Dẫn Quang", "di", "zone", 2, { slow: 0.6, slowDur: 2, life: 2.4 }],
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
  ["impacts/blunt-hit", "Trọng Quyền", "kim", "melee", 1, { range: 56 }],
  ["impacts/bullet-impact", "Toái Thạch Chỉ", "di", "bolt", 1, { at: "target" }],
  ["impacts/crit-hit", "Bạo Kích Chưởng", "kim", "melee", 2, { range: 60 }],
  ["impacts/ground-slam", "Liệt Địa Chấn", "tho", "nova", 2, { delay: 0.2 }],
  ["impacts/heavy-landing", "Thái Sơn Áp Đỉnh", "tho", "nova", 1, { r: 70 }],
  ["impacts/hit-flash", "Quang Ảnh Chưởng", "quang", "melee", 1, { range: 50 }],
  ["impacts/hit-spark", "Tinh Hỏa Chỉ", "kim", "melee", 1, { range: 50 }],
  ["impacts/impact-frame", "Nhất Kích Tất Sát", "kim", "melee", 3, { range: 70 }],
  ["impacts/parry", "Cách Đáng Thuật", "kim", "buff", 1, { stat: "def", pct: 30, dur: 4 }],
  ["impacts/ricochet", "Đạn Xạ Chỉ", "di", "bolt", 1, { at: "front" }],
  ["impacts/shield-block", "Kim Cương Thuẫn", "kim", "buff", 2, { stat: "def", pct: 45, dur: 5 }],
  // ---- projectiles
  ["projectiles/arrow", "Truy Phong Tiễn", "kim", "bolt", 1, { speed: 460 }],
  ["projectiles/bullet-tracer", "Lưu Quang Đạn", "di", "bolt", 1, { speed: 560 }],
  ["projectiles/cannonball", "Oanh Thiên Pháo", "di", "zone", 2, { at: "front", dist: 140, delay: 0.6 }],
  ["projectiles/energy-disc", "Năng Lượng Luân", "di", "bolt", 2, { speed: 340, r: 16 }],
  ["projectiles/flare", "Tín Hiệu Hỏa", "hoa", "zone", 1, { delay: 1.2 }],
  ["projectiles/homing-missile", "Truy Tung Đạn", "di", "zone", 2, { delay: 1.8 }],
  ["projectiles/laser-bolt", "Hồng Quang Tiễn", "di", "bolt", 1, { speed: 520 }],
  ["projectiles/magic-missile", "Huyền Quang Đạn", "huyen", "bolt", 1, { at: "front" }],
  ["projectiles/muzzle-pistol", "Hỏa Thương Xạ", "di", "bolt", 1, { at: "front", speed: 600 }],
  ["projectiles/muzzle-shotgun", "Tán Đạn Thương", "di", "melee", 2, { at: "front", range: 110, arc: 0.9 }],
  ["projectiles/muzzle-smg", "Liên Phát Thương", "di", "bolt", 2, { at: "front", speed: 600, life: 1 }],
  ["projectiles/plasma-shot", "Linh Năng Đạn", "di", "bolt", 1, {}],
  ["projectiles/rocket", "Hỏa Tiễn", "di", "bolt", 2, { r: 24 }],
  // ---- spawn & death
  ["spawn/coin-drop", "Tán Tài Thuật", "huyen", "zone", 1, { delay: 0.3 }],
  ["spawn/disintegrate", "Phân Giải Thuật", "di", "zone", 3, { dist: 80, r: 40, delay: 1.2 }],
  ["spawn/dissolve-burn", "Phần Thân Hỏa", "hoa", "zone", 2, { dist: 80, r: 40, delay: 1.2 }],
  ["spawn/egg-hatch", "Linh Noãn Phá Xác", "thu", "zone", 1, { delay: 2.2 }],
  ["spawn/poof", "Yên Độn Thuật", "huyen", "dash", 1, { dist: 120, r: 10 }],
  ["spawn/respawn-beam", "Hồi Quang Phản Chiếu", "quang", "heal", 2, { pct: 0.35 }],
  ["spawn/shatter-death", "Băng Phong Toái Thể", "bang", "zone", 3, { dist: 80, r: 40, delay: 1.6, slow: 0.8, slowDur: 2 }],
  ["spawn/soul-rise", "Hồn Thăng Thuật", "am", "heal", 2, { pct: 0.25 }],
  ["spawn/spawn-portal", "Dị Giới Môn", "di", "zone", 2, { delay: 1 }],
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
  ["holy/feather-burst", "Thiên Vũ Tán", "quang", "nova", 1, {}],
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
  // ---- status: arts that put a state on a spot, or on oneself
  ["status/bleeding", "Phá Huyết Chỉ", "kim", "melee", 1, { range: 56, life: 2 }],
  ["status/burning", "Liệt Hỏa Phệ Thân", "hoa", "zone", 1, { dist: 80, r: 40, life: 2 }],
  ["status/charmed", "Mị Hoặc Thuật", "huyen", "zone", 2, { dist: 80, r: 40, slow: 0.7, slowDur: 3, life: 2 }],
  ["status/confused", "Mê Hồn Thuật", "huyen", "zone", 1, { dist: 80, r: 40, slow: 0.5, slowDur: 3, life: 2 }],
  ["status/cursed", "Thực Cốt Chú", "am", "zone", 1, { dist: 80, r: 40, life: 2 }],
  ["status/frozen", "Hàn Băng Phong Thân", "bang", "zone", 2, { dist: 80, r: 40, slow: 0.8, slowDur: 2.5, life: 2 }],
  ["status/haste", "Thần Hành Thuật", "phong", "buff", 1, { stat: "spd", pct: 35, dur: 8, life: 8 }],
  ["status/petrified", "Thạch Hóa Thuật", "tho", "zone", 3, { dist: 80, r: 40, slow: 0.9, slowDur: 3 }],
  ["status/poisoned", "Vạn Độc Thuật", "moc", "zone", 1, { dist: 80, r: 40, life: 2 }],
  ["status/rage", "Cuồng Bạo Quyết", "kim", "buff", 2, { stat: "atk", pct: 40, dur: 8, life: 8 }],
  ["status/sleep", "Thôi Miên Thuật", "huyen", "zone", 2, { dist: 80, r: 40, slow: 0.8, slowDur: 3, life: 2 }],
  ["status/slowed", "Trì Hoãn Thuật", "huyen", "zone", 1, { dist: 80, r: 40, slow: 0.6, slowDur: 3, life: 2 }],
  ["status/stunned", "Chấn Hồn Chưởng", "kim", "zone", 2, { dist: 60, r: 40, slow: 0.9, slowDur: 1.5, life: 2 }],
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
  // ---- critters: beasts called to fight
  ["critters/bat", "Huyết Bức Tập", "thu", "bolt", 1, { speed: 260, life: 1.4 }],
  ["critters/bird", "Linh Điểu Kích", "thu", "bolt", 1, { speed: 300, life: 1.4 }],
  ["critters/butterfly", "Huyễn Điệp Thuật", "thu", "zone", 1, { slow: 0.4, slowDur: 2, life: 2 }],
  ["critters/eyeball", "Ma Nhãn", "thu", "bolt", 1, { speed: 220, life: 1.6 }],
  ["critters/fish-school", "Ngư Quần Trận", "thu", "zone", 1, { life: 2 }],
  ["critters/flying-skull", "Phi Lâu Cốt", "am", "bolt", 1, { speed: 240, life: 1.6 }],
  ["critters/frog", "Thiềm Thừ Độc", "thu", "zone", 1, { life: 2 }],
  ["critters/ghost", "Âm Hồn Phụ Thể", "am", "bolt", 1, { speed: 200, life: 1.8 }],
  ["critters/jellyfish", "Thủy Mẫu Thuật", "thu", "zone", 1, { slow: 0.5, slowDur: 2, life: 2 }],
  ["critters/slime", "Nhuyễn Thể Thuật", "thu", "zone", 1, { slow: 0.6, slowDur: 2, life: 2 }],
  ["critters/snake", "Linh Xà Phệ", "thu", "melee", 1, { range: 90, arc: 0.6, life: 1.6 }],
  ["critters/wisp", "Quỷ Hỏa Linh", "thu", "bolt", 1, { speed: 200, life: 1.8 }],
  // ---- weather: the sky itself
  ["weather/aurora", "Cực Quang Thuật", "quang", "heal", 2, { at: "target", pct: 0.25, life: 3 }],
  ["weather/blizzard", "Bạo Phong Tuyết", "bang", "zone", 3, { r: 110, slow: 0.6, slowDur: 3, life: 3 }],
  ["weather/cherry-blossoms", "Anh Hoa Vũ", "moc", "heal", 1, { at: "target", pct: 0.15, life: 3 }],
  ["weather/clouds", "Đằng Vân Thuật", "phong", "buff", 1, { at: "target", stat: "spd", pct: 25, dur: 8, life: 3 }],
  ["weather/falling-leaves", "Lạc Diệp Phi Hoa", "moc", "zone", 1, { r: 80, life: 2.4 }],
  ["weather/fireflies", "Huỳnh Quang Trận", "quang", "zone", 1, { life: 2.4 }],
  ["weather/fog", "Mê Vụ Trận", "thuy", "zone", 2, { r: 100, slow: 0.5, slowDur: 3, life: 3 }],
  ["weather/god-rays", "Thiên Quang Phổ Chiếu", "quang", "heal", 2, { at: "target", pct: 0.3, life: 3 }],
  ["weather/rain", "Hô Phong Hoán Vũ", "thuy", "zone", 2, { r: 110, slow: 0.3, slowDur: 2, life: 3 }],
  ["weather/shooting-stars", "Lưu Tinh Vũ", "huyen", "zone", 3, { r: 110, life: 3 }],
  ["weather/snow", "Phi Tuyết Thuật", "bang", "zone", 1, { r: 100, slow: 0.3, slowDur: 2, life: 3 }],
  ["weather/storm", "Lôi Bạo Thiên Uy", "loi", "zone", 3, { r: 120, life: 3 }],
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

const keyOf = (fx) => fx.replace(/[/-]/g, "_");
const round = (v) => Math.round(v * 100) / 100;

/** The arts table's first rows. */
export const ARTS_SEED = [
  // the two everyone already had: known by all from the start, nothing to spend. Phi Kiếm throws the weapon in hand.
  { key: "phikiem", name: "Phi Kiếm", desc: "Phóng vũ khí đang cầm bay thẳng về phía trước.", element: "kim", tier: 1, type: "bolt", cd: 2.5, mult: 1.5, params: { range: 240, speed: 360, r: 10 }, fx: "", at: "bolt", life: 0, starter: true, sort: 1 },
  { key: "loian", name: "Lôi Ấn Trận", desc: "Gọi sét đánh xuống một vùng phía trước, làm chậm kẻ địch.", element: "loi", tier: 1, type: "zone", cd: 9, mult: 1.4, params: { dist: 110, r: 60, delay: 0.35, slow: 0.5, slowDur: 2.5 }, fx: "lightning/lightning-strike", at: "target", life: 0, starter: true, sort: 2 },
  ...L.map(([fx, name, element, type, tier, o], i) => {
    const d = TYPE_DEFAULTS[type], t = TIER[tier], params = {};
    for (const [k, v] of Object.entries({ ...d, ...o })) if (!NON_PARAMS.has(k)) params[k] = v;
    if (type === "zone" && (o.at ?? d.at) === "target") params.aim = o.aim ?? ZONE_AIM;
    return {
      key: keyOf(fx), name, desc: "", element, tier, type, cd: round((o.cd ?? d.cd) * t.cd), mult: round((o.mult ?? d.mult) * t.mult), params,
      fx, at: o.at ?? d.at, life: o.life ?? 0, starter: false, sort: 10 + i,
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
