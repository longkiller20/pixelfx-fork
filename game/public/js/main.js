// Screens: log in, make a character, play. Plus the shop, the leaderboard and the daily gift.
import { createFrame, clearFrame, composite, painterFor } from "/pixelfx/core/index.js";
import { ITEMS, DAILY_STONES, LOOK, realmName } from "/shared/balance.js";
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

// ---------------------------------------------------------------- making a character: gender, name, hair, robe
const look = { g: "m", hair: 0, robe: 0 };
let anim = "idle";
async function showCreate() {
  show("create");
  await loadAvatars();
  look.hair = rnd(LOOK.hair);
  look.robe = rnd(LOOK.robe);
  fillPicks();
  requestAnimationFrame(drawPreview);
}
const rnd = (n) => Math.floor(Math.random() * n);
function fillPicks() {
  for (const b of document.querySelectorAll("[data-g]")) b.classList.toggle("on", b.dataset.g === look.g);
  for (const [kind, n, box] of [["hair", LOOK.hair, $("hairs")], ["robe", LOOK.robe, $("robes")]]) {
    box.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.title = `${kind === "hair" ? "Tóc" : "Y phục"} ${i + 1}`;
      b.append(partCanvas(kind, look.g, i));
      b.addEventListener("click", () => {
        look[kind] = i;
        markPicks();
      });
      box.append(b);
    }
  }
  markPicks();
}
function markPicks() {
  for (const [kind, box] of [["hair", $("hairs")], ["robe", $("robes")]])
    [...box.children].forEach((b, i) => b.classList.toggle("on", i === look[kind]));
  $("hairNo").textContent = `${look.hair + 1}/${LOOK.hair}`;
  $("robeNo").textContent = `${look.robe + 1}/${LOOK.robe}`;
}
for (const b of document.querySelectorAll("[data-g]"))
  b.addEventListener("click", () => {
    if (look.g === b.dataset.g) return;
    look.g = b.dataset.g;
    fillPicks();
  });
for (const b of document.querySelectorAll("[data-anim]"))
  b.addEventListener("click", () => {
    anim = b.dataset.anim;
    for (const x of document.querySelectorAll("[data-anim]")) x.classList.toggle("on", x === b);
  });
$("randLook").addEventListener("click", () => {
  look.hair = rnd(LOOK.hair);
  look.robe = rnd(LOOK.robe);
  markPicks();
  for (const box of [$("hairs"), $("robes")]) box.querySelector(".on")?.scrollIntoView({ block: "nearest" });
});

let pv = null;
function drawPreview() {
  if ($("create").classList.contains("hidden")) return;
  const cv = $("pv"), W = cv.width, H = cv.height, t = performance.now() / 1000;
  pv ??= { ctx: cv.getContext("2d"), f: createFrame(W, H), img: cv.getContext("2d").createImageData(W, H) };
  clearFrame(pv.f);
  const p = painterFor(pv.f);
  // the chosen move, looping: a jump arcs up and back down, a cast swings every second
  const jump = anim === "jump" ? Math.max(0, Math.sin((t % 1.1) / 1.1 * Math.PI)) : 0;
  p.place(W / 2, H - 12 - Math.round(jump * 14), false);
  drawAvatar(p, look, {
    t, moving: anim === "walk", air: anim === "jump" && jump > 0.05,
    cast: anim === "cast" ? { type: Math.floor(t / 1.2) % 2 ? "bolt" : "melee", age: t % 1.2 } : null,
  });
  composite(pv.f, pv.img.data, null);
  pv.ctx.putImageData(pv.img, 0, 0);
  requestAnimationFrame(drawPreview);
}
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
  <p><b>Điện thoại:</b> kéo ngón tay trái/phải bên trái màn hình để đi (kéo lên để nhảy, kéo xuống + nhảy để xuống ván), nút Nhảy và các nút chiêu bên phải; chiêu tự nhắm kẻ địch gần nhất.</p>
  <p><b>Tu luyện:</b> đứng yên trên Thái Cực Đài (bệ đá dưới đĩa âm dương xoay, trước điện thờ) để tăng tu vi, tối đa mỗi ngày có hạn.</p>
  <p><b>Tân Thủ Thôn:</b> thôn khởi đầu, an toàn, không có yêu thú. Đi sang phải qua chợ, lên đồi; mũi tên vàng dưới chân bậc thang đá ở cuối thôn phía đông là lối ra (bản đồ mới sẽ mở sau).</p>
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
if (token) {
  // a saved session goes straight in; phones still need one tap to go full screen
  enter().catch(() => show("auth"));
  if (touch) $("fsBtn").classList.add("pulse");
} else show("auth");
