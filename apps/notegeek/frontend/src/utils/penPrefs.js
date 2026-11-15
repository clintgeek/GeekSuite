/**
 * penPrefs.js — what this DEVICE remembers about writing in sketches
 * (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md 2.3, 2.4, 2.11, 2.12).
 *
 * All of it is per device (localStorage), never in the note: a tablet with a
 * pen and a phone without one want different things from the same sketch.
 *
 *   - penSeen       a pen has drawn here before → pen mode (palm rejection)
 *                   is on from the first touch, not from the first pen stroke
 *   - fingerDraws   the writer's override: fingers draw, pen mode stays off
 *   - barPosition   bottom / top / left / right (handedness)
 *   - camera        where each sketch was last looked at, per note id
 *   - recentPens    the last three pens used (colour + size), a preset strip
 *
 * Every read and write survives a browser that refuses storage (private
 * mode, quota): the sketch still works, it just forgets.
 */

const KEYS = {
  penSeen: 'notegeek:sketchPenSeen',
  fingerDraws: 'notegeek:sketchFingerDraws',
  barPosition: 'notegeek:sketchBarPosition',
  cameras: 'notegeek:sketchCameras',
  recentPens: 'notegeek:sketchRecentPens',
};

export const BAR_POSITIONS = ['bottom', 'top', 'left', 'right'];
/** How many sketches' cameras are kept; the least recently used go first. */
export const MAX_CAMERAS = 60;
export const MAX_RECENT_PENS = 3;

const store = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

function read(key) {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) store()?.removeItem(key);
    else store()?.setItem(key, value);
  } catch {
    // storage refused: the preference is simply not remembered
  }
}

function readJson(key, fallback) {
  try {
    const v = JSON.parse(read(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export const readPenSeen = () => read(KEYS.penSeen) === '1';
export const writePenSeen = () => { if (!readPenSeen()) write(KEYS.penSeen, '1'); };

export const readFingerDraws = () => read(KEYS.fingerDraws) === '1';
export const writeFingerDraws = (on) => write(KEYS.fingerDraws, on ? '1' : null);

export function readBarPosition() {
  const v = read(KEYS.barPosition);
  return BAR_POSITIONS.includes(v) ? v : 'bottom';
}
export const writeBarPosition = (pos) => write(KEYS.barPosition, BAR_POSITIONS.includes(pos) ? pos : null);

const validCamera = (c) => c && [c.x, c.y, c.z].every((n) => typeof n === 'number' && Number.isFinite(n)) && c.z > 0;

/** This sketch's last camera on this device, or null. */
export function readCamera(noteId) {
  if (!noteId) return null;
  const all = readJson(KEYS.cameras, {});
  const c = all?.[noteId];
  return validCamera(c) ? { x: c.x, y: c.y, z: c.z } : null;
}

export function writeCamera(noteId, camera) {
  if (!noteId || !validCamera(camera)) return;
  const all = readJson(KEYS.cameras, {});
  const next = typeof all === 'object' && !Array.isArray(all) ? { ...all } : {};
  delete next[noteId];
  next[noteId] = { x: camera.x, y: camera.y, z: camera.z, at: Date.now() };
  const ids = Object.keys(next);
  if (ids.length > MAX_CAMERAS) {
    ids.sort((a, b) => (next[a].at || 0) - (next[b].at || 0));
    ids.slice(0, ids.length - MAX_CAMERAS).forEach((id) => delete next[id]);
  }
  write(KEYS.cameras, JSON.stringify(next));
}

/** The last pens used, newest first: [{ color, size }] (size 'fine' is the Fine pen). */
export function readRecentPens() {
  const v = readJson(KEYS.recentPens, []);
  return Array.isArray(v) ? v.filter((p) => p && typeof p.color === 'string' && typeof p.size === 'string').slice(0, MAX_RECENT_PENS) : [];
}

export function pushRecentPen(pen) {
  if (!pen?.color || !pen?.size) return readRecentPens();
  const next = [{ color: pen.color, size: pen.size }, ...readRecentPens().filter((p) => p.color !== pen.color || p.size !== pen.size)]
    .slice(0, MAX_RECENT_PENS);
  write(KEYS.recentPens, JSON.stringify(next));
  return next;
}
