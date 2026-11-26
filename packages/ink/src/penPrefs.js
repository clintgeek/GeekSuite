/**
 * penPrefs.js — what this DEVICE remembers about writing with a pen.
 *
 * All of it is per device (localStorage), never in the note: a tablet with a
 * pen and a phone without one want different things from the same page.
 * Every read and write survives a browser that refuses storage (private
 * mode, quota): the page still works, it just forgets.
 *
 * The storage KEYS belong to each app and never change here: NoteGeek keeps
 * `notegeek:sketch*`, GeekDay `geekday:ink*`. An app binds its keys once with
 * `createPenPrefs(keys)` and gets back only the prefs it named a key for:
 *
 *   - penSeen       a pen has drawn here before → fingers stop drawing
 *                   (pen mode / palm rejection from the first touch)
 *   - fingerDraws   the writer's override: fingers draw anyway
 *   - barPosition   bottom / top / left / right (handedness)
 *   - cameras       where each page was last looked at, per note id
 *   - recentPens    the last three pens used (colour + size), a preset strip
 */

export const BAR_POSITIONS = ['bottom', 'top', 'left', 'right'];
/** How many pages' cameras are kept; the least recently used go first. */
export const MAX_CAMERAS = 60;
export const MAX_RECENT_PENS = 3;

const store = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

/** One stored string, or null (also when storage is refused). */
export function readPref(key) {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Store a string; null removes the key. Never throws. */
export function writePref(key, value) {
  try {
    if (value === null) store()?.removeItem(key);
    else store()?.setItem(key, value);
  } catch {
    // storage refused: the preference is simply not remembered
  }
}

/** A stored JSON value, or `fallback` when it is missing or unreadable. */
export function readJsonPref(key, fallback) {
  try {
    const v = JSON.parse(readPref(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Does a finger draw? Only until a pen has been seen on this device, or when
 * the writer has turned "Finger draws" on.
 */
export const touchDraws = ({ penSeen, fingerDraws }) => Boolean(fingerDraws) || !penSeen;

const validCamera = (c) => c && [c.x, c.y, c.z].every((n) => typeof n === 'number' && Number.isFinite(n)) && c.z > 0;

/**
 * The device prefs under this app's keys.
 *
 * @param {{ penSeen?: string, fingerDraws?: string, barPosition?: string, cameras?: string, recentPens?: string }} keys
 */
export function createPenPrefs(keys) {
  const k = { ...keys };
  const prefs = {};

  if (k.penSeen) {
    prefs.readPenSeen = () => readPref(k.penSeen) === '1';
    prefs.writePenSeen = () => { if (!prefs.readPenSeen()) writePref(k.penSeen, '1'); };
  }

  if (k.fingerDraws) {
    prefs.readFingerDraws = () => readPref(k.fingerDraws) === '1';
    prefs.writeFingerDraws = (on) => writePref(k.fingerDraws, on ? '1' : null);
  }

  if (k.barPosition) {
    prefs.readBarPosition = () => {
      const v = readPref(k.barPosition);
      return BAR_POSITIONS.includes(v) ? v : 'bottom';
    };
    prefs.writeBarPosition = (pos) => writePref(k.barPosition, BAR_POSITIONS.includes(pos) ? pos : null);
  }

  if (k.cameras) {
    /** This page's last camera on this device, or null. */
    prefs.readCamera = (noteId) => {
      if (!noteId) return null;
      const all = readJsonPref(k.cameras, {});
      const c = all?.[noteId];
      return validCamera(c) ? { x: c.x, y: c.y, z: c.z } : null;
    };
    prefs.writeCamera = (noteId, camera) => {
      if (!noteId || !validCamera(camera)) return;
      const all = readJsonPref(k.cameras, {});
      const next = typeof all === 'object' && !Array.isArray(all) ? { ...all } : {};
      delete next[noteId];
      next[noteId] = { x: camera.x, y: camera.y, z: camera.z, at: Date.now() };
      const ids = Object.keys(next);
      if (ids.length > MAX_CAMERAS) {
        ids.sort((a, b) => (next[a].at || 0) - (next[b].at || 0));
        ids.slice(0, ids.length - MAX_CAMERAS).forEach((id) => delete next[id]);
      }
      writePref(k.cameras, JSON.stringify(next));
    };
  }

  if (k.recentPens) {
    /** The last pens used, newest first: [{ color, size }] (size 'fine' is the Fine pen). */
    prefs.readRecentPens = () => {
      const v = readJsonPref(k.recentPens, []);
      return Array.isArray(v) ? v.filter((p) => p && typeof p.color === 'string' && typeof p.size === 'string').slice(0, MAX_RECENT_PENS) : [];
    };
    prefs.pushRecentPen = (pen) => {
      if (!pen?.color || !pen?.size) return prefs.readRecentPens();
      const next = [{ color: pen.color, size: pen.size }, ...prefs.readRecentPens().filter((p) => p.color !== pen.color || p.size !== pen.size)]
        .slice(0, MAX_RECENT_PENS);
      writePref(k.recentPens, JSON.stringify(next));
      return next;
    };
  }

  return prefs;
}
