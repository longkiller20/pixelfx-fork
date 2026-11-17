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
  const head = el("div", { class: "head" }, el("b", {}, title ?? ""), sub ? el("span", { class: "dim" }, sub) : null, el("span", { class: "grow" }), extra ?? null);
  const save = el("button", { class: "primary small", type: "submit" }, saveLabel ?? (isNew ? "Thêm" : "Lưu"));
  const actions = el("div", { class: "actions" }, onDelete ? el("button", { type: "button", class: "danger small", onclick: () => onDelete() }, "Xóa") : null, save);
  card.append(head, box, actions);
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

// ---------------------------------------------------------------- hair and robe thumbnails, from the game's own atlases
let atlas = null;
async function loadAtlas() {
  if (atlas) return atlas;
  const meta = await (await fetch("/avatar/avatar.json")).json();
  const imgs = {};
  await Promise.all(["hair_m", "hair_f", "robe_m", "robe_f"].map(async (k) => {
    const i = new Image();
    i.src = `/avatar/${k}.png`;
    await i.decode();
    imgs[k] = i;
  }));
  return (atlas = { meta, imgs });
}
function thumb(kind, g, idx, cls = "thumb") {
  const c = el("canvas", { class: cls, width: 64, height: 64 });
  if (!atlas) return c;
  const m = atlas.meta[`${kind}_${g}`]?.[idx];
  if (!m) return c;
  const [x, y, w, h] = m, s = Math.min(64 / w, 64 / h), g2 = c.getContext("2d");
  g2.imageSmoothingEnabled = false;
  g2.drawImage(atlas.imgs[`${kind}_${g}`], x, y, w, h, (64 - w * s) / 2, (64 - h * s) / 2, w * s, h * s);
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
  } catch (e) {
    main.replaceChildren(el("p", { class: "err" }, e.message));
  }
}
const reload = () => go(tab);

// ---------------------------------------------------------------- the tabs
const SKILL_PARAMS = { melee: ["range", "arc"], bolt: ["range", "speed", "r"], zone: ["dist", "r", "delay", "slow", "slowDur"] };
const PARAM_LABEL = { range: "Tầm (px)", arc: "Góc chém (radian)", speed: "Tốc độ bay (px/giây)", r: "Bán kính (px)", dist: "Khoảng cách (px)", delay: "Trễ trước khi nổ (giây)", slow: "Làm chậm (0-1)", slowDur: "Thời gian chậm (giây)" };
const SKILL_TYPE = [["melee", "Cận chiến"], ["bolt", "Phóng (đạn bay)"], ["zone", "Trận pháp (vùng)"]];

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
    const list = el("div", { class: "list" });
    const load = async () => {
      const rows = await guard(() => api(`/players?q=${encodeURIComponent(q.value.trim())}&sort=${sort.value}`));
      if (!rows) return;
      list.replaceChildren(...(rows.length ? rows.map((p) => el("div", { class: "row", onclick: () => playerView(p.id) },
        el("span", { class: `dot ${p.online ? "on" : ""}`, title: p.online ? "Đang online" : "Offline" }),
        el("div", { class: "main" }, el("b", {}, p.name ?? "(chưa tạo nhân vật)"), el("small", {}, `@${p.username} · id ${p.id}`)),
        el("div", { class: "nums" }, p.realm ? el("span", {}, p.realm) : null, p.stones !== null ? el("span", {}, `💎 ${fmt(p.stones)}`) : null,
          p.banned ? el("span", { class: "tag red" }, "Bị khóa") : null))) : [el("p", { class: "dim" }, "Không tìm thấy ai.")]));
    };
    let t;
    q.addEventListener("input", () => (clearTimeout(t), (t = setTimeout(load, 300))));
    sort.addEventListener("change", load);
    wrap.append(el("h2", {}, "Người chơi"), el("div", { class: "bar" }, q, sort), list);
    await load();
    return wrap;
  },

  async realms() {
    const rows = await api("/t/realms");
    let L = 0;
    const cards = rows.map((r, i) => {
      const from = L + 1;
      L += r.stages;
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
        title: r.name, sub: `cấp ${from}-${L}`, row: r,
        extra: el("span", {}, el("button", { type: "button", class: "small", onclick: () => move(-1), disabled: i === 0 }, "↑"), " ",
          el("button", { type: "button", class: "small", onclick: () => move(1), disabled: i === rows.length - 1 }, "↓")),
        fields: [{ k: "name", label: "Tên cảnh giới" }, { k: "stages", label: "Số tầng", type: "number", step: 1 }],
        onSave: async (c) => (await guard(() => api(`/t/realms/${r.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
        onDelete: async () => confirm(`Xóa cảnh giới ${r.name}? Cấp của người chơi sẽ tính lại theo danh sách mới.`) &&
          (await guard(() => api(`/t/realms/${r.id}`, { method: "DELETE" }), "Đã xóa.")) && reload(),
      });
    });
    const add = record({
      title: "Thêm cảnh giới (vào cuối)", isNew: true, row: { stages: 5 },
      fields: [{ k: "name", label: "Tên cảnh giới" }, { k: "stages", label: "Số tầng", type: "number", step: 1 }],
      onSave: async (c) => (await guard(() => api("/t/realms", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    return [el("h2", {}, "Cảnh giới"), el("p", { class: "dim" }, `Tổng ${L} cấp. Mỗi cảnh giới có một số tầng; cấp tối đa là tổng số tầng. Dùng ↑ ↓ để đổi thứ tự.`), el("div", { class: "grid" }, add, cards)];
  },

  async items() {
    const rows = await api("/t/items");
    const F = [
      { k: "name", label: "Tên" }, { k: "price", label: "Giá (linh thạch)", type: "number", step: 1 },
      { k: "heal", label: "Hồi sinh lực (0-1)", type: "number", step: 0.05, hint: "0.4 = 40% sinh lực tối đa" },
      { k: "exp_base", label: "Tu vi cộng", type: "number", step: 1 }, { k: "exp_per_level", label: "Tu vi thêm mỗi cấp", type: "number", step: 1 },
      { k: "cooldown", label: "Hồi (giây)", type: "number", step: 0.5 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 },
      { k: "on_sale", label: "Đang bán", type: "bool" }, { k: "description", label: "Mô tả", type: "textarea", wide: true },
    ];
    const add = record({
      title: "Thêm đan dược", isNew: true, row: { price: 10, heal: 0, exp_base: 0, exp_per_level: 0, cooldown: 1, on_sale: 1, sort: 10 },
      fields: [{ k: "item_key", label: "Mã (chữ thường, không dấu)", hint: "vd: longhuyet" }, ...F],
      onSave: async (c) => (await guard(() => api("/t/items", { method: "POST", body: c }), "Đã thêm.")) && reload(),
    });
    return [
      el("h2", {}, "Đan dược (Đan Các)"),
      el("p", { class: "dim" }, "Muốn bỏ một loại, hãy bỏ chọn \"Đang bán\" thay vì xóa: người chơi đã mua vẫn dùng được."),
      el("div", { class: "grid" }, add, rows.map((r) => record({
        title: r.name, sub: r.item_key, row: r, fields: F,
        extra: r.on_sale ? el("span", { class: "tag green" }, "Đang bán") : el("span", { class: "tag" }, "Ngừng bán"),
        onSave: async (c) => (await guard(() => api(`/t/items/${r.item_key}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
        onDelete: async () => confirm(`Xóa hẳn ${r.name}?`) && (await guard(() => api(`/t/items/${r.item_key}`, { method: "DELETE" }), "Đã xóa.")) && reload(),
      }))),
    ];
  },

  async monsters() {
    const rows = await api("/t/monsters");
    const F = [
      { k: "name", label: "Tên" }, { k: "hp", label: "Sinh lực", type: "number" }, { k: "atk", label: "Công", type: "number" }, { k: "def", label: "Thủ", type: "number" },
      { k: "spd", label: "Tốc độ", type: "number" }, { k: "respawn", label: "Hồi sinh (giây)", type: "number" },
      { k: "exp_base", label: "Tu vi thưởng", type: "number", step: 1 }, { k: "exp_per_level", label: "Tu vi thêm mỗi cấp người hạ", type: "number", step: 1 },
      { k: "stones", label: "Linh thạch thưởng", type: "number", step: 1 }, { k: "aggro", label: "Tầm phát hiện (px)", type: "number" },
      { k: "reach", label: "Tầm đánh (px)", type: "number" }, { k: "cooldown", label: "Hồi đòn (giây)", type: "number" }, { k: "mult", label: "Hệ số sát thương", type: "number" },
    ];
    return [el("h2", {}, "Yêu thú"), el("p", { class: "dim" }, "Loại yêu thú gắn với hình vẽ trong game; ở đây đổi được mọi con số và tên."),
      el("div", { class: "grid" }, rows.map((r) => record({
        title: r.name, sub: r.type, row: r, fields: F,
        onSave: async (c) => (await guard(() => api(`/t/monsters/${r.type}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
      })))];
  },

  async skills() {
    const rows = await api("/t/skills");
    const KEYS = ["J", "K", "L"];
    return [el("h2", {}, "Chiêu thức"), el("p", { class: "dim" }, "Ba chiêu trên nút J / K / L, ai cũng dùng chung. Đổi loại chiêu thì các thông số bên dưới đổi theo."),
      el("div", { class: "grid" }, rows.map((r) => {
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
      }))];
  },

  async settings() {
    const rows = await api("/t/settings");
    const groups = {};
    for (const r of rows) (groups[r.k.split(".")[0]] ??= []).push(r);
    const NAMES = { class: "Chỉ số nhân vật", exp: "Tu vi & lên cấp", level: "Sức mạnh theo cấp", arena: "Đấu trường", start: "Quà tân thủ", daily: "Quà mỗi ngày", shop: "Đan Các", meditate: "Tu luyện", pvp: "PvP", respawn: "Hồi sinh" };
    return [el("h2", {}, "Cài đặt"), el("p", { class: "dim" }, "Mỗi con số đều có giải thích. Số sai (âm, quá lớn...) sẽ bị từ chối, game không bị ảnh hưởng."),
      el("div", { class: "grid" }, Object.entries(groups).map(([g, list]) => {
        const card = el("div", { class: "card" }, el("h3", {}, NAMES[g] ?? g));
        for (const r of list) {
          const f = record({
            title: r.k, row: r, fields: [{ k: "v", label: r.note || r.k, type: "number", wide: true }],
            onSave: async (c) => (await guard(() => api(`/t/settings/${encodeURIComponent(r.k)}`, { method: "PATCH", body: c }), "Đã lưu.")) && reload(),
          });
          f.style.padding = "8px";
          f.style.background = "var(--panel2)";
          card.append(f);
        }
        return card;
      }))];
  },

  async cosmetics() {
    await loadAtlas();
    const rows = await api("/t/cosmetics");
    const kind = el("select", {}, [["hair", "Tóc"], ["robe", "Y phục"]].map(([v, l]) => el("option", { value: v }, l)));
    const g = el("select", {}, [["m", "Nam"], ["f", "Nữ"]].map(([v, l]) => el("option", { value: v }, l)));
    const state = el("select", {}, [["all", "Tất cả"], ["starter", "Miễn phí (khởi đầu)"], ["sale", "Đang bán"], ["off", "Ngừng bán"]].map(([v, l]) => el("option", { value: v }, l)));
    const q = el("input", { placeholder: "Tìm theo tên...", type: "search" });
    const grid = el("div", { class: "grid" });
    const F = [
      { k: "name", label: "Tên", wide: true }, { k: "price", label: "Giá (linh thạch)", type: "number", step: 1 }, { k: "sort", label: "Thứ tự", type: "number", step: 1 },
      { k: "starter", label: "Miễn phí khi tạo nhân vật", type: "bool" }, { k: "on_sale", label: "Đang bán", type: "bool" },
    ];
    const draw = () => {
      const list = rows.filter((r) => r.kind === kind.value && r.gender === g.value &&
        (state.value === "all" || (state.value === "starter" && r.starter) || (state.value === "sale" && r.on_sale && !r.starter) || (state.value === "off" && !r.on_sale)) &&
        r.name.toLowerCase().includes(q.value.trim().toLowerCase()));
      const used = new Set(rows.filter((r) => r.kind === kind.value && r.gender === g.value).map((r) => r.idx));
      const total = atlas.meta[`${kind.value}_${g.value}`].length;
      const free = [...Array(total).keys()].filter((i) => !used.has(i));
      const add = record({
        title: "Thêm món", sub: free.length ? `ô trống trong atlas: ${free.join(", ")}` : "atlas đã dùng hết; vẽ thêm vào sheet rồi chạy tools/avatar/build.py",
        isNew: true, row: { idx: free[0] ?? "", price: 150, starter: 0, on_sale: 1, sort: 0 },
        fields: [{ k: "idx", label: `Vị trí trong atlas (0-${total - 1})`, type: "number", step: 1 }, ...F],
        onSave: async (c) => (await guard(() => api("/t/cosmetics", { method: "POST", body: { ...c, kind: kind.value, gender: g.value } }), "Đã thêm.")) && (await refresh()),
      });
      grid.replaceChildren(add, ...list.map((r) => {
        const card = record({
          title: r.name, sub: `id ${r.id} · ô ${r.idx}`, row: r, fields: F,
          extra: el("span", {}, r.starter ? el("span", { class: "tag gold" }, "Miễn phí") : null, " ", r.on_sale ? null : el("span", { class: "tag" }, "Ngừng bán"), " ", el("span", { class: "tag" }, `${r.owners} người có`)),
          onSave: async (c) => (await guard(() => api(`/t/cosmetics/${r.id}`, { method: "PATCH", body: c }), "Đã lưu.")) && (await refresh()),
          onDelete: async () => confirm(`Xóa ${r.name}? ${r.owners} người đang có món này sẽ mất nó.`) && (await guard(() => api(`/t/cosmetics/${r.id}`, { method: "DELETE" }), "Đã xóa.")) && (await refresh()),
        });
        card.prepend(el("div", { class: "head" }, thumb(r.kind, r.gender, r.idx)));
        return card;
      }));
    };
    const refresh = async () => {
      rows.splice(0, rows.length, ...(await api("/t/cosmetics")));
      draw();
    };
    for (const s of [kind, g, state]) s.addEventListener("change", draw);
    q.addEventListener("input", draw);
    draw();
    return [el("h2", {}, "Tóc & Y phục"), el("p", { class: "dim" }, "Món \"Miễn phí\" được chọn lúc tạo nhân vật; còn lại bán ở Y Các trong game."), el("div", { class: "bar" }, kind, g, state, q), grid];
  },

  async admins() {
    const rows = await api("/admins");
    const me = $("who").textContent;
    const add = record({
      title: "Thêm admin", isNew: true, sub: "người mới sẽ phải đổi mật khẩu khi đăng nhập lần đầu",
      fields: [{ k: "username", label: "Tên đăng nhập" }, { k: "password", label: "Mật khẩu tạm (8-72 ký tự)" }],
      onSave: async (c) => (await guard(() => api("/admins", { method: "POST", body: c }), "Đã thêm admin.")) && reload(),
    });
    return [el("h2", {}, "Tài khoản admin"),
      el("div", { class: "bar" }, el("button", { class: "primary", onclick: () => showPw(false) }, "Đổi mật khẩu của tôi")),
      el("div", { class: "grid" }, add, rows.map((a) => el("div", { class: "card" },
        el("div", { class: "head" }, el("b", {}, a.username), a.username === me ? el("span", { class: "tag gold" }, "Bạn") : null, a.must_change ? el("span", { class: "tag" }, "Chưa đổi mật khẩu") : null),
        el("span", { class: "dim" }, `Tạo: ${when(a.created_at)} · Đăng nhập gần nhất: ${when(a.last_login)}`),
        a.username === me ? null : el("div", { class: "actions" }, el("button", { class: "danger small", onclick: async () => confirm(`Xóa admin ${a.username}?`) && (await guard(() => api(`/admins/${a.id}`, { method: "DELETE" }), "Đã xóa.")) && reload() }, "Xóa")))))];
  },

  async log() {
    const list = el("div", { class: "list" });
    let last = null;
    const more = el("button", {}, "Xem thêm");
    const load = async () => {
      const rows = await guard(() => api(`/log${last ? `?before=${last}` : ""}`));
      if (!rows) return;
      list.append(...rows.map(logItem));
      last = rows.at(-1)?.id ?? last;
      more.hidden = rows.length < 100;
    };
    more.addEventListener("click", load);
    await load();
    return [el("h2", {}, "Nhật ký thao tác admin"), list, el("div", { class: "bar" }, more)];
  },
};

const ACTIONS = {
  login: "đăng nhập", password: "đổi mật khẩu", "admin.add": "thêm admin", "admin.del": "xóa admin", "player.edit": "sửa người chơi", "player.item": "sửa túi đồ",
  "player.give": "tặng tóc/áo", "player.take": "lấy lại tóc/áo", "player.ban": "khóa tài khoản", "player.unban": "mở khóa", "player.kick": "mời ra khỏi game",
  "player.password": "đặt lại mật khẩu người chơi", "player.delete": "xóa tài khoản",
};
function logItem(l) {
  const [t, a] = l.action.split(".");
  const what = ACTIONS[l.action] ?? `${{ realms: "cảnh giới", items: "đan dược", monsters: "yêu thú", skills: "chiêu thức", settings: "cài đặt", cosmetics: "tóc/áo" }[t] ?? t} · ${{ edit: "sửa", add: "thêm", del: "xóa" }[a] ?? a}`;
  return el("div", { class: "logitem" }, el("b", {}, l.admin), ` ${what} `, l.target ? el("span", { class: "tag" }, l.target) : null, el("span", { class: "dim" }, ` · ${when(l.at)}`),
    l.detail ? el("div", {}, el("code", {}, l.detail)) : null);
}

// ---------------------------------------------------------------- one player, in detail
async function playerView(id) {
  const main = $("main");
  const [p, items, cos] = await Promise.all([api(`/players/${id}`), api("/t/items"), (async () => (await loadAtlas(), api("/t/cosmetics")))()]);
  const render = (p) => {
    const back = el("button", { class: "ghost", onclick: () => go("players") }, "← Danh sách");
    const head = el("div", { class: "card" },
      el("div", { class: "head" }, el("span", { class: `dot ${p.online ? "on" : ""}` }), el("b", {}, p.name ?? "(chưa tạo nhân vật)"), el("span", { class: "dim" }, `@${p.username} · id ${p.id}`),
        p.banned ? el("span", { class: "tag red" }, `Bị khóa${p.ban_reason ? `: ${p.ban_reason}` : ""}`) : null),
      el("span", { class: "dim" }, `${p.realm ?? ""}${p.realm ? " · " : ""}Đăng ký: ${when(p.created_at)} · ${p.online ? "Đang online" : "Offline"}`));
    const parts = [back, head];
    if (p.name !== null) {
      parts.push(record({
        title: "Nhân vật", row: p, sub: "đổi tên, giới tính, tóc hay áo sẽ mời người này vào lại game",
        fields: [
          { k: "name", label: "Đạo hiệu" }, { k: "stones", label: "Linh thạch", type: "number", step: 1 },
          { k: "exp", label: "Tu vi", type: "number", step: 1, hint: p.realm }, { k: "rank_points", label: "Điểm đấu trường", type: "number", step: 1 },
          { k: "kills", label: "Hạ", type: "number", step: 1 }, { k: "deaths", label: "Bại", type: "number", step: 1 },
          { k: "gender", label: "Giới tính", type: "select", options: [["m", "Nam"], ["f", "Nữ"]] },
          { k: "hair", label: "Tóc (ô atlas)", type: "number", step: 1 }, { k: "robe", label: "Y phục (ô atlas)", type: "number", step: 1 },
        ],
        extra: el("span", {}, thumb("hair", p.gender, p.hair), thumb("robe", p.gender, p.robe)),
        onSave: async (c) => {
          const out = await guard(() => api(`/players/${p.id}`, { method: "PATCH", body: c }), "Đã lưu.");
          if (out) main.replaceChildren(...render(out));
        },
      }));
      // the bag
      const bag = el("div", { class: "card" }, el("h3", {}, "Túi đồ"));
      for (const it of items) {
        const qty = el("input", { type: "number", min: 0, step: 1, value: p.inventory[it.item_key] ?? 0, inputmode: "numeric" });
        bag.append(el("div", { class: "bar" }, el("span", { style: "flex:1 1 140px" }, it.name), qty,
          el("button", { class: "small", onclick: async () => {
            const out = await guard(() => api(`/players/${p.id}/items/${it.item_key}`, { method: "PUT", body: { qty: Number(qty.value) } }), "Đã cập nhật túi đồ.");
            if (out) main.replaceChildren(...render(out));
          } }, "Đặt")));
      }
      parts.push(bag);
      // hair and robes owned
      const mine = new Set(p.owned.map((o) => o.id));
      const pick = el("select", {}, cos.filter((c) => c.gender === p.gender && !c.starter && !mine.has(c.id)).map((c) => el("option", { value: c.id }, `${c.kind === "hair" ? "Tóc" : "Áo"} · ${c.name} (${c.price})`)));
      parts.push(el("div", { class: "card" }, el("h3", {}, "Tóc & y phục đã có"),
        el("div", { class: "chips" }, p.owned.length ? p.owned.map((o) => el("span", { class: "chip" }, thumb(o.kind, o.gender, o.idx, ""), o.name,
          el("button", { class: "small danger", title: "Lấy lại", onclick: async () => {
            if (!confirm(`Lấy lại ${o.name} của người này?`)) return;
            const out = await guard(() => api(`/players/${p.id}/cosmetics`, { method: "POST", body: { id: o.id, own: false } }), "Đã lấy lại.");
            if (out) main.replaceChildren(...render(out));
          } }, "✕"))) : el("span", { class: "dim" }, "Chưa mua món nào (các món miễn phí ai cũng có).")),
        el("div", { class: "bar" }, pick, el("button", { class: "small", onclick: async () => {
          if (!pick.value) return;
          const out = await guard(() => api(`/players/${p.id}/cosmetics`, { method: "POST", body: { id: Number(pick.value), own: true } }), "Đã tặng.");
          if (out) main.replaceChildren(...render(out));
        } }, "Tặng"))));
    }
    // account actions
    const reason = el("input", { placeholder: "Lý do khóa (người chơi sẽ thấy)", value: p.ban_reason ?? "" });
    const pw = el("input", { placeholder: "Mật khẩu mới cho người chơi (6-72 ký tự)", type: "text", autocomplete: "off" });
    parts.push(el("div", { class: "card" }, el("h3", {}, "Tài khoản"),
      el("div", { class: "bar" }, reason, el("button", { class: p.banned ? "small" : "small danger", onclick: async () => {
        const out = await guard(() => api(`/players/${p.id}/ban`, { method: "POST", body: { banned: !p.banned, reason: reason.value } }), p.banned ? "Đã mở khóa." : "Đã khóa tài khoản.");
        if (out) main.replaceChildren(...render(out));
      } }, p.banned ? "Mở khóa" : "Khóa tài khoản")),
      el("div", { class: "bar" }, pw, el("button", { class: "small", onclick: async () => {
        if (await guard(() => api(`/players/${p.id}/password`, { method: "POST", body: { password: pw.value } }), "Đã đặt lại mật khẩu.")) pw.value = "";
      } }, "Đặt lại mật khẩu")),
      el("div", { class: "actions" },
        el("button", { class: "small", disabled: !p.online, onclick: () => guard(() => api(`/players/${p.id}/kick`, { method: "POST", body: {} }), "Đã mời ra khỏi game.") }, "Mời ra khỏi game"),
        el("button", { class: "small danger", onclick: async () => {
          const c = prompt(`Xóa vĩnh viễn tài khoản này cùng nhân vật, túi đồ và mọi thứ đã mua.\nGõ tên đăng nhập "${p.username}" để xác nhận:`);
          if (c === null) return;
          if (await guard(() => api(`/players/${p.id}`, { method: "DELETE", body: { confirm: c } }), "Đã xóa tài khoản.")) go("players");
        } }, "Xóa tài khoản"))));
    if (p.buys?.length)
      parts.push(el("div", { class: "card" }, el("h3", {}, "Mua ở Đan Các gần đây"),
        el("table", { class: "simple" }, el("tr", {}, el("th", {}, "Món"), el("th", {}, "SL"), el("th", {}, "Giá"), el("th", {}, "Lúc")),
          p.buys.map((b) => el("tr", {}, el("td", {}, b.item), el("td", {}, b.qty), el("td", {}, fmt(b.price)), el("td", {}, when(b.created_at)))))));
    return [el("div", { class: "list" }, parts)];
  };
  main.replaceChildren(...render(p));
  scrollTo(0, 0);
}

// ---------------------------------------------------------------- start
if (token)
  api("/me").then((me) => (me.mustChange ? showPw(true) : start(me.username))).catch(() => show("login"));
else show("login");
