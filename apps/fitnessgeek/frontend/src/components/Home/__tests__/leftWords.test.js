/**
 * "What is left" in words (DOCS/ONE_APP_PLAN.md §1.2). Today says "today";
 * a day gone by is said in the past and a day ahead in the present, and
 * neither ever says "today".
 */
import { describe, it, expect } from 'vitest';
import { leftSentence, leftTitle, ringCaption } from '../leftWords.js';

const TODAY = '2026-10-16';
const PAST = '2026-10-15';
const AHEAD = '2026-10-17';

describe('leftSentence', () => {
  it('today is the plain sentence everybody knows', () => {
    expect(leftSentence({ eaten: 1680, goal: 2340, day: TODAY, today: TODAY }).headline).toBe('You have 660 calories left today');
    expect(leftSentence({ eaten: 2500, goal: 2340, day: TODAY, today: TODAY }).headline).toBe('You’re 160 calories over today');
    expect(leftSentence({ eaten: 0, goal: 0, day: TODAY, today: TODAY }).headline).toBe('Nothing logged yet today');
    // No day given reads as today.
    expect(leftSentence({ eaten: 1680, goal: 2340 }).headline).toBe('You have 660 calories left today');
  });

  it('a day gone by is in the past', () => {
    expect(leftSentence({ eaten: 1680, goal: 2340, day: PAST, today: TODAY })).toEqual({ headline: 'You had 660 calories left', detail: '1,680 eaten of 2,340', state: 'left' });
    expect(leftSentence({ eaten: 2500, goal: 2340, day: PAST, today: TODAY }).headline).toBe('You were 160 calories over');
    expect(leftSentence({ eaten: 2340, goal: 2340, day: PAST, today: TODAY }).headline).toBe('You hit your calories');
    expect(leftSentence({ eaten: 900, goal: 0, day: PAST, today: TODAY }).headline).toBe('You had 900 calories');
  });

  it('a day ahead is in the present', () => {
    expect(leftSentence({ eaten: 0, goal: 2340, day: AHEAD, today: TODAY })).toEqual({ headline: 'You have 2,340 calories left', detail: 'Your target is 2,340', state: 'left' });
    expect(leftSentence({ eaten: 2500, goal: 2340, day: AHEAD, today: TODAY }).headline).toBe('You’re 160 calories over');
  });

  it('an empty other day with no target says so without claiming "today"', () => {
    const s = leftSentence({ eaten: 0, goal: 0, day: PAST, today: TODAY });
    expect(s.headline).toBe('Nothing logged for this day');
    expect(s.state).toBe('nogoal');
  });

  it('another day never says "today", whatever the numbers', () => {
    for (const day of [PAST, AHEAD]) {
      for (const [eaten, goal] of [[0, 0], [500, 0], [0, 2000], [500, 2000], [2000, 2000], [2500, 2000]]) {
        const s = leftSentence({ eaten, goal, day, today: TODAY });
        expect(`${s.headline} ${s.detail}`).not.toMatch(/today/i);
      }
    }
  });
});

describe('the ring caption and the card title', () => {
  it('say "today" only on today', () => {
    expect(ringCaption({ hasGoal: true, over: false, day: TODAY, today: TODAY })).toBe('Amount left today');
    expect(ringCaption({ hasGoal: true, over: true, day: TODAY, today: TODAY })).toBe('Over target today');
    expect(ringCaption({ hasGoal: false, over: false, day: TODAY, today: TODAY })).toBe('Eaten today');
    expect(ringCaption({ hasGoal: true, over: false, day: PAST, today: TODAY })).toBe('Amount left');
    expect(ringCaption({ hasGoal: true, over: true, day: PAST, today: TODAY })).toBe('Over target');
    expect(ringCaption({ hasGoal: false, over: false, day: PAST, today: TODAY })).toBe('Eaten');
    expect(leftTitle(TODAY, TODAY)).toBe('What’s left today');
    expect(leftTitle(PAST, TODAY)).toBe('Calories for this day');
  });
});
