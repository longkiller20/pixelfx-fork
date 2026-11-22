// Tổ Đội on the server (shared/pho-ban.js has the numbers): parties of up to PB.party people, kept in memory by the
// Universe (the game's one thread: no two changes ever cross). A party lasts while anyone is in it; a server restart
// ends them all (nothing of value is kept in a party: a run in a dungeon has its own record).
//  - invite: only the leader invites (making the party, if they have none, with themself as leader); by name, someone
//    online, not in a party, who hasn't blocked them; an invitation lasts PARTY.inviteSeconds; one at a time per pair.
//  - accept / decline: the invitation must still be there, the party still there and not full, and the invited one in
//    no party.
//  - leave / kick / lead: whoever leaves (or is put out) is gone; the leader leaving hands the lead to the one who joined
//    first after them; the last to leave ends it.
//  - a member whose connection drops keeps their place PARTY.awaySeconds, then is taken out.
//  - the ready check (before a dungeon): everyone online answers within PARTY.readySeconds; one no (or silence) and it is off.
import { PB, PARTY } from "../shared/pho-ban.js";
import { realmName } from "../shared/balance.js";

let nextParty = 1;
const no = (m) => Object.assign(new Error(m), { status: 409, party: true });

export class Parties {
  constructor(u) {
    this.u = u;
    this.byId = new Map(); // party id -> { id, leader, members: Map uid -> { uid, name, at, away }, ready }
    this.of = new Map(); // uid -> party id
    this.invites = new Map(); // invitee uid -> Map inviter uid -> { party, from, fromName, until }
    this.last = new Map(); // party id -> what its members were last told (JSON), to send only changes
  }

  /** The party uid is in, or null. */
  partyOf(uid) {
    const id = this.of.get(uid);
    return id ? this.byId.get(id) ?? null : null;
  }
  /** The uids of uid's party (just [uid] when alone). */
  membersOf(uid) {
    const p = this.partyOf(uid);
    return p ? [...p.members.keys()] : [uid];
  }
  sameParty(a, b) {
    const p = this.partyOf(a);
    return !!p && p.members.has(b);
  }

  // ---- what a member's browser shows
  view(party) {
    const players = this.u.players;
    return {
      id: party.id, leader: party.leader, max: PB.party,
      members: [...party.members.values()].map((m) => {
        const p = players.get(m.uid);
        return {
          uid: m.uid, name: m.name, on: !!p && !p.gone, lv: p?.level ?? m.lv ?? 1, realm: p ? realmName(p.level) : "",
          map: p?.world.map.name ?? "", run: p?.world.run ? 1 : 0, hp: p ? Math.round(Math.max(0, p.hpFrac) * 100) : 0, dead: p?.dead ? 1 : 0, id: p?.id ?? 0,
        };
      }),
      ready: party.ready ? { key: party.ready.key, ok: [...party.ready.ok], left: Math.max(0, Math.ceil((party.ready.until - Date.now()) / 1000)) } : null,
    };
  }
  /** Tell every member online how the party stands (only what changed, unless force). */
  push(party, force = false) {
    const v = this.view(party), j = JSON.stringify(v);
    if (!force && this.last.get(party.id) === j) return;
    this.last.set(party.id, j);
    for (const uid of party.members.keys()) this.u.sendUser(uid, { t: "party", party: v, you: uid });
  }
  /** Tell uid they have no party (any more). */
  clear(uid, note = null) {
    this.u.sendUser(uid, { t: "party", party: null, you: uid, ...(note ? { note } : {}) });
  }

  // ---- invitations
  invite(fromUid, name) {
    const me = this.u.players.get(fromUid);
    if (!me) throw no("Đạo hữu không trực tuyến.");
    let party = this.partyOf(fromUid);
    if (party && party.leader !== fromUid) throw no("Chỉ đội trưởng mới mời được người vào tổ đội.");
    if (party?.ready) throw no("Tổ đội đang chờ sẵn sàng vào phó bản.");
    if (party && party.members.size >= PB.party) throw no(`Tổ đội đã đủ ${PB.party} người.`);
    const key = String(name ?? "").trim().toLowerCase();
    if (!key) throw no("Nhập đạo hiệu người muốn mời.");
    const them = [...this.u.players.values()].find((p) => !p.gone && p.name.toLowerCase() === key);
    if (!them) throw no(`Không tìm thấy "${String(name).trim().slice(0, 20)}" đang trực tuyến.`);
    if (them.userId === fromUid) throw no("Không thể tự mời chính mình.");
    if (this.partyOf(them.userId)) throw no(`${them.name} đã ở trong một tổ đội khác.`);
    if (them.blocked.has(fromUid)) throw no(`${them.name} không nhận lời mời của đạo hữu.`);
    const mine = this.invites.get(them.userId) ?? new Map(), was = mine.get(fromUid);
    if (was && was.until > Date.now() && was.until - Date.now() > (PARTY.inviteSeconds - 5) * 1000) throw no("Vừa mời rồi, chờ một chút.");
    // the party is made with the first invitation
    if (!party) party = this.make(fromUid, me.name);
    const inv = { party: party.id, from: fromUid, fromName: me.name, until: Date.now() + PARTY.inviteSeconds * 1000 };
    mine.set(fromUid, inv);
    this.invites.set(them.userId, mine);
    this.u.sendUser(them.userId, { t: "pinvite", from: fromUid, name: me.name, lv: me.level, size: party.members.size, secs: PARTY.inviteSeconds });
    this.push(party, true);
    return { name: them.name };
  }
  /** A party of one, uid its leader. */
  make(uid, name) {
    const party = { id: nextParty++, leader: uid, members: new Map([[uid, { uid, name, at: Date.now(), away: null }]]), ready: null };
    this.byId.set(party.id, party);
    this.of.set(uid, party.id);
    return party;
  }
  /** Make a party alone (to go into a dungeon alone, or to invite later). */
  create(uid) {
    const me = this.u.players.get(uid);
    if (!me) throw no("Đạo hữu không trực tuyến.");
    if (this.partyOf(uid)) throw no("Đạo hữu đã ở trong một tổ đội.");
    const p = this.make(uid, me.name);
    this.push(p, true);
    return p;
  }
  answer(uid, fromUid, yes) {
    const mine = this.invites.get(uid), inv = mine?.get(fromUid);
    if (!inv || inv.until < Date.now()) {
      mine?.delete(fromUid);
      throw no("Lời mời đã hết hạn.");
    }
    mine.delete(fromUid);
    const party = this.byId.get(inv.party);
    if (!yes) {
      const me = this.u.players.get(uid);
      if (party) this.u.toastUser(fromUid, `${me?.name ?? "Người được mời"} đã từ chối lời mời vào tổ đội.`);
      return null;
    }
    if (!party) throw no("Tổ đội đó đã giải tán.");
    if (this.partyOf(uid)) throw no("Đạo hữu đã ở trong một tổ đội.");
    if (party.members.size >= PB.party) throw no(`Tổ đội đã đủ ${PB.party} người.`);
    if (party.ready) throw no("Tổ đội đang chờ sẵn sàng vào phó bản, thử lại sau.");
    const me = this.u.players.get(uid);
    if (!me) throw no("Đạo hữu không trực tuyến.");
    party.members.set(uid, { uid, name: me.name, at: Date.now(), away: null });
    this.of.set(uid, party.id);
    // any other invitations to them are void now
    this.invites.delete(uid);
    for (const m of party.members.keys()) if (m !== uid) this.u.toastUser(m, `${me.name} đã gia nhập tổ đội.`);
    this.push(party, true);
    return party;
  }

  // ---- leaving
  /** uid leaves their party (why: "leave" by choice, "kick" put out, "away" gone too long). */
  remove(uid, why = "leave") {
    const party = this.partyOf(uid);
    if (!party) throw no("Đạo hữu không ở trong tổ đội nào.");
    const name = party.members.get(uid)?.name ?? "?";
    party.members.delete(uid);
    this.of.delete(uid);
    if (party.ready) this.cancelReady(party, `${name} đã rời tổ đội`);
    this.clear(uid, why === "kick" ? "Đạo hữu đã bị mời ra khỏi tổ đội." : why === "away" ? "Mất kết nối quá lâu: đạo hữu đã rời tổ đội." : null);
    if (!party.members.size) return void this.end(party);
    if (party.leader === uid) {
      party.leader = [...party.members.values()].sort((a, b) => a.at - b.at)[0].uid;
      this.u.toastUser(party.leader, "Đạo hữu trở thành đội trưởng.");
    }
    const say = why === "kick" ? `${name} đã bị mời ra khỏi tổ đội.` : why === "away" ? `${name} mất kết nối quá lâu, đã rời tổ đội.` : `${name} đã rời tổ đội.`;
    for (const m of party.members.keys()) this.u.toastUser(m, say);
    this.push(party, true);
  }
  kick(uid, target) {
    const party = this.partyOf(uid);
    if (!party) throw no("Đạo hữu không ở trong tổ đội nào.");
    if (party.leader !== uid) throw no("Chỉ đội trưởng mới mời người ra được.");
    if (target === uid) throw no("Muốn rời tổ đội thì bấm Rời đội.");
    if (!party.members.has(target)) throw no("Người này không ở trong tổ đội.");
    this.remove(target, "kick");
  }
  lead(uid, target) {
    const party = this.partyOf(uid);
    if (!party) throw no("Đạo hữu không ở trong tổ đội nào.");
    if (party.leader !== uid) throw no("Chỉ đội trưởng mới trao quyền được.");
    if (!party.members.has(target) || target === uid) throw no("Người này không ở trong tổ đội.");
    if (party.ready) throw no("Tổ đội đang chờ sẵn sàng vào phó bản.");
    party.leader = target;
    for (const m of party.members.keys()) this.u.toastUser(m, `${party.members.get(target).name} trở thành đội trưởng.`);
    this.push(party, true);
  }
  end(party) {
    this.byId.delete(party.id);
    this.last.delete(party.id);
    for (const uid of party.members.keys()) this.of.delete(uid);
  }

  // ---- connections
  /** uid came online (or back): their place, their party's news; invitations to them are void (they were offline). */
  online(uid) {
    const party = this.partyOf(uid);
    if (!party) return;
    const m = party.members.get(uid);
    if (m) m.away = null;
    this.push(party, true);
  }
  offline(uid) {
    const party = this.partyOf(uid);
    this.invites.delete(uid);
    if (!party) return;
    const m = party.members.get(uid);
    if (m) m.away = Date.now();
    if (party.ready) this.cancelReady(party, `${m?.name ?? "Một người"} mất kết nối`);
    this.push(party);
  }

  // ---- the ready check before a dungeon
  /** Ask everyone in the party (all online) whether they are ready for dungeon `key`; done(party) when all are. */
  askReady(party, key, done) {
    const players = this.u.players;
    for (const m of party.members.values()) if (!players.get(m.uid)) throw no(`${m.name} đang không trực tuyến.`);
    party.ready = { key, ok: new Set([party.leader]), until: Date.now() + PARTY.readySeconds * 1000, done };
    for (const uid of party.members.keys()) if (uid !== party.leader) this.u.sendUser(uid, { t: "pready", key, by: party.members.get(party.leader).name, secs: PARTY.readySeconds });
    this.push(party, true);
    if (party.ready.ok.size === party.members.size) this.readyDone(party);
  }
  answerReady(uid, yes) {
    const party = this.partyOf(uid);
    if (!party?.ready) throw no("Không có lời mời vào phó bản nào.");
    if (!yes) return this.cancelReady(party, `${party.members.get(uid)?.name ?? "Một người"} chưa sẵn sàng`);
    party.ready.ok.add(uid);
    this.push(party, true);
    if (party.ready.ok.size >= party.members.size) this.readyDone(party);
  }
  readyDone(party) {
    const r = party.ready;
    party.ready = null;
    this.push(party, true);
    r.done(party);
  }
  cancelReady(party, why) {
    if (!party.ready) return;
    party.ready = null;
    for (const uid of party.members.keys()) this.u.sendUser(uid, { t: "pready", cancel: 1, why });
    this.push(party, true);
  }

  /** Every second: invitations run out, those away too long are taken out, a ready check runs out, the HUD's numbers. */
  tick() {
    const now = Date.now();
    for (const [uid, mine] of this.invites) {
      for (const [k, inv] of mine) if (inv.until < now) mine.delete(k);
      if (!mine.size) this.invites.delete(uid);
    }
    for (const party of [...this.byId.values()]) {
      for (const m of [...party.members.values()]) if (m.away && now - m.away > PARTY.awaySeconds * 1000 && !this.u.runs?.holds(m.uid)) this.remove(m.uid, "away");
      if (!this.byId.has(party.id)) continue;
      if (party.ready && party.ready.until < now) {
        const late = [...party.members.values()].filter((m) => !party.ready.ok.has(m.uid)).map((m) => m.name);
        this.cancelReady(party, `${late.join(", ")} không trả lời kịp`);
      }
      this.push(party);
    }
  }

  /** The admin's look: every party now. */
  adminList() {
    return [...this.byId.values()].map((p) => this.view(p));
  }
}
