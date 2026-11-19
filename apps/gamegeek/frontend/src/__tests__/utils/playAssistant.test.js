import { describe, expect, it } from 'vitest';
import { whatNextProvenanceLine } from '../../utils/playAssistant';

describe('whatNextProvenanceLine', () => {
  it('renders nothing before the first answer', () => {
    expect(whatNextProvenanceLine(null)).toBeNull();
    expect(whatNextProvenanceLine(undefined)).toBeNull();
  });

  it('credits the play assistant in plain words, never a model id (review 2026-11-18 #10)', () => {
    expect(whatNextProvenanceLine({ source: 'model', model: 'qwen-32b' })).toBe('Picked by the play assistant');
    expect(whatNextProvenanceLine({ source: 'model', model: null })).toBe('Picked by the play assistant');
  });

  it('says a cap, not a failure', () => {
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'cap' })).toBe(
      'The play assistant is done for today — ranked from your own library',
    );
  });

  it('every other fallback is the deterministic answer, labelled as such', () => {
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'disabled' })).toBe(
      'Ranked from your own library',
    );
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'unavailable' })).toBe(
      'Ranked from your own library',
    );
  });
});
