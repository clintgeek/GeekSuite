/**
 * Builds the `GameSessionInput` for "Log session". Kept pure so the one thing
 * that must never drift — a calendar day sent as UTC midnight — is tested.
 */
import { calendarDateToUtcIso } from '../../utils/dates';

export const MINUTE_PRESETS = [30, 60, 90, 120];
export const MAX_SESSION_MINUTES = 24 * 60;

/** Parses "90", "1.5h", "1:30", "1h 30m" into minutes. Null if it is not a duration. */
export function parseMinutes(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(s))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = /^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d{1,2})\s*m(?:in(?:utes?)?)?)?$/.exec(s))) {
    return Math.round(Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0));
  }
  if ((m = /^(\d+)\s*m?(?:in(?:utes?)?)?$/.exec(s))) return Number(m[1]);
  return null;
}

/**
 * @param {{ date: string, minutes: number|string, platform?: string, note?: string }} form
 * @returns {{ input?: object, error?: string }}
 */
export function buildSessionInput({ date, minutes, platform, note }) {
  const playedOn = calendarDateToUtcIso(date);
  if (!playedOn) return { error: 'Pick the day you played.' };
  const mins = typeof minutes === 'number' ? Math.round(minutes) : parseMinutes(minutes);
  if (!mins || mins < 1) return { error: 'How long did you play?' };
  if (mins > MAX_SESSION_MINUTES) return { error: 'A session can be at most 24 hours.' };
  const input = { playedOn, minutes: mins };
  if (platform) input.platform = platform;
  const trimmed = (note || '').trim();
  if (trimmed) input.note = trimmed.slice(0, 500);
  return { input };
}
