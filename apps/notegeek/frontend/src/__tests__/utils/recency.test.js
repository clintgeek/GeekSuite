import { describe, it, expect } from 'vitest';
import { groupByRecency } from '../../utils/recency';

// A fixed "now", in LOCAL time: Saturday 2026-09-26, 20:00.
const NOW = new Date(2026, 8, 26, 20, 0, 0);
const at = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0).toISOString();

describe('groupByRecency', () => {
  it('buckets by the writer\'s local calendar day, then by month', () => {
    const notes = [
      { id: 'a', updatedAt: at(2026, 8, 26, 0) },   // today, just after midnight
      { id: 'b', updatedAt: at(2026, 8, 25, 23) },  // yesterday, late
      { id: 'c', updatedAt: at(2026, 8, 21) },      // this week (5 days back)
      { id: 'd', updatedAt: at(2026, 8, 19) },      // 7 days back → its month
      { id: 'e', updatedAt: at(2026, 7, 2) },       // August
      { id: 'f', updatedAt: at(2025, 11, 30) },     // December 2025
    ];
    const groups = groupByRecency(notes, { now: NOW });
    expect(groups.map((g) => [g.key, g.notes.map((n) => n.id)])).toEqual([
      ['today', ['a']],
      ['yesterday', ['b']],
      ['week', ['c']],
      ['m-2026-8', ['d']],
      ['m-2026-7', ['e']],
      ['m-2025-11', ['f']],
    ]);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[2].label).toBe('This week');
    // The current year is implied; an older one is spelled out.
    expect(groups[4].label).not.toMatch(/2026/);
    expect(groups[5].label).toMatch(/2025/);
  });

  it('groups on the field the sort uses', () => {
    const notes = [{ id: 'a', updatedAt: at(2026, 8, 26), createdAt: at(2026, 5, 1) }];
    expect(groupByRecency(notes, { now: NOW })[0].key).toBe('today');
    expect(groupByRecency(notes, { now: NOW, field: 'createdAt' })[0].key).toBe('m-2026-5');
  });

  it('keeps the incoming order inside and across buckets', () => {
    const notes = [
      { id: 'x', updatedAt: at(2026, 8, 26, 18) },
      { id: 'y', updatedAt: at(2026, 8, 26, 9) },
    ];
    expect(groupByRecency(notes, { now: NOW })[0].notes.map((n) => n.id)).toEqual(['x', 'y']);
  });

  it('reads epoch-millis strings, and parks undated notes in Earlier', () => {
    const notes = [
      { id: 'ms', updatedAt: String(new Date(2026, 8, 26, 10).getTime()) },
      { id: 'none' },
    ];
    const groups = groupByRecency(notes, { now: NOW });
    expect(groups.map((g) => g.key)).toEqual(['today', 'earlier']);
  });
});
