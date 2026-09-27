/**
 * The Signal Box's readings — every lamp and needle, decided from real data.
 * Pure functions, so no dial is rendered to check a number.
 */
import { describe, it, expect } from 'vitest';
import {
  LAMP,
  SLOW_MS,
  annunciate,
  catalogReading,
  gaugeFraction,
  gaugeZone,
  healthDetail,
  healthLamp,
  lampTransitions,
  lineStatus,
  needleAngle,
  providerLamp,
  spendReading,
  trafficReading,
  formatDollars,
  dayLabel,
} from '../../signalbox/readings';
import { konamiStep, KONAMI } from '../../signalbox/LampTest';

describe('health lamps', () => {
  it('is "checking", not a fault, before anything is measured', () => {
    expect(healthLamp(undefined)).toBe(LAMP.UNKNOWN);
    expect(healthDetail(undefined)).toBe('checking...');
  });

  it('is a fault when offline, a caution when slow, clear otherwise', () => {
    expect(healthLamp({ online: false })).toBe(LAMP.FAULT);
    expect(healthLamp({ online: true, latency: SLOW_MS + 1 })).toBe(LAMP.WARN);
    expect(healthLamp({ online: true, latency: 42 })).toBe(LAMP.OK);
    expect(healthDetail({ online: true, latency: 42 })).toBe('42ms');
    expect(healthDetail({ online: false })).toBe('offline');
  });
});

describe('provider lamps', () => {
  const byProvider = { groq: { alive: 6, cooling: 1 }, cerebras: { alive: 0, cooling: 5 }, cohere: { alive: 0, cooling: 0 } };

  it('reads alive, cooling and idle from the catalog counts', () => {
    expect(providerLamp('groq', byProvider)).toEqual({ state: LAMP.OK, word: '6 alive' });
    expect(providerLamp('cerebras', byProvider)).toEqual({ state: LAMP.WARN, word: '5 cooling' });
    expect(providerLamp('cohere', byProvider)).toEqual({ state: LAMP.OFF, word: 'idle' });
  });

  it('is down whenever the attention list says so, whatever the counts', () => {
    const attention = [{ kind: 'provider_listing_failed', provider: 'groq', severity: 'warn' }];
    expect(providerLamp('groq', byProvider, attention)).toEqual({ state: LAMP.FAULT, word: 'down' });
    expect(providerLamp('cerebras', byProvider, attention).state).toBe(LAMP.WARN);
  });
});

describe('gauges', () => {
  it('has no fraction without an honest maximum', () => {
    expect(gaugeFraction(3, 0)).toBeNull();
    expect(gaugeFraction(3, null)).toBeNull();
    expect(gaugeFraction(5, 10)).toBe(0.5);
    expect(gaugeFraction(50, 10)).toBe(1);
  });

  it('maps a fraction onto the 180° dial', () => {
    expect(needleAngle(0)).toBe(-90);
    expect(needleAngle(0.5)).toBe(0);
    expect(needleAngle(1)).toBe(90);
    expect(needleAngle(null)).toBe(-90);
  });

  it('zones high-is-bad and high-is-good gauges', () => {
    expect(gaugeZone(0.5)).toBe(LAMP.OK);
    expect(gaugeZone(0.7)).toBe(LAMP.WARN);
    expect(gaugeZone(0.95)).toBe(LAMP.FAULT);
    expect(gaugeZone(0.9, { warn: 0.5, fault: 0.75, invert: true })).toBe(LAMP.OK);
    expect(gaugeZone(0.4, { warn: 0.5, fault: 0.75, invert: true })).toBe(LAMP.WARN);
    expect(gaugeZone(0.2, { warn: 0.5, fault: 0.75, invert: true })).toBe(LAMP.FAULT);
    expect(gaugeZone(null)).toBe(LAMP.OFF);
  });

  it('reads paid spend today against the governor’s daily cap', () => {
    const r = spendReading({ todayUsd: 0.2, capPerDayUsd: 0.25 });
    expect(r.value).toBe(0.2);
    expect(r.max).toBe(0.25);
    expect(r.fraction).toBeCloseTo(0.8);
    expect(r.zone).toBe(LAMP.WARN);
    expect(spendReading(null)).toBeNull();
    expect(spendReading({ todayUsd: 0.1, capPerDayUsd: 0 }).fraction).toBeNull();
  });

  it('reads today’s calls against the busiest day in the window, never as an alarm', () => {
    const r = trafficReading({ days: [{ day: '2026-09-05', calls: 517 }, { day: '2026-09-06', calls: 96 }, { day: '2026-09-07', calls: 264 }] });
    expect(r).toMatchObject({ value: 264, max: 517, peakDay: '2026-09-05', zone: LAMP.OK });
    expect(r.fraction).toBeCloseTo(264 / 517);
    expect(trafficReading({ days: [{ day: 'x', calls: 0 }] })).toMatchObject({ value: 0, max: null, fraction: 0 });
    expect(trafficReading(null)).toBeNull();
  });

  it('reads the catalog’s last probe as alive out of probed', () => {
    const r = catalogReading({ lastProbe: { alive: 14, dead: 6 } });
    expect(r).toMatchObject({ value: 14, max: 20, zone: LAMP.OK });
    expect(catalogReading({ lastProbe: { alive: 3, dead: 17 } }).zone).toBe(LAMP.FAULT);
    expect(catalogReading({})).toBeNull();
  });
});

describe('the annunciator', () => {
  it('lights one tile per kind on the attention list, with its count and worst severity', () => {
    const tiles = annunciate([
      { kind: 'unrouted_app', severity: 'info' },
      { kind: 'unrouted_app', severity: 'warn' },
      { kind: 'discovery_stale', severity: 'warn' },
    ]);
    const byKind = Object.fromEntries(tiles.map((t) => [t.kind, t]));
    expect(byKind.unrouted_app).toMatchObject({ lit: true, count: 2, severity: 'warn' });
    expect(byKind.discovery_stale).toMatchObject({ lit: true, count: 1 });
    expect(byKind.provider_dead).toMatchObject({ lit: false, count: 0 });
  });

  it('keeps every known tile in a fixed place and adds unknown kinds after them', () => {
    const tiles = annunciate([{ kind: 'new_thing', severity: 'info' }]);
    expect(tiles[0].kind).toBe('provider_dead');
    expect(tiles.at(-1)).toMatchObject({ kind: 'new_thing', label: 'new thing', lit: true });
  });

  it('is all dark for an empty list', () => {
    expect(annunciate([]).every((t) => !t.lit)).toBe(true);
  });
});

describe('the line status', () => {
  it('says all clear only when everything is measured and clear', () => {
    expect(lineStatus({ lamps: [LAMP.OK, LAMP.OK] }).message).toBe('all lines clear');
    expect(lineStatus({ lamps: [LAMP.OK, LAMP.UNKNOWN] }).message).toBe('reading');
  });

  it('counts faults, and cautions from slow lamps and warn items', () => {
    const s = lineStatus({ lamps: [LAMP.FAULT, LAMP.WARN, LAMP.OK], attention: [{ severity: 'warn' }, { severity: 'info' }] });
    expect(s).toMatchObject({ faults: 1, cautions: 2, message: '1 fault · 2 cautions', state: LAMP.FAULT });
  });
});

describe('the register', () => {
  it('logs a change between two measured states, never the first reading', () => {
    expect(lampTransitions({}, { MongoDB: LAMP.OK })).toEqual([]);
    expect(lampTransitions({ MongoDB: LAMP.UNKNOWN }, { MongoDB: LAMP.OK })).toEqual([]);
    expect(lampTransitions({ MongoDB: LAMP.OK }, { MongoDB: LAMP.FAULT })).toEqual([{ key: 'MongoDB', from: LAMP.OK, to: LAMP.FAULT }]);
    expect(lampTransitions({ MongoDB: LAMP.OK }, { MongoDB: LAMP.OK })).toEqual([]);
  });
});

describe('formatting', () => {
  it('keeps enough places to see a free-tier day move', () => {
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(0.0031)).toBe('$0.0031');
    expect(formatDollars(0.25)).toBe('$0.250');
    expect(formatDollars(1.7664)).toBe('$1.77');
  });

  it('labels a ledger day in UTC', () => {
    expect(dayLabel('2026-09-05')).toBe('Sat');
  });
});

describe('the Konami lamp test', () => {
  it('completes on the last key of the sequence, and only then', () => {
    let progress = 0;
    let done = false;
    for (const key of KONAMI) ({ progress, done } = konamiStep(progress, key));
    expect(done).toBe(true);
    expect(progress).toBe(0);
  });

  it('restarts on a wrong key, and a stray ArrowUp begins again', () => {
    expect(konamiStep(3, 'x')).toEqual({ progress: 0, done: false });
    expect(konamiStep(5, 'ArrowUp')).toEqual({ progress: 1, done: false });
    expect(konamiStep(8, 'B').progress).toBe(9);
  });
});
