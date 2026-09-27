/**
 * The Today strip — "Weighed ✓ · BP — · Meds 2 of 3" — and the meds
 * checklist it counts (DOCS/SIMPLE_AND_FULL_PLAN.md item 6).
 */
import { describe, it, expect } from 'vitest';
import { medsChecklist, todayStrip } from '../checkIns.js';

const TODAY = '2026-09-27';
const at = (day) => ({ log_date: `${day}T00:00:00.000Z` });

describe('todayStrip', () => {
  const values = (items) => items.map((i) => `${i.label} ${i.value}`).join(' · ');

  it('weighed today, no BP yet, 2 of 3 doses', () => {
    const items = todayStrip({ weights: [at(TODAY)], bloodPressures: [at('2026-09-20')], meds: { taken: 2, total: 3 }, today: TODAY });
    expect(values(items)).toBe('Weighed ✓ · BP — · Meds 2 of 3');
    expect(items.map((i) => i.done)).toEqual([true, false, false]);
  });

  it('every dose taken reads ✓, not "3 of 3"', () => {
    const items = todayStrip({ weights: [], bloodPressures: [at(TODAY)], meds: { taken: 3, total: 3 }, today: TODAY });
    expect(values(items)).toBe('Weighed — · BP ✓ · Meds ✓');
  });

  it('no medications, no meds check-in', () => {
    expect(todayStrip({ weights: [], bloodPressures: [], meds: { taken: 0, total: 0 }, today: TODAY }).map((i) => i.id)).toEqual(['weight', 'bp']);
    expect(todayStrip({ weights: [], bloodPressures: [], meds: null, today: TODAY }).map((i) => i.id)).toEqual(['weight', 'bp']);
  });

  it("yesterday's weigh-in is not today's", () => {
    const [weight] = todayStrip({ weights: [at('2026-09-26')], today: TODAY });
    expect(weight).toMatchObject({ done: false, value: '—', spoken: 'Not weighed yet today' });
  });

  it('each check-in is a place to go', () => {
    expect(todayStrip({ meds: { taken: 0, total: 1 }, today: TODAY }).map((i) => i.to)).toEqual(['/weight', '/blood-pressure', '/medications']);
  });
});

describe('medsChecklist', () => {
  const meds = [
    { id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] },
    { id: 'm2', display_name: 'Metformin', times_of_day: ['morning', 'evening'] },
    { id: 'm3', display_name: 'Vitamin D', times_of_day: [] },
  ];

  it('one dose per medication per time of day; an unscheduled one is one daily dose', () => {
    const { items, total } = medsChecklist(meds, []);
    expect(total).toBe(4);
    expect(items.map((i) => [i.name, i.slotLabel])).toEqual([
      ['Lisinopril', 'Morning'], ['Metformin', 'Morning'], ['Metformin', 'Evening'], ['Vitamin D', null],
    ]);
    // It still has to be written under a real slot.
    expect(items[3].slot).toBe('morning');
  });

  it('counts what was ticked', () => {
    const logs = [
      { medication_id: 'm1', time_of_day: 'morning', taken: true, created_at: '2026-09-27T13:00:00Z' },
      { medication_id: { _id: 'm2' }, time_of_day: 'evening', taken: true, created_at: '2026-09-27T23:00:00Z' },
    ];
    const { taken, items } = medsChecklist(meds, logs);
    expect(taken).toBe(2);
    expect(items.filter((i) => i.taken).map((i) => i.key)).toEqual(['m1|morning', 'm2|evening']);
  });

  it('the latest answer wins: a tick then an untick is not taken', () => {
    const logs = [
      // Out of order on purpose — the list is sorted, not trusted.
      { medication_id: 'm1', time_of_day: 'morning', taken: false, created_at: '2026-09-27T13:05:00Z' },
      { medication_id: 'm1', time_of_day: 'morning', taken: true, created_at: '2026-09-27T13:00:00Z' },
    ];
    expect(medsChecklist(meds, logs).items[0].taken).toBe(false);
  });
});
