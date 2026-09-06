import { describe, it, expect } from 'vitest';
import {
  coverCandidateKey,
  formatCalendarDate,
  formatDate,
  publishedYear,
} from '../../views/detail/bookFacts';

/**
 * Pins two going-over 2026-09-05 fixes.
 *
 * **The calendar/instant split.** The gateway stores `publishedDate` through
 * `historicalDateField` → `toUtcMidnight` — a calendar day pinned to UTC
 * midnight — while `dateAdded`/`dateFinished`/`dateStarted` go through
 * `instantField` and are real moments. Rendering the first with a plain
 * local `toLocaleDateString()`/`getFullYear()` moved it back a day everywhere
 * west of UTC: on this box (America/Chicago) *Dune*'s `1965-01-01` showed as
 * "12/31/1964" in Details and "1964" in the hero.
 *
 * **One cover key.** `App.jsx` (which tracks the candidate being applied) and
 * `CoverTools` (which renders the grid) computed the key separately and
 * disagreed for Google Books candidates with no string `id` — CoverTools
 * produced the constant `"cover-"`, so every such candidate shared a React
 * key and the applying spinner never lit.
 */

describe('formatCalendarDate — publishedDate', () => {
  it('reads a UTC-midnight calendar date in UTC, not local time', () => {
    // The exact value the gateway stores for a 1965-01-01 publication.
    expect(formatCalendarDate('1965-01-01T00:00:00.000Z')).toBe(
      new Date('1965-01-01T00:00:00.000Z').toLocaleDateString(undefined, {
        timeZone: 'UTC',
      })
    );
  });

  it('does not slip a day west of UTC (the bug), whatever the runner TZ', () => {
    const iso = '1965-01-01T00:00:00.000Z';
    const d = new Date(iso);

    // The bug, demonstrated with an explicit timezone so the assertion holds
    // regardless of what TZ the test runner happens to be in: read in
    // Chicago, a UTC-midnight calendar date is the previous day.
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' }).format(d))
      .toBe('12/31/1964');
    // Read in UTC — which is what the fix does — it is the day it says it is.
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(d))
      .toBe('1/1/1965');

    expect(formatCalendarDate(iso)).toBe(
      d.toLocaleDateString(undefined, { timeZone: 'UTC' })
    );
  });

  it('returns null for a missing or unparseable value', () => {
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate('')).toBeNull();
    expect(formatCalendarDate('not a date')).toBeNull();
  });
});

describe('publishedYear', () => {
  it('reads the year in UTC', () => {
    expect(publishedYear('1965-01-01T00:00:00.000Z')).toBe('1965');
    expect(publishedYear('2000-01-01T00:00:00.000Z')).toBe('2000');
  });

  it('is the UTC year even where the local year differs', () => {
    const iso = '2000-01-01T00:00:00.000Z';
    const d = new Date(iso);
    // In Chicago this instant is 1999 — the hero used to print that.
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(d))
      .toBe('1999');
    expect(publishedYear(iso)).toBe('2000');
    expect(publishedYear(iso)).toBe(String(d.getUTCFullYear()));
  });

  it('returns null for a missing or unparseable value', () => {
    expect(publishedYear(undefined)).toBeNull();
    expect(publishedYear('nope')).toBeNull();
  });
});

describe('formatDate — the instants stay local', () => {
  it('formats an instant in the viewer timezone', () => {
    const iso = '2026-03-05T18:30:00.000Z';
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });

  it('returns null for a missing or unparseable value', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate('nope')).toBeNull();
  });
});

describe('coverCandidateKey', () => {
  it('prefers a string id when the provider gives one', () => {
    expect(coverCandidateKey({ id: 'googlebooks-abc', source: 'googlebooks' })).toBe(
      'googlebooks-abc'
    );
  });

  it('keys an OpenLibrary candidate by its numeric coverId', () => {
    expect(coverCandidateKey({ id: 240727, source: 'openlibrary', coverId: 240727 })).toBe(
      'cover-240727'
    );
  });

  it('keys a Google Books candidate without a string id by its URL', () => {
    // The bug: CoverTools produced the constant "cover-" for exactly this
    // shape, so two candidates collided on one React key.
    const a = { source: 'googlebooks', coverUrl: 'https://books.google.com/a.jpg' };
    const b = { source: 'googlebooks', coverUrl: 'https://books.google.com/b.jpg' };
    expect(coverCandidateKey(a)).toBe('cover-https://books.google.com/a.jpg');
    expect(coverCandidateKey(a)).not.toBe(coverCandidateKey(b));
  });

  it('falls back through largeUrl and thumbUrl', () => {
    expect(coverCandidateKey({ source: 'googlebooks', thumbUrl: 't.jpg' })).toBe('cover-t.jpg');
    expect(
      coverCandidateKey({ source: 'googlebooks', largeUrl: 'l.jpg', thumbUrl: 't.jpg' })
    ).toBe('cover-l.jpg');
  });

  it('is stable for the same candidate', () => {
    const c = { source: 'openlibrary', coverId: 5 };
    expect(coverCandidateKey(c)).toBe(coverCandidateKey(c));
  });

  it('tolerates a missing candidate', () => {
    expect(coverCandidateKey(null)).toBe('cover-');
  });
});
