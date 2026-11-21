// Khu of the road's maps (shared/khu.js): the Khu button on the HUD (which Khu, how many in it, a dot green/yellow/red)
// and the box of all 30 Khu, as the fishing lake's (public/js/cau-ca.js). Picking a Khu with room asks the server
// ({ t: "zone", n }); it moves them there, at the same spot, through the same light as a gate.
import { ZONE_COUNT, ZONE_CAP, zoneLevel, ZONE_COLORS } from "/shared/khu.js";
import { h } from "./tong-mon.js";

let open = null;
/** Close the box if it is open. */
export const closeZoneBox = () => open?.();

/**
 * The box: cur (this Khu), occ (how many in each), map (its name), pick(n) when a Khu is chosen, note (a word on top, e.g.
 * the Khu asked for was full).
 */
export function zoneBox({ cur, occ, map, pick, note = null }) {
  open?.();
  const total = occ.reduce((a, b) => a + b, 0);
  const cells = Array.from({ length: ZONE_COUNT }, (_, i) => {
    const n = i + 1, c = occ[i] ?? 0, full = c >= ZONE_CAP, lv = zoneLevel(c);
    return h(`button.ckcell${n === cur ? ".on" : ""}${full ? ".full" : ""}`, {
      type: "button", disabled: n === cur || full, "data-n": String(n), title: full ? `Khu ${n} đã đủ ${ZONE_CAP} người` : n === cur ? "Đang ở khu này" : `Sang Khu ${n}`,
      onclick: () => (end(), pick(n)) },
      h("b", { text: String(n) }), h("i.ckdot", { style: `background:${ZONE_COLORS[lv]};box-shadow:0 0 6px ${ZONE_COLORS[lv]}` }), h("small", { text: `${c}/${ZONE_CAP}` }));
  });
  const host = document.getElementById("panel")?.parentElement ?? document.body;
  const end = () => (removeEventListener("keydown", key, true), shade.remove(), (open = null));
  const key = (e) => e.key === "Escape" && (e.stopPropagation(), end());
  const shade = h("div.cshade.zshade", { onclick: (e) => e.target === shade && end() },
    h("div.cbox.ccbox.ckbox", { role: "dialog", "aria-modal": "true" },
      h("h4", { text: `${map} · đang ở Khu ${cur}` }),
      note ? h("p.cknote", { text: note }) : null,
      h("p.cklegend", {}, ...[["Thoáng", 0], ["Đông", 1], ["Sắp đầy / đầy", 2]].map(([t, lv]) => h("span", {}, h("i.ckdot", { style: `background:${ZONE_COLORS[lv]}` }), t)),
        h("span.dim", { text: `· ${total} người ở map · tối đa ${ZONE_CAP}/khu` })),
      h("div.ckgrid", {}, ...cells),
      h("div.cbtns", {}, h("button.ghost", { type: "button", text: "Đóng", onclick: () => end() }))));
  addEventListener("keydown", key, true);
  host.append(shade);
  open = end;
}

/** The Khu button's words and dot: "Khu 3 · 12/20". */
export function zoneLabel(btn, n, occ) {
  const c = occ[n - 1] ?? 0;
  btn.querySelector(".lbl").textContent = `Khu ${n} · ${c}/${ZONE_CAP}`;
  btn.querySelector(".dot").style.background = ZONE_COLORS[zoneLevel(c)];
  btn.title = `Đang ở Khu ${n} (${c}/${ZONE_CAP} người). Bấm để chọn khu khác: ${ZONE_COUNT} khu, mỗi khu tối đa ${ZONE_CAP} người.`;
}
