import { describe, it, expect } from 'vitest';
import { greetingName } from '../../pages/BaseGeekHome';

describe('greetingName', () => {
  it('prefers the profile display name', () => {
    expect(greetingName({ username: 'clint@clintgeek.com', profile: { displayName: 'Chef' } })).toBe('Chef');
  });
  it('never greets by a whole email address', () => {
    // Production 2026-09-27: the username is the email.
    expect(greetingName({ username: 'clint@clintgeek.com', profile: {} })).toBe('Clint');
    expect(greetingName({ email: 'heathergeek03@gmail.com' })).toBe('Heathergeek03');
  });
  it('capitalises a plain username', () => {
    expect(greetingName({ username: 'heather' })).toBe('Heather');
  });
  it('is empty when there is nothing to go on', () => {
    expect(greetingName(null)).toBe('');
    expect(greetingName({ profile: { displayName: '   ' } })).toBe('');
  });
});
