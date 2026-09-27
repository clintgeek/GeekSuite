import { describe, it, expect } from 'vitest';
import { greetingNameFrom, displayNameFrom } from '../../utils/userDisplay';

describe('greetingNameFrom', () => {
  it('capitalises a lowercase username: "Chef", not "chef"', () => {
    expect(greetingNameFrom({ username: 'chef', email: 'chef@example.com' })).toBe('Chef');
  });

  it('prefers a profile name, then displayName, then username, then the email', () => {
    expect(greetingNameFrom({ name: 'clint crocker', username: 'chef' })).toBe('Clint');
    expect(greetingNameFrom({ displayName: 'chef Crocker', username: 'x' })).toBe('Chef');
    expect(greetingNameFrom({ email: 'heather.c@example.com' })).toBe('Heather');
  });

  it('touches only the first letter', () => {
    expect(greetingNameFrom({ name: 'mcKenna' })).toBe('McKenna');
  });

  it('is empty when there is nothing to go on, so the greeting drops the comma', () => {
    expect(greetingNameFrom(null)).toBe('');
    expect(greetingNameFrom({})).toBe('');
    expect(displayNameFrom({})).toBe('Writer');
  });
});
