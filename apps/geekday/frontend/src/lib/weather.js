/**
 * Weather for the docked view (spec req 14), read the way StartGeek reads it
 * (apps/startgeek/src/services/weatherService.js): straight from the browser,
 * no key, no gateway — Open-Meteo for the forecast, ipapi.co for roughly
 * where the tablet is, and the house (Arkadelphia, Arkansas) when that fails.
 *
 * Nothing here ever throws to the caller: no weather is a blank corner of a
 * clock face, not an error.
 */

export const HOME = { latitude: 34.1201, longitude: -93.0532, place: 'Arkadelphia, Arkansas' };

const LOCATION_KEY = 'geekday:weatherPlace';
const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
export const WEATHER_TTL_MS = 15 * 60 * 1000;

/** WMO weather codes → the words on the clock face. */
export function describeWeather(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return '';
}

async function getJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readPlace(storage, now) {
  try {
    const saved = JSON.parse(storage?.getItem(LOCATION_KEY) || 'null');
    if (saved && now - saved.at < LOCATION_TTL_MS && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) return saved;
  } catch {
    // unreadable storage: look it up again
  }
  return null;
}

async function findPlace({ fetchImpl, storage, now }) {
  const saved = readPlace(storage, now);
  if (saved) return saved;
  try {
    const where = await getJson('https://ipapi.co/json', fetchImpl, 8000);
    if (!Number.isFinite(where?.latitude) || !Number.isFinite(where?.longitude)) throw new Error('no coordinates');
    const place = {
      latitude: where.latitude,
      longitude: where.longitude,
      place: [where.city, where.region].filter(Boolean).join(', '),
      at: now,
    };
    try {
      storage?.setItem(LOCATION_KEY, JSON.stringify(place));
    } catch {
      // private mode: ask again next time
    }
    return place;
  } catch {
    return HOME;
  }
}

/**
 * @returns {Promise<null | { temperature: number, high: number|null, low: number|null,
 *   description: string, place: string }>}  null when the weather could not be read
 */
export async function fetchWeather({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const { latitude, longitude, place } = await findPlace({ fetchImpl, storage, now });
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min' +
      '&temperature_unit=fahrenheit&forecast_days=1&timezone=auto';
    const data = await getJson(url, fetchImpl, 10000);
    const temperature = data?.current?.temperature_2m;
    if (!Number.isFinite(temperature)) return null;
    const high = data?.daily?.temperature_2m_max?.[0];
    const low = data?.daily?.temperature_2m_min?.[0];
    return {
      temperature: Math.round(temperature),
      high: Number.isFinite(high) ? Math.round(high) : null,
      low: Number.isFinite(low) ? Math.round(low) : null,
      description: describeWeather(data.current.weather_code),
      place: place || '',
    };
  } catch {
    return null;
  }
}
