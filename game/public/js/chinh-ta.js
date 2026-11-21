// Chính Tà Phân Tranh in the browser (▦ Thêm → Chính Tà, and the battlefield's own bar, board and result). The browser
// only asks: the server (server/chinh-ta.js) keeps the schedule, picks the teams, counts the hạ gục and gives the points.
// Every picture is pixelfx (src/fx/chinhta: the two emblems, moving), every name goes in with textContent.
import { realmName } from "/shared/balance.js";
import { FACTIONS, POINTS, WAR_MAP } from "/shared/chinh-ta.js";
import { lovePic } from "./dao-lu.js";
import { h } from "./tong-mon.js";
import { confirmBox } from "./gia-vien.js";

const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const $ = (id) => document.getElementById(id);
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
/** "3 ngày 5 giờ", "2 giờ 13 phút", "45 giây". */
const until = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 86400) return `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ`;
  if (s >= 3600) return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`;
  if (s >= 60) return `${Math.floor(s / 60)} phút ${s % 60} giây`;
  return `${s} giây`;
};
const dayText = (t, tz = 7) => {
  const d = new Date(t + tz * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};
const RESULT = { w: ["Thắng", "win"], l: ["Thua", "lose"], d: ["Hòa", "draw"], x: ["Rời trận", "left"] };

/** A side's emblem (pixelfx chinhta/emblem), moving, css px wide. */
export const emblemPic = (f, css = 48, cls = "ctemb") => lovePic("chinhta/emblem", { side: f === "t" ? "t" : "c" }, 32, 32, css, cls);
/** A side's emblem drawn once, for the name tags over people's heads (a canvas, 32 × 32). */
const still = {};
export function emblemStill(f) {
  if (still[f]) return still[f];
  const cv = emblemPic(f, 32);
  cv.paint = () => {};
  return (still[f] = cv);
}

export function initChinhTa({ call, uuid, panel, flash, game }) {
  let view = null, tab = "war", busy = false, timer = null;
  const open = () => !$("panel").hidden && document.querySelector("#panel .ctp");

  async function load() {
    view = await call("/chinhta");
    view.at = Date.now();
    return view;
  }
  async function post(path, body, msg, btn) {
    if (busy) return null;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const r = await call(`/chinhta${path}`, { method: "POST", body });
      if (r.view) (view = r.view), (view.at = Date.now());
      if (msg) flash(typeof msg === "function" ? msg(r) : msg);
      if (open()) draw();
      return r;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
      return null;
    } finally {
      busy = false;
    }
  }

  // ---- picking or changing the side
  async function pickSide(f) {
    const v = view, F = FACTIONS[f];
    const text = v.change.first
      ? `Gia nhập ${F.name}? "${F.motto}" Lần chọn đầu không mất phí.`
      : `Đổi sang ${F.name} với ${fmt(v.change.cost)} linh thạch? Sau đó ${v.change.days} ngày mới đổi lại được.`;
    if (!(await confirmBox({ title: v.change.first ? "Chọn phe" : "Đổi phe", text, ok: v.change.first ? "Gia nhập" : "Đổi phe", pic: emblemPic(f, 72) }))) return;
    await post("/faction", { faction: f, requestId: uuid() }, `Đạo hữu đã gia nhập ${F.name}.`);
  }
  function sideCard(f, pick = false) {
    const F = FACTIONS[f];
    return h(`div.ctside.f-${f}`, {}, emblemPic(f, 64), h("b", { text: F.name }), h("small", { text: F.motto }),
      pick ? h("button.primary", { type: "button", text: `Gia nhập ${F.short}`, onclick: () => pickSide(f) }) : null);
  }

  // ---- the tabs
  let short = false;
  function warTab(v) {
    const R = v.rules, out = [];
    if (!v.faction) {
      out.push(h("p.ctlead", { text: "Đạo hữu chưa thuộc phe nào. Chọn một phe để tham gia Chính Tà Phân Tranh:" }), h("div.ctsides", {}, sideCard("c", true), sideCard("t", true)));
    } else {
      const F = FACTIONS[v.faction];
      out.push(h(`div.ctme.f-${v.faction}`, {}, emblemPic(v.faction, 56),
        h("div", {}, h("b", { text: F.name }), h("small", { text: F.motto }), h("span.ctpts", { text: `${fmt(v.points)} điểm ${POINTS}` }))));
    }
    // the battle on now
    if (v.now) {
      const n = v.now, left = Math.max(0, (n.phase === "prep" ? n.fightAt : n.ends) - Date.now());
      out.push(h("div.ctnow", {},
        h("b", { text: n.phase === "over" ? "Trận vừa kết thúc" : n.phase === "prep" ? "Đang chuẩn bị khai chiến" : "Đang giao chiến" }),
        h("div.ctscore", {}, emblemPic("c", 28), h("span.c", { text: fmt(n.kills.c) }), h("i", { text: n.phase === "over" ? "–" : clock(left / 1000) }), h("span.t", { text: fmt(n.kills.t) }), emblemPic("t", 28)),
        h("small", { text: `Chính Phái ${n.size.c} người · Tà Phái ${n.size.t} người` }),
        n.mine && !n.mine.left ? h("small.gold", { text: "Đạo hữu đang ở trong trận." }) : n.bench ? h("small.gold", { text: `Đạo hữu là dự bị số ${n.bench.n}: sẽ được gọi vào khi có chỗ trống.` }) : null));
    }
    // the next battle and signing up
    if (v.next) {
      const N = v.next, now = Date.now(), closes = N.closes - now;
      const btn = N.signed
        ? h("button.ghost", { type: "button", text: "Hủy đăng ký", disabled: !N.open, onclick: (e) => post("/unregister", {}, "Đã hủy đăng ký.", e.currentTarget) })
        : h("button.primary", { type: "button", text: "⚔ Đăng ký tham chiến", disabled: !N.open || !v.faction || v.level < R.level,
          onclick: (e) => post("/register", {}, (r) => (r.again ? "Đạo hữu đã đăng ký rồi." : "Đã đăng ký! Đến giờ đạo hữu sẽ được đưa thẳng vào chiến trường."), e.currentTarget) });
      out.push(h("div.ctnext", {},
        h("div.ctnhead", {}, h("b", { text: `Trận kế tiếp: ${N.text}` }), h("span.ctcount", { "data-at": N.at, text: `còn ${until(N.at - now)}` })),
        h("div.ctreg", {},
          h("span.chip.f-c", { text: `Chính Phái: ${N.counts.c} đăng ký` }), h("span.chip.f-t", { text: `Tà Phái: ${N.counts.t} đăng ký` })),
        h("small", { text: N.open ? `Đóng đăng ký lúc ${dayText(N.closes, R.tz)}.` : "Đã đóng đăng ký trận này." }),
        N.signed ? h("small.gold", { text: `✓ Đã đăng ký cho ${FACTIONS[v.faction]?.name ?? ""}: trực tuyến lúc ${N.text.split(" ")[0]} để vào trận.` }) : null,
        v.level < R.level ? h("small.err", { text: `Cần đạt cấp ${R.level} (${realmName(R.level)}) mới đăng ký được.` }) : null,
        h("div.cbtns", {}, btn)));
    } else out.push(h("p.dim", { text: "Chính Tà Phân Tranh chưa có lịch. Hãy chờ thông báo của ban quản trị." }));
    // the rules
    out.push(h("details.ctrules", { open: !v.faction && !short },
      h("summary", { text: "Luật Chính Tà Phân Tranh" }),
      h("ul", {},
        h("li", { text: `Mỗi ngày lúc ${R.times.join(", ") || "(chưa có giờ)"}. Đăng ký trước, đến giờ hệ thống tự đưa người được chọn vào Chính Tà Chiến Trường.` }),
        h("li", { text: `Mỗi phe tối đa ${R.team} người: chọn những người mạnh nhất đang trực tuyến (cảnh giới, tu vi, điểm đấu trường). Phe đông hơn được hơn phe kia tối đa ${R.maxGap} người; còn lại là dự bị, được gọi vào thay người rời trận.` }),
        h("li", { text: `Cần đạt cấp ${R.level}. Mỗi phe cần ít nhất ${R.minSide} người, không thì trận bị hủy.` }),
        h("li", { text: `Trận kéo dài ${R.minutes} phút trên bản đồ phẳng. Bị hạ gục thì sau ${R.respawn} giây hồi sinh ở doanh trại; trong kết giới doanh trại không ai đánh được ai, phe địch không vào được.` }),
        h("li", { text: `Hết giờ, phe có nhiều lượt hạ gục hơn thắng (bằng nhau: hòa). Trong trận mọi người cùng chỉ số đấu trường, không tính buff.` }),
        h("li", { text: `Thưởng điểm ${POINTS}: thắng ${R.win}, thua ${R.lose}, hòa ${R.draw}; thêm ${R.killPts} điểm mỗi lượt hạ gục (tối đa ${R.killCap}); người hạ gục nhiều nhất mỗi phe thêm ${R.mvp}. Phải ở trong trận ít nhất ${R.minStay}% thời gian; tự rời trận thì không có thưởng.` }))));
    // changing side
    if (v.faction) {
      const o = v.faction === "c" ? "t" : "c";
      out.push(h("div.ctchange", {}, h("small", { text: v.change.wait > 0 ? `Vừa đổi phe: còn ${until(v.change.wait * 1000)} mới đổi lại được.` : `Đổi phe: ${fmt(v.change.cost)} linh thạch, ${v.change.days} ngày mới đổi lại được một lần.` }),
        h("button.ghost", { type: "button", text: `Đổi sang ${FACTIONS[o].name}`, disabled: v.change.wait > 0 || !!v.next?.signed, onclick: () => pickSide(o) })));
    }
    // a short screen: two columns side by side, each as tall as its own content (the next battle and the rules on the right)
    if (short) {
      const right = (e) => e && (e.classList.contains("ctnext") || e.classList.contains("ctrules"));
      return h("div.ctwar.cols", {}, h("div.ctcol1", {}, ...out.filter((e) => !right(e))), h("div.ctcol2", {}, ...out.filter(right)));
    }
    return h("div.ctwar", {}, ...out);
  }
  function shopTab(v) {
    return h("div.ctshop", {},
      h("div.ctpbig", {}, emblemPic(v.faction ?? "c", 40), h("div", {}, h("small", { text: `Điểm ${POINTS} của đạo hữu` }), h("b", { text: fmt(v.points) }))),
      h("div.ctnote", {}, h("b", { text: "🏗 Tiệm Chính Tà đang được xây dựng" }),
        h("p", { text: `Tiệm sẽ được phát triển thêm sau với nhiều bảo vật đổi bằng điểm ${POINTS}. Đạo hữu cứ tích lũy điểm: mọi điểm đều được giữ nguyên để đổi khi tiệm mở rộng!` })),
      v.shop.length ? h("div.ctitems", {}, ...v.shop.map((it) => h("div.ctitem", {},
        h("div", {}, h("b", { text: it.name }), h("small.dim", { text: it.desc })),
        h("span.gold", { text: `${fmt(it.price)} điểm` }),
        h("button.primary", { type: "button", text: "Đổi", disabled: v.points < it.price, onclick: (e) => post("/buy", { item: it.item, qty: 1, requestId: uuid() }, `Đã đổi ${it.name}.`, e.currentTarget) }))))
        : h("p.dim.ctempty", { text: "Chưa có món nào. Hẹn đạo hữu khi tiệm khai trương!" }));
  }
  function historyTab(v) {
    if (!v.history.length) return h("p.dim", { text: "Đạo hữu chưa tham gia trận Chính Tà nào." });
    return h("div.cthist", {}, ...v.history.map((r) => {
      const [txt, cls] = RESULT[r.result] ?? ["?", ""];
      return h("div.cthrow", {},
        emblemPic(r.faction, 28),
        h("div", {}, h("b", { text: dayText(r.at, v.rules.tz) }), h("small", { text: `Chính ${r.kills.c} - ${r.kills.t} Tà · hạ ${r.k} / bại ${r.d} / trợ ${r.a}` })),
        h(`span.ctres.${cls}`, { text: txt }), r.mvp ? h("span.chip.gold", { text: "MVP" }) : null,
        h("span.gold", { text: `+${fmt(r.points)}` }));
    }));
  }
  function topTab(v) {
    if (!v.top.length) return h("p.dim", { text: `Chưa ai có điểm ${POINTS}.` });
    return h("ol.cttop", {}, ...v.top.map((r) => h("li", {}, r.faction ? emblemPic(r.faction, 24) : h("span"), h("b", { text: r.name }), h("small", { text: realmName(r.level) }), h("span.gold", { text: fmt(r.v) }))));
  }
  function draw(first = false) {
    const v = view;
    const tabs = [["war", "Phân Tranh"], ["shop", "Tiệm Chính Tà"], ["hist", "Chiến tích"], ["top", "Xếp hạng"]];
    // a phone held sideways (a short screen): no banner, two columns, smaller everything, so it all shows without scrolling
    const rot = document.body.classList.contains("rotated"), H = rot ? innerWidth : innerHeight, W = rot ? innerHeight : innerWidth;
    short = H < 521 && W > 560;
    const wrap = h(`div.ctp${short ? ".short" : ""}`, {},
      h("div.ctbanner", {}, emblemPic("c", 40), h("b", { text: "Chính Tà Phân Tranh" }), emblemPic("t", 40)),
      h("div.ctabs.stabs", {}, ...tabs.map(([k, l]) => h("button", { type: "button", text: l, className: tab === k ? "on" : "", onclick: () => ((tab = k), draw()) }))),
      { war: warTab, shop: shopTab, hist: historyTab, top: topTab }[tab](v));
    if (first || !open()) panel("Chính Tà", wrap);
    else $("panelBody").replaceChildren(wrap);
    // the countdowns tick while the panel is open
    clearInterval(timer);
    timer = setInterval(() => {
      if (!open()) return clearInterval(timer);
      for (const el of document.querySelectorAll(".ctcount[data-at]")) el.textContent = `còn ${until(Number(el.dataset.at) - Date.now())}`;
    }, 1000);
  }
  // turning the phone or resizing the window: drawn again for the new screen
  addEventListener("resize", () => open() && view && draw());
  async function openPanel(t = null) {
    try {
      await load();
    } catch (e) {
      return flash(e.message);
    }
    if (t) tab = t;
    draw(true);
  }

  // ---------------------------------------------------------------- on the battlefield: the bar, the board, the result
  let st = null, score = null, board = [], endAt = 0, boardOpen = false, tickT = null;
  const hud = () => $("hud");
  function bar() {
    let el = $("ctbar");
    if (!el) {
      el = h("div", {});
      el.id = "ctbar";
      hud().append(el);
    }
    return el;
  }
  function drawBar() {
    if (!st) return;
    const s = score ?? { c: 0, tk: 0, phase: st.phase, left: 0, me: null };
    const left = s.phase === "prep" ? (st.fightAt - Date.now()) / 1000 : s.phase === "fight" ? (st.ends - Date.now()) / 1000 : 0;
    const el = bar();
    el.className = `f-${st.faction ?? "x"}`;
    el.replaceChildren(
      h("div.ctsc", {},
        emblemStillImg("c"), h("b.c", { text: fmt(s.c) }),
        h("div.cttime", {}, h("small", { text: s.phase === "prep" ? "Chuẩn bị" : s.phase === "fight" ? "Giao chiến" : "Kết thúc" }), h("span", { text: clock(left) })),
        h("b.t", { text: fmt(s.tk) }), emblemStillImg("t")),
      s.me ? h("div.ctmine", {}, h("span", { text: `Hạ ${s.me.k}` }), h("span", { text: `Bại ${s.me.d}` }), h("span", { text: `Trợ ${s.me.a}` }), s.me.s >= 2 ? h("span.gold", { text: `Liên trảm ${s.me.s}` }) : null) : null,
      h("div.ctbtns", {},
        h("button.ghost", { type: "button", text: "Bảng (Tab)", onclick: () => toggleBoard() }),
        h("button.ghost.danger", { type: "button", text: "Rời trận", onclick: () => leave() })));
  }
  const emblemStillImg = (f) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    cv.className = "ctembs";
    cv.getContext("2d").drawImage(emblemStill(f), 0, 0);
    return cv;
  };
  async function leave() {
    if (!(await confirmBox({ title: "Rời chiến trường", text: "Rời trận bây giờ sẽ không nhận được điểm Chính Tà nào, và không vào lại trận này được. Chỗ của đạo hữu sẽ nhường cho dự bị.", ok: "Rời trận" }))) return;
    await post("/leave", {}, "Đã rời chiến trường.");
  }
  function toggleBoard(on = !boardOpen) {
    boardOpen = on;
    let el = $("ctboard");
    if (!on) return el?.remove();
    if (!el) {
      el = h("div.ctboardp", { role: "dialog", onclick: (e) => e.target === el && toggleBoard(false) });
      el.id = "ctboard";
      hud().append(el);
    }
    drawBoard();
  }
  function drawBoard(rows = board, title = "Bảng chiến tích") {
    const el = $("ctboard");
    if (!el) return;
    const me = game()?.myName?.();
    const col = (f) => h(`div.ctcol.f-${f}`, {},
      h("div.ctchead", {}, emblemStillImg(f), h("b", { text: FACTIONS[f].name }), h("span", { text: fmt(rows.filter((r) => r.f === f).reduce((a, r) => a + r.k, 0)) })),
      h("div.ctrow.head", {}, h("span", { text: "Tên" }), h("span", { text: "Hạ" }), h("span", { text: "Bại" }), h("span", { text: "Trợ" })),
      ...rows.filter((r) => r.f === f).map((r) => h(`div.ctrow${r.n === me ? ".mine" : ""}${r.left ? ".left" : ""}`, {},
        h("span", { text: `${r.n}${r.left ? " (rời)" : r.on === false ? " (vắng)" : ""}` }), h("span", { text: r.k }), h("span", { text: r.d }), h("span", { text: r.a }))));
    el.replaceChildren(h("div.ctbox", {}, h("h4", { text: title }), h("div.ctcols", {}, col("c"), col("t")), h("small.dim", { text: "Nhấn Tab hoặc chạm ra ngoài để đóng." })));
  }
  function showEnd(m) {
    toggleBoard(false);
    $("ctend")?.remove();
    const win = m.winner, me = m.me, R = me ? RESULT[me.result] : null;
    const title = win === "d" ? "HÒA" : `${FACTIONS[win].name.toUpperCase()} THẮNG`;
    const el = h(`div.f-${win}`, {},
      h("div.ctebox", {},
        h("div.ctepics", {}, win === "d" ? [emblemPic("c", 72), emblemPic("t", 72)] : emblemPic(win, 112)),
        h("h2", { text: title }),
        h("div.ctscore.big", {}, h("span.c", { text: fmt(m.c) }), h("i", { text: "–" }), h("span.t", { text: fmt(m.tk) })),
        h("div.ctmvp", {}, m.mvp.c ? h("span", { text: `★ Chính Phái: ${m.mvp.c}` }) : null, m.mvp.t ? h("span", { text: `★ Tà Phái: ${m.mvp.t}` }) : null),
        me ? h(`div.cteme.${R?.[1] ?? ""}`, {},
          h("b", { text: me.result === "x" ? "Đạo hữu đã rời trận" : `Đạo hữu: ${R[0]}${me.mvp ? " · MVP" : ""}` }),
          h("span", { text: `Hạ ${me.k} · Bại ${me.d} · Trợ ${me.a} · có mặt ${me.stayed}%` }),
          h("span.gold.ctgain", { text: me.points ? `+${fmt(me.points)} điểm ${POINTS}` : me.result === "x" ? "Không có thưởng" : `Không có thưởng (cần có mặt ${view?.rules?.minStay ?? 50}% trận)` })) : null,
        h("small.dim", { text: m.saved ? `Đưa về sau ${m.back} giây…` : "Không ghi được kết quả: ban quản trị sẽ kiểm tra." }),
        h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Xem bảng", onclick: () => ((board = m.board), toggleBoard(true), drawBoard(m.board, "Kết quả trận")) }),
          h("button.primary", { type: "button", text: "Đóng", onclick: () => el.remove() }))));
    el.id = "ctend";
    hud().append(el);
    setTimeout(() => el.remove(), (m.back + 2) * 1000);
  }
  function clear() {
    st = score = null;
    board = [];
    clearInterval(tickT);
    tickT = null;
    $("ctbar")?.remove();
    // back off the field: the result has been seen (it shows the whole AFTER seconds on the field)
    $("ctend")?.remove();
    toggleBoard(false);
  }
  addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !st || /input|textarea|select/i.test(document.activeElement?.tagName ?? "")) return;
    e.preventDefault();
    toggleBoard();
  });
  /** The server's word about the battle (on the field): its state, the score, the board, the end. */
  function onMsg(m) {
    switch (m.t) {
      case "ctstate":
        st = { ...m, skew: Date.now() - m.now };
        st.fightAt += st.skew;
        st.ends += st.skew;
        drawBar();
        clearInterval(tickT);
        tickT = setInterval(drawBar, 500);
        break;
      case "ctscore":
        score = m;
        if (st) st.phase = m.phase;
        drawBar();
        break;
      case "ctboard":
        board = m.rows;
        if (boardOpen) drawBoard();
        break;
      case "ctend":
        if (st) st.phase = "over";
        showEnd(m);
        break;
    }
  }
  /** A map was entered: off the battlefield, the bar goes. */
  function onMap(id) {
    if (id !== WAR_MAP) clear();
  }
  return { open: openPanel, onMsg, onMap };
}
