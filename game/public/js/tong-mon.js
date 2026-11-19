// Tông Môn (🏯, T): the sect panel. Everything here only asks; the server (server/tong-mon.js) decides and answers with
// the whole view again, which is drawn from scratch. The buttons shown follow the rank (shared/tong-mon.js), but a button
// that shouldn't be there would just get a refusal. Every name and line of text from players goes in with textContent.
import { SECT, realmName, ITEMS } from "/shared/balance.js";
import { RANKS, LEADER, VICE, ELDER, OUTER, CAN, over, grantable, JOIN_MODES, EMBLEMS, emblemUrl, LOG_TEXT, sectBonus, memberCap } from "/shared/tong-mon.js";

/** A small element builder: h("div.card", { title }, child, "text", ...). Strings become text nodes, never markup. */
function h(tag, props = {}, ...kids) {
  const [name, ...cls] = tag.split(".");
  const el = document.createElement(name || "div");
  if (cls.length) el.className = cls.join(" ");
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (k === "className") v && el.classList.add(...String(v).split(" ").filter(Boolean));
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  return el;
}
const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const ago = (t) => {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  return s < 60 ? "vừa xong" : s < 3600 ? `${Math.floor(s / 60)} phút trước` : s < 86400 ? `${Math.floor(s / 3600)} giờ trước` : `${Math.floor(s / 86400)} ngày trước`;
};
const dur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút` : s >= 60 ? `${Math.floor(s / 60)} phút` : `${s} giây`);
const emblem = (i, cls = "emb") => h(`img.${cls}`, { src: emblemUrl(i), alt: "" });
/** A button that asks once more on itself before it does something that can't be undone. */
function sure(label, again, fn, cls = "") {
  const b = h(`button.${cls || "ghost"}`, { type: "button", text: label });
  let armed = 0;
  b.addEventListener("click", () => {
    if (!armed) {
      b.classList.add("sure");
      b.textContent = again;
      armed = setTimeout(() => ((armed = 0), b.classList.remove("sure"), (b.textContent = label)), 3000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    fn(b);
  });
  return b;
}

export function initSect({ call, uuid, panel, flash, game, itemIcon }) {
  let view = null, tab = "members", listTab = "find", search = "", page = 0, chat = [], busy = false;
  const isOpen = () => !document.getElementById("panel").hidden && document.querySelector(".sectp");

  /** Ask the server; on success draw what it sent back, on refusal show why. */
  async function act(path, body, okMsg, btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const out = await call(`/sect${path}`, { method: "POST", body });
      if (out.view) view = out.view;
      if (okMsg) flash(typeof okMsg === "function" ? okMsg(out) : okMsg);
      if (out.inventory) game()?.setInventory(out.inventory);
      draw();
      return out;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
    } finally {
      busy = false;
    }
  }

  async function open(startTab) {
    if (startTab) tab = startTab;
    try {
      view = await call("/sect");
    } catch (e) {
      return flash(e.message);
    }
    draw(true);
  }
  let again = 0;
  /** The sect changed (a ping from the world): an open panel reads it again, a moment later, once. */
  function onSect() {
    if (!isOpen()) return;
    clearTimeout(again);
    again = setTimeout(async () => {
      if (!isOpen() || busy) return;
      try {
        view = await call("/sect");
        draw();
      } catch {}
    }, 350);
  }
  function onChat(m) {
    chat.push({ n: m.n, m: m.m, at: Date.now() });
    if (chat.length > 60) chat.shift();
    const box = document.querySelector(".sectp .chatlog");
    if (box) (box.append(chatLine(chat.at(-1))), (box.scrollTop = box.scrollHeight));
  }
  const chatLine = (l) => h("div.cl", {}, h("b", { text: `${l.n}: ` }), l.m);

  function draw(first = false) {
    const wrap = view?.sect ? inSect() : outside();
    const title = view?.sect ? `Tông Môn · ${view.sect.name}` : "Tông Môn";
    if (first || !isOpen()) return panel(title, wrap);
    document.getElementById("panelTitle").textContent = title;
    document.getElementById("panelBody").replaceChildren(wrap);
  }

  // ---------------------------------------------------------------- not in a sect: find one, or found one
  function outside() {
    const wrap = h("div.sectp.out");
    if (view.wait > 0) wrap.append(h("p.notice.warn", { text: `Đạo hữu vừa rời tông môn: còn ${dur(view.wait)} nữa mới gia nhập hoặc khai lập được.` }));
    if (view.applications?.length)
      wrap.append(h("section.myapps", {}, h("h4", { text: "Đơn đang chờ duyệt" }), ...view.applications.map((a) =>
        h("div.approw", {}, emblem(a.emblem), h("b", { text: a.name }), h("small", { text: ago(a.at) }), h("button.ghost", { type: "button", text: "Rút đơn", onclick: (e) => act("/cancel", { id: a.id }, "Đã rút đơn.", e.target) })),
      )));
    const tabs = h("div.ctabs.stabs", {}, ...[["find", "Tìm tông môn"], ["create", "Khai lập"]].map(([k, l]) =>
      h("button", { type: "button", text: l, className: listTab === k ? "on" : "", onclick: () => ((listTab = k), draw()) })));
    wrap.append(tabs, listTab === "find" ? finder() : founder());
    return wrap;
  }

  function finder() {
    const box = h("div.finder");
    const input = h("input.search", { type: "search", placeholder: "Tên tông môn...", maxLength: 16, value: search, autocomplete: "off" });
    const list = h("div.slist", {}, h("p.dim", { text: "Đang tìm..." }));
    const load = async () => {
      try {
        const r = await call(`/sects?q=${encodeURIComponent(search)}&page=${page}`);
        const mine = new Set((view.applications ?? []).map((a) => a.id));
        list.replaceChildren(...(r.sects.length ? r.sects.map((s) => sectCard(s, mine.has(s.id))) : [h("p.dim", { text: search ? "Không có tông môn nào tên như vậy." : "Chưa có tông môn nào. Hãy là người khai lập đầu tiên!" })]));
        if (page > 0 || r.more)
          list.append(h("div.pager", {},
            h("button.ghost", { type: "button", text: "‹ Trước", disabled: page === 0, onclick: () => ((page = Math.max(0, page - 1)), load()) }),
            h("span", { text: `Trang ${page + 1}` }),
            h("button.ghost", { type: "button", text: "Sau ›", disabled: !r.more, onclick: () => ((page += 1), load()) })));
      } catch (e) {
        list.replaceChildren(h("p.err", { text: e.message }));
      }
    };
    let t = 0;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => ((search = input.value.trim()), (page = 0), load()), 350);
    });
    box.append(input, list);
    load();
    return box;
  }

  function sectCard(s, applied) {
    const lv = game()?.me()?.lv ?? 1;
    const full = s.members >= s.cap, low = lv < s.minLevel;
    let btn;
    if (s.joinMode === "closed") btn = h("button.ghost", { type: "button", text: "Đóng cửa", disabled: true });
    else if (applied) btn = h("button.ghost", { type: "button", text: "Đã gửi đơn", disabled: true });
    else
      btn = h("button.primary", {
        type: "button", text: s.joinMode === "open" ? "Gia nhập" : "Gửi đơn", disabled: full || low || view.wait > 0,
        title: full ? "Đã đủ người" : low ? `Cần cấp ${s.minLevel}` : "",
        onclick: (e) => (s.joinMode === "open" ? act("/join", { id: s.id }, `Đã gia nhập ${s.name}!`, e.target) : applyAsk(s, e.target)),
      });
    return h("div.scard", {},
      emblem(s.emblem, "emb big"),
      h("div.sinfo", {},
        h("div.sname", {}, h("b", { text: s.name }), h("span.lvl", { text: `Cấp ${s.level}` })),
        h("small", { text: `Tông Chủ ${s.leader || "?"} · ${s.members}/${s.cap} người · ${JOIN_MODES[s.joinMode]}${s.minLevel > 1 ? ` · từ ${realmName(s.minLevel)}` : ""}` }),
        s.notice ? h("p.snote", { text: s.notice }) : null),
      btn);
  }

  function applyAsk(s, btn) {
    const msg = h("input", { maxLength: 80, placeholder: "Lời nhắn cho tông môn (không bắt buộc)", autocomplete: "off" });
    const box = h("div.askbox", {}, h("p", {}, "Gửi đơn xin vào ", h("b", { text: s.name }), "?"), msg,
      h("div.row", {},
        h("button.ghost", { type: "button", text: "Thôi", onclick: () => box.remove() }),
        h("button.primary", { type: "button", text: "Gửi đơn", onclick: (e) => act("/join", { id: s.id, message: msg.value }, `Đã gửi đơn vào ${s.name}.`, e.target) })));
    btn.closest(".scard").after(box);
    msg.focus();
  }

  function founder() {
    const lv = game()?.me()?.lv ?? 1, stones = game()?.me()?.stones ?? 0;
    let pick = 0;
    const name = h("input", { maxLength: 16, placeholder: "Tên tông môn (2-16 ký tự)", autocomplete: "off" });
    const grid = h("div.embgrid", {}, ...EMBLEMS.map((_, i) => h("button", { type: "button", className: i === pick ? "on" : "", title: `Huy hiệu ${i + 1}`, onclick: (e) => {
      pick = i;
      for (const b of grid.children) b.classList.toggle("on", b === e.currentTarget);
    } }, emblem(i))));
    const okLv = lv >= SECT.createLevel, okSt = stones >= SECT.createCost;
    return h("div.founder", {},
      h("p.dim", { text: "Tự mình khai tông lập phái, làm Tông Chủ, chiêu mộ đệ tử, cùng nhau quyên góp, mở Bảo Khố và Hộ Sơn Đại Trận." }),
      h("ul.reqs", {},
        h("li", { className: okLv ? "ok" : "no", text: `Đạt ${realmName(SECT.createLevel)} (cấp ${SECT.createLevel})` }),
        h("li", { className: okSt ? "ok" : "no", text: `${fmt(SECT.createCost)} linh thạch (đang có ${fmt(stones)})` })),
      h("label", { text: "Tên tông môn" }), name,
      h("label", { text: "Huy hiệu" }), grid,
      h("button.primary.big", { type: "button", text: `Khai lập (${fmt(SECT.createCost)} linh thạch)`, disabled: !okLv || view.wait > 0,
        onclick: (e) => act("/create", { name: name.value, emblem: pick }, (o) => "Khai lập tông môn thành công!", e.target).then((o) => o && (tab = "members")) }));
  }

  // ---------------------------------------------------------------- in a sect
  function inSect() {
    const { sect: s, me } = view;
    const wrap = h("div.sectp.in");
    // left: the sect and me
    const pct = s.nextExp ? Math.min(100, ((s.exp - s.levelExp) / Math.max(1, s.nextExp - s.levelExp)) * 100) : 100;
    const left = h("div.sleft", {},
      h("div.shead", {}, emblem(s.emblem, "emb huge"), h("div", {},
        h("h4", { text: s.name }),
        h("div.chips", {}, h("span.lvl", { text: `Cấp ${s.level}` }), h("span.chip", { text: `${s.members}/${s.cap} người` }), h("span.chip", { text: JOIN_MODES[s.joinMode] })))),
      h("div.xp", { title: s.nextExp ? `${fmt(s.exp)} / ${fmt(s.nextExp)}` : "Cấp cao nhất" }, h("i", {}, h("u", { style: `width:${pct}%` })),
        h("small", { text: s.nextExp ? `Kinh nghiệm ${fmt(s.exp)} / ${fmt(s.nextExp)}` : `Kinh nghiệm ${fmt(s.exp)} · cấp cao nhất` })),
      h("div.stiles", {},
        tile("item_spirit_stone", "Ngân khố", fmt(s.treasury)),
        tile("status_golden_shield", "Phúc lợi", `+${sectBonus(s.level, SECT)}%`, "Sinh lực, công, thủ ngoài thế giới"),
        tile("status_burn", "Đại trận", s.arrayLeft > 0 ? dur(s.arrayLeft) : "Chưa mở", `Hộ Sơn Đại Trận: +${SECT.arrayAtk}% công`)),
      s.notice ? h("p.snote.board", { text: s.notice }) : h("p.snote.board.dim", { text: "Tông môn chưa có thông báo." }),
      h("div.mecard", {},
        h("div.merow", {}, h("span.rank", { className: `rank r${me.rank}`, text: RANKS[me.rank].name }), h("b", { text: `${fmt(me.contrib)} cống hiến` }), h("small", { text: `tổng ${fmt(me.contribTotal)}` })),
        h("div.merow", {},
          h("button.primary", { type: "button", text: me.checked ? "Đã điểm danh" : `Điểm danh (+${SECT.checkinContrib})`, disabled: me.checked, onclick: (e) => act("/checkin", {}, (o) => `Điểm danh: +${o.contrib} cống hiến${o.levelUp ? `. Tông môn lên cấp ${o.levelUp}!` : ""}`, e.target) }),
          donateBox())));
    // right: tabs
    const officer = CAN.review(me.rank), manage = CAN.settings(me.rank) || CAN.transfer(me.rank);
    const tabs = [["members", "Thành viên"], ...(officer ? [["apps", `Đơn${view.applications.length ? ` (${view.applications.length})` : ""}`]] : []), ["shop", "Bảo Khố"], ["chat", "Đàm Đạo"], ["log", "Nhật Ký"], ["manage", manage ? "Quản Lý" : "Rời tông"]];
    if (!tabs.some(([k]) => k === tab)) tab = "members";
    const body = { members, apps, shop, chat: chatTab, log: logTab, manage: manageTab }[tab]();
    const right = h("div.sright", {},
      h("div.ctabs.stabs", {}, ...tabs.map(([k, l]) => h("button", { type: "button", text: l, className: tab === k ? "on" : "", onclick: () => ((tab = k), draw()) }))),
      h("div.sbody", {}, body));
    wrap.append(left, right);
    return wrap;
  }
  const tile = (ic, l, v, title) => h("div.tile", { title: title ?? `${l}: ${v}` }, h("img", { src: `/xianxia/ui/ui_xianxia_${ic}.png`, alt: "" }), h("span", { text: l }), h("b", { text: v }));

  function donateBox() {
    const left = Math.max(0, SECT.donateDaily - view.me.donated);
    const amt = h("input.amt", { type: "number", min: SECT.donateMin, max: left, step: 10, value: Math.min(left, 100) || "", inputMode: "numeric", "aria-label": "Số linh thạch quyên góp" });
    return h("div.donate", { title: `Hôm nay còn quyên được ${fmt(left)}` }, amt,
      h("button.ghost", { type: "button", text: "Quyên góp", disabled: left < SECT.donateMin, onclick: (e) => {
        const n = Math.floor(Number(amt.value));
        act("/donate", { amount: n, requestId: uuid() }, (o) => (o.repeat ? "Đã ghi nhận rồi." : `Quyên ${fmt(n)} linh thạch: +${fmt(o.contrib)} cống hiến${o.levelUp ? `. Tông môn lên cấp ${o.levelUp}!` : ""}`), e.target);
      } }));
  }

  function members() {
    const { me, members: list } = view;
    const myRank = me.rank;
    return h("div.mlist", {}, ...list.map((m) => {
      const row = h("div.mrow", { className: m.uid === me.uid ? "mine" : "" },
        h("span.dot", { className: m.online ? "on" : "", title: m.online ? "Đang trực tuyến" : "Ngoại tuyến" }),
        h("div.mname", {}, h("b", { text: m.name }), h("small", { text: `${realmName(m.level)} · ${fmt(m.contribTotal)} cống hiến` })),
        h("span.rank", { className: `rank r${m.rank}`, text: RANKS[m.rank].name }));
      if (m.uid !== me.uid && over(myRank, m.rank) && (CAN.promote(myRank) || CAN.kick(myRank))) {
        const acts = h("div.macts");
        if (CAN.promote(myRank)) {
          const sel = h("select", { "aria-label": `Chức của ${m.name}` }, ...grantable(myRank).map((r) => h("option", { value: r, text: RANKS[r].name, selected: r === m.rank })));
          sel.addEventListener("change", () => act("/rank", { uid: m.uid, rank: Number(sel.value) }, `Đã phong ${m.name} làm ${RANKS[sel.value].name}.`, sel));
          acts.append(sel);
        }
        if (CAN.kick(myRank)) acts.append(sure("Trục xuất", "Chắc chưa?", (b) => act("/kick", { uid: m.uid }, `Đã trục xuất ${m.name}.`, b), "ghost danger"));
        row.append(acts);
      }
      return row;
    }));
  }

  function apps() {
    if (!view.applications.length) return h("p.dim", { text: "Không có đơn nào đang chờ." });
    const full = view.sect.members >= view.sect.cap;
    return h("div.mlist", {}, full ? h("p.notice.warn", { text: "Tông môn đã đủ người: nâng cấp tông môn để nhận thêm đệ tử." }) : null,
      ...view.applications.map((a) => h("div.mrow", {},
        h("div.mname", {}, h("b", { text: a.name }), h("small", { text: `${realmName(a.level)} · ${ago(a.at)}` }), a.message ? h("q", { text: a.message }) : null),
        h("div.macts", {},
          h("button.ghost", { type: "button", text: "Từ chối", onclick: (e) => act("/review", { uid: a.uid, accept: false }, `Đã từ chối ${a.name}.`, e.target) }),
          h("button.primary", { type: "button", text: "Thu nhận", disabled: full, onclick: (e) => act("/review", { uid: a.uid, accept: true }, `Đã thu nhận ${a.name}.`, e.target) })))));
  }

  function shop() {
    const { sect: s, me } = view;
    if (!view.shop.length) return h("p.dim", { text: "Bảo Khố chưa có món nào." });
    return h("div.shopgrid", {}, h("p.dim.full", { text: `Đổi điểm cống hiến lấy vật phẩm. Đang có ${fmt(me.contrib)} cống hiến. Mỗi món giới hạn số lần đổi mỗi ngày.` }),
      ...view.shop.map((it) => {
        const locked = s.level < it.minLevel, out = it.bought >= it.limit, poor = me.contrib < it.cost;
        return h("div.sitem", { className: locked ? "locked" : "" },
          h("img.ic", { src: itemIcon(it.item), alt: "" }),
          h("div.mname", {}, h("b", { text: it.name }), h("small", { text: locked ? `Mở ở tông môn cấp ${it.minLevel}` : `${fmt(it.cost)} cống hiến · hôm nay ${it.bought}/${it.limit}` })),
          h("button.primary", { type: "button", text: locked ? "🔒" : out ? "Hết lượt" : "Đổi", disabled: locked || out || poor, title: it.desc,
            onclick: (e) => act("/shop", { item: it.item, requestId: uuid() }, `Đã đổi ${it.name}.`, e.target) }));
      }));
  }

  function chatTab() {
    const log = h("div.chatlog", {}, ...(chat.length ? chat.map(chatLine) : [h("p.dim", { text: "Kênh riêng của tông môn. Trên máy tính, gõ /t <lời> ở ô trò chuyện cũng được." })]));
    const input = h("input", { maxLength: 120, placeholder: "Nói với đồng môn...", autocomplete: "off" });
    const sendIt = () => {
      const v = input.value.trim();
      if (!v) return;
      game()?.sectSay(v);
      input.value = "";
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") sendIt();
    });
    setTimeout(() => (log.scrollTop = log.scrollHeight));
    return h("div.chatbox", {}, log, h("div.row", {}, input, h("button.primary", { type: "button", text: "Gửi", onclick: sendIt })));
  }

  function logTab() {
    if (!view.log.length) return h("p.dim", { text: "Chưa có gì." });
    return h("div.loglist", {}, ...view.log.map((l) => h("div.lrow", {}, h("small", { text: ago(l.at) }), h("span", { text: (LOG_TEXT[l.kind] ?? (() => l.kind))(l) }))));
  }

  function manageTab() {
    const { sect: s, me } = view;
    const box = h("div.manage");
    if (CAN.settings(me.rank)) {
      const notice = h("textarea", { maxLength: 200, rows: 3, placeholder: "Thông báo cho đồng môn và người muốn gia nhập", value: s.notice });
      const mode = h("select", {}, ...Object.entries(JOIN_MODES).map(([k, l]) => h("option", { value: k, text: l, selected: k === s.joinMode })));
      const minL = h("input", { type: "number", min: 1, max: 1000, value: s.minLevel, inputMode: "numeric" });
      let pick = s.emblem;
      const grid = h("div.embgrid.small", {}, ...EMBLEMS.map((_, i) => h("button", { type: "button", className: i === pick ? "on" : "", onclick: (e) => {
        pick = i;
        for (const b of grid.children) b.classList.toggle("on", b === e.currentTarget);
      } }, emblem(i))));
      notice.addEventListener("keydown", (e) => e.stopPropagation());
      box.append(h("section", {}, h("h4", { text: "Quy định tông môn" }),
        h("label", { text: "Thông báo" }), notice,
        h("div.two", {}, h("div", {}, h("label", { text: "Cách gia nhập" }), mode), h("div", {}, h("label", { text: "Cấp tối thiểu" }), minL)),
        h("label", { text: "Huy hiệu" }), grid,
        h("button.primary", { type: "button", text: "Lưu quy định", onclick: (e) => act("/settings", { notice: notice.value, joinMode: mode.value, minLevel: Number(minL.value), emblem: pick }, "Đã lưu quy định.", e.target) })));
    }
    if (CAN.array(me.rank)) {
      const can = s.level >= SECT.arrayLevel, up = s.arrayLeft > 0;
      box.append(h("section", {}, h("h4", { text: "Hộ Sơn Đại Trận" }),
        h("p.dim", { text: `Dùng ${fmt(SECT.arrayCost)} linh thạch ngân khố: mọi đồng môn +${SECT.arrayAtk}% công trong ${SECT.arrayMinutes} phút (ngoài thế giới). Mở từ tông môn cấp ${SECT.arrayLevel}.` }),
        sure(up ? `Đang vận hành (${dur(s.arrayLeft)})` : "Khai mở đại trận", "Bấm lần nữa để khai mở", (b) => act("/array", {}, "Hộ Sơn Đại Trận đã khai mở!", b), "primary")));
      const b = box.lastChild.lastChild;
      b.disabled = !can || up || s.treasury < SECT.arrayCost;
    }
    if (CAN.transfer(me.rank)) {
      const others = view.members.filter((m) => m.uid !== me.uid);
      const who = h("select", {}, h("option", { value: "", text: "Chọn đồng môn..." }), ...others.map((m) => h("option", { value: m.uid, text: `${m.name} (${RANKS[m.rank].name})` })));
      const conf = h("input", { placeholder: "Gõ lại đạo hiệu người đó để xác nhận", autocomplete: "off" });
      const dis = h("input", { placeholder: `Gõ "${s.name}" để xác nhận`, autocomplete: "off" });
      for (const i of [conf, dis]) i.addEventListener("keydown", (e) => e.stopPropagation());
      box.append(h("section.danger", {}, h("h4", { text: "Truyền chức Tông Chủ" }),
        h("p.dim", { text: "Người được chọn thành Tông Chủ, đạo hữu nhận chức cũ của họ." }), who, conf,
        h("button.ghost", { type: "button", text: "Truyền chức", onclick: (e) => act("/transfer", { uid: Number(who.value), confirm: conf.value }, "Đã truyền chức Tông Chủ.", e.target) })),
      h("section.danger", {}, h("h4", { text: "Giải tán tông môn" }),
        h("p.dim", { text: "Mọi thành viên rời tông, ngân khố mất hết. Không thể hoàn tác." }), dis,
        h("button.ghost.danger", { type: "button", text: "Giải tán", onclick: (e) => act("/disband", { confirm: dis.value }, "Tông môn đã giải tán.", e.target) })));
    } else {
      box.append(h("section", {}, h("h4", { text: "Rời tông môn" }),
        h("p.dim", { text: `Rời đi thì ${SECT.rejoinHours} giờ sau mới gia nhập tông môn khác được. Cống hiến chưa dùng sẽ mất.` }),
        sure("Rời tông môn", "Bấm lần nữa để rời", (b) => act("/leave", {}, "Đã rời tông môn.", b), "ghost danger")));
    }
    return box;
  }

  return { open, onSect, onChat };
}
