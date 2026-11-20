// The menu along the top: each button's icon drawn with pixelfx (ui/menu-icon, from the pixelfx library), and the
// buttons used less often folded under ▦ Thêm (a list that drops down; picking one, or anywhere else, folds it back).
import { createFrame, clearFrame, createFx } from "/hieu-ung/core/index.js";
import { effects } from "/hieu-ung/fx/index.js";

/** A canvas with one menu icon (24 x 24, drawn once, shown pixel for pixel). */
export function menuIcon(name) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 24;
  cv.className = "mic";
  const mod = effects["ui/menu-icon"];
  if (!mod) return cv;
  const fr = createFrame(24, 24);
  clearFrame(fr);
  createFx(mod, { icon: name, x: 12, y: 12 }).draw(fr);
  const img = new ImageData(24, 24);
  new Uint32Array(img.data.buffer).set(fr.color);
  cv.getContext("2d").putImageData(img, 0, 0);
  return cv;
}

export function initMenu() {
  // the icons, put first in each button (a badge or a label stays after it)
  for (const b of document.querySelectorAll(".menu button[data-icon]")) b.prepend(menuIcon(b.dataset.icon));
  const more = document.getElementById("moreBtn"), list = document.getElementById("moreMenu");
  const open = (on) => {
    list.hidden = !on;
    more.classList.toggle("on", on);
    more.setAttribute("aria-expanded", String(on));
  };
  more.addEventListener("click", (e) => (e.stopPropagation(), open(list.hidden)));
  list.addEventListener("click", () => open(false));
  addEventListener("pointerdown", (e) => !list.hidden && !e.target.closest?.("#moreMenu, #moreBtn") && open(false));
  addEventListener("keydown", (e) => e.key === "Escape" && open(false));
  return { open };
}
