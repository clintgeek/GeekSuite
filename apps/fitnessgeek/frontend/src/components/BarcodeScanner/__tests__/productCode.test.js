import { describe, test, expect } from 'vitest';
import { hasValidCheckDigit, expandUpcE, normalizeProductCode } from '../productCode.js';

// Real pack numbers, so the arithmetic is checked against the world and not
// against itself: Wrigley's gum (UPC-A), a Faber-Castell pen (EAN-13), and the
// EAN-8 / UPC-E worked examples from the GS1 general specifications.
const UPC_A = '036000291452';
const EAN_13 = '4006381333931';
const EAN_8 = '96385074';
const UPC_E = '01234565';
const UPC_E_AS_UPC_A = '012345000065';

describe('hasValidCheckDigit', () => {
  test.each([UPC_A, EAN_13, EAN_8, UPC_E_AS_UPC_A, '00012345678905'])('accepts %s', (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
  });

  test('rejects a number whose last digit is wrong', () => {
    expect(hasValidCheckDigit('036000291453')).toBe(false);
    expect(hasValidCheckDigit('4006381333932')).toBe(false);
    expect(hasValidCheckDigit('96385075')).toBe(false);
  });

  test('rejects one misread digit in the middle (the common camera error)', () => {
    // 036000291452 with the 2 read as a 7.
    expect(hasValidCheckDigit('036000791452')).toBe(false);
  });

  test('rejects anything that is not all digits', () => {
    expect(hasValidCheckDigit('03600029145X')).toBe(false);
    expect(hasValidCheckDigit('')).toBe(false);
    expect(hasValidCheckDigit(null)).toBe(false);
    expect(hasValidCheckDigit(36000291452)).toBe(false);
  });
});

describe('expandUpcE', () => {
  test.each([
    // last digit 0-2: manufacturer ends in that digit + 00
    ['01200003', '012000000003'],
    ['04252614', '042100005264'],
    // last digit 3
    ['01234531', '012300000451'],
    // last digit 4
    ['01234543', '012340000053'],
    // last digit 5-9
    [UPC_E, UPC_E_AS_UPC_A],
  ])('%s -> %s', (short, long) => {
    expect(expandUpcE(short)).toBe(long);
  });

  test('is null for anything that is not a UPC-E', () => {
    expect(expandUpcE('96385074')).toBeNull(); // number system 9
    expect(expandUpcE('0123456')).toBeNull();
    expect(expandUpcE(UPC_A)).toBeNull();
  });
});

describe('normalizeProductCode', () => {
  test('passes a good UPC-A, EAN-13 and EAN-8 through', () => {
    expect(normalizeProductCode(UPC_A, 'upc_a')).toBe(UPC_A);
    expect(normalizeProductCode(EAN_13, 'ean_13')).toBe(EAN_13);
    expect(normalizeProductCode(EAN_8, 'ean_8')).toBe(EAN_8);
  });

  test('ignores a read with a bad check digit, at every length', () => {
    expect(normalizeProductCode('036000291453', 'upc_a')).toBeNull();
    expect(normalizeProductCode('4006381333932', 'EAN13')).toBeNull();
    expect(normalizeProductCode('96385075', 'ean_8')).toBeNull();
    expect(normalizeProductCode('00012345678906')).toBeNull();
  });

  test('ignores what is not a product number at all', () => {
    expect(normalizeProductCode('https://example.com', 'qr_code')).toBeNull();
    expect(normalizeProductCode('ABC-123', 'code_128')).toBeNull();
    expect(normalizeProductCode('1234567', 'ean_8')).toBeNull();   // 7 digits
    expect(normalizeProductCode('12345678901', 'upc_a')).toBeNull(); // 11 digits
    expect(normalizeProductCode('', 'ean_13')).toBeNull();
    expect(normalizeProductCode(undefined)).toBeNull();
  });

  test('folds the two spellings of a US pack to the same 12 digits', () => {
    // Android's detector: 12 digits. zxing-cpp: 13 with a leading zero.
    expect(normalizeProductCode(UPC_A, 'upc_a')).toBe(UPC_A);
    expect(normalizeProductCode(`0${UPC_A}`, 'EAN13')).toBe(UPC_A);
  });

  test('writes a UPC-E out in full, from either decoder', () => {
    expect(normalizeProductCode(UPC_E, 'upc_e')).toBe(UPC_E_AS_UPC_A);
    expect(normalizeProductCode(UPC_E, 'UPCE')).toBe(UPC_E_AS_UPC_A);
    expect(normalizeProductCode(`0${UPC_E_AS_UPC_A}`, 'UPCE')).toBe(UPC_E_AS_UPC_A);
  });

  test('ignores a UPC-E whose check digit is wrong', () => {
    expect(normalizeProductCode('01234566', 'upc_e')).toBeNull();
  });
});
