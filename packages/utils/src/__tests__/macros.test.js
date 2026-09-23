/**
 * The macro targets. Two things matter most here:
 *
 * 1. With NO scan and standard mode, the numbers must equal what the three
 *    copies this module replaced produced — to the gram. Replacing them must
 *    not move anyone's targets on its own.
 * 2. Keto mode and lean mass change the numbers deliberately, and the tests
 *    say by how much.
 */
import { describe, it, expect } from 'vitest';
import { macroRules, macrosForCalories, deriveMacroTargets } from '../macros.js';

// The formula the three copies shared, written out independently.
const legacy = (ng, calories) => {
  const gw = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
  const p = gw ? Math.round((ng.protein_g_per_lb_goal ?? ng.protein_g_per_lb ?? 0.8) * gw) : 0;
  const f = gw ? Math.round((ng.fat_g_per_lb_goal ?? ng.fat_g_per_lb ?? 0.35) * gw) : 0;
  return { protein_g: p, fat_g: f, carbs_g: Math.max(0, Math.round((calories - (p * 4 + f * 9)) / 4)) };
};

// Chef's saved plan on 2026-09-22 (numbers only).
const chef = {
  enabled: true, mode: 'standard', target_weight: 220, plan_type: 'weekender',
  weekly_schedule: [2798, 2798, 2798, 2798, 3424, 3424, 2798], daily_calorie_target: 2977,
  keto: { net_carb_limit_g: 20, track_net_carbs: true, macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 } },
};

describe('no scan, standard mode — identical to the code it replaced', () => {
  it.each([
    ['Chef\'s plan, weekday', chef, 2798],
    ['Chef\'s plan, Friday', chef, 3424],
    ['explicit per-lb ratios', { goal_weight_lbs: 180, protein_g_per_lb_goal: 1, fat_g_per_lb_goal: 0.4 }, 2200],
    ['legacy field names', { targetWeight: 150, protein_g_per_lb: 0.9, fat_g_per_lb: 0.3 }, 1800],
    ['over-specified plan clamps carbs at zero', { goal_weight_lbs: 300, protein_g_per_lb_goal: 1.5 }, 1200],
    ['no goal weight at all', { daily_calorie_target: 2000 }, 2000],
  ])('%s', (_label, ng, calories) => {
    expect(macrosForCalories(calories, macroRules(ng))).toEqual(legacy(ng, calories));
  });

  it('the whole payload matches derivedMacros\' shape, day by day', () => {
    const out = deriveMacroTargets(chef);
    expect(out.weekly).toHaveLength(7);
    out.weekly.forEach((day, i) => {
      expect(day).toEqual({
        dayIndex: i, base_calories: chef.weekly_schedule[i], activity_add_kcal: 0,
        target_calories: chef.weekly_schedule[i], ...legacy(chef, chef.weekly_schedule[i]),
      });
    });
    expect(out.fixed).toEqual({ protein_g: 176, fat_g: 77, protein_kcal: 704, fat_kcal: 693 });
    expect(out.calories).toEqual({ daily: 2977, weekly_schedule: chef.weekly_schedule });
    expect(out.rules).toMatchObject({ protein_basis: 'goal_weight', lean_mass_lb: null, keto: false, calorie_target_mode: 'fixed' });
  });
});

describe('protein from lean mass (plan D3)', () => {
  it('replaces the goal-weight rule when a lean mass is supplied', () => {
    const rules = macroRules(chef, { leanMassLb: 177.04 });
    expect(rules).toMatchObject({ protein_basis: 'lean_mass', lean_mass_lb: 177, protein_g_per_lb_lean: 1 });
    const day = macrosForCalories(2798, rules);
    expect(day.protein_g).toBe(177);
    expect(day.fat_g).toBe(77); // fat still per lb of goal weight
    expect(day.carbs_g).toBe(Math.round((2798 - 177 * 4 - 77 * 9) / 4));
  });

  it('honours a custom per-lb-lean ratio', () => {
    const day = macrosForCalories(2400, macroRules({ ...chef, protein_g_per_lb_lean: 1.2 }, { leanMassLb: 180 }));
    expect(day.protein_g).toBe(216);
  });

  it('works without a goal weight: protein from lean, no fat basis, carbs the rest', () => {
    const day = macrosForCalories(2000, macroRules({}, { leanMassLb: 150 }));
    expect(day).toEqual({ protein_g: 150, fat_g: 0, carbs_g: Math.round((2000 - 600) / 4) });
  });

  it('ignores a non-positive or missing lean mass', () => {
    expect(macroRules(chef, { leanMassLb: 0 }).protein_basis).toBe('goal_weight');
    expect(macroRules(chef, { leanMassLb: NaN }).protein_basis).toBe('goal_weight');
  });
});

describe('keto mode (plan D4)', () => {
  const keto = { ...chef, mode: 'keto' };

  it('the old code handed a keto user hundreds of grams of carbs; this does not', () => {
    expect(legacy(keto, 2798).carbs_g).toBeGreaterThan(300);
    expect(macrosForCalories(2798, macroRules(keto)).carbs_g).toBeLessThan(40);
  });

  it('without lean mass: the saved split, exactly as the keto step shows it', () => {
    const day = macrosForCalories(2000, macroRules(keto));
    expect(day).toEqual({
      fat_g: Math.round((2000 * 0.7) / 9),
      protein_g: Math.round((2000 * 0.25) / 4),
      carbs_g: Math.round((2000 * 0.05) / 4),
    });
    expect(macroRules(keto).protein_basis).toBe('percent');
  });

  it('with lean mass: protein anchored, carbs from the split, fat the remainder', () => {
    const day = macrosForCalories(1700, macroRules(keto, { leanMassLb: 177 }));
    const carbs = Math.round((1700 * 0.05) / 4);
    expect(day.protein_g).toBe(177);
    expect(day.carbs_g).toBe(carbs);
    expect(day.fat_g).toBe(Math.round((1700 - 177 * 4 - carbs * 4) / 9));
  });

  it('lazy keto: the carb cap is the carb target, fat fills the rest', () => {
    const lazy = { ...keto, keto: { net_carb_limit_g: 25, macro_split: { preset: 'lazy' } } };
    const day = macrosForCalories(2000, macroRules(lazy));
    expect(day.carbs_g).toBe(25);
    expect(day.protein_g).toBe(176); // goal-weight rule: 0.8 × 220
    expect(day.fat_g).toBe(Math.round((2000 - 176 * 4 - 25 * 4) / 9));
  });

  it('never a negative fat target when protein and carbs exceed the calories', () => {
    expect(macrosForCalories(500, macroRules(keto, { leanMassLb: 200 })).fat_g).toBe(0);
  });
});
