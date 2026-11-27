/**
 * What counts as a product barcode, and the one spelling we look it up under.
 *
 * A camera read is a guess. A blurred EAN/UPC regularly decodes to the wrong
 * digits, and a wrong number is worse than no number: it looks up a different
 * product, or nothing, and the person is told their food "isn't in the
 * databases". So a read is only believed when it is a GS1 product number with
 * a correct check digit. Everything else is dropped and the camera keeps going.
 *
 * Typed numbers do NOT come through here. A person who typed eleven digits
 * meant them; the manual path keeps its looser 8–14 digit rule.
 */

/** GS1 mod-10: is the last digit the check digit of the ones before it? */
export const hasValidCheckDigit = (digits) => {
  if (typeof digits !== 'string' || !/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  // Walk the body right to left: the digit next to the check digit weighs 3.
  for (let i = digits.length - 2, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += (digits.charCodeAt(i) - 48) * weight;
  }
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(digits.length - 1) - 48;
};

/**
 * UPC-E (the short code on small packs: number system, six digits, check
 * digit) written out as the 12-digit UPC-A the product is registered under.
 * Returns null when it is not a UPC-E.
 */
export const expandUpcE = (code) => {
  if (typeof code !== 'string' || !/^[01]\d{7}$/.test(code)) return null;
  const system = code[0];
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const check = code[7];
  let body;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${system}${body}${check}`;
};

const isUpcE = (format) => /^upc[\s_-]?e$/i.test(String(format || ''));

/**
 * A raw read -> the number to look up, or null if it should be ignored.
 *
 * The two decoders spell the same pack differently: Android's built-in one
 * gives a US pack as 12 digits (`upc_a`) and a short code as 8 (`upc_e`);
 * zxing-cpp gives both as 13 digits with a leading zero. Both are folded to
 * the 12-digit UPC-A here, which is what the old scanner sent and so what any
 * food already saved with a barcode is stored under.
 */
export const normalizeProductCode = (raw, format) => {
  const code = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(code)) return null;

  if (code.length === 8) {
    if (isUpcE(format)) {
      const expanded = expandUpcE(code);
      return expanded && hasValidCheckDigit(expanded) ? expanded : null;
    }
    return hasValidCheckDigit(code) ? code : null;
  }

  if (code.length === 12 || code.length === 14) {
    return hasValidCheckDigit(code) ? code : null;
  }

  if (code.length === 13) {
    if (!hasValidCheckDigit(code)) return null;
    // An EAN-13 that starts with 0 is a UPC-A with the zero written in.
    return code[0] === '0' ? code.slice(1) : code;
  }

  return null;
};
