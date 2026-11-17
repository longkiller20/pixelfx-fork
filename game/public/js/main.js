// Screens: log in, make a character, play. Plus the shop, the leaderboard and the daily gift.
import { createFrame, clearFrame, composite, painterFor } from "/pixelfx/core/index.js";
import { ITEMS, DAILY_STONES, realmName, applyConfig } from "/shared/balance.js";
import { loadAvatars, drawAvatar, partCanvas } from "./avatar.js";
import { startGame } from "./game.js";

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

// ---------------------------------------------------------------- previews: a character moving on a small canvas
/** Keep drawing look() on canvas cv while alive() holds; anim() picks the move. */
function preview(cv, look, anim, alive) {
  const W = cv.width, H = cv.height, ctx = cv.getContext("2d"), f = createFrame(W, H), img = ctx.createImageData(W, H);
  const step = () => {
    if (!alive()) return;
    const t = performance.now() / 1000, a = anim();
    clearFrame(f);
    const p = painterFor(f);
    // the chosen move, looping: a jump arcs up and back down, a cast swings every second
    const jump = a === "jump" ? Math.max(0, Math.sin(((t % 1.1) / 1.1) * Math.PI)) : 0;
    p.place(W / 2, H - 12 - Math.round(jump * 14), false);
    drawAvatar(p, look(), {
      t, moving: a === "walk", air: a === "jump" && jump > 0.05,
      cast: a === "cast" ? { type: Math.floor(t / 1.2) % 2 ? "bolt" : "melee", age: t % 1.2 } : null,
    });
    composite(f, img.data, null);
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function animButtons(box, set) {
  for (const b of box.querySelectorAll("[data-anim]"))
    b.addEventListener("click", () => {
      set(b.dataset.anim);
      for (const x of box.querySelectorAll("[data-anim]")) x.classList.toggle("on", x === b);
    });
}
/** A grid of part thumbnails: pick(item) on click; badge(item) is an optional corner label (a price, a tick). */
function partGrid(box, items, isOn, pick, badge = () => "") {
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
let anim = "idle", catalog = [];
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
  preview($("pv"), () => look, () => anim, () => !$("create").classList.contains("hidden"));
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
animButtons($("create"), (a) => (anim = a));
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
  game = startGame({
    token, character: state.character, inventory: state.inventory, touch, refreshConfig,
    onFatal: (msg, relog) => {
      game = null;
      $("fatalMsg").textContent = msg;
      $("fatal").hidden = false;
      $("fatalBtn").onclick = () => (relog ? logoutLocal() : location.reload());
    },
  });
}

// the panels
function panel(title, body) {
  $("panelTitle").textContent = title;
  const b = $("panelBody");
  b.innerHTML = "";
  b.append(body);
  $("panel").hidden = false;
}
$("panelClose").addEventListener("click", () => ($("panel").hidden = true));

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
  let kind = "hair", sel = null, wAnim = "idle";
  const has = (it) => it.starter || owned.has(it.id);
  const wearing = (it) => me.character.look[it.kind] === it.idx;

  const wrap = document.createElement("div");
  wrap.className = "ward";
  wrap.innerHTML = `<div class="preview"><canvas width="96" height="96"></canvas>
    <div class="pvbar"><button type="button" data-anim="idle" class="on">Đứng</button><button type="button" data-anim="walk">Đi</button>
    <button type="button" data-anim="jump">Nhảy</button><button type="button" data-anim="cast">Chiêu</button></div>
    <div class="sel"><b class="nm"></b><span class="st dim"></span><button type="button" class="primary act"></button></div></div>
    <div class="choices"><div class="row"><div class="seg"><button type="button" data-k="hair" class="on">Tóc</button>
    <button type="button" data-k="robe">Y phục</button><button type="button" data-k="weapon">Vũ khí</button></div><span class="bal"></span></div><div class="picks big"></div></div>`;
  const $$ = (s) => wrap.querySelector(s);
  const bal = () => ($$(".bal").textContent = `💎 ${me.character.stones} linh thạch`);
  const grid = () => {
    // bảo vật first (only ever there when owned), then free and owned, then the shop from cheapest
    const items = w.items.filter((it) => it.kind === kind && (it.g === g || it.g === "a") && (it.onSale || has(it)));
    items.sort((a, b) => b.special - a.special || has(b) - has(a) || a.price - b.price || a.idx - b.idx);
    partGrid($$(".picks"), items, (it) => sel?.id === it.id, (it) => {
      sel = it;
      trying[it.kind] = it.idx;
      side();
    }, (it) => (wearing(it) ? "✓" : it.special ? "★" : has(it) ? "" : `💎${it.price}`));
  };
  const side = () => {
    const b = $$(".act"), st = $$(".st");
    $$(".nm").textContent = sel?.name ?? "Chọn một món để thử";
    b.hidden = !sel;
    b.disabled = false;
    st.textContent = "";
    if (!sel) return;
    if (wearing(sel)) (st.textContent = "Đang mặc"), (b.hidden = true);
    else if (has(sel)) (st.textContent = sel.special ? "★ Bảo vật" : sel.starter ? "Miễn phí" : "Đã có"), (b.textContent = "Mặc");
    else {
      st.textContent = `${sel.price} linh thạch`;
      b.textContent = me.character.stones >= sel.price ? "Mua và mặc" : "Chưa đủ linh thạch";
      b.disabled = me.character.stones < sel.price;
    }
  };
  $$(".act").addEventListener("click", async () => {
    const it = sel, b = $$(".act");
    if (!it) return;
    if (!has(it) && !confirm(`Mua ${it.name} với giá ${it.price} linh thạch?`)) return;
    b.disabled = true;
    try {
      if (has(it)) me.character = (await call("/cosmetics/wear", { method: "POST", body: { id: it.id } })).character;
      else {
        const out = await call("/cosmetics/buy", { method: "POST", body: { id: it.id, wear: true } });
        me.character = out.character;
        w = { items: out.items, owned: out.owned };
        owned.clear();
        for (const id of out.owned) owned.add(id);
        flash(`Đã mua ${it.name}!`);
      }
      state.character = me.character;
      Object.assign(trying, me.character.look);
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
      grid();
    });
  animButtons(wrap, (a) => (wAnim = a));
  bal();
  grid();
  side();
  panel("Y Các", wrap);
  preview($$("canvas"), () => trying, () => wAnim, () => !$("panel").hidden && wrap.isConnected);
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
  d.innerHTML = `<p><b>Máy tính:</b> A/D hoặc ←/→ để đi, W/↑/Space để nhảy, S + nhảy để xuống khỏi ván gỗ. Chuột để ngắm. J/K/L (hoặc 1/2/3, chuột trái/phải) dùng chiêu. 4: Hồi Xuân Đan, 5: Tụ Khí Đan. Enter để trò chuyện.</p>
  <p><b>Điện thoại:</b> kéo ngón tay trái/phải bên trái màn hình để đi; góc phải là cụm nút kiểu MOBA: nút to ở góc là Kiếm Khí Trảm, vòng quanh là Phi Kiếm, Lôi Ấn Trận và Nhảy (hình hạc), vòng ngoài là 2 đan dược. Giữ nút Nhảy rồi vuốt xuống để rơi xuyên ván gỗ hoặc đài mây; chiêu tự nhắm kẻ địch gần nhất.</p>
  <p><b>Y Các (👘):</b> thử và mua kiểu tóc, y phục mới bằng linh thạch; đồ đã mua mặc lại lúc nào cũng được.</p>
  <p><b>Tu luyện:</b> đứng yên trên Thái Cực Đài (bệ đá dưới đĩa âm dương xoay, trước điện thờ) để tăng tu vi, tối đa mỗi ngày có hạn.</p>
  <p><b>Tân Thủ Thôn:</b> thôn khởi đầu, an toàn, không có yêu thú. Dưới gốc đào tiên có 2 bù nhìn rơm để thử chiêu: số sát thương hiện trên đầu, bù nhìn tự hồi máu khi để yên. Đi sang phải qua vườn đào, lên đồi; mũi tên vàng dưới chân bậc thang đá ở cuối thôn phía đông là lối ra (bản đồ mới sẽ mở sau).</p>
  <p><b>Sắp mở:</b> bản đồ luyện cấp đánh yêu thú và đấu trường tỷ thí. Ở đấu trường, chỉ số được cân bằng (cảnh giới cao chỉ hơn tối đa 10%) và không dùng được đan hồi phục.</p>`;
  panel("Hướng dẫn", d);
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await call("/logout", { method: "POST" });
  } catch {}
  logoutLocal();
});
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
