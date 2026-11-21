// Đàm Đạo (💬) and Đạo Hữu (🤝, H): the chat channels in a panel (phones have no chat box), and friends with their
// private messages, Truyền Âm. The browser only asks: the server (server/dao-huu.js, the world's chat) decides who may
// talk to whom, cleans every line and keeps the history. Every name and line goes in with textContent.
import { realmName } from "/shared/balance.js";
import { h, sure } from "./tong-mon.js";

const CH = { w: "Thế Giới", k: "Khu Vực", s: "Tông Môn" };
const two = (n) => String(n).padStart(2, "0");
const hm = (t) => {
  const d = new Date(t);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};
const dayOf = (t) => {
  const d = new Date(t), now = new Date(), y = new Date(now - 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return same(d, now) ? "Hôm nay" : same(d, y) ? "Hôm qua" : `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const ago = (t) => {
  if (!t) return "";
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  return s < 60 ? "vừa xong" : s < 3600 ? `${Math.floor(s / 60)} phút` : s < 86400 ? `${Math.floor(s / 3600)} giờ` : `${Math.floor(s / 86400)} ngày`;
};
/** The real screen (a phone held upright turns the game on its side): low ones get the compact layout. */
function screenFit() {
  const rot = document.body.classList.contains("rotated");
  const H = rot ? innerWidth : innerHeight, W = rot ? innerHeight : innerWidth;
  const short = H < 521 && W > 560;
  return { H, W, short, narrow: W < 700 };
}

export function initSocial({ call, panel, flash, game, openSect, giftRose, myGender }) {
  // ---- what the panels show, kept between openings
  const lines = { w: [], k: [], s: [] }, asked = new Set();
  let chatTab = "w", view = null, ftab = "friends", openUid = null, convo = null, unread = 0, pending = 0;
  const panelOpen = (cls) => !document.getElementById("panel").hidden && document.querySelector(`#panel .${cls}`);

  // ---------------------------------------------------------------- the badge on 🤝: unread Truyền Âm + requests to me
  function badge() {
    const b = document.querySelector("#friendBtn .badge");
    const n = unread + pending;
    b.hidden = !n;
    b.textContent = n > 99 ? "99+" : String(n);
    document.getElementById("friendBtn").classList.toggle("has", n > 0);
  }

  // ---------------------------------------------------------------- Đàm Đạo: the three channels
  function onChat(m) {
    const list = lines[m.ch ?? "w"];
    if (!list) return;
    list.push(m);
    if (list.length > 120) list.shift();
    const box = panelOpen("chatp")?.querySelector(`.clog[data-ch="${m.ch ?? "w"}"]`);
    if (box) {
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.querySelector(".empty")?.remove();
      box.append(chatRow(m));
      if (stick) box.scrollTop = box.scrollHeight;
    }
  }
  function onHist(m) {
    const list = lines[m.ch];
    if (!list) return;
    // the server's last lines, then whatever arrived since that it didn't have
    const seen = new Set(m.list.map((x) => `${x.at}|${x.n}|${x.m}`));
    lines[m.ch] = [...m.list, ...list.filter((x) => !seen.has(`${x.at}|${x.n}|${x.m}`))].slice(-120);
    if (panelOpen("chatp") && chatTab === m.ch) drawChat();
  }
  const myName = () => game()?.myName?.() ?? "";
  function chatRow(m) {
    const mine = m.n === myName();
    const who = h("button.who", { type: "button", text: m.n, title: mine ? "" : "Truyền Âm, kết giao, chặn", onclick: (e) => !mine && nameMenu(m.n, e.currentTarget) });
    return h("div.cline", { className: mine ? "mine" : "" },
      h("small.t", { text: hm(m.at ?? Date.now()) }), who, m.lv ? h("small.lv", { text: realmName(m.lv) }) : null, h("span.txt", { text: m.m }));
  }
  /** What can be done with someone named in the chat: Truyền Âm (a friend), ask to be friends, block. */
  function nameMenu(name, anchor) {
    document.querySelector(".namemenu")?.remove();
    const friend = view?.friends.find((f) => f.name === name);
    const menu = h("div.namemenu", { role: "menu" },
      h("b", { text: name }),
      friend ? h("button", { type: "button", text: "✉ Truyền Âm", onclick: () => (menu.remove(), openFriends(friend.uid)) })
        : h("button", { type: "button", text: "🤝 Kết Đạo Hữu", onclick: () => (menu.remove(), act("/request", { name }, (o) => (o.friends ? `Đã kết làm Đạo Hữu với ${o.name}.` : `Đã gửi lời mời cho ${o.name}.`))) }),
      sure("⛔ Chặn", "Chặn thật?", () => (menu.remove(), act("/block", { name }, (o) => `Đã chặn ${o.name}.`)), "ghost"),
      h("button.ghost", { type: "button", text: "Đóng", onclick: () => menu.remove() }));
    // a small sheet over the chat, the same place on any screen (turned or not)
    (anchor.closest(".chatp") ?? document.getElementById("panelBody")).append(menu);
  }

  function openChat(ch) {
    if (ch) chatTab = ch;
    // views refreshed in the background so names show whether they are friends
    if (!view) call("/friends").then((v) => (view = v)).catch(() => {});
    drawChat(true);
  }
  function drawChat(first = false) {
    const g = game();
    if (!asked.has(chatTab)) asked.add(chatTab), g?.hist(chatTab);
    const wrap = h("div.chatp");
    const fit = screenFit();
    wrap.classList.toggle("short", fit.short);
    if (fit.short) wrap.style.setProperty("--avail", `${Math.max(220, fit.H - 82)}px`);
    const tabs = h("div.ctabs.stabs", {}, ...[...Object.entries(CH), ["pm", "Truyền Âm"]].map(([k, l]) =>
      h("button", { type: "button", text: l, className: `${chatTab === k ? "on" : ""} ch-${k}`, onclick: () => (k === "pm" ? openFriends() : ((chatTab = k), drawChat())) })));
    const list = lines[chatTab];
    const log = h("div.clog", { "data-ch": chatTab }, ...(list.length ? list.map(chatRow) : [h("p.dim.empty", { text: chatTab === "s" && !g?.me()?.sect ? "Đạo hữu chưa ở tông môn nào." : "Chưa có ai nói gì." })]));
    const note = { w: "Mọi người trên mọi bản đồ đều thấy. Mỗi lần nói cách nhau vài giây.", k: `Chỉ người đang ở ${g?.mapName?.() || "bản đồ này"} thấy.`, s: "Chỉ đồng môn thấy, ở bất kỳ đâu." }[chatTab];
    const input = h("input", { maxLength: 120, placeholder: `Nói ở kênh ${CH[chatTab]}...`, autocomplete: "off", enterKeyHint: "send" });
    const sendIt = () => {
      const v = input.value.trim();
      if (!v) return;
      g?.say(chatTab, v);
      input.value = "";
      input.focus();
    };
    input.addEventListener("keydown", (e) => (e.stopPropagation(), e.key === "Enter" && sendIt()));
    wrap.append(...[tabs, h("p.dim.cnote", { text: note }), log,
      h("div.crow", {}, input, h("button.primary", { type: "button", text: "Gửi", onclick: sendIt })),
      chatTab === "s" && !g?.me()?.sect ? h("button.ghost.full", { type: "button", text: "Tìm tông môn", onclick: () => openSect?.() }) : null].filter(Boolean));
    if (first || !panelOpen("chatp")) panel("Đàm Đạo", wrap);
    else document.getElementById("panelBody").replaceChildren(wrap);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- Đạo Hữu: friends, requests, finding, blocked
  async function act(path, body, okMsg, btn) {
    if (btn) btn.disabled = true;
    try {
      const out = await call(`/friends${path}`, { method: "POST", body });
      if (out.view) setView(out.view);
      if (okMsg) flash(typeof okMsg === "function" ? okMsg(out) : okMsg);
      if (panelOpen("friendp")) drawFriends();
      return out;
    } catch (e) {
      flash(e.message);
      if (btn) btn.disabled = false;
    }
  }
  function setView(v) {
    view = v;
    pending = v.incoming.length;
    unread = v.friends.reduce((a, f) => a + f.unread, 0);
    badge();
  }
  async function openFriends(uid) {
    try {
      setView(await call("/friends"));
    } catch (e) {
      return flash(e.message);
    }
    if (uid) (openUid = uid), (ftab = "friends"), await loadConvo(uid);
    drawFriends(true);
  }
  let again = 0;
  function onFriends() {
    clearTimeout(again);
    again = setTimeout(async () => {
      try {
        setView(await call("/friends"));
        if (openUid && !view.friends.some((f) => f.uid === openUid)) (openUid = null), (convo = null);
        if (panelOpen("friendp")) drawFriends();
      } catch {}
    }, 400);
  }
  function onUnread(n) {
    unread = Math.max(0, n | 0);
    badge();
  }

  // Two screens in one panel: the list (friends, requests, finding, blocked) or, once someone is picked, a conversation
  // of its own filling the panel, with an arrow back to the list.
  function drawFriends(first = false) {
    const fit = screenFit();
    const wrap = h("div.friendp");
    wrap.classList.toggle("short", fit.short);
    wrap.classList.toggle("talking", !!(openUid && convo));
    if (fit.short) wrap.style.setProperty("--avail", `${Math.max(220, fit.H - 82)}px`);
    // what was being typed stays, and so does the cursor
    const hadFocus = document.activeElement?.closest?.(".friendp .composer");
    wrap.append(openUid && convo ? talkView() : listSide());
    const title = openUid && convo ? "Truyền Âm" : "Đạo Hữu";
    if (first || !panelOpen("friendp")) panel(title, wrap);
    else {
      document.getElementById("panelTitle").textContent = title;
      document.getElementById("panelBody").replaceChildren(wrap);
    }
    const log = wrap.querySelector(".pmlog");
    if (log) log.scrollTop = log.scrollHeight;
    if (hadFocus || (openUid && convo && matchMedia("(pointer: fine)").matches)) wrap.querySelector(".composer input")?.focus({ preventScroll: true });
  }
  const back = () => ((openUid = null), (convo = null), drawFriends());

  function listSide() {
    const tabs = [["friends", `Đạo Hữu (${view.friends.length})`], ["requests", `Lời mời${view.incoming.length ? ` (${view.incoming.length})` : ""}`], ["find", "Tìm"], ["blocked", "Chặn"]];
    const body = { friends: friendsList, requests: requestsList, find: finder, blocked: blockedList }[ftab]();
    return h("div.fside", {},
      h("div.ctabs.stabs", {}, ...tabs.map(([k, l]) => h("button", { type: "button", text: l, className: ftab === k ? "on" : "", onclick: () => ((ftab = k), drawFriends()) }))),
      h("div.fbody", {}, body));
  }
  const avatar = (name, on) => h("span.av", { className: on ? "on" : "", text: [...name][0]?.toUpperCase() ?? "?" });

  function friendsList() {
    if (!view.friends.length)
      return h("div.fempty", {}, h("p.dim", { text: "Chưa có Đạo Hữu nào. Tìm theo đạo hiệu ở tab Tìm, hoặc bấm tên ai đó trong kênh chat để kết giao." }),
        h("button.primary", { type: "button", text: "Tìm Đạo Hữu", onclick: () => ((ftab = "find"), drawFriends()) }));
    return h("div.flist", {}, h("small.dim.cap", { text: `${view.friends.length}/${view.max} Đạo Hữu · ${view.friends.filter((f) => f.online).length} đang trực tuyến` }), ...view.friends.map((f) => h("button.frow", {
      type: "button", className: `${f.uid === openUid ? "on" : ""} ${f.online ? "online" : ""}`, onclick: async () => {
        openUid = f.uid;
        await loadConvo(f.uid);
        drawFriends();
      },
    },
      avatar(f.name, f.online),
      h("div.fmain", {},
        h("div.fname", {}, h("b", { text: f.name }), f.unread ? h("span.count", { text: f.unread > 99 ? "99+" : String(f.unread) }) : null),
        h("small", { text: f.online ? `${realmName(f.level)} · ${f.map}${f.sect ? ` · ${f.sect}` : ""}` : `${realmName(f.level)} · ngoại tuyến` }),
        f.last ? h("small.last", { className: f.unread ? "new" : "", text: `${f.last.mine ? "Bạn: " : ""}${f.last.text}` }) : null),
      f.last ? h("small.when", { text: ago(f.last.at) }) : null)));
  }

  function requestsList() {
    const box = h("div.flist");
    box.append(h("h4", { text: "Mời đạo hữu kết giao" }));
    if (!view.incoming.length) box.append(h("p.dim", { text: "Không có lời mời nào." }));
    for (const r of view.incoming)
      box.append(h("div.rrow", {}, avatar(r.name, false),
        h("div.fmain", {}, h("b", { text: r.name }), h("small", { text: `${realmName(r.level)} · ${ago(r.at)} trước` })),
        h("div.ract", {},
          h("button.ghost", { type: "button", text: "Từ chối", onclick: (e) => act("/answer", { uid: r.uid, accept: false }, `Đã từ chối ${r.name}.`, e.target) }),
          h("button.primary", { type: "button", text: "Kết giao", onclick: (e) => act("/answer", { uid: r.uid, accept: true }, `${r.name} đã là Đạo Hữu.`, e.target) }))));
    box.append(h("h4", { text: "Đạo hữu đã mời" }));
    if (!view.outgoing.length) box.append(h("p.dim", { text: "Chưa mời ai." }));
    for (const r of view.outgoing)
      box.append(h("div.rrow", {}, avatar(r.name, false),
        h("div.fmain", {}, h("b", { text: r.name }), h("small", { text: `Chờ trả lời · ${ago(r.at)} trước` })),
        h("div.ract", {}, h("button.ghost", { type: "button", text: "Rút lời mời", onclick: (e) => act("/cancel", { uid: r.uid }, "Đã rút lời mời.", e.target) }))));
    return box;
  }

  let findQ = "";
  function finder() {
    const input = h("input.search", { type: "search", placeholder: "Đạo hiệu (ít nhất 2 chữ)...", maxLength: 16, value: findQ, autocomplete: "off" });
    const out = h("div.flist", {}, h("p.dim", { text: "Gõ đạo hiệu để tìm. Cũng có thể bấm tên người trong kênh chat." }));
    const STATE = { friend: "Đã là Đạo Hữu", sent: "Đã mời", asked: "Họ đã mời bạn", blocked: "Đã chặn" };
    const load = async () => {
      if (findQ.length < 2) return;
      try {
        const rows = await call(`/friends/search?q=${encodeURIComponent(findQ)}`);
        out.replaceChildren(...(rows.length ? rows.map((r) => h("div.rrow", {}, avatar(r.name, false),
          h("div.fmain", {}, h("b", { text: r.name }), h("small", { text: `${realmName(r.level)}${r.state ? ` · ${STATE[r.state]}` : ""}` })),
          h("div.ract", {}, r.state === "friend" ? h("button.ghost", { type: "button", text: "✉ Truyền Âm", onclick: () => openFriends(r.uid) })
            : r.state === "asked" ? h("button.primary", { type: "button", text: "Kết giao", onclick: (e) => act("/answer", { uid: r.uid, accept: true }, `${r.name} đã là Đạo Hữu.`, e.target) })
              : h("button.primary", { type: "button", text: r.state === "sent" ? "Đã mời" : "Mời kết giao", disabled: r.state === "sent" || r.state === "blocked",
                onclick: (e) => act("/request", { uid: r.uid }, (o) => (o.friends ? `${o.name} đã là Đạo Hữu.` : `Đã gửi lời mời cho ${o.name}.`), e.target) })))) : [h("p.dim", { text: "Không thấy ai." })]));
      } catch (e) {
        out.replaceChildren(h("p.err", { text: e.message }));
      }
    };
    let t = 0;
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("input", () => (clearTimeout(t), (t = setTimeout(() => ((findQ = input.value.trim()), load()), 300))));
    load();
    setTimeout(() => input.focus(), 50);
    return h("div", {}, input, out);
  }

  function blockedList() {
    if (!view.blocked.length) return h("p.dim", { text: "Chưa chặn ai. Người bị chặn không mời kết giao, không Truyền Âm được, và lời họ nói ở các kênh không hiện với đạo hữu." });
    return h("div.flist", {}, ...view.blocked.map((b) => h("div.rrow", {}, avatar(b.name, false),
      h("div.fmain", {}, h("b", { text: b.name }), h("small", { text: `Chặn ${ago(b.at)} trước` })),
      h("div.ract", {}, h("button.ghost", { type: "button", text: "Bỏ chặn", onclick: (e) => act("/unblock", { uid: b.uid }, `Đã bỏ chặn ${b.name}.`, e.target) })))));
  }

  // ---------------------------------------------------------------- Truyền Âm: one conversation
  async function loadConvo(uid, older = false) {
    try {
      const before = older && convo?.uid === uid ? convo.messages[0]?.id : undefined;
      const r = await call(`/friends/${uid}/messages${before ? `?before=${before}` : ""}`);
      convo = older && convo?.uid === uid ? { uid, more: r.more, messages: [...r.messages, ...convo.messages] } : { uid, more: r.more, messages: r.messages };
      const f = view?.friends.find((x) => x.uid === uid);
      if (f) f.unread = 0;
      unread = view ? view.friends.reduce((a, x) => a + x.unread, 0) : 0;
      badge();
    } catch (e) {
      flash(e.message);
      convo = null;
    }
  }
  // ---- the conversation screen
  const drafts = new Map(); // uid -> what was being typed to them
  const SVG = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 11.1 19.6 3.6c.8-.4 1.6.4 1.2 1.2L13.3 21c-.4.8-1.6.7-1.8-.2l-1.6-6.4-6.4-1.6c-.9-.2-1-1.4-.1-1.7z" fill="currentColor"/><path d="M9.9 14.3 20.4 4" stroke="#7a4a0c" stroke-width="1.4" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  };
  const icon = (name) => {
    const s = h("span.ic");
    s.innerHTML = SVG[name]; // our own drawings only
    return s;
  };
  function talkView() {
    const f = view.friends.find((x) => x.uid === openUid);
    if (!f) return listSide();
    // header: back to the list, who it is, where they are, and the actions behind ⋯
    const menu = h("div.tmenu", { hidden: true },
      sure("Huỷ kết giao", "Bấm lần nữa để huỷ", (b) => act("/remove", { uid: f.uid }, `Đã huỷ kết giao với ${f.name}.`, b).then(back), "ghost"),
      sure("Chặn người này", "Bấm lần nữa để chặn", (b) => act("/block", { uid: f.uid }, `Đã chặn ${f.name}.`, b).then(back), "ghost danger"));
    const head = h("div.thead", {},
      h("button.back", { type: "button", title: "Về danh sách Đạo Hữu", "aria-label": "Về danh sách Đạo Hữu", onclick: back }, icon("back"), h("span", { text: "Đạo Hữu" })),
      h("div.who", {}, avatar(f.name, f.online),
        h("div.fmain", {}, h("b", { text: f.name }),
          h("small", { className: f.online ? "on" : "", text: f.online ? `Đang trực tuyến · ${f.map}` : "Ngoại tuyến · sẽ thấy tin khi vào game" }))),
      // Đạo Lữ: roses for a Đạo Hữu of the other gender (the server checks it again)
      giftRose && f.g && myGender?.() && f.g !== myGender() ? h("button.roseb", { type: "button", title: `Tặng Hoa Hồng cho ${f.name} (tăng hảo cảm, Đạo Lữ)`, "aria-label": "Tặng Hoa Hồng", onclick: () => giftRose(f.uid, f.name) }, h("span", { text: "🌹" })) : null,
      h("button.moreb", { type: "button", title: "Tuỳ chọn", "aria-label": "Tuỳ chọn", onclick: (e) => (e.stopPropagation(), (menu.hidden = !menu.hidden)) }, icon("more")),
      menu);
    const chips = h("div.tchips", {}, h("span.chip", { text: realmName(f.level) }), f.sect ? h("span.chip.gold", { text: `〔${f.sect}〕` }) : null,
      h("span.chip", { text: `Đạo Hữu từ ${dayOf(f.at)}` }));
    const log = h("div.pmlog");
    fillLog(log, f);
    // the composer: a rounded field, the count near the limit, a round send button
    const input = h("input", { maxLength: 200, placeholder: `Truyền Âm cho ${f.name}...`, autocomplete: "off", enterKeyHint: "send", value: drafts.get(f.uid) ?? "", "aria-label": `Truyền Âm cho ${f.name}` });
    const left = h("small.left");
    const sendB = h("button.sendb", { type: "button", title: "Gửi (Enter)", "aria-label": "Gửi" }, icon("send"));
    const sync = () => {
      const n = [...input.value].length;
      drafts.set(f.uid, input.value);
      left.textContent = n > 150 ? `${n}/200` : "";
      sendB.disabled = !input.value.trim();
    };
    const sendIt = () => {
      const v = input.value.trim();
      if (!v) return;
      const c = Math.random().toString(36).slice(2, 10);
      // shown at once, faded until the server confirms it (or says why not)
      convo.messages.push({ id: 0, mine: true, text: v, at: new Date().toISOString(), c, sending: true });
      game()?.pm(f.uid, v, c);
      input.value = "";
      sync();
      fillLog(log, f);
      log.scrollTop = log.scrollHeight;
      input.focus();
    };
    input.addEventListener("input", sync);
    input.addEventListener("keydown", (e) => (e.stopPropagation(), e.key === "Enter" && sendIt()));
    sendB.addEventListener("click", sendIt);
    sync();
    return h("div.ftalk", { onclick: (e) => !e.target.closest(".tmenu, .moreb") && (menu.hidden = true) }, head, chips, log, h("div.composer", {}, input, left, sendB));
  }
  /** The messages: a pill for each day, one sender's lines close together, the time under the last of each group, "Đã xem" under my last one read. */
  function fillLog(log, f) {
    const keepBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const kids = [];
    if (convo.more) kids.push(h("button.older", { type: "button", text: "Xem tin cũ hơn", onclick: async () => {
      const keep = log.scrollHeight - log.scrollTop;
      await loadConvo(f.uid, true);
      fillLog(log, f);
      log.scrollTop = log.scrollHeight - keep;
    } }));
    if (!convo.messages.length)
      kids.push(h("div.pmstart", {}, h("span.av.big", { text: [...f.name][0]?.toUpperCase() ?? "?" }), h("b", { text: f.name }),
        h("p", { text: "Hai đạo hữu chưa Truyền Âm cho nhau. Hãy gửi lời đầu tiên." }), h("small", { text: "Chỉ hai người thấy. Tin được lưu 30 ngày." })));
    const ms = convo.messages, lastRead = [...ms].reverse().find((m) => m.mine && m.read);
    let day = "";
    ms.forEach((m, i) => {
      const d = dayOf(m.at);
      if (d !== day) kids.push(h("div.day", {}, h("span", { text: (day = d) })));
      const prev = ms[i - 1], next = ms[i + 1];
      const near = (a, b) => a && b && a.mine === b.mine && dayOf(a.at) === dayOf(b.at) && Math.abs(new Date(b.at) - new Date(a.at)) < 180000;
      const first = !near(prev, m), last = !near(m, next);
      kids.push(bubble(m, first, last));
      if (m === lastRead && !ms.slice(i + 1).some((x) => x.mine)) kids.push(h("small.seen", { text: "Đã xem" }));
    });
    log.replaceChildren(...kids);
    if (keepBottom) log.scrollTop = log.scrollHeight;
  }
  function bubble(m, first = true, last = true) {
    return h("div.bub", { className: `${m.mine ? "mine" : "theirs"}${first ? " first" : ""}${last ? " last" : ""}${m.sending ? " sending" : ""}${m.failed ? " failed" : ""}` },
      h("span.txt", { text: m.text }),
      last || m.failed || m.sending ? h("small", { text: m.failed ? "Không gửi được · thử lại" : m.sending ? "Đang gửi..." : hm(m.at) }) : null);
  }

  /** A Truyền Âm, sent by me (the server's echo) or to me. */
  let readT = 0;
  function onPm(m) {
    const f = view?.friends.find((x) => x.uid === m.with);
    if (f) f.last = { mine: m.mine, text: m.text, at: m.at };
    const showing = panelOpen("friendp") && openUid === m.with && convo?.uid === m.with;
    if (showing) {
      const i = m.mine ? convo.messages.findIndex((x) => x.c && x.c === m.c) : -1;
      const msg = { id: m.id, mine: m.mine, text: m.text, at: m.at, read: false };
      if (i >= 0) convo.messages[i] = msg;
      else convo.messages.push(msg);
      // what arrives while the conversation is open is read: told to the server a moment later, once
      if (!m.mine) (clearTimeout(readT), (readT = setTimeout(() => call("/friends/read", { method: "POST", body: { uid: m.with } }).catch(() => {}), 1200)));
      const log = document.querySelector(".friendp .pmlog");
      if (log && f) fillLog(log, f);
      return;
    }
    if (!m.mine) {
      if (f) f.unread++;
      unread++;
      badge();
      if (panelOpen("friendp")) drawFriends();
    }
  }
  function onPmErr(m) {
    if (!convo) return;
    const x = convo.messages.find((y) => y.c && y.c === m.c);
    if (x) (x.sending = false), (x.failed = true);
    const log = document.querySelector(".friendp .pmlog"), f = view?.friends.find((y) => y.uid === convo.uid);
    if (log && f) fillLog(log, f);
  }

  addEventListener("resize", () => {
    if (panelOpen("friendp")) drawFriends();
    else if (panelOpen("chatp")) drawChat();
  });
  // a click anywhere else closes a name's menu
  addEventListener("pointerdown", (e) => !e.target.closest(".namemenu, .who") && document.querySelector(".namemenu")?.remove());

  /** The game started: the first look at requests waiting and unread Truyền Âm, for the badge. */
  const start = () => call("/friends").then(setView).catch(() => {});

  return { start, openChat, openFriends, onChat, onHist, onPm, onPmErr, onFriends, onUnread };
}
