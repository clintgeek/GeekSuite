import { coveringDomain, withDomain, withoutDomain } from '../../utils/publishers';

describe('coveringDomain (the gateway’s label-boundary suffix match)', () => {
  it('finds the entry that is the domain or a parent of it', () => {
    expect(coveringDomain(['nwaonline.com'], 'nwaonline.com')).toBe('nwaonline.com');
    expect(coveringDomain(['nwaonline.com'], 'obits.nwaonline.com')).toBe('nwaonline.com');
    expect(coveringDomain(['a.example', 'nwaonline.com'], 'OBITS.NWAONLINE.COM')).toBe('nwaonline.com');
  });

  it('never matches across a label boundary, a child entry, or nothing', () => {
    expect(coveringDomain(['nwaonline.com'], 'notnwaonline.com')).toBeNull();
    expect(coveringDomain(['obits.nwaonline.com'], 'nwaonline.com')).toBeNull();
    expect(coveringDomain([], 'nwaonline.com')).toBeNull();
    expect(coveringDomain(['nwaonline.com'], null)).toBeNull();
  });
});

describe('withDomain / withoutDomain', () => {
  it('add once and remove exactly', () => {
    expect(withDomain(['a.com'], 'a.com')).toEqual(['a.com']);
    expect(withDomain(['a.com'], 'b.com')).toEqual(['a.com', 'b.com']);
    expect(withoutDomain(['a.com', 'b.com'], 'a.com')).toEqual(['b.com']);
  });
});
