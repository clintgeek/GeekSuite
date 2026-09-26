/**
 * Identifier masking (DOCS/THINGGEEK_PLAN.md, the privacy rule): a serial,
 * VIN, hull or registration number is on screen only when someone asks to
 * see it. Masked, it keeps its last four characters so a person can still
 * tell two rifles apart: "••••1234".
 */
export const MASK_DOT = '•';

export function maskIdentifier(value) {
  const s = value === null || value === undefined ? '' : String(value).trim();
  if (!s) return '';
  if (s.length <= 4) return MASK_DOT.repeat(4);
  return `${MASK_DOT.repeat(4)}${s.slice(-4)}`;
}

/** Whether a stored attribute value counts as "recorded". */
export function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'object' && 'amount' in value) return value.amount !== null && value.amount !== undefined;
  return true;
}
