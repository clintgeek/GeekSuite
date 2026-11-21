// Runs in America/Chicago (vitest.config.js).
import { describe, expect, it } from 'vitest';
import { describeReading, expandWeekdays, newClientId, readTask, transcriptToText } from '../../lib/capture.js';
import { describeWeather, fetchWeather, HOME } from '../../lib/weather.js';

// Friday 20 November 2026, 9am Central.
const NOW = new Date(2026, 10, 20, 9, 0, 0);
const TODAY = '2026-11-20';

describe('readTask', () => {
  it('reads the spec’s example: "call vet fri 2pm" is next Friday at 2pm', () => {
    const reading = readTask('call vet fri 2pm', TODAY, NOW);
    expect(reading.input.content).toBe('call vet');
    expect(reading.dayKey).toBe('2026-11-27');
    expect(reading.timed).toBe(true);
    expect(reading.input.hasDueTime).toBe(true);
    expect(new Date(reading.input.dueDate).getHours()).toBe(14);
    expect(typeof reading.input.dueDate).toBe('string');
  });

  it('dates a task with no date to the day on screen, not to today', () => {
    expect(readTask('buy feed', TODAY, NOW).input).toMatchObject({ content: 'buy feed', dueDate: TODAY, hasDueTime: false });
    const onTuesday = readTask('buy feed', '2026-11-24', NOW);
    expect(onTuesday.input.dueDate).toBe('2026-11-24');
    expect(onTuesday.dayKey).toBe('2026-11-24');
  });

  it('reads "tomorrow" from the day on screen', () => {
    expect(readTask('pick up meds tomorrow', '2026-11-24', NOW).dayKey).toBe('2026-11-25');
  });

  it('carries priority and tags through', () => {
    const reading = readTask('dinner /tomorrow 6pm !high #home', TODAY, NOW);
    expect(reading.input).toMatchObject({ content: 'dinner', priority: 1, tags: ['home'], hasDueTime: true });
    expect(reading.dayKey).toBe('2026-11-21');
    // 6pm Central is exactly UTC midnight; the grammar nudges it off that instant.
    expect(reading.input.dueDate).toBe('2026-11-22T00:00:01.000Z');
  });

  it('never rewrites a word that only looks like a weekday', () => {
    // "sat", "sun" and "wed" are also words: they are a day only beside a time or after on/by/next.
    expect(readTask('sat with mom at the clinic', TODAY, NOW).input.content).toBe('sat with mom at the clinic');
    expect(readTask('sat with mom at the clinic', TODAY, NOW).dayKey).toBe(TODAY);
    expect(readTask('fix the bench where we sat', TODAY, NOW).input.content).toBe('fix the bench where we sat');
    expect(readTask('send card they wed', TODAY, NOW).input.content).toBe('send card they wed');
  });

  it('reads an ambiguous abbreviation as a day when the words around it say so', () => {
    expect(readTask('mow lawn sat 9am', TODAY, NOW)).toMatchObject({ dayKey: '2026-11-21', timed: true });
    expect(readTask('mow lawn sat 9am', TODAY, NOW).input.content).toBe('mow lawn');
    expect(readTask('call mom on sun', TODAY, NOW).dayKey).toBe('2026-11-22');
  });

  it('answers no input for blank text', () => {
    expect(readTask('   ', TODAY, NOW).input).toBeNull();
    expect(readTask('', TODAY, NOW).input).toBeNull();
  });
});

describe('expandWeekdays', () => {
  it('spells out an abbreviation at either end', () => {
    expect(expandWeekdays('call vet fri 2pm')).toBe('call vet friday 2pm');
    expect(expandWeekdays('Thurs. dentist')).toBe('thursday dentist');
    expect(expandWeekdays('sat with mom')).toBeNull();
    expect(expandWeekdays('mow lawn sat 9am')).toBe('mow lawn saturday 9am');
  });

  it('leaves the middle of a long line alone, and returns null when nothing changed', () => {
    expect(expandWeekdays('one two three four five sat six seven eight nine ten')).toBeNull();
    expect(expandWeekdays('buy feed')).toBeNull();
  });
});

describe('describeReading', () => {
  it('says the day first, then the time and the rest', () => {
    const parts = describeReading(readTask('call vet fri 2pm !high #animals', TODAY, NOW), NOW, 'en-US');
    expect(parts).toEqual(['Fri, Nov 27', '2:00 PM', 'High priority', '#animals']);
  });

  it('is empty when there is nothing to create', () => {
    expect(describeReading(readTask('', TODAY, NOW), NOW)).toEqual([]);
  });
});

describe('transcriptToText', () => {
  it('drops list marks and joins circled lines into one task line', () => {
    expect(transcriptToText('* call vet fri 2pm\n- ask about the limp')).toBe('call vet fri 2pm ask about the limp');
    expect(transcriptToText('[ ] buy feed')).toBe('buy feed');
  });

  it('is empty when the transcriber found no writing', () => {
    expect(transcriptToText('[no writing]')).toBe('');
    expect(transcriptToText('[drawing: a chicken]\n')).toBe('');
    expect(transcriptToText(null)).toBe('');
  });

  it('keeps the transcriber’s "unreadable" mark so the user sees what to fix', () => {
    expect(transcriptToText('call [?] friday')).toBe('call [?] friday');
  });
});

describe('newClientId', () => {
  it('is unique, prefixed, and within the gateway’s 100 characters', () => {
    const a = newClientId();
    expect(a).toMatch(/^gd:/);
    expect(a.length).toBeLessThanOrEqual(100);
    expect(newClientId()).not.toBe(a);
  });
});

describe('weather', () => {
  const ok = (body) => ({ ok: true, json: async () => body });
  const storage = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  };

  it('names WMO codes', () => {
    expect(describeWeather(0)).toBe('Clear');
    expect(describeWeather(63)).toBe('Rain');
    expect(describeWeather(96)).toBe('Thunderstorm');
    expect(describeWeather(undefined)).toBe('');
  });

  it('reads the forecast for where the tablet is', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes('ipapi')) return ok({ latitude: 34.5, longitude: -92.5, city: 'Benton', region: 'Arkansas' });
      return ok({ current: { temperature_2m: 63.6, weather_code: 2 }, daily: { temperature_2m_max: [70.2], temperature_2m_min: [47.9] } });
    };
    const weather = await fetchWeather({ fetchImpl, storage: storage() });
    expect(weather).toEqual({ temperature: 64, high: 70, low: 48, description: 'Partly cloudy', place: 'Benton, Arkansas' });
    expect(calls[1]).toContain('latitude=34.5');
  });

  it('falls back to the house when the location lookup fails', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes('ipapi')) throw new Error('blocked');
      return ok({ current: { temperature_2m: 50, weather_code: 0 }, daily: {} });
    };
    const weather = await fetchWeather({ fetchImpl, storage: storage() });
    expect(weather.place).toBe(HOME.place);
    expect(weather.high).toBeNull();
    expect(calls[1]).toContain(`latitude=${HOME.latitude}`);
  });

  it('answers null, never throws, when the forecast cannot be read', async () => {
    expect(await fetchWeather({ fetchImpl: async () => ({ ok: false, status: 503 }), storage: storage() })).toBeNull();
    expect(await fetchWeather({ fetchImpl: async () => { throw new Error('offline'); }, storage: storage() })).toBeNull();
  });
});
