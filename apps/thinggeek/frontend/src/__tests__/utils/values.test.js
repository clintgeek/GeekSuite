import { describe, expect, it } from 'vitest';
import { hasValue, maskIdentifier } from '../../utils/identifiers';
import { formatMoney, moneyAmount, parseMoneyInput } from '../../utils/money';
import { buildAttributePatch, buildAttributes, formatAttribute, formToAttribute, makeModel, safeHref } from '../../utils/attributes';

describe('identifier masking', () => {
  it('keeps the last four', () => {
    expect(maskIdentifier('ABC1234567')).toBe('••••4567');
    expect(maskIdentifier('  1FTFW1E50MFA12345 ')).toBe('••••2345');
  });
  it('fully masks short values and blanks', () => {
    expect(maskIdentifier('1234')).toBe('••••');
    expect(maskIdentifier('12')).toBe('••••');
    expect(maskIdentifier('')).toBe('');
    expect(maskIdentifier(null)).toBe('');
  });
  it('hasValue', () => {
    expect(hasValue('  ')).toBe(false);
    expect(hasValue(0)).toBe(true);
    expect(hasValue({ amount: null })).toBe(false);
    expect(hasValue({ amount: 0 })).toBe(true);
  });
});

describe('money', () => {
  it('formats whole dollars and cents', () => {
    expect(formatMoney(1250)).toBe('$1,250');
    expect(formatMoney(1249.99)).toBe('$1,249.99');
    expect(formatMoney(null)).toBe('');
    expect(formatMoney({ amount: 18500 })).toBe('$18,500');
  });
  it('reads amounts and form text', () => {
    expect(moneyAmount({ amount: '12' })).toBe(12);
    expect(moneyAmount('')).toBeNull();
    expect(parseMoneyInput('$1,249.999')).toBe(1250);
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

const F = (kind, over = {}) => ({ key: 'k', label: 'K', kind, unit: null, choices: [], ...over });

describe('attributes by kind', () => {
  it('formatAttribute', () => {
    expect(formatAttribute(F('number', { unit: 'ft' }), 18)).toBe('18 ft');
    expect(formatAttribute(F('number'), 12345.678)).toBe('12,345.68');
    expect(formatAttribute(F('money'), { amount: 900, currency: 'USD' })).toBe('$900');
    expect(formatAttribute(F('date'), '2026-03-01T00:00:00.000Z')).toBe('Mar 1, 2026');
    expect(formatAttribute(F('boolean'), true)).toBe('Yes');
    expect(formatAttribute(F('boolean'), false)).toBe('No');
    expect(formatAttribute(F('text'), '')).toBe('');
  });

  it('formToAttribute', () => {
    expect(formToAttribute(F('number'), '1,200')).toBe(1200);
    expect(formToAttribute(F('number'), 'x')).toBeUndefined();
    expect(formToAttribute(F('money'), '$900')).toEqual({ amount: 900, currency: 'USD' });
    expect(formToAttribute(F('date'), '2026-03-01')).toBe('2026-03-01T00:00:00.000Z');
    expect(formToAttribute(F('boolean'), false)).toBe(false);
    expect(formToAttribute(F('boolean'), '')).toBeUndefined();
    expect(formToAttribute(F('text'), '  Ruger ')).toBe('Ruger');
    expect(formToAttribute(F('text'), '   ')).toBeUndefined();
  });

  it('buildAttributes omits blanks (create)', () => {
    const fields = [F('text', { key: 'a' }), F('number', { key: 'b' })];
    expect(buildAttributes(fields, { a: 'x', b: '' })).toEqual({ a: 'x' });
  });

  it('buildAttributePatch sends only changes, null for a cleared key', () => {
    const fields = [F('text', { key: 'make' }), F('text', { key: 'serial' }), F('number', { key: 'year' }), F('money', { key: 'msrp' }), F('date', { key: 'bought' })];
    const original = { make: 'Ruger', serial: 'XYZ9876543', year: 2019, msrp: { amount: 300, currency: 'USD' }, bought: '2020-01-02T00:00:00.000Z' };
    const form = { make: 'Ruger', serial: '', year: '2020', msrp: '300', bought: '2020-01-02' };
    expect(buildAttributePatch(fields, form, original)).toEqual({ serial: null, year: 2020 });
  });

  it('makeModel and safe links', () => {
    expect(makeModel([{ key: 'brand', value: 'Garmin' }, { key: 'model', value: 'Striker 4' }])).toBe('Garmin Striker 4');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
  });
});
