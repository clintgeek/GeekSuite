/**
 * consolePrefs — the Signal Box's own switches, per browser.
 *
 * These are conveniences of *this* console on *this* device (a bell that
 * rings when you throw a lever, a screensaver for a wall-mounted tab), not
 * suite preferences, so they live in localStorage rather than on the user
 * document. Every read and write is guarded: a private window or blocked
 * storage gets the defaults and a console that still works.
 *
 * Defaults are the quiet ones. Sound is OFF until someone turns it on.
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'basegeek.signalbox.prefs';

export const DEFAULT_PREFS = Object.freeze({
  /** The lever bell and switch clunk. Off by default, always. */
  sound: false,
  /** Night Watch, the idle screensaver on the Signal Box dashboard. */
  nightWatch: true,
  /** Minutes of no input before Night Watch comes on. */
  idleMinutes: 5,
});

export const IDLE_MINUTE_CHOICES = Object.freeze([2, 5, 10, 30]);

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      sound: parsed.sound === true,
      nightWatch: parsed.nightWatch !== false,
      idleMinutes: IDLE_MINUTE_CHOICES.includes(parsed.idleMinutes) ? parsed.idleMinutes : DEFAULT_PREFS.idleMinutes,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let current = null;
const listeners = new Set();

function snapshot() {
  if (current === null) current = read();
  return current;
}

export function getConsolePrefs() {
  return snapshot();
}

export function setConsolePref(key, value) {
  if (!(key in DEFAULT_PREFS)) return;
  current = { ...snapshot(), [key]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage refused: the switch still works for this page's lifetime.
  }
  for (const listener of listeners) listener();
}

/** Test hook: forget the cached snapshot so the next read hits storage. */
export function _resetConsolePrefs() {
  current = null;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConsolePrefs() {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);
}
