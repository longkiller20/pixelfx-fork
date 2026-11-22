// Tổ Đội and Phó Bản in the browser (▦ Thêm → Tổ Đội / Phó Bản). The browser only asks: the server (server/to-doi.js,
// server/pho-ban.js) keeps the parties, counts the entries, runs the dungeon and gives the rewards.
//   the party        a small list on the left (each member's life, where they are, the leader's star); its panel to
//                    invite (by name, or someone close by), hand the lead, put someone out, leave
//   invitations      a card at the top for each (accept or decline, before it runs out)
//   the ready check  when the leader takes the party into a dungeon, everyone is asked: ready or not
//   the dungeon      its panel (the halls and what lives there, the rules, the rewards by rank, the day's entries, who
//                    in the party can go and why not, one's runs and the fastest clears) and, inside, its bar (the hall,
//                    what is left to do, the time, the lives, the boss's life) and the result when it ends
// Every name goes in with textContent.
import { ITEMS } from "/shared/balance.js";
import { MAPS } from "/shared/maps/index.js";
import { h } from "./tong-mon.js";
import { confirmBox } from "./gia-vien.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const itemName = (k, names) => names?.[k] ?? ITEMS[k]?.name ?? k;
const itemsText = (items, names) => Object.entries(items ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${itemName(k, names)}`).join(", ");
const RANK_CLS = { S: "rs", A: "ra", B: "rb" };

export function initPhoBan({ panel, flash, game }) {
  let party = null, view = null, st = null, ready = null, readyTimer = 0, inRun = false, endTimer = 0, you = null;
  const invites = new Map(); // inviter uid -> { name, lv, size, until }
  const send = (m) => game()?.send(m);
  // which member is this player (the server says, with the party and the panel)
  const myUid = () => you;
  const panelIs = (cls) => !$("panel").hidden && $("panel").querySelector(`.${cls}`);

  // ---------------------------------------------------------------- the party's list on the left
  const hud = $("partyhud");
  hud.addEventListener("click", () => openParty());
  function drawHud() {
    hud.hidden = !party;
    if (!party) return;
    const me = myUid(), rd = new Set(party.ready?.ok ?? []);
    hud.replaceChildren(
      h("div.phead", {}, h("b", { text: `⚑ Tổ đội ${party.members.length}/${party.max}` }), party.ready ? h("span.prd", { text: `chờ sẵn sàng ${party.ready.left}s` }) : null),
      ...party.members.map((m) =>
        h(`div.pm${m.on ? "" : ".off"}${m.uid === me ? ".mine" : ""}`, {},
          h("span.pn", { text: `${m.uid === party.leader ? "★ " : ""}${m.name}${party.ready ? (rd.has(m.uid) ? " ✓" : " …") : ""}` }),
          h("i.phb", {}, h("i", { style: `width:${m.on ? m.hp : 0}%` })),
          h("span.pw", { text: !m.on ? "ngoại tuyến" : m.dead ? "trọng thương" : m.run ? "phó bản" : m.map }))),
    );
  }

  // ---------------------------------------------------------------- invitations and the ready check: cards at the top
  const pop = $("pbpop");
  function drawPop() {
    const now = Date.now(), cards = [];
    for (const [uid, inv] of invites) {
      const left = Math.ceil((inv.until - now) / 1000);
      if (left <= 0) {
        invites.delete(uid);
        continue;
      }
      cards.push(h("div.pcard", {},
        h("p", {}, h("b", { text: inv.name }), ` mời đạo hữu vào tổ đội (${inv.size} người) · ${left}s`),
        h("div.prow", {},
          h("button.primary", { type: "button", text: "Đồng ý", onclick: () => (send({ t: "party", a: "accept", uid }), invites.delete(uid), drawPop()) }),
          h("button", { type: "button", text: "Từ chối", onclick: () => (send({ t: "party", a: "decline", uid }), invites.delete(uid), drawPop()) }))));
    }
    if (ready) {
      const left = Math.ceil((ready.until - now) / 1000);
      if (left <= 0) ready = null;
      else
        cards.push(h("div.pcard.ready", {},
          h("p", {}, "Đội trưởng ", h("b", { text: ready.by }), " muốn đưa tổ đội vào ", h("b", { text: ready.name }), ` · ${left}s`),
          h("div.prow", {},
            h("button.primary", { type: "button", text: "Sẵn sàng", onclick: () => (send({ t: "pb", a: "ready", ok: true }), (ready = null), drawPop()) }),
            h("button", { type: "button", text: "Chưa", onclick: () => (send({ t: "pb", a: "ready", ok: false }), (ready = null), drawPop()) }))));
    }
    pop.replaceChildren(...cards);
    pop.hidden = !cards.length;
    clearTimeout(readyTimer);
    if (cards.length) readyTimer = setTimeout(drawPop, 1000);
  }

  // ---------------------------------------------------------------- the party panel
  function openParty() {
    if (!game()) return;
    send({ t: "party", a: "get" });
    drawParty(true);
  }
  function drawParty(force = false) {
    if (!force && !panelIs("ptp")) return;
    const me = myUid(), lead = !party || party.leader === me;
    const wrap = h("div.ptp");
    if (!party) wrap.append(h("p.dim", { text: "Đạo hữu chưa ở trong tổ đội nào. Mời một người là tổ đội được lập, đạo hữu làm đội trưởng; hoặc lập tổ đội một mình để vào phó bản." }));
    else {
      wrap.append(h("p.dim", { text: `Tổ đội ${party.members.length}/${party.max} người. Kênh chat Tổ Đội: chọn "Tổ Đội" ở ô chat hoặc gõ /p <lời>.` }));
      const list = h("div.ptlist");
      for (const m of party.members) {
        const acts = [];
        if (lead && m.uid !== me) {
          acts.push(h("button", { type: "button", text: "Trao đội trưởng", onclick: async () => {
            if (await confirmBox({ title: "Trao quyền đội trưởng", text: `Trao quyền đội trưởng cho ${m.name}?` })) send({ t: "party", a: "lead", uid: m.uid });
          } }));
          acts.push(h("button.danger", { type: "button", text: "Mời ra", onclick: async () => {
            if (await confirmBox({ title: "Mời ra khỏi tổ đội", text: `Mời ${m.name} ra khỏi tổ đội?`, ok: "Mời ra" })) send({ t: "party", a: "kick", uid: m.uid });
          } }));
        }
        list.append(h(`div.ptrow${m.on ? "" : ".off"}`, {},
          h("div.ptn", {}, h("b", { text: `${m.uid === party.leader ? "★ " : ""}${m.name}${m.uid === me ? " (đạo hữu)" : ""}` }), h("span.dim", { text: ` ${m.realm || ""}` })),
          h("div.ptw", { text: !m.on ? "Ngoại tuyến (giữ chỗ 5 phút)" : `${m.run ? "Trong phó bản" : m.map}${m.dead ? " · trọng thương" : ""}` }),
          h("i.phb.big", {}, h("i", { style: `width:${m.on ? m.hp : 0}%` })),
          acts.length ? h("div.pta", {}, ...acts) : null));
      }
      wrap.append(list);
    }
    // invitations to me
    for (const [uid, inv] of invites)
      wrap.append(h("div.ptinv", {}, h("span", {}, h("b", { text: inv.name }), " mời đạo hữu vào tổ đội"),
        h("button.primary", { type: "button", text: "Đồng ý", onclick: () => (send({ t: "party", a: "accept", uid }), invites.delete(uid), drawPop()) }),
        h("button", { type: "button", text: "Từ chối", onclick: () => (send({ t: "party", a: "decline", uid }), invites.delete(uid), drawPop()) })));
    // invite by name, or someone close by (the leader, or anyone without a party)
    if (lead && (!party || party.members.length < party.max)) {
      const inp = h("input", { maxLength: 24, placeholder: "Đạo hiệu người muốn mời", autocomplete: "off" });
      const go = () => {
        const v = inp.value.trim();
        if (!v) return flash("Nhập đạo hiệu người muốn mời.");
        send({ t: "party", a: "invite", name: v });
        inp.value = "";
      };
      inp.addEventListener("keydown", (e) => e.key === "Enter" && go());
      wrap.append(h("div.ptform", {}, inp, h("button.primary", { type: "button", text: "Mời", onclick: go })));
      const inParty = new Set(party?.members.map((m) => m.name) ?? []);
      const near = (game()?.nearby() ?? []).filter((p) => !inParty.has(p.name)).slice(0, 8);
      if (near.length)
        wrap.append(h("div.ptnear", {}, h("b", { text: "Ở gần đây" }),
          ...near.map((p) => h("button", { type: "button", text: `+ ${p.name}`, title: `Mời ${p.name} vào tổ đội`, onclick: () => send({ t: "party", a: "invite", name: p.name }) }))));
    }
    const foot = h("div.ptfoot");
    foot.append(h("button.primary", { type: "button", text: "🏯 Phó Bản", onclick: () => openDungeon() }));
    if (!party) foot.append(h("button", { type: "button", text: "Lập tổ đội một mình", onclick: () => send({ t: "party", a: "create" }) }));
    else foot.append(h("button.danger", { type: "button", text: "Rời tổ đội", onclick: async () => {
      if (await confirmBox({ title: "Rời tổ đội", text: "Rời khỏi tổ đội này?", ok: "Rời đội" })) send({ t: "party", a: "leave" });
    } }));
    wrap.append(foot);
    panel("Tổ Đội", wrap);
  }

  // ---------------------------------------------------------------- the dungeon panel
  function openDungeon() {
    if (!game()) return;
    send({ t: "pb", a: "view" });
    if (view) drawDungeon(true);
    else panel("Phó Bản", h("div.pbp", {}, h("p.dim", { text: "Đang tải..." })));
  }
  function drawDungeon(force = false) {
    if (!view || (!force && !panelIs("pbp"))) return;
    const v = view, R = v.rules, wrap = h("div.pbp"), names = v.itemNames;
    const me = v.members.find((m) => m.uid === myUid()) ?? v.members[0];
    for (const d of v.dungeons) {
      const card = h("section.pbcard");
      card.append(h("h3", { text: `🏯 ${d.name}` }), h("p.pbdesc", { text: d.desc }));
      card.append(h("ol.pbst", {}, ...d.stages.map((s, i) => h("li", {},
        h("b", { text: `Tầng ${i + 1} · ${s.name}` }), h("span.dim", { text: ` — ${s.goal}` }),
        h("div.pbmobs", { text: s.boss ? `Boss: ${s.boss} (gọi thuộc hạ khi còn một nửa máu, cuồng bạo khi còn một phần tư)` : s.mobs.map((m) => `${m.elite ? "★ " : ""}${m.name} ×${m.n}`).join(" · ") })))));
      // the rewards by rank
      const rw = (r) => d.reward[r];
      card.append(h("table.pbrw", {},
        h("tr", {}, h("th", { text: "Hạng" }), h("th", { text: "Thời gian" }), h("th", { text: "Linh thạch" }), h("th", { text: "Tu vi" }), h("th", { text: "Vật phẩm" })),
        ...["S", "A", "B"].map((r) => h("tr", {},
          h("td", {}, h(`b.rank.${RANK_CLS[r]}`, { text: r })),
          h("td", { text: r === "S" ? `≤ ${R.rankS}%` : r === "A" ? `≤ ${R.rankA}%` : "còn lại" }),
          h("td", { text: fmt(rw(r).stones) }), h("td", { text: fmt(rw(r).exp) }), h("td", { text: itemsText(rw(r).items, names) })))));
      card.append(h("p.dim.small", { text: `Lần thông quan đầu tiên trong ngày: thêm ${d.reward.first}% linh thạch và tu vi.` }));
      // the fastest clears
      if (d.best.length)
        card.append(h("div.pbbest", {}, h("b", { text: "Thông quan nhanh nhất" }),
          h("ol", {}, ...d.best.map((b) => h("li", {}, h(`b.rank.${RANK_CLS[b.rank] ?? "rb"}`, { text: b.rank ?? "-" }), ` ${clock(b.secs)} · ${b.size} người · `, h("span", { text: b.names }))))));
      // who can go, and the button
      const all = v.members.every((m) => !m.why);
      card.append(h("div.pbparty", {}, h("b", { text: v.party ? `Tổ đội (${v.members.length}/${R.party})` : "Đi một mình" }),
        ...v.members.map((m) => h(`div.pbm${m.why ? ".no" : ""}`, {},
          h("span", { text: `${m.leader && v.party ? "★ " : ""}${m.name}` }), h("span.dim", { text: m.realm }),
          h("span", { text: `${m.left}/${R.daily} lượt` }), h("span.why", { text: m.why ? `✗ ${m.why}` : "✓ sẵn sàng" })))));
      if (v.run) {
        card.append(h("div.pbgo", {}, h("p", { text: `Đạo hữu đang trong ${v.run.name}.` }),
          h("button.danger", { type: "button", text: "Rời phó bản", onclick: () => quit() })));
      } else {
        const btn = h("button.primary.big", { type: "button", text: v.leader ? "Vào phó bản" : "Chỉ đội trưởng mới đưa tổ đội vào", disabled: !v.leader || !all || !!v.party?.ready });
        btn.addEventListener("click", () => {
          send({ t: "pb", a: "start", d: d.key });
          btn.disabled = true;
          setTimeout(() => send({ t: "pb", a: "view" }), 1500);
        });
        card.append(h("div.pbgo", {}, btn, !all ? h("p.dim.small", { text: "Mọi thành viên cần trực tuyến, đủ cấp và còn lượt trong ngày." }) : v.party ? h("p.dim.small", { text: "Bấm vào: mọi thành viên được hỏi sẵn sàng; khi tất cả đồng ý, cả đội vào cùng lúc và mỗi người tính một lượt." }) : null));
      }
      wrap.append(card);
    }
    // the rules
    wrap.append(h("section.pbrules", {}, h("b", { text: "Luật phó bản" }), h("ul", {},
      h("li", { text: `Tổ đội 1–${R.party} người, cảnh giới tối thiểu ${R.level}. Mỗi người vào tối đa ${R.daily} lượt mỗi ngày (tính lúc vào, kể cả khi thất bại). Hôm nay đạo hữu còn ${me?.left ?? 0} lượt.` }),
      h("li", { text: `Mỗi tầng bị phong ấn tới khi diệt sạch tầng trước. Yêu thú và boss mạnh hơn theo số người: mỗi người thêm +${R.hpPer}% máu, +${R.atkPer}% công.` }),
      h("li", { text: `Lượt hồi sinh chung của cả đội: ${R.lives} lượt, mỗi người thêm ${R.livesPer}. Gục ngã thì hồi sinh sau ${R.respawn} giây ở điểm hồi sinh của tầng; gục khi đã hết lượt là thất bại.` }),
      h("li", { text: `Thời gian tối đa ${R.minutes} phút. Thông quan trong ${R.rankS}% thời gian: hạng S (${R.mulS}% thưởng); trong ${R.rankA}%: hạng A (${R.mulA}%); còn lại hạng B.` }),
      h("li", { text: "Rớt mạng: đăng nhập lại là về đúng phó bản. Rời phó bản giữa chừng thì không có thưởng, các thành viên khác vẫn đánh tiếp." }))));
    // one's runs
    if (v.history.length)
      wrap.append(h("section.pbhist", {}, h("b", { text: "Các lượt gần đây của đạo hữu" }), h("table", {},
        h("tr", {}, h("th", { text: "Phó bản" }), h("th", { text: "Người" }), h("th", { text: "Kết quả" }), h("th", { text: "Thời gian" }), h("th", { text: "Thưởng" })),
        ...v.history.map((r) => h("tr", {},
          h("td", { text: r.name }), h("td", { text: r.size }),
          h("td", {}, r.rank ? h(`b.rank.${RANK_CLS[r.rank]}`, { text: r.rank }) : null, ` ${r.stateName}`),
          h("td", { text: r.secs ? clock(r.secs) : "-" }),
          h("td", { text: r.rewarded ? `${fmt(r.stones)} linh thạch, ${fmt(r.exp)} tu vi${r.first ? " ★" : ""}` : "-" }))))));
    panel("Phó Bản", wrap);
  }
  async function quit() {
    if (await confirmBox({ title: "Rời phó bản", text: "Rời phó bản bây giờ thì không nhận thưởng (lượt vào hôm nay vẫn bị tính). Các thành viên khác vẫn đánh tiếp.", ok: "Rời phó bản" })) {
      send({ t: "pb", a: "quit" });
      $("panel").hidden = true;
    }
  }

  // ---------------------------------------------------------------- inside: the bar, the result
  const bar = $("pbhud");
  function drawBar() {
    document.body.classList.toggle("inpb", inRun);
    bar.hidden = !inRun || !st;
    if (bar.hidden) return;
    const s = st, left = Math.max(0, s.left - Math.floor((Date.now() - s.at) / 1000));
    const kids = [
      h("div.pbh1", {}, h("b", { text: `🏯 ${s.name}` }), h("span", { text: `Tầng ${s.stage + 1}/${s.stages.length} · ${s.stages[s.stage]}` }),
        h("button.pbquit", { type: "button", title: "Rời phó bản", text: "Rời", onclick: () => quit() })),
      h("div.pbh2", {},
        h("span.goal", { text: s.boss ? `🎯 ${s.goal}` : `🎯 ${s.goal}: còn ${s.up}/${s.all}` }),
        h(`span.time${left < 60 ? ".low" : ""}`, { text: `⏳ ${clock(left)}` }),
        h(`span.lives${s.lives === 0 ? ".low" : ""}`, { text: `♥ ${s.lives}`, title: "Lượt hồi sinh chung còn lại" })),
    ];
    if (s.boss) {
      const pct = (s.boss.hp / s.boss.max) * 100;
      kids.push(h("div.pbboss", {},
        h("div.pbbn", {}, h("b", { text: `👹 ${s.boss.name}` }), s.boss.rage ? h("em", { text: "Cuồng bạo!" }) : null, s.boss.roarIn !== null ? h("span", { text: `🐍 ${s.boss.roarIn}s` }) : null),
        h("div.bbhp", {}, h("i", { style: `width:${Math.max(0, Math.min(100, pct))}%` }), h("span", { text: `${fmt(s.boss.hp)} / ${fmt(s.boss.max)}` }))));
    }
    bar.replaceChildren(...kids);
  }
  setInterval(() => inRun && st && drawBar(), 1000);

  function showEnd(m) {
    $("pbend")?.remove();
    clearInterval(endTimer);
    const head = m.state === "cleared" ? "🏆 Thông quan!" : m.state === "failed" ? "☠ Thất bại" : "Phó bản kết thúc";
    const card = h("div.becard.pbe", {},
      h("h3", { text: `${head} · ${m.name}` }),
      m.rank ? h("div.pbrank", {}, h(`b.rank.big.${RANK_CLS[m.rank]}`, { text: m.rank }), h("span", { text: `${clock(m.secs)} / ${clock(m.limit)}` })) : h("p", { text: m.why ? `Lý do: ${m.why}.` : `${clock(m.secs)}` }),
      h("table.pbboard", {}, h("tr", {}, h("th", { text: "Thành viên" }), h("th", { text: "Sát thương" }), h("th", { text: "Gục" })),
        ...m.board.map((r) => h(`tr${r.left ? ".off" : ""}`, {}, h("td", { text: `${r.name}${r.left ? " (đã rời)" : ""}` }), h("td", { text: fmt(r.dmg) }), h("td", { text: r.deaths })))),
    );
    const rw = m.me?.reward;
    if (rw)
      card.append(h("div.beme", {}, h("b", { text: `+${fmt(rw.stones)} linh thạch · +${fmt(rw.exp)} tu vi` }),
        itemsText(rw.items) ? h("span", { text: `+ ${itemsText(rw.items)}` }) : null,
        rw.first ? h("em", { text: "★ Lần thông quan đầu tiên hôm nay: đã cộng thêm thưởng" }) : null));
    else if (m.state === "cleared") card.append(h("p.dim", { text: m.me?.left ? "Đạo hữu đã rời phó bản giữa chừng nên không có thưởng." : "Không có thưởng." }));
    else card.append(h("p.dim", { text: "Không có thưởng. Lượt vào hôm nay đã được tính." }));
    const back = h("p.dim.small");
    let left = m.back;
    const tick = () => (back.textContent = left > 0 ? `Tự động đưa về sau ${left} giây...` : "Đang đưa về...");
    tick();
    endTimer = setInterval(() => (left--, tick(), left < -3 && clearInterval(endTimer)), 1000);
    const ok = h("button.primary", { type: "button", text: "Đóng" });
    card.append(back, ok);
    const box = h("div.bossend", { id: "pbend" }, card);
    ok.addEventListener("click", () => box.remove());
    box.addEventListener("click", (e) => e.target === box && box.remove());
    $("hud").append(box);
  }

  // ---------------------------------------------------------------- what the server says
  function onMsg(m) {
    switch (m.t) {
      case "party":
        party = m.party;
        if (m.you) you = m.you;
        if (m.note) flash(m.note);
        game()?.setParty(party ? party.members.filter((x) => x.on && x.id).map((x) => x.id) : []);
        drawHud();
        drawParty();
        break;
      case "pinvite":
        invites.set(m.from, { name: m.name, lv: m.lv, size: m.size, until: Date.now() + m.secs * 1000 });
        drawPop();
        break;
      case "pready":
        if (m.cancel) {
          ready = null;
          flash(`Hủy vào phó bản: ${m.why}.`);
        } else ready = { key: m.key, by: m.by, name: view?.dungeons.find((d) => d.key === m.key)?.name ?? "phó bản", until: Date.now() + m.secs * 1000 };
        drawPop();
        if (panelIs("pbp")) send({ t: "pb", a: "view" });
        break;
      case "pbview":
        view = m;
        if (m.you) you = m.you;
        drawDungeon();
        break;
      case "pbstate":
        st = { ...m, at: Date.now() };
        drawBar();
        break;
      case "pbend":
        showEnd(m);
        break;
      case "pbev":
        if (m.k === "help") flash("🐍 Xà Vương gọi thuộc hạ tới trợ chiến!");
        if (m.k === "rage") flash("🔥 Xà Vương nổi cơn cuồng bạo!");
        break;
      case "map":
        inRun = !!MAPS[m.map]?.dungeon;
        // into the dungeon: its panel (or the party's) out of the way
        if (inRun && (panelIs("pbp") || panelIs("ptp"))) $("panel").hidden = true;
        if (!inRun) (st = null), $("pbend") && setTimeout(() => $("pbend")?.remove(), 4000);
        drawBar();
        break;
    }
  }
  return { openParty, openDungeon, onMsg };
}
