/**
 * ambientService.js
 *
 * Upstream-call helpers for dashgeek's ambient screen (weather / Spotify /
 * Google Calendar / Gmail). Route handlers in routes/ambient.js stay thin;
 * all axios calls, shaping, and ProviderExpiredError propagation live here.
 *
 * Tokens are sourced from oauthConnectionService.getFreshAccessToken — we
 * never read the OAuthConnection model directly. Per-provider-expired errors
 * bubble up so the route can respond with 409 { error: 'provider_expired' }.
 */

import axios from 'axios';
import {
  getFreshAccessToken,
  ProviderExpiredError,
} from './oauthConnectionService.js';
import logger from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Weather — Open-Meteo (no API key)
// ---------------------------------------------------------------------------

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export async function fetchWeather() {
  const lat = process.env.WEATHER_LAT;
  const lon = process.env.WEATHER_LON;
  if (!lat || !lon) {
    throw new Error(
      '[ambientService] WEATHER_LAT and WEATHER_LON must be set'
    );
  }

  const { data } = await axios.get(OPEN_METEO_URL, {
    params: {
      latitude: lat,
      longitude: lon,
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: 7,
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
    },
    timeout: 8000,
  });

  return shapeWeather(data);
}

export function shapeWeather(data) {
  const c = data?.current || {};
  const d = data?.daily || {};
  const times = Array.isArray(d.time) ? d.time : [];

  const daily = times.map((date, i) => ({
    date,
    temp_min: d.temperature_2m_min?.[i] ?? null,
    temp_max: d.temperature_2m_max?.[i] ?? null,
    weather_code: d.weather_code?.[i] ?? null,
    precipitation_probability: d.precipitation_probability_max?.[i] ?? null,
  }));

  return {
    current: {
      temp: c.temperature_2m ?? null,
      feels_like: c.apparent_temperature ?? null,
      weather_code: c.weather_code ?? null,
      is_day: c.is_day === 1 || c.is_day === true,
      humidity: c.relative_humidity_2m ?? null,
      wind_speed: c.wind_speed_10m ?? null,
      precipitation: c.precipitation ?? null,
    },
    daily,
  };
}

// ---------------------------------------------------------------------------
// Shared HTTP wrapper — adds Bearer token, re-throws ProviderExpiredError
// ---------------------------------------------------------------------------

async function providerRequest(userId, provider, { method, url, params, data, headers }) {
  let accessToken;
  try {
    ({ accessToken } = await getFreshAccessToken(userId, provider));
  } catch (err) {
    // ProviderExpiredError is the only one we expose specifically.
    throw err;
  }

  const res = await axios.request({
    method,
    url,
    params,
    data,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(headers || {}),
    },
    timeout: 10_000,
    validateStatus: () => true,
  });

  // If the provider itself says the token is dead (401 with invalid-token hints),
  // we *could* treat it as expired — but getFreshAccessToken already handles
  // refresh-side failures, so a 401 here typically means scope/permission.
  // Surface as a regular error to be mapped to 500 by the route handler.
  return res;
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

const SPOTIFY_BASE = 'https://api.spotify.com/v1/me/player';

export async function spotifyRequest(userId, method, path, { params, data } = {}) {
  return providerRequest(userId, 'spotify', {
    method,
    url: `${SPOTIFY_BASE}${path}`,
    params,
    data: data ?? (method === 'PUT' || method === 'POST' ? {} : undefined),
  });
}

/**
 * Shape the Spotify "currently playing" payload into the contract.
 * Returns null when nothing is playable (so the route can 204).
 */
export function shapeNowPlaying(data) {
  if (!data || !data.item) return null;
  const item = data.item;
  return {
    is_playing: !!data.is_playing,
    track: {
      name: item.name,
      artist: item.artists?.[0]?.name || '',
      album: item.album?.name || '',
      album_art_url: item.album?.images?.[0]?.url || null,
      progress_ms: data.progress_ms ?? 0,
      duration_ms: item.duration_ms ?? 0,
      uri: item.uri || null,
    },
  };
}

export function shapeQueue(data) {
  const currently = data?.currently_playing
    ? {
        name: data.currently_playing.name,
        artist: data.currently_playing.artists?.[0]?.name || '',
        album_art_url:
          data.currently_playing.album?.images?.[0]?.url || null,
      }
    : null;
  const queue = (data?.queue || []).map((item) => ({
    name: item.name,
    artist: item.artists?.[0]?.name || '',
    album_art_url: item.album?.images?.[0]?.url || null,
  }));
  return { currently_playing: currently, queue };
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

const CALENDAR_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function calendarFetchEvents(userId) {
  const res = await providerRequest(userId, 'google', {
    method: 'GET',
    url: CALENDAR_EVENTS_URL,
    params: {
      timeMin: new Date().toISOString(),
      maxResults: 25,
      singleEvents: true,
      orderBy: 'startTime',
    },
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`[ambientService] calendar error: ${res.status}`);
  }

  const events = (res.data?.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '',
    start: ev.start || {},
    end: ev.end || {},
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.description ? { description: ev.description } : {}),
  }));
  return { events };
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Parse a Gmail "From" header into { from_name, from_email }.
 *
 * Handles:
 *   "Display Name" <addr@x>       → { "Display Name", "addr@x" }
 *   Display Name <addr@x>         → { "Display Name", "addr@x" }
 *   addr@x                        → { "", "addr@x" }
 *   (empty / missing)             → { "", "" }
 */
export function parseFromHeader(fromRaw) {
  if (!fromRaw || typeof fromRaw !== 'string') return { from_name: '', from_email: '' };
  const angle = fromRaw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) {
    return {
      from_name: (angle[1] || '').trim(),
      from_email: (angle[2] || '').trim(),
    };
  }
  // Bare address
  const trimmed = fromRaw.trim();
  if (trimmed.includes('@')) {
    return { from_name: '', from_email: trimmed };
  }
  return { from_name: trimmed, from_email: '' };
}

function headerValue(headers, name) {
  if (!Array.isArray(headers)) return '';
  const lowered = name.toLowerCase();
  const hit = headers.find((h) => (h?.name || '').toLowerCase() === lowered);
  return hit?.value || '';
}

function parseDateToIso(raw) {
  if (!raw) return null;
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export async function gmailListMessages(userId) {
  const listRes = await providerRequest(userId, 'google', {
    method: 'GET',
    url: `${GMAIL_BASE}/messages`,
    params: { labelIds: 'INBOX', maxResults: 25 },
  });

  if (listRes.status < 200 || listRes.status >= 300) {
    throw new Error(`[ambientService] gmail list error: ${listRes.status}`);
  }

  const ids = (listRes.data?.messages || []).map((m) => m.id);

  // Fan out metadata fetches. Per-message failures drop that row silently.
  const enriched = await Promise.all(
    ids.map(async (id) => {
      try {
        const mres = await providerRequest(userId, 'google', {
          method: 'GET',
          url: `${GMAIL_BASE}/messages/${id}`,
          params: {
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          },
        });
        if (mres.status < 200 || mres.status >= 300) return null;
        const d = mres.data || {};
        const headers = d.payload?.headers || [];
        const { from_name, from_email } = parseFromHeader(headerValue(headers, 'From'));
        const subject = headerValue(headers, 'Subject') || '(no subject)';
        const dateHeader = headerValue(headers, 'Date');
        // Prefer Gmail's internalDate (ms since epoch) when available — it's
        // authoritative and always present.
        const received_at = d.internalDate
          ? new Date(Number(d.internalDate)).toISOString()
          : parseDateToIso(dateHeader);
        return {
          id: d.id || id,
          from_name,
          from_email,
          subject,
          snippet: d.snippet || '',
          received_at,
          unread: Array.isArray(d.labelIds) && d.labelIds.includes('UNREAD'),
        };
      } catch (err) {
        // Re-throw ProviderExpiredError so the outer route returns 409;
        // swallow anything else and skip this row.
        if (err instanceof ProviderExpiredError) throw err;
        logger.warn(
          { err: err?.message, id },
          '[ambientService] gmail enrich skipped'
        );
        return null;
      }
    })
  );

  return { messages: enriched.filter(Boolean) };
}

/**
 * Walk a Gmail message payload and extract text/html + text/plain bodies.
 * Returns { html, text }. When only one is present, the other is ''.
 */
export function extractMessageBodies(payload) {
  let html = '';
  let text = '';

  function walk(part) {
    if (!part) return;
    const mime = part.mimeType || '';
    const dataStr = part.body?.data;
    if (dataStr) {
      const decoded = Buffer.from(dataStr, 'base64url').toString('utf-8');
      if (mime === 'text/html' && !html) html = decoded;
      else if (mime === 'text/plain' && !text) text = decoded;
    }
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) walk(p);
    }
  }

  walk(payload);
  return { html, text };
}

export async function gmailGetMessage(userId, id) {
  const res = await providerRequest(userId, 'google', {
    method: 'GET',
    url: `${GMAIL_BASE}/messages/${id}`,
    params: { format: 'full' },
  });
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`[ambientService] gmail get error: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const d = res.data || {};
  const headers = d.payload?.headers || [];
  const { from_name, from_email } = parseFromHeader(headerValue(headers, 'From'));
  const subject = headerValue(headers, 'Subject') || '(no subject)';
  const to = headerValue(headers, 'To') || '';
  const dateHeader = headerValue(headers, 'Date');
  const received_at = d.internalDate
    ? new Date(Number(d.internalDate)).toISOString()
    : parseDateToIso(dateHeader);

  const { html, text } = extractMessageBodies(d.payload);

  return {
    id: d.id || id,
    from_name,
    from_email,
    to,
    subject,
    received_at,
    body_html: html,
    body_text: text,
  };
}

// Re-export for route handlers that want to catch it
export { ProviderExpiredError };
