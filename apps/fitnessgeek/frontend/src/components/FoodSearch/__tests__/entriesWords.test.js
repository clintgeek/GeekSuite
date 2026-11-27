/**
 * Review 2026-11-27, "chip oddities": "Blueberries ×0.5" read like a formula,
 * and catalog names arrive shouted ("CHOCOLATE PEANUT BUTTER protein bar").
 */
import { describe, it, expect } from 'vitest';
import { withAmount, servingWords, displayName } from '../entries.js';

describe('withAmount', () => {
  it('a whole number is still a count', () => {
    expect(withAmount('Egg', 1)).toBe('Egg');
    expect(withAmount('Egg', 2)).toBe('Egg ×2');
    expect(withAmount('Toast', '3')).toBe('Toast ×3');
  });

  it('part of a serving is said in words, never "×0.5"', () => {
    expect(withAmount('Blueberries', 0.5)).toBe('Blueberries, ½ serving');
    expect(withAmount('Rice', 1.5)).toBe('Rice, 1½ servings');
    expect(withAmount('Oil', 0.25)).toBe('Oil, ¼ serving');
    expect(withAmount('Soup', 0.33)).toBe('Soup, ⅓ serving');
    expect(withAmount('Soup', 2.4)).toBe('Soup, 2.4 servings');
    expect(withAmount('Blueberries', 0.5)).not.toMatch(/×/);
  });

  it('nothing to say for no name or no amount', () => {
    expect(withAmount('', 2)).toBe('');
    expect(withAmount('Egg', null)).toBe('Egg');
    expect(withAmount('Egg', 0)).toBe('Egg');
  });
});

describe('servingWords', () => {
  it.each([[0.5, '½ serving'], [0.75, '¾ serving'], [1, '1 serving'], [2, '2 servings'], [2.75, '2¾ servings'], [0.4, '0.4 serving']])(
    '%s → %s', (n, words) => expect(servingWords(n)).toBe(words)
  );
});

describe('displayName', () => {
  it('shouted words become title case; the rest is left alone', () => {
    expect(displayName('CHOCOLATE PEANUT BUTTER protein bar')).toBe('Chocolate Peanut Butter protein bar');
    expect(displayName('GREEK YOGURT WITH HONEY')).toBe('Greek Yogurt with Honey');
    expect(displayName('THE BIG SALAD')).toBe('The Big Salad');
  });

  it('common initials stay capitals; short words are not mistaken for them', () => {
    expect(displayName('BBQ SAUCE')).toBe('BBQ Sauce');
    expect(displayName('USDA BEEF')).toBe('USDA Beef');
    expect(displayName('EGG, LARGE')).toBe('Egg, Large');
    expect(displayName('ONE')).toBe('One');
    expect(displayName('M&M’S PEANUT')).toBe('M&M’s Peanut');
  });

  it('a name already in mixed case is untouched', () => {
    expect(displayName('Fage Total 2% Greek Yogurt, Plain Lowfat')).toBe('Fage Total 2% Greek Yogurt, Plain Lowfat');
    expect(displayName('iPhone-shaped cookie')).toBe('iPhone-shaped cookie');
  });

  it('never throws on nothing', () => {
    expect(displayName(null)).toBe('');
    expect(displayName(undefined)).toBe('');
  });
});
