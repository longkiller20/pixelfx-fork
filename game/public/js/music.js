// Background music: every map has its own track (`music` in shared/maps/<map>.js, a folder of public/nhac-nen/), played
// on a loop while you are there; going to another map fades one out and the other in. The player only chooses on or off
// and how loud (kept on this device, in localStorage); which track plays is the map's. Browsers only let sound start
// after a tap or a key, so it starts on the first one (and on any later one, if it should be playing and is not).
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

// A blink of silence: played on the first touch when no track is chosen yet, so that the browser counts this player
// as started by the player (on iPhone a sound element must first play inside a touch; after that it may play any time).
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let starting = false, loaded = ""; // loaded: the track the element holds ("" none, or SILENCE)
const ensure = () => {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.loop = true;
    // the browser or the phone may stop it (a call, the app put away, a lost stream): the next touch starts it again
    audio.addEventListener("pause", () => onChange());
    audio.addEventListener("error", () => ((starting = false), onChange()));
  }
  return audio;
};
/** Should it be playing but is not? */
const stalled = () => prefs.on && want && (!audio || audio.paused || loaded !== want);

// Every touch, click or key from the moment the page opens (the loading screen, the login too), not only the first,
// starts the music if it should be playing and is not: a first touch before any map, a play the browser refused, or
// one the phone stopped, all mend on the next.
const go = () => {
  if (!unlocked) {
    unlocked = true;
    // nothing to play yet: play a moment of silence now, inside the touch, so the map's track may start later
    if (!want) {
      const a = ensure();
      a.src = SILENCE;
      loaded = SILENCE;
      a.play().then(() => loaded === SILENCE && a.pause()).catch(() => {});
    }
  }
  if (stalled()) play();
};
for (const ev of ["pointerdown", "touchend", "click", "keydown"]) addEventListener(ev, go, { capture: true, passive: true });
// back from another app or tab: carry on if it should be playing
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && unlocked && stalled() && play());

/**
 * Get ready (the track names). Call once the game is up; the touches are listened for from the start (above).
 */
export function startMusic() {
  fetch("/nhac-nen/danh-sach.json")
    .then((r) => r.json())
    .then((list) => ((names = Object.fromEntries(list.map((t) => [t.dir, t]))), onChange()))
    .catch(() => {});
}

/** The map's track: called whenever the player arrives on a map. */
export function setMapMusic(dir) {
  if (dir === want) return;
  want = dir || "";
  if (!audio || audio.paused || loaded === SILENCE) {
    // not playing: start the map's track now if allowed (the first touch may have come before any map)
    if (want && prefs.on && unlocked) play();
    else if (audio && !want) audio.pause();
    return onChange();
  }
  // playing: the old one fades out, the map's fades in
  fadeTo(0, 0.8, () => {
    if (want) play();
    else audio.pause();
  });
}

function play() {
  if (!want || !unlocked || !prefs.on) return onChange();
  if (starting) return;
  const a = ensure();
  if (loaded !== want) (a.src = url(want)), (loaded = want);
  else if (!a.paused) return void (fadeTo(level(), 0.6), onChange());
  clearInterval(fadeTimer);
  a.volume = 0;
  starting = true;
  setTimeout(() => (starting = false), 4000); // (a play that never answers must not block the next touch)
  const p = a.play();
  const done = () => ((starting = false), onChange());
  if (p?.then) p.then(() => (done(), fadeTo(level(), 1.2))).catch(done);
  else done(), fadeTo(level(), 1.2);
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
  if (on) (unlocked = true), play();
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
export const musicState = () => ({ on: prefs.on, vol: prefs.vol, playing: !!audio && !audio.paused && loaded !== SILENCE, track: names[want] ?? (want ? { dir: want, ten: want, tac_gia: "" } : null) });
/** Called whenever the state changes (the settings panel redraws). */
export const onMusicChange = (fn) => (onChange = fn ?? (() => {}));
