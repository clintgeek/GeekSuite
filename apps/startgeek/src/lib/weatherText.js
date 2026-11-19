// weatherText.js — the weather in plain words (design review 2026-11-18, #9).
// "H 78 · L 60 55% RH W 6 MPH" read as instrument shorthand, and "60 55%"
// as one number. Now: "H 78 · L 60 · 55% humidity · wind 6 mph".

/** "Mainly Clear" and "mainly clear" both become "Mainly clear". */
export function sentenceCase(text) {
  const s = String(text ?? '').trim().toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** The stat line under the temperature, as separate parts. */
export function weatherStats({ high, low, humidity, windSpeed } = {}) {
  return [
    Number.isFinite(high) && Number.isFinite(low) ? `H ${high} · L ${low}` : null,
    Number.isFinite(humidity) ? `${humidity}% humidity` : null,
    Number.isFinite(windSpeed) ? `wind ${windSpeed} mph` : null,
  ].filter(Boolean)
}

export const STAT_SEPARATOR = ' · '
