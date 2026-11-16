/**
 * The in-app reader's font size and theme, remembered on this device
 * (SUITE_REVIEW_2026-11 S-D3, 2026-11-15). Position sync was decided against;
 * these two were the "starts over every time" part that is cheap to keep.
 *
 * localStorage only, every access in try/catch: a private window, blocked
 * site data or a full quota just means the defaults, never a broken reader.
 */
export const READER_PREFS_KEY = "bookgeek.reader.v1";
export const FONT_MIN = 90;
export const FONT_MAX = 160;
export const FONT_STEP = 10;

function clampFont(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stepped = Math.round(n / FONT_STEP) * FONT_STEP;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, stepped));
}

/** `{ fontPct?, theme? }` — only the values that were stored and are valid. */
export function loadReaderPrefs() {
  try {
    const raw = window.localStorage.getItem(READER_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    const font = clampFont(parsed?.fontPct);
    if (font !== null) out.fontPct = font;
    if (parsed?.theme === "light" || parsed?.theme === "dark") out.theme = parsed.theme;
    return out;
  } catch {
    return {};
  }
}

/** Merge `patch` into what is stored. Silently does nothing when storage is unavailable. */
export function saveReaderPrefs(patch) {
  try {
    const next = { ...loadReaderPrefs(), ...patch };
    window.localStorage.setItem(READER_PREFS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: the reader keeps working with defaults
  }
}
