// Background music: the tracks in public/nhac-nen/ (danh-sach.json lists them, one folder each), played one after the
// other with a short fade between, round and round. On or off and the volume are the player's own, kept on this device
// (localStorage). Browsers only let sound start after a tap or a key, so it waits for the first one.
const KEY = "dvtt.music";
let list = [], at = 0, audio = null, fadeTimer = 0, started = false, onChange = () => {};
const prefs = (() => {
  try {
    return { on: true, vol: 50, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { on: true, vol: 50 };
  }
})();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
};
// a gentler curve than linear: half way on the slider sounds about half as loud
const level = () => Math.pow(prefs.vol / 100, 2) * 0.9;

/** Start (when on) once the browser allows it. Call once the game is up. */
export async function startMusic() {
  if (started) return;
  started = true;
  try {
    list = await fetch("/nhac-nen/danh-sach.json").then((r) => r.json());
  } catch {
    list = [];
  }
  if (!list.length) return;
  at = Math.floor(Math.random() * list.length);
  const go = () => {
    removeEventListener("pointerdown", go);
    removeEventListener("keydown", go);
    if (prefs.on) play();
  };
  addEventListener("pointerdown", go);
  addEventListener("keydown", go);
}

function play() {
  if (!list.length) return;
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    // a track ends: the next one
    audio.addEventListener("ended", () => next());
  }
  if (!audio.src) audio.src = `/nhac-nen/${list[at].dir}/nhac.mp3`;
  audio.volume = 0;
  audio.play().then(() => fadeTo(level(), 1.2)).catch(() => {});
  onChange();
}

function fadeTo(v, sec, then) {
  clearInterval(fadeTimer);
  if (!audio) return then?.();
  const from = audio.volume, steps = Math.max(1, Math.round(sec * 30));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, from + ((v - from) * i) / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      then?.();
    }
  }, 1000 / 30);
}

/** The next track (a short fade out, then the next one fades in). */
export function next() {
  if (!list.length) return;
  at = (at + 1) % list.length;
  const load = () => {
    if (!audio) return;
    audio.src = `/nhac-nen/${list[at].dir}/nhac.mp3`;
    if (prefs.on) play();
    else onChange();
  };
  audio && !audio.paused ? fadeTo(0, 0.6, load) : load();
}

export function setMusicOn(on) {
  prefs.on = !!on;
  save();
  if (on) play();
  else if (audio) fadeTo(0, 0.5, () => audio.pause());
  onChange();
}
export function setMusicVolume(v) {
  prefs.vol = Math.max(0, Math.min(100, Math.round(v)));
  save();
  if (audio && !audio.paused) {
    clearInterval(fadeTimer);
    audio.volume = level();
  }
  onChange();
}
/** What the settings panel shows. */
export const musicState = () => ({ on: prefs.on, vol: prefs.vol, playing: !!audio && !audio.paused, track: list[at] ?? null, count: list.length });
/** Called whenever the state changes (the settings panel redraws). */
export const onMusicChange = (fn) => (onChange = fn ?? (() => {}));
