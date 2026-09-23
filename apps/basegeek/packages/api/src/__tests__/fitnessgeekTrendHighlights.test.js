// trendHighlights — the trends report's plain-language lines, which also reach
// the model through fitnessInsightsTrendWatch. Both used to compare ONE day
// with ONE day (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §0, finding F8).
import { describe, test, expect } from '@jest/globals';
import { trendHighlights } from '../graphql/fitnessgeek/resolvers.js';

const day = (n) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
const daily = (cals) => cals.map((calories, i) => ({ date: day(i), calories }));
const weights = (pairs) => pairs.map(([i, weight]) => ({ date: day(i), weight }));

describe('calorie highlight — first week mean vs last week mean', () => {
  test('one big last day no longer reads as a 20% increase', () => {
    const cals = new Array(14).fill(2000);
    cals[13] = 3500;
    expect(trendHighlights(daily(cals), [])).toEqual([]);
  });

  test('a real sustained rise is reported', () => {
    const cals = [...new Array(7).fill(2000), ...new Array(7).fill(2600)];
    expect(trendHighlights(daily(cals), [])).toEqual([
      'Average daily calories in the last week were more than 20% above the first week.',
    ]);
  });

  test('under two weeks of logged days says nothing', () => {
    expect(trendHighlights(daily([2000, 2000, 2000, 5000]), [])).toEqual([]);
  });
});

describe('weight highlight — 7-day means about two weeks apart', () => {
  test('two readings a few days apart never produce a change, however different', () => {
    expect(trendHighlights([], weights([[0, 320], [3, 316]]))).toEqual([]);
  });

  test('a first-vs-last drop from one watery morning is not reported', () => {
    // Flat at 320 for a month, one low reading on the last day.
    const w = weights([[0, 320], [2, 320], [4, 320], [24, 320], [26, 320], [28, 316]]);
    expect(trendHighlights([], w)).toEqual([]);
  });

  test('a sustained change between windows is reported, from the means', () => {
    const w = weights([[0, 320], [2, 322], [26, 316], [28, 314]]);
    expect(trendHighlights([], w)).toEqual(['Weight changed by -6.0 lbs (7-day average vs 7-day average).']);
  });
});
