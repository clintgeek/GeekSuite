// Food amounts in US units.
//
// Foods are stored the way their source gave them, usually metric. These
// helpers convert for display and entry only. Macros stay in grams, the way
// US labels print them (Chef, 2026-10-15).

import { MASS_UNITS, VOLUME_UNITS, canonicalUnit, amountToServings } from './recipeMath.js';

const OZ = MASS_UNITS.oz;
const LB = MASS_UNITS.lb;
const FL_OZ = VOLUME_UNITS['fl oz'];
const CUP = VOLUME_UNITS.cup;
const TBSP = VOLUME_UNITS.tbsp;
const TSP = VOLUME_UNITS.tsp;

// One decimal from 1 up; two below, so 1 g reads 0.04 oz, not 0 oz.
const tidy = (n) => {
  const one = Math.round(n * 10) / 10;
  return Math.abs(one) >= 1 ? one : Math.round(n * 100) / 100;
};

/**
 * A serving in US units: grams become oz (lb from a pound up), millilitres
 * become cups, fl oz, tbsp or tsp. US units and words like "slice" pass through.
 */
export function usAmount(size, unit) {
  const n = Number(size);
  if (!Number.isFinite(n)) return { size, unit };
  const u = canonicalUnit(unit);
  if (u === 'g' || u === 'kg') {
    const grams = n * MASS_UNITS[u];
    return grams >= LB
      ? { size: tidy(grams / LB), unit: 'lb' }
      : { size: tidy(grams / OZ), unit: 'oz' };
  }
  if (u === 'ml' || u === 'l') {
    const ml = n * VOLUME_UNITS[u];
    if (ml >= 8 * FL_OZ) return { size: tidy(ml / CUP), unit: 'cup' };
    if (ml >= FL_OZ) return { size: tidy(ml / FL_OZ), unit: 'fl oz' };
    if (ml >= TBSP) return { size: tidy(ml / TBSP), unit: 'tbsp' };
    return { size: tidy(ml / TSP), unit: 'tsp' };
  }
  return { size: tidy(n), unit };
}

/** "3.5 oz", "1 cup", "2 slice". Null when there is no size. */
export function formatServing(size, unit) {
  if (size == null || size === '' || !Number.isFinite(Number(size))) return null;
  const us = usAmount(size, unit);
  return us.unit ? `${us.size} ${us.unit}` : String(us.size);
}

/** The US weight or volume units a food can be logged in, besides servings. */
export function usLogUnits(serving) {
  const u = canonicalUnit(serving?.unit);
  if (!(Number(serving?.size) > 0)) return [];
  if (u in MASS_UNITS) return ['oz'];
  if (u in VOLUME_UNITS) return ['fl oz', 'cup'];
  return [];
}

/** How many of `toUnit` one `fromUnit` of this food is (both may be 'serving'). */
export function convertAmount(amount, fromUnit, toUnit, serving) {
  const servings = amountToServings(amount, fromUnit, serving);
  if (servings == null) return null;
  if (toUnit === 'serving') return servings;
  const perServing = amountToServings(1, toUnit, serving);
  return perServing ? servings / perServing : null;
}
