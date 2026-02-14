// Simple unit conversions for frontend usage
// Canonical base: grams for mass, milliliters for volume

export const MASS_UNITS = {
  g: { label: 'g', factor: 1 },
  oz: { label: 'oz', factor: 28.349523125 },
  lb: { label: 'lb', factor: 453.59237 },
};

export const VOLUME_UNITS = {
  ml: { label: 'ml', factor: 1 },
  floz: { label: 'fl oz', factor: 29.5735295625 },
  cup: { label: 'cup', factor: 236.5882365 },
};

export function toBase(value, unit, kind = 'mass') {
  const map = kind === 'volume' ? VOLUME_UNITS : MASS_UNITS;
  const meta = map[unit];
  if (!meta) return Number(value) || 0;
  return (Number(value) || 0) * meta.factor;
}

export function fromBase(baseValue, unit, kind = 'mass') {
  const map = kind === 'volume' ? VOLUME_UNITS : MASS_UNITS;
  const meta = map[unit];
  if (!meta) return Number(baseValue) || 0;
  return (Number(baseValue) || 0) / meta.factor;
}

export function formatNumber(n, digits = 1) {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  return v.toFixed(digits);
}


