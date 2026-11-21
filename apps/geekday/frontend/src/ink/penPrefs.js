/**
 * penPrefs.js — what this DEVICE remembers about writing on the day page.
 *
 * Trimmed from apps/notegeek/frontend/src/utils/penPrefs.js (GeekDay keeps its
 * own copy and its own keys; apps do not import each other). Only the two
 * prefs the fixed page needs:
 *
 *   - penSeen       a pen has drawn here before → fingers stop drawing
 *   - fingerDraws   the writer's override: fingers draw anyway
 *
 * Per device (localStorage), never in the note. Every read and write survives
 * a browser that refuses storage: the page still works, it just forgets.
 */
export const PEN_PREF_KEYS = {
  penSeen: 'geekday:inkPenSeen',
  fingerDraws: 'geekday:inkFingerDraws',
};

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

export const readPenSeen = () => read(PEN_PREF_KEYS.penSeen) === '1';
export const writePenSeen = () => { if (!readPenSeen()) write(PEN_PREF_KEYS.penSeen, '1'); };

export const readFingerDraws = () => read(PEN_PREF_KEYS.fingerDraws) === '1';
export const writeFingerDraws = (on) => write(PEN_PREF_KEYS.fingerDraws, on ? '1' : null);

/**
 * Does a finger draw? Only until a pen has been seen on this device, or when
 * the writer has turned "Finger draws" on.
 */
export const touchDraws = ({ penSeen, fingerDraws }) => Boolean(fingerDraws) || !penSeen;
