/**
 * fitnessgeekBodyComposition.test.js — the gateway half of
 * DOCS/FITNESSGEEK_BODY_DATA_PLAN.md (W3).
 *
 * Pinned here:
 *   1. bodyCompPoints.js maps a stored scan onto bodyComp.js's point shape,
 *      loads oldest-first, and only offers lean mass for targets while the
 *      latest scan is ≤ 30 days old.
 *   2. `bodyCompositions` — auth, inclusive calendar-day window, oldest first,
 *      the declared shape (segments, device_name, derived subset).
 *   3. `bodyCompositionSummary` — counts, 14-day current mean, change, and a
 *      scan BMR (Katch-McArdle) or 'mifflin' when no scan is usable.
 *   4. `derivedMacros` — unchanged numbers with no scan in standard mode,
 *      lean-mass protein with one, keto respected.
 *   5. `addFitnessWeight` keeps ONE row per calendar day (plan D8 / F6);
 *      `updateFitnessWeight` marks a typed value 'manual'.
 *   6. The AI context: one weight per day, a SMOOTHED trend (F8), and a
 *      body-composition block that actually reaches the prompt.
 *
 * Uses the suite's in-memory MongoDB (globalSetup.js) and the real models, so
 * the queries and indexes are the ones production runs.
 */

import mongoose from 'mongoose';
import { describe, test, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';

const { default: Weight } = await import('../graphql/fitnessgeek/models/Weight.js');
const { default: BodyComposition } = await import('../graphql/fitnessgeek/models/BodyComposition.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');
const { default: aiService } = await import('../services/aiService.js');
const {
  toBodyCompPoint,
  loadBodyCompPoints,
  leanMassFor,
} = await import('../graphql/fitnessgeek/bodyCompPoints.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});
const Q = resolvers.Query;
const M = resolvers.Mutation;

const DAY = 86400000;
const utc = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const ymd = (d) => d.toISOString().slice(0, 10);
/** UTC midnight `offset` days from today. */
const dayAt = (offset) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return addDays(d, offset);
};

const katch = (leanLb) => Math.round(370 + 21.6 * leanLb * 0.45359237);

/** A stored scan on calendar day `logDate`, measured at 08:01 that day. */
const scan = (logDate, overrides = {}) =>
  BodyComposition.create({
    userId: ALICE,
    weight_value: 318,
    body_fat_mass_lb: 140,
    body_water_l: 59.2,
    skeletal_muscle_lb: 95,
    visceral_fat_index: 18,
    height_cm: 180,
    left_arm: { muscle_lb: 9.1, fat_lb: 6.2 },
    right_arm: { muscle_lb: 9.3, fat_lb: 6.1 },
    trunk: { muscle_lb: 70.2, fat_lb: 70.5 },
    left_leg: { muscle_lb: 24.0, fat_lb: 20.1 },
    right_leg: { muscle_lb: 24.2, fat_lb: 20.0 },
    device: { name: 'Arboleaf CS20M' },
    measured_at: new Date(logDate.getTime() + 8 * 3600000 + 60000),
    log_date: logDate,
    source: 'arboleaf_xlsx',
    ...overrides,
  });

beforeAll(async () => {
  await Weight.db.asPromise();
  await BodyComposition.init();
}, 60000);

afterEach(async () => {
  await Promise.all([
    Weight.deleteMany({}),
    BodyComposition.deleteMany({}),
    UserSettings.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Weight.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('bodyCompPoints', () => {
  const DOC = {
    _id: 'x',
    log_date: utc('2026-09-16'),
    measured_at: new Date('2026-09-16T13:01:00Z'),
    weight_value: 318,
    body_fat_mass_lb: 140,
    body_water_l: 59.2,
    skeletal_muscle_lb: 95,
    visceral_fat_index: 18,
  };

  test('toBodyCompPoint: the calendar day, lean = weight − fat, BMR from derive()', () => {
    const p = toBodyCompPoint(DOC);
    expect(p.date).toBe(DOC.log_date); // log_date, never measured_at
    expect(p.weight_lb).toBe(318);
    expect(p.fat_mass_lb).toBe(140);
    expect(p.lean_mass_lb).toBe(178);
    expect(p.body_fat_pct).toBeCloseTo((140 / 318) * 100, 6);
    expect(p.body_water_pct).toBeCloseTo((59.2 / (318 * 0.45359237)) * 100, 6);
    expect(p.bmr_kcal).toBeCloseTo(370 + 21.6 * 178 * 0.45359237, 6);
    expect(p.skeletal_muscle_lb).toBe(95);
    expect(p.visceral_fat_index).toBe(18);
  });

  test('loadBodyCompPoints: one query for the user, oldest first by measured_at, lean', async () => {
    const lean = jest.fn().mockResolvedValue([DOC]);
    const sort = jest.fn(() => ({ lean }));
    const find = jest.fn(() => ({ sort }));
    const points = await loadBodyCompPoints('u1', { BodyComposition: { find } });
    expect(find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(sort).toHaveBeenCalledWith({ measured_at: 1 });
    expect(lean).toHaveBeenCalled();
    expect(points).toHaveLength(1);
    expect(points[0].lean_mass_lb).toBe(178);
  });

  const fakeModel = (docs) => ({ find: () => ({ sort: () => ({ lean: async () => docs }) }) });

  test('leanMassFor: the 14-day mean while the latest scan is ≤ 30 days old, else null', async () => {
    const docs = [
      { ...DOC, log_date: utc('2026-09-10'), body_fat_mass_lb: 142 }, // lean 176
      { ...DOC, log_date: utc('2026-09-16'), body_fat_mass_lb: 138 }, // lean 180
    ];
    const deps = { BodyComposition: fakeModel(docs) };
    await expect(leanMassFor('u1', '2026-09-20', deps)).resolves.toMatchObject({
      lean_mass_lb: 178, scans: 2, age_days: 4,
    });
    // 31 days after the latest scan: a body that has since changed.
    await expect(leanMassFor('u1', '2026-10-17', deps)).resolves.toBeNull();
    await expect(leanMassFor('u1', '2026-09-20', { BodyComposition: fakeModel([]) })).resolves.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('bodyCompositions', () => {
  test('requires a user', async () => {
    await expect(Q.bodyCompositions(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
  });

  test('an inclusive calendar-day window, oldest first, own scans only', async () => {
    await scan(utc('2026-09-12'));
    await scan(utc('2026-09-10'));
    await scan(utc('2026-09-11'));
    await scan(utc('2026-09-13'));
    await scan(utc('2026-09-09'));
    await scan(utc('2026-09-11'), { userId: BOB });

    // What the Date scalar hands the resolver for "2026-09-10" / "2026-09-12".
    const rows = await Q.bodyCompositions(
      null, { startDate: utc('2026-09-10'), endDate: utc('2026-09-12') }, ctx(ALICE)
    );
    expect(rows.map((r) => ymd(r.log_date))).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);

    // An end sent as a later instant of the same day still covers that day.
    const lateEnd = await Q.bodyCompositions(
      null, { endDate: new Date('2026-09-10T23:30:00Z') }, ctx(ALICE)
    );
    expect(lateEnd.map((r) => ymd(r.log_date))).toEqual(['2026-09-09', '2026-09-10']);

    const all = await Q.bodyCompositions(null, {}, ctx(ALICE));
    expect(all).toHaveLength(5);
  });

  test('maps to the declared shape: segments, device_name, the derived subset', async () => {
    await scan(utc('2026-09-16'));
    const [row] = await Q.bodyCompositions(null, {}, ctx(ALICE));
    expect(typeof row.id).toBe('string');
    expect(row).toMatchObject({
      source: 'arboleaf_xlsx',
      weight_value: 318,
      body_fat_mass_lb: 140,
      visceral_fat_index: 18,
      left_arm: { muscle_lb: 9.1, fat_lb: 6.2 },
      trunk: { muscle_lb: 70.2, fat_lb: 70.5 },
      device_name: 'Arboleaf CS20M',
    });
    expect(Object.keys(row.derived).sort()).toEqual(
      ['bmi', 'bmr_kcal', 'body_fat_pct', 'body_water_pct', 'fat_free_mass_lb', 'skeletal_muscle_pct', 'smi']
    );
    expect(row.derived.fat_free_mass_lb).toBe(178);
    expect(row.derived.body_fat_pct).toBeCloseTo(44.03, 2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('bodyCompositionSummary', () => {
  test('with no scans: zero, nothing current, no change, Mifflin', async () => {
    const s = await Q.bodyCompositionSummary(null, { date: '2026-09-20' }, ctx(ALICE));
    expect(s).toMatchObject({
      total_scans: 0, first_scan_at: null, latest_scan_at: null, current: null,
      change: { available: false },
      bmr: { bmr: null, source: 'mifflin', lean_mass_lb: null, scan_age_days: null },
    });
  });

  test('counts, the 14-day mean, and a Katch-McArdle BMR from the mean lean mass', async () => {
    await scan(utc('2026-09-01'), { body_fat_mass_lb: 150 }); // outside the 14 days
    await scan(utc('2026-09-10'), { body_fat_mass_lb: 142 }); // lean 176
    await scan(utc('2026-09-16'), { body_fat_mass_lb: 138 }); // lean 180
    const s = await Q.bodyCompositionSummary(null, { date: '2026-09-20' }, ctx(ALICE));
    expect(s.total_scans).toBe(3);
    expect(ymd(s.first_scan_at)).toBe('2026-09-01');
    expect(s.latest_scan_at.toISOString()).toBe('2026-09-16T08:01:00.000Z');
    expect(s.current).toMatchObject({ scans: 2, lean_mass_lb: 178, fat_mass_lb: 140 });
    expect(ymd(s.current.from)).toBe('2026-09-10');
    expect(s.change.available).toBe(false);
    expect(s.change.available_from).toBeInstanceOf(Date);
    expect(s.bmr).toEqual({ bmr: katch(178), source: 'scan', lean_mass_lb: 178, scans: 2, scan_age_days: 4 });
  });

  test('a latest scan over 30 days old no longer sets the BMR', async () => {
    await scan(utc('2026-09-16'));
    const s = await Q.bodyCompositionSummary(null, { date: '2026-10-17' }, ctx(ALICE));
    expect(s.total_scans).toBe(1);
    expect(s.bmr.source).toBe('mifflin');
    expect(s.bmr.bmr).toBeNull();
  });

  test('rejects a date that is not YYYY-MM-DD, and requires a user', async () => {
    await expect(Q.bodyCompositionSummary(null, { date: '09/20/2026' }, ctx(ALICE))).rejects.toThrow('YYYY-MM-DD');
    await expect(Q.bodyCompositionSummary(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('derivedMacros', () => {
  /**
   * The inline arithmetic `derivedMacros` carried until 2026-09-22, copied
   * verbatim (minus the today index) as the reference: with no scan and a
   * standard plan the resolver must still return exactly this.
   */
  const legacyDerivedMacros = (ng) => {
    const goalWeightLbs = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
    const proteinPerLb = ng.protein_g_per_lb_goal ?? ng.protein_g_per_lb ?? 0.8;
    const fatPerLb = ng.fat_g_per_lb_goal ?? ng.fat_g_per_lb ?? 0.35;
    const proteinG = goalWeightLbs ? Math.round(proteinPerLb * goalWeightLbs) : 0;
    const fatG = goalWeightLbs ? Math.round(fatPerLb * goalWeightLbs) : 0;
    const proteinKcal = proteinG * 4;
    const fatKcal = fatG * 9;
    const mode = ng.calorie_target_mode || 'fixed';
    const dailyCal = ng.daily_calorie_target || ng.auto_base_calories || ng.fixed_calories || null;
    const weeklyBase = Array.isArray(ng.weekly_schedule) && ng.weekly_schedule.length === 7
      ? ng.weekly_schedule
      : (dailyCal ? new Array(7).fill(dailyCal) : [0, 0, 0, 0, 0, 0, 0]);
    const eatFrac = typeof ng.activity_eatback_fraction === 'number' ? ng.activity_eatback_fraction : 0.6;
    const eatCap = typeof ng.activity_eatback_cap_kcal === 'number' ? ng.activity_eatback_cap_kcal : 500;
    const weekly = weeklyBase.map((baseCal, idx) => ({
      dayIndex: idx, base_calories: baseCal, activity_add_kcal: 0, target_calories: baseCal,
      protein_g: proteinG, fat_g: fatG,
      carbs_g: Math.max(0, Math.round((baseCal - (proteinKcal + fatKcal)) / 4)),
    }));
    return {
      rules: { goal_weight_lbs: goalWeightLbs, protein_g_per_lb: proteinPerLb, fat_g_per_lb: fatPerLb, calorie_target_mode: mode, activity_eatback_fraction: eatFrac, activity_eatback_cap_kcal: eatCap },
      fixed: { protein_g: proteinG, fat_g: fatG, protein_kcal: proteinKcal, fat_kcal: fatKcal },
      calories: { daily: dailyCal, weekly_schedule: weeklyBase },
      weekly,
    };
  };

  const PLAN = {
    enabled: true,
    mode: 'standard',
    daily_calorie_target: 2798,
    goal_weight_lbs: 220,
    protein_g_per_lb_goal: 0.8,
    fat_g_per_lb_goal: 0.35,
    weekly_schedule: [2798, 2798, 2798, 2798, 3424, 3424, 2798],
  };

  const plain = (v) => JSON.parse(JSON.stringify(v));

  test('no scan, standard mode: the same numbers as the inline arithmetic it replaced', async () => {
    await UserSettings.create({ user_id: ALICE, nutrition_goal: PLAN });
    const out = await Q.derivedMacros(null, { date: '2026-09-25' }, ctx(ALICE)); // a Friday
    const settings = await UserSettings.getOrCreate(ALICE);
    const legacy = legacyDerivedMacros(settings.nutrition_goal);

    expect(plain(out.fixed)).toEqual(plain(legacy.fixed));
    expect(plain(out.calories)).toEqual(plain(legacy.calories));
    expect(plain(out.weekly)).toEqual(plain(legacy.weekly));
    expect(plain(out.rules)).toMatchObject(plain(legacy.rules));
    expect(out.rules.protein_basis).toBe('goal_weight');
    expect(out.rules.keto).toBe(false);
    // Today-index logic is unchanged: 2026-09-25 is a Friday → index 4.
    expect(out.todayIndex).toBe(4);
    expect(out.today).toMatchObject({ base_calories: 3424, protein_g: 176, fat_g: 77 });
  });

  test('a recent scan: protein per lb of measured lean mass', async () => {
    await UserSettings.create({ user_id: ALICE, nutrition_goal: PLAN });
    await scan(utc('2026-09-16')); // lean 178
    const out = await Q.derivedMacros(null, { date: '2026-09-20' }, ctx(ALICE));
    expect(out.rules).toMatchObject({ protein_basis: 'lean_mass', lean_mass_lb: 178, protein_g_per_lb_lean: 1 });
    expect(out.fixed.protein_g).toBe(178);
    expect(out.today.protein_g).toBe(178);
    // Fat stays per lb of goal weight; carbs the remainder.
    expect(out.today.fat_g).toBe(77);
    expect(out.today.carbs_g).toBe(Math.round((out.today.target_calories - 178 * 4 - 77 * 9) / 4));
  });

  test('a scan older than 30 days (by the caller\'s day) is ignored', async () => {
    await UserSettings.create({ user_id: ALICE, nutrition_goal: PLAN });
    await scan(utc('2026-08-01'));
    const out = await Q.derivedMacros(null, { date: '2026-09-20' }, ctx(ALICE));
    expect(out.rules.protein_basis).toBe('goal_weight');
    expect(out.fixed.protein_g).toBe(176);
  });

  test('keto is respected: the split\'s carbs, not hundreds of grams', async () => {
    await UserSettings.create({
      user_id: ALICE,
      nutrition_goal: { ...PLAN, weekly_schedule: undefined, daily_calorie_target: 2000, mode: 'keto' },
    });
    const out = await Q.derivedMacros(null, { date: '2026-09-21' }, ctx(ALICE));
    expect(out.rules.keto).toBe(true);
    expect(out.rules.protein_basis).toBe('percent');
    // classic split 70/25/5 of 2000 kcal
    expect(out.today).toMatchObject({ carbs_g: 25, protein_g: 125, fat_g: 156 });
  });
});

describe('the goal bridge callers pass the scan lean mass', () => {
  test('activeNutritionGoals and the AI context goals use lean-mass protein', async () => {
    await UserSettings.create({
      user_id: ALICE,
      nutrition_goal: { enabled: true, daily_calorie_target: 2400, goal_weight_lbs: 220 },
    });
    expect((await Q.activeNutritionGoals(null, {}, ctx(ALICE))).protein_grams).toBe(176);
    await scan(dayAt(-2)); // lean 178, recent by UTC today
    expect((await Q.activeNutritionGoals(null, {}, ctx(ALICE))).protein_grams).toBe(178);
    const ctxObj = await Q.fitnessInsightsContext(null, { days: 7 }, ctx(ALICE));
    expect(ctxObj.goals.nutrition.protein).toBe(178);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('addFitnessWeight — one weight per calendar day', () => {
  test('a second weigh-in on the same day updates that day\'s row', async () => {
    const first = await M.addFitnessWeight(null, { input: { weight_value: 318.4, log_date: utc('2026-09-22') } }, ctx(ALICE));
    const second = await M.addFitnessWeight(null, { input: { weight_value: 317.26, log_date: utc('2026-09-22'), notes: 'after run' } }, ctx(ALICE));

    const rows = await Weight.find({ userId: ALICE }).lean();
    expect(rows).toHaveLength(1);
    expect(String(second._id)).toBe(String(first._id));
    expect(rows[0]).toMatchObject({ weight_value: 317.3, notes: 'after run', source: 'manual' });
  });

  test('normalizes the day to UTC midnight, as REST does', async () => {
    // What the Date scalar produces from a client that sent an instant.
    const w = await M.addFitnessWeight(null, { input: { weight_value: 300, log_date: new Date('2026-09-22T15:30:00Z') } }, ctx(ALICE));
    expect(w.log_date.toISOString()).toBe('2026-09-22T00:00:00.000Z');
    // …and that instant's day is the same day as a midnight entry.
    await M.addFitnessWeight(null, { input: { weight_value: 301, log_date: utc('2026-09-22') } }, ctx(ALICE));
    expect(await Weight.countDocuments({ userId: ALICE })).toBe(1);
  });

  test('a day that already holds duplicates is collapsed to one row', async () => {
    const day = utc('2026-09-20');
    await Weight.collection.insertMany([
      { userId: ALICE, weight_value: 310, log_date: day, source: 'arboleaf_xlsx', notes: 'scale', created_at: new Date('2026-09-20T13:00:00Z'), updated_at: new Date('2026-09-20T13:00:00Z') },
      { userId: ALICE, weight_value: 312, log_date: day, source: 'manual', notes: '', created_at: new Date('2026-09-20T20:00:00Z'), updated_at: new Date('2026-09-20T20:00:00Z') },
    ]);
    await M.addFitnessWeight(null, { input: { weight_value: 311, log_date: day } }, ctx(ALICE));
    const rows = await Weight.find({ userId: ALICE }).lean();
    expect(rows).toHaveLength(1);
    // A typed value is a manual value, even over a scale row; notes kept when none sent.
    expect(rows[0]).toMatchObject({ weight_value: 311, source: 'manual', notes: 'scale' });
  });

  test('other days and other users are untouched', async () => {
    await M.addFitnessWeight(null, { input: { weight_value: 300, log_date: utc('2026-09-21') } }, ctx(ALICE));
    await M.addFitnessWeight(null, { input: { weight_value: 200, log_date: utc('2026-09-22') } }, ctx(BOB));
    const w = await M.addFitnessWeight(null, { input: { weight_value: 299, log_date: utc('2026-09-22') } }, ctx(ALICE));
    expect(w.source).toBe('manual');
    expect(await Weight.countDocuments({ userId: ALICE })).toBe(2);
    expect(await Weight.countDocuments({ userId: BOB })).toBe(1);
  });
});

describe('updateFitnessWeight', () => {
  test('a typed weight_value makes the row manual; a notes-only edit does not', async () => {
    const [row] = await Weight.create([{ userId: ALICE, weight_value: 310, log_date: utc('2026-09-20'), source: 'arboleaf_xlsx' }]);
    const notesOnly = await M.updateFitnessWeight(null, { id: String(row._id), input: { notes: 'hydrated' } }, ctx(ALICE));
    expect(notesOnly.source).toBe('arboleaf_xlsx');
    const corrected = await M.updateFitnessWeight(null, { id: String(row._id), input: { weight_value: 309 } }, ctx(ALICE));
    expect(corrected).toMatchObject({ weight_value: 309, source: 'manual' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('AI context — smoothed weight, body composition', () => {
  let originalChat;
  let lastPrompt;
  beforeAll(() => {
    originalChat = aiService.chat;
    aiService.chat = async (prompt) => { lastPrompt = prompt; return 'stubbed'; };
  });
  afterAll(() => { aiService.chat = originalChat; });

  const weigh = (offset, value, stamp) => Weight.collection.insertOne({
    userId: ALICE, weight_value: value, log_date: dayAt(offset), source: 'manual', notes: '',
    created_at: stamp || dayAt(offset), updated_at: stamp || dayAt(offset),
  });

  test('the trend is 7-day mean vs 7-day mean, not first vs last reading', async () => {
    for (let d = -27; d <= -21; d += 1) await weigh(d, 200);
    await weigh(-7, 194);
    for (let d = -6; d <= -1; d += 1) await weigh(d, 195);
    await weigh(0, 203); // one salty dinner
    // Raw first-in-window (194) vs last (203) says "gaining" by 9 lb.
    const ctxObj = await Q.fitnessInsightsContext(null, { days: 7 }, ctx(ALICE));
    expect(ctxObj.weight.trend).toBe('losing');
    expect(ctxObj.weight.change).toBeCloseTo(((195 * 6 + 203) / 7) - 200, 0);
    expect(ctxObj.weight.trendBasis.gapDays).toBeGreaterThanOrEqual(14);
    expect(ctxObj.weight.trendBasis.earlier.weighIns).toBe(7);
  });

  test('without two separated windows the trend says so, with no number', async () => {
    for (let d = -6; d <= 0; d += 1) await weigh(d, 200 + d);
    const ctxObj = await Q.fitnessInsightsContext(null, { days: 7 }, ctx(ALICE));
    expect(ctxObj.weight.trend).toBe('insufficient_data');
    expect(ctxObj.weight.change).toBeNull();
    expect(ctxObj.weight.trendNote).toMatch(/Not enough weigh-ins/);
  });

  test('one weight per day: a duplicate day is counted once, the newest row winning', async () => {
    await weigh(-2, 250, addDays(dayAt(-2), 0.1)); // older write
    await weigh(-2, 200, addDays(dayAt(-2), 0.5)); // newer write
    await weigh(-1, 200);
    const ctxObj = await Q.fitnessInsightsContext(null, { days: 7 }, ctx(ALICE));
    expect(ctxObj.weight.entries).toBe(2);
    expect(ctxObj.weight.average).toBe(200);
    expect(ctxObj.weight.max).toBe(200);
  });

  test('body composition is averages only, and reaches the prompt with its note', async () => {
    await scan(dayAt(-3), { body_fat_mass_lb: 142 });
    await scan(dayAt(-1), { body_fat_mass_lb: 138 });
    await Q.fitnessInsightsCoaching(null, {}, ctx(ALICE));
    const sent = JSON.parse(lastPrompt.slice(lastPrompt.indexOf('{'), lastPrompt.lastIndexOf('}') + 1));
    expect(sent.bodyComposition).toMatchObject({
      current: { scans: 2, lean_mass_lb: 178, fat_mass_lb: 140, from: ymd(dayAt(-3)), to: ymd(dayAt(-1)) },
      change: { available: false },
      bmr: { source: 'scan', value: katch(178) },
    });
    expect(sent.bodyComposition.change.available_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent.bodyComposition.note).toMatch(/never from a single scan/);
  });

  test('no scans → bodyComposition is null', async () => {
    const ctxObj = await Q.fitnessInsightsContext(null, { days: 7 }, ctx(ALICE));
    expect(ctxObj.bodyComposition).toBeNull();
  });
});
