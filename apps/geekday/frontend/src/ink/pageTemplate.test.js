import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PAPER_TEMPLATES, PAPER_TEMPLATE_META_KEY } from '@geeksuite/ui';
import {
  RULED, PAGE_CHOICES, TEMPLATE_PREF_KEY, readDeviceTemplate, writeDeviceTemplate, storedTemplate, resolveTemplate,
  withTemplate, templateToKeep, choiceFor,
} from './pageTemplate';

describe('page templates on the day page', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('offers Ruled, then the six shared templates in their order', () => {
    expect(PAGE_CHOICES.map((c) => c.id)).toEqual(['none', 'schedule', 'top3', 'meeting', 'cornell', 'dots', 'grid']);
    expect(PAGE_CHOICES[0].label).toBe('Ruled');
    expect(PAGE_CHOICES.slice(1)).toEqual(PAPER_TEMPLATES);
    expect(choiceFor('meeting').label).toBe('Meeting');
    expect(choiceFor('who-knows').id).toBe(RULED);
  });

  it('reads the id stored with the page exactly as stored, from the shared meta key', () => {
    expect(PAPER_TEMPLATE_META_KEY).toBe('paperTemplate');
    expect(storedTemplate({ paperTemplate: 'cornell', paperColor: 'warm' })).toBe('cornell');
    expect(storedTemplate({ paperTemplate: 'from-the-future' })).toBe('from-the-future');
    expect(storedTemplate({ paperTemplate: '' })).toBe(null);
    expect(storedTemplate({ paperTemplate: 7 })).toBe(null);
    expect(storedTemplate({ paperColor: 'warm' })).toBe(null);
    expect(storedTemplate(undefined)).toBe(null);
  });

  it('a stored template wins; "none" is ruled on purpose; an unknown id draws as ruled', () => {
    expect(resolveTemplate({ stored: 'schedule', hasInk: true, deviceDefault: 'grid' })).toBe('schedule');
    expect(resolveTemplate({ stored: 'none', hasInk: false, deviceDefault: 'grid' })).toBe(RULED);
    expect(resolveTemplate({ stored: 'from-the-future', hasInk: false, deviceDefault: 'grid' })).toBe(RULED);
  });

  it('with nothing stored: a blank day takes the device default, a written page stays ruled', () => {
    expect(resolveTemplate({ stored: null, hasInk: false, deviceDefault: 'top3' })).toBe('top3');
    expect(resolveTemplate({ stored: null, hasInk: true, deviceDefault: 'top3' })).toBe(RULED);
    expect(resolveTemplate({ stored: null, hasInk: false, deviceDefault: 'garbage' })).toBe(RULED);
    expect(resolveTemplate()).toBe(RULED);
  });

  it('writes a choice into meta beside whatever else is there', () => {
    expect(withTemplate({ paperColor: 'warm', paperPattern: 'lined' }, 'meeting')).toEqual({ paperColor: 'warm', paperPattern: 'lined', paperTemplate: 'meeting' });
    expect(withTemplate(undefined, RULED)).toEqual({ paperTemplate: 'none' });
    expect(withTemplate({ paperTemplate: 'from-the-future' }, 'grid')).toEqual({ paperTemplate: 'grid' });
    // Only a real choice is ever written.
    expect(withTemplate({}, 'garbage')).toEqual({ paperTemplate: 'none' });
    const meta = { paperColor: 'warm' };
    withTemplate(meta, 'dots');
    expect(meta).toEqual({ paperColor: 'warm' });
  });

  it('the first ink keeps a template the page never chose; never ruled, never over a stored id', () => {
    expect(templateToKeep({ stored: null, shown: 'schedule' })).toBe('schedule');
    expect(templateToKeep({ stored: null, shown: RULED })).toBe(null);
    expect(templateToKeep({ stored: 'from-the-future', shown: RULED })).toBe(null);
    expect(templateToKeep({ stored: 'grid', shown: 'grid' })).toBe(null);
  });

  it('remembers this device\'s page for new days under geekday:pageTemplate', () => {
    expect(TEMPLATE_PREF_KEY).toBe('geekday:pageTemplate');
    expect(readDeviceTemplate()).toBe(RULED);
    writeDeviceTemplate('cornell');
    expect(localStorage.getItem('geekday:pageTemplate')).toBe('cornell');
    expect(readDeviceTemplate()).toBe('cornell');
    writeDeviceTemplate('garbage'); // refused: the default stays
    expect(readDeviceTemplate()).toBe('cornell');
    writeDeviceTemplate(RULED);
    expect(localStorage.getItem('geekday:pageTemplate')).toBe(null);
    expect(readDeviceTemplate()).toBe(RULED);
    localStorage.setItem('geekday:pageTemplate', 'removed-template');
    expect(readDeviceTemplate()).toBe(RULED);
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readDeviceTemplate()).toBe(RULED);
    expect(() => writeDeviceTemplate('grid')).not.toThrow();
    expect(() => writeDeviceTemplate(RULED)).not.toThrow();
  });
});
