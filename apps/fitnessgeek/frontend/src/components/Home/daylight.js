/**
 * "Daylight": Today follows the time of day. A faint sky wash at the top of
 * the "what is left" card and a small sun or moon by the date — warm at
 * dawn, clear at midday, amber in the evening, indigo at night.
 *
 * It is decoration only: nothing is said by it that the words don't say, and
 * the wash is pale enough that text keeps the same contrast it has on paper.
 */
const PHASES = {
  morning: {
    light: { wash: '#FFE8D4', glyph: '#D9480F' },
    dark: { wash: '#33261F', glyph: '#FFA94D' },
  },
  midday: {
    light: { wash: '#DDEBFF', glyph: '#E67700' },
    dark: { wash: '#1C2A44', glyph: '#FFD43B' },
  },
  evening: {
    light: { wash: '#FFDFD0', glyph: '#C2410C' },
    dark: { wash: '#35232B', glyph: '#FF9A6B' },
  },
  night: {
    light: { wash: '#E5E1FB', glyph: '#5F3DC4' },
    dark: { wash: '#23214A', glyph: '#B79CFF' },
  },
};

/** 5–10 morning, 11–16 midday, 17–20 evening, otherwise night. */
export function phaseForHour(hour) {
  const h = Number(hour);
  if (h >= 5 && h <= 10) return 'morning';
  if (h >= 11 && h <= 16) return 'midday';
  if (h >= 17 && h <= 20) return 'evening';
  return 'night';
}

/** `{ phase, wash, glyph }` for this hour in this mode. */
export function daylightFor(hour, mode = 'light') {
  const phase = phaseForHour(hour);
  return { phase, ...PHASES[phase][mode === 'dark' ? 'dark' : 'light'] };
}
