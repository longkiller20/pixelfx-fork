// How each công pháp looks, one by one (what it does: server/cong-phap.js; its facts: shared/cong-phap.js). The server
// sends { e: "art", id (the caster), a (the art), ph (the phase), x, y, f (facing), ... }; each art draws its phases
// with the effects in public/hieu-ung/ and shakes the view when something heavy lands near you.
//   h.fx(id, x, y, { flip, follow, k, life, palette })   start an effect (k: how much bigger; follow: stay on that one)
//   h.shake(amp, seconds, x, y)                          shake the view, if (x, y) is on or near your screen
//   h.later(seconds, fn)                                 do something a moment later

export const ART_FX = {
  // the flying weapon is drawn by the bolt itself (the weapon its owner holds); nothing else to add
  phikiem() {},

  loian(e, h) {
    h.fx("lightning/lightning-strike", e.x, e.y, { k: 1.45 });
    // lightning-strike's three strokes
    for (const [t, a] of [[0.76, 3], [1.04, 2], [1.26, 2]]) h.later(t, () => h.shake(a, 0.16, e.x, e.y));
  },

  dia_chan_cuoc(e, h) {
    const flip = e.f < 0;
    if (e.ph === "stomp") {
      h.fx("impacts/ground-slam", e.x + e.f * 8, e.y, { flip, k: 0.85 });
      h.shake(3, 0.2, e.x, e.y);
    } else if (e.ph === "spike") {
      // each spike a little bigger than the last: the shock gathers as it runs
      h.fx("nature/earth-spike", e.x, e.y, { flip, k: 0.7 + (e.i ?? 0) * 0.09 });
      h.later(0.34, () => h.shake(2 + (e.i ?? 0) * 0.4, 0.14, e.x, e.y));
    }
  },

  tam_tuyet_kiem(e, h) {
    const flip = e.f < 0;
    if (e.ph === "combo") {
      // the three forms on the caster as they step: a cut, a crossing double cut, the cleave into the ground
      h.fx("melee/sword-slash", e.x, e.y, { flip, follow: e.id, k: 1.6 });
      h.later(0.5, () => h.fx("melee/double-slash", e.x, e.y, { flip, follow: e.id, k: 1.6 }));
      h.later(1.04, () => h.fx("melee/heavy-cleave", e.x, e.y, { flip, follow: e.id, k: 1.6 }));
    } else if (e.ph === "crack") h.shake(4, 0.3, e.x, e.y);
  },

  luu_tinh_hoa_vu(e, h) {
    // each meteor comes in from its own side, so the rain doesn't look like copies
    h.fx("fire/meteor", e.x, e.y, { flip: (e.i ?? 0) % 2 === 1, k: 0.8 });
    h.later(0.62, () => h.shake(3, 0.2, e.x, e.y));
  },

  diet_the_than_bao(e, h) {
    const flip = e.f < 0;
    if (e.ph === "charge") {
      // the power gathering at the caster's hands; charge-up bursts at 1.6 s, as the blast goes off
      h.fx("lightning/charge-up", e.x + e.f * 12, e.y - 6, { flip, follow: e.id, k: 1.5 });
      h.shake(1, 1.5, e.x, e.y);
    } else if (e.ph === "boom") {
      h.fx("explosions/nuke", e.x, e.y, { k: 1.15 });
      h.shake(7, 1.1, e.x, e.y);
    } else if (e.ph === "fizzle") h.fx("spawn/poof", e.x, e.y, {});
  },
};
