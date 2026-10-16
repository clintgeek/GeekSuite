import { describe, it, expect } from 'vitest';
import { caloriesSentence } from '../plainWords.js';

describe('caloriesSentence with no target', () => {
  it("doesn't scold someone who is just keeping count", () => {
    const s = caloriesSentence({ eaten: 640, goal: 0 });
    expect(s.state).toBe('nogoal');
    expect(s.detail).not.toMatch(/No daily target is set/);
    expect(s.detail).toMatch(/keeping count/);
  });

  it('points at adding food, not at a meal "below" (the add button is above now)', () => {
    expect(caloriesSentence({ eaten: 0, goal: 0 }).detail).not.toMatch(/below/);
  });
});
