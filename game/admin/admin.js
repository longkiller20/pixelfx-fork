// The admin site: log in, change the password, then tabs for everything the game keeps in its database.
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("dvtt.admin") || "";
let tab = location.hash.slice(1) || "overview";

// ---------------------------------------------------------------- talking to the server
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/login") {
    token = "";
    sessionStorage.removeItem("dvtt.admin");
    show("login");
  }
  if (r.status === 403 && data.mustChange) showPw(true);
  if (!r.ok) throw new Error(data.error || "Có lỗi xảy ra.");
  return data;
}

// ---------------------------------------------------------------- small helpers
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
let toastTimer;
function toast(m, ok = true) {
  const t = $("toast");
  t.textContent = m;
  t.className = ok ? "on" : "on bad";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}
const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const when = (d) => (d ? new Date(d).toLocaleString("vi-VN") : "—");
async function guard(fn, okMsg) {
  try {
    const out = await fn();
    if (okMsg) toast(okMsg);
    return out;
  } catch (e) {
    toast(e.message, false);
    return undefined;
  }
}

// ---------------------------------------------------------------- one line per thing; its editor in a modal
// Every list (realms, items, arts, monsters, the wardrobe, settings...) and every part of a player's page shows as a
// single line: name, a few words, its tags. Clicking the line lifts the whole card (its form, its buttons, whatever the
// tab put in it) into a modal over the page; closing puts it back where it was.
let modal = null; // { card, holder } while one is open
function openModal(card) {
  closeModal();
  const holder = document.createComment("modal");
  card.replaceWith(holder);
  card.classList.add("open");
  $("modalBox").replaceChildren(card);
  $("modal").hidden = false;
  document.body.classList.add("noscroll");
  modal = { card, holder };
  card.scrollTop = 0;
  // the first field, on a computer (a phone would pop its keyboard over the sheet)
  if (matchMedia("(pointer: fine)").matches) card.querySelector("input:not([type=checkbox]):not([readonly]), select, textarea")?.focus({ preventScroll: true });
}
function closeModal() {
  if (!modal) return;
  const { card, holder } = modal;
  modal = null;
  card.classList.remove("open");
  if (holder.isConnected) holder.replaceWith(card);
  else card.remove();
  $("modal").hidden = true;
  document.body.classList.remove("noscroll");
}
$("modal").addEventListener("click", (e) => e.target === $("modal") && closeModal());
addEventListener("keydown", (e) => e.key === "Escape" && modal && closeModal());
/**
 * Make `card` a one-line row: `.sum` shows title, sub and extra (tags, small buttons); a click on it (not on a button
 * in it) opens the card in the modal. key: names the card so a page that redraws itself can open it again.
 */
function collapsible(card, { title, sub, extra, key, isNew = false }) {
  card.classList.add("rec");
  if (key) card.dataset.mkey = key;
  const sum = el("div", { class: "sum" }, el("b", {}, title ?? ""), sub ? el("span", { class: "dim" }, sub) : null, el("span", { class: "grow" }), extra ?? null,
    el("span", { class: "chev", "aria-hidden": "true" }, isNew ? "+" : "›"),
    el("button", { type: "button", class: "x ghost small", title: "Đóng", onclick: (e) => (e.stopPropagation(), closeModal()) }, "✕"));
  sum.addEventListener("click", (e) => {
    if (card.classList.contains("open") || e.target.closest("button, select, input, a")) return;
    openModal(card);
  });
  card.prepend(sum);
  return card;
}
/** Sub-tabs inside a card: [[label, () => content]]; a tab's content is made the first time it is shown. */
function tabs(list) {
  const bar = el("div", { class: "tabs", role: "tablist" }), body = el("div", { class: "tabbody" }), made = new Map();
  const show = (i) => {
    [...bar.children].forEach((b, j) => (b.classList.toggle("on", i === j), b.setAttribute("aria-selected", String(i === j))));
    if (!made.has(i)) made.set(i, el("div", { class: "tabpane" }, list[i][1]()));
    body.replaceChildren(made.get(i));
  };
  list.forEach(([label], i) => bar.append(el("button", { type: "button", role: "tab", onclick: () => show(i) }, label)));
  show(0);
  return [bar, body];
}
/** A part of a page as one row opening its contents in the modal (e.g. a player's buffs). */
const section = (title, sub, ...content) => collapsible(el("div", { class: "card" }, ...content), { title, sub, key: title.replace(/\s*\(.*\)\s*$/, "") });

/**
 * One editable record as a card. fields: [{ k, label, type: text|number|bool|select|textarea, options: [[v, label]], step,
 * hint, wide, readonly }]. onSave(changes) gets only what changed; onDelete optional. Returns the card.
 */
function record({ title, sub, fields, row = {}, onSave, onDelete, extra, isNew = false, saveLabel }) {
  const card = el("form", { class: `card${isNew ? " new" : ""}` });
  const inputs = {};
  const box = el("div", { class: "fields" });
  for (const f of fields) {
    let input;
    const v = row[f.k];
    if (f.type === "bool") input = el("input", { type: "checkbox", checked: !!v && v !== "0" });
    else if (f.type === "select") {
      input = el("select", {}, f.options.map(([ov, ol]) => el("option", { value: ov, selected: String(ov) === String(v) }, ol)));
    } else if (f.type === "textarea") input = el("textarea", {}, v ?? "");
    else input = el("input", { type: f.type === "number" ? "number" : "text", step: f.step ?? (f.type === "number" ? "any" : undefined), value: v ?? "", readonly: f.readonly, inputmode: f.type === "number" ? "decimal" : undefined });
    inputs[f.k] = input;
    input.addEventListener("input", () => card.classList.toggle("dirty", Object.keys(changes()).length > 0));
    input.addEventListener("change", () => card.classList.toggle("dirty", Object.keys(changes()).length > 0));
    box.append(el("label", { class: `${f.type === "bool" ? "check" : ""} ${f.wide ? "wide" : ""}` }, f.type === "bool" ? [input, f.label] : [f.label, input, f.hint ? el("span", { class: "hint" }, f.hint) : null]));
  }
  const read = (f) => {
    const i = inputs[f.k];
    if (f.type === "bool") return i.checked;
    if (f.type === "number") return i.value === "" ? "" : Number(i.value);
    return i.value;
  };
  function changes() {
    const out = {};
    for (const f of fields) {
      if (f.readonly) continue;
      const now = read(f), was = row[f.k];
      const same = f.type === "bool" ? now === (!!was && was !== "0") : String(now) === String(was ?? "");
      if (isNew || !same) out[f.k] = now;
    }
    return out;
  }
  const save = el("button", { class: "primary small", type: "submit" }, saveLabel ?? (isNew ? "Thêm" : "Lưu"));
  const actions = el("div", { class: "actions" }, onDelete ? el("button", { type: "button", class: "danger small", onclick: () => onDelete() }, "Xóa") : null, save);
  card.append(box, actions);
  collapsible(card, { title, sub, extra, isNew });
  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = changes();
    if (!Object.keys(c).length) return toast("Chưa có thay đổi.");
    save.disabled = true;
    try {
      await onSave(c);
    } finally {
      save.disabled = false;
    }
  });
  return card;
}

// ---------------------------------------------------------------- thumbnails of the parts
// the characters (shared/nhan-vat.js: whole rigged figures, drawn by /hieu-ung/fx/nhanvat/<key>.js) and the flying swords
// (public/phi-kiem/<idx>-<name>/hinh.png). The server lists them at /assets.json.
let atlas = null;
const KIND_LABEL = { skin: "Nhân vật", sword: "Phi kiếm" };
async function loadAtlas() {
  const a = await fetch("/assets.json", { cache: "no-store" }).then((r) => r.json());
  atlas = { parts: a.parts, skins: a.skins ?? [] };
  return atlas;
}
const skinOf = (idx) => atlas?.skins.find((s) => s.idx === idx);
/** The idx numbers there are for a kind ("skin", or "sword_a"), in order. */
const partIdx = (key) => (key === "skin" ? (atlas?.skins ?? []).map((s) => s.idx) : Object.keys(atlas?.parts[key] ?? {}).map(Number)).sort((a, b) => a - b);
/** A character standing still, drawn by its own figure and the rig, scaled up pixel for pixel into a 64 x 64 canvas. */
async function skinThumb(c, idx) {
  const s = skinOf(idx);
  if (!s) return;
  const [{ FIGURE }, rig] = await Promise.all([import(`/hieu-ung/fx/${s.fx}.js`), import("/hieu-ung/fx/nhanvat/_rig.js")]);
  const pts = [];
  rig.drawFigure({ px: (x, y, col) => pts.push([x, y, col]) }, FIGURE, rig.poseOf({ t: 1 }));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1, k = Math.max(1, Math.floor(Math.min(64 / w, 64 / h)));
  const g = c.getContext("2d"), ox = Math.floor((64 - w * k) / 2), oy = Math.floor((64 - h * k) / 2);
  for (const [x, y, col] of pts) {
    g.fillStyle = `rgb(${col & 255},${(col >>> 8) & 255},${(col >>> 16) & 255})`;
    g.fillRect(ox + (x - x0) * k, oy + (y - y0) * k, k, k);
  }
}
function thumb(kind, g, idx, cls = "thumb") {
  const c = el("canvas", { class: cls, width: 64, height: 64 });
  if (kind === "skin") return skinThumb(c, idx).catch(() => {}), c;
  const src = atlas?.parts[`${kind}_${g}`]?.[idx] ? `/${atlas.parts[`${kind}_${g}`][idx].dir}/hinh.png` : null;
  if (!src) return c;
  const img = new Image();
  img.onload = () => {
    // cut to what the picture covers (the fashion items are small in a 45 x 48 frame), then scale it up pixel for pixel
    const t = document.createElement("canvas");
    t.width = img.width;
    t.height = img.height;
    const tg = t.getContext("2d");
    tg.drawImage(img, 0, 0);
    const d = tg.getImageData(0, 0, img.width, img.height).data;
    let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 100) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    if (x1 < 0) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.min(60 / w, 60 / h), g2 = c.getContext("2d");
    g2.imageSmoothingEnabled = false;
    g2.drawImage(img, x0, y0, w, h, (64 - w * s) / 2, (64 - h * s) / 2, w * s, h * s);
  };
  img.src = src;
  return c;
}

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ["login", "pw", "app"]) $(s).hidden = s !== id;
}
function showPw(forced) {
  show("pw");
  $("pwNote").hidden = !forced;
  $("pwCancel").hidden = forced;
  $("pwErr").textContent = "";
  $("pwForm").reset();
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lErr").textContent = "";
  try {
    const out = await api("/login", { method: "POST", body: { username: $("lUser").value.trim(), password: $("lPass").value } });
    token = out.token;
    sessionStorage.setItem("dvtt.admin", token);
    $("lPass").value = "";
    if (out.mustChange) showPw(true);
    else start(out.username);
  } catch (err) {
    $("lErr").textContent = err.message;
  }
});
$("pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("pwErr").textContent = "";
  if ($("pwNew").value !== $("pwNew2").value) return ($("pwErr").textContent = "Hai lần nhập mật khẩu mới không khớp.");
  try {
    await api("/me/password", { method: "POST", body: { old: $("pwOld").value, password: $("pwNew").value } });
    toast("Đã đổi mật khẩu.");
    const me = await api("/me");
    start(me.username);
  } catch (err) {
    $("pwErr").textContent = err.message;
  }
});
$("pwCancel").addEventListener("click", () => show("app"));
$("myPw").addEventListener("click", () => showPw(false));
$("logout").addEventListener("click", async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  token = "";
  sessionStorage.removeItem("dvtt.admin");
  show("login");
});
for (const b of document.querySelectorAll("[data-tab]")) b.addEventListener("click", () => go(b.dataset.tab));
addEventListener("hashchange", () => {
  const t = location.hash.slice(1);
  if (t && t !== tab && VIEWS[t]) go(t);
});

function start(username) {
  $("who").textContent = username;
  show("app");
  go(tab);
}
async function go(t) {
  // the same tab drawn again after an edit: the card that was open in the modal opens again
  const reopen = t === tab ? modal?.card.dataset.mkey : null;
  closeModal();
  if (!VIEWS[t]) t = "overview";
  tab = t;
  if (location.hash.slice(1) !== t) history.replaceState(null, "", `#${t}`);
  for (const b of document.querySelectorAll("[data-tab]")) b.classList.toggle("on", b.dataset.tab === t);
  document.querySelector(`[data-tab="${t}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  const main = $("main");
  main.replaceChildren(el("p", { class: "dim" }, "Đang tải..."));
  try {
    const view = await VIEWS[t]();
    if (tab === t) main.replaceChildren(...[view].flat());
    const again = reopen && main.querySelector(`[data-mkey="${CSS.escape(reopen)}"]`);
    if (again) openModal(again);
  } catch (e) {
    main.replaceChildren(el("p", { class: "err" }, e.message));
  }
}
const reload = () => go(tab);

// ---------------------------------------------------------------- the tabs
const SKILL_PARAMS = { melee: ["range", "arc"], bolt: ["range", "speed", "r"], zone: ["dist", "r", "delay", "slow", "slowDur"] };
const PARAM_LABEL = { range: "Tầm (px)", arc: "Góc chém (radian)", speed: "Tốc độ bay (px/giây)", r: "Bán kính (px)", dist: "Khoảng cách (px)", delay: "Trễ trước khi nổ (giây)", slow: "Làm chậm (0-1)", slowDur: "Thời gian chậm (giây)" };
const SKILL_TYPE = [["melee", "Cận chiến"], ["bolt", "Phóng (đạn bay)"], ["zone", "Trận pháp (vùng)"]];

// công pháp
const ELEMENTS = [["kim", "Kim"], ["hoa", "Hỏa"], ["thuy", "Thủy"], ["bang", "Băng"], ["loi", "Lôi"], ["moc", "Mộc"], ["tho", "Thổ"], ["quang", "Quang"], ["am", "Ám"], ["huyen", "Huyền"], ["phong", "Phong"], ["di", "Dị Giới"], ["bao", "Bạo"], ["thu", "Ngự Thú"]];
const MON_STYLE = [["melee", "Đánh gần (lao tới)"], ["ranged", "Đánh xa (bắn)"], ["none", "Đứng yên (bù nhìn)"]];
const ITEM_KIND = [["pill", "Đan dược (dùng được)"], ["book", "Bí kíp"], ["material", "Nguyên liệu"], ["rod", "Cần câu (giá: Ngư Cụ bán)"], ["bait", "Mồi câu (giá: Ngư Cụ bán)"], ["fish", "Cá (giá: Ngư Cụ mua)"], ["gift", "Quà tặng (Hoa Hồng)"], ["ring", "Nhẫn cưới (giá một đôi)"]];
/**
 * A long list 10 at a time, with page buttons under it. key: the filters the list was made with; the page is remembered
 * for the same tab and filters, so saving something on page 4 brings you back to page 4, while a new search starts at 1.
 * render(item, i) gets the item's place in `list`. Returns [the items, the pager].
 */
const pageMem = new Map();
function paged(list, render, key = "", n = 10) {
  const box = el("div", { class: "grid" }), nav = el("div", { class: "pager" });
  const pages = Math.max(1, Math.ceil(list.length / n)), mem = `${tab}|${key}`;
  const show = (k, scroll = false) => {
    const page = Math.max(0, Math.min(pages - 1, k));
    pageMem.set(mem, page);
    box.replaceChildren(...(list.length ? list.slice(page * n, page * n + n).map((r, j) => render(r, page * n + j)) : [el("p", { class: "dim" }, "Không có kết quả.")]));
    // first, last, and two either side of the current page; gaps shown as …; one page: just the count
    const count = el("span", { class: "dim count" }, `${list.length} mục`);
    if (pages <= 1) return void nav.replaceChildren(count);
    const btn = (label, to, { on = false, off = false } = {}) => el("button", { type: "button", class: `small${on ? " on" : ""}`, disabled: off || undefined, onclick: () => show(to, true) }, label);
    const nums = [...new Set([0, pages - 1, page - 2, page - 1, page, page + 1, page + 2])].filter((x) => x >= 0 && x < pages).sort((a, b) => a - b);
    const kids = [btn("‹", page - 1, { off: page === 0 })];
    nums.forEach((x, i) => {
      if (i && x - nums[i - 1] > 1) kids.push(el("span", { class: "dim" }, "…"));
      kids.push(btn(String(x + 1), x, { on: x === page }));
    });
    kids.push(btn("›", page + 1, { off: page === pages - 1 }), count);
    nav.replaceChildren(...kids);
    if (scroll) box.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  show(pageMem.get(mem) ?? 0);
  return [box, nav];
}
/** A search box that calls draw() as you type (a moment after the last key). */
function searchBox(placeholder, draw) {
  const q = el("input", { type: "search", placeholder });
  let t;
  q.addEventListener("input", () => (clearTimeout(t), (t = setTimeout(draw, 200))));
  return q;
}
const has = (t, ...texts) => !t || texts.some((x) => String(x ?? "").toLowerCase().includes(t));
const itemOptions = (items) => items.map((i) => [i.item_key, `${i.name} (${i.item_key})`]);

const VIEWS = {
  async overview() {
    const [o, log] = await Promise.all([api("/overview"), api("/log")]);
    const stat = (v, l) => el("div", { class: "stat" }, el("b", {}, fmt(v)), el("span", {}, l));
    return [
      el("h2", {}, "Tổng quan"),
      el("div", { class: "stats" },
        stat(o.online, "Đang online"), stat(o.users, "Tài khoản"), stat(o.characters, "Nhân vật"), stat(o.newToday, "Đăng ký hôm nay"),
        stat(o.dailyToday, "Nhận quà hôm nay"), stat(o.stones, "Linh thạch đang lưu hành"), stat(o.spentToday, "Linh thạch tiêu ở Đan Các hôm nay"),
        stat(o.cosmeticsToday, "Linh thạch tiêu ở Y Các hôm nay"), stat(o.banned, "Tài khoản bị khóa")),
      el("div", { class: "card" }, el("h3", {}, "Tu vi cao nhất"),
        el("table", { class: "simple" }, el("tr", {}, el("th", {}, "Đạo hiệu"), el("th", {}, "Cảnh giới"), el("th", {}, "Linh thạch")),
          o.top.map((t) => el("tr", {}, el("td", {}, t.name), el("td", {}, t.realm), el("td", {}, fmt(t.stones)))))),
      el("h2", {}, "Thao tác admin gần đây"),
      el("div", { class: "list" }, log.slice(0, 8).map(logItem)),
    ];
  },

  async players() {
    const wrap = el("div");
    const q = el("input", { placeholder: "Tìm tên đăng nhập hoặc đạo hiệu...", type: "search" });
    const sort = el("select", {}, [["new", "Mới đăng ký"], ["exp", "Tu vi cao"], ["stones", "Nhiều linh thạch"], ["rank", "Điểm đấu trường"]].map(([v, l]) => el("option", { value: v }, l)));
    const filter = el("select", {}, [["", "Tất cả"], ["online", "Đang online"], ["banned", "Bị khóa"]].map(([v, l]) => el("option", { value: v }, l)));
    const list = el("div", { class: "list" });
    const load = async () => {
      const rows = await guard(() => api(`/players?q=${encodeURIComponent(q.value.trim())}&sort=${sort.value}&filter=${filter.value}`));
      if (!rows) return;
      list.replaceChildren(...paged(rows, (p) => el("div", { class: "row", onclick: () => playerView(p.id) },
        el("span", { class: `dot ${p.online ? "on" : ""}`, title: p.online ? "Đang online" : "Offline" }),
        el("div", { class: "main" }, el("b", {}, p.name ?? "(chưa tạo nhân vật)"), el("small", {}, `@${p.username} · id ${p.id}`)),
        el("div", { class: "nums" }, p.realm ? el("span", {}, p.realm) : null, p.stones !== null ? el("span", {}, `💎 ${fmt(p.stones)}`) : null,
          p.banned ? el("span", { class: "tag red" }, "Bị khóa") : null)), `${q.value.trim()}|${sort.value}|${filter.value}`));
    };
    let t;
    q.addEventListener("input", () => (clearTimeout(t), (t = setTimeout(load, 300))));
    sort.addEventListener("change", load);
    filter.addEventListener("change", load);
    wrap.append(el("h2", {}, "Người chơi"), el("div", { class: "bar" }, q, filter, sort), list);
    await load();
    return wrap;
  },

  // the ready-made houses of the Gia Viên: designed in code, named and priced here
  async houses() {
    const rows = await api("/t/houses");
    const pics = { gamer: "/gia-vien/nha/gamer.png", tien_phu: "/gia-vien/nha/tien_phu.png" };
    const out = el("div");
    out.append(el("h2", {}, "Nhà Ở (Gia Viên)"),
      el("p", { class: "dim" }, "Các kiểu nhà làm sẵn được thiết kế trong code (shared/gia-vien.js). Ở đây đổi tên, giá và thứ tự hiện trong bảng Nhà Ở của người chơi. Giá 0: không bán, chỉ admin tặng (ở trang người chơi, mục Gia Viên). Nhà mặc định luôn tặng kèm khi mở khoá Gia Viên, giá không dùng. Lưu là có hiệu lực ngay."));
    for (const r of rows) {
      const isDefault = r.house_key === "co_trach";
      out.append(record({
        title: r.name, sub: `${r.house_key}${isDefault ? " · nhà mặc định" : r.price ? ` · ${fmt(r.price)} linh thạch` : " · không bán"}`, row: r,
        extra: pics[r.house_key] ? el("img", { src: pics[r.house_key], alt: r.name, style: "height:44px;image-rendering:pixelated;vertical-align:middle" }) : null,
        fields: [{ k: "name", label: "Tên nhà" }, ...(isDefault ? [] : [{ k: "price", label: "Giá (linh thạch, 0 = không bán)", type: "number", step: 1 }]), { k: "sort", label: "Thứ tự (nhỏ hiện trước)", type: "number", step: 1 }],
        onSave: async (c) => (await guard(() => api(`/t/houses/${r.house_key}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
      }));
    }
    return out;
  },

  // Câu Cá: rods and baits (name, price the Ngư Cụ asks), every catch (name, price the Ngư Cụ pays, how often it bites)
  async fishing() {
    const d = await api("/fishing"), out = el("div");
    const pct = (p) => (p === undefined ? "0%" : p >= 0.1 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`);
    const saveItem = (k) => async (c) => (await guard(() => api(`/t/items/${k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload();
    out.append(el("h2", {}, "Câu Cá"),
      el("p", { class: "dim" }, "Cần, mồi, cá được thiết kế trong code (shared/cau-ca.js): chỉ số cần, mồi và cân nặng cá cố định. Ở đây đổi tên, giá và tỉ lệ cá cắn câu. Lưu là có hiệu lực ngay cho mọi người chơi. Giá 0: cần/mồi không bán, cá Ngư Cụ không mua."),
      el("h3", {}, "Cần câu"), el("p", { class: "dim" }, "Mua một lần, giữ mãi. Giá là giá Ngư Cụ bán."));
    for (const r of d.rods)
      out.append(record({ title: r.name, sub: `${r.key} · bậc ${r.tier} · vùng kéo ${Math.round(r.bar * 100)}% · lực ×${r.power} · may mắn +${Math.round(r.luck * 100)}% · ${r.price ? fmt(r.price) + " linh thạch" : "không bán"}`, row: r,
        fields: [{ k: "name", label: "Tên cần" }, { k: "price", label: "Giá bán (linh thạch, 0 = không bán)", type: "number", step: 1 }], onSave: saveItem(r.key) }));
    out.append(el("h3", {}, "Mồi câu"), el("p", { class: "dim" }, "Mất một viên mỗi lần cá cắn. Giá là giá một viên."));
    for (const b of d.baits)
      out.append(record({ title: b.name, sub: `${b.key} · bậc ${b.tier} · cá cắn nhanh ×${b.speed} · may mắn +${Math.round(b.luck * 100)}% · ${b.price ? fmt(b.price) + "/viên" : "không bán"}`, row: b,
        fields: [{ k: "name", label: "Tên mồi" }, { k: "price", label: "Giá một viên (0 = không bán)", type: "number", step: 1 }], onSave: saveItem(b.key) }));
    out.append(el("h3", {}, "Cá và vật câu được"),
      el("p", { class: "dim" }, "Tỉ lệ là trọng số: cơ hội của một loại = tỉ lệ của nó / tổng tỉ lệ (rồi chỉnh theo may mắn của cần và mồi: tạp vật ít đi, cá quý dễ hơn; cá Tiên chỉ cắn mồi bậc 3 trở lên). Tỉ lệ 0: không bao giờ câu được. Ba cột % bên dưới là cơ hội thật: không tính cần mồi, Trúc Can + Giun Đất, Kim Long Can + Tiên Đào Nhị."));
    const tbl = el("table", { class: "ftbl" }, el("tr", {}, ...["Loại", "Bậc", "Tỉ lệ", "Gốc", "Cần mồi rẻ nhất", "Cần mồi tốt nhất"].map((t) => el("th", {}, t))),
      ...d.fish.map((f) => el("tr", {}, el("td", {}, f.name), el("td", { style: `color:${f.color}` }, f.rarityName), el("td", {}, String(f.rate)),
        el("td", {}, pct(d.odds.bare[f.key])), el("td", {}, pct(d.odds.low[f.key])), el("td", {}, pct(d.odds.high[f.key])))));
    out.append(el("div", { class: "fwrap" }, tbl));
    for (const f of d.fish) {
      const saveRate = async (c) => {
        const { rate, stones_min, stones_max, ...rest } = c, fr = Object.fromEntries(Object.entries({ rate, stones_min, stones_max }).filter(([, v]) => v !== undefined));
        if (Object.keys(rest).length && f.item && !(await guard(() => api(`/t/items/${f.key}`, { method: "PATCH", body: rest }), "Đã lưu."))) return;
        if (Object.keys(fr).length && !(await guard(() => api(`/t/fish_rates/${f.key}`, { method: "PATCH", body: fr }), "Đã lưu tỉ lệ."))) return;
        reload();
      };
      out.append(record({
        title: f.name, sub: `${f.key} · [${f.rarityName}] · ${f.kg[0]}-${f.kg[1]} cân · ${f.stones ? `rương: mở ra ${f.stones[0]}-${f.stones[1]} linh thạch` : f.price ? `Ngư Cụ mua ${fmt(f.price)}` : "Ngư Cụ không mua"} · cơ hội gốc ${pct(d.odds.bare[f.key])}`,
        row: f,
        fields: [...(f.item ? [{ k: "name", label: "Tên" }] : []),
          ...(f.stones ? [{ k: "stones_min", label: "Mở ra được ít nhất (linh thạch)", type: "number", step: 1 }, { k: "stones_max", label: "Nhiều nhất (linh thạch)", type: "number", step: 1 }]
            : f.item ? [{ k: "price", label: "Giá Ngư Cụ mua (0 = không mua)", type: "number", step: 1 }] : []),
          { k: "rate", label: "Tỉ lệ cắn câu (trọng số, 0 = không bao giờ)", type: "number", step: "any" }],
        onSave: saveRate,
      }));
    }
    return out;
  },

  // Đạo Lữ: the rose (name, price), the three wedding rings (name, price, buff %), the rules (settings daolu.*), every
  // couple now (parting one), and a pair's affinity set by hand
  async daolu() {
    const d = await api("/daolu"), out = el("div");
    const saveItem = (k) => async (c) => (await guard(() => api(`/t/items/${k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload();
    const R = d.rules;
    out.append(el("h2", {}, "Đạo Lữ"),
      el("p", { class: "dim" }, `Tặng Hoa Hồng cho Đạo Hữu khác giới để tăng hảo cảm; đủ ${R.need}/${R.need} thì cầu hôn được, chọn một trong ba nhẫn cưới. Khi được đồng ý, người cầu hôn trả giá nhẫn, cả hai đeo nhẫn và nhận buff vĩnh viễn (ngoài đấu trường) khi còn là Đạo Lữ. Ly hôn: mất nhẫn và buff, hảo cảm về 0. Lưu là có hiệu lực ngay (buff của các cặp đang có đổi theo luôn).`),
      el("h3", {}, "Hoa Hồng"));
    out.append(record({ title: d.rose.name, sub: `${d.rose.key} · ${d.rose.price ? fmt(d.rose.price) + " linh thạch/bông" : "không bán"} · mỗi bông +${R.rosePoints} hảo cảm`, row: d.rose,
      fields: [{ k: "name", label: "Tên" }, { k: "price", label: "Giá một bông (0 = không bán)", type: "number", step: 1 }], onSave: saveItem(d.rose.key) }));
    out.append(el("h3", {}, "Nhẫn cưới"), el("p", { class: "dim" }, "Giá là giá một đôi, người cầu hôn trả khi được đồng ý. Buff tính theo % (0-100) sinh lực, công, thủ, tốc độ cho cả hai người."));
    for (const r of d.rings) {
      const save = async (c) => {
        const { hp, atk, def, spd, ...rest } = c, b = Object.fromEntries(Object.entries({ hp, atk, def, spd }).filter(([, v]) => v !== undefined));
        if (Object.keys(rest).length && !(await guard(() => api(`/t/items/${r.key}`, { method: "PATCH", body: rest }), "Đã lưu."))) return;
        if (Object.keys(b).length && !(await guard(() => api(`/t/ring_buffs/${r.key}`, { method: "PATCH", body: b }), "Đã lưu buff."))) return;
        reload();
      };
      out.append(record({
        title: r.name, sub: `${r.key} · bậc ${r.tier} · ${r.price ? fmt(r.price) + " linh thạch" : "không bán"} · +${r.buff.hp}% sinh lực · +${r.buff.atk}% công · +${r.buff.def}% thủ · +${r.buff.spd}% tốc độ`,
        row: { name: r.name, price: r.price, ...r.buff },
        fields: [{ k: "name", label: "Tên nhẫn" }, { k: "price", label: "Giá một đôi (0 = không bán)", type: "number", step: 1 },
          { k: "hp", label: "+% Sinh lực", type: "number", step: "any" }, { k: "atk", label: "+% Công", type: "number", step: "any" },
          { k: "def", label: "+% Thủ", type: "number", step: "any" }, { k: "spd", label: "+% Tốc độ", type: "number", step: "any" }],
        onSave: save,
      }));
    }
    out.append(el("h3", {}, "Luật"), el("p", { class: "dim" }, "Các số này cũng có ở tab Cài đặt (daolu.*)."));
    const rule = (k, label, v) => record({ title: label, sub: `${k} = ${v}`, row: { v }, fields: [{ k: "v", label: "Giá trị", type: "number", step: "any" }],
      onSave: async (c) => (await guard(() => api(`/t/settings/${k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload() });
    out.append(rule("daolu.rose_points", "Hảo cảm mỗi bông", R.rosePoints), rule("daolu.rose_daily", "Số bông tối đa một người tặng một người mỗi ngày", R.roseDaily),
      rule("daolu.rose_buy_max", "Mỗi lần mua tối đa (bông)", R.roseBuyMax), rule("daolu.propose_hours", "Lời cầu hôn hết hạn sau (giờ)", R.proposeHours),
      rule("daolu.remarry_hours", "Ly hôn xong chờ (giờ) mới kết lại được", R.remarryHours));
    out.append(el("h3", {}, `Các cặp Đạo Lữ (${d.now.length}) · đã ly hôn ${fmt(d.divorced)} lần`));
    const tbl = el("table", { class: "ftbl" }, el("tr", {}, ...["Đạo Lữ", "Nhẫn", "Người trả", "Từ ngày", ""].map((t) => el("th", {}, t))),
      ...d.now.map((m) => el("tr", {}, el("td", {}, `${m.a_name} ♥ ${m.b_name}`), el("td", {}, `${m.ringName} (${fmt(m.price)})`), el("td", {}, m.payer), el("td", {}, when(m.created_at)),
        el("td", {}, el("button", { class: "small danger", onclick: async () => confirm(`Giải trừ Đạo Lữ ${m.a_name} và ${m.b_name}? Cả hai mất nhẫn và buff.`) &&
          (await guard(() => api("/daolu/divorce", { method: "POST", body: { uid: m.a_id } }), "Đã giải trừ.")) && reload() }, "Giải trừ")))));
    out.append(d.now.length ? el("div", { class: "fwrap" }, tbl) : el("p", { class: "dim" }, "Chưa có cặp nào."));
    out.append(el("h3", {}, "Đặt hảo cảm cho một cặp"));
    const a = el("input", { placeholder: "ID người thứ nhất", type: "number" }), b = el("input", { placeholder: "ID người thứ hai", type: "number" }), pts = el("input", { placeholder: `Hảo cảm 0-${R.need}`, type: "number" });
    out.append(el("div", { class: "bar" }, a, b, pts, el("button", { class: "small", onclick: async () => (await guard(() => api("/daolu/affinity", { method: "POST", body: { a: Number(a.value), b: Number(b.value), points: Number(pts.value) } }), "Đã đặt hảo cảm.")) && reload() }, "Đặt")));
    return out;
  },

  // Chính Tà Phân Tranh: the battle on now (its board, the buttons to end or cancel it), the next battle and who signed up,
  // a button to start it now, the rules (settings chinhta.*), the record of battles (each one's fighters), the Tiệm Chính
  // Tà (items sold for điểm Chính Tà), and a player's points or side set by hand
  async boss() {
    const d = await api("/boss"), out = el("div"), at = (v) => (v ? new Date(v).toLocaleString("vi-VN") : "");
    const STATE = { alive: "đang ở ngoài", dying: "đang chia thưởng", dead: "đã bị hạ", gone: "đã rời / thu hồi" };
    out.append(el("h2", {}, "Boss Thế Giới"),
      el("p", { class: "dim" }, "Gọi boss ra một map có yêu thú. Boss có mặt ở mọi khu (30 khu) của map đó, chung một thanh máu: ai đánh ở khu nào cũng trừ vào cùng một thanh. Boss cho bảy đầu rắn mổ người trước mặt, cứ boss.roar_every giây lại gầm phản kích đánh mọi người chơi trên map ở mọi khu (boss.roar_pct % máu), và mỗi đòn đánh vào nó dội lại boss.thorns_pct % sát thương lên người đánh. Khi boss tử trận, tổng linh thạch và tu vi chia theo sát thương của từng người; người kết liễu được thêm % thưởng. Hết thời gian mà chưa bị hạ thì boss rời đi, không ai được thưởng. Chỉ một boss một lúc."));
    // the boss up now
    out.append(el("h3", {}, "Boss đang ở ngoài"));
    if (d.now) {
      const n = d.now, pct = ((n.hp / n.max) * 100).toFixed(1);
      out.append(el("div", { class: "card" },
        el("p", {}, el("b", {}, `👹 ${n.name}`), ` tại ${n.mapName} · ${STATE[n.state] ?? n.state}`),
        el("p", {}, `Máu: ${fmt(n.hp)} / ${fmt(n.max)} (${pct}%) · ${n.fighters} người đã đánh · còn ${Math.floor(n.left / 60)} phút ${n.left % 60} giây · phản kích sau ${n.roarIn} giây`),
        el("p", {}, `Thưởng: ${fmt(n.stones)} linh thạch, ${fmt(n.exp)} tu vi chia theo sát thương; người kết liễu thêm ${n.killBonus}%.`),
        n.top.length ? el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["#", "Tên", "Sát thương", "%"].map((t) => el("th", {}, t))),
          ...n.top.map((r, i) => el("tr", {}, el("td", {}, String(i + 1)), el("td", {}, r.name), el("td", {}, fmt(r.dmg)), el("td", {}, `${r.pct}%`))))) : el("p", { class: "dim" }, "Chưa ai gây sát thương."),
        el("div", { class: "bar" }, el("button", { class: "small danger", disabled: n.state !== "alive", onclick: async () => confirm("Thu hồi boss? Boss biến mất ở mọi khu, không ai được thưởng.") && (await guard(() => api("/boss/despawn", { method: "POST" }), "Đã thu hồi.")) && reload() }, "Thu hồi (không thưởng)"))));
    } else out.append(el("p", { class: "dim" }, "Không có boss nào."));
    // calling one
    out.append(el("h3", {}, "Gọi boss"));
    const key = el("select", {}, ...d.bosses.map((b) => el("option", { value: b.key }, `${b.name} — ${b.title}`)));
    const map = el("select", {}, ...d.maps.map((m) => el("option", { value: m.id }, m.name)));
    const num = (ph, v) => el("input", { type: "number", placeholder: ph, value: v ?? "" });
    const x = num("Vị trí x (điểm ảnh; trống = giữa map)"), hp = num("Máu", d.defaults.hp), stones = num("Tổng linh thạch", d.defaults.stones), exp = num("Tổng tu vi", d.defaults.exp);
    const kb = num("% thưởng kết liễu", d.defaults.killBonus), min = num("Ở lại (phút)", d.defaults.minutes);
    const lab = (t, i) => el("label", {}, t, i);
    out.append(el("div", { class: "fields" }, lab("Boss", key), lab("Map", map), lab("Vị trí x (trống: giữa map)", x), lab("Máu", hp), lab("Tổng linh thạch", stones), lab("Tổng tu vi", exp), lab("% thưởng kết liễu", kb), lab("Ở lại bao nhiêu phút", min)),
      el("div", { class: "bar" }, el("button", { class: "primary small", disabled: !!d.now && d.now.state !== "dead", onclick: async () => {
        if (!confirm(`Gọi ${key.selectedOptions[0].textContent} ra ${map.selectedOptions[0].textContent}? Cả server sẽ được báo.`)) return;
        const body = { key: key.value, map: map.value, hp: hp.value, stones: stones.value, exp: exp.value, killBonus: kb.value, minutes: min.value };
        if (x.value !== "") body.x = x.value;
        (await guard(() => api("/boss/spawn", { method: "POST", body }), "Boss đã xuất hiện.")) && reload();
      } }, "Gọi boss")),
      el("p", { class: "dim" }, `Mặc định lấy từ tab Cài đặt (boss.*). Bề rộng các map: ${d.maps.map((m) => `${m.name} ${fmt(m.w)}`).join(", ")} điểm ảnh.`));
    // the ones before
    out.append(el("h3", {}, "Các lần trước"));
    const box = el("div");
    out.append(el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["#", "Boss", "Map", "Máu", "Trạng thái", "Kết liễu", "Người nhận", "Gọi bởi", "Lúc gọi", "Kết thúc", ""].map((t) => el("th", {}, t))),
      ...d.history.map((h) => el("tr", {}, el("td", {}, String(h.id)), el("td", {}, h.name), el("td", {}, h.mapName), el("td", {}, `${fmt(h.hp)} / ${fmt(h.max_hp)}`), el("td", {}, STATE[h.state] ?? h.state),
        el("td", {}, h.killer_name ?? ""), el("td", {}, String(h.rewarded)), el("td", {}, h.spawned_by ?? ""), el("td", {}, at(h.spawned_at)), el("td", {}, at(h.ended_at)),
        el("td", {}, h.rewarded ? el("button", { class: "small", onclick: async () => {
          const rows = await api(`/boss/${h.id}/rewards`);
          box.replaceChildren(el("h4", {}, `Boss #${h.id}: chia thưởng`), el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["ID", "Tên", "Sát thương", "Linh thạch", "Tu vi", "Kết liễu"].map((t) => el("th", {}, t))),
            ...rows.map((r) => el("tr", {}, ...[r.user_id, r.name, fmt(r.dmg), fmt(r.stones), fmt(r.exp), r.killer ? "★" : ""].map((v) => el("td", {}, String(v ?? ""))))))));
        } }, "Xem") : ""))))), box);
    // the rules
    out.append(el("h3", {}, "Thông số"), el("p", { class: "dim" }, "Cũng có ở tab Cài đặt (boss.*). Đổi là áp dụng ngay, cả cho boss đang ở ngoài (trừ máu và tổng thưởng đã đặt lúc gọi)."));
    const S = (await api("/t/settings")).filter((r) => r.k.startsWith("boss."));
    for (const r of S)
      out.append(record({ title: r.note || r.k, sub: `${r.k} = ${r.v}`, row: { v: r.v }, fields: [{ k: "v", label: "Giá trị", type: "number", step: "any" }],
        onSave: async (c) => (await guard(() => api(`/t/settings/${r.k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload() }));
    return out;
  },

  // Phó Bản and Tổ Đội: the runs now (stage, lives, time, members; buttons to open the next seal, bring everyone to the
  // checkpoint, end it), the parties now, the record (each run's members and rewards), a player's entries (and giving
  // them back), the rules (settings pb.*)
  async phoban() {
    const d = await api("/phoban"), out = el("div"), at = (v) => (v ? new Date(v).toLocaleString("vi-VN") : "");
    const mmss = (s) => (s === null || s === undefined ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    out.append(el("h2", {}, "Phó Bản và Tổ Đội"),
      el("p", { class: "dim" }, `Tổ đội 1-4 người (pb.party) vào phó bản: mỗi tổ đội một bản sao riêng của map. Các tầng bị phong ấn tới khi dọn sạch tầng trước; yêu thú và boss mạnh hơn theo số người; lượt hồi sinh chung; giới hạn thời gian; thông quan được thưởng theo hạng S/A/B (theo thời gian), lần đầu trong ngày thêm thưởng. Mỗi người tối đa pb.daily lượt mỗi ngày (tính lúc vào). Phó bản hiện có: ${d.dungeons.map((x) => `${x.name} (${x.stages.join(" → ")})`).join("; ")}.`));
    // the runs now
    out.append(el("h3", {}, `Đang diễn ra (${d.runs.length})`));
    if (!d.runs.length) out.append(el("p", { class: "dim" }, "Không có lượt nào."));
    for (const r of d.runs)
      out.append(el("div", { class: "card" },
        el("p", {}, el("b", {}, `#${r.id} ${r.name}`), ` · tầng ${r.stage + 1} (${r.stageName}) · còn ${mmss(r.left)} · ♥ ${r.lives} · ${r.deaths} lần gục · ${r.state === "running" ? "đang đánh" : "đang kết thúc"}`),
        r.boss ? el("p", {}, `Boss: ${fmt(r.boss.hp)} / ${fmt(r.boss.max)} máu`) : "",
        el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["ID", "Tên", "Sát thương", "Gục", "Trạng thái"].map((t) => el("th", {}, t))),
          ...r.members.map((m) => el("tr", {}, el("td", {}, String(m.uid)), el("td", {}, m.name), el("td", {}, fmt(m.dmg)), el("td", {}, String(m.deaths)), el("td", {}, m.left ? "đã rời" : m.away ? "mất kết nối" : "trong phó bản"))))),
        el("div", { class: "bar" },
          el("button", { class: "small", onclick: async () => confirm("Mở phong ấn tầng này ngay (yêu thú còn lại của tầng biến mất)?") && (await guard(() => api(`/phoban/${r.id}/skip`, { method: "POST" }), "Đã mở phong ấn.")) && reload() }, "Mở phong ấn tầng này"),
          el("button", { class: "small", onclick: async () => (await guard(() => api(`/phoban/${r.id}/gather`, { method: "POST" }), "Đã đưa về điểm hồi sinh.")) && reload() }, "Đưa cả đội về điểm hồi sinh"),
          el("button", { class: "small danger", onclick: async () => confirm("Kết thúc lượt này? Thất bại, không ai được thưởng, mọi người về ngay.") && (await guard(() => api(`/phoban/${r.id}/end`, { method: "POST" }), "Đã kết thúc.")) && reload() }, "Kết thúc (không thưởng)"))));
    // the parties now
    out.append(el("h3", {}, `Tổ đội đang có (${d.parties.length})`));
    out.append(d.parties.length ? el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["#", "Đội trưởng", "Thành viên"].map((t) => el("th", {}, t))),
      ...d.parties.map((p) => el("tr", {}, el("td", {}, String(p.id)), el("td", {}, p.members.find((m) => m.uid === p.leader)?.name ?? ""),
        el("td", {}, p.members.map((m) => `${m.name}${m.on ? "" : " (ngoại tuyến)"}${m.run ? " (phó bản)" : ""}`).join(", ")))))) : el("p", { class: "dim" }, "Không có tổ đội nào."));
    // a player's entries
    out.append(el("h3", {}, "Lượt vào của một người chơi"));
    const uidIn = el("input", { type: "number", placeholder: "ID người chơi" }), daily = el("div");
    out.append(el("div", { class: "bar" }, uidIn,
      el("button", { class: "small", onclick: async () => {
        const rows = await guard(() => api(`/phoban/daily/${Number(uidIn.value)}`));
        if (rows) daily.replaceChildren(rows.length ? el("table", { class: "ftbl" }, el("tr", {}, ...["Ngày", "Đã vào", "Thông quan"].map((t) => el("th", {}, t))), ...rows.map((r) => el("tr", {}, el("td", {}, r.day), el("td", {}, String(r.n)), el("td", {}, String(r.cleared))))) : el("p", { class: "dim" }, "Chưa vào lần nào."));
      } }, "Xem"),
      el("button", { class: "small", onclick: async () => confirm("Trả lại toàn bộ lượt vào hôm nay cho người chơi này?") && (await guard(() => api(`/phoban/daily/${Number(uidIn.value)}/reset`, { method: "POST" }), "Đã trả lượt.")) }, "Trả lượt hôm nay")), daily);
    // the record
    out.append(el("h3", {}, "Các lượt gần đây"));
    const box = el("div");
    out.append(el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["#", "Phó bản", "Người", "Thành viên", "Kết quả", "Hạng", "Thời gian", "Tầng", "Gục", "Bắt đầu", "Ghi chú", ""].map((t) => el("th", {}, t))),
      ...d.history.map((h) => el("tr", {}, el("td", {}, String(h.id)), el("td", {}, h.name), el("td", {}, String(h.size)), el("td", {}, h.names ?? ""), el("td", {}, h.stateName), el("td", {}, h.rank ?? ""),
        el("td", {}, mmss(h.seconds)), el("td", {}, String(h.stage + 1)), el("td", {}, String(h.deaths)), el("td", {}, at(h.started_at)), el("td", {}, h.note ?? ""),
        el("td", {}, el("button", { class: "small", onclick: async () => {
          const rows = await api(`/phoban/${h.id}/members`);
          box.replaceChildren(el("h4", {}, `Lượt #${h.id}: thành viên và thưởng`), el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["ID", "Tên", "Sát thương", "Gục", "Linh thạch", "Tu vi", "Vật phẩm", "Lần đầu", "Đã rời"].map((t) => el("th", {}, t))),
            ...rows.map((r) => el("tr", {}, ...[r.user_id, r.name, fmt(r.dmg), r.deaths, r.rewarded ? fmt(r.stones) : "-", r.rewarded ? fmt(r.exp) : "-", Object.entries(r.items).map(([k, n]) => `${n} ${k}`).join(", "), r.first ? "★" : "", r.left ? "✓" : ""].map((v) => el("td", {}, String(v ?? ""))))))));
        } }, "Xem")))))), box);
    // the rules
    out.append(el("h3", {}, "Thông số"), el("p", { class: "dim" }, "Cũng có ở tab Cài đặt (pb.*). Đổi là áp dụng cho các lượt bắt đầu sau đó (lượt đang chạy giữ số đã có lúc vào)."));
    const S = (await api("/t/settings")).filter((r) => r.k.startsWith("pb."));
    for (const r of S)
      out.append(record({ title: r.note || r.k, sub: `${r.k} = ${r.v}`, row: { v: r.v }, fields: [{ k: "v", label: "Giá trị", type: "number", step: "any" }],
        onSave: async (c) => (await guard(() => api(`/t/settings/${r.k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload() }));
    return out;
  },

  async chinhta() {
    const d = await api("/chinhta"), out = el("div"), R = d.rules;
    const F = { c: "Chính Phái", t: "Tà Phái", d: "Hòa" }, RES = { w: "Thắng", l: "Thua", d: "Hòa", x: "Rời trận" };
    const at = (ms) => new Date(ms).toLocaleString("vi-VN");
    out.append(el("h2", {}, "Chính Tà Phân Tranh"),
      el("p", { class: "dim" }, `Mỗi ngày lúc ${R.times.join(", ") || "(chưa có giờ: đặt chinhta.slot1..3)"} (UTC+${R.tz}). Người chơi đăng ký trước; đến giờ hệ thống chọn mỗi phe tối đa ${R.team} người mạnh nhất đang trực tuyến (phe đông hơn được hơn tối đa ${R.maxGap}), đưa vào chiến trường. ${R.minutes} phút, phe nhiều lượt hạ gục hơn thắng. Thưởng điểm Chính Tà: thắng ${R.win}, thua ${R.lose}, hòa ${R.draw}, +${R.killPts}/hạ gục (tối đa ${R.killCap}), MVP +${R.mvp}.`),
      el("p", {}, `Nhân vật theo phe: Chính Phái ${fmt(d.sides.c ?? 0)} · Tà Phái ${fmt(d.sides.t ?? 0)} · chưa chọn ${fmt(d.sides["-"] ?? 0)}`));
    // the battle now
    out.append(el("h3", {}, "Trận đang diễn ra"));
    if (d.now) {
      const n = d.now;
      out.append(el("p", {}, `Trận #${n.id} (${n.text}) · ${n.phase === "prep" ? "đang chuẩn bị" : n.phase === "fight" ? "đang giao chiến" : "đã kết thúc"} · Chính ${n.kills.c} - ${n.kills.t} Tà · Chính ${n.size.c} người, Tà ${n.size.t} người · kết thúc lúc ${at(n.ends)}`),
        el("div", { class: "bar" },
          el("button", { class: "small", onclick: async () => confirm("Kết thúc trận ngay? Thưởng điểm như hết giờ.") && (await guard(() => api("/chinhta/end", { method: "POST" }), "Đã kết thúc.")) && reload() }, "Kết thúc ngay (có thưởng)"),
          el("button", { class: "small danger", onclick: async () => confirm("Hủy trận? Không ai được thưởng, mọi người về ngay.") && (await guard(() => api("/chinhta/cancel", { method: "POST" }), "Đã hủy.")) && reload() }, "Hủy trận (không thưởng)")),
        el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["Tên", "Phe", "Hạ", "Bại", "Trợ", "Trạng thái"].map((t) => el("th", {}, t))),
          ...n.board.map((r) => el("tr", {}, el("td", {}, r.n), el("td", {}, F[r.f]), el("td", {}, String(r.k)), el("td", {}, String(r.d)), el("td", {}, String(r.a)), el("td", {}, r.left ? "đã rời" : r.on ? "trong trận" : "vắng"))))),
        el("p", { class: "dim" }, `Dự bị: Chính ${n.bench.c.join(", ") || "không"} · Tà ${n.bench.t.join(", ") || "không"}`));
    } else out.append(el("p", { class: "dim" }, "Không có trận nào."));
    // the next battle
    out.append(el("h3", {}, d.next ? `Trận kế tiếp: ${d.next.text} (đóng đăng ký ${at(d.next.closes)})` : "Chưa có lịch"));
    if (d.next) {
      out.append(el("p", {}, `Đã đăng ký: Chính ${d.signups.filter((r) => r.faction === "c").length} · Tà ${d.signups.filter((r) => r.faction === "t").length}`),
        el("div", { class: "bar" }, el("button", { class: "small", disabled: !!d.now, onclick: async () => {
          if (!confirm("Bắt đầu trận kế tiếp ngay bây giờ với những người đã đăng ký (đang trực tuyến)?")) return;
          const r = await guard(() => api("/chinhta/start", { method: "POST" }), "Đã bắt đầu.");
          if (r?.cancelled) alert(`Trận bị hủy: ${r.error}`);
          reload();
        } }, "Bắt đầu ngay")));
      if (d.signups.length)
        out.append(el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["ID", "Tên", "Phe", "Cấp", "Điểm đấu trường", "Lúc đăng ký"].map((t) => el("th", {}, t))),
          ...d.signups.map((r) => el("tr", {}, el("td", {}, String(r.uid)), el("td", {}, r.name), el("td", {}, `${F[r.faction]}${r.cur !== r.faction ? " (đã đổi phe)" : ""}`), el("td", {}, String(r.level)), el("td", {}, fmt(r.rank)), el("td", {}, when(r.at)))))));
    }
    // the rules
    out.append(el("h3", {}, "Luật"), el("p", { class: "dim" }, "Các số này cũng có ở tab Cài đặt (chinhta.*). Giờ trận dạng GIỜPHÚT: 2000 = 20:00, 1230 = 12:30, -1 = tắt."));
    const rule = (k, label, v) => record({ title: label, sub: `${k} = ${v}`, row: { v }, fields: [{ k: "v", label: "Giá trị", type: "number", step: "any" }],
      onSave: async (c) => (await guard(() => api(`/t/settings/${k}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload() });
    const S = Object.fromEntries((await api("/t/settings")).filter((r) => r.k.startsWith("chinhta.")).map((r) => [r.k, [r.v, r.note]]));
    for (const [k, [v, note]] of Object.entries(S)) out.append(rule(k, note || k, v));
    // the record
    out.append(el("h3", {}, "Các trận gần đây"));
    const box = el("div");
    out.append(el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["#", "Giờ trận", "Trạng thái", "Người", "Tỉ số", "Kết quả", "Ghi chú", ""].map((t) => el("th", {}, t))),
      ...d.matches.map((m) => el("tr", {}, el("td", {}, String(m.id)), el("td", {}, m.text), el("td", {}, { running: "đang chạy", done: "xong", cancelled: "hủy" }[m.state]),
        el("td", {}, `${m.size_c} - ${m.size_t}`), el("td", {}, `${m.kills_c} - ${m.kills_t}`), el("td", {}, m.winner ? F[m.winner] : ""), el("td", {}, m.note),
        el("td", {}, m.state === "done" ? el("button", { class: "small", onclick: async () => {
          const rows = await api(`/chinhta/match/${m.id}`);
          box.replaceChildren(el("h4", {}, `Trận #${m.id}`), el("div", { class: "fwrap" }, el("table", { class: "ftbl" }, el("tr", {}, ...["ID", "Tên", "Phe", "Hạ", "Bại", "Trợ", "Giây", "Kết quả", "MVP", "Điểm"].map((t) => el("th", {}, t))),
            ...rows.map((r) => el("tr", {}, ...[r.uid, r.name, F[r.faction], r.kills, r.deaths, r.assists, r.seconds, RES[r.result], r.mvp ? "★" : "", r.points].map((v) => el("td", {}, String(v ?? "")))))))); 
        } }, "Xem") : ""))))), box);
    // the shop
    out.append(el("h3", {}, "Tiệm Chính Tà"), el("p", { class: "dim" }, "Vật phẩm bán bằng điểm Chính Tà (khóa của vật phẩm trong tab Đan dược / vật phẩm). Trống thì người chơi thấy ghi chú tiệm sẽ phát triển sau."));
    for (const it of d.shop)
      out.append(record({ title: `${it.name}${it.onSale ? "" : " (ẩn)"}`, sub: `${it.item} · ${fmt(it.price)} điểm`, row: { price: it.price, onSale: it.onSale ? 1 : 0, sort: it.sort },
        fields: [{ k: "price", label: "Giá (điểm)", type: "number", step: 1 }, { k: "onSale", label: "Đang bán (1/0)", type: "number", step: 1 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 }],
        onSave: async (c) => (await guard(() => api("/chinhta/shop", { method: "POST", body: { item: it.item, price: c.price ?? it.price, onSale: (c.onSale ?? (it.onSale ? 1 : 0)) == 1, sort: c.sort ?? it.sort } }), "Đã lưu.")) && reload() }),
        el("button", { class: "small danger", onclick: async () => confirm(`Bỏ ${it.name} khỏi tiệm?`) && (await guard(() => api("/chinhta/shop", { method: "POST", body: { item: it.item, remove: true } }), "Đã bỏ.")) && reload() }, "Bỏ khỏi tiệm"));
    const item = el("input", { placeholder: "Khóa vật phẩm (vd hoixuan)" }), price = el("input", { placeholder: "Giá (điểm)", type: "number" });
    out.append(el("div", { class: "bar" }, item, price, el("button", { class: "small", onclick: async () => (await guard(() => api("/chinhta/shop", { method: "POST", body: { item: item.value.trim(), price: Number(price.value) } }), "Đã thêm.")) && reload() }, "Thêm vào tiệm")));
    // a player's points and side
    out.append(el("h3", {}, "Điểm và phe của người chơi"));
    const uid = el("input", { placeholder: "ID người chơi", type: "number" }), delta = el("input", { placeholder: "Cộng/trừ điểm (vd 50, -20)", type: "number" });
    const side = el("select", {}, el("option", { value: "c" }, "Chính Phái"), el("option", { value: "t" }, "Tà Phái"));
    out.append(el("div", { class: "bar" }, uid, delta, el("button", { class: "small", onclick: async () => {
      const r = await guard(() => api("/chinhta/points", { method: "POST", body: { uid: Number(uid.value), delta: Number(delta.value) } }), "Đã cập nhật điểm.");
      if (r) alert(`Điểm Chính Tà hiện có: ${fmt(r.points)}`);
    } }, "Cộng/trừ điểm")),
      el("div", { class: "bar" }, side, el("button", { class: "small", onclick: async () => confirm("Đặt phe cho người chơi này (không mất phí, không chờ)?") && guard(() => api("/chinhta/faction", { method: "POST", body: { uid: Number(uid.value), faction: side.value } }), "Đã đặt phe.") }, "Đặt phe")));
    return out;
  },

  async realms() {
    const rows = await api("/t/realms");
    // each realm's levels, counted through the whole list
    const span = [];
    let L = 0;
    for (const r of rows) span.push([L + 1, (L += r.stages)]);
    const card = (r) => {
      const i = rows.indexOf(r), [from, to] = span[i];
      const move = async (d) => {
        const other = rows[i + d];
        if (!other) return;
        await guard(async () => {
          // swap places: give them each other's sort (equal sorts get spread first)
          const a = r.sort === other.sort ? other.sort + d : other.sort;
          await api(`/t/realms/${r.id}`, { method: "PATCH", body: { sort: a } });
          await api(`/t/realms/${other.id}`, { method: "PATCH", body: { sort: r.sort } });
        }, "Đã đổi thứ tự.");
        reload();
      };
      return record({
        title: r.name, sub: `cấp ${from}-${to}`, row: r,
        extra: el("span", {}, el("button", { type: "button", class: "small", onclick: () => move(-1), disabled: i === 0 }, "↑"), " ",
          el("button", { type: "button", class: "small", onclick: () => move(1), disabled: i === rows.length - 1 }, "↓")),
        fields: [{ k: "name", label: "Tên cảnh giới" }, { k: "stages", label: "Số tầng", type: "number", step: 1 }],
        onSave: async (c) => (await guard(() => api(`/t/realms/${r.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
        onDelete: async () => confirm(`Xóa cảnh giới ${r.name}? Cấp của người chơi sẽ tính lại theo danh sách mới.`) &&
          (await guard(() => api(`/t/realms/${r.id}`, { method: "DELETE" }), "Đã xóa.")) && reload(),
      });
    };
    const add = record({
      title: "Thêm cảnh giới (vào cuối)", isNew: true, row: { stages: 5 },
      fields: [{ k: "name", label: "Tên cảnh giới" }, { k: "stages", label: "Số tầng", type: "number", step: 1 }],
      onSave: async (c) => (await guard(() => api("/t/realms", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    const out = el("div");
    const q = searchBox("Tìm cảnh giới...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(rows.filter((r) => has(t, r.name)), card, t));
    };
    draw();
    return [el("h2", {}, "Cảnh giới"), el("p", { class: "dim" }, `Tổng ${L} cấp. Mỗi cảnh giới có một số tầng; cấp tối đa là tổng số tầng. Dùng ↑ ↓ để đổi thứ tự.`), el("div", { class: "grid" }, add), el("div", { class: "bar" }, q), out];
  },

  async items() {
    const rows = await api("/t/items");
    const F = [
      { k: "name", label: "Tên" }, { k: "kind", label: "Loại", type: "select", options: ITEM_KIND }, { k: "price", label: "Giá (linh thạch)", type: "number", step: 1 },
      { k: "heal", label: "Hồi sinh lực (0-1)", type: "number", step: 0.05, hint: "0.4 = 40% sinh lực tối đa" },
      { k: "exp_base", label: "Tu vi cộng", type: "number", step: 1 }, { k: "exp_per_level", label: "Tu vi thêm mỗi cấp", type: "number", step: 1 },
      { k: "cooldown", label: "Hồi (giây)", type: "number", step: 0.5 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 },
      { k: "on_sale", label: "Đang bán", type: "bool" }, { k: "description", label: "Mô tả", type: "textarea", wide: true },
    ];
    const add = record({
      title: "Thêm vật phẩm", isNew: true, row: { kind: "pill", price: 10, heal: 0, exp_base: 0, exp_per_level: 0, cooldown: 1, on_sale: 1, sort: 10 },
      fields: [{ k: "item_key", label: "Mã (chữ thường, không dấu)", hint: "vd: longhuyet" }, ...F],
      onSave: async (c) => (await guard(() => api("/t/items", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    const kind = el("select", {}, [["", "Mọi loại"], ...ITEM_KIND].map(([v, l]) => el("option", { value: v }, l)));
    const q = el("input", { type: "search", placeholder: "Tìm theo tên hoặc mã..." });
    const out = el("div");
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const list = rows.filter((r) => (!kind.value || r.kind === kind.value) && (!t || r.name.toLowerCase().includes(t) || r.item_key.includes(t)));
      out.replaceChildren(...paged(list, (r) => record({
        title: r.name, sub: `${r.item_key} · ${ITEM_KIND.find((k) => k[0] === r.kind)?.[1] ?? r.kind}`, row: r, fields: F,
        extra: r.on_sale ? el("span", { class: "tag green" }, "Đang bán") : el("span", { class: "tag" }, "Không bán"),
        onSave: async (c) => (await guard(() => api(`/t/items/${r.item_key}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
        onDelete: async () => confirm(`Xóa hẳn ${r.name}?`) && (await guard(() => api(`/t/items/${r.item_key}`, { method: "DELETE" }), "Đã xóa.")) && reload(),
      }), `${kind.value}|${t}`));
    };
    kind.addEventListener("change", draw);
    q.addEventListener("input", draw);
    draw();
    return [
      el("h2", {}, "Vật phẩm"),
      el("p", { class: "dim" }, "Đan dược bán ở Đan Các và dùng trên thanh nút. Bí kíp và nguyên liệu không bán: rơi từ yêu thú (tab Rơi đồ), dùng để lĩnh ngộ công pháp. Muốn bỏ một món, hãy bỏ chọn \"Đang bán\" thay vì xóa. Món đang được công pháp cần hoặc đang rơi từ yêu thú thì không xóa được."),
      el("div", { class: "grid" }, add), el("div", { class: "bar" }, kind, q), out,
    ];
  },

  async arts() {
    // each art is designed in code (shared/cong-phap.js): here only its switches, its effect playing, and handing it out
    const [rows, items, { fxPreview }] = await Promise.all([api("/cong-phap"), api("/t/items"), import("/fxpreview.js")]);
    const nameOf = Object.fromEntries(items.map((i) => [i.item_key, i.name])), opts = itemOptions(items);
    // what learning it spends: a row per item, each editable; a row to add another
    const reqBox = (r) => {
      const box = el("div", { class: "group reqs" }, el("b", {}, "Vật phẩm cần để lĩnh ngộ"), el("span", { class: "dim" }, "Tiêu hao khi người chơi lĩnh ngộ."));
      for (const q of r.reqs) {
        const it = el("select", {}, opts.map(([v, l]) => el("option", { value: v, selected: v === q.item }, l)));
        const qty = el("input", { type: "number", min: 1, step: 1, value: q.qty, inputmode: "numeric" });
        box.append(el("div", { class: "bar" }, it, qty,
          el("button", { class: "small", type: "button", onclick: async () => (await guard(() => api(`/t/cong_phap_reqs/${q.id}`, { method: "PATCH", body: { item_key: it.value, qty: Number(qty.value) } }), "Đã lưu.")) && reload() }, "Lưu"),
          el("button", { class: "small danger", type: "button", onclick: async () => confirm(`Bỏ ${nameOf[q.item] ?? q.item} khỏi yêu cầu của ${r.name}?`) && (await guard(() => api(`/t/cong_phap_reqs/${q.id}`, { method: "DELETE" }), "Đã bỏ.")) && reload() }, "✕")));
      }
      if (!r.reqs.length) box.append(el("span", { class: "dim" }, "Không cần gì: ai cũng lĩnh ngộ được (khi bật \"Học được bằng bí kíp\")."));
      const it = el("select", {}, opts.map(([v, l]) => el("option", { value: v, selected: v === "bk_" + r.key }, l)));
      const qty = el("input", { type: "number", min: 1, step: 1, value: 1, inputmode: "numeric" });
      box.append(el("div", { class: "bar" }, it, qty, el("button", { class: "small", type: "button", onclick: async () => (await guard(() => api("/t/cong_phap_reqs", { method: "POST", body: { art_key: r.key, item_key: it.value, qty: Number(qty.value) } }), "Đã thêm.")) && reload() }, "+ Thêm")));
      return box;
    };
    const elemName = (e) => ELEMENTS.find((x) => x[0] === e)?.[1] ?? e;
    // a switch: saved at once
    const toggle = (r, col, on, off, label) => {
      const b = el("button", { type: "button", class: "small sw" });
      const paint = () => {
        b.classList.toggle("on", !!r[col]);
        b.textContent = r[col] ? on : off;
        b.title = label;
      };
      b.addEventListener("click", async () => {
        b.disabled = true;
        const v = !r[col];
        if ((await guard(() => api(`/t/cong_phap/${r.key}`, { method: "PATCH", body: { [col]: v } }), `${r.name}: ${v ? on : off}.`)) !== undefined) r[col] = v;
        b.disabled = false;
        paint();
        b.closest(".artcard")?.classList.toggle("off", !r.enabled);
        const tag = b.closest(".artcard")?.querySelector(".sum > span:not(.dim):not(.grow):not(.chev)");
        if (tag) tag.replaceWith(status(r));
      });
      paint();
      return b;
    };
    // hand an art out: to everyone, everyone online, or some players by đạo hiệu (an event's reward, an activity's prize)
    const grantBox = (r) => {
      const to = el("select", {}, [["names", "Theo đạo hiệu"], ["online", "Mọi người đang online"], ["all", "Mọi nhân vật"]].map(([v, l]) => el("option", { value: v }, l)));
      const names = el("input", { placeholder: "Đạo hiệu, cách nhau bằng dấu phẩy" });
      to.addEventListener("change", () => (names.hidden = to.value !== "names"));
      return el("div", { class: "group reqs" }, el("b", {}, "Phát cho người chơi"), el("span", { class: "dim" }, "Thưởng sự kiện, hoạt động: ai có rồi thì giữ nguyên."),
        el("div", { class: "bar" }, to, names, el("button", { class: "small", type: "button", onclick: async () => {
          if (to.value !== "names" && !confirm(`Phát ${r.name} cho ${to.value === "all" ? "MỌI nhân vật" : "mọi người đang online"}?`)) return;
          const out = await guard(() => api(`/arts/${r.key}/grant`, { method: "POST", body: { to: to.value, names: names.value } }));
          if (out) toast(`Đã phát cho ${out.count} người (ai có rồi thì giữ nguyên).`);
        } }, "Phát")));
    };
    // icons for the rows (public/cong-phap/<n>-<name>/icon.png)
    const icons = (await fetch("/assets.json").then((x) => x.json()).catch(() => ({}))).arts ?? {};
    const status = (r) => el("span", {}, !r.enabled ? el("span", { class: "tag red" }, "Đã tắt") : r.starter ? el("span", { class: "tag gold" }, "Ai cũng biết") :
      r.learnable ? el("span", { class: "tag green" }, "Học bằng bí kíp") : el("span", { class: "tag gold" }, "★ Sự kiện"));
    // one row per art; clicking it opens the modal: "Chỉnh sửa" (switches, items, handing out) and "Xem trước" (its effects)
    const card = (r) => {
      const c = el("div", { class: `card artcard${r.enabled ? "" : " off"}` },
        ...tabs([
          ["Chỉnh sửa", () => [
            el("div", { class: "artinfo" },
              el("p", { class: "lead" }, r.line), el("p", { class: "dim" }, r.desc),
              el("div", { class: "chips" }, ...[elemName(r.element), `Bậc ${r.tier}`, `Hồi ${r.cd}s`, r.aim ? `Kéo chọn chỗ ${r.aim}px` : null].filter(Boolean).map((t) => el("span", { class: "chip" }, t)))),
            el("div", { class: "group" }, el("b", {}, "Công tắc"),
              el("div", { class: "sws" },
                toggle(r, "enabled", "✓ Đang bật", "✕ Đã tắt", "Tắt: không ai dùng hay học được"),
                r.starter ? null : toggle(r, "learnable", "📖 Học được bằng bí kíp", "★ Chỉ nhận từ sự kiện, hoạt động", "Bật: người chơi lĩnh ngộ bằng các vật phẩm yêu cầu. Tắt: chỉ nhận được qua hoạt động, sự kiện (admin phát)"))),
            r.starter ? el("p", { class: "dim" }, "Ai cũng biết sẵn: không cần vật phẩm, không cần phát.") : reqBox(r),
            r.starter ? null : grantBox(r),
          ]],
          ["Xem trước", () => {
            const list = [...new Set([...r.fx, r.icon].filter(Boolean))];
            if (!list.length) return el("p", { class: "dim" }, "Phi Kiếm không có hiệu ứng riêng: trong game là vũ khí đang cầm bay đi rồi quay về.");
            return el("div", { class: "fxlist" }, list.map((id) => el("figure", {}, fxPreview(id, { w: 320, h: 200 }), el("figcaption", { class: "dim" }, id))));
          }],
        ]));
      const icon = icons[r.key] ? el("img", { class: "arti", src: `/${icons[r.key]}/icon.png`, alt: "" }) : null;
      collapsible(c, { title: r.name, sub: `${elemName(r.element)} · bậc ${r.tier}`, extra: status(r), key: "art:" + r.key });
      if (icon) c.querySelector(".sum").prepend(icon);
      return c;
    };
    return [el("h2", {}, `Công pháp (${rows.length})`),
      el("p", { class: "dim" }, "Mỗi công pháp được thiết kế riêng trong code (shared/cong-phap.js), nên số liệu chiến đấu không chỉnh ở đây. Công pháp không bán. Bấm vào một môn để bật/tắt, chọn học bằng bí kíp hay chỉ nhận từ hoạt động, sự kiện, đổi vật phẩm cần để lĩnh ngộ, phát cho người chơi, và xem trước hiệu ứng."),
      el("div", { class: "grid" }, rows.map(card))];
  },

  async drops() {
    const [rows, items, monsters] = await Promise.all([api("/t/monster_drops"), api("/t/items"), api("/t/monsters")]);
    const mons = [["*", "* Mọi yêu thú (có bật rơi đồ chung)"], ...monsters.map((m) => [m.type, `${m.name} (${m.type})`])];
    const F = [
      { k: "monster", label: "Yêu thú", type: "select", options: mons }, { k: "item_key", label: "Vật phẩm", type: "select", options: itemOptions(items) },
      { k: "chance", label: "Trọng số", type: "number", step: 0.001, hint: "chỉ so với các món khác cùng danh sách: 50 và 5 = món đầu ra nhiều gấp 10" },
      { k: "min_qty", label: "Ít nhất", type: "number", step: 1 }, { k: "max_qty", label: "Nhiều nhất", type: "number", step: 1 },
    ];
    const nameOf = Object.fromEntries(items.map((i) => [i.item_key, i.name]));
    const add = record({
      title: "Thêm vật phẩm rơi", isNew: true, row: { monster: "*", item_key: items[0]?.item_key, chance: 0.05, min_qty: 1, max_qty: 1 }, fields: F,
      onSave: async (c) => (await guard(() => api("/t/monster_drops", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    // a row's share of its list: the chance it is the one item when that monster drops something
    const sums = {};
    for (const r of rows) sums[r.monster] = (sums[r.monster] ?? 0) + r.chance;
    const share = (r) => `${sums[r.monster] ? ((r.chance / sums[r.monster]) * 100).toFixed(1) : 0}% mỗi lần rơi`;
    const mon = el("select", {}, [["", "Mọi yêu thú"], ...mons].map(([v, l]) => el("option", { value: v }, l)));
    const q = el("input", { type: "search", placeholder: "Tìm vật phẩm..." });
    const out = el("div");
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const list = rows.filter((r) => (!mon.value || r.monster === mon.value) && (!t || (nameOf[r.item_key] ?? r.item_key).toLowerCase().includes(t) || r.item_key.includes(t)));
      out.replaceChildren(...paged(list, (r) => record({
        title: nameOf[r.item_key] ?? r.item_key, sub: `${r.monster === "*" ? "mọi yêu thú" : r.monster} · trọng số ${r.chance} (${share(r)})`, row: r, fields: F,
        onSave: async (c) => (await guard(() => api(`/t/monster_drops/${r.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
        onDelete: async () => confirm("Bỏ dòng rơi đồ này?") && (await guard(() => api(`/t/monster_drops/${r.id}`, { method: "DELETE" }), "Đã bỏ.")) && reload(),
      }), `${mon.value}|${t}`));
    };
    mon.addEventListener("change", draw);
    q.addEventListener("input", draw);
    draw();
    return [el("h2", {}, "Rơi đồ"),
      el("p", { class: "dim" }, "Mỗi lần hạ một yêu thú: tung \"Tỉ lệ rơi đồ\" của con đó (tab Yêu thú). Trúng thì rơi đúng 1 món trong danh sách của nó (cộng các dòng \"*\" nếu con đó bật rơi đồ chung), chọn theo trọng số, số lượng từ ít nhất đến nhiều nhất. Vật phẩm vào thẳng túi người hạ. Bù nhìn rơm không rơi gì."),
      el("div", { class: "grid" }, add), el("div", { class: "bar" }, mon, q), out];
  },

  async monsters() {
    const [rows, drops, items] = await Promise.all([api("/t/monsters"), api("/t/monster_drops"), api("/t/items")]);
    const nameOf = Object.fromEntries(items.map((i) => [i.item_key, i.name]));
    const F = [
      { k: "name", label: "Tên" }, { k: "style", label: "Kiểu đánh", type: "select", options: MON_STYLE },
      { k: "fly", label: "Bay (không thì đi trên mặt đất)", type: "bool" },
      { k: "fx", label: "Hình (hiệu ứng)", hint: "vd critters/bat (trong public/hieu-ung); để trống = bù nhìn rơm" },
      { k: "hp", label: "Sinh lực", type: "number" }, { k: "atk", label: "Công", type: "number" }, { k: "def", label: "Thủ", type: "number" },
      { k: "spd", label: "Tốc độ (px/giây)", type: "number" }, { k: "respawn", label: "Hồi sinh (giây)", type: "number" },
      { k: "aggro", label: "Tầm phát hiện (px)", type: "number" }, { k: "reach", label: "Tầm đánh gần (px)", type: "number" },
      { k: "shot_range", label: "Tầm bắn (px, đánh xa)", type: "number" }, { k: "shot_speed", label: "Tốc độ đạn (px/giây)", type: "number" },
      { k: "shot_fx", label: "Hình viên đạn (hiệu ứng)", hint: "vd fire/fireball, projectiles/laser-bolt (trong public/hieu-ung)" },
      { k: "cooldown", label: "Hồi đòn (giây)", type: "number" }, { k: "mult", label: "Hệ số sát thương", type: "number" },
      { k: "exp_base", label: "Tu vi thưởng", type: "number", step: 1 }, { k: "exp_per_level", label: "Tu vi thêm mỗi cấp người hạ", type: "number", step: 1 },
      { k: "stones", label: "Linh thạch thưởng", type: "number", step: 1 },
      { k: "drop_rate", label: "Tỉ lệ rơi đồ mỗi lần hạ (0-1)", type: "number", step: 0.01, hint: "0.3 = 30% số lần hạ rơi 1 món" },
      { k: "common_drops", label: "Tính cả danh sách * (rơi đồ chung)", type: "bool" },
    ];
    const add = record({
      title: "Thêm yêu thú", isNew: true,
      row: { style: "melee", fly: 0, fx: "critters/bat", hp: 300, atk: 25, def: 8, spd: 90, respawn: 10, aggro: 160, reach: 40, shot_range: 0, shot_speed: 0, shot_fx: "", cooldown: 1, mult: 1, exp_base: 20, exp_per_level: 3, stones: 1, drop_rate: 0.3, common_drops: 0 },
      fields: [{ k: "type", label: "Mã (chữ thường, không dấu)", hint: "vd: hac_lang" }, ...F],
      onSave: async (c) => (await guard(() => api("/t/monsters", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    const style = el("select", {}, [["", "Mọi kiểu đánh"], ...MON_STYLE].map(([v, l]) => el("option", { value: v }, l)));
    const out = el("div");
    const q = searchBox("Tìm theo tên, mã hoặc hiệu ứng...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(rows.filter((r) => (!style.value || r.style === style.value) && has(t, r.name, r.type, r.fx)), monCard, `${style.value}|${t}`));
    };
    style.addEventListener("change", draw);
    draw();
    return [el("h2", {}, `Yêu thú (${rows.length})`),
      el("p", { class: "dim" }, "Đánh gần: thấy người chơi là lao tới đánh. Đánh xa: giữ khoảng cách và bắn trong tầm bắn, bị áp sát thì lùi. Mỗi lần hạ, tung tỉ lệ rơi đồ; trúng thì rơi đúng 1 món, chọn theo trọng số trong danh sách của con đó (tab Rơi đồ). Các yêu thú mới chưa có trên bản đồ nào; thả thử ở trang người chơi (nút \"Thả quái thử\")."),
      el("div", { class: "grid" }, add), el("div", { class: "bar" }, style, q), out];
    function monCard(r) {
        const mine = drops.filter((d) => d.monster === r.type), w = mine.reduce((a, d) => a + d.chance, 0);
        return record({
          title: r.name, sub: `${r.type} · ${MON_STYLE.find((x) => x[0] === r.style)?.[1] ?? r.style}${r.fly ? " · bay" : ""}`, row: r, fields: F,
          extra: el("span", { class: "tag", title: mine.map((d) => `${nameOf[d.item_key] ?? d.item_key}: ${w ? ((d.chance / w) * 100).toFixed(1) : 0}%`).join("\n") }, `${mine.length} món rơi${r.common_drops ? " + *" : ""}`),
          onSave: async (c) => (await guard(() => api(`/t/monsters/${r.type}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
          onDelete: async () => confirm(`Xóa hẳn ${r.name} và danh sách rơi đồ của nó?`) && (await guard(() => api(`/t/monsters/${r.type}`, { method: "DELETE" }), "Đã xóa.")) && reload(),
        });
    }
  },

  async skills() {
    const rows = await api("/t/skills");
    const KEYS = ["J"];
    const out = el("div");
    const q = searchBox("Tìm chiêu...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(rows.filter((r) => has(t, r.name, r.type)), skillCard, t));
    };
    queueMicrotask(draw);
    return [el("h2", {}, "Đánh thường"), el("p", { class: "dim" }, "Đòn đánh thường trên nút to (J), ai cũng dùng. Các chiêu khác là công pháp: xem tab Công pháp."),
      el("div", { class: "bar" }, q), out];
    function skillCard(r) {
        const params = JSON.parse(r.params || "{}");
        const row = { ...r, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`p_${k}`, v])) };
        const build = (type) => record({
          title: `${KEYS[r.slot]} · ${r.name}`, row: { ...row, type },
          fields: [
            { k: "name", label: "Tên chiêu" }, { k: "type", label: "Loại", type: "select", options: SKILL_TYPE },
            { k: "cd", label: "Hồi chiêu (giây)", type: "number" }, { k: "mult", label: "Hệ số sát thương (× công)", type: "number" },
            ...SKILL_PARAMS[type].map((p) => ({ k: `p_${p}`, label: PARAM_LABEL[p], type: "number" })),
          ],
          onSave: async (c) => {
            const body = {};
            for (const k of ["name", "type", "cd", "mult"]) if (c[k] !== undefined) body[k] = c[k];
            if (Object.keys(c).some((k) => k.startsWith("p_")) || c.type) {
              const p = {};
              for (const k of SKILL_PARAMS[type]) p[k] = c[`p_${k}`] ?? params[k];
              body.params = p;
            }
            if (await guard(() => api(`/t/skills/${r.slot}`, { method: "PATCH", body }), "Đã lưu.")) reload();
          },
        });
        const holder = el("div", { style: "display:contents" });
        const put = (type) => {
          const card = build(type);
          card.querySelector("select").addEventListener("change", (e) => {
            const fresh = build(e.target.value);
            fresh.classList.add("dirty");
            holder.replaceChildren(fresh);
            fresh.querySelector("select").value = e.target.value;
          });
          holder.replaceChildren(card);
        };
        put(r.type);
        return holder;
    }
  },

  // Tông Môn: every sect as a row; its modal has the sect's numbers and rules, its members (rank, remove), its log, and
  // ending it. Under them, the treasure house (what members buy with cống hiến). The numbers that are the same for every
  // sect (cost, caps, rewards) are in Cài đặt, group Tông Môn.
  async sects() {
    const [rows, shop, items] = await Promise.all([api("/sects"), api("/t/sect_shop"), api("/t/items")]);
    const RANK = [[1, "Tông Chủ"], [2, "Phó Tông Chủ"], [3, "Trưởng Lão"], [4, "Nội Môn Đệ Tử"], [5, "Ngoại Môn Đệ Tử"]];
    const MODE = [["open", "Tự do gia nhập"], ["apply", "Xét duyệt đơn"], ["closed", "Đóng cửa"]];
    const EMB = ["Lệnh bài", "La bàn", "Đan lô", "Hồ lô", "Ngọc giản", "Đèn lồng", "Linh chi", "Đào tiên", "Bình đan", "Linh thạch", "Bùa chú", "Kim thuẫn", "Hỏa", "Băng", "Phong", "Phong ấn"];
    const LOGT = { create: "khai lập", join: "gia nhập", accept: "thu nhận", leave: "rời đi", kick: "trục xuất", rank: "phong chức", auto: "tự lên Nội Môn", transfer: "truyền chức", donate: "quyên góp", levelup: "lên cấp", array: "khai mở đại trận", settings: "sửa quy định", admin: "ban quản trị" };
    const nameOf = Object.fromEntries(items.map((i) => [i.item_key, i.name]));
    const card = (s) => {
      let full = null;
      const loadFull = async () => (full ??= await api(`/sects/${s.id}`));
      const members = () => {
        const box = el("div", { class: "list" }, el("p", { class: "dim" }, "Đang tải..."));
        loadFull().then((f) => box.replaceChildren(...f.members.map((m) => {
          const sel = el("select", {}, RANK.map(([v, l]) => el("option", { value: v, selected: v === m.rank }, l)));
          return el("div", { class: "row" },
            el("div", { class: "main" }, el("b", {}, m.name), el("small", {}, `cấp ${m.level} · cống hiến ${fmt(m.contrib)} (tổng ${fmt(m.contribTotal)}) · vào ${when(m.joinedAt)}`)),
            el("div", { class: "nums" }, sel,
              el("button", { type: "button", class: "small", onclick: async () => (await guard(() => api(`/sects/${s.id}/member`, { method: "POST", body: { uid: m.uid, action: "rank", rank: Number(sel.value) } }), "Đã đổi chức.")) && reload() }, "Lưu chức"),
              el("button", { type: "button", class: "small danger", onclick: async () => confirm(`Đưa ${m.name} ra khỏi ${s.name}?`) && (await guard(() => api(`/sects/${s.id}/member`, { method: "POST", body: { uid: m.uid, action: "remove" } }), "Đã đưa ra.")) && reload() }, "Đưa ra")));
        })), (e) => box.replaceChildren(el("p", { class: "err" }, e.message)));
        return box;
      };
      const logs = () => {
        const box = el("div", { class: "list" }, el("p", { class: "dim" }, "Đang tải..."));
        loadFull().then((f) => box.replaceChildren(...(f.log.length ? f.log.map((l) => el("div", { class: "row" },
          el("div", { class: "main" }, el("b", {}, `${l.actor || "—"} ${LOGT[l.kind] ?? l.kind}${l.target ? ` · ${l.target}` : ""}${l.amount ? ` · ${fmt(l.amount)}` : ""}`), el("small", {}, when(l.at))))) : [el("p", { class: "dim" }, "Chưa có gì.")])));
        return box;
      };
      const form = record({
        title: "Thông tin", row: { name: s.name, notice: s.notice, joinMode: s.joinMode, minLevel: s.minLevel, emblem: s.emblem, level: s.level, exp: s.exp, treasury: s.treasury },
        fields: [
          { k: "name", label: "Tên tông môn" }, { k: "joinMode", label: "Cách gia nhập", type: "select", options: MODE },
          { k: "level", label: "Cấp", type: "number", step: 1 }, { k: "exp", label: "Kinh nghiệm", type: "number", step: 1 },
          { k: "treasury", label: "Ngân khố (linh thạch)", type: "number", step: 1 }, { k: "minLevel", label: "Cấp tối thiểu để vào", type: "number", step: 1 },
          { k: "emblem", label: "Huy hiệu", type: "select", options: EMB.map((n, i) => [i, `${i + 1}. ${n}`]) },
          { k: "notice", label: "Thông báo", type: "textarea", wide: true },
        ],
        onSave: async (c) => {
          for (const k of ["level", "exp", "treasury", "minLevel", "emblem"]) if (c[k] !== undefined) c[k] = Number(c[k]);
          (await guard(() => api(`/sects/${s.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload();
        },
      });
      // the form sits inside the sect's modal: no row of its own
      form.querySelector(".sum")?.remove();
      form.classList.remove("rec", "card");
      const end = el("div", { class: "group" }, el("b", {}, "Giải tán"), el("span", { class: "dim" }, "Mọi thành viên rời tông, ngân khố mất. Không hoàn tác được."),
        s.arrayUntil && new Date(s.arrayUntil) > new Date() ? el("button", { type: "button", class: "small", onclick: async () => (await guard(() => api(`/sects/${s.id}`, { method: "PATCH", body: { endArray: true } }), "Đã tắt đại trận.")) && reload() }, "Tắt Hộ Sơn Đại Trận") : null,
        el("button", { type: "button", class: "small danger", onclick: async () => prompt(`Gõ tên "${s.name}" để giải tán:`)?.trim() === s.name && (await guard(() => api(`/sects/${s.id}`, { method: "DELETE" }), "Đã giải tán.")) && reload() }, "Giải tán tông môn"));
      const c = el("div", { class: "card" }, ...tabs([["Thông tin", () => [form, end]], ["Thành viên", members], ["Nhật ký", logs]]));
      return collapsible(c, {
        title: s.name, key: `sect${s.id}`,
        sub: `Cấp ${s.level} · ${s.members}/${s.cap} người · Tông Chủ ${s.leader || "?"} · ngân khố ${fmt(s.treasury)}`,
        extra: el("span", {}, el("span", { class: `tag ${s.joinMode === "open" ? "green" : s.joinMode === "closed" ? "red" : "gold"}` }, MODE.find((m) => m[0] === s.joinMode)?.[1] ?? s.joinMode)),
      });
    };
    const out = el("div");
    const q = searchBox("Tìm tông môn hoặc Tông Chủ...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(rows.filter((r) => has(t, r.name, r.leader)), card, t));
    };
    draw();
    // the treasure house
    const F = [{ k: "cost", label: "Giá (cống hiến)", type: "number", step: 1 }, { k: "min_level", label: "Tông môn từ cấp", type: "number", step: 1 },
      { k: "daily_limit", label: "Mỗi người đổi tối đa / ngày", type: "number", step: 1 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 }, { k: "on_sale", label: "Đang bán", type: "bool" }];
    const shopCards = shop.map((r) => record({
      title: nameOf[r.item_key] ?? r.item_key, sub: `${r.item_key} · ${fmt(r.cost)} cống hiến · từ cấp ${r.min_level} · ${r.daily_limit}/ngày`, row: r, fields: F,
      extra: r.on_sale ? el("span", { class: "tag green" }, "Đang bán") : el("span", { class: "tag" }, "Ngừng"),
      onSave: async (c) => (await guard(() => api(`/t/sect_shop/${r.item_key}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
      onDelete: async () => confirm(`Bỏ ${nameOf[r.item_key] ?? r.item_key} khỏi Bảo Khố?`) && (await guard(() => api(`/t/sect_shop/${r.item_key}`, { method: "DELETE" }), "Đã bỏ.")) && reload(),
    }));
    const add = record({
      title: "Thêm món vào Bảo Khố", isNew: true, row: { cost: 50, min_level: 1, daily_limit: 1, on_sale: 1, sort: 100 },
      fields: [{ k: "item_key", label: "Vật phẩm", type: "select", options: itemOptions(items.filter((i) => !shop.some((x) => x.item_key === i.item_key))) }, ...F],
      onSave: async (c) => (await guard(() => api("/t/sect_shop", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    return [
      el("h2", {}, "Tông Môn"),
      el("p", { class: "dim" }, `${rows.length} tông môn. Bấm một dòng để sửa thông tin, đổi chức hoặc đưa thành viên ra, xem nhật ký, hoặc giải tán. Chi phí lập, giới hạn người, phần thưởng... ở tab Cài đặt (nhóm Tông Môn).`),
      el("div", { class: "bar" }, q), out,
      el("h2", {}, "Tông Môn Bảo Khố"),
      el("p", { class: "dim" }, "Thành viên đổi điểm cống hiến lấy những món này. Món mở theo cấp tông môn, có giới hạn mỗi ngày."),
      el("div", { class: "grid" }, add, ...shopCards),
    ];
  },

  async settings() {
    const [rows, realms] = await Promise.all([api("/t/settings"), api("/t/realms")]);
    const groups = {};
    for (const r of rows) (groups[r.k.split(".")[0]] ??= []).push(r);
    const NAMES = { class: "Chỉ số nhân vật", exp: "Tu vi & lên cấp", level: "Sức mạnh theo cấp", arena: "Đấu trường", start: "Quà tân thủ", daily: "Quà mỗi ngày", shop: "Đan Các", meditate: "Tu luyện", pvp: "PvP", respawn: "Hồi sinh", fly: "Ngự Kiếm Phi Hành", sect: "Tông Môn", chat: "Trò chuyện", social: "Đạo Hữu", pm: "Truyền Âm", home: "Gia Viên" };
    const card = (r) => {
      const shown = r.k === "fly.realm" ? realms[r.v - 1]?.name ?? "Khoá" : fmt(r.v);
      return record({
        title: r.note || r.k, sub: `${NAMES[r.k.split(".")[0]] ?? r.k.split(".")[0]} · ${r.k} = ${shown}`, row: r,
        // the realm flight opens at: picked by name (stored as its number, counted from 1)
        fields: [r.k === "fly.realm"
          ? { k: "v", label: "Cảnh giới mở khoá Ngự Kiếm Phi Hành (tới tầng 1 cảnh giới này là bay được)", type: "select", wide: true,
            options: [...realms.map((x, i) => [i + 1, x.name]), [realms.length + 1, "(Khoá: chưa ai bay được)"]] }
          : { k: "v", label: r.note || r.k, type: "number", wide: true }],
        onSave: async (c) => (await guard(() => api(`/t/settings/${encodeURIComponent(r.k)}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
      });
    };
    const grp = el("select", {}, [["", "Mọi nhóm"], ...Object.keys(groups).map((g) => [g, NAMES[g] ?? g])].map(([v, l]) => el("option", { value: v }, l)));
    const out = el("div");
    const q = searchBox("Tìm theo ý nghĩa hoặc mã (vd: hồi sinh, fly)...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(rows.filter((r) => (!grp.value || r.k.split(".")[0] === grp.value) && has(t, r.k, r.note, NAMES[r.k.split(".")[0]])), card, `${grp.value}|${t}`));
    };
    grp.addEventListener("change", draw);
    draw();
    return [el("h2", {}, "Cài đặt"), el("p", { class: "dim" }, "Mỗi con số đều có giải thích. Số sai (âm, quá lớn...) sẽ bị từ chối, game không bị ảnh hưởng."), el("div", { class: "bar" }, grp, q), out];
  },

  async cosmetics() {
    await loadAtlas();
    const rows = await api("/t/cosmetics");
    const kind = el("select", {}, [["skin", "Nhân vật"], ["sword", "Phi kiếm (bay)"]].map(([v, l]) => el("option", { value: v }, l)));
    const g = el("select", {}, [["*", "Mọi dòng"], ["a", "Mọi giới tính"], ["m", "Nam"], ["f", "Nữ"]].map(([v, l]) => el("option", { value: v }, l)));
    const state = el("select", {}, [["all", "Tất cả"], ["starter", "Miễn phí (khởi đầu)"], ["sale", "Đang bán"], ["off", "Ngừng bán"], ["special", "Bảo vật (đặc biệt)"]].map(([v, l]) => el("option", { value: v }, l)));
    const q = el("input", { placeholder: "Tìm theo tên...", type: "search" });
    const grid = el("div");
    const F = [
      { k: "name", label: "Tên", wide: true }, { k: "price", label: "Giá (linh thạch)", type: "number", step: 1 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 },
      { k: "starter", label: "Miễn phí (nhân vật: chọn được khi tạo nhân vật; phi kiếm: tặng khi mở khoá bay)", type: "bool" }, { k: "on_sale", label: "Đang bán", type: "bool" },
      { k: "special", label: "Bảo vật: không bán, chỉ tặng (sự kiện, đấu giá)", type: "bool" },
    ];
    const draw = () => {
      // a character is for its gender (or "a": anyone), a flying sword for everyone; "*" shows them all
      const gv = g.value, gOk = (r) => gv === "*" || r.gender === gv;
      const list = rows.filter((r) => r.kind === kind.value && gOk(r) &&
        (state.value === "all" || (state.value === "special" && r.special) || (!r.special && ((state.value === "starter" && r.starter) || (state.value === "sale" && r.on_sale && !r.starter) || (state.value === "off" && !r.on_sale)))) &&
        r.name.toLowerCase().includes(q.value.trim().toLowerCase()));
      const skin = kind.value === "skin";
      const used = new Set(rows.filter((r) => r.kind === kind.value).map((r) => r.idx));
      const have = partIdx(skin ? "skin" : "sword_a");
      const where = skin ? "shared/nhan-vat.js (hình: src/fx/nhanvat/<tên>.js)" : "public/phi-kiem/<số>-<tên>/hinh.png";
      const free = have.filter((i) => !used.has(i));
      // a new row: a character for its own gender, a flying sword for everyone (unless a gender is picked)
      const genderFor = (idx) => (gv !== "*" ? gv : skin ? (skinOf(Number(idx))?.g ?? "a") : "a");
      const add = record({
        title: "Thêm món", sub: free.length ? `${skin ? "nhân vật" : "hình"} chưa có trong Y Các: số ${free.join(", ")}` : skin ? `nhân vật nào cũng đã có; nhân vật mới thêm ở ${where}` : `hình nào cũng đã dùng; thêm hình ${where}`,
        isNew: true, row: { idx: free[0] ?? "", price: 150, starter: 0, on_sale: 1, sort: 0 },
        fields: [{ k: "idx", label: `Số của hình (${where})`, type: "number", step: 1 }, ...F],
        onSave: async (c) => (await guard(() => api("/t/cosmetics", { method: "POST", body: { ...c, kind: kind.value, gender: genderFor(c.idx) } }), "Đã thêm.")) && (await refresh()),
      });
      grid.replaceChildren(el("div", { class: "grid" }, add), ...paged(list, (r) => {
        const card = record({
          title: r.name, sub: `số ${r.idx} · id ${r.id}${r.gender === "m" ? " · nam" : r.gender === "f" ? " · nữ" : ""}`, row: r, fields: F,
          extra: el("span", {}, r.special ? el("span", { class: "tag gold" }, "★ Bảo vật") : r.starter ? el("span", { class: "tag gold" }, "Miễn phí") : null, " ", r.on_sale || r.special ? null : el("span", { class: "tag" }, "Ngừng bán"), " ", el("span", { class: "tag" }, `${r.owners} người có`)),
          onSave: async (c) => (await guard(() => api(`/t/cosmetics/${r.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && (await refresh()),
          onDelete: async () => confirm(`Xóa ${r.name}? ${r.owners} người đang có món này sẽ mất nó.`) && (await guard(() => api(`/t/cosmetics/${r.id}`, { method: "DELETE" }), "Đã xóa.")) && (await refresh()),
        });
        card.prepend(el("div", { class: "thumbhead" }, thumb(r.kind, r.gender, r.idx)));
        return card;
      }, `${kind.value}|${gv}|${state.value}|${q.value.trim().toLowerCase()}`));
    };
    const refresh = async () => {
      rows.splice(0, rows.length, ...(await api("/t/cosmetics")));
      draw();
    };
    for (const s of [kind, g, state]) s.addEventListener("change", draw);
    q.addEventListener("input", draw);
    draw();
    return [el("h2", {}, "Nhân vật & Phi kiếm"), el("p", { class: "dim" }, "Người chơi mua nguyên một nhân vật (không mua tóc, áo riêng). Mỗi nhân vật là một hình pixelfx có rig (tóc, vạt áo bay, chân bước, tay đánh, mắt chớp), khai báo trong shared/nhan-vat.js; số của nhân vật là số ở đó. Nhân vật \"Miễn phí\" là nhân vật khởi đầu của giới tính đó, chọn khi tạo nhân vật; còn lại bán ở Y Các, tab Nhân vật. \"Bảo vật\" không bán và không miễn phí: chỉ có khi được tặng, ở trang người chơi. Phi kiếm (tab Phi hành) dùng để Ngự Kiếm Phi Hành: phi kiếm \"Miễn phí\" là cái cơ bản ai mở khoá bay cũng có; cảnh giới mở khoá đặt ở Thiết lập, dòng fly.realm."), el("div", { class: "bar" }, kind, g, state, q), grid];
  },

  async admins() {
    const rows = await api("/admins");
    const me = $("who").textContent;
    const add = record({
      title: "Thêm admin", isNew: true, sub: "người mới sẽ phải đổi mật khẩu khi đăng nhập lần đầu",
      fields: [{ k: "username", label: "Tên đăng nhập" }, { k: "password", label: "Mật khẩu tạm (8-72 ký tự)" }],
      onSave: async (c) => (await guard(() => api("/admins", { method: "POST", body: c }), "Đã thêm admin.")) && reload(),
    });
    const aout = el("div");
    const aq = searchBox("Tìm admin...", () => adraw());
    const adraw = () => {
      const t = aq.value.trim().toLowerCase();
      aout.replaceChildren(...paged(rows.filter((a) => has(t, a.username)), adminCard, t));
    };
    adraw();
    return [el("h2", {}, "Tài khoản admin"),
      el("div", { class: "bar" }, el("button", { class: "primary", onclick: () => showPw(false) }, "Đổi mật khẩu của tôi")),
      el("div", { class: "grid" }, add), el("div", { class: "bar" }, aq), aout];
    function adminCard(a) {
      return el("div", { class: "card" },
        el("div", { class: "head" }, el("b", {}, a.username), a.username === me ? el("span", { class: "tag gold" }, "Bạn") : null, a.must_change ? el("span", { class: "tag" }, "Chưa đổi mật khẩu") : null),
        el("span", { class: "dim" }, `Tạo: ${when(a.created_at)} · Đăng nhập gần nhất: ${when(a.last_login)}`),
        a.username === me ? null : el("div", { class: "actions" }, el("button", { class: "danger small", onclick: async () => confirm(`Xóa admin ${a.username}?`) && (await guard(() => api(`/admins/${a.id}`, { method: "DELETE" }), "Đã xóa.")) && reload() }, "Xóa")));
    }
  },

  async log() {
    // the newest 100, more on request; searched and paged here
    const all = [];
    let last = null;
    const out = el("div");
    const more = el("button", { class: "small" }, "Tải thêm (cũ hơn)");
    const q = searchBox("Tìm theo admin, thao tác, đối tượng hoặc nội dung...", () => draw());
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      out.replaceChildren(...paged(all.filter((l) => has(t, l.admin, l.action, ACTIONS[l.action], l.target, l.detail)), logItem, t));
    };
    const load = async () => {
      const rows = await guard(() => api(`/log${last ? `?before=${last}` : ""}`));
      if (!rows) return;
      all.push(...rows);
      last = rows.at(-1)?.id ?? last;
      more.hidden = rows.length < 100;
      draw();
    };
    more.addEventListener("click", load);
    await load();
    return [el("h2", {}, "Nhật ký thao tác admin"), el("div", { class: "bar" }, q, more), out];
  },
};

const ACTIONS = {
  login: "đăng nhập", password: "đổi mật khẩu", "admin.add": "thêm admin", "admin.del": "xóa admin", "player.edit": "sửa người chơi", "player.item": "sửa túi đồ",
  "arts.grant": "phát công pháp", "player.summon": "thả quái thử", "player.teach": "truyền công pháp", "player.unteach": "lấy lại công pháp", "player.give": "tặng tóc/áo/vũ khí/phi kiếm", "player.take": "lấy lại tóc/áo/vũ khí/phi kiếm", "player.ban": "khóa tài khoản", "player.unban": "mở khóa", "player.kick": "mời ra khỏi game",
  "player.password": "đặt lại mật khẩu người chơi", "player.delete": "xóa tài khoản", "player.adjust": "chỉnh chỉ số", "player.level": "đặt cảnh giới",
  "player.meditation": "làm mới lượt tu luyện", "player.look": "đổi tên/ngoại hình", "player.buff": "thêm buff", "player.unbuff": "gỡ buff", "player.live": "thao tác trực tiếp",
};
function logItem(l) {
  const [t, a] = l.action.split(".");
  const what = ACTIONS[l.action] ?? `${{ realms: "cảnh giới", items: "vật phẩm", monsters: "yêu thú", skills: "đánh thường", settings: "cài đặt", houses: "nhà ở", cosmetics: "tóc/áo", arts: "công pháp", cong_phap: "công pháp", cong_phap_reqs: "vật phẩm lĩnh ngộ", art_reqs: "yêu cầu công pháp", monster_drops: "rơi đồ" }[t] ?? t} · ${{ edit: "sửa", add: "thêm", del: "xóa" }[a] ?? a}`;
  return el("div", { class: "logitem" }, el("b", {}, l.admin), ` ${what} `, l.target ? el("span", { class: "tag" }, l.target) : null, el("span", { class: "dim" }, ` · ${when(l.at)}`),
    l.detail ? el("div", {}, el("code", {}, l.detail)) : null);
}

// ---------------------------------------------------------------- one player, in detail
const BUFFS = {
  hp: ["Sinh lực", -50, 500], atk: ["Công", -50, 500], def: ["Thủ", -50, 500], spd: ["Tốc độ", -50, 100],
  exp: ["Tu vi nhận được", -100, 1000], stones: ["Linh thạch nhận được", -100, 1000], med: ["Tốc độ tu luyện", -100, 1000],
};
const RES = [["stones", "Linh thạch", "stones"], ["exp", "Tu vi", "exp"], ["rank", "Điểm đấu trường", "rank_points"], ["kills", "Hạ", "kills"], ["deaths", "Bại", "deaths"]];
const LIVE = [["heal", "Hồi đầy máu"], ["revive", "Hồi sinh ngay"], ["spawn", "Về điểm xuất hiện"], ["cooldowns", "Làm mới hồi chiêu"]];
const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 86400 ? `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ` : s >= 3600 ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút` : `${Math.ceil(s / 60)} phút`;
};

async function playerView(id) {
  const main = $("main");
  const [first, items, cos, realms, arts, mons] = await Promise.all([api(`/players/${id}`), api("/t/items"), (async () => (await loadAtlas(), api("/t/cosmetics")))(), api("/t/realms"), api("/cong-phap"), api("/t/monsters")]);
  // drop a monster by the player to try it (one killed this way never comes back)
  const summonSel = el("select", {}, mons.filter((m) => m.style !== "none").map((m) => el("option", { value: m.type }, `${m.name} (${m.style === "ranged" ? "đánh xa" : "đánh gần"})`)));
  // levels by realm, for the "straight to a realm" picker
  const levels = [];
  for (const r of realms) for (let s = 1; s <= r.stages; s++) levels.push(`${r.name} tầng ${s}`);
  let p = first, timer = null;
  const act = async (fn, ok) => {
    const out = await guard(fn, ok);
    if (out) draw(out);
    return out;
  };
  // a small row: label, current value, an amount, and add / take / set
  const stepper = (label, cur, sub, onOp, { min = 0 } = {}) => {
    const n = el("input", { type: "number", min, step: 1, value: "", placeholder: "số lượng", inputmode: "numeric" });
    const go = (op) => () => {
      if (n.value === "" || !Number.isFinite(Number(n.value))) return toast("Nhập số trước.", false);
      onOp(op, Math.round(Number(n.value)));
    };
    return el("div", { class: "step" },
      el("div", { class: "lbl" }, el("b", {}, label), el("span", { class: "cur" }, fmt(cur)), sub ? el("small", { class: "dim" }, sub) : null),
      el("div", { class: "ops" }, n, el("button", { class: "small", onclick: go("add"), title: "Cộng thêm" }, "+ Cộng"), el("button", { class: "small", onclick: go("sub"), title: "Trừ bớt (không xuống dưới 0)" }, "− Trừ"),
        el("button", { class: "small", onclick: go("set"), title: "Đặt đúng bằng" }, "= Đặt")));
  };

  function liveBox(p) {
    const L = p.live;
    if (!L) return el("div", { class: "dim" }, "Đang offline: các thay đổi được lưu thẳng vào database và có hiệu lực khi người này vào game.");
    return el("div", { class: "livebox" },
      el("div", { class: "kv" },
        el("span", {}, "Đang ở ", el("b", {}, L.map), ` (${L.x}, ${L.y})`),
        el("span", {}, "Sinh lực ", el("b", {}, `${fmt(L.hp)} / ${fmt(L.maxHp)}`)),
        el("span", {}, "Công ", el("b", {}, L.atk), " · Thủ ", el("b", {}, L.def), " · Tốc ", el("b", {}, L.spd)),
        L.dead ? el("span", { class: "tag red" }, "Đang tử trận") : null, L.meditating ? el("span", { class: "tag green" }, "Đang tu luyện") : null),
      el("div", { class: "dim" }, `Chưa lưu: +${fmt(L.pending.exp + L.pending.med)} tu vi, +${fmt(L.pending.stones)} linh thạch · đang ghi: +${fmt(L.saving.exp + L.saving.med)} tu vi, +${fmt(L.saving.stones)} linh thạch`),
      el("div", { class: "actions left" }, LIVE.map(([a, l]) => el("button", { class: "small", onclick: () => act(() => api(`/players/${p.id}/live`, { method: "POST", body: { action: a } }), `${l}: xong.`) }, l)),
      el("div", { class: "bar" }, summonSel, el("button", { class: "small", onclick: () => act(() => api(`/players/${p.id}/summon`, { method: "POST", body: { type: summonSel.value } }), "Đã thả quái cạnh người chơi.") }, "Thả quái thử")),
        el("button", { class: "small", onclick: () => guard(() => api(`/players/${p.id}/kick`, { method: "POST", body: {} }), "Đã mời ra khỏi game.").then(() => setTimeout(async () => draw(await api(`/players/${p.id}`)), 600)) }, "Mời ra khỏi game")));
  }

  function draw(np) {
    p = np;
    // a part open in the modal stays open across the redraw an edit causes
    const reopen = modal?.card.dataset.mkey;
    closeModal();
    const parts = [el("button", { class: "ghost", onclick: () => go("players") }, "← Danh sách")];
    // ---- header: who, where, right now (the live part refreshes itself while they're online)
    const liveHolder = el("div");
    parts.push(el("div", { class: "card" },
      el("div", { class: "head" }, el("span", { class: `dot ${p.online ? "on" : ""}` }), el("b", {}, p.name ?? "(chưa tạo nhân vật)"), el("span", { class: "dim" }, `@${p.username} · id ${p.id}`),
        p.banned ? el("span", { class: "tag red" }, `Bị khóa${p.ban_reason ? `: ${p.ban_reason}` : ""}`) : null, el("span", { class: "grow" }),
        el("button", { class: "small ghost", onclick: async () => draw(await api(`/players/${p.id}`)) }, "↻ Làm mới")),
      el("span", { class: "dim" }, `${p.realm ?? ""}${p.realm ? " · " : ""}Đăng ký ${when(p.created_at)}`),
      liveHolder));
    liveHolder.replaceChildren(liveBox(p));

    if (p.name !== null) {
      // ---- numbers, one at a time
      const res = section("Tài nguyên & chỉ số", `${p.realm} · 💎 ${fmt(p.stones)} linh thạch`,
        el("p", { class: "dim" }, p.online ? "Đang online: mỗi thay đổi đi chung hàng đợi với việc lưu tiến trình, mua đồ, dùng đan của người này, nên không bao giờ ghi đè hay mất phần họ vừa kiếm được." : "Mỗi thay đổi là một phép cộng/trừ nguyên tử trong database; trừ không bao giờ xuống dưới 0."));
      for (const [field, label, col] of RES)
        res.append(stepper(label, p[col], field === "exp" ? p.realm : null, (op, value) => act(() => api(`/players/${p.id}/adjust`, { method: "POST", body: { field, op, value } }), `${label}: đã cập nhật.`)));
      const lv = el("select", {}, levels.map((n, i) => el("option", { value: i + 1, selected: i + 1 === p.level }, `Cấp ${i + 1} · ${n}`)));
      res.append(el("div", { class: "step" }, el("div", { class: "lbl" }, el("b", {}, "Cảnh giới"), el("span", { class: "cur" }, p.realm)),
        el("div", { class: "ops" }, lv, el("button", { class: "small", onclick: () => confirm(`Đặt tu vi về đầu ${levels[lv.value - 1]}?`) && act(() => api(`/players/${p.id}/level`, { method: "POST", body: { level: Number(lv.value) } }), "Đã đặt cảnh giới.") }, "Đặt cảnh giới"))));
      res.append(el("div", { class: "step" }, el("div", { class: "lbl" }, el("b", {}, "Tu luyện hôm nay"), el("span", { class: "cur" }, `còn ${fmt(p.medLeft)}`)),
        el("div", { class: "ops" }, el("button", { class: "small", onclick: () => act(() => api(`/players/${p.id}/meditation`, { method: "POST" }), "Đã làm mới lượt tu luyện hôm nay.") }, "Làm mới lượt tu luyện"))));
      parts.push(res);

      // ---- buffs
      const now = Date.now();
      const stat = el("select", {}, Object.entries(BUFFS).map(([k, [n, lo, hi]]) => el("option", { value: k }, `${n} (${lo}%…+${hi}%)`)));
      const pct = el("input", { type: "number", step: 1, placeholder: "% (vd 20, hoặc -10)", inputmode: "decimal" });
      const hours = el("input", { type: "number", step: 0.5, min: 0, placeholder: "số giờ (trống = vĩnh viễn)", inputmode: "decimal" });
      const note = el("input", { placeholder: "ghi chú (vd: thưởng sự kiện)" });
      const sum = {};
      for (const b of p.buffs) sum[b.stat] = (sum[b.stat] ?? 0) + b.pct;
      parts.push(section("Buff riêng", p.buffs.length ? Object.entries(sum).map(([k, v]) => `${BUFFS[k]?.[0] ?? k} ${v > 0 ? "+" : ""}${v}%`).join(" · ") : "chưa có buff nào",
        el("p", { class: "dim" }, "Mỗi buff tăng (hoặc giảm) một chỉ số theo %, có hạn hoặc vĩnh viễn; nhiều buff cùng chỉ số thì cộng dồn. Công/Thủ/Sinh lực/Tốc độ không áp dụng ở đấu trường PvP để giữ công bằng."),
        Object.keys(sum).length ? el("div", { class: "chips" }, Object.entries(sum).map(([k, v]) => el("span", { class: `tag ${v > 0 ? "green" : "red"}` }, `${BUFFS[k]?.[0] ?? k} ${v > 0 ? "+" : ""}${v}%`))) : null,
        el("div", { class: "list" }, p.buffs.length ? p.buffs.map((b) => el("div", { class: "buff" },
          el("b", {}, `${BUFFS[b.stat]?.[0] ?? b.stat} ${b.pct > 0 ? "+" : ""}${b.pct}%`),
          el("span", { class: "dim" }, b.until === null ? "vĩnh viễn" : `còn ${ago(b.until - now)}`, b.note ? ` · ${b.note}` : "", ` · bởi ${b.by}`),
          el("span", { class: "grow" }),
          el("button", { class: "small danger", onclick: () => confirm("Gỡ buff này?") && act(() => api(`/players/${p.id}/buffs/${b.id}`, { method: "DELETE" }), "Đã gỡ buff.") }, "Gỡ")))
          : el("span", { class: "dim" }, "Chưa có buff nào.")),
        el("div", { class: "fields" }, el("label", {}, "Chỉ số", stat), el("label", {}, "Phần trăm", pct), el("label", {}, "Thời hạn (giờ)", hours), el("label", {}, "Ghi chú", note)),
        el("div", { class: "actions" }, el("button", { class: "primary small", onclick: () => act(() => api(`/players/${p.id}/buffs`, { method: "POST", body: { stat: stat.value, pct: Number(pct.value), hours: hours.value === "" ? null : Number(hours.value), note: note.value } }), "Đã thêm buff.") }, "Thêm buff")),
        p.expiredBuffs.length ? el("details", {}, el("summary", { class: "dim" }, `Buff đã hết hạn (${p.expiredBuffs.length})`),
          el("div", { class: "list" }, p.expiredBuffs.map((b) => el("div", { class: "dim" }, `${BUFFS[b.stat]?.[0] ?? b.stat} ${b.pct}% · hết ${when(b.expires_at)}${b.note ? ` · ${b.note}` : ""} · bởi ${b.created_by}`)))) : null));

      // ---- the bag: the pills, and every book or material they hold; any item can be given from the picker
      const bag = section("Túi đồ", `${Object.values(p.inventory).filter((n) => n > 0).length} loại vật phẩm`);
      for (const it of items.filter((i) => (i.kind ?? "pill") === "pill" || (p.inventory[i.item_key] ?? 0) > 0))
        bag.append(stepper(it.name, p.inventory[it.item_key] ?? 0, it.kind === "pill" ? (it.on_sale ? null : "ngừng bán") : it.kind === "book" ? "bí kíp" : "nguyên liệu", (op, value) => act(() => api(`/players/${p.id}/items`, { method: "POST", body: { item: it.item_key, op, value } }), `${it.name}: đã cập nhật.`)));
      const give = el("select", {}, ITEM_KIND.map(([k, l]) => el("optgroup", { label: l }, items.filter((i) => (i.kind ?? "pill") === k).map((i) => el("option", { value: i.item_key }, i.name)))));
      const gqty = el("input", { type: "number", min: 1, step: 1, value: 1, inputmode: "numeric" });
      bag.append(el("div", { class: "bar" }, give, gqty, el("button", { class: "small", onclick: () => act(() => api(`/players/${p.id}/items`, { method: "POST", body: { item: give.value, op: "add", value: Number(gqty.value) } }), "Đã tặng.") }, "Tặng")));
      parts.push(bag);

      // ---- công pháp: what they learned, the bar; teach or take back without spending anything
      const known = new Set(p.learned);
      const artName = (k) => arts.find((a) => a.key === k)?.name ?? k;
      const teach = el("select", {}, arts.filter((a) => !a.starter && !known.has(a.key)).map((a) => el("option", { value: a.key }, `${a.name} (bậc ${a.tier})`)));
      parts.push(section(`Công pháp (${p.learned.length} đã lĩnh ngộ)`, `thanh nút: ${p.slots.filter(Boolean).map(artName).join(", ") || "trống"}`,
        el("p", { class: "dim" }, `Thanh nút: ${p.slots.map((k, i) => `${i + 1}. ${k ? artName(k) : "trống"}`).join(" · ")}`),
        el("div", { class: "chips" }, p.learned.length ? p.learned.map((k) => el("span", { class: "chip" }, el("span", {}, artName(k)),
          el("button", { class: "small danger", title: "Lấy lại", onclick: () => confirm(`Lấy lại ${artName(k)}? (Không hoàn vật phẩm.)`) && act(() => api(`/players/${p.id}/arts`, { method: "POST", body: { key: k, learn: false } }), "Đã lấy lại.") }, "✕")))
          : el("span", { class: "dim" }, "Chưa lĩnh ngộ môn nào (ngoài các môn ai cũng biết).")),
        el("div", { class: "bar" }, teach, el("button", { class: "small", onclick: () => teach.value && act(() => api(`/players/${p.id}/arts`, { method: "POST", body: { key: teach.value, learn: true } }), "Đã truyền công pháp.") }, "Truyền thụ"))));

      // ---- name and look
      const nm = el("input", { value: p.name });
      const gsel = el("select", {}, [["m", "Nam"], ["f", "Nữ"]].map(([v, l]) => el("option", { value: v, selected: v === p.gender }, l)));
      // the character (0: their gender's own) and the flying sword, each with its picture beside it
      const pickBox = el("div", { class: "lookgrid" });
      const choice = { skin: p.skin ?? 0, sword: p.sword ?? 0 };
      const drawPicks = () => {
        pickBox.replaceChildren(...[["skin", "Nhân vật"], ["sword", "Phi kiếm"]].map(([kind, label]) => {
          const have = partIdx(kind === "sword" ? "sword_a" : kind), pic = el("span", { class: "lpic" });
          const show = () => pic.replaceChildren(choice[kind] || kind === "sword" ? thumb(kind, "a", choice[kind], "") : el("small", { class: "dim" }, "theo giới"));
          const sel = el("select", {}, ...(kind === "sword" ? [] : [el("option", { value: 0 }, "0 · khởi đầu")]),
            ...have.map((i) => el("option", { value: i, selected: choice[kind] === i }, kind === "skin" ? `${i} · ${skinOf(i)?.name ?? ""}${skinOf(i)?.g === "f" ? " (nữ)" : skinOf(i)?.g === "m" ? " (nam)" : ""}` : `${i}${cos.find((x) => x.kind === kind && x.idx === i)?.starter ? " (miễn phí)" : ""}`)));
          sel.value = String(choice[kind]);
          sel.addEventListener("change", () => ((choice[kind] = Number(sel.value)), show()));
          show();
          return el("label", { class: "lookpick" }, el("b", {}, label), pic, sel);
        }));
      };
      gsel.addEventListener("change", drawPicks);
      drawPicks();
      parts.push(section("Tên & ngoại hình", `${p.name} · ${p.gender === "f" ? "nữ" : "nam"}`,
        el("p", { class: "dim" }, "Đổi xong mọi người trong game thấy ngay, người chơi không phải vào lại. Admin chọn được mọi kiểu, kể cả kiểu người này chưa mua."),
        el("div", { class: "fields" }, el("label", {}, "Đạo hiệu", nm), el("label", {}, "Giới tính", gsel)),
        pickBox,
        el("div", { class: "actions" }, el("button", { class: "primary small", onclick: () => {
          const body = {};
          if (nm.value.trim() !== p.name) body.name = nm.value;
          if (gsel.value !== p.gender) body.gender = gsel.value;
          for (const k of Object.keys(choice)) if (choice[k] !== (p[k] ?? 0)) body[k] = choice[k];
          if (!Object.keys(body).length) return toast("Chưa có thay đổi.");
          act(() => api(`/players/${p.id}/look`, { method: "PATCH", body }), "Đã đổi tên/ngoại hình.");
        } }, "Lưu tên & ngoại hình"))));

      // ---- fashion and flying swords owned; bảo vật listed first in the gift picker
      const mine = new Set(p.owned.map((o) => o.id));
      const giftable = cos.filter((c) => (c.gender === p.gender || c.gender === "a") && (!c.starter || c.special) && !mine.has(c.id));
      const label = (c) => `${KIND_LABEL[c.kind] ?? c.kind} · ${c.name}${c.special ? "" : ` (${c.price})`}`;
      const pick = el("select", {},
        el("optgroup", { label: "★ Bảo vật (chỉ tặng)" }, giftable.filter((c) => c.special).map((c) => el("option", { value: c.id }, label(c)))),
        el("optgroup", { label: "Đồ bán ở Y Các" }, giftable.filter((c) => !c.special).map((c) => el("option", { value: c.id }, label(c)))));
      parts.push(section(`Thời trang & phi kiếm đang có (${p.owned.length})`, p.owned.length ? p.owned.map((o) => o.name).slice(0, 4).join(", ") + (p.owned.length > 4 ? "…" : "") : "chỉ đồ miễn phí",
        el("div", { class: "chips" }, p.owned.length ? p.owned.map((o) => el("span", { class: "chip" }, thumb(o.kind, o.gender, o.idx, ""), el("span", {}, o.special ? "★ " : "", o.name, el("small", { class: "dim" }, o.special ? " · bảo vật" : ` · trả ${fmt(o.paid)}`)),
          el("button", { class: "small danger", title: "Lấy lại", onclick: () => confirm(`Lấy lại ${o.name} của người này?`) && act(() => api(`/players/${p.id}/cosmetics`, { method: "POST", body: { id: o.id, own: false } }), "Đã lấy lại.") }, "✕")))
          : el("span", { class: "dim" }, "Chưa mua món nào (các món miễn phí ai cũng có).")),
        el("div", { class: "bar" }, pick, el("button", { class: "small", onclick: () => pick.value && act(() => api(`/players/${p.id}/cosmetics`, { method: "POST", body: { id: Number(pick.value), own: true } }), "Đã tặng.") }, "Tặng"))));
    }

    // ---- Gia Viên: the houses had; give one (unlocking the Gia Viên if need be), or take one back
    if (p.home) {
      const H = p.home, had = new Set(H.owned.map((o) => o.house)), nameOf = (k) => H.catalog.find((c) => c.id === k)?.name ?? k;
      const givable = H.catalog.filter((c) => !had.has(c.id));
      const pickH = el("select", {}, givable.map((c) => el("option", { value: c.id }, `${c.name} (${c.price ? fmt(c.price) + " linh thạch" : "không bán"})`)));
      parts.push(section("Gia Viên", H.unlocked ? `đang ở ${H.catalog.some((c) => c.id === H.house) ? nameOf(H.house) : H.defaultHouse}` : "chưa mở khoá",
        el("p", { class: "dim" }, "Tặng nhà: người chơi có ngay, chưa mở khoá Gia Viên thì được mở miễn phí. Thu hồi: nếu đang ở nhà đó thì về nhà mặc định. Giá từng nhà chỉnh ở tab Cài đặt, nhóm Gia Viên (home.price.*)."),
        el("div", { class: "chips" }, H.owned.length
          ? H.owned.map((o) => el("span", { class: "chip" }, el("span", {}, nameOf(o.house), el("small", { class: "dim" }, o.paid ? ` · trả ${fmt(o.paid)}` : " · được tặng")),
            el("button", { class: "small danger", title: "Thu hồi", onclick: () => confirm(`Thu hồi ${nameOf(o.house)} của người này?`) && act(() => api(`/players/${p.id}/houses`, { method: "POST", body: { house: o.house, give: false } }), "Đã thu hồi.") }, "✕")))
          : el("span", { class: "dim" }, `Chỉ có ${H.defaultHouse}${H.unlocked ? "" : " (khi mở khoá)"}.`)),
        givable.length ? el("div", { class: "bar" }, pickH, el("button", { class: "small", onclick: () => pickH.value && confirm(`Tặng ${nameOf(pickH.value)} cho người này?`) && act(() => api(`/players/${p.id}/houses`, { method: "POST", body: { house: pickH.value, give: true } }), "Đã tặng nhà.") }, "Tặng nhà")) : null));
    }

    // ---- Câu Cá: what they fish with, how much, the Ngư Lục (rods and baits are in the bag above: give or take them there)
    if (p.fishing) {
      const F = p.fishing, log = Object.entries(F.log ?? {});
      parts.push(section("Câu Cá", `${fmt(F.catches)} con lên bờ · ${log.length} loại`,
        el("p", { class: "dim" }, `Đang dùng: ${F.rod ?? "chưa có cần"} · ${F.bait ?? "chưa có mồi"}. Lần cá cắn: ${fmt(F.casts)}. Đã bán cá được ${fmt(F.sold)} linh thạch. Cần và mồi là vật phẩm (loại Cần câu, Mồi câu): tặng hay lấy lại ở mục túi đồ; giá ở tab Vật phẩm.`),
        el("div", { class: "chips" }, log.length ? log.map(([k, l]) => el("span", { class: "chip" }, el("span", {}, k, el("small", { class: "dim" }, ` · ${fmt(l.n)} con · nặng nhất ${(l.best / 1000).toFixed(2)} cân`))))
          : el("span", { class: "dim" }, "Chưa câu được con nào."))));
    }

    // ---- Đạo Lữ: their dao lu and ring now (part them), the marriages they had, their highest affinities, proposals
    if (p.daolu) {
      const D = p.daolu;
      parts.push(section("Đạo Lữ", D.spouse ? `♥ ${D.spouse.name} · ${D.spouse.ringName}` : "chưa có",
        D.spouse ? el("div", { class: "bar" }, el("span", {}, `Đạo Lữ: ${D.spouse.name} (ID ${D.spouse.uid}) · ${D.spouse.ringName} · +${D.spouse.buff.hp}% sinh lực, +${D.spouse.buff.atk}% công, +${D.spouse.buff.def}% thủ, +${D.spouse.buff.spd}% tốc độ`),
          el("button", { class: "small danger", onclick: () => confirm(`Giải trừ Đạo Lữ với ${D.spouse.name}? Cả hai mất nhẫn và buff.`) && act(() => api("/daolu/divorce", { method: "POST", body: { uid: p.id } }), "Đã giải trừ.") }, "Giải trừ")) : null,
        el("p", { class: "dim" }, "Hảo cảm cao nhất:"),
        el("div", { class: "chips" }, D.affinity.length ? D.affinity.map((x) => el("span", { class: "chip" }, el("span", {}, x.name, el("small", { class: "dim" }, ` · ♥ ${x.points}/100 · ${fmt(x.roses)} bông`)))) : el("span", { class: "dim" }, "Chưa tặng hay nhận hoa.")),
        D.proposals.length ? el("p", { class: "dim" }, `Cầu hôn đang chờ: ${D.proposals.map((x) => `${x.from} → ${x.to} (${x.ring})`).join("; ")}`) : null,
        el("p", { class: "dim" }, "Lịch sử:"),
        el("div", { class: "chips" }, D.history.length ? D.history.map((m) => el("span", { class: "chip" }, el("span", {}, `${m.partner} · ${m.ringName}`, el("small", { class: "dim" }, ` · ${when(m.created_at)}${m.ended_at ? ` → ${when(m.ended_at)}` : " → nay"}`)))) : el("span", { class: "dim" }, "Chưa kết Đạo Lữ lần nào."))));
    }

    if (p.chinhta) {
      const C = p.chinhta, F = { c: "Chính Phái", t: "Tà Phái" }, RES = { w: "Thắng", l: "Thua", d: "Hòa", x: "Rời trận" };
      parts.push(section("Chính Tà", `${F[C.faction] ?? "chưa chọn phe"} · ${fmt(C.points)} điểm`,
        el("p", {}, `Phe: ${F[C.faction] ?? "chưa chọn"}${C.changedAt ? ` (đổi lần cuối ${when(C.changedAt)})` : ""} · Điểm Chính Tà: ${fmt(C.points)} (cộng/trừ và đặt phe ở tab Chính Tà)`),
        el("div", { class: "chips" }, C.last.length ? C.last.map((r) => el("span", { class: "chip" }, el("span", {}, `#${r.id} ${r.text} · ${RES[r.result]}${r.mvp ? " ★" : ""}`, el("small", { class: "dim" }, ` · ${r.kills}/${r.deaths}/${r.assists} · +${r.points}`)))) : el("span", { class: "dim" }, "Chưa đánh trận nào."))));
    }

    // ---- chat: barred for a while (every channel and Truyền Âm)
    const muteMin = el("select", {}, [[10, "10 phút"], [60, "1 giờ"], [360, "6 giờ"], [1440, "1 ngày"], [10080, "7 ngày"], [43200, "30 ngày"]].map(([v, l]) => el("option", { value: v }, l)));
    parts.push(section("Trò chuyện", p.chat_muted_until ? `cấm chat đến ${when(p.chat_muted_until)}` : "đang được chat",
      el("p", { class: "dim" }, "Cấm chat: không nói được ở kênh Thế Giới, Khu Vực, Tông Môn và không Truyền Âm được. Có hiệu lực ngay."),
      el("div", { class: "bar" }, muteMin,
        el("button", { class: "small danger", onclick: () => act(() => api(`/players/${p.id}/mute`, { method: "POST", body: { minutes: Number(muteMin.value) } }), "Đã cấm chat.") }, "Cấm chat"),
        p.chat_muted_until ? el("button", { class: "small", onclick: () => act(() => api(`/players/${p.id}/mute`, { method: "POST", body: { minutes: 0 } }), "Đã bỏ cấm chat.") }, "Bỏ cấm") : null)));

    // ---- the account
    const reason = el("input", { placeholder: "Lý do khóa (người chơi sẽ thấy)", value: p.ban_reason ?? "" });
    const pw = el("input", { placeholder: "Mật khẩu mới cho người chơi (6-72 ký tự)", type: "text", autocomplete: "off" });
    parts.push(section("Tài khoản", p.banned ? "đang bị khóa" : "khóa, đặt lại mật khẩu, xóa",
      el("div", { class: "bar" }, reason, el("button", { class: p.banned ? "small" : "small danger", onclick: () => act(() => api(`/players/${p.id}/ban`, { method: "POST", body: { banned: !p.banned, reason: reason.value } }), p.banned ? "Đã mở khóa." : "Đã khóa tài khoản.") }, p.banned ? "Mở khóa" : "Khóa tài khoản")),
      el("div", { class: "bar" }, pw, el("button", { class: "small", onclick: async () => (await guard(() => api(`/players/${p.id}/password`, { method: "POST", body: { password: pw.value } }), "Đã đặt lại mật khẩu.")) && (pw.value = "") }, "Đặt lại mật khẩu")),
      el("div", { class: "actions" }, el("button", { class: "small danger", onclick: async () => {
        const c = prompt(`Xóa vĩnh viễn tài khoản này cùng nhân vật, túi đồ và mọi thứ đã mua.\nGõ tên đăng nhập "${p.username}" để xác nhận:`);
        if (c === null) return;
        if (await guard(() => api(`/players/${p.id}`, { method: "DELETE", body: { confirm: c } }), "Đã xóa tài khoản.")) go("players");
      } }, "Xóa tài khoản"))));

    // ---- history
    const table = (heads, rows) => el("div", { class: "scrollx" }, el("table", { class: "simple" }, el("tr", {}, heads.map((h) => el("th", {}, h))), rows));
    parts.push(section("Lịch sử", `${p.history.length} lần admin chỉnh · ${p.pvp.length} trận PvP · ${p.buys.length} lần mua`,
      el("details", { open: true }, el("summary", {}, `Admin đã chỉnh (${p.history.length})`), p.history.length ? el("div", { class: "list" }, p.history.map(logItem)) : el("p", { class: "dim" }, "Chưa có.")),
      el("details", {}, el("summary", {}, `PvP gần đây (${p.pvp.length})`), table(["Người hạ", "Người bị hạ", "Thưởng", "Lúc"], p.pvp.map((x) => el("tr", {}, el("td", {}, x.killer ?? x.killer_id), el("td", {}, x.victim ?? x.victim_id), el("td", {}, x.rewarded ? "có" : "không"), el("td", {}, when(x.at)))))),
      el("details", {}, el("summary", {}, `Mua ở Đan Các (${p.buys.length})`), table(["Món", "SL", "Giá", "Lúc"], p.buys.map((b) => el("tr", {}, el("td", {}, b.item), el("td", {}, b.qty), el("td", {}, fmt(b.price)), el("td", {}, when(b.created_at))))))));

    main.replaceChildren(el("div", { class: "list" }, parts));
    const again = reopen && main.querySelector(`[data-mkey="${CSS.escape(reopen)}"]`);
    if (again) openModal(again);
    // while they're online, keep the live box fresh (only that box: whatever is being typed elsewhere stays)
    clearTimeout(timer);
    const tick = async () => {
      if (tab !== "players" || !document.body.contains(liveHolder)) return;
      const fresh = await api(`/players/${p.id}`).catch(() => null);
      if (!fresh || !document.body.contains(liveHolder)) return;
      liveHolder.replaceChildren(liveBox(fresh));
      if (fresh.online) timer = setTimeout(tick, 4000);
    };
    if (p.online) timer = setTimeout(tick, 4000);
  }
  draw(p);
  scrollTo(0, 0);
}

// ---------------------------------------------------------------- start
if (token)
  api("/me").then((me) => (me.mustChange ? showPw(true) : start(me.username))).catch(() => show("login"));
else show("login");
