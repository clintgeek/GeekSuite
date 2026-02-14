// UnitConversionService: reusable, centralized conversions
// Canonical bases:
// - mass: grams
// - volume: milliliters
// - piece: mapped via serving map when possible

const MASS_UNITS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ounce: 28.349523125,
  oz: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};

const VOLUME_UNITS = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  tsp: 4.92892159375,
  teaspoon: 4.92892159375,
  tbsp: 14.78676478125,
  tablespoon: 14.78676478125,
  cup: 236.5882365,
  cups: 236.5882365,
  floz: 29.5735295625,
  'fl-oz': 29.5735295625,
  'fl_oz': 29.5735295625,
};

function normalizeUnit(u) {
  if (!u) return null;
  const unit = String(u).trim().toLowerCase();
  if (MASS_UNITS[unit] != null) return { kind: 'mass', unit, factor: MASS_UNITS[unit] };
  if (VOLUME_UNITS[unit] != null) return { kind: 'volume', unit, factor: VOLUME_UNITS[unit] };
  return null;
}

// Convert any mass/volume quantity to grams/ml base
function toBase(quantity, unit) {
  const meta = normalizeUnit(unit);
  if (!meta) return { value: quantity, kind: 'unknown' };
  return { value: Number(quantity) * meta.factor, kind: meta.kind };
}

// Convert from base to a target unit
function fromBase(baseValue, targetUnit) {
  const meta = normalizeUnit(targetUnit);
  if (!meta) return { value: baseValue, unit: targetUnit };
  return { value: baseValue / meta.factor, unit: targetUnit };
}

module.exports = {
  normalizeUnit,
  toBase,
  fromBase,
};


