// Screens: log in, make a character, play. Plus the shop, the leaderboard and the daily gift.
import { createFrame, clearFrame, composite, painterFor } from "/pixelfx/core/index.js";
import { CLASSES, ITEMS, DAILY_STONES, realmName } from "/shared/balance.js";
import { drawCharacter, LOOKS } from "./art.js";
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
  document.body.classList.toggle("rotated", touch && upright && !$("game").classList.contains("hidden"));
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

// ---------------------------------------------------------------- choosing a school
let chosen = "long";
function showCreate() {
  show("create");
  const list = $("classes");
  list.innerHTML = "";
  for (const [id, c] of Object.entries(CLASSES)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `card ${id === chosen ? "on" : ""}`;
    card.dataset.cls = id;
    const cv = document.createElement("canvas");
    cv.width = 120;
    cv.height = 96;
    const h = document.createElement("h3");
    h.textContent = c.name;
    const p = document.createElement("p");
    p.textContent = c.lore;
    const ul = document.createElement("ul");
    for (const s of c.skills) {
      const li = document.createElement("li");
      li.textContent = s.name;
      ul.append(li);
    }
    const st = document.createElement("div");
    st.className = "stats";
    for (const [k, v, max] of [["Sinh lực", c.hp, 1200], ["Công", c.atk, 70], ["Thủ", c.def, 40], ["Tốc", c.spd, 110]]) {
      const row = document.createElement("div");
      row.innerHTML = `<span></span><i><b style="width:${(100 * v) / max}%"></b></i>`;
      row.firstChild.textContent = k;
      st.append(row);
    }
    card.append(cv, h, p, st, ul);
    card.addEventListener("click", () => {
      chosen = id;
      for (const x of list.children) x.classList.toggle("on", x === card);
    });
    list.append(card);
    previews.push({ cv, cls: id });
  }
  requestAnimationFrame(drawPreviews);
}
const previews = [];
function drawPreviews() {
  if ($("create").classList.contains("hidden")) return;
  const t = performance.now() / 1000;
  for (const pv of previews) {
    const ctx = pv.cv.getContext("2d"), f = (pv.f ??= createFrame(120, 96)), img = (pv.img ??= ctx.createImageData(120, 96));
    clearFrame(f);
    const p = painterFor(f);
    // the plain form and, every other few seconds, the transformed one
    const form = Math.floor(t / 2.5) % 2 === 1;
    p.place(60, 92, false);
    p.glow(0, -36, 40, hexToNum(LOOKS[pv.cls].color), form ? 0.35 : 0.12);
    drawCharacter(p, { cls: pv.cls, form, t, moving: false });
    composite(f, img.data, hexToNum("#16121f"));
    ctx.putImageData(img, 0, 0);
  }
  requestAnimationFrame(drawPreviews);
}
const hexToNum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255);
};
$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("createErr").textContent = "";
  try {
    await call("/character", { method: "POST", body: { name: $("charName").value, cls: chosen } });
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
    token, character: state.character, inventory: state.inventory, touch,
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
  for (const [id, it] of Object.entries(ITEMS)) {
    const row = document.createElement("div");
    row.className = "item";
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
    row.append(info, btns);
    wrap.append(row);
  }
  panel("Đan Các", wrap);
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
        li.textContent = `${r.name} (${CLASSES[r.cls]?.name ?? r.cls}, ${realmName(r.level)}): ${r.v} ${unit}`;
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
  d.innerHTML = `<p><b>Máy tính:</b> WASD/mũi tên để đi, chuột để ngắm. J/K/L (hoặc 1/2/3, chuột trái/phải) dùng chiêu. 4: Hồi Xuân Đan, 5: Tụ Khí Đan. Enter để trò chuyện.</p>
  <p><b>Điện thoại:</b> kéo ngón tay bên trái để đi, bấm nút bên phải để ra chiêu: chiêu tự nhắm kẻ địch gần nhất.</p>
  <p><b>Tu luyện:</b> đứng yên trong Linh Mạch (hồ xanh ở Vạn Giới Quảng Trường) để tăng tu vi, tối đa mỗi ngày có hạn.</p>
  <p><b>Luyện Võ Trường:</b> đánh bù nhìn rơm và âm hồn để lấy tu vi, linh thạch.</p>
  <p><b>Đấu Trường:</b> tỷ thí với người chơi khác. Chỉ số được cân bằng (cảnh giới cao chỉ hơn tối đa 10%), không dùng được đan hồi phục, hạ cùng một người liên tục không được thưởng.</p>`;
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
if (token) {
  // a saved session goes straight in; phones still need one tap to go full screen
  enter().catch(() => show("auth"));
  if (touch) $("fsBtn").classList.add("pulse");
} else show("auth");
