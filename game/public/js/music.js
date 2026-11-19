// Background music: every map has its own track (`music` in shared/maps/<map>.js, a folder of public/nhac-nen/), played
// on a loop while you are there; going to another map fades one out and the other in. The player only chooses on or off
// and how loud (kept on this device, in localStorage); which track plays is the map's. Browsers only let sound start
// after a tap or a key, so it waits for the first one.
const KEY = "dvtt.music";
let names = {}, want = "", audio = null, fadeTimer = 0, unlocked = false, onChange = () => {};
const prefs = (() => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { on: p.on !== false, vol: Number.isFinite(p.vol) ? p.vol : 50 };
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
const url = (dir) => `/nhac-nen/${dir}/nhac.mp3`;

/** Get ready (the track names), and start once the browser allows it. Call once the game is up. */
export function startMusic() {
  fetch("/nhac-nen/danh-sach.json")
    .then((r) => r.json())
    .then((list) => ((names = Object.fromEntries(list.map((t) => [t.dir, t]))), onChange()))
    .catch(() => {});
  const go = () => {
    removeEventListener("pointerdown", go);
    removeEventListener("keydown", go);
    unlocked = true;
    if (prefs.on) play();
  };
  addEventListener("pointerdown", go);
  addEventListener("keydown", go);
}

/** The map's track: called whenever the player arrives on a map. */
export function setMapMusic(dir) {
  if (dir === want) return;
  want = dir || "";
  if (!audio || audio.paused) return void (audio && (audio.src = want ? url(want) : ""), onChange());
  // playing: the old one fades out, the map's fades in
  fadeTo(0, 0.8, () => {
    audio.src = want ? url(want) : "";
    if (want) play();
    else audio.pause();
  });
}

function play() {
  if (!want || !unlocked) return onChange();
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.loop = true;
  }
  if (!audio.src.endsWith(url(want))) audio.src = url(want);
  audio.volume = 0;
  audio.play().then(() => (fadeTo(level(), 1.2), onChange())).catch(() => onChange());
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

export function setMusicOn(on) {
  prefs.on = !!on;
  save();
  if (on) play();
  else if (audio) fadeTo(0, 0.5, () => (audio.pause(), onChange()));
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
/** What the settings panel shows: on/off, volume, whether it is playing, and the map's track. */
export const musicState = () => ({ on: prefs.on, vol: prefs.vol, playing: !!audio && !audio.paused, track: names[want] ?? (want ? { dir: want, ten: want, tac_gia: "" } : null) });
/** Called whenever the state changes (the settings panel redraws). */
export const onMusicChange = (fn) => (onChange = fn ?? (() => {}));
