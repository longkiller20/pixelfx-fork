// Screens: log in, make a character, play. Plus the shop, the leaderboard and the daily gift.
import { createFrame, clearFrame, composite, painterFor } from "/hieu-ung/core/index.js";
import { ITEMS, DAILY_STONES, realmName, applyConfig, ARTS, ART_LIST, ART_SLOTS, canFly, flyRealmName, levelFromExp } from "/shared/balance.js";
import { ELEMENTS } from "/shared/cong-phap.js";
import { artIcon, artLine, elementName } from "./arts.js";
import { loadAvatars, drawAvatar, partCanvas } from "./avatar.js";
import { startGame } from "./game.js";
import { initSect } from "./tong-mon.js";
import { initSocial } from "./dao-huu.js";
import { initHomeUI } from "./gia-vien.js";
import { startMusic, setMusicOn, setMusicVolume, musicState, onMusicChange } from "./music.js";

const $ = (id) => document.getElementById(id);
const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
document.body.classList.toggle("touch", touch);
let token = localStorage.getItem("dvtt.token") || "";
let game = null, state = null;

async function call(path, { method = "GET", body } = {}) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/login") logoutLocal();
  if (!r.ok) throw new Error(data.error || "Có lỗi xảy ra.");
  return data;
}

// a request id that works on plain http too (crypto.randomUUID needs https)
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("hidden", s.id !== id);
  fitOrientation();
}

// ---------------------------------------------------------------- phones: landscape, full screen
async function goLandscape() {
  if (!touch) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
  } catch {}
  try {
    await screen.orientation?.lock?.("landscape");
  } catch {}
  fitOrientation();
}
// where the browser won't turn (iPhone Safari), turn the page itself while the phone is upright
function fitOrientation() {
  const upright = innerHeight > innerWidth;
  // the game and the character maker are laid out for landscape; the login form stays upright
  const wide = !$("game").classList.contains("hidden") || !$("create").classList.contains("hidden");
  document.body.classList.toggle("rotated", touch && upright && wide);
  requestAnimationFrame(fitMaker);
}
// the character maker never scrolls: if it is still taller or wider than the screen after the compact layout, it is
// shrunk as a whole to fit
function fitMaker() {
  const box = document.querySelector("#create .maker"), scr = $("create");
  if (!box || scr.classList.contains("hidden")) return;
  box.style.transform = "";
  const W = scr.clientWidth - 8, H = scr.clientHeight - 8;
  const k = Math.min(1, W / box.offsetWidth, H / box.offsetHeight);
  box.style.transform = k < 1 ? `scale(${k})` : "";
}
addEventListener("resize", () => {
  fitOrientation();
  dispatchEvent(new Event("game-resize"));
});
addEventListener("orientationchange", () => setTimeout(fitOrientation, 200));

// ---------------------------------------------------------------- log in / sign up
let mode = "login";
for (const b of document.querySelectorAll("[data-tab]"))
  b.addEventListener("click", () => {
    mode = b.dataset.tab;
    for (const x of document.querySelectorAll("[data-tab]")) x.classList.toggle("on", x === b);
    $("authBtn").textContent = mode === "login" ? "Đăng nhập" : "Đăng ký";
    $("authErr").textContent = "";
  });
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  // the tap that logs in is the one gesture that may go full screen
  goLandscape();
  const btn = $("authBtn");
  btn.disabled = true;
  $("authErr").textContent = "";
  try {
    const out = await call(`/${mode}`, { method: "POST", body: { username: $("user").value.trim(), password: $("pass").value } });
    token = out.token;
    localStorage.setItem("dvtt.token", token);
    await enter();
  } catch (err) {
    $("authErr").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

async function enter() {
  state = await call("/me");
  if (!state.character) return showCreate();
  play();
}

// ---------------------------------------------------------------- previews: a character standing on a small canvas
/** Keep drawing look() on canvas cv, standing (breathing), while alive() holds; onSword(): standing on the flying sword. */
function preview(cv, look, alive, onSword = () => false) {
  const W = cv.width, H = cv.height, ctx = cv.getContext("2d"), f = createFrame(W, H), img = ctx.createImageData(W, H);
  const step = () => {
    if (!alive()) return;
    const t = performance.now() / 1000, sword = onSword();
    clearFrame(f);
    const p = painterFor(f);
    p.place(W / 2, H - 12 - (sword ? 6 : 0), false);
    drawAvatar(p, look(), { t, fly: sword });
    composite(f, img.data, null);
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** A grid of part thumbnails: pick(item) on click; badge(item) is an optional corner label (a tick, a star); dim(item)
 *  greys out what is not yours yet. */
function partGrid(box, items, isOn, pick, badge = () => "", dim = () => false) {
  box.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = it.name;
    b.append(partCanvas(it.kind, it.g, it.idx));
    const tag = badge(it);
    if (tag) {
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = tag;
      b.append(s);
    }
    b.classList.toggle("on", isOn(it));
    b.classList.toggle("dim", dim(it));
    b.addEventListener("click", () => {
      pick(it);
      [...box.children].forEach((x, i) => x.classList.toggle("on", isOn(items[i])));
    });
    box.append(b);
  }
}

// ---------------------------------------------------------------- making a character: gender, name, hair, robe
// Only the free starter styles are offered here; the rest are bought in game at the Y Các.
const look = { g: "m", hair: 0, robe: 0 };
let catalog = [];
const starters = (kind) => catalog.filter((c) => c.starter && c.kind === kind && c.g === look.g);
const pickRandom = (kind) => {
  const s = starters(kind);
  if (s.length) look[kind] = s[Math.floor(Math.random() * s.length)].idx;
};
async function showCreate() {
  show("create");
  await loadAvatars();
  const w = await call("/cosmetics");
  catalog = w.items;
  // everyone starts with the same weapon in hand (changed later at the Y Các)
  look.weapon = w.defaultWeapon;
  pickRandom("hair");
  pickRandom("robe");
  fillPicks();
  fitMaker();
  preview($("pv"), () => look, () => !$("create").classList.contains("hidden"));
}
function fillPicks() {
  for (const b of document.querySelectorAll("[data-g]")) b.classList.toggle("on", b.dataset.g === look.g);
  for (const [kind, box] of [["hair", $("hairs")], ["robe", $("robes")]])
    partGrid(box, starters(kind), (it) => it.idx === look[kind], (it) => {
      look[kind] = it.idx;
      names();
    });
  names();
}
function names() {
  $("hairNo").textContent = starters("hair").find((c) => c.idx === look.hair)?.name ?? "";
  $("robeNo").textContent = starters("robe").find((c) => c.idx === look.robe)?.name ?? "";
}
for (const b of document.querySelectorAll("[data-g]"))
  b.addEventListener("click", () => {
    if (look.g === b.dataset.g) return;
    look.g = b.dataset.g;
    pickRandom("hair");
    pickRandom("robe");
    fillPicks();
  });
$("randLook").addEventListener("click", () => {
  pickRandom("hair");
  pickRandom("robe");
  fillPicks();
});
$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("createErr").textContent = "";
  try {
    await call("/character", { method: "POST", body: { name: $("charName").value, look } });
    state = await call("/me");
    play();
  } catch (err) {
    $("createErr").textContent = err.message;
  }
});

// ---------------------------------------------------------------- playing
function play() {
  show("game");
  fitOrientation();
  $("dailyBtn").classList.toggle("ready", !state.dailyClaimed);
  startMusic();
  setTimeout(() => social.start(), 800);
  setTimeout(() => game && (game.home.onChange = () => homeUI.hud()), 0);
  game = startGame({
    token, character: state.character, inventory: state.inventory, touch, refreshConfig,
    // an empty slot on the bar opens the arts, ready to fill that slot
    openArts: (slot) => artsPanel(slot),
    onSect: () => sect.onSect(),
    onSectChat: (m) => sect.onChat(m),
    social,
    onHomeState: () => homeUI.onState(),
    onHomeTap: (hit) => homeUI.onTap(hit),
    onFatal: (msg, relog) => {
      game = null;
      $("fatalMsg").textContent = msg;
      $("fatal").hidden = false;
      $("fatalBtn").onclick = () => (relog ? logoutLocal() : location.reload());
    },
  });
}

// the panels
const closeAsk = () => document.querySelector(".buyask")?.end(false);
function panel(title, body) {
  closeAsk();
  $("panelTitle").textContent = title;
  const b = $("panelBody");
  b.innerHTML = "";
  b.append(body);
  $("panel").hidden = false;
}
$("panelClose").addEventListener("click", () => (closeAsk(), ($("panel").hidden = true)));

$("shopBtn").addEventListener("click", async () => {
  const wrap = document.createElement("div");
  wrap.className = "shop";
  const me = await call("/me").catch(() => state);
  const bal = document.createElement("p");
  bal.className = "bal";
  bal.textContent = `Linh thạch: ${me.character.stones}`;
  wrap.append(bal);
  for (const [id, it] of Object.entries(ITEMS).filter(([, it]) => it.onSale).sort((a, b) => a[1].sort - b[1].sort)) {
    const row = document.createElement("div");
    row.className = "item";
    const ic = new Image();
    ic.className = "ic";
    ic.alt = "";
    ic.src = `/xianxia/ui/ui_xianxia_item_${{ hoixuan: "pill_bottle", tukhi: "furnace" }[id] ?? (it.heal ? "peach" : "gourd")}.png`;
    row.append(ic);
    const info = document.createElement("div");
    const h = document.createElement("b");
    h.textContent = `${it.name} · ${it.price} linh thạch`;
    const d = document.createElement("small");
    d.textContent = `${it.desc}. Đang có: ${me.inventory[id] ?? 0}`;
    info.append(h, d);
    const btns = document.createElement("div");
    for (const n of [1, 5]) {
      const b = document.createElement("button");
      b.textContent = `Mua ${n}`;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const out = await call("/shop/buy", { method: "POST", body: { item: id, qty: n, requestId: uuid() } });
          bal.textContent = `Linh thạch: ${out.character.stones}`;
          d.textContent = `${it.desc}. Đang có: ${out.inventory[id] ?? 0}`;
          game?.setInventory(out.inventory);
        } catch (err) {
          alertIn(wrap, err.message);
        } finally {
          b.disabled = false;
        }
      });
      btns.append(b);
    }
    const ub = document.createElement("button");
    ub.textContent = "Dùng";
    ub.addEventListener("click", () => {
      game?.use(id);
      setTimeout(() => (d.textContent = `${it.desc}. Đang có: ${game?.inventory()[id] ?? 0}`), 700);
    });
    btns.append(ub);
    row.append(info, btns);
    wrap.append(row);
  }
  panel("Đan Các", wrap);
});

// ---------------------------------------------------------------- the wardrobe (Y Các): try on, buy and wear
// ---------------------------------------------------------------- Công Pháp: learn arts, put five on the bar
// An art is learned by spending what it needs (its bí kíp, its element's essence; Linh Tủy for the great ones), all of
// which drop from monsters. Pick a slot of the bar above, then "Gán" on an art to put it there; an art already on the bar
// moves (the two swap).
$("artsBtn").addEventListener("click", () => artsPanel());
function artsPanel(startSlot = -1) {
  if (!game) return;
  let sel = startSlot, show = "all", elem = "", text = "";
  const wrap = document.createElement("div");
  wrap.className = "artp";
  const bar = document.createElement("div"), filters = document.createElement("div"), list = document.createElement("div"), bag = document.createElement("div");
  bar.className = "bar5";
  filters.className = "filters";
  list.className = "list";
  bag.className = "bag";
  const st = () => game.arts(), inv = () => game.inventory();
  const known = (a) => a.starter || st().learned.includes(a.key);
  // learned with its items, or (an admin's switch) only given by events and activities; never bought
  const ev = (a) => !a.starter && !a.learnable;
  const can = (a) => a.learnable && a.reqs.every((r) => (inv()[r.item] ?? 0) >= r.qty);
  const icon = (key, img) => artIcon(key, (url) => url && (img.src = url));

  const save = async (slots) => {
    try {
      const out = await call("/arts/equip", { method: "POST", body: { slots } });
      game.setArts(out.character);
      draw();
    } catch (err) {
      alertIn(wrap, err.message);
    }
  };
  const put = (key) => {
    const slots = st().slots.slice(), at = sel >= 0 ? sel : slots.indexOf(null) >= 0 ? slots.indexOf(null) : 0, was = slots.indexOf(key);
    if (was >= 0) slots[was] = slots[at];
    slots[at] = key;
    save(slots);
  };

  function drawBar() {
    bar.replaceChildren();
    st().slots.forEach((k, i) => {
      const b = document.createElement("button");
      b.className = "slot" + (sel === i ? " sel" : "");
      b.title = k ? `${ARTS[k]?.name} (ô ${i + 1})` : `Ô ${i + 1} trống`;
      b.innerHTML = `<b>${i + 1}</b>`;
      if (k) {
        const img = new Image();
        img.alt = "";
        icon(k, img);
        b.append(img);
      }
      b.addEventListener("click", () => ((sel = sel === i ? -1 : i), draw()));
      bar.append(b);
    });
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = sel >= 0 ? `Đang chọn ô ${sel + 1}: bấm "Gán" trên một công pháp đã lĩnh ngộ.` : "Chọn một ô rồi bấm \"Gán\", hoặc bấm \"Gán\" để đặt vào ô trống đầu tiên.";
    bar.append(hint);
    if (sel >= 0 && st().slots[sel]) {
      const clr = document.createElement("button");
      clr.textContent = "Gỡ khỏi ô";
      clr.addEventListener("click", () => {
        const slots = st().slots.slice();
        slots[sel] = null;
        save(slots);
      });
      bar.append(clr);
    }
  }

  // filters: which arts, which element, a name
  const showSel = document.createElement("select"), elemSel = document.createElement("select"), search = document.createElement("input");
  for (const [v, l] of [["all", "Tất cả"], ["known", "Đã có"], ["ready", "Đủ vật phẩm"], ["locked", "Chưa có"], ["event", "Sự kiện"]]) showSel.append(new Option(l, v));
  elemSel.append(new Option("Mọi hệ", ""));
  for (const [k, e] of Object.entries(ELEMENTS)) elemSel.append(new Option(e.name, k));
  search.placeholder = "Tìm công pháp...";
  search.type = "search";
  showSel.onchange = () => ((show = showSel.value), drawList());
  elemSel.onchange = () => ((elem = elemSel.value), drawList());
  search.oninput = () => ((text = search.value.trim().toLowerCase()), drawList());
  filters.append(showSel, elemSel, search);

  // icons are drawn only for the cards that scroll into view
  const seen = new IntersectionObserver((es) => {
    for (const e of es)
      if (e.isIntersecting) {
        seen.unobserve(e.target);
        icon(e.target.dataset.key, e.target);
      }
  }, { root: list });

  function drawList() {
    list.replaceChildren();
    const arts = ART_LIST.filter((a) => (!elem || a.element === elem) && (!text || a.name.toLowerCase().includes(text)) &&
      (show === "all" || (show === "known" && known(a)) || (show === "ready" && !known(a) && can(a)) || (show === "locked" && !known(a)) || (show === "event" && ev(a))));
    // what they have, what they can learn now, then by tier; the event-only ones they lack go last
    arts.sort((a, b) => known(b) - known(a) || (ev(a) && !known(a)) - (ev(b) && !known(b)) || can(b) - can(a) || a.tier - b.tier || a.sort - b.sort);
    for (const a of arts) {
      const card = document.createElement("div"), k = known(a), on = st().slots.indexOf(a.key);
      card.className = "card" + (k ? " known" : "");
      const img = new Image();
      img.alt = "";
      img.dataset.key = a.key;
      seen.observe(img);
      const body = document.createElement("div");
      const h = document.createElement("h4");
      h.innerHTML = `${a.name} <small>· ${elementName(a.element)} · bậc ${a.tier}</small>`;
      if (ev(a)) h.append(Object.assign(document.createElement("span"), { className: "evtag", textContent: "★ Sự kiện" }));
      const line = document.createElement("p");
      line.textContent = artLine(a) + (a.desc ? `. ${a.desc}` : "");
      body.append(h, line);
      if (!k && ev(a)) {
        const note = document.createElement("p");
        note.className = "evnote";
        note.textContent = "Chỉ nhận được qua hoạt động, sự kiện.";
        body.append(note);
      } else if (!k) {
        const req = document.createElement("div");
        req.className = "req";
        for (const r of a.reqs) {
          const have = inv()[r.item] ?? 0, sp = document.createElement("span");
          sp.className = have >= r.qty ? "ok" : "";
          sp.textContent = `${ITEMS[r.item]?.name ?? r.item} ${Math.min(have, r.qty)}/${r.qty}`;
          req.append(sp);
        }
        body.append(req);
      }
      const acts = document.createElement("div");
      acts.className = "acts";
      const b = document.createElement("button");
      if (k) {
        b.textContent = on >= 0 ? `Ở ô ${on + 1}${sel >= 0 && sel !== on ? ` → ô ${sel + 1}` : ""}` : sel >= 0 ? `Gán vào ô ${sel + 1}` : "Gán";
        b.disabled = on >= 0 && (sel < 0 || sel === on);
        b.addEventListener("click", () => put(a.key));
      } else if (ev(a)) {
        b.textContent = "Chỉ qua sự kiện";
        b.disabled = true;
      } else {
        b.textContent = "Lĩnh ngộ";
        b.disabled = !can(a);
        b.title = can(a) ? "Tiêu hao các vật phẩm trên" : "Chưa đủ vật phẩm (rơi từ yêu thú)";
        b.addEventListener("click", async () => {
          if (!confirm(`Lĩnh ngộ ${a.name}? Sẽ tiêu hao: ${a.reqs.map((r) => `${ITEMS[r.item]?.name ?? r.item} ×${r.qty}`).join(", ")}.`)) return;
          b.disabled = true;
          try {
            const out = await call("/arts/learn", { method: "POST", body: { key: a.key } });
            game.setInventory(out.inventory);
            game.setArts(out.character);
            draw();
          } catch (err) {
            alertIn(wrap, err.message);
            b.disabled = false;
          }
        });
      }
      acts.append(b);
      body.append(acts);
      card.append(img, body);
      list.append(card);
    }
    if (!arts.length) list.textContent = "Không có công pháp nào khớp.";
  }

  function drawBag() {
    const items = Object.entries(inv()).filter(([k, n]) => n > 0 && ITEMS[k] && ITEMS[k].kind !== "pill");
    bag.replaceChildren(Object.assign(document.createElement("b"), { textContent: "Túi: " }));
    if (!items.length) bag.append("chưa có bí kíp hay tinh thạch nào. Hạ yêu thú để nhặt.");
    for (const [k, n] of items.sort((a, b) => ITEMS[a[0]].sort - ITEMS[b[0]].sort)) {
      const sp = document.createElement("span");
      sp.textContent = `${ITEMS[k].name} ×${n}`;
      sp.title = ITEMS[k].desc;
      bag.append(sp);
    }
  }
  function draw() {
    drawBar();
    drawList();
    drawBag();
  }
  wrap.append(bar, filters, list, bag);
  draw();
  panel(`Công Pháp (${ART_LIST.filter(known).length}/${ART_LIST.length} đã lĩnh ngộ)`, wrap);
}

/** The Y Các purchase confirmation, over the panel: the item, its price and what is left after. Resolves true to buy. */
function buyConfirm(it, stones) {
  return new Promise((done) => {
    const short = it.price - stones;
    const box = document.createElement("div");
    box.className = "buyask";
    box.innerHTML = `<div class="card" role="dialog" aria-modal="true"><h4>Mua vật phẩm</h4><div class="pic"></div><b class="nm"></b>
      <div class="price">Giá: <b>💎 ${it.price}</b> linh thạch</div>
      <div class="after ${short > 0 ? "bad" : "dim"}">${short > 0 ? `Thiếu ${short} linh thạch (đang có ${stones})` : `Đang có ${stones} → còn ${stones - it.price}`}</div>
      <div class="btns"><button type="button" class="no">Huỷ</button><button type="button" class="primary yes">Mua</button></div></div>`;
    box.querySelector(".pic").append(partCanvas(it.kind, it.g, it.idx));
    box.querySelector(".nm").textContent = it.name;
    const yes = box.querySelector(".yes");
    yes.disabled = short > 0;
    const end = (v) => {
      box.remove();
      removeEventListener("keydown", key);
      done(v);
    };
    const key = (e) => e.key === "Escape" && end(false);
    box.end = end;
    addEventListener("keydown", key);
    yes.addEventListener("click", () => end(true));
    box.querySelector(".no").addEventListener("click", () => end(false));
    box.addEventListener("click", (e) => e.target === box && end(false));
    $("panel").append(box);
    (short > 0 ? box.querySelector(".no") : yes).focus();
  });
}

$("wardBtn").addEventListener("click", async () => {
  let w, me;
  try {
    [w, me] = await Promise.all([call("/cosmetics"), call("/me")]);
  } catch (err) {
    return flash(err.message);
  }
  if (!me.character) return;
  state.character = me.character;
  const g = me.character.look.g, owned = new Set(w.owned), trying = { ...me.character.look };
  let kind = "hair", sel = null;
  const page = {}; // the page shown for each tab, 10 to a page
  const has = (it) => it.starter || owned.has(it.id);
  const wearing = (it) => me.character.look[it.kind] === it.idx;

  const wrap = document.createElement("div");
  wrap.className = "ward";
  wrap.innerHTML = `<div class="preview"><canvas width="96" height="96"></canvas>
    <div class="sel"><b class="nm"></b><span class="st dim"></span><button type="button" class="primary act"></button></div></div>
    <div class="choices"><div class="row"><div class="seg"><button type="button" data-k="hair" class="on">Tóc</button>
    <button type="button" data-k="robe">Y phục</button><button type="button" data-k="weapon">Vũ khí</button><button type="button" data-k="sword">Phi kiếm</button></div><span class="bal"></span></div><div class="picks big"></div><div class="wpager"></div></div>`;
  const $$ = (s) => wrap.querySelector(s);
  const bal = () => ($$(".bal").textContent = `💎 ${me.character.stones} linh thạch`);
  const PER = 10;
  const grid = () => {
    // a shop: what can be bought first (cheapest first), then what is already yours; 10 to a page
    const items = w.items.filter((it) => it.kind === kind && (it.g === g || it.g === "a") && (it.onSale || has(it)));
    const rank = (it) => (has(it) ? (it.special ? 1 : 2) : 0);
    items.sort((a, b) => rank(a) - rank(b) || a.price - b.price || a.idx - b.idx);
    const pages = Math.max(1, Math.ceil(items.length / PER)), at = Math.min(page[kind] ?? 0, pages - 1);
    page[kind] = at;
    const pg = $$(".wpager");
    pg.replaceChildren();
    if (pages > 1) {
      const btn = (label, to, cls = "") => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.className = cls;
        b.disabled = to < 0 || to >= pages;
        b.addEventListener("click", () => ((page[kind] = to), grid()));
        return b;
      };
      pg.append(btn("‹", at - 1));
      for (let i = 0; i < pages; i++) pg.append(btn(String(i + 1), i, i === at ? "on" : ""));
      pg.append(btn("›", at + 1));
    }
    partGrid($$(".picks"), items.slice(at * PER, at * PER + PER), (it) => sel?.id === it.id, (it) => {
      sel = it;
      trying[it.kind] = it.idx;
      side();
    }, (it) => (has(it) ? "✓" : ""), (it) => !has(it));
  };
  const side = () => {
    const b = $$(".act"), st = $$(".st");
    $$(".nm").textContent = sel?.name ?? "Chọn một món để thử";
    b.hidden = !sel;
    b.disabled = false;
    st.textContent = "";
    if (!sel) return;
    if (sel.kind === "sword" && !has(sel) && !canFly(me.character.level ?? levelFromExp(me.character.exp))) {
      st.textContent = `Tới cảnh giới ${flyRealmName()} mới ngự kiếm phi hành được`;
      b.hidden = true;
      return;
    }
    // yours: only marked as yours (wearing it happens in the character panel, 👤)
    if (has(sel)) (st.textContent = `Đã sở hữu${sel.special ? " · ★ Bảo vật" : ""}`), (b.hidden = true);
    // not yours yet: the price shows only when buying, in the confirmation
    else (st.textContent = "Chưa sở hữu"), (b.textContent = "Mua");
  };
  $$(".act").addEventListener("click", async () => {
    const it = sel, b = $$(".act");
    if (!it) return;
    if (has(it) || !(await buyConfirm(it, me.character.stones))) return;
    b.disabled = true;
    try {
      {
        const out = await call("/cosmetics/buy", { method: "POST", body: { id: it.id, wear: false } });
        me.character = out.character;
        w = { items: out.items, owned: out.owned };
        owned.clear();
        for (const id of out.owned) owned.add(id);
        flash(`Đã mua ${it.name}! Mặc ở bảng Nhân vật 👤.`);
      }
      state.character = me.character;
      bal();
      grid();
    } catch (err) {
      alertIn(wrap, err.message);
    }
    side();
  });
  for (const b of wrap.querySelectorAll("[data-k]"))
    b.addEventListener("click", () => {
      kind = b.dataset.k;
      for (const x of wrap.querySelectorAll("[data-k]")) x.classList.toggle("on", x === b);
      // a new tab: nothing picked there yet (what was tried on stays on the preview, to see things together)
      sel = null;
      grid();
      side();
    });
  bal();
  grid();
  side();
  panel("Y Các", wrap);
  // a flying sword is seen under the feet
  preview($$("canvas"), () => trying, () => !$("panel").hidden && wrap.isConnected, () => kind === "sword");
});

$("rankBtn").addEventListener("click", async () => {
  const wrap = document.createElement("div");
  wrap.className = "board";
  try {
    const lb = await call("/leaderboard");
    for (const [title, rows, unit] of [["Đấu Trường", lb.rank, "điểm"], ["Tu Vi", lb.exp, "tu vi"]]) {
      const col = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = title;
      const ol = document.createElement("ol");
      for (const r of rows) {
        const li = document.createElement("li");
        li.textContent = `${r.name} (${realmName(r.level)}): ${r.v} ${unit}`;
        ol.append(li);
      }
      col.append(h, ol);
      wrap.append(col);
    }
  } catch (err) {
    wrap.textContent = err.message;
  }
  panel("Bảng Phong Thần", wrap);
});

$("dailyBtn").addEventListener("click", async () => {
  try {
    await call("/daily", { method: "POST" });
    $("dailyBtn").classList.remove("ready");
    flash(`Nhận ${DAILY_STONES} linh thạch!`);
  } catch (err) {
    flash(err.message);
  }
});

$("helpBtn").addEventListener("click", () => {
  const d = document.createElement("div");
  d.className = "help";
  d.innerHTML = `<p><b>Máy tính:</b> A/D hoặc ←/→ để đi, W/↑/Space để nhảy, S + nhảy để xuống khỏi ván gỗ. Chuột để ngắm. J (hoặc chuột trái) đánh thường; K/L/U/I/O (hoặc 1-5, chuột phải cho ô 1) dùng 5 công pháp trên thanh. Z: Hồi Xuân Đan, X: Tụ Khí Đan. F: ngự kiếm phi hành (khi bay, W/S để lên xuống). Enter để trò chuyện.</p>
  <p><b>Điện thoại:</b> đặt ngón tay ở nửa trái màn hình là hiện cần analog tròn: gạt trái/phải để đi, gạt lên để nhảy, gạt xuống để rơi xuyên ván gỗ hoặc đài mây; góc phải là cụm nút kiểu MOBA: nút to ở góc là Kiếm Khí Trảm (đánh thường), 5 công pháp xếp thành một vòng cung quanh nó, bên trái là 2 đan dược, phía trên là nút phi kiếm (mở khoá từ cảnh giới admin đặt): chạm để ngự kiếm, khi bay gạt cần analog theo mọi hướng. Chiêu vùng (như Tiểu Bạo Phù, Lưu Tinh Hỏa Vũ) kéo được: giữ nút chiêu rồi kéo ngón tay theo hướng muốn ném, vòng xanh là tầm tối đa, vòng vàng là chỗ chiêu sẽ nổ, thả tay để tung chiêu; chạm nhanh thì chiêu tự rơi vào kẻ địch gần nhất. Trên máy tính, chiêu vùng nổ ở chỗ con trỏ chuột. Ô trống có dấu +: chạm vào để gán công pháp.</p>
  <p><b>Công Pháp (nút 📜):</b> hơn 200 công pháp, mỗi môn cần bí kíp riêng và tinh thạch theo hệ (môn cao cần thêm Linh Tủy), đều rơi ngẫu nhiên khi hạ yêu thú. Đủ vật phẩm thì bấm Lĩnh ngộ; gán tối đa 5 môn lên thanh, đổi lúc nào cũng được.  chiêu tự nhắm kẻ địch gần nhất.</p>
  <p><b>Y Các (👘):</b> thử và mua kiểu tóc, y phục mới bằng linh thạch; đồ đã mua mặc lại lúc nào cũng được.</p>
  <p><b>Tu luyện:</b> đứng yên trên Thái Cực Đài (bệ đá dưới đĩa âm dương xoay, trước điện thờ) để tăng tu vi, tối đa mỗi ngày có hạn.</p>
  <p><b>Tân Thủ Thôn:</b> thôn khởi đầu, an toàn, không có yêu thú. Dưới gốc đào tiên có 2 bù nhìn rơm để thử chiêu: số sát thương hiện trên đầu, bù nhìn tự hồi máu khi để yên. Đi sang phải qua vườn đào, lên đồi; mũi tên vàng dưới chân bậc thang đá ở cuối thôn phía đông là lối ra (bản đồ mới sẽ mở sau).</p>
  <p><b>Sắp mở:</b> bản đồ luyện cấp đánh yêu thú và đấu trường tỷ thí. Ở đấu trường, chỉ số được cân bằng (cảnh giới cao chỉ hơn tối đa 10%) và không dùng được đan hồi phục.</p>`;
  panel("Hướng dẫn", d);
});

// ---------------------------------------------------------------- settings (⚙): background music, logging out
$("settingsBtn").addEventListener("click", () => settingsPanel());
function settingsPanel() {
  const wrap = document.createElement("div");
  wrap.className = "setp";
  wrap.innerHTML = `
    <section class="sgroup">
      <h4><img src="/xianxia/ui/ui_xianxia_item_lantern.png" alt="">Âm thanh</h4>
      <div class="srow">
        <div class="slbl"><b>Nhạc nền</b><small class="nowtxt"></small></div>
        <label class="switch" title="Bật / tắt nhạc nền"><input type="checkbox" class="mon"><span></span></label>
      </div>
      <div class="srow vol">
        <div class="slbl"><b>Âm lượng</b></div>
        <span class="vico" aria-hidden="true">🔈</span>
        <input type="range" class="slider" min="0" max="100" step="1" aria-label="Âm lượng nhạc nền">
        <output class="vout"></output>
      </div>
      <div class="nowplay"><span class="disc" aria-hidden="true">♪</span><span class="ttl"></span><span class="mapname"></span></div>
    </section>
    <section class="sgroup">
      <h4><img src="/xianxia/ui/ui_xianxia_item_token.png" alt="">Tài khoản</h4>
      <div class="srow">
        <div class="slbl"><b class="who"></b><small>Đăng xuất khỏi thiết bị này. Nhân vật và đồ vẫn được lưu.</small></div>
        <button type="button" class="primary logout">Đăng xuất</button>
      </div>
    </section>
    <p class="credit">Mỗi bản đồ có nhạc riêng. Nhạc (OpenGameArt): “Liyan”, “Asian Duet” của elerya; “Asian String Suite” của bosslevelvgm (CC-BY 3.0); “Lava Area Theme” của Wolfgang (CC-BY 4.0); “Forgotten Tomb Ambience” của kindland (CC0).</p>`;
  const $$ = (q) => wrap.querySelector(q);
  const on = $$(".mon"), vol = $$(".slider");
  const draw = () => {
    const m = musicState();
    on.checked = m.on;
    vol.value = m.vol;
    vol.style.setProperty("--p", `${m.vol}%`);
    vol.disabled = !m.on;
    $$(".vout").textContent = `${m.vol}%`;
    $$(".vico").textContent = !m.on || m.vol === 0 ? "🔇" : m.vol < 40 ? "🔈" : m.vol < 75 ? "🔉" : "🔊";
    $$(".nowtxt").textContent = m.on ? (m.playing ? "Đang phát" : "Bật: phát khi bạn chạm hoặc bấm phím") : "Đang tắt";
    $$(".ttl").textContent = m.track ? `${m.track.ten}${m.track.tac_gia ? ` · ${m.track.tac_gia}` : ""}` : "Bản đồ này không có nhạc";
    $$(".mapname").textContent = game?.mapName?.() ?? "";
    $$(".nowplay").classList.toggle("on", m.on && m.playing);
    wrap.classList.toggle("muted", !m.on);
  };
  on.addEventListener("change", () => setMusicOn(on.checked));
  vol.addEventListener("input", () => setMusicVolume(Number(vol.value)));
  $$(".who").textContent = state.character?.name ?? "Tài khoản";
  // logging out asks once more on the button itself
  const out = $$(".logout");
  out.addEventListener("click", async () => {
    if (!out.classList.contains("sure")) {
      out.classList.add("sure");
      out.textContent = "Bấm lần nữa để đăng xuất";
      setTimeout(() => out.isConnected && (out.classList.remove("sure"), (out.textContent = "Đăng xuất")), 3000);
      return;
    }
    out.disabled = true;
    try {
      await call("/logout", { method: "POST" });
    } catch {}
    logoutLocal();
  });
  onMusicChange(() => wrap.isConnected && draw());
  // how tall the panel really is (turned on a phone held upright: the width is its height)
  const fit = () => {
    const h = document.body.classList.contains("rotated") ? innerWidth : innerHeight;
    wrap.classList.toggle("short", h < 521);
    wrap.classList.toggle("tiny", h < 400);
  };
  fit();
  addEventListener("resize", fit);
  draw();
  panel("Cài đặt", wrap);
  // the music may start a moment later (the tap that opened this): show it
  setTimeout(() => wrap.isConnected && draw(), 300);
}
$("fsBtn").addEventListener("click", goLandscape);

function logoutLocal() {
  token = "";
  localStorage.removeItem("dvtt.token");
  game?.close();
  location.reload();
}
function alertIn(el, m) {
  let a = el.querySelector(".err");
  if (!a) el.append((a = Object.assign(document.createElement("p"), { className: "err" })));
  a.textContent = m;
}
function flash(m) {
  const t = $("toast");
  t.textContent = m;
  t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2200);
}

// ---------------------------------------------------------------- start
// the game's numbers (realms, pills, arts...) come from the server's database; until they arrive the built-in ones stand
async function refreshConfig() {
  try {
    applyConfig(await (await fetch("/api/config", { cache: "no-store" })).json());
  } catch (e) {
    console.warn("config", e);
  }
}
await refreshConfig();
if (token) {
  // a saved session goes straight in; phones still need one tap to go full screen
  enter().catch(() => show("auth"));
  if (touch) $("fsBtn").classList.add("pulse");
} else show("auth");

// ---------------------------------------------------------------- the character (👤, C): who you are, what you wear, your bag
// Left: the character standing in what they wear, its four equipment slots round it, and their numbers. Right: their
// things, in tabs (all, equipment, items), as a grid of slots a page at a time; picking one shows it below with what can
// be done with it: wear it (anything you own), use it (a pill). Buying happens at the Y Các; wearing happens here.
const KIND_NAME = { hair: "Tóc", robe: "Y phục", weapon: "Vũ khí", sword: "Phi kiếm" };
const ITEM_KIND_NAME = { pill: "Đan dược", book: "Bí kíp", material: "Nguyên liệu" };
const itemIcon = (id) => {
  const it = ITEMS[id];
  // the Gia Viên's goods: eggs, milk and fat in a gourd, herbs as a lingzhi
  const gv = id.startsWith("gv_") ? (/trung|sua|mo_/.test(id) ? "gourd" : "lingzhi") : null;
  const pic = gv ?? (it?.kind === "book" ? "jade_slip" : it?.kind === "material" ? (id === "mat_linhtuy" ? "lingzhi" : "spirit_stone")
    : { hoixuan: "pill_bottle", tukhi: "furnace" }[id] ?? (it?.heal ? "peach" : "gourd"));
  return `/xianxia/ui/ui_xianxia_item_${pic}.png`;
};
$("charBtn").addEventListener("click", () => charPanel());

// ---------------------------------------------------------------- Tông Môn (🏯, T): public/js/tong-mon.js
const sect = initSect({ call, uuid, panel, flash, game: () => game, itemIcon });
$("sectBtn").addEventListener("click", () => sect.open());

// ---------------------------------------------------------------- Gia Viên (🏡): public/js/gia-vien.js
const homeUI = initHomeUI({ call, uuid, panel, flash, game: () => game });
$("homeBtn").addEventListener("click", () => homeUI.open());

// ---------------------------------------------------------------- Đàm Đạo (💬) and Đạo Hữu (🤝, H): public/js/dao-huu.js
const social = initSocial({ call, panel, flash, game: () => game, openSect: () => sect.open() });
$("chatBtn").addEventListener("click", () => social.openChat());
$("friendBtn").addEventListener("click", () => social.openFriends());
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "h" || e.repeat || !game || /input|textarea|select/i.test(document.activeElement?.tagName ?? "")) return;
  if (!$("panel").hidden && $("panel").querySelector(".friendp")) return void ($("panel").hidden = true);
  social.openFriends();
});
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "t" || e.repeat || !game || /input|textarea|select/i.test(document.activeElement?.tagName ?? "")) return;
  if (!$("panel").hidden && $("panel").querySelector(".sectp")) return void ($("panel").hidden = true);
  sect.open();
});
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "c" || e.repeat || !game || /input|textarea/i.test(document.activeElement?.tagName ?? "")) return;
  if (!$("panel").hidden && $("panel").querySelector(".charp")) return void ($("panel").hidden = true);
  charPanel();
});
async function charPanel(startTab = "all") {
  if (!game) return;
  let w, me;
  try {
    [w, me] = await Promise.all([call("/cosmetics"), call("/me")]);
  } catch (err) {
    return flash(err.message);
  }
  if (!me.character) return;
  state.character = me.character;
  const ch = () => state.character, g = ch().look.g, PER = 20;
  let tab = startTab, kind = "", page = 0, sel = null;
  const owned = new Set(w.owned);
  const mine = () => w.items.filter((it) => (it.g === g || it.g === "a") && (it.starter || owned.has(it.id)));
  const wearing = (it) => ch().look[it.kind] === it.idx;
  const bag = () => Object.entries(game.inventory()).filter(([k, n]) => n > 0 && ITEMS[k]).sort((a, b) => (ITEMS[a[0]].sort ?? 0) - (ITEMS[b[0]].sort ?? 0));

  const wrap = document.createElement("div");
  wrap.className = "charp";
  wrap.innerHTML = `
    <section class="cleft">
      <div class="stage">
        <div class="slots l"></div>
        <div class="fig"><canvas width="96" height="104"></canvas><div class="plinth"></div></div>
        <div class="slots r"></div>
      </div>
      <div class="ident"><b class="nm"></b><span class="realm"></span></div>
      <div class="cstats"></div>
    </section>
    <section class="cright">
      <div class="ctabs" role="tablist"></div>
      <div class="cfilter"></div>
      <div class="cgrid"></div>
      <div class="cpager"></div>
      <div class="cdetail"></div>
    </section>`;
  const $$ = (s) => wrap.querySelector(s);

  // ---- left: the figure, its slots, its numbers
  function drawLeft() {
    const m = game.me() ?? {};
    $$(".nm").textContent = ch().name;
    $$(".realm").textContent = realmName(m.lv ?? ch().level ?? levelFromExp(ch().exp));
    for (const [side, kinds] of [["l", ["hair", "robe"]], ["r", ["weapon", "sword"]]]) {
      const box = $$(`.slots.${side}`);
      box.replaceChildren();
      for (const k of kinds) {
        const it = w.items.find((x) => x.kind === k && (x.g === g || x.g === "a") && x.idx === ch().look[k]);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "eslot";
        b.title = `${KIND_NAME[k]}: ${it?.name ?? "—"} (bấm để đổi)`;
        if (it) b.append(partCanvas(k, it.g, it.idx));
        b.append(Object.assign(document.createElement("small"), { textContent: KIND_NAME[k] }));
        b.addEventListener("click", () => ((tab = "equip"), (kind = k), (page = 0), (sel = it ?? null), drawRight()));
        box.append(b);
      }
    }
    // sinh lực on a row of its own with its bar; the rest as tiles, the name over the value, so nothing runs into anything
    const fmtN = (n) => Number(n ?? 0).toLocaleString("vi-VN");
    const hp = document.createElement("div");
    hp.className = "hprow";
    hp.innerHTML = `<img src="/xianxia/ui/ui_xianxia_item_peach.png" alt=""><span>Sinh lực</span><b></b><i><u></u></i>`;
    hp.querySelector("b").textContent = m.maxHp ? `${fmtN(m.hp)} / ${fmtN(m.maxHp)}` : "—";
    hp.querySelector("u").style.width = `${m.maxHp ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0}%`;
    const tiles = [
      ["status_burn", "Công", fmtN(m.atk)], ["status_golden_shield", "Thủ", fmtN(m.def)], ["status_swift", "Tốc độ", fmtN(m.spd)],
      ["item_spirit_stone", "Linh thạch", fmtN(m.stones ?? ch().stones)], ["item_token", "Đấu trường", fmtN(m.rank ?? ch().rank)],
      ["status_bleed", "Hạ / Bại", `${fmtN(m.kills)} / ${fmtN(m.deaths)}`],
    ].map(([ic, l, v]) => {
      const d = document.createElement("div");
      d.className = "tile";
      d.title = `${l}: ${v}`;
      d.innerHTML = `<img src="/xianxia/ui/ui_xianxia_${ic}.png" alt=""><span></span><b></b>`;
      d.querySelector("span").textContent = l;
      d.querySelector("b").textContent = v;
      return d;
    });
    $$(".cstats").replaceChildren(hp, ...tiles);
  }

  // ---- right: tabs, filters, the grid of slots, the pager, the picked thing
  const entries = () => {
    const eq = mine().filter((it) => !kind || it.kind === kind).map((it) => ({ t: "eq", it }))
      .sort((a, b) => wearing(b.it) - wearing(a.it) || "hair robe weapon sword".indexOf(a.it.kind) - "hair robe weapon sword".indexOf(b.it.kind) || a.it.idx - b.it.idx);
    const its = bag().map(([k, n]) => ({ t: "item", k, n }));
    return tab === "equip" ? eq : tab === "items" ? its : [...eq, ...its];
  };
  function drawRight() {
    const tabs = $$(".ctabs");
    tabs.replaceChildren(...[["all", "Tất cả"], ["equip", "Trang bị"], ["items", "Vật phẩm"]].map(([v, l]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = l;
      b.className = v === tab ? "on" : "";
      b.addEventListener("click", () => ((tab = v), (page = 0), (sel = null), tab !== "equip" && (kind = ""), drawRight()));
      return b;
    }));
    const f = $$(".cfilter");
    f.replaceChildren();
    f.hidden = tab !== "equip";
    if (tab === "equip")
      for (const [v, l] of [["", "Tất cả"], ["hair", "Tóc"], ["robe", "Y phục"], ["weapon", "Vũ khí"], ["sword", "Phi kiếm"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = l;
        b.className = v === kind ? "on" : "";
        b.addEventListener("click", () => ((kind = v), (page = 0), (sel = null), drawRight()));
        f.append(b);
      }
    const list = entries(), pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages - 1);
    const grid = $$(".cgrid");
    grid.replaceChildren();
    const shown = list.slice(page * PER, page * PER + PER);
    for (const e of shown) {
      const b = document.createElement("button");
      b.type = "button";
      const on = sel && (e.t === "eq" ? sel.it?.id === e.it.id : sel.k === e.k);
      if (e.t === "eq") {
        b.className = `cell eq${wearing(e.it) ? " worn" : ""}${on ? " on" : ""}`;
        b.title = e.it.name;
        b.append(partCanvas(e.it.kind, e.it.g, e.it.idx));
        if (wearing(e.it)) b.append(Object.assign(document.createElement("i"), { className: "mark", textContent: "✓" }));
        b.append(Object.assign(document.createElement("em"), { className: "kind", textContent: KIND_NAME[e.it.kind] }));
      } else {
        b.className = `cell item k-${ITEMS[e.k].kind}${on ? " on" : ""}`;
        b.title = ITEMS[e.k].name;
        b.append(Object.assign(new Image(), { src: itemIcon(e.k), alt: "" }), Object.assign(document.createElement("i"), { className: "qty", textContent: e.n }));
      }
      b.addEventListener("click", () => ((sel = e), drawRight()));
      grid.append(b);
    }
    // empty slots to the end of the page: the bag keeps its shape
    for (let i = shown.length; i < PER; i++) grid.append(Object.assign(document.createElement("span"), { className: "cell empty" }));
    const pg = $$(".cpager");
    pg.replaceChildren();
    if (pages > 1) {
      const btn = (label, to) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.disabled = to < 0 || to >= pages;
        b.className = to === page && label !== "‹" && label !== "›" ? "on" : "";
        b.addEventListener("click", () => ((page = to), drawRight()));
        return b;
      };
      pg.append(btn("‹", page - 1));
      for (let i = 0; i < pages; i++) pg.append(btn(String(i + 1), i));
      pg.append(btn("›", page + 1));
    }
    pg.append(Object.assign(document.createElement("span"), { className: "count", textContent: `${list.length} món` }));
    drawDetail();
  }
  function drawDetail() {
    const d = $$(".cdetail");
    d.replaceChildren();
    if (!sel) {
      d.innerHTML = `<p class="hint">Chọn một món để xem. Mua thêm tóc, y phục, vũ khí, phi kiếm ở Y Các 👘; đan dược ở Đan Các ⚗.</p>`;
      return;
    }
    const pic = document.createElement("div");
    pic.className = "dpic";
    const txt = document.createElement("div");
    txt.className = "dtxt";
    const act = document.createElement("div");
    act.className = "dact";
    const h = document.createElement("b"), sub = document.createElement("span"), p = document.createElement("p");
    txt.append(h, sub, p);
    if (sel.t === "eq") {
      const it = sel.it;
      pic.append(partCanvas(it.kind, it.g, it.idx));
      h.textContent = it.name;
      sub.textContent = `${KIND_NAME[it.kind]}${it.special ? " · ★ Bảo vật" : it.starter ? " · Miễn phí" : ""}`;
      p.textContent = wearing(it) ? (it.kind === "sword" ? "Đang dùng để ngự kiếm." : "Đang mặc.") : "Đã sở hữu.";
      const b = document.createElement("button");
      b.className = "primary";
      const locked = it.kind === "sword" && !canFly(game.me()?.lv ?? levelFromExp(ch().exp));
      b.textContent = wearing(it) ? (it.kind === "sword" ? "Đang dùng" : "Đang mặc") : it.kind === "sword" ? "Dùng" : "Trang bị";
      b.disabled = wearing(it) || locked;
      if (locked && !wearing(it)) p.textContent = `Tới cảnh giới ${flyRealmName()} mới ngự kiếm phi hành được.`;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          state.character = (await call("/cosmetics/wear", { method: "POST", body: { id: it.id } })).character;
          Object.assign(look2, state.character.look);
          flash(`Đã trang bị ${it.name}.`);
          drawLeft();
          drawRight();
        } catch (err) {
          alertIn(wrap, err.message);
          b.disabled = false;
        }
      });
      act.append(b);
    } else {
      const it = ITEMS[sel.k];
      pic.append(Object.assign(new Image(), { src: itemIcon(sel.k), alt: "" }));
      h.textContent = it.name;
      sub.textContent = `${ITEM_KIND_NAME[it.kind] ?? it.kind} · còn ${game.inventory()[sel.k] ?? 0}`;
      p.textContent = it.desc ?? "";
      if (it.kind === "pill") {
        const b = document.createElement("button");
        b.className = "primary";
        b.textContent = "Dùng";
        b.addEventListener("click", () => {
          game.use(sel.k);
          b.disabled = true;
          setTimeout(() => {
            if (!(game.inventory()[sel.k] > 0)) sel = null;
            drawLeft();
            drawRight();
          }, 700);
        });
        act.append(b);
      } else if (it.kind === "book" || it.kind === "material") {
        const b = document.createElement("button");
        b.textContent = "Công Pháp 📜";
        b.title = "Bí kíp và nguyên liệu dùng để lĩnh ngộ công pháp";
        b.addEventListener("click", () => artsPanel());
        act.append(b);
      }
    }
    d.append(pic, txt, act);
  }

  const look2 = { ...ch().look };
  // how tall the panel really is (the game turned on its side on a phone held upright: the width is its height)
  const fit = () => {
    const h = document.body.classList.contains("rotated") ? innerWidth : innerHeight;
    wrap.classList.toggle("short", h < 521);
    wrap.classList.toggle("tiny", h < 400);
  };
  fit();
  addEventListener("resize", fit);
  drawLeft();
  drawRight();
  panel("Nhân vật", wrap);
  preview($$(".fig canvas"), () => look2, () => !$("panel").hidden && wrap.isConnected, () => false);
}
