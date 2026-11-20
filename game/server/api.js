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
    res.json({ character: await store.createCharacter(req.userId, req.body?.name, req.body?.look) });
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
