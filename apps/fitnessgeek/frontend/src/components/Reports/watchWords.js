/**
 * Plain words for the watch's own terms, and how to read a watch-data answer.
 *
 * Garmin's names stay ("Body Battery", "HRV"): they are what the watch and
 * its app call these, so a person can match one screen with the other. Each
 * gets one short sentence the first time it appears on a screen. One place,
 * so Activity, Health and the trend cards say the same thing.
 */
export const EXPLAIN = {
  hrv: 'The tiny changes in time between heartbeats. Higher usually means better rested.',
  bodyBattery: 'Garmin’s 0–100 energy estimate. Rest charges it; activity and stress drain it.',
  stress: 'Garmin’s 0–100 estimate from your heart rate. Lower is calmer.',
  sleepScore: 'Garmin’s 0–100 rating of the night.',
  spo2: 'How much oxygen your blood carried, read at the wrist.',
  readiness: 'A 0–100 guess at how recovered you are, from last night’s sleep and today’s readings.',
};

/** Garmin's ALL-CAPS words ("GOOD", "NOT_BALANCED") in sentence case. */
export const sentenceWord = (word) => (typeof word === 'string' && word
  ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase().replace(/_/g, ' ')
  : word);

/** "7h 4m" / "52m" from minutes; a dash when the number is missing. */
export const hoursMinutes = (minutes) => {
  const n = Number(minutes);
  if (minutes == null || !Number.isFinite(n)) return '—';
  const whole = Math.round(n);
  return `${whole >= 60 ? `${Math.floor(whole / 60)}h ` : ''}${whole % 60}m`;
};

export const WATCH_DOWN_TEXT = 'Couldn’t reach your watch data just now. Nothing is lost; try again in a moment.';

/**
 * What a `/api/influx/*` answer amounts to:
 *   'ok'    there is data to draw
 *   'empty' the watch sent nothing for this day
 *   'down'  the data server could not be reached. This is a FAILED read and
 *           must never be drawn as an empty day. The server's own `message`
 *           ("InfluxDB is unavailable") is not for a person and is not shown.
 */
export const watchOutcome = (response) => {
  if (!response) return 'empty';
  if (response.available === false) return response.reason === 'influx_unavailable' ? 'down' : 'empty';
  return 'ok';
};
