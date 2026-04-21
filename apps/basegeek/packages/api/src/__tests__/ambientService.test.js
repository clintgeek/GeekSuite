/**
 * ambientService.test.js — coverage for the dashgeek ambient helpers.
 *
 * Focus (per Agent B brief):
 *   (a) weather shape — Open-Meteo → contract mapping
 *   (b) Spotify now-playing shape — first artist, first album image
 *   (c) Gmail From-header parse — "Name" <addr@x> / Name <addr> / bare addr
 *   (d) message-body walker picks text/html over text/plain when both present
 *
 * These tests do not hit Mongo or the network. axios is not mocked here
 * because we only exercise pure shaping helpers, which is enough to guard
 * the response contract Agent C is building against.
 */

import { describe, it, expect } from '@jest/globals';

process.env.WEATHER_LAT = '34.0988';
process.env.WEATHER_LON = '-93.0660';

const {
  shapeWeather,
  shapeNowPlaying,
  shapeQueue,
  parseFromHeader,
  extractMessageBodies,
} = await import('../services/ambientService.js');

// ── (a) weather ──────────────────────────────────────────────────────────────

describe('shapeWeather', () => {
  it('maps Open-Meteo payload to the contract shape', () => {
    const raw = {
      current: {
        temperature_2m: 72.5,
        apparent_temperature: 70.1,
        relative_humidity_2m: 44,
        weather_code: 2,
        is_day: 1,
        precipitation: 0,
        wind_speed_10m: 6.2,
      },
      daily: {
        time: ['2026-04-20', '2026-04-21', '2026-04-22'],
        temperature_2m_max: [75, 78, 80],
        temperature_2m_min: [55, 56, 58],
        weather_code: [2, 61, 0],
        precipitation_probability_max: [10, 80, 5],
      },
    };

    const out = shapeWeather(raw);

    expect(out.current).toEqual({
      temp: 72.5,
      feels_like: 70.1,
      weather_code: 2,
      is_day: true,
      humidity: 44,
      wind_speed: 6.2,
      precipitation: 0,
    });
    expect(out.daily).toHaveLength(3);
    expect(out.daily[1]).toEqual({
      date: '2026-04-21',
      temp_min: 56,
      temp_max: 78,
      weather_code: 61,
      precipitation_probability: 80,
    });
  });

  it('tolerates missing sub-fields without throwing', () => {
    const out = shapeWeather({ current: {}, daily: {} });
    expect(out.current.temp).toBeNull();
    expect(out.daily).toEqual([]);
  });
});

// ── (b) Spotify now-playing ──────────────────────────────────────────────────

describe('shapeNowPlaying', () => {
  it('picks the first artist and first album image', () => {
    const raw = {
      is_playing: true,
      progress_ms: 12345,
      item: {
        name: 'Heart-Shaped Box',
        uri: 'spotify:track:abc',
        duration_ms: 240000,
        artists: [
          { name: 'Nirvana' },
          { name: 'Other Artist' },
        ],
        album: {
          name: 'In Utero',
          images: [
            { url: 'https://img/large.jpg', width: 640 },
            { url: 'https://img/med.jpg', width: 300 },
          ],
        },
      },
    };

    const out = shapeNowPlaying(raw);
    expect(out).toEqual({
      is_playing: true,
      track: {
        name: 'Heart-Shaped Box',
        artist: 'Nirvana',
        album: 'In Utero',
        album_art_url: 'https://img/large.jpg',
        progress_ms: 12345,
        duration_ms: 240000,
        uri: 'spotify:track:abc',
      },
    });
  });

  it('returns null when payload has no item', () => {
    expect(shapeNowPlaying(null)).toBeNull();
    expect(shapeNowPlaying({})).toBeNull();
    expect(shapeNowPlaying({ is_playing: false })).toBeNull();
  });

  it('tolerates missing album images', () => {
    const out = shapeNowPlaying({
      is_playing: false,
      item: {
        name: 'x',
        artists: [{ name: 'A' }],
        album: { name: 'Y', images: [] },
        duration_ms: 1000,
      },
    });
    expect(out.track.album_art_url).toBeNull();
  });
});

describe('shapeQueue', () => {
  it('maps currently_playing + queue with first artist and first image', () => {
    const raw = {
      currently_playing: {
        name: 'Song A',
        artists: [{ name: 'Artist A' }, { name: 'Other' }],
        album: { images: [{ url: 'img://a' }] },
      },
      queue: [
        {
          name: 'Song B',
          artists: [{ name: 'Artist B' }],
          album: { images: [{ url: 'img://b' }] },
        },
      ],
    };
    const out = shapeQueue(raw);
    expect(out.currently_playing).toEqual({
      name: 'Song A',
      artist: 'Artist A',
      album_art_url: 'img://a',
    });
    expect(out.queue[0]).toEqual({
      name: 'Song B',
      artist: 'Artist B',
      album_art_url: 'img://b',
    });
  });
});

// ── (c) Gmail From-header parse ──────────────────────────────────────────────

describe('parseFromHeader', () => {
  it('splits quoted "Name" <addr>', () => {
    expect(parseFromHeader('"Jane Doe" <jane@example.com>')).toEqual({
      from_name: 'Jane Doe',
      from_email: 'jane@example.com',
    });
  });

  it('splits unquoted Name <addr>', () => {
    expect(parseFromHeader('Jane Doe <jane@example.com>')).toEqual({
      from_name: 'Jane Doe',
      from_email: 'jane@example.com',
    });
  });

  it('handles bare email', () => {
    expect(parseFromHeader('jane@example.com')).toEqual({
      from_name: '',
      from_email: 'jane@example.com',
    });
  });

  it('returns empty pair on falsy input', () => {
    expect(parseFromHeader('')).toEqual({ from_name: '', from_email: '' });
    expect(parseFromHeader(null)).toEqual({ from_name: '', from_email: '' });
    expect(parseFromHeader(undefined)).toEqual({ from_name: '', from_email: '' });
  });
});

// ── (d) message-body walker ──────────────────────────────────────────────────

describe('extractMessageBodies', () => {
  function b64url(str) {
    return Buffer.from(str, 'utf-8').toString('base64url');
  }

  it('picks text/html and text/plain when both present', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: b64url('plain body') },
        },
        {
          mimeType: 'text/html',
          body: { data: b64url('<p>html body</p>') },
        },
      ],
    };
    const out = extractMessageBodies(payload);
    expect(out.html).toBe('<p>html body</p>');
    expect(out.text).toBe('plain body');
  });

  it('synthesizes empty string when only one part is present', () => {
    const htmlOnly = extractMessageBodies({
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: b64url('<b>hi</b>') },
        },
      ],
    });
    expect(htmlOnly.html).toBe('<b>hi</b>');
    expect(htmlOnly.text).toBe('');

    const textOnly = extractMessageBodies({
      mimeType: 'text/plain',
      body: { data: b64url('just text') },
    });
    expect(textOnly.text).toBe('just text');
    expect(textOnly.html).toBe('');
  });

  it('recurses into nested multipart payloads', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: b64url('nested plain') },
            },
            {
              mimeType: 'text/html',
              body: { data: b64url('<em>nested html</em>') },
            },
          ],
        },
        {
          mimeType: 'application/pdf',
          body: { attachmentId: 'att-1' },
        },
      ],
    };
    const out = extractMessageBodies(payload);
    expect(out.html).toBe('<em>nested html</em>');
    expect(out.text).toBe('nested plain');
  });

  it('returns empty strings when payload has no decodable bodies', () => {
    expect(extractMessageBodies(null)).toEqual({ html: '', text: '' });
    expect(extractMessageBodies({})).toEqual({ html: '', text: '' });
    expect(extractMessageBodies({ parts: [{ mimeType: 'application/pdf' }] })).toEqual({
      html: '',
      text: '',
    });
  });
});
