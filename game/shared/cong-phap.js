// Công pháp: every art is designed here, one by one, in code; none is a row of numbers any more. Each has its own way
// of fighting (server/cong-phap.js), its own look (public/js/cong-phap.js) and these facts, read by the server and the
// browser alike. The database keeps only an admin's switches for each (the arts table): on or off, learnable with its
// bí kíp or only given (events, activities), and sold in the Công Pháp panel or not.
//
//   key      the art's code (the arts table, learned_arts, the bar)
//   starter  known by everyone from the start, on a new character's bar; never learned, bought or given
//   cd       seconds before it can be used again
//   aim      it can be dragged to a spot within this many px of the caster (0: it can't); aimR: the size of the mark shown
//            while dragging; aimDist: how far ahead it lands when not dragged
//   pose     the caster's casting pose (melee, bolt, zone)
//   icon     the effect its icon is drawn from (public/cong-phap/<n>-<name>/icon.png)
//   fx       every effect it draws (copied into public/hieu-ung/ by tools/hieu-ung.mjs)
//   line     what it does, in a line, for the Công Pháp panel
//   reqs     what learning it spends (its bí kíp, essence of its element, Linh Tủy)
//   price    spirit stones, when an admin puts it on sale

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

const book = (key) => "bk_" + key;
const reqs = (key, element, essence, rare) => [{ item: book(key), qty: 1 }, { item: ELEMENTS[element].mat, qty: essence }, ...(rare ? [{ item: RARE.key, qty: rare }] : [])];

export const CONG_PHAP = [
  {
    key: "phikiem", name: "Phi Kiếm", element: "kim", tier: 1, starter: true, cd: 2.5, aim: 0, pose: "bolt", icon: "", fx: [],
    desc: "Phóng vũ khí đang cầm bay thẳng về phía trước, xuyên qua kẻ địch rồi quay về tay.",
    line: "Phóng xa · xuyên tới 3 kẻ địch, mỗi lần xuyên yếu đi · bay về tay, trúng thêm lần nữa",
  },
  {
    key: "loian", name: "Lôi Ấn Trận", element: "loi", tier: 1, starter: true, cd: 9, aim: 280, aimR: 56, aimDist: 110, pose: "zone", icon: "lightning/lightning-strike", fx: ["lightning/lightning-strike"],
    desc: "Khắc lôi ấn xuống đất; lôi ấn tụ điện rồi giáng ba đạo sét liên tiếp, đạo cuối làm tê liệt.",
    line: "Kéo chọn chỗ · ấn tụ điện rồi 3 đạo sét liên tiếp · đạo cuối làm chậm 2,5s",
  },
  {
    key: "dia_chan_cuoc", name: "Địa Chấn Cước", element: "tho", tier: 2, cd: 10, aim: 0, pose: "melee", icon: "nature/earth-spike", fx: ["impacts/ground-slam", "nature/earth-spike"],
    desc: "Dậm chân xuống đất, chấn lực chạy dọc mặt đất làm từng cột đá nối nhau trồi lên, hất tung kẻ địch đang đứng trên đất.",
    line: "Chấn lực chạy dọc mặt đất: 5 cột đá nối nhau trồi lên phía trước · hất tung, làm chậm · không trúng kẻ đang bay",
    reqs: reqs("dia_chan_cuoc", "tho", 6, 1), price: 3000,
  },
  {
    key: "tam_tuyet_kiem", name: "Tam Tuyệt Kiếm", element: "kim", tier: 2, cd: 7, aim: 0, pose: "melee", icon: "melee/sword-slash", fx: ["melee/sword-slash", "melee/double-slash", "melee/heavy-cleave"],
    desc: "Ba nhát kiếm liền mạch vừa chém vừa tiến: một đường chém, hai đường chéo nhau, rồi hai tay bổ xuống đất hất văng đối thủ.",
    line: "Liên trảm 3 thức, vừa đánh vừa tiến · nhát cuối mạnh nhất, đánh bật lùi · đứng tấn trong lúc ra chiêu",
    reqs: reqs("tam_tuyet_kiem", "kim", 6, 1), price: 3000,
  },
  {
    key: "luu_tinh_hoa_vu", name: "Lưu Tinh Hỏa Vũ", element: "hoa", tier: 3, cd: 16, aim: 320, aimR: 100, aimDist: 160, pose: "zone", icon: "fire/fireball", fx: ["fire/meteor"],
    desc: "Gọi một trận mưa thiên thạch rực lửa trút xuống vùng đã chọn; đá rơi lệch nhau, chỗ rơi cháy âm ỉ một lúc.",
    line: "Kéo chọn chỗ · 6 thiên thạch rơi rải rác trong 2 giây · chỗ rơi còn cháy, đốt thêm 3 lần",
    reqs: reqs("luu_tinh_hoa_vu", "hoa", 10, 3), price: 8000,
  },
  {
    key: "diet_the_than_bao", name: "Diệt Thế Thần Bạo", element: "bao", tier: 3, cd: 45, aim: 0, pose: "zone", icon: "explosions/nuke", fx: ["lightning/charge-up", "explosions/nuke"],
    desc: "Đứng yên tụ toàn bộ linh lực, hút kẻ địch xung quanh lại, rồi kích nổ một vụ bạo phá hủy diệt trước mặt.",
    line: "Tụ lực 1,6 giây (đứng yên, hút kẻ địch lại gần) · đại bạo cực mạnh ở giữa, yếu dần ra rìa, hất văng · hồi 45s",
    reqs: reqs("diet_the_than_bao", "bao", 10, 3), price: 12000,
  },
];

export const CONG_PHAP_BY_KEY = Object.fromEntries(CONG_PHAP.map((a, i) => [a.key, { ...a, sort: i + 1, reqs: a.reqs ?? [], price: a.price ?? 0, starter: !!a.starter }]));
/** Every effect the arts draw. */
export const CONG_PHAP_FX = [...new Set(CONG_PHAP.flatMap((a) => [...a.fx, a.icon].filter(Boolean)))];

/** Items the arts need: the essences, Linh Tủy, one bí kíp per art that isn't a starter. kind: book | material. */
export const ART_ITEMS_SEED = [
  ...Object.values(ELEMENTS).map((e, i) => ({ key: e.mat, name: e.matName, desc: e.matDesc, kind: "material", sort: 100 + i })),
  { key: RARE.key, name: RARE.name, desc: RARE.desc, kind: "material", sort: 120 },
  ...CONG_PHAP.filter((a) => !a.starter).map((a, i) => ({
    key: book(a.key), name: `Bí Kíp: ${a.name}`, desc: `Cần để lĩnh ngộ ${a.name} (${ELEMENTS[a.element].name}, bậc ${a.tier}).`, kind: "book", sort: 200 + i,
  })),
];
/** Where the books and essences drop: "*" is every monster with common drops on. A weight among the list. */
export const DROPS_SEED = [
  ...Object.values(ELEMENTS).map((e) => ({ monster: "*", item: e.mat, chance: 0.04, min: 1, max: 2 })),
  { monster: "*", item: RARE.key, chance: 0.01, min: 1, max: 1 },
  ...CONG_PHAP.filter((a) => !a.starter).map((a) => ({ monster: "*", item: book(a.key), chance: [0, 0.006, 0.003, 0.001][a.tier], min: 1, max: 1 })),
];
