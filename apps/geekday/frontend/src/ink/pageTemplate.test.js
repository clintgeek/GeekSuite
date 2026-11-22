import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PAPER_SHEET_TEMPLATES, PAPER_TEMPLATE_META_KEY } from '@geeksuite/ui';
import {
  RULED, NO_SHEET, PAPER_CHOICES, SHEET_CHOICES, TEMPLATE_PREF_KEY, SHEET_PREF_KEY, isPaper, paperChoiceFor, sheetChoiceFor,
  readDevicePaper, writeDevicePaper, readDeviceSheet, writeDeviceSheet, storedTemplate, resolvePaper, withPaper, paperToKeep,
  previewSheet,
} from './pageTemplate';

describe('the day page\'s paper and its template', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('papers are Ruled, Dot grid and Grid; templates are the five layouts; neither list holds the other\'s', () => {
    expect(PAPER_CHOICES.map((c) => c.id)).toEqual(['none', 'dots', 'grid']);
    expect(PAPER_CHOICES[0].label).toBe('Ruled');
    expect(SHEET_CHOICES.map((c) => c.id)).toEqual(['none', 'schedule', 'top3', 'meeting', 'oneonone', 'cornell']);
    expect(SHEET_CHOICES[0].label).toBe('No template');
    expect(SHEET_CHOICES.slice(1).map((c) => c.label)).toEqual(PAPER_SHEET_TEMPLATES.map((t) => t.label));
    expect(isPaper('grid')).toBe(true);
    expect(isPaper('schedule')).toBe(false);
    expect(paperChoiceFor('dots').label).toBe('Dot grid');
    expect(paperChoiceFor('meeting').id).toBe(RULED);
    expect(sheetChoiceFor('meeting').label).toBe('Meeting');
    expect(sheetChoiceFor('who-knows').id).toBe(NO_SHEET);
  });

  it('reads the id stored with the page exactly as stored, from the shared meta key', () => {
    expect(PAPER_TEMPLATE_META_KEY).toBe('paperTemplate');
    expect(storedTemplate({ paperTemplate: 'grid', paperColor: 'warm' })).toBe('grid');
    expect(storedTemplate({ paperTemplate: 'schedule' })).toBe('schedule');
    expect(storedTemplate({ paperTemplate: '' })).toBe(null);
    expect(storedTemplate({ paperTemplate: 7 })).toBe(null);
    expect(storedTemplate({ paperColor: 'warm' })).toBe(null);
    expect(storedTemplate(undefined)).toBe(null);
  });

  it('a stored paper wins; "none" is ruled on purpose', () => {
    expect(resolvePaper({ stored: 'dots', hasContent: true, deviceDefault: 'grid' })).toBe('dots');
    expect(resolvePaper({ stored: 'none', hasContent: false, deviceDefault: 'grid' })).toBe(RULED);
  });

  it.each(['schedule', 'top3', 'meeting', 'cornell', 'from-the-future'])(
    'a stored "%s" is not a paper: the page is ruled, whatever the device default',
    (stored) => {
      expect(resolvePaper({ stored, hasContent: false, deviceDefault: 'grid' })).toBe(RULED);
      expect(resolvePaper({ stored, hasContent: true, deviceDefault: 'grid' })).toBe(RULED);
    },
  );

  it('with nothing stored: a blank day takes the device\'s paper, a page with ink or a sheet stays ruled', () => {
    expect(resolvePaper({ stored: null, hasContent: false, deviceDefault: 'dots' })).toBe('dots');
    expect(resolvePaper({ stored: null, hasContent: true, deviceDefault: 'dots' })).toBe(RULED);
    expect(resolvePaper({ stored: null, hasContent: false, deviceDefault: 'schedule' })).toBe(RULED);
    expect(resolvePaper()).toBe(RULED);
  });

  it('writes a paper into meta beside whatever else is there; only ever a paper', () => {
    expect(withPaper({ paperColor: 'warm', paperPattern: 'lined' }, 'grid')).toEqual({ paperColor: 'warm', paperPattern: 'lined', paperTemplate: 'grid' });
    expect(withPaper(undefined, RULED)).toEqual({ paperTemplate: 'none' });
    expect(withPaper({ paperTemplate: 'schedule' }, 'dots')).toEqual({ paperTemplate: 'dots' });
    expect(withPaper({}, 'meeting')).toEqual({ paperTemplate: 'none' }); // a layout is never written as a paper
    expect(withPaper({}, 'garbage')).toEqual({ paperTemplate: 'none' });
    const meta = { paperColor: 'warm' };
    withPaper(meta, 'dots');
    expect(meta).toEqual({ paperColor: 'warm' });
  });

  it('the first content keeps a paper the page never chose; never ruled, never over a stored id', () => {
    expect(paperToKeep({ stored: null, shown: 'dots' })).toBe('dots');
    expect(paperToKeep({ stored: null, shown: RULED })).toBe(null);
    expect(paperToKeep({ stored: 'schedule', shown: RULED })).toBe(null);
    expect(paperToKeep({ stored: 'grid', shown: 'grid' })).toBe(null);
  });

  it('the template preview: only on a day with no ink, no sheet and no note, until "No template" is said', () => {
    const blank = { hasInk: false, sheet: null, hasBody: false, dismissed: false, deviceDefault: 'meeting' };
    expect(previewSheet(blank)).toBe('meeting');
    expect(previewSheet({ ...blank, hasInk: true })).toBe(null);
    expect(previewSheet({ ...blank, sheet: 'cornell' })).toBe(null);
    expect(previewSheet({ ...blank, hasBody: true })).toBe(null);
    expect(previewSheet({ ...blank, dismissed: true })).toBe(null);
    expect(previewSheet({ ...blank, deviceDefault: NO_SHEET })).toBe(null);
    expect(previewSheet({ ...blank, deviceDefault: 'grid' })).toBe(null); // a paper is not a template
    expect(previewSheet()).toBe(null);
  });

  it('remembers this device\'s paper under geekday:pageTemplate and its template under geekday:pageSheet', () => {
    expect(TEMPLATE_PREF_KEY).toBe('geekday:pageTemplate');
    expect(SHEET_PREF_KEY).toBe('geekday:pageSheet');
    expect(readDevicePaper()).toBe(RULED);
    expect(readDeviceSheet()).toBe(NO_SHEET);
    writeDevicePaper('grid');
    writeDeviceSheet('cornell');
    expect(localStorage.getItem('geekday:pageTemplate')).toBe('grid');
    expect(localStorage.getItem('geekday:pageSheet')).toBe('cornell');
    expect(readDevicePaper()).toBe('grid');
    expect(readDeviceSheet()).toBe('cornell');
    writeDevicePaper('cornell'); // refused: a layout is not a paper
    writeDeviceSheet('grid'); // refused: a paper is not a template
    expect(readDevicePaper()).toBe('grid');
    expect(readDeviceSheet()).toBe('cornell');
    writeDevicePaper(RULED);
    writeDeviceSheet(NO_SHEET);
    expect(localStorage.getItem('geekday:pageTemplate')).toBe(null);
    expect(readDevicePaper()).toBe(RULED);
    expect(readDeviceSheet()).toBe(NO_SHEET);
    localStorage.setItem('geekday:pageSheet', 'removed-template');
    expect(readDeviceSheet()).toBe(NO_SHEET);
  });

  it('a layout left under the old key by the build of 2026-11-20 is this device\'s template default, with ruled paper', () => {
    localStorage.setItem('geekday:pageTemplate', 'schedule');
    expect(readDevicePaper()).toBe(RULED);
    expect(readDeviceSheet()).toBe('schedule');
    // Choosing a paper default does not lose it…
    writeDevicePaper('dots');
    expect(readDevicePaper()).toBe('dots');
    expect(readDeviceSheet()).toBe('schedule');
    // …and turning the template default off sticks.
    localStorage.clear();
    localStorage.setItem('geekday:pageTemplate', 'meeting');
    writeDeviceSheet(NO_SHEET);
    expect(readDeviceSheet()).toBe(NO_SHEET);
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readDevicePaper()).toBe(RULED);
    expect(readDeviceSheet()).toBe(NO_SHEET);
    expect(() => writeDevicePaper('grid')).not.toThrow();
    expect(() => writeDeviceSheet('meeting')).not.toThrow();
  });
});
