// Bảng điều khiển VPS: giao diện. Gọi deploy/panel/server.mjs (/api/*); mọi phần tử tạo bằng DOM (không innerHTML).
"use strict";
const $ = (id) => document.getElementById(id);
let csrf = "";
let S = null; // the last /api/status
let view = "overview";
let refreshTimer = 0;

// ---------------------------------------------------------------- tiny helpers
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const fmtBytes = (n) => {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
};
const fmtDate = (t) => (t ? new Date(t).toLocaleString("vi-VN", { hour12: false }) : "—");
const fmtDur = (s) => {
  s = Math.round(s);
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} ngày ${hh} giờ` : hh ? `${hh} giờ ${m} phút` : `${m} phút ${s % 60} giây`;
};
const ago = (t) => {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  return s < 60 ? "vừa xong" : s < 3600 ? `${Math.floor(s / 60)} phút trước` : s < 86400 ? `${Math.floor(s / 3600)} giờ trước` : `${Math.floor(s / 86400)} ngày trước`;
};
function toast(msg, kind = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), kind === "bad" ? 6000 : 3500);
}
function confirmBox(title, ...body) {
  return new Promise((resolve) => {
    $("confirmTitle").textContent = title;
    $("confirmBody").replaceChildren(...body.map((b) => (typeof b === "string" ? h("p", { text: b }) : b)));
    $("confirmModal").hidden = false;
    const done = (v) => {
      $("confirmModal").hidden = true;
      $("confirmYes").onclick = $("confirmNo").onclick = null;
      resolve(v);
    };
    $("confirmYes").onclick = () => done(true);
    $("confirmNo").onclick = () => done(false);
  });
}
const pill = (cls, text) => h("span", { class: `pill ${cls}`, text });
function unitPill(u) {
  if (!u || !u.installed) return pill("none", "Chưa cài");
  if (u.active === "active") return pill("on", u.sub === "waiting" ? "Đang chờ" : "Đang chạy");
  if (u.active === "activating" || u.active === "reloading") return pill("run", "Đang khởi động");
  if (u.active === "failed") return pill("off", "Lỗi");
  return pill("warn", "Đã dừng");
}

// ---------------------------------------------------------------- talking to the server
async function api(path, body, method) {
  const r = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", "x-csrf": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (r.status === 401 && path !== "/api/login") {
    showLogin();
    throw new Error("Phiên đăng nhập đã hết, hãy đăng nhập lại.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Lỗi ${r.status}`);
  return j;
}
const tryApi = async (...a) => {
  try {
    return await api(...a);
  } catch (e) {
    toast(e.message, "bad");
    return null;
  }
};

// ---------------------------------------------------------------- login
function showLogin() {
  $("app").hidden = true;
  $("login").hidden = false;
  clearInterval(refreshTimer);
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $("loginErr").hidden = true;
  try {
    const r = await api("/api/login", { user: f.get("user"), pass: f.get("pass") });
    csrf = r.csrf;
    e.target.reset();
    await start();
  } catch (err) {
    $("loginErr").textContent = err.message;
    $("loginErr").hidden = false;
  }
});
$("logoutBtn").addEventListener("click", async () => {
  await tryApi("/api/logout", {});
  csrf = "";
  showLogin();
});

// ---------------------------------------------------------------- tasks: the live log
let watching = null; // { id, since, cb }
let pollTimer = 0;
function colorLine(line) {
  const cls = /^\s*==>/.test(line) ? "s" : /^\s*✔/.test(line) ? "o" : /^\s*!!/.test(line) ? "w" : /^\s*✖/.test(line) ? "e" : /^#{4,}/.test(line) ? "h" : "";
  return cls ? h("span", { class: cls, text: line }) : document.createTextNode(line);
}
function appendLog(text) {
  const pre = $("taskLog");
  const lines = text.split("\n");
  lines.forEach((l, i) => {
    pre.append(colorLine(l));
    if (i < lines.length - 1) pre.append("\n");
  });
  if ($("taskFollow").checked) pre.scrollTop = pre.scrollHeight;
}
function taskState(t) {
  const st = $("taskState");
  if (t.running) (st.className = "pill run"), (st.textContent = "Đang chạy…");
  else if (t.code === 0) (st.className = "pill on"), (st.textContent = "Thành công");
  else (st.className = "pill off"), (st.textContent = t.code === null ? "Không rõ" : `Lỗi (mã ${t.code})`);
  $("taskStop").hidden = !t.running;
  $("taskSub").textContent = ` · bắt đầu ${fmtDate(t.started)}${t.ended ? ` · ${fmtDur((t.ended - t.started) / 1000)}` : ""}`;
}
function openTask(t, cb) {
  $("taskTitle").textContent = t.name;
  $("taskLog").replaceChildren();
  $("taskModal").hidden = false;
  watching = { id: t.id, since: 0, cb, live: t.running !== false };
  taskState(t);
  poll();
}
async function poll() {
  clearTimeout(pollTimer);
  if (!watching) return;
  const w = watching;
  try {
    const r = await api(`/api/task?id=${encodeURIComponent(w.id)}&since=${w.since}`);
    const t = r.task ?? r;
    if (!t || watching !== w) return;
    if (t.log) appendLog(t.log), (w.since += t.log.length);
    taskState(t);
    chip(t);
    if (t.running) pollTimer = setTimeout(poll, 700);
    else {
      watching = null;
      if (w.live) {
        toast(t.code === 0 ? `✔ ${t.name}: xong` : `✖ ${t.name}: có lỗi, xem log`, t.code === 0 ? "good" : "bad");
        await refresh();
        w.cb?.(t);
      }
    }
  } catch {
    // the panel itself may be restarting (an update, a new port): keep trying a while
    pollTimer = setTimeout(poll, 2000);
  }
}
function chip(t) {
  const c = $("taskChip");
  c.hidden = !(t?.running && $("taskModal").hidden);
  if (t?.running) $("taskChipText").textContent = t.name;
}
$("taskChip").addEventListener("click", () => S?.task && openTask(S.task));
const closeTask = () => {
  $("taskModal").hidden = true;
  chip(S?.task);
};
$("taskClose").addEventListener("click", closeTask);
$("taskDone").addEventListener("click", closeTask);
$("taskStop").addEventListener("click", async () => {
  if (await confirmBox("Dừng tác vụ?", "Dừng giữa chừng có thể để lại cài đặt dở dang; chạy lại bước đó sau là được.")) await tryApi("/api/task/stop", {});
});
async function runTask(task, extra = {}, cb) {
  const r = await tryApi("/api/run", { task, ...extra });
  if (r?.task) openTask(r.task, cb);
  return r;
}

// ---------------------------------------------------------------- navigation
const VIEWS = [
  ["Chung", [["overview", "◉", "Tổng quan"], ["setup", "✦", "Cài đặt nhanh"]]],
  ["Cấu hình", [["game", "⚔", "Game & Admin"], ["domain", "🌐", "Tên miền & HTTPS"], ["firewall", "🛡", "Tường lửa"]]],
  ["Vận hành", [["services", "▤", "Dịch vụ & Log"], ["backup", "⛁", "Sao lưu"], ["update", "⟳", "Cập nhật"], ["env", "≡", "Tệp .env"], ["panel", "⚙", "Bảng điều khiển"]]],
];
const TITLES = Object.fromEntries(VIEWS.flatMap(([, v]) => v.map(([k, , t]) => [k, t])));
function renderNav() {
  const nav = $("nav");
  nav.replaceChildren(
    ...VIEWS.flatMap(([grp, items]) => [
      h("div", { class: "grp", text: grp }),
      ...items.map(([k, ic, t]) => h("button", { type: "button", class: k === view ? "on" : "", onclick: () => go(k) }, h("span", { class: "ic", text: ic }), t, k === "setup" && S && !S.installed ? h("span", { class: "dot", title: "Chưa cài game" }) : null)),
    ]),
  );
}
function go(k) {
  view = k;
  try {
    history.replaceState(null, "", `#${k}`);
  } catch {}
  renderNav();
  render();
  window.scrollTo(0, 0);
}
function render() {
  $("viewTitle").textContent = TITLES[view] ?? "";
  const v = $("view");
  if (!S) return v.replaceChildren(h("p", { class: "muted", text: "Đang tải…" }));
  v.replaceChildren(...[].concat(RENDER[view]?.() ?? []));
}
async function refresh() {
  const r = await tryApi("/api/status");
  if (!r) return;
  S = r;
  chip(S.task);
  renderNav();
  // forms keep what is being typed: only the overview and lists redraw by themselves
  if (["overview", "services", "backup"].includes(view) && !document.activeElement?.closest?.("#view form")) render();
}
$("refreshBtn").addEventListener("click", () => refresh().then(render));

// ---------------------------------------------------------------- form pieces
const field = (label, input, hint) => h("label", {}, label, input, hint ? h("small", { text: hint }) : null);
const num = (name, value, more = {}) => h("input", { name, type: "number", inputmode: "numeric", value, ...more });
const txt = (name, value, more = {}) => h("input", { name, value: value ?? "", autocomplete: "off", spellcheck: "false", ...more });
const sw = (name, checked, title, sub) => h("label", { class: "switch" }, h("input", { type: "checkbox", name, checked }), h("span", {}, title, sub ? h("small", { text: sub }) : null));
const choice = (name, value, cur, title, sub) => h("label", { class: "choice" }, h("input", { type: "radio", name, value, checked: value === cur }), h("b", { text: title }), h("small", { text: sub }));
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) o[el.name] = el.value;
    } else if (el.type === "number") o[el.name] = el.value === "" ? "" : Number(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
const STATE_KEYS = ["gamePort", "adminPort", "proxy", "domain", "adminDomain", "panelDomain", "email", "https", "adminAccess", "adminIp", "adminUser", "panelOpen", "firewall", "backupDaily", "backupKeep", "repo", "branch"];
const pick = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => STATE_KEYS.includes(k)));
async function saveState(o) {
  const r = await tryApi("/api/state", pick(o));
  if (r) S.state = r.state;
  return r;
}

function secPorts(s) {
  return h("div", { class: "card" },
    h("h2", { text: "Cổng" }),
    h("div", { class: "grid2" },
      field("Cổng game", num("gamePort", s.gamePort, { min: 1024, max: 65535, required: true }), "Người chơi vào cổng này (khi không dùng tên miền). Mặc định 5886."),
      field("Cổng trang admin", num("adminPort", s.adminPort, { min: 1024, max: 65535, required: true }), "Trang quản trị game. Mặc định 5885."),
    ),
    h("p", { class: "hint" }, `Bảng điều khiển này đang ở cổng ${S.panel.port} (đổi ở mục "Bảng điều khiển").`),
  );
}
function secAdminLogin(s, withPass = true) {
  return h("div", { class: "card" },
    h("h2", { text: "Tài khoản trang admin game" }),
    h("div", { class: "grid2" },
      field("Tên đăng nhập admin", txt("adminUser", s.adminUser, { required: true, pattern: "[A-Za-z0-9_.\\-]{3,32}" }), "3-32 ký tự chữ, số, dấu . _ -"),
      h("span"),
      withPass ? field("Mật khẩu admin", h("input", { name: "adminPass", type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72, placeholder: "8-72 ký tự" }), S.state.done?.adminpw ? `Đã đặt ${ago(S.state.done.adminpw)}. Để trống nếu không đổi.` : "Chưa đặt: game sẽ dùng admin / admin123456 và bắt đổi ở lần đăng nhập đầu.") : null,
      withPass ? field("Nhập lại mật khẩu", h("input", { name: "adminPass2", type: "password", autocomplete: "new-password" })) : null,
    ),
  );
}
function secDomain(s) {
  const ip = S.ip || "IP-VPS";
  const wrap = h("div", { class: "card" });
  const dnsBox = h("div", { class: "dns" });
  const fields = h("div", { class: "grid2" },
    field("Tên miền của game", txt("domain", s.domain, { placeholder: "game.tenmien.com" }), "Người chơi vào địa chỉ này."),
    field("Tên miền trang admin", txt("adminDomain", s.adminDomain, { placeholder: "admin.tenmien.com (không bắt buộc)" }), "Để trống nếu không cần."),
    field("Tên miền bảng điều khiển", txt("panelDomain", s.panelDomain, { placeholder: "vps.tenmien.com (không bắt buộc)" }), "Mở bảng điều khiển này qua HTTPS."),
    field("Email (Let's Encrypt)", txt("email", s.email, { type: "email", placeholder: "ban@gmail.com" }), "Nhận thư báo khi chứng chỉ sắp hết hạn. Không bắt buộc."),
    sw("https", s.https, "Bật HTTPS (chứng chỉ miễn phí Let's Encrypt)", "Tự lấy và tự gia hạn. Cần tên miền đã trỏ về VPS và cổng 80, 443 mở."),
  );
  const domainOnly = h("div", {}, fields, h("h3", { text: "Bản ghi DNS cần tạo" }), h("p", { class: "hint", text: "Vào trang quản lý tên miền (nơi bạn mua tên miền, hoặc Cloudflare), tạo các bản ghi A dưới đây trỏ về IP của VPS. Đợi vài phút cho DNS cập nhật rồi bấm Lưu & áp dụng." }), dnsBox);
  const update = () => {
    const f = formData(wrap.closest("form") ?? wrap);
    domainOnly.hidden = (f.proxy ?? s.proxy) === "none";
    const doms = [f.domain, f.adminDomain, f.panelDomain].map((d) => String(d ?? "").trim().toLowerCase()).filter(Boolean);
    dnsBox.replaceChildren(h("div", { class: "head" }, h("span", { text: "Loại" }), h("span", { text: "Tên" }), h("span", { text: "Giá trị" })), ...(doms.length ? doms : ["game.tenmien.com"]).map((d) => h("div", {}, h("span", { text: "A" }), h("span", { text: d }), h("span", { text: ip }))));
  };
  wrap.append(
    h("h2", { text: "Tên miền và reverse proxy" }),
    h("div", { class: "choices" },
      choice("proxy", "none", s.proxy, "Không dùng", `Vào bằng IP và cổng: http://${ip}:${s.gamePort}`),
      choice("proxy", "caddy", s.proxy, "Caddy (khuyên dùng)", "Gọn nhẹ, tự lấy và gia hạn HTTPS."),
      choice("proxy", "nginx", s.proxy, "Nginx + Certbot", "Phổ biến; HTTPS bằng certbot, gia hạn tự động."),
    ),
    h("div", { style: "height:14px" }),
    domainOnly,
  );
  wrap.addEventListener("input", update);
  wrap.addEventListener("change", update);
  queueMicrotask(update);
  return wrap;
}
function secAccess(s) {
  const wrap = h("div", { class: "card" });
  const ipField = field("Chỉ cho IP này vào cổng admin", txt("adminIp", s.adminIp, { placeholder: "vd 113.161.1.2 (để trống: mọi IP)" }), "IP nhà bạn: xem ở https://api.ipify.org. Có thể ghi dải, vd 113.161.0.0/16.");
  const update = () => {
    const f = formData(wrap.closest("form") ?? wrap);
    ipField.hidden = (f.adminAccess ?? s.adminAccess) !== "port";
    const dom = wrap.querySelector('input[value="domain"]');
    const can = (f.proxy ?? s.proxy) !== "none" && String(f.adminDomain ?? s.adminDomain ?? "").trim();
    if (dom) dom.disabled = !can;
    if (dom && !can && dom.checked) wrap.querySelector('input[value="port"]').checked = true;
  };
  wrap.append(
    h("h2", { text: "Ai được vào trang admin" }),
    h("div", { class: "choices" },
      choice("adminAccess", "domain", s.adminAccess, "Qua tên miền admin", "https://tên-miền-admin (cần reverse proxy và tên miền admin)."),
      choice("adminAccess", "port", s.adminAccess, "Qua cổng admin", "http://IP-VPS:cổng-admin. Có thể chỉ cho một IP."),
      choice("adminAccess", "local", s.adminAccess, "Chỉ trong máy (an toàn nhất)", "Vào qua đường hầm SSH: ssh -L cổng:127.0.0.1:cổng root@IP-VPS"),
    ),
    h("div", { style: "height:12px" }),
    ipField,
  );
  wrap.addEventListener("change", update);
  queueMicrotask(update);
  return wrap;
}
function secSecurity(s) {
  return h("div", { class: "card" },
    h("h2", { text: "Tường lửa và sao lưu" }),
    h("div", { class: "grid2" },
      sw("firewall", s.firewall, "Bật tường lửa (ufw)", "Chỉ mở SSH, bảng điều khiển, cổng game hoặc 80/443, cổng admin nếu chọn."),
      sw("panelOpen", s.panelOpen, "Mở cổng bảng điều khiển ra internet", "Tắt được khi đã có tên miền bảng điều khiển (chỉ vào qua HTTPS)."),
      sw("backupDaily", s.backupDaily, "Sao lưu database mỗi ngày (03:30)", "Lưu ở /var/backups/dvtt."),
      field("Giữ lại bao nhiêu bản", num("backupKeep", s.backupKeep, { min: 1, max: 365 })),
    ),
  );
}
function checkAdminPass(f, required) {
  if (!f.adminPass && !required) return true;
  if ((f.adminPass ?? "").length < 8 || f.adminPass.length > 72) return toast("Mật khẩu admin: 8-72 ký tự.", "bad"), false;
  if (f.adminPass !== f.adminPass2) return toast("Hai lần nhập mật khẩu admin không giống nhau.", "bad"), false;
  return true;
}

// ---------------------------------------------------------------- the views
const RENDER = {};

RENDER.overview = () => {
  const s = S.state, u = S.units, out = [];
  if (!S.installed)
    out.push(h("div", { class: "banner" }, h("div", { class: "grow" }, h("b", { text: "Game chưa được cài đặt" }), h("p", { text: "Chọn cổng, đặt mật khẩu admin, (tuỳ chọn) tên miền rồi bấm một nút để cài tất cả." })), h("button", { class: "btn primary", type: "button", onclick: () => go("setup") }, "Bắt đầu cài đặt →")));
  else if (!S.game.up)
    out.push(h("div", { class: "banner bad" }, h("div", { class: "grow" }, h("b", { text: "Game đang không chạy" }), h("p", { text: "Xem log để biết lỗi, hoặc chạy lại." })), h("button", { class: "btn", type: "button", onclick: () => go("services") }, "Xem log"), h("button", { class: "btn primary", type: "button", onclick: () => service("dvtt", "restart") }, "Chạy lại game")));
  const m = S.system.mem, d = S.system.disk;
  const memUsed = m.total - m.avail, memPct = m.total ? (memUsed / m.total) * 100 : 0, diskPct = d ? ((d.total - d.free) / d.total) * 100 : 0;
  const bar = (pct) => h("div", { class: `bar${pct > 85 ? " hot" : ""}` }, h("i", { style: `width:${Math.min(100, pct).toFixed(1)}%` }));
  const link = (url) => (/^https?:\/\//.test(url) ? h("a", { href: url, target: "_blank", rel: "noopener", text: url }) : h("code", { text: url }));
  out.push(h("div", { class: "grid" },
    h("div", { class: "card" },
      h("h2", {}, "Game ", S.installed ? (S.game.up ? pill("on", "Đang chạy") : pill("off", "Không chạy")) : pill("none", "Chưa cài")),
      h("div", { class: "row" }, h("div", {}, h("div", { class: "big", text: S.game.online ?? "—" }), h("small", { class: "muted", text: "người đang online" }))),
      h("dl", { class: "kv", style: "margin-top:12px" },
        h("dt", { text: "Vào game" }), h("dd", {}, link(S.urls.game)),
        h("dt", { text: "Trang admin" }), h("dd", {}, link(S.urls.admin)),
        h("dt", { text: "Phiên bản" }), h("dd", { text: S.git ? `${S.git.hash} · ${S.git.subject.slice(0, 60)} (${fmtDate(S.git.at)})` : "—" }),
      ),
      S.installed ? h("div", { class: "actions" },
        h("button", { class: "btn small", type: "button", onclick: () => service("dvtt", "restart") }, "↻ Chạy lại"),
        u.dvtt?.active === "active" ? h("button", { class: "btn small danger", type: "button", onclick: () => service("dvtt", "stop") }, "■ Dừng") : h("button", { class: "btn small", type: "button", onclick: () => service("dvtt", "start") }, "▶ Chạy"),
      ) : null,
    ),
    h("div", { class: "card" },
      h("h2", { text: "Máy chủ" }),
      h("dl", { class: "kv" },
        h("dt", { text: "Hệ điều hành" }), h("dd", { text: `${S.system.os} (${S.system.arch})` }),
        h("dt", { text: "Tên máy · IP" }), h("dd", { text: `${S.system.host} · ${S.ip || "?"}` }),
        h("dt", { text: "Đã chạy" }), h("dd", { text: fmtDur(S.system.uptime) }),
        h("dt", { text: "CPU" }), h("dd", { text: `${S.system.cpus} nhân · tải ${S.system.load.map((x) => x.toFixed(2)).join(" / ")}` }),
      ),
      h("div", { style: "margin-top:10px" }, h("small", { class: "muted", text: `RAM: ${fmtBytes(memUsed)} / ${fmtBytes(m.total)}${m.swapTotal ? ` · swap ${fmtBytes(m.swapTotal - m.swapFree)} / ${fmtBytes(m.swapTotal)}` : ""}` }), bar(memPct)),
      d ? h("div", { style: "margin-top:8px" }, h("small", { class: "muted", text: `Ổ đĩa: ${fmtBytes(d.total - d.free)} / ${fmtBytes(d.total)} (còn ${fmtBytes(d.free)})` }), bar(diskPct)) : null,
    ),
    h("div", { class: "card" },
      h("h2", { text: "Thành phần" }),
      h("table", {}, h("tbody", {},
        [["Game (dvtt)", "dvtt", S.git?.hash], ["MariaDB", "mariadb", S.versions.mariadb], ["Caddy", "caddy", S.versions.caddy], ["Nginx", "nginx", S.versions.nginx], ["Bảng điều khiển", "dvtt-panel", S.versions.node && `Node ${S.versions.node}`]].map(([name, unit, ver]) =>
          h("tr", {}, h("td", {}, h("b", { text: name }), h("br"), h("small", { class: "muted", text: ver || "" })), h("td", { style: "text-align:right" }, unitPill(u[unit])))),
        h("tr", {}, h("td", {}, h("b", { text: "Tường lửa (ufw)" })), h("td", { style: "text-align:right" }, S.ufw === "active" ? pill("on", "Đang bật") : S.ufw === "inactive" ? pill("warn", "Đang tắt") : pill("none", "Chưa có"))),
      )),
    ),
    h("div", { class: "card" },
      h("h2", { text: "Tên miền & HTTPS" }),
      s.proxy === "none" ? h("p", { class: "muted" }, "Chưa dùng tên miền. ", h("a", { href: "#domain", onclick: (e) => (e.preventDefault(), go("domain")), text: "Thiết lập →" }))
        : h("div", {},
          h("p", {}, `Proxy: `, h("b", { text: s.proxy === "caddy" ? "Caddy" : "Nginx" }), s.https ? " · HTTPS" : " · chỉ HTTP"),
          S.certs.length ? h("table", {}, h("tbody", {}, S.certs.map((c) => {
            const days = c.to ? Math.floor((c.to - Date.now()) / 86400000) : null;
            return h("tr", {}, h("td", {}, h("b", { text: c.domain }), h("br"), h("small", { class: "muted", text: c.error ? c.error : `${c.issuer} · hết hạn ${fmtDate(c.to)}` })), h("td", { style: "text-align:right" }, c.error ? pill("off", "Chưa có") : !c.trusted ? pill("warn", "Chưa hợp lệ") : days < 14 ? pill("warn", `${days} ngày`) : pill("on", `${days} ngày`)));
          }))) : h("p", { class: "muted", text: s.domain }),
        ),
    ),
    h("div", { class: "card" },
      h("h2", { text: "Sao lưu" }),
      h("dl", { class: "kv" },
        h("dt", { text: "Tự động" }), h("dd", {}, u["dvtt-backup.timer"]?.active === "active" ? pill("on", "Mỗi ngày 03:30") : pill("warn", "Tắt")),
        h("dt", { text: "Bản mới nhất" }), h("dd", { text: S.backups[0] ? `${fmtDate(S.backups[0].at)} (${fmtBytes(S.backups[0].size)})` : "chưa có" }),
        h("dt", { text: "Số bản" }), h("dd", { text: S.backups.length }),
      ),
      h("div", { class: "actions" }, h("button", { class: "btn small", type: "button", disabled: !S.installed, onclick: () => runTask("backup") }, "Sao lưu ngay")),
    ),
    h("div", { class: "card" },
      h("h2", { text: "Tác vụ gần đây" }),
      S.history.length ? h("table", {}, h("tbody", {}, S.history.slice(0, 8).map((t) =>
        h("tr", {}, h("td", {}, h("a", { href: "#", text: t.name, onclick: (e) => (e.preventDefault(), openTask({ ...t, running: false })) }), h("br"), h("small", { class: "muted", text: fmtDate(t.started) })), h("td", { style: "text-align:right" }, t.code === 0 ? pill("on", "Xong") : t.code === null ? pill("none", "—") : pill("off", "Lỗi")))))) : h("p", { class: "muted", text: "Chưa có." }),
    ),
  ));
  return out;
};

RENDER.setup = () => {
  const s = S.state;
  const form = h("form", { autocomplete: "off" });
  form.append(
    h("div", { class: S.installed ? "banner good" : "banner" }, h("div", { class: "grow" },
      h("b", { text: S.installed ? "Game đã được cài. Có thể chạy lại từng bước bên dưới." : "Cài đặt game lên VPS này" }),
      h("p", { text: "Điền các mục rồi bấm \"Lưu & cài đặt tất cả\": cài Node.js, MariaDB, tạo database, cài và chạy game, đặt mật khẩu admin, cấu hình tên miền (nếu chọn), tường lửa và sao lưu. Mất khoảng 2-5 phút." }),
    )),
    secPorts(s),
    secAdminLogin(s),
    secDomain(s),
    secAccess(s),
    secSecurity(s),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, S.installed ? "Lưu & cài đặt lại tất cả" : "Lưu & cài đặt tất cả")),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (!checkAdminPass(f, !S.state.done?.adminpw)) return;
    if (!(await saveState(f))) return;
    runTask("setup", f.adminPass ? { adminPass: f.adminPass } : {}, (t) => t.code === 0 && go("overview"));
  });
  const done = s.done ?? {};
  const steps = [
    ["deps", "Cài gói cần thiết", "Node.js 22, MariaDB, git, ufw; tạo swap nếu RAM ít."],
    ["db", "Cơ sở dữ liệu", "Database dvtt, tài khoản riêng với mật khẩu ngẫu nhiên (ghi vào .env)."],
    ["app", "Cài và chạy game", "Thư viện npm, .env, dịch vụ systemd dvtt (tự chạy lại khi lỗi, khi khởi động máy)."],
    ["adminpw", "Mật khẩu trang admin", "Đặt mật khẩu cho tài khoản admin của game."],
    ["proxy", "Tên miền & HTTPS", "Caddy hoặc Nginx, chứng chỉ Let's Encrypt."],
    ["firewall", "Tường lửa", "Chỉ mở những cổng cần."],
  ];
  const list = h("ol", { class: "steps" }, steps.map(([k, t, sub], i) => h("li", { class: done[k] ? "done" : "" },
    h("span", { class: "n", text: done[k] ? "✓" : i + 1 }),
    h("div", { class: "t" }, h("b", { text: t }), h("small", { text: done[k] ? `${sub} · xong ${ago(done[k])}` : sub })),
    h("button", { class: "btn small", type: "button", onclick: async () => {
      const f = formData(form);
      if (k === "adminpw") {
        if (!checkAdminPass(f, true)) return;
        if (!(await saveState(f))) return;
        return runTask("adminpw", { adminPass: f.adminPass });
      }
      if (!(await saveState(f))) return;
      runTask(k);
    } }, done[k] ? "Chạy lại" : "Chạy"),
  )));
  return [form, h("div", { class: "card" }, h("h2", { text: "Từng bước" }), h("p", { class: "hint", text: "Muốn làm từng bước một (hoặc chạy lại một bước bị lỗi): mỗi nút lưu các mục ở trên rồi chạy riêng bước đó." }), h("div", { style: "height:10px" }), list)];
};

RENDER.game = () => {
  const s = S.state, u = S.units.dvtt;
  const form = h("form", { autocomplete: "off" }, secPorts(s), secAccess(s),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Lưu & áp dụng")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await saveState(formData(form)))) return;
    runTask("apply");
  });
  const pw = h("form", { autocomplete: "off" }, secAdminLogin(s), h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Đặt mật khẩu admin")));
  pw.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(pw);
    if (!checkAdminPass(f, true)) return;
    if (!(await saveState({ adminUser: f.adminUser }))) return;
    runTask("adminpw", { adminPass: f.adminPass }, (t) => t.code === 0 && pw.reset());
  });
  return [
    h("div", { class: "card" },
      h("h2", {}, "Dịch vụ game ", unitPill(u)),
      h("dl", { class: "kv" },
        h("dt", { text: "Người online" }), h("dd", { text: S.game.online ?? "—" }),
        h("dt", { text: "Chạy từ" }), h("dd", { text: u?.since ? `${fmtDate(u.since)} (${ago(u.since)})` : "—" }),
        h("dt", { text: "Thư mục" }), h("dd", {}, h("code", { text: `${s.dir}/game` })),
        h("dt", { text: "Vào game" }), h("dd", { text: S.urls.game }),
        h("dt", { text: "Trang admin" }), h("dd", { text: S.urls.admin }),
      ),
      h("div", { class: "actions" },
        h("button", { class: "btn small", type: "button", onclick: () => service("dvtt", "start") }, "▶ Chạy"),
        h("button", { class: "btn small", type: "button", onclick: () => service("dvtt", "restart") }, "↻ Chạy lại"),
        h("button", { class: "btn small danger", type: "button", onclick: () => service("dvtt", "stop") }, "■ Dừng"),
        h("button", { class: "btn small", type: "button", onclick: () => go("services") }, "Xem log"),
      ),
      h("p", { class: "hint", text: "Khi dừng hay chạy lại, game lưu hết dữ liệu của người đang chơi rồi mới tắt." }),
    ),
    form,
    pw,
  ];
};

RENDER.domain = () => {
  const s = S.state;
  const form = h("form", { autocomplete: "off" }, secDomain(s), secAccess(s),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Lưu & áp dụng")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (!(await saveState(f))) return;
    if (!S.installed) return toast("Đã lưu. Cài game trước (Cài đặt nhanh) rồi tên miền sẽ được áp dụng cùng.", "good");
    runTask("apply");
  });
  return [
    form,
    h("div", { class: "card" },
      h("h2", { text: "Lưu ý" }),
      h("ul", { class: "muted" },
        h("li", { text: "Tên miền phải trỏ về IP của VPS trước (bản ghi A), không thì không lấy được chứng chỉ HTTPS." }),
        h("li", { text: "Nhà cung cấp VPS có tường lửa riêng (Security group): mở cổng 80 và 443 ở đó." }),
        h("li", { text: "Dùng Cloudflare: để đám mây xám (DNS only) lúc lấy chứng chỉ lần đầu, hoặc đặt SSL/TLS là Full (strict). WebSocket qua Cloudflare chạy bình thường." }),
        h("li", { text: "Khi có tên miền, game chỉ nghe ở 127.0.0.1 (đi qua proxy), cổng game không cần mở ra internet." }),
        h("li", { text: "Chuyển giữa Caddy và Nginx: bảng điều khiển tự tắt cái cũ." }),
      ),
    ),
  ];
};

RENDER.firewall = () => {
  const s = S.state;
  const pre = h("pre", { class: "console", text: "Đang tải…" });
  tryApi("/api/ufw").then((r) => r && (pre.textContent = r.text.trim() || "ufw chưa được cài."));
  const form = h("form", { autocomplete: "off" },
    h("div", { class: "card" },
      h("h2", { text: "Tường lửa (ufw)" }),
      h("div", { class: "grid2" },
        sw("firewall", s.firewall, "Bật tường lửa", "Chặn mọi cổng vào trừ những cổng ở danh sách dưới."),
        sw("panelOpen", s.panelOpen, "Mở cổng bảng điều khiển", s.panelDomain ? `Tắt: chỉ vào qua https://${s.panelDomain}.` : "Cần tên miền bảng điều khiển mới tắt được."),
        field("Chỉ cho IP này vào cổng admin", txt("adminIp", s.adminIp, { placeholder: "để trống: mọi IP" }), s.adminAccess === "port" ? "Áp dụng khi vào admin qua cổng." : "Đang không mở cổng admin (vào bằng tên miền hoặc SSH)."),
      ),
      h("h3", { text: "Sẽ mở" }),
      h("ul", {},
        h("li", { text: "SSH (cổng đang dùng, tự nhận ra): không bao giờ bị chặn." }),
        s.panelOpen || !s.panelDomain || s.proxy === "none" ? h("li", { text: `${S.panel.port}/tcp: bảng điều khiển` }) : null,
        s.proxy !== "none" && s.domain ? h("li", { text: "80, 443/tcp và 443/udp: tên miền (HTTP, HTTPS)" }) : h("li", { text: `${s.gamePort}/tcp: game` }),
        s.adminAccess === "port" ? h("li", { text: `${s.adminPort}/tcp: trang admin${s.adminIp ? ` (chỉ ${s.adminIp})` : ""}` }) : null,
      ),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Lưu & áp dụng")),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (!f.panelOpen && !(await confirmBox("Đóng cổng bảng điều khiển?", `Sau đó chỉ vào được bảng điều khiển qua https://${s.panelDomain}. Hãy chắc chắn địa chỉ này đang mở được.`))) return;
    if (!(await saveState(f))) return;
    runTask("firewall", {}, () => go("firewall"));
  });
  return [form, h("div", { class: "card" }, h("h2", { text: "Trạng thái hiện tại" }), pre)];
};

RENDER.services = () => {
  const units = [["dvtt", "Game"], ["mariadb", "MariaDB"], ["caddy", "Caddy"], ["nginx", "Nginx"]];
  const table = h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Dịch vụ" }), h("th", { text: "Trạng thái" }), h("th", {}))), h("tbody", {}, units.map(([k, name]) => {
    const u = S.units[k];
    return h("tr", {},
      h("td", {}, h("b", { text: name }), h("br"), h("small", { class: "muted", text: `${k}${u?.since && u.active === "active" ? ` · từ ${fmtDate(u.since)}` : ""}` })),
      h("td", {}, unitPill(u)),
      h("td", {}, u?.installed ? h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", onclick: () => service(k, "start") }, "▶"),
        h("button", { class: "btn small", type: "button", title: "Chạy lại", onclick: () => service(k, "restart") }, "↻"),
        h("button", { class: "btn small danger", type: "button", title: "Dừng", onclick: () => service(k, "stop") }, "■"),
        h("button", { class: "btn small", type: "button", onclick: () => ((sel.value = k), load()) }, "Log"),
      ) : null));
  })));
  const sel = h("select", {}, [["dvtt", "Game"], ["mariadb", "MariaDB"], ["caddy", "Caddy"], ["nginx", "Nginx"], ["dvtt-panel", "Bảng điều khiển"], ["dvtt-backup", "Sao lưu tự động"], ["certbot", "Certbot"]].map(([v, t]) => h("option", { value: v, text: t })));
  const n = h("select", {}, [100, 200, 500, 1000, 2000].map((x) => h("option", { value: x, text: `${x} dòng`, selected: x === 200 })));
  const follow = h("input", { type: "checkbox" });
  const pre = h("pre", { class: "console logs", text: "Đang tải…" });
  let t = 0;
  async function load() {
    clearTimeout(t);
    const r = await tryApi(`/api/logs?unit=${sel.value}&n=${n.value}`);
    if (!pre.isConnected && r) return;
    if (r) {
      const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = r.text.trim() || "(chưa có dòng nào)";
      if (atEnd || follow.checked) pre.scrollTop = pre.scrollHeight;
    }
    if (follow.checked && pre.isConnected) t = setTimeout(load, 3000);
  }
  sel.onchange = n.onchange = load;
  follow.onchange = load;
  queueMicrotask(load);
  return [
    h("div", { class: "card" }, h("h2", { text: "Dịch vụ" }), h("div", { class: "tableWrap" }, table)),
    h("div", { class: "card" },
      h("h2", { text: "Log" }),
      h("div", { class: "row", style: "margin-bottom:10px" }, h("div", { style: "min-width:180px" }, sel), h("div", { style: "min-width:120px" }, n), h("label", { class: "check" }, follow, "Theo dõi trực tiếp"), h("span", { class: "grow" }), h("button", { class: "btn small", type: "button", onclick: load }, "↻ Tải lại")),
      pre,
    ),
  ];
};

RENDER.backup = () => {
  const s = S.state;
  const form = h("form", {}, h("div", { class: "card" },
    h("h2", { text: "Sao lưu tự động" }),
    h("div", { class: "grid2" },
      sw("backupDaily", s.backupDaily, "Sao lưu mỗi ngày lúc 03:30", S.units["dvtt-backup.timer"]?.active === "active" ? "Đang bật." : "Đang tắt."),
      field("Giữ lại bao nhiêu bản mới nhất", num("backupKeep", s.backupKeep, { min: 1, max: 365 })),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Lưu")),
  ));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await saveState(formData(form)))) return;
    runTask("backup-timer");
  });
  const rows = S.backups.map((b) => h("tr", {},
    h("td", {}, h("b", { class: "mono", text: b.name }), h("br"), h("small", { class: "muted", text: `${fmtDate(b.at)} · ${fmtBytes(b.size)}${/-before\./.test(b.name) ? " · tự tạo trước khi khôi phục" : ""}` })),
    h("td", {}, h("div", { class: "row" },
      h("a", { class: "btn small", href: `/api/backup?file=${encodeURIComponent(b.name)}`, onclick: (e) => (e.preventDefault(), download(b.name)) }, "⬇ Tải về"),
      h("button", { class: "btn small", type: "button", onclick: async () => (await confirmBox("Khôi phục bản sao lưu?", `Database sẽ trở về lúc ${fmtDate(b.at)}. Mọi thay đổi sau đó sẽ mất (dữ liệu hiện tại được tự sao lưu trước, để quay lại được). Game tạm dừng trong lúc khôi phục.`)) && runTask("restore", { file: b.name }) }, "↺ Khôi phục"),
      h("button", { class: "btn small danger", type: "button", onclick: async () => (await confirmBox("Xoá bản sao lưu?", b.name)) && runTask("backup-delete", { file: b.name }) }, "✕"),
    ))));
  return [
    h("div", { class: "card" },
      h("h2", {}, "Các bản sao lưu ", h("span", { class: "grow" }), h("button", { class: "btn small primary", type: "button", disabled: !S.installed, onclick: () => runTask("backup") }, "+ Sao lưu ngay")),
      rows.length ? h("div", { class: "tableWrap" }, h("table", {}, h("tbody", {}, rows))) : h("p", { class: "muted", text: "Chưa có bản sao lưu nào." }),
      h("p", { class: "hint", text: "Lưu ở /var/backups/dvtt trên VPS (chỉ root đọc được). Nên tải về máy mình định kỳ: VPS hỏng thì bản trên VPS cũng mất." }),
    ),
    form,
  ];
};
async function download(name) {
  // the download needs the session's token, so it is fetched, then saved from memory
  try {
    const r = await fetch(`/api/backup?file=${encodeURIComponent(name)}`, { headers: { "x-csrf": csrf } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Lỗi ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) {
    toast(e.message, "bad");
  }
}

RENDER.update = () => {
  const s = S.state;
  const info = h("p", { class: "muted", text: "Bấm \"Kiểm tra\" để xem có bản mới không." });
  const form = h("form", { autocomplete: "off" }, h("div", { class: "card" },
    h("h2", { text: "Nguồn cập nhật" }),
    h("div", { class: "grid2" },
      field("Kho git", txt("repo", s.repo, { required: true }), "https://github.com/<tài-khoản>/<kho>.git"),
      field("Nhánh", txt("branch", s.branch, { required: true })),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn", type: "submit" }, "Lưu")),
  ));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    (await saveState(formData(form))) && toast("Đã lưu.", "good");
  });
  return [
    h("div", { class: "card" },
      h("h2", { text: "Phiên bản" }),
      h("dl", { class: "kv" },
        h("dt", { text: "Đang chạy" }), h("dd", { text: S.git ? `${S.git.hash} · ${S.git.subject}` : "—" }),
        h("dt", { text: "Ngày" }), h("dd", { text: S.git ? fmtDate(S.git.at) : "—" }),
      ),
      h("div", { style: "height:8px" }),
      info,
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: async () => {
          info.textContent = "Đang kiểm tra…";
          const r = await tryApi("/api/update/check");
          if (!r) return (info.textContent = "Không kiểm tra được.");
          info.textContent = !r.ok ? "Không đọc được kho git (sai địa chỉ, kho riêng tư hoặc mất mạng)." : r.behind ? `Có bản mới: ${r.remote} (đang chạy ${r.local}).` : `Đang là bản mới nhất (${r.local}).`;
        } }, "Kiểm tra"),
        h("button", { class: "btn", type: "button", onclick: async () => (await confirmBox("Cài lại bản hiện tại?", "Tải lại mã, cài lại thư viện và chạy lại game, kể cả khi không có bản mới.")) && runTask("update", { force: true }) }, "Cài lại"),
        h("button", { class: "btn primary", type: "button", onclick: async () => (await confirmBox("Cập nhật game?", "Database được sao lưu trước, rồi tải mã mới, cài thư viện và chạy lại game (người chơi bị ngắt vài giây). Bảng điều khiển cũng tự chạy lại.")) && runTask("update") }, "Cập nhật ngay"),
      ),
    ),
    form,
  ];
};

RENDER.env = () => {
  const ta = h("textarea", { spellcheck: "false", text: "Đang tải…" });
  const path = h("code", {});
  tryApi("/api/env").then((r) => r && ((ta.value = r.text), (path.textContent = r.path)));
  const save = async (restart) => {
    const r = await tryApi("/api/env", { text: ta.value, restart });
    if (r) toast(restart ? "Đã lưu và chạy lại game." : "Đã lưu. Chạy lại game để áp dụng.", "good");
  };
  return h("div", { class: "card" },
    h("h2", { text: "Tệp cấu hình của game" }),
    h("p", { class: "hint" }, "Tệp ", path, ". Mật khẩu database được che (giữ nguyên dấu ••• thì không đổi). Các khoá PORT, HOST, ADMIN_PORT, ADMIN_HOST, TRUST_PROXY do bảng điều khiển quản lý: sửa ở mục Game & Admin / Tên miền, sửa ở đây sẽ bị ghi đè lần áp dụng sau."),
    h("div", { style: "height:10px" }),
    ta,
    h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => save(false) }, "Lưu"), h("button", { class: "btn primary", type: "button", onclick: () => save(true) }, "Lưu & chạy lại game")),
  );
};

RENDER.panel = () => {
  const login = h("form", { autocomplete: "off" }, h("div", { class: "card" },
    h("h2", { text: "Tài khoản đăng nhập bảng điều khiển" }),
    h("div", { class: "grid2" },
      field("Tên đăng nhập", txt("user", S.panel.user, { required: true })),
      field("Mật khẩu hiện tại", h("input", { name: "old", type: "password", autocomplete: "current-password", required: true })),
      field("Mật khẩu mới", h("input", { name: "pass", type: "password", autocomplete: "new-password", minlength: 10, required: true }), "Ít nhất 10 ký tự."),
      field("Nhập lại mật khẩu mới", h("input", { name: "pass2", type: "password", autocomplete: "new-password", required: true })),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Đổi")),
  ));
  login.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(login);
    if (f.pass !== f.pass2) return toast("Hai lần nhập mật khẩu mới không giống nhau.", "bad");
    if (await tryApi("/api/panel/password", { old: f.old, user: f.user, pass: f.pass })) {
      toast("Đã đổi. Các phiên đăng nhập khác đã bị đăng xuất.", "good");
      login.reset();
      refresh();
    }
  });
  const portForm = h("form", { autocomplete: "off" }, h("div", { class: "card" },
    h("h2", { text: "Cổng bảng điều khiển" }),
    h("div", { class: "grid2" }, field("Cổng", num("port", S.panel.port, { min: 1024, max: 65535, required: true }), "Đổi xong, tường lửa mở cổng mới và trang tự chuyển sang địa chỉ mới.")),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Đổi cổng")),
  ));
  portForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = Number(formData(portForm).port);
    if (p === S.panel.port) return;
    if (!(await confirmBox("Đổi cổng bảng điều khiển?", `Bảng điều khiển sẽ chuyển sang cổng ${p}. Nếu nhà cung cấp VPS có tường lửa riêng, mở cổng ${p}/tcp ở đó trước.`))) return;
    const r = await tryApi("/api/panel/port", { port: p });
    if (!r) return;
    await refresh();
    if (S.task) openTask(S.task);
    const viaDomain = S.state.panelDomain && location.hostname === S.state.panelDomain;
    const next = viaDomain ? location.href : `${location.protocol}//${location.hostname}:${p}/`;
    toast(`Đang chuyển sang ${next} …`, "good");
    // wait for the new port to answer, then go there
    let tries = 0;
    const tryGo = () => {
      if (++tries > 40) return toast(`Mở ${next} bằng tay.`, "bad");
      fetch(viaDomain ? "/" : next, { mode: "no-cors", cache: "no-store" }).then(() => setTimeout(() => (location.href = next), 600), () => setTimeout(tryGo, 1500));
    };
    setTimeout(tryGo, 4000);
  });
  return [
    login,
    portForm,
    h("div", { class: "card" },
      h("h2", { text: "Lệnh trên VPS (qua SSH)" }),
      h("dl", { class: "kv" },
        h("dt", {}, h("code", { text: "sudo dvtt-panel passwd" })), h("dd", { text: "Quên mật khẩu: đặt lại." }),
        h("dt", {}, h("code", { text: "sudo dvtt-panel port 8443" })), h("dd", { text: "Đổi cổng bảng điều khiển." }),
        h("dt", {}, h("code", { text: "sudo dvtt-panel status" })), h("dd", { text: "Xem cấu hình và dịch vụ." }),
        h("dt", {}, h("code", { text: "sudo dvtt-panel run setup" })), h("dd", { text: "Cài tất cả từ dòng lệnh (dùng cấu hình đã lưu)." }),
        h("dt", {}, h("code", { text: "journalctl -u dvtt -f" })), h("dd", { text: "Xem log game trực tiếp." }),
      ),
    ),
  ];
};

async function service(unit, action) {
  const names = { start: "Chạy", stop: "Dừng", restart: "Chạy lại" };
  if (action === "stop" && unit === "dvtt" && !(await confirmBox("Dừng game?", "Người chơi sẽ bị ngắt kết nối (dữ liệu được lưu trước khi tắt)."))) return;
  if (action === "stop" && unit === "mariadb" && !(await confirmBox("Dừng MariaDB?", "Game sẽ không đọc/ghi được dữ liệu cho tới khi chạy lại."))) return;
  toast(`${names[action]} ${unit}…`);
  const r = await tryApi("/api/service", { unit, action });
  if (r) toast(`${names[action]} ${unit}: ${r.state.active === "active" ? "đang chạy" : r.state.active}`, r.state.active === "active" || action === "stop" ? "good" : "bad");
  await refresh();
  render();
}

// ---------------------------------------------------------------- start
async function start() {
  $("login").hidden = true;
  $("app").hidden = false;
  view = TITLES[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
  renderNav();
  render();
  await refresh();
  $("whoami").textContent = S?.panel.user ?? "";
  if (!S?.installed && view === "overview") view = "setup";
  renderNav();
  render();
  if (S?.task?.running) openTask(S.task);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => document.visibilityState === "visible" && !watching && refresh(), 6000);
}
(async () => {
  try {
    const r = await fetch("/api/session", { credentials: "same-origin" });
    if (!r.ok) return showLogin();
    csrf = (await r.json()).csrf;
    await start();
  } catch {
    showLogin();
  }
})();
