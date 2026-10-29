/**
 * Today's manual order (DOCS/SORTING_RULES.md § "Manual order (Today)"):
 * the dragged arrangement is kept exactly; a task not in it slots in where
 * the normal rule would put it; done/deleted ids are ignored; a task that
 * moved between Today and Anytime is placed like a new one.
 */
import { describe, it, expect } from 'vitest';
import { manualSections, moveIdBy, orderForSave, orderKeys, reorderSubset } from '../../utils/manualOrder';
import { compareWithinDay, todaySections } from '../../utils/penViews';

const now = new Date(2026, 9, 29, 10, 0);
const today = '2026-10-29T00:00:00.000Z';
const t = (id, over = {}) => ({ id, content: id, status: 'pending', dueDate: today, createdAt: '2026-10-01T00:00:00.000Z', ...over });

// Normal rule: priority 1, 2, 3, none.
const H = t('high', { priority: 1 });
const M = t('medium', { priority: 2 });
const L = t('low', { priority: 3 });
const N = t('none');
const A1 = t('a1', { dueDate: null, priority: 1 });
const A2 = t('a2', { dueDate: null });

const ids = (list) => list.map((x) => x.id);
const sections = (tasks) => todaySections(tasks, now);
const apply = (tasks, saved) => {
  const s = sections(tasks);
  const m = manualSections(s, saved, compareWithinDay);
  return { today: ids(m.today), anytime: ids(m.anytime) };
};

describe('manualSections', () => {
  it('no saved order is the auto order', () => {
    expect(apply([N, L, H, M, A2, A1], [])).toEqual({ today: ['high', 'medium', 'low', 'none'], anytime: ['a1', 'a2'] });
    expect(apply([N, H], undefined)).toEqual({ today: ['high', 'none'], anytime: [] });
  });

  it('a saved order is kept exactly, in both sections', () => {
    expect(apply([H, M, L, N, A1, A2], ['none', 'low', 'high', 'medium', 'a2', 'a1']))
      .toEqual({ today: ['none', 'low', 'high', 'medium'], anytime: ['a2', 'a1'] });
  });

  it('a new task goes before the first saved task the rule puts after it', () => {
    // Saved: low, none, high. Medium is new: the first saved task the rule
    // puts after medium is low (index 0), so medium goes on top.
    expect(apply([H, M, L, N], ['low', 'none', 'high'])).toEqual({ today: ['medium', 'low', 'none', 'high'] , anytime: [] });
    // Saved: none, high. Low is new: none comes after low by the rule → before none.
    expect(apply([H, L, N], ['high', 'none'])).toEqual({ today: ['high', 'low', 'none'], anytime: [] });
  });

  it('a new task the rule puts after every saved task goes at the end', () => {
    expect(apply([H, M, N], ['medium', 'high'])).toEqual({ today: ['medium', 'high', 'none'], anytime: [] });
  });

  it('several new tasks before the same saved task keep their auto order', () => {
    expect(apply([H, M, L, N], ['none'])).toEqual({ today: ['high', 'medium', 'low', 'none'], anytime: [] });
  });

  it('a new task by time: a timed task slots by its clock time among the saved ones', () => {
    const nine = t('nine', { dueDate: new Date(2026, 9, 29, 9).toISOString() });
    const three = t('three', { dueDate: new Date(2026, 9, 29, 15).toISOString() });
    const noon = t('noon', { dueDate: new Date(2026, 9, 29, 12).toISOString() });
    expect(apply([nine, three, noon], ['three', 'nine'])).toEqual({ today: ['noon', 'three', 'nine'], anytime: [] });
    expect(apply([nine, three, noon], ['nine', 'three'])).toEqual({ today: ['nine', 'noon', 'three'], anytime: [] });
  });

  it('ignores saved ids that are done, deleted or on another day', () => {
    const done = t('done', { status: 'completed', completedAt: now.toISOString() });
    const tomorrow = t('tomorrow', { dueDate: '2026-10-30T00:00:00.000Z' });
    expect(apply([H, N, done, tomorrow], ['gone', 'none', 'done', 'tomorrow', 'high']))
      .toEqual({ today: ['none', 'high'], anytime: [] });
  });

  it('a task moved from Anytime to Today is placed by the rule, not left at its old spot', () => {
    // Saved when a1 was in Anytime: [none, low | a2, a1]. a1 now has a date
    // today and High priority — the rule puts it on top of Today.
    const moved = t('a1', { priority: 1 });
    expect(apply([N, L, A2, moved], ['none', 'low', 'a2', 'a1'])).toEqual({ today: ['a1', 'none', 'low'], anytime: ['a2'] });
  });

  it('a task moved from Today to Anytime is placed by the rule there', () => {
    // Saved: [low, none, high | a2]. high lost its date: an Anytime task now, priority 1.
    const moved = t('high', { priority: 1, dueDate: null });
    expect(apply([N, moved, L, A2], ['low', 'none', 'high', 'a2'])).toEqual({ today: ['low', 'none'], anytime: ['high', 'a2'] });
  });

  it('when two readings explain a move equally well, both tasks are placed by the rule', () => {
    // Saved: [none, high, low | a2], high now in Anytime. "high moved" and
    // "low moved" fit equally; neither is trusted. high goes by the rule in
    // Anytime (top); low goes by the rule in Today (before none).
    const moved = t('high', { priority: 1, dueDate: null });
    expect(apply([N, moved, L, A2], ['none', 'high', 'low', 'a2'])).toEqual({ today: ['low', 'none'], anytime: ['high', 'a2'] });
  });

  it('a task moved from the middle of Anytime to Today is placed by the rule', () => {
    // Saved: [none, low | a2, a1, a3]; a1 (High) now dated today.
    const a3 = t('a3', { dueDate: null, priority: 3 });
    const moved = t('a1', { priority: 1 });
    const out = apply([N, L, A2, moved, a3], ['none', 'low', 'a2', 'a1', 'a3']);
    expect(out.today).toEqual(['a1', 'none', 'low']);
    expect(out.anytime).toContain('a2');
    expect(out.anytime).toContain('a3');
  });

  it('a task at the seam keeps its place (nothing tells the blocks apart)', () => {
    // [none, low | a2] with a2 now dated today: it was either the last of
    // Today or the first of Anytime; either way it stays next to where it was.
    const moved = t('a2');
    expect(apply([N, L, moved], ['none', 'low', 'a2'])).toEqual({ today: ['none', 'low', 'a2'], anytime: [] });
  });

  it('a repeat occurrence edited into a real task keeps its virtual id’s place', () => {
    const ms = new Date(2026, 9, 29, 9).getTime();
    const virtualId = `virtual_s1_${ms}`;
    const edited = t('real1', { seriesId: 's1', originalDate: new Date(ms).toISOString() });
    expect(orderKeys(edited)).toEqual(['real1', virtualId]);
    expect(apply([H, edited], [virtualId, 'high'])).toEqual({ today: ['real1', 'high'], anytime: [] });
  });

  it('does not change the input arrays', () => {
    const s = sections([H, N]);
    const before = ids(s.today);
    manualSections(s, ['none', 'high']);
    expect(ids(s.today)).toEqual(before);
  });
});

describe('orderForSave / reorderSubset / moveIdBy', () => {
  it('saves Today then Anytime', () => {
    expect(orderForSave({ today: [N, H], anytime: [A2] })).toEqual(['none', 'high', 'a2']);
  });

  it('a filtered drag fills only the filtered tasks’ slots', () => {
    // Full: a b c d e; filter shows b d e; dragged to e b d.
    expect(reorderSubset(['a', 'b', 'c', 'd', 'e'], ['e', 'b', 'd'])).toEqual(['a', 'e', 'c', 'b', 'd']);
    expect(reorderSubset(['a', 'b'], ['b', 'a', 'x'])).toEqual(['b', 'a', 'x']);
  });

  it('moves an id by one, clamped at the ends', () => {
    expect(moveIdBy(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveIdBy(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    const ends = ['a', 'b'];
    expect(moveIdBy(ends, 'a', -1)).toBe(ends);
    expect(moveIdBy(ends, 'zzz', 1)).toBe(ends);
  });
});
