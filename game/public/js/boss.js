// Boss Thế Giới in the browser (shared/boss.js, server/boss.js):
//   the boss itself    its rigged pixelfx figure (/hieu-ung/fx/boss/<key>.js, moved by /hieu-ung/fx/boss/_rig.js): it
//                      breathes, strides, raises and slams its mace, throws its head back and roars, sinks when it falls
//   the bar            on its map, at the top: its name, its one life (the same in every Khu), when it roars next, how
//                      long it stays, and the ranking (the top five and one's own place), folded on a phone
//   the word           elsewhere, a small pill: which boss is up, where, how much life it has left
//   the end            when it falls: who finished it, the top five, and what one got (the killer's bonus marked)
import { poseOf, drawBoss } from "/hieu-ung/fx/boss/_rig.js";
import { BOSSES, bossOf } from "/shared/boss.js";
import { hex, WHITE } from "/hieu-ung/core/index.js";

const figures = new Map(); // boss key -> FIGURE | promise
function figure(key) {
  const have = figures.get(key);
  if (have && !have.then) return have;
  if (!have && BOSSES[key]) figures.set(key, import(`/hieu-ung/fx/${BOSSES[key].fx}.js`).then((m) => (figures.set(key, m.FIGURE), m.FIGURE)));
  return null;
}
const fmt = (n) => Math.round(n).toLocaleString("vi-VN");
const RED = hex("#ff3a1a"), EMBER = hex("#ff8a2a");

/** What each boss on screen is doing (from the server's "boss" events): when it began to slam, to roar, fell. */
const acts = new Map(); // id -> { slam, roar, dead, lastX, movingUntil }
export function bossEvent(e, now) {
  const a = acts.get(e.id) ?? {};
  if (e.a === "slam") a.slam = now;
  if (e.a === "roar") a.roar = now;
  if (e.a === "dead") a.dead = now;
  if (e.a === "rise") Object.assign(a, { slam: null, roar: null, dead: null });
  acts.set(e.id, a);
}

/** Draw a boss entity (from the snapshot: x, y, face, hp, f) with its feet at its place; true if drawn. */
export function drawBossEnt(p, e, sx, sy, now, flash) {
  const def = bossOf(e.type), F = def && figure(def.key);
  if (!F) return false;
  const a = acts.get(e.id) ?? {};
  acts.set(e.id, a);
  // walking: it moved since the last frame
  if (a.lastX !== undefined && Math.abs(e.x - a.lastX) > 0.2) a.movingUntil = now + 0.25;
  a.lastX = e.x;
  const st = { t: now + e.id * 0.37, moving: (a.movingUntil ?? 0) > now };
  if (a.slam && now - a.slam < 1.5) st.slam = { age: now - a.slam };
  if (a.roar && now - a.roar < 1.9) st.roar = { age: now - a.roar };
  if (e.dead || a.dead) st.dead = { age: a.dead ? now - a.dead : 9 };
  if (st.dead && st.dead.age > 7) return true;
  p.place(sx, sy, e.face < 0);
  // its weight on the ground: a wide shadow, the lava in its mace lighting the floor; a red aura while it roars
  for (let i = 0; i < 3; i++) p.glow(0, 2, 70 - i * 18, hex("#000000"), 0.18);
  p.glow(30, -60, 70, EMBER, 0.08 + 0.04 * Math.sin(now * 3));
  if (st.roar) p.glow(0, -80, 120, RED, 0.35 * Math.max(0, 1 - Math.abs(st.roar.age - 0.9) / 0.9));
  const fade = st.dead ? Math.max(0, 1 - Math.max(0, st.dead.age - 3) / 4) : 1;
  if (fade < 1) p.fade = fade;
  drawBoss(p, F, poseOf(st), flash ? () => WHITE : e.f & 4 ? (c) => c : undefined);
  p.fade = 1;
  return true;
}
export const bossTop = (type) => bossOf(type)?.tall ?? 150;

// ---------------------------------------------------------------- the bar, the pill, the end
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text !== undefined ? { textContent: text } : {});

/** The HUD parts; mount(hud) once. */
export function createBossHud({ toast }) {
  const bar = el("div", "bossbar"), pill = el("button", "bosspill");
  bar.hidden = pill.hidden = true;
  pill.type = "button";
  bar.innerHTML = `<div class="bbhead"><b class="bbname"></b><span class="bbtitle"></span><button type="button" class="bbrank" title="Bảng sát thương">🏆</button></div>
    <div class="bbhp"><i></i><span></span></div>
    <div class="bbmeta"><span class="bbroar"></span><span class="bbleft"></span><span class="bbme"></span></div>
    <ol class="bbtop" hidden></ol>`;
  const $ = (s) => bar.querySelector(s);
  let last = 0, lastBoss = null, info = null, onMap = false;
  $(".bbrank").addEventListener("click", () => ($(".bbtop").hidden = !$(".bbtop").hidden));
  pill.addEventListener("click", () => info?.up && toast(`👹 ${info.name} đang ở ${info.mapName}: tới Truyền Tống Trận, chọn ${info.mapName}.`));
  const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}g${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

  return {
    mount(hud) {
      hud.append(bar, pill);
    },
    /** The bar's numbers (once a second, on the boss's map). */
    update(m) {
      last = performance.now();
      lastBoss = m;
      onMap = true;
      bar.hidden = false;
      pill.hidden = true;
      const pct = m.max ? (m.hp / m.max) * 100 : 0;
      $(".bbname").textContent = `👹 ${m.name}`;
      $(".bbtitle").textContent = m.mapName;
      $(".bbhp i").style.width = `${Math.max(0, Math.min(100, pct))}%`;
      $(".bbhp span").textContent = `${fmt(m.hp)} / ${fmt(m.max)} · ${pct >= 10 ? Math.ceil(pct) : pct.toFixed(1)}%`;
      $(".bbroar").textContent = `🔥 Phản kích sau ${m.roarIn}s`;
      $(".bbleft").textContent = `⏳ ${clock(m.left)}`;
      $(".bbme").textContent = m.me?.dmg ? `Hạng ${m.me.rank} · ${fmt(m.me.dmg)} (${m.me.pct}%)` : "Chưa gây sát thương";
      const ol = $(".bbtop");
      ol.replaceChildren(...m.top.slice(0, 5).map((r) => {
        const li = el("li", r.name === m.myName ? "mine" : "");
        li.append(el("b", "", r.name), el("span", "", `${fmt(r.dmg)} · ${r.pct}%`));
        return li;
      }));
      if (!m.top.length) ol.append(el("li", "dim", "Chưa ai gây sát thương"));
    },
    /** The word about the boss, from anywhere. */
    info(m) {
      info = m;
      this.pill();
    },
    pill() {
      // on its map the bar says it all; off it, the pill (if one is up)
      const stale = performance.now() - last > 3000;
      if (stale) (onMap = false), (bar.hidden = true);
      pill.hidden = !info?.up || onMap;
      if (info?.up) pill.textContent = `👹 ${info.name} · ${info.mapName} · ${info.pct}%`;
    },
    /** It fell: the result, over the screen until closed (or 25 s). */
    end(m, host) {
      bar.hidden = true;
      onMap = false;
      const box = el("div", "bossend");
      const card = el("div", "becard");
      card.append(el("h3", "", `👹 ${m.name} đã tử trận!`));
      if (m.killer) card.append(el("p", "bekiller", `⚔ ${m.killer} ra đòn kết liễu`));
      const ol = el("ol", "betop");
      for (const r of m.top) {
        const li = el("li");
        li.append(el("b", "", r.name), el("span", "", `${fmt(r.dmg)} · ${r.pct}%`));
        ol.append(li);
      }
      card.append(ol);
      if (m.me) {
        const mine = el("div", "beme");
        mine.append(el("span", "", `Sát thương của đạo hữu: ${fmt(m.me.dmg)} (${m.me.pct}%)`), el("b", "", `+${fmt(m.me.stones)} linh thạch · +${fmt(m.me.exp)} tu vi`));
        if (m.me.killer) mine.append(el("em", "", "★ Thưởng kết liễu đã cộng vào"));
        card.append(mine);
      } else card.append(el("p", "dim", "Đạo hữu chưa gây sát thương nên không có phần thưởng."));
      const ok = el("button", "primary", "Đóng");
      ok.type = "button";
      card.append(ok);
      box.append(card);
      const close = () => box.remove();
      ok.addEventListener("click", close);
      box.addEventListener("click", (e) => e.target === box && close());
      setTimeout(close, 25000);
      host.append(box);
    },
    get onMap() {
      return onMap;
    },
    get current() {
      return lastBoss;
    },
  };
}
