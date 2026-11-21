// The REST API: accounts, the character, the shop, the daily gift, the leaderboard.
import express from "express";
import { q, tx, isDup } from "./db.js";
import { hashPassword, verifyPassword, dummyVerify, createSession, dropSession, requireAuth, rateLimit } from "./auth.js";
import * as store from "./store.js";
import { configJson } from "./gameconfig.js";
import { GameError } from "./store.js";
import * as sect from "./tong-mon.js";
import * as dao from "./dao-huu.js";
import * as gv from "./gia-vien.js";
import * as cc from "./cau-ca.js";
import * as dl from "./dao-lu.js";
import * as ct from "./chinh-ta.js";
import { RINGS } from "../shared/dao-lu.js";
import { khuOf, KHU_CAP } from "../shared/cau-ca.js";
import { RANKS } from "../shared/tong-mon.js";
import { USER_RE } from "../shared/balance.js";

const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function api(world) {
  const r = express.Router();
  r.use(express.json({ limit: "4kb" }));

  // logging in and signing up are slow on purpose (scrypt) and limited per address
  const authLimit = rateLimit({ windowMs: 60_000, max: 12, message: "Đăng nhập sai quá nhiều, hãy đợi 1 phút." });
  const writeLimit = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `u${req.userId}` });

  const creds = (body) => {
    const username = String(body?.username ?? ""), password = String(body?.password ?? "");
    if (!USER_RE.test(username)) throw new GameError("Tên đăng nhập 3-16 ký tự: chữ không dấu, số hoặc _.");
    if (password.length < 6 || password.length > 72) throw new GameError("Mật khẩu dài 6-72 ký tự.");
    return { username, password };
  };

  r.post("/register", authLimit, wrap(async (req, res) => {
    const { username, password } = creds(req.body);
    const hash = await hashPassword(password);
    let id;
    try {
      id = (await q("INSERT INTO users (username, pass_hash) VALUES (?, ?)", [username, hash])).insertId;
    } catch (e) {
      if (isDup(e)) throw new GameError("Tên đăng nhập đã có người dùng.", 409);
      throw e;
    }
    res.json({ token: await createSession(id) });
  }));

  r.post("/login", authLimit, wrap(async (req, res) => {
    const { username, password } = creds(req.body);
    const rows = await q("SELECT id, pass_hash, banned, ban_reason FROM users WHERE username = ?", [username]);
    const ok = rows.length ? await verifyPassword(password, rows[0].pass_hash) : await dummyVerify(password);
    if (!rows.length || !ok) throw new GameError("Sai tên đăng nhập hoặc mật khẩu.", 401);
    if (rows[0].banned) throw new GameError(`Tài khoản đã bị khóa${rows[0].ban_reason ? `: ${rows[0].ban_reason}` : "."}`, 403);
    res.json({ token: await createSession(rows[0].id) });
  }));

  r.post("/logout", requireAuth, wrap(async (req, res) => {
    await dropSession(req.token);
    world.kickUser(req.userId, "Đã đăng xuất.");
    res.json({ ok: true });
  }));

  r.get("/me", requireAuth, wrap(async (req, res) => {
    const [u] = await q("SELECT username FROM users WHERE id = ?", [req.userId]);
    const character = await store.loadCharacter(req.userId);
    res.json({
      username: u?.username, character, inventory: character ? await store.inventory(req.userId) : {},
      dailyClaimed: character ? await store.dailyClaimed(req.userId) : false,
    });
  }));

  r.post("/character", requireAuth, writeLimit, wrap(async (req, res) => {
    res.json({ character: await store.createCharacter(req.userId, req.body?.name, req.body?.look, req.body?.faction) });
  }));

  r.post("/shop/buy", requireAuth, writeLimit, wrap(async (req, res) => {
    const { item, qty, requestId } = req.body ?? {};
    const out = await store.buy(req.userId, item, qty, requestId);
    world.refresh(req.userId, out.character);
    res.json({ ...out, inventory: await store.inventory(req.userId) });
  }));

  // the wardrobe: list, buy, wear. Buying and wearing change how others see you, so the world is told at once.
  r.get("/cosmetics", requireAuth, rateLimit({ windowMs: 10_000, max: 20, key: (req) => `c${req.userId}` }), wrap(async (req, res) => {
    res.json(await store.wardrobe(req.userId));
  }));

  r.post("/cosmetics/buy", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.buyCosmetic(req.userId, req.body?.id, req.body?.wear === true);
    world.refresh(req.userId, character);
    res.json({ character, ...(await store.wardrobe(req.userId)) });
  }));

  r.post("/cosmetics/wear", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.wearCosmetic(req.userId, req.body?.id);
    world.refresh(req.userId, character);
    res.json({ character });
  }));

  // take off what is worn in one layer (the base layers go back to the figure's own)
  r.post("/cosmetics/unwear", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.unwearCosmetic(req.userId, String(req.body?.kind ?? ""));
    world.refresh(req.userId, character);
    res.json({ character });
  }));

  // công pháp: learn one (spends its items; arts are never sold), or set the five on the bar. The world takes the new bar at once.
  r.post("/arts/learn", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.learnArt(req.userId, req.body?.key);
    world.refresh(req.userId, character);
    world.sendInv(req.userId);
    res.json({ character, inventory: await store.inventory(req.userId) });
  }));

  r.post("/arts/equip", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.equipArts(req.userId, req.body?.slots);
    world.refresh(req.userId, character);
    res.json({ character });
  }));

  r.post("/daily", requireAuth, writeLimit, wrap(async (req, res) => {
    const character = await store.claimDaily(req.userId);
    world.refresh(req.userId, character);
    res.json({ character });
  }));

  // ---------------------------------------------------------------- Gia Viên (server/gia-vien.js decides money and things)
  const homeRead = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `hr${req.userId}` });
  const homeWrite = rateLimit({ windowMs: 10_000, max: 20, key: (req) => `hw${req.userId}`, message: "Thao tác quá nhanh, hãy chậm lại." });
  const homeView = async (uid) => ({ unlocked: await gv.unlocked(uid), ...(await gv.state(uid)), inside: world.players.get(uid)?.world?.key === `gv:${uid}` });
  const homeRoute = (path, fn) => r.post(`/home${path}`, requireAuth, writeLimit, homeWrite, wrap(async (req, res) => {
    // what the world earned but hasn't written yet is saved first, so the stones on screen are the stones spent
    await world.flushUser(req.userId);
    const out = (await fn(req)) ?? {};
    world.refresh(req.userId, await store.loadCharacter(req.userId));
    world.homeState(req.userId);
    res.json({ ok: true, ...out, view: await homeView(req.userId) });
  }));
  r.get("/home", requireAuth, homeRead, wrap(async (req, res) => res.json(await homeView(req.userId))));
  homeRoute("/unlock", async (req) => void (await gv.unlock(req.userId)));
  homeRoute("/enter", async (req) => {
    if (!(await gv.unlocked(req.userId))) throw new GameError("Đạo hữu chưa mở khoá Gia Viên.", 403);
    if (!world.players.has(req.userId)) throw new GameError("Hãy vào game trước.", 409);
    world.enterHome(req.userId).catch((e) => console.error("home", e.message));
  });
  homeRoute("/leave", async (req) => void world.leaveHome(req.userId).catch((e) => console.error("home", e.message)));
  homeRoute("/house/buy", async (req) => {
    const out = await gv.buyHouse(req.userId, req.body?.house, req.body?.requestId);
    await world.homeHouse(req.userId);
    return out;
  });
  homeRoute("/house/use", async (req) => {
    await gv.useHouse(req.userId, req.body?.house);
    await world.homeHouse(req.userId);
  });
  homeRoute("/animal/buy", async (req) => gv.buyAnimal(req.userId, req.body?.kind, req.body?.requestId));
  homeRoute("/animal/feed", async (req) => gv.feed(req.userId, req.body?.ids));
  homeRoute("/animal/collect", async (req) => {
    const out = await gv.collect(req.userId, req.body?.ids);
    await world.sendInv(req.userId);
    return out;
  });
  homeRoute("/animal/release", async (req) => void (await gv.release(req.userId, req.body?.id)));
  homeRoute("/plant", async (req) => void (await gv.plant(req.userId, req.body?.plot, req.body?.crop)));
  homeRoute("/harvest", async (req) => {
    const out = await gv.harvest(req.userId, req.body?.plot);
    await world.sendInv(req.userId);
    return out;
  });
  homeRoute("/clear", async (req) => void (await gv.clearPlot(req.userId, req.body?.plot)));

  // ---------------------------------------------------------------- Câu Cá (server/cau-ca.js decides money and things; the cast
  // itself is the world's). Buying and selling happen at the Ngư Cụ stall on the lake, so the player must stand there.
  const fishRead = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `cr${req.userId}` });
  const fishWrite = rateLimit({ windowMs: 10_000, max: 25, key: (req) => `cw${req.userId}`, message: "Thao tác quá nhanh, hãy chậm lại." });
  // here: at the lake; khu: which Khu (1..30), occ: how many are in each, cap: at most how many in one
  const fishView = async (uid) => {
    const khu = khuOf(world.players.get(uid)?.world?.key);
    return { ...(await cc.view(uid)), here: !!khu, khu, occ: world.khuCounts(), cap: KHU_CAP, atShop: world.atFishShop(uid) };
  };
  const fishRoute = (path, fn, { shop = false } = {}) => r.post(`/fishing${path}`, requireAuth, writeLimit, fishWrite, wrap(async (req, res) => {
    if (shop && !world.atFishShop(req.userId)) throw new GameError("Hãy tới quầy Ngư Cụ ở Vọng Nguyệt Hồ để mua bán.", 403);
    await world.flushUser(req.userId);
    const out = (await fn(req)) ?? {};
    const character = await store.loadCharacter(req.userId);
    world.refresh(req.userId, character);
    await world.sendInv(req.userId);
    res.json({ ok: true, ...out, stones: character?.stones ?? 0, view: await fishView(req.userId) });
  }));
  let recCache = { at: 0, v: null };
  r.get("/fishing", requireAuth, fishRead, wrap(async (req, res) => {
    if (Date.now() - recCache.at > 10_000) recCache = { at: Date.now(), v: await cc.records() };
    res.json({ ...(await fishView(req.userId)), records: recCache.v });
  }));
  // to the lake: into the first Khu with room, or (body.khu) the Khu asked for; from one Khu to another the same way
  fishRoute("/enter", async (req) => {
    if (!world.players.has(req.userId)) throw new GameError("Hãy vào game trước.", 409);
    const want = req.body?.khu === undefined || req.body?.khu === null ? null : Number(req.body.khu);
    try {
      return { khu: await world.enterFishing(req.userId, want) };
    } catch (e) {
      if (e.status) throw new GameError(e.message, e.status);
      throw e;
    }
  });
  fishRoute("/choose", async (req) => void (await cc.choose(req.userId, req.body?.rod, req.body?.bait)));
  fishRoute("/buy", async (req) => cc.buy(req.userId, req.body?.item, req.body?.qty, req.body?.requestId), { shop: true });
  fishRoute("/sell", async (req) => cc.sell(req.userId, req.body?.item, req.body?.qty, req.body?.requestId), { shop: true });

  // ---------------------------------------------------------------- Đạo Hữu and Truyền Âm (server/dao-huu.js decides)
  // where a friend is, from the world: online, which map, their sect (nothing for someone offline)
  const whereIs = (uid) => {
    const p = world.players.get(uid);
    return p ? { online: true, map: p.world.map.name, sect: p.sect?.name ?? null, level: p.level } : null;
  };
  const socRead = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `fr${req.userId}` });
  const socWrite = rateLimit({ windowMs: 10_000, max: 12, key: (req) => `fw${req.userId}`, message: "Thao tác quá nhanh, hãy chậm lại." });
  const target = (b) => (b?.uid !== undefined ? { uid: b.uid } : { name: b?.name });
  const socRoute = (path, fn) => r.post(`/friends${path}`, requireAuth, writeLimit, socWrite, wrap(async (req, res) => {
    const out = (await fn(req)) ?? {};
    res.json({ ok: true, ...out, view: await dao.list(req.userId, whereIs) });
  }));
  r.get("/friends", requireAuth, socRead, wrap(async (req, res) => res.json(await dao.list(req.userId, whereIs))));
  r.get("/friends/search", requireAuth, socRead, wrap(async (req, res) => res.json(await dao.search(req.userId, req.query.q))));
  r.get("/friends/:uid/messages", requireAuth, socRead, wrap(async (req, res) => {
    const out = await dao.history(req.userId, req.params.uid, req.query.before);
    world.sendUnread(req.userId);
    res.json(out);
  }));
  socRoute("/read", async (req) => {
    await dao.markRead(req.userId, req.body?.uid);
    world.sendUnread(req.userId);
  });
  socRoute("/request", async (req) => {
    const me = await world.nameOf(req.userId);
    const out = await dao.request(req.userId, target(req.body));
    await world.syncSocial([req.userId, out.uid], { [out.uid]: out.friends ? `${me} và đạo hữu đã kết làm Đạo Hữu.` : `${me} muốn kết làm Đạo Hữu.` });
    return { friends: out.friends, name: out.name };
  });
  socRoute("/answer", async (req) => {
    const me = await world.nameOf(req.userId);
    const out = await dao.answer(req.userId, req.body?.uid, req.body?.accept === true);
    await world.syncSocial([req.userId, out.uid], out.friends ? { [out.uid]: `${me} đã nhận lời kết giao.` } : null);
    return { friends: out.friends, name: out.name };
  });
  socRoute("/cancel", async (req) => {
    await dao.cancel(req.userId, req.body?.uid);
    await world.syncSocial([req.userId, Number(req.body?.uid)]);
  });
  socRoute("/remove", async (req) => {
    const out = await dao.remove(req.userId, req.body?.uid);
    await world.syncSocial([req.userId, out.uid]);
  });
  socRoute("/block", async (req) => {
    const out = await dao.block(req.userId, target(req.body));
    // the blocked one is not told; their list just loses this friend
    await world.syncSocial([req.userId, out.uid]);
    return { name: out.name };
  });
  socRoute("/unblock", async (req) => {
    await dao.unblock(req.userId, req.body?.uid);
    await world.syncSocial([req.userId]);
  });

  // ---------------------------------------------------------------- Đạo Lữ (server/dao-lu.js decides everything)
  // What a change touches is told to the world at once: both people's stones and bags, their dao lu (the ring's buff, the
  // name by theirs), a toast and an effect over them (hearts for roses, the wedding), and a line in the feed for a wedding.
  const dlRead = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `dr${req.userId}` });
  const dlWrite = rateLimit({ windowMs: 10_000, max: 15, key: (req) => `dw${req.userId}`, message: "Thao tác quá nhanh, hãy chậm lại." });
  // stones held by the world but not yet written go to the database first (for whoever may pay), then everyone touched
  // is read again: their stones, their bag
  const touch = async (uids) => {
    for (const uid of new Set(uids)) {
      if (!uid) continue;
      const ch = await store.loadCharacter(uid);
      if (ch) world.refresh(uid, ch);
      await world.sendInv(uid);
    }
  };
  const dlRoute = (path, fn) => r.post(`/daolu${path}`, requireAuth, writeLimit, dlWrite, wrap(async (req, res) => {
    const out = (await fn(req)) ?? {};
    res.json({ ok: true, ...out, view: await dl.view(req.userId) });
  }));
  r.get("/daolu", requireAuth, dlRead, wrap(async (req, res) => res.json(await dl.view(req.userId))));
  dlRoute("/buy", async (req) => {
    await world.flushUser(req.userId);
    const out = await dl.buyRoses(req.userId, req.body?.qty, req.body?.requestId);
    await touch([req.userId]);
    return { qty: out.qty ?? 0, repeat: !!out.repeat };
  });
  dlRoute("/gift", async (req) => {
    const out = await dl.gift(req.userId, req.body?.uid, req.body?.qty, req.body?.requestId);
    if (out.repeat) return { repeat: true };
    await touch([req.userId]);
    const msg = out.spouse ? `${out.from} tặng Đạo Lữ ${out.used} bông Hoa Hồng.`
      : `${out.from} tặng đạo hữu ${out.used} bông Hoa Hồng. Hảo cảm ${out.points}/100${out.points >= 100 ? ": đã đủ để kết Đạo Lữ!" : "."}`;
    await world.syncDaolu([req.userId, out.uid], { [out.uid]: msg }, { [req.userId]: "hearts", [out.uid]: "hearts" });
    return { used: out.used, points: out.points, name: out.name, today: out.today };
  });
  dlRoute("/propose", async (req) => {
    await world.flushUser(req.userId);
    const out = await dl.propose(req.userId, req.body?.uid, req.body?.ring);
    await world.syncDaolu([req.userId, out.uid], { [out.uid]: `💍 ${out.from} cầu hôn đạo hữu với ${out.ringName}! Mở Đạo Lữ để trả lời.` });
    return { name: out.name };
  });
  dlRoute("/cancel", async (req) => {
    const out = await dl.cancel(req.userId);
    await world.syncDaolu([req.userId, out.uid]);
    return { name: out.name };
  });
  dlRoute("/answer", async (req) => {
    const from = Number(req.body?.uid);
    // the one who proposed pays: whatever the world holds for them is written first
    if (Number.isInteger(from)) await world.flushUser(from);
    await world.flushUser(req.userId);
    const out = await dl.answer(req.userId, from, req.body?.accept === true, req.body?.requestId);
    if (out.repeat) return { repeat: true };
    if (!out.accepted) {
      await world.syncDaolu([req.userId, out.uid], { [out.uid]: `${out.me} đã từ chối lời cầu hôn.` });
      return { accepted: false };
    }
    // married (committed): the whole server hears of it first, whatever happens after: the feed, and a banner with
    // hearts falling and fireworks on every map. Each wedding is announced once, numbered in the order they were made.
    const note = `💍 ${out.me} và ${out.name} đã kết thành Đạo Lữ với ${out.ringName}!`;
    world.feed(note);
    world.celebrate(out.me, out.name, out.ringName, RINGS[out.ring]?.look ?? null);
    // then the two of them: their stones and bags, the ring's buff, the name by theirs, the wedding over them
    try {
      await touch([out.uid, req.userId]);
      await world.syncDaolu([req.userId, out.uid], { [out.uid]: `💍 ${out.me} đã nhận lời! Hai người đã kết thành Đạo Lữ.`, [req.userId]: note }, { [req.userId]: "wedding", [out.uid]: "wedding" });
    } catch (e) {
      console.error("daolu sync", e.message);
    }
    return { accepted: true, name: out.name, ring: out.ring };
  });
  dlRoute("/divorce", async (req) => {
    const out = await dl.divorce(req.userId);
    await world.syncDaolu([req.userId, out.uid], { [out.uid]: `${out.me} đã ly hôn. ${out.ringName} không còn, buff của nhẫn cũng mất.` });
    return { name: out.name };
  });

  // ---------------------------------------------------------------- Chính Tà Phân Tranh (server/chinh-ta.js decides everything)
  // the panel (side, points, the next battle, signing up), changing side, the Tiệm Chính Tà, leaving the field
  const ctRead = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `cr${req.userId}` });
  const ctWrite = rateLimit({ windowMs: 10_000, max: 12, key: (req) => `cw${req.userId}`, message: "Thao tác quá nhanh, hãy chậm lại." });
  const ctRoute = (path, fn) => r.post(`/chinhta${path}`, requireAuth, writeLimit, ctWrite, wrap(async (req, res) => {
    const out = (await fn(req)) ?? {};
    res.json({ ok: true, ...out, view: await ct.view(req.userId, world.war) });
  }));
  r.get("/chinhta", requireAuth, ctRead, wrap(async (req, res) => res.json(await ct.view(req.userId, world.war))));
  // the board of the battle on now (anyone may look: who leads, who fights)
  r.get("/chinhta/board", requireAuth, ctRead, wrap(async (req, res) => res.json({ now: world.war.summary(req.userId), board: world.war.m ? world.war.board() : [] })));
  ctRoute("/register", async (req) => {
    if (world.war.fighting(req.userId)) throw new GameError("Đạo hữu đang ở trong trận.");
    const out = await ct.register(req.userId);
    return { again: out.again };
  });
  ctRoute("/unregister", async (req) => void (await ct.unregister(req.userId)));
  ctRoute("/faction", async (req) => {
    await world.flushUser(req.userId);
    const out = await ct.setFaction(req.userId, req.body?.faction, req.body?.requestId, world.war.fighting(req.userId));
    if (out.repeat) return { repeat: true };
    // the stones, and the side shown by their name, at once
    const ch = await store.loadCharacter(req.userId);
    if (ch) world.refresh(req.userId, ch);
    return { faction: out.faction, first: out.first };
  });
  ctRoute("/buy", async (req) => {
    const out = await ct.buy(req.userId, req.body?.item, req.body?.qty, req.body?.requestId);
    if (!out.repeat) await world.sendInv(req.userId);
    return { repeat: !!out.repeat, item: out.item, qty: out.qty, inventory: await store.inventory(req.userId) };
  });
  ctRoute("/leave", async (req) => void (await world.war.forfeit(req.userId)));

  // ---------------------------------------------------------------- Tông Môn (server/tong-mon.js decides everything)
  // reading is limited per account, every change is a write (writeLimit) plus a tighter limit of its own; whatever changes,
  // the world is told at once for everyone it touches (their sect, its bonus and name over their heads, their panel)
  const sectRead = rateLimit({ windowMs: 10_000, max: 25, key: (req) => `sr${req.userId}` });
  const sectWrite = rateLimit({ windowMs: 10_000, max: 12, key: (req) => `sw${req.userId}`, message: "Thao tác tông môn quá nhanh, hãy chậm lại." });
  const online = (uid) => world.players.has(uid);
  const sectRoute = (path, fn) => r.post(`/sect${path}`, requireAuth, writeLimit, sectWrite, wrap(async (req, res) => {
    const out = (await fn(req)) ?? {};
    res.json({ ok: true, ...out, view: await sect.mySect(req.userId, online) });
  }));

  r.get("/sect", requireAuth, sectRead, wrap(async (req, res) => res.json(await sect.mySect(req.userId, online))));
  r.get("/sects", requireAuth, sectRead, wrap(async (req, res) => res.json(await sect.listSects(req.query.q, req.query.page))));

  sectRoute("/create", async (req) => {
    // what the world earned but hasn't written yet is saved first, so the stones on screen are the stones spent
    await world.flushUser(req.userId);
    const out = await sect.create(req.userId, req.body?.name, req.body?.emblem);
    world.refresh(req.userId, out.character);
    await world.syncSect([req.userId]);
    world.feed(`Tông môn ${(await sect.sectOf(req.userId))?.name ?? ""} vừa được khai lập!`);
    return { id: out.id };
  });
  sectRoute("/join", async (req) => {
    const out = await sect.join(req.userId, req.body?.id, req.body?.message);
    if (out.joined) {
      await world.syncSect([req.userId]);
      world.sectToast(await sect.membersOf(out.sectId), `${await world.nameOf(req.userId)} gia nhập ${out.name}.`, req.userId);
    } else world.sectPing(await sect.membersOf(out.sectId));
    return { joined: out.joined, name: out.name };
  });
  sectRoute("/cancel", async (req) => void (await sect.cancelApplication(req.userId, req.body?.id)));
  sectRoute("/review", async (req) => {
    const out = await sect.review(req.userId, req.body?.uid, req.body?.accept === true);
    if (out.accepted) {
      await world.syncSect([out.uid]);
      world.toastUser(out.uid, `Đạo hữu đã được thu nhận vào ${out.name}!`, true);
      world.sectPing(await sect.membersOf(out.sectId), out.uid);
    }
  });
  sectRoute("/leave", async (req) => {
    const out = await sect.leave(req.userId);
    await world.syncSect([req.userId]);
    world.sectPing(await sect.membersOf(out.sectId));
  });
  sectRoute("/kick", async (req) => {
    const out = await sect.kick(req.userId, req.body?.uid);
    await world.syncSect([out.uid]);
    world.toastUser(out.uid, `Đạo hữu đã bị trục xuất khỏi ${out.name}.`, true);
    world.sectPing(await sect.membersOf(out.sectId));
  });
  sectRoute("/rank", async (req) => {
    const out = await sect.setRank(req.userId, req.body?.uid, req.body?.rank);
    if (!out.same) {
      await world.syncSect([out.uid]);
      world.toastUser(out.uid, `Đạo hữu được phong làm ${RANKS[Number(req.body?.rank)]?.name}.`);
      world.sectPing(await sect.membersOf(out.sectId), out.uid);
    }
  });
  sectRoute("/transfer", async (req) => {
    const out = await sect.transfer(req.userId, req.body?.uid, req.body?.confirm);
    await world.syncSect(out.uids);
    world.sectToast(await sect.membersOf(out.sectId), `${await world.nameOf(out.uids[1])} trở thành Tông Chủ mới.`);
  });
  sectRoute("/disband", async (req) => {
    const out = await sect.disband(req.userId, req.body?.confirm);
    await world.syncSect(out.uids);
    world.sectToast(out.uids, `Tông môn ${out.name} đã giải tán.`, req.userId);
  });
  sectRoute("/settings", async (req) => {
    const out = await sect.settings(req.userId, req.body);
    const uids = await sect.membersOf(out.sectId);
    if (out.emblemChanged) await world.syncSect(uids);
    world.sectPing(uids, req.userId);
  });
  sectRoute("/donate", async (req) => {
    await world.flushUser(req.userId);
    const out = await sect.donate(req.userId, req.body?.amount, req.body?.requestId);
    world.refresh(req.userId, out.character);
    const uids = await sect.membersOf(out.sectId);
    if (out.levelUp) {
      await world.syncSect(uids);
      world.sectToast(uids, `Tông môn lên cấp ${out.levelUp}!`);
    } else world.sectPing(uids, req.userId);
    return { repeat: out.repeat, contrib: out.contrib ?? 0, levelUp: out.levelUp ?? 0 };
  });
  sectRoute("/checkin", async (req) => {
    const out = await sect.checkin(req.userId);
    const uids = await sect.membersOf(out.sectId);
    if (out.levelUp) {
      await world.syncSect(uids);
      world.sectToast(uids, `Tông môn lên cấp ${out.levelUp}!`);
    } else world.sectPing(uids, req.userId);
    return { contrib: out.contrib, levelUp: out.levelUp };
  });
  sectRoute("/shop", async (req) => {
    const out = await sect.shopBuy(req.userId, req.body?.item, req.body?.requestId);
    if (!out.repeat) await world.sendInv(req.userId);
    return { repeat: out.repeat, inventory: await store.inventory(req.userId) };
  });
  sectRoute("/array", async (req) => {
    const out = await sect.raiseArray(req.userId);
    await world.syncSect(out.uids);
    world.sectToast(out.uids, "Hộ Sơn Đại Trận đã khai mở: toàn tông tăng công!");
  });

  // the game's numbers (realms, pills, monsters, arts, settings) for the browser; they change when an admin edits them
  r.get("/config", wrap(async (req, res) => {
    res.set("cache-control", "no-cache").type("application/json").send(configJson());
  }));

  r.get("/leaderboard", rateLimit({ windowMs: 10_000, max: 20 }), wrap(async (req, res) => {
    res.json(await store.leaderboard());
  }));

  r.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") return res.status(400).json({ error: "Yêu cầu không hợp lệ." });
    console.error(err);
    res.status(500).json({ error: "Lỗi máy chủ, hãy thử lại." });
  });
  return r;
}

export { tx };
