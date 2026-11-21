// Đạo Lữ in the browser (▦ Thêm → Đạo Lữ, and the 🌹 in a Đạo Hữu conversation): the roses, the affinity with each Đạo Hữu
// of the other gender, proposing with a ring, answering, the couple's card with their ring, divorcing. The browser only
// asks: the server (server/dao-lu.js) checks every rule, takes the stones and the roses. Every picture is pixelfx
// (src/fx/love: the rose, the three rings, moving), every name goes in with textContent.
import { createFrame, clearFrame, createFx } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";
import { realmName } from "/shared/balance.js";
import { NEED, buffText } from "/shared/dao-lu.js";
import { h } from "./tong-mon.js";
import { confirmBox } from "./gia-vien.js";

const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const $ = (id) => document.getElementById(id);
const dayText = (t) => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const daysSince = (t) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 864e5));
const wait = (s) => (s >= 3600 ? `${Math.ceil(s / 3600)} giờ` : `${Math.max(1, Math.ceil(s / 60))} phút`);

// ---------------------------------------------------------------- moving pictures: pixelfx drawn at the clock's time
// Every picture made here is redrawn ten times a second while it is on the page; when none is, the loop stops.
const live = new Set();
let ticking = false;
function tick() {
  for (const cv of live) (cv.isConnected ? cv.paint() : live.delete(cv));
  ticking = live.size > 0;
  if (ticking) setTimeout(() => requestAnimationFrame(tick), 100);
}
/** A pixelfx picture (id, its options) w × h pixels, shown at `css` px wide, moving. */
export function lovePic(id, opts, w, h0, css = w * 2, cls = "dlpic") {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h0;
  cv.className = cls;
  cv.style.width = `${css}px`;
  cv.style.height = `${(css * h0) / w}px`;
  const fr = createFrame(w, h0), img = new ImageData(w, h0), c2 = cv.getContext("2d");
  const [ox, oy] = effects[id]?.meta.origin ?? [w >> 1, h0 >> 1];
  cv.paint = () => {
    const mod = effects[id];
    if (!mod) return;
    clearFrame(fr);
    const fx = createFx(mod, { x: ox, y: oy, ...opts });
    fx.update((performance.now() / 1000) % (mod.meta.duration ?? 1));
    fx.draw(fr);
    new Uint32Array(img.data.buffer).set(fr.color);
    c2.putImageData(img, 0, 0);
  };
  cv.paint();
  live.add(cv);
  if (!ticking) (ticking = true), requestAnimationFrame(tick);
  return cv;
}
export const rosePic = (css = 32) => lovePic("love/rose", {}, 32, 32, css);
export const ringPic = (look, css = 64) => lovePic("love/ring", { ring: look }, 32, 32, css);
/** The rose as an image (for the bag): drawn once. */
let roseUrl = null;
export function roseIconUrl() {
  if (roseUrl) return roseUrl;
  const cv = lovePic("love/rose", {}, 32, 32);
  live.delete(cv);
  return (roseUrl = cv.toDataURL());
}

export function initDaoLu({ call, uuid, panel, flash, game }) {
  let view = null, tab = "home", busy = false;
  const open = () => !$("panel").hidden && document.querySelector("#panel .dlp");

  async function load() {
    view = await call("/daolu");
    return view;
  }
  async function post(path, body, msg, btn) {
    if (busy) return null;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const r = await call(`/daolu${path}`, { method: "POST", body });
      view = r.view ?? view;
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

  // ---- the little boxes over the panel
  function overBox(kids, onKey) {
    return new Promise((done) => {
      const host = $("panel")?.parentElement ?? document.body;
      const end = (v) => (removeEventListener("keydown", key, true), shade.remove(), done(v));
      const key = (e) => (e.key === "Escape" ? (e.stopPropagation(), end(null)) : onKey?.(e, end));
      const box = h("div.cbox.ccbox.dlbox", { role: "dialog", "aria-modal": "true" }, ...kids(end));
      const shade = h("div.cshade", { onclick: (e) => e.target === shade && end(null) }, box);
      addEventListener("keydown", key, true);
      host.append(shade);
    });
  }
  /** How many roses: 1..max with −/+ and quick picks; under it what it costs or what it does. Resolves the number or null. */
  function qtyBox({ title, max, verb, line }) {
    let n = 1;
    const input = h("input.ccqin", { type: "number", min: 1, max, value: 1, inputMode: "numeric" });
    const total = h("p.cctot"), ok = h("button.primary", { type: "button", text: verb });
    const set = (v) => {
      n = Math.max(1, Math.min(max, Math.floor(Number(v) || 1)));
      input.value = n;
      const [txt, bad] = line(n);
      total.replaceChildren(...txt);
      ok.disabled = !!bad;
    };
    return overBox((end) => {
      ok.onclick = () => end(n);
      input.addEventListener("input", () => set(input.value));
      const quick = [1, 5, 10, max].filter((v, i, a) => v <= max && v > 0 && a.indexOf(v) === i);
      set(1);
      return [h("h4", { text: title }),
        h("div.ccqrow", {}, rosePic(40), h("button.ghost.ccqb", { type: "button", text: "−", onclick: () => set(n - 1) }), input, h("button.ghost.ccqb", { type: "button", text: "+", onclick: () => set(n + 1) })),
        h("div.ccquick", {}, ...quick.map((v) => h("button.ghost", { type: "button", text: v === max && v > 10 ? `Tối đa ${v}` : String(v), onclick: () => set(v) }))),
        total,
        h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Huỷ", onclick: () => end(null) }), ok)];
    }, (e, end) => e.key === "Enter" && !ok.disabled && (e.stopPropagation(), end(n)));
  }

  // ---- buying and giving roses (also from a Đạo Hữu conversation)
  async function buyRoses() {
    const v = view ?? (await load()), R = v.rules;
    if (!(R.rosePrice > 0)) return flash(`${R.roseName} hiện không bán.`);
    const q = await qtyBox({
      title: `Mua ${R.roseName}`, max: R.roseBuyMax, verb: "Mua",
      line: (n) => [[`Mua ${n} × ${fmt(R.rosePrice)} = `, h("b", { text: `${fmt(n * R.rosePrice)} linh thạch` }), h("small", { text: ` (đang có ${fmt(v.me.stones)})` })], n * R.rosePrice > v.me.stones],
    });
    if (q) await post("/buy", { qty: q, requestId: uuid() }, `Đã mua ${q} ${R.roseName}.`);
  }
  /** Give roses to a friend (uid, name): how many, what it does to the affinity. */
  async function giftTo(uid, name) {
    let v;
    try {
      v = await load();
    } catch (e) {
      return flash(e.message);
    }
    const f = v.friends.find((x) => x.uid === uid), R = v.rules;
    if (!f) return flash(`${name} không phải Đạo Hữu của đạo hữu.`);
    if (!f.ok) return flash("Hoa Hồng chỉ tặng được cho Đạo Hữu khác giới.");
    const mine = v.spouse?.uid === uid;
    if (v.spouse && !mine) return flash("Đạo hữu đã có Đạo Lữ: chỉ tặng hoa cho Đạo Lữ của mình.");
    if (f.married && !mine) return flash(`${name} đã có Đạo Lữ.`);
    if (!mine && f.points >= NEED) return flash(`Hảo cảm với ${name} đã đủ ${NEED}: hãy cầu hôn ở bảng Đạo Lữ.`);
    const left = R.roseDaily - f.today;
    if (left <= 0) return flash(`Hôm nay đã tặng ${name} đủ ${R.roseDaily} bông.`);
    if (!v.roses) {
      if (await confirmBox({ title: "Chưa có Hoa Hồng", text: `Đạo hữu chưa có ${R.roseName} nào. Mua ngay (${fmt(R.rosePrice)} linh thạch một bông)?`, ok: "Mua hoa", pic: rosePic(48) })) await buyRoses();
      if (!view.roses) return;
    }
    const worth = mine ? 99 : Math.ceil((NEED - f.points) / R.rosePoints);
    const max = Math.max(1, Math.min(view.roses, left, worth, 99));
    const q = await qtyBox({
      title: `Tặng ${R.roseName} cho ${name}`, max, verb: "Tặng",
      line: (n) => mine ? [[`Tặng Đạo Lữ ${n} bông. Có ${view.roses} bông.`], false]
        : [[`Hảo cảm ${f.points} → `, h("b", { text: `${Math.min(NEED, f.points + n * R.rosePoints)}/${NEED}` }), h("small", { text: ` · có ${view.roses} bông · hôm nay còn tặng được ${left}` })], false],
    });
    if (q) return post("/gift", { uid, qty: q, requestId: uuid() }, (r) => r.repeat ? null : mine ? `Đã tặng Đạo Lữ ${r.used} bông Hoa Hồng.` : `Đã tặng ${name} ${r.used} bông. Hảo cảm ${r.points}/${NEED}${r.points >= NEED ? ": đủ để cầu hôn!" : "."}`);
  }

  // ---- proposing: pick a ring (moving pictures, price, buff), confirm
  async function proposeTo(f) {
    const v = view;
    const pick = await overBox((end) => [
      h("h4", { text: `Cầu hôn ${f.name}` }),
      h("p.dim", { text: `Chọn nhẫn cưới. Nếu ${f.name} đồng ý, đạo hữu trả giá nhẫn bằng linh thạch, hai người mỗi người đeo một chiếc và nhận buff chỉ số vĩnh viễn (khi còn là Đạo Lữ). Đang có ${fmt(v.me.stones)} linh thạch.` }),
      h("div.dlrings", {}, ...v.rings.map((r) => h("button.dlring", {
        type: "button", disabled: r.price > v.me.stones || !(r.price > 0), title: r.price > v.me.stones ? "Không đủ linh thạch" : "", onclick: () => end(r),
      }, ringPic(r.look, 64), h("b", { text: r.name }), h("small.gold", { text: r.price > 0 ? `${fmt(r.price)} linh thạch` : "không bán" }), h("small", { text: buffText(r.buff) })))),
      h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Huỷ", onclick: () => end(null) }))]);
    if (!pick) return;
    if (await confirmBox({ title: "Cầu hôn", text: `Cầu hôn ${f.name} với ${pick.name}? Khi ${f.name} đồng ý, đạo hữu trả ${fmt(pick.price)} linh thạch.`, ok: "💍 Cầu hôn", pic: ringPic(pick.look, 64) }))
      post("/propose", { uid: f.uid, ring: pick.key }, `Đã cầu hôn ${f.name}. Chờ trả lời...`);
  }

  // ---------------------------------------------------------------- the panel
  function homeTab(v) {
    const kids = [];
    if (v.spouse) {
      const s = v.spouse, r = s.ring;
      kids.push(h("div.dlcouple", {},
        h("div.dlnames", {}, h("b", { text: v.me.name }), h("span.dlheart", { text: "♥" }), h("b", { text: s.name })),
        h("div.dlringbig", {}, ringPic(r.look, 112)),
        h("b.dlrn", { text: r.name }),
        h("small", { text: `Kết Đạo Lữ ngày ${dayText(s.since)} · ${daysSince(s.since)} ngày bên nhau` }),
        h("small", { text: `${s.paidByMe ? "Đạo hữu" : s.name} đã mua nhẫn: ${fmt(s.price)} linh thạch · ${s.name}: ${realmName(s.level)}` }),
        h("div.dlbuff", {}, h("small", { text: "Buff vĩnh viễn của nhẫn (cả hai người, ngoài đấu trường):" }), h("b", { text: buffText(r.buff) })),
        h("div.cbtns", {},
          h("button.primary", { type: "button", text: "🌹 Tặng hoa", onclick: () => giftTo(s.uid, s.name) }),
          h("button.ghost.danger", { type: "button", text: "Ly hôn", onclick: async (e) => {
            const b = e.currentTarget;
            if (await confirmBox({ title: "Ly hôn", text: `Ly hôn với ${s.name}? Cả hai mất ${r.name} và buff của nhẫn, hảo cảm về 0, ${v.rules.remarryHours} giờ sau mới kết Đạo Lữ lại được. Không hoàn linh thạch.`, ok: "Ly hôn", pic: ringPic(r.look, 64) }))
              post("/divorce", {}, `Đã ly hôn với ${s.name}.`, b);
          } }))));
    } else {
      kids.push(h("div.dlintro", {}, rosePic(40),
        h("div", {}, h("b", { text: "Chưa có Đạo Lữ" }),
          h("small", { text: `Tặng ${v.rules.roseName} cho Đạo Hữu khác giới để tăng hảo cảm (${v.rules.rosePoints} điểm mỗi bông, tối đa ${v.rules.roseDaily} bông mỗi ngày cho một người). Đủ ${NEED}/${NEED} thì cầu hôn được.` }))));
      if (v.wait > 0) kids.push(h("p.cchint", { text: `Vừa ly hôn: còn ${wait(v.wait)} nữa mới kết Đạo Lữ được.` }));
    }
    for (const p of v.incoming)
      kids.push(h("div.dlprop", {}, ringPic(p.ring.look, 56),
        h("div.dlpmain", {}, h("b", { text: `💍 ${p.name} cầu hôn đạo hữu!` }),
          h("small", { text: `${realmName(p.level)} · nhẫn ${p.ring.name} (${p.name} trả ${fmt(p.ring.price)} linh thạch) · ${buffText(p.ring.buff)}` })),
        h("div.dlpbtn", {},
          h("button.ghost", { type: "button", text: "Từ chối", onclick: (e) => post("/answer", { uid: p.uid, accept: false, requestId: uuid() }, `Đã từ chối ${p.name}.`, e.currentTarget) }),
          h("button.primary", { type: "button", text: "Đồng ý", onclick: async (e) => {
            const b = e.currentTarget;
            if (await confirmBox({ title: "Nhận lời cầu hôn", text: `Kết Đạo Lữ với ${p.name}, đeo ${p.ring.name}?`, ok: "💍 Đồng ý", pic: ringPic(p.ring.look, 64) }))
              post("/answer", { uid: p.uid, accept: true, requestId: uuid() }, (r) => (r.repeat ? null : `Đã kết thành Đạo Lữ với ${p.name}!`), b);
          } }))));
    if (v.proposal)
      kids.push(h("div.dlprop.out", {}, ringPic(v.proposal.ring.look, 48),
        h("div.dlpmain", {}, h("b", { text: `Đang chờ ${v.proposal.name} trả lời` }),
          h("small", { text: `Nhẫn ${v.proposal.ring.name}: trả ${fmt(v.proposal.ring.price)} linh thạch khi được đồng ý · hết hạn sau ${v.rules.proposeHours} giờ` })),
        h("div.dlpbtn", {}, h("button.ghost", { type: "button", text: "Rút lại", onclick: (e) => post("/cancel", {}, "Đã rút lời cầu hôn.", e.currentTarget) }))));
    kids.push(h("div.dlroses", {}, rosePic(28), h("span", { text: `${v.rules.roseName}: có ` }), h("b", { text: fmt(v.roses) }),
      h("small", { text: ` · ${fmt(v.rules.rosePrice)} linh thạch/bông` }),
      h("button.primary", { type: "button", text: "Mua", disabled: !(v.rules.rosePrice > 0), onclick: () => buyRoses() })));
    return h("div.dlhome", {}, ...kids);
  }
  function friendsTab(v) {
    const list = v.friends.filter((f) => f.ok);
    if (!list.length)
      return h("p.dim", { text: v.friends.length ? "Chưa có Đạo Hữu khác giới. Kết giao ở bảng Đạo Hữu (🤝) trước." : "Chưa có Đạo Hữu nào. Kết giao ở bảng Đạo Hữu (🤝) trước." });
    return h("div.dllist", {}, h("small.dim", { text: `Đạo Hữu khác giới: ${list.length} · có ${fmt(v.roses)} bông ${v.rules.roseName}` }), ...list.map((f) => {
      const mine = v.spouse?.uid === f.uid, full = f.points >= NEED, taken = f.married && !mine;
      const can = !v.spouse && !taken && full && !v.wait && !v.proposal;
      const asked = v.proposal?.uid === f.uid, theyAsked = v.incoming.some((p) => p.uid === f.uid);
      return h(`div.dlrow${mine ? ".mine" : ""}`, {},
        h("div.dlrmain", {},
          h("div.dlrname", {}, h("b", { text: f.name }), mine ? h("span.chip.pink", { text: "Đạo Lữ" }) : taken ? h("span.chip", { text: "đã có Đạo Lữ" }) : null),
          h("small", { text: `${realmName(f.level)} · đã tặng ${fmt(f.roses)} bông · hôm nay ${f.today}/${v.rules.roseDaily}` }),
          h("div.dlbar", { title: `Hảo cảm ${f.points}/${NEED}` }, h("i", { style: `width:${Math.min(100, (f.points / NEED) * 100)}%` }), h("span", { text: `♥ ${f.points}/${NEED}` }))),
        h("div.dlrbtn", {},
          h("button.ghost", { type: "button", text: "🌹 Tặng", disabled: (taken || !!(v.spouse && !mine) || (!mine && full)), onclick: () => giftTo(f.uid, f.name) }),
          !mine ? h("button.primary", { type: "button", text: asked ? "Đã cầu hôn" : theyAsked ? "Trả lời" : "💍 Cầu hôn", disabled: asked || (!can && !theyAsked),
            title: !full ? `Cần ${NEED} hảo cảm` : v.spouse ? "Đã có Đạo Lữ" : taken ? "Người này đã có Đạo Lữ" : v.wait ? "Đang chờ sau ly hôn" : v.proposal ? "Đang chờ một lời cầu hôn khác" : "",
            onclick: () => (theyAsked ? ((tab = "home"), draw()) : proposeTo(f)) }) : null));
    }));
  }
  function ringsTab(v) {
    return h("div.dlrings.show", {}, ...v.rings.map((r) => h("div.dlring", {}, ringPic(r.look, 80), h("b", { text: r.name }),
      h("small.gold", { text: r.price > 0 ? `${fmt(r.price)} linh thạch (một đôi)` : "không bán" }), h("small", { text: buffText(r.buff) }), h("small.dim", { text: r.desc }))),
      h("p.dim.full", { text: "Người cầu hôn trả giá nhẫn khi được đồng ý. Buff nhẫn có hiệu lực vĩnh viễn với cả hai khi còn là Đạo Lữ (ngoài đấu trường). Ly hôn thì mất nhẫn và mất buff." }));
  }
  function draw(first = false) {
    const v = view;
    const tabs = [["home", v.incoming.length ? `Đạo Lữ (${v.incoming.length})` : "Đạo Lữ"], ["friends", "Hảo cảm"], ["rings", "Nhẫn cưới"]];
    const wrap = h("div.dlp", {},
      h("div.ctabs.stabs", {}, ...tabs.map(([k, l]) => h("button", { type: "button", text: l, className: tab === k ? "on" : "", onclick: () => ((tab = k), draw()) }))),
      { home: homeTab, friends: friendsTab, rings: ringsTab }[tab](v));
    if (first || !open()) panel("Đạo Lữ", wrap);
    else $("panelBody").replaceChildren(wrap);
  }
  async function openPanel(t = null) {
    try {
      await load();
    } catch (e) {
      return flash(e.message);
    }
    if (t) tab = t;
    else if (view.incoming.length) tab = "home";
    draw(true);
  }
  /** The server says something changed (a rose, a proposal, a wedding, a divorce): a note, and the panel again. */
  async function onMsg(m) {
    if (m.note) flash(m.note);
    if (open()) {
      try {
        await load();
        draw();
      } catch {}
    }
  }
  return { open: openPanel, onMsg, giftTo };
}
