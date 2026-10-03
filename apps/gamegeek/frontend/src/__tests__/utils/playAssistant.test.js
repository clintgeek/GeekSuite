import { describe, expect, it } from 'vitest';
import { whatNextProvenanceLine } from '../../utils/playAssistant';

describe('whatNextProvenanceLine', () => {
  it('renders nothing before the first answer', () => {
    expect(whatNextProvenanceLine(null)).toBeNull();
    expect(whatNextProvenanceLine(undefined)).toBeNull();
  });

  it('credits the model when the model picked', () => {
    expect(whatNextProvenanceLine({ source: 'model', model: 'qwen-32b' })).toBe('AI-picked by qwen-32b');
    expect(whatNextProvenanceLine({ source: 'model', model: null })).toBe("AI-picked by the suite's model");
  });

  it('says a cap, not a failure', () => {
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'cap' })).toBe(
      'Daily AI limit reached — ranked from your own library',
    );
  });

  it('every other fallback is the deterministic answer, labelled as such', () => {
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'disabled' })).toBe(
      'No model — ranked from your own library',
    );
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'unavailable' })).toBe(
      'No model — ranked from your own library',
    );
  });
});
