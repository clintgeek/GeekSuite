import { describe, it, expect } from 'vitest';
import { usAmount, formatServing, usLogUnits, convertAmount } from '../units.js';

describe('US food amounts', () => {
  it('grams read as ounces, and pounds from a pound up', () => {
    expect(formatServing(100, 'g')).toBe('3.5 oz');
    expect(formatServing(28, 'grams')).toBe('1 oz');
    expect(formatServing(1, 'g')).toBe('0.04 oz');
    expect(formatServing(1, 'kg')).toBe('2.2 lb');
  });

  it('millilitres read as cups, fl oz, tbsp or tsp by size', () => {
    expect(formatServing(240, 'ml')).toBe('1 cup');
    expect(formatServing(100, 'ml')).toBe('3.4 fl oz');
    expect(formatServing(15, 'ml')).toBe('1 tbsp');
    expect(formatServing(5, 'ml')).toBe('1 tsp');
  });

  it('US units and words pass through', () => {
    expect(usAmount(2, 'slice')).toEqual({ size: 2, unit: 'slice' });
    expect(formatServing(1, 'cup')).toBe('1 cup');
    expect(formatServing(null, 'g')).toBeNull();
  });

  it('offers oz for a weighed food and fl oz/cup for a poured one', () => {
    expect(usLogUnits({ size: 100, unit: 'g' })).toEqual(['oz']);
    expect(usLogUnits({ size: 240, unit: 'ml' })).toEqual(['fl oz', 'cup']);
    expect(usLogUnits({ size: 1, unit: 'slice' })).toEqual([]);
    expect(usLogUnits({ unit: 'g' })).toEqual([]);
  });

  it('6 oz of a 100 g serving is 1.7 servings, and back', () => {
    const serving = { size: 100, unit: 'g' };
    expect(convertAmount(6, 'oz', 'serving', serving)).toBeCloseTo(1.701, 3);
    expect(convertAmount(1, 'serving', 'oz', serving)).toBeCloseTo(3.527, 3);
  });
});
