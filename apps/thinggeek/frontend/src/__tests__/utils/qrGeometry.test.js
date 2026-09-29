import { describe, expect, it } from 'vitest';
import { QUIET_ZONE_MODULES, qrDataAreaMm } from '../../utils/qrGeometry';

describe('qrDataAreaMm', () => {
  it('splits a box into quiet zone and data area by module proportion', () => {
    // A 21-module code (QR version 1) in a 29mm box with a 4-module margin:
    // total modules = 21 + 8 = 29, so each module is 1mm — the data area is
    // exactly the 21 modules, 21mm.
    expect(qrDataAreaMm(29, 21, 4)).toBeCloseTo(21, 5);
  });

  it('defaults its margin to the ISO quiet zone (4 modules)', () => {
    expect(qrDataAreaMm(29, 21)).toBeCloseTo(qrDataAreaMm(29, 21, QUIET_ZONE_MODULES), 10);
  });

  it('a bigger box with the same module count gives proportionally more data area', () => {
    const small = qrDataAreaMm(20, 33);
    const large = qrDataAreaMm(48, 33);
    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeCloseTo(48 / 20, 5);
  });

  it('more modules (a longer payload) in the same box leaves less room per side for the same data area', () => {
    // More modules means each module is physically smaller, so the fixed
    // 4-module margin eats a smaller mm slice — data area goes UP, not down,
    // as the box fills with more, smaller modules for the same box size.
    const fewModules = qrDataAreaMm(48, 21);
    const manyModules = qrDataAreaMm(48, 41);
    expect(manyModules).toBeGreaterThan(fewModules);
  });
});
