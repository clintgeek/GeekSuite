/**
 * One-tap logging (DOCS/SIMPLE_AND_FULL_PLAN.md item 2): the "Again" chips
 * are ranked from the person's own logs, and "Same as yesterday's lunch" is
 * exactly yesterday's lunch.
 */
import { describe, it, expect } from 'vitest';
import { rankAgainChips, yesterdaysMeal } from '../againChips.js';

let seq = 0;
const food = (id, name) => ({ id, name, brand: null });
const log = (f, meal, day, servings = 1, cal = 100) => ({
  id: `l${seq += 1}`,
  meal_type: meal,
  log_date: `${day}T00:00:00.000Z`,
  servings,
  nutrition: { calories_per_serving: cal },
  food_item_id: f,
});

const YOGURT = food('f1', 'Greek yogurt');
const CAESAR = food('f2', 'Caesar salad');
const TOAST = food('f3', 'Toast');
const RIBEYE = food('f4', 'Ribeye');

describe('rankAgainChips', () => {
  it('a food logged in THIS meal outranks one logged as often elsewhere', () => {
    const logs = [
      log(CAESAR, 'lunch', '2026-09-20'), log(CAESAR, 'lunch', '2026-09-22'),
      log(RIBEYE, 'dinner', '2026-09-21'), log(RIBEYE, 'dinner', '2026-09-23'),
    ];
    const chips = rankAgainChips({ logs, mealType: 'lunch' });
    expect(chips.map((c) => c.label)).toEqual(['Caesar salad', 'Ribeye']);
  });

  it('frequency beats a single recent meal, and a one-off never becomes a chip', () => {
    const logs = [
      log(TOAST, 'breakfast', '2026-09-10'), log(TOAST, 'breakfast', '2026-09-12'), log(TOAST, 'breakfast', '2026-09-14'),
      log(YOGURT, 'breakfast', '2026-09-25'), log(YOGURT, 'breakfast', '2026-09-26'),
      log(RIBEYE, 'breakfast', '2026-09-26'),
    ];
    const chips = rankAgainChips({ logs, mealType: 'breakfast' });
    expect(chips.map((c) => c.label)).toEqual(['Toast', 'Greek yogurt']);
  });

  it('ties go to whatever was eaten most recently', () => {
    const logs = [
      log(TOAST, 'breakfast', '2026-09-01'), log(TOAST, 'breakfast', '2026-09-02'),
      log(YOGURT, 'breakfast', '2026-09-20'), log(YOGURT, 'breakfast', '2026-09-21'),
    ];
    expect(rankAgainChips({ logs, mealType: 'breakfast' }).map((c) => c.label)).toEqual(['Greek yogurt', 'Toast']);
  });

  it('a chip re-logs at the servings and nutrition he used LAST time', () => {
    const logs = [log(YOGURT, 'breakfast', '2026-09-20', 1, 190), log(YOGURT, 'breakfast', '2026-09-26', 2, 200)];
    const [chip] = rankAgainChips({ logs, mealType: 'breakfast' });
    expect(chip.item).toMatchObject({ id: 'f1', servings: 2, nutrition: { calories_per_serving: 200 } });
  });

  it('a saved meal counts once per sitting where ALL its foods appear together', () => {
    const meal = { id: 'm1', name: 'Usual breakfast', food_items: [{ food_item_id: YOGURT }, { food_item_id: TOAST }] };
    const logs = [
      // Two sittings with both foods, one with only yogurt.
      log(YOGURT, 'breakfast', '2026-09-24'), log(TOAST, 'breakfast', '2026-09-24'),
      log(YOGURT, 'breakfast', '2026-09-25'), log(TOAST, 'breakfast', '2026-09-25'),
      log(YOGURT, 'breakfast', '2026-09-26'),
    ];
    const chips = rankAgainChips({ logs, savedMeals: [meal], mealType: 'breakfast' });
    const mealChip = chips.find((c) => c.kind === 'meal');
    expect(mealChip).toMatchObject({ label: 'Usual breakfast', count: 2 });
    expect(mealChip.item.type).toBe('meal');
  });

  it('caps the row', () => {
    const logs = Array.from({ length: 10 }, (_, i) => [
      log(food(`x${i}`, `Food ${i}`), 'snack', '2026-09-01'),
      log(food(`x${i}`, `Food ${i}`), 'snack', '2026-09-02'),
    ]).flat();
    expect(rankAgainChips({ logs, mealType: 'snack', limit: 6 })).toHaveLength(6);
  });
});

describe('yesterdaysMeal', () => {
  it("is exactly yesterday's rows for that meal, with their servings", () => {
    const logs = [
      log(CAESAR, 'lunch', '2026-09-26', 1), log(TOAST, 'lunch', '2026-09-26', 2),
      log(RIBEYE, 'dinner', '2026-09-26'),
      log(YOGURT, 'lunch', '2026-09-25'),
    ];
    const items = yesterdaysMeal({ logs, mealType: 'lunch', yesterday: '2026-09-26' });
    expect(items.map((i) => [i.name, i.servings])).toEqual([['Caesar salad', 1], ['Toast', 2]]);
  });

  it('nothing yesterday → nothing to offer', () => {
    expect(yesterdaysMeal({ logs: [log(YOGURT, 'breakfast', '2026-09-20')], mealType: 'breakfast', yesterday: '2026-09-26' })).toEqual([]);
  });
});

describe('saved meals belong to their slot', () => {
  it('"Usual breakfast" is not offered at lunch, however often it is eaten', () => {
    const meal = { id: 'm1', name: 'Usual breakfast', food_items: [{ food_item_id: YOGURT }, { food_item_id: TOAST }] };
    const logs = ['2026-09-24', '2026-09-25'].flatMap((d) => [log(YOGURT, 'breakfast', d), log(TOAST, 'breakfast', d)]);
    expect(rankAgainChips({ logs, savedMeals: [meal], mealType: 'lunch' }).some((c) => c.kind === 'meal')).toBe(false);
    expect(rankAgainChips({ logs, savedMeals: [meal], mealType: 'breakfast' }).some((c) => c.kind === 'meal')).toBe(true);
  });
});
