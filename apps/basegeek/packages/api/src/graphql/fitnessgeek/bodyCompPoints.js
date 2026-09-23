/**
 * bodyCompPoints.js — stored body-composition scans, turned into the plain
 * points `@geeksuite/utils`' bodyComp.js averages over.
 *
 * bodyComp.js is deliberately ignorant of the stored document: it takes
 * `{ date, weight_lb, fat_mass_lb, lean_mass_lb, … }` and answers only with
 * window means (the smoothing rule, DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §0).
 * This module is the one place the gateway maps a `BodyComposition` document
 * onto that shape, so the two queries, `derivedMacros`, the goal bridge and
 * the AI context all average the same numbers.
 *
 * Everything that is not a stored primary comes from `derive()` in
 * `@geeksuite/schemas` — the stored document holds only what cannot be
 * recomputed, and derive() is the one recomputation.
 *
 * Dependency-injected: every loader takes `{ BodyComposition }` so tests can
 * hand in a fake model, and so this file never opens a connection itself.
 */

import derivationModule from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';
import { leanMassLb, leanMassForTargets, utcMidnightToday } from '@geeksuite/utils';

// CommonJS module: default import + destructure, the interop form that works
// under Node ESM and jest's --experimental-vm-modules alike (see
// models/BodyComposition.js).
const { derive } = derivationModule;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * One stored scan as a bodyComp.js point.
 *
 * `date` is the scan's `log_date` — the CALENDAR day it counts for — never
 * `measured_at`, the instant. bodyComp.js buckets by calendar day.
 *
 * @param {Object} doc a lean `BodyComposition` document
 * @returns {Object} `{ date, weight_lb, fat_mass_lb, lean_mass_lb,
 *   body_fat_pct, body_water_pct, bmr_kcal, skeletal_muscle_lb,
 *   visceral_fat_index }`
 */
export function toBodyCompPoint(doc) {
  const d = derive(doc);
  return {
    date: doc.log_date,
    weight_lb: num(doc.weight_value),
    fat_mass_lb: num(doc.body_fat_mass_lb),
    lean_mass_lb: leanMassLb(doc),
    body_fat_pct: d.body_fat_pct,
    body_water_pct: d.body_water_pct,
    bmr_kcal: d.bmr_kcal,
    skeletal_muscle_lb: num(doc.skeletal_muscle_lb),
    visceral_fat_index: num(doc.visceral_fat_index),
  };
}

/**
 * Every scan a user has, oldest first by the instant it was taken.
 *
 * One unbounded query on purpose: history is at most a scan a day, and every
 * consumer needs the whole run (the 14-day current window ends at the LATEST
 * scan, the change baseline starts at the FIRST).
 *
 * @param {string} userId
 * @param {Object} deps
 * @param {Object} deps.BodyComposition the model
 * @param {Object} [opts]
 * @param {Date} [opts.through] only scans whose `log_date` is on/before this
 *   instant (for a context anchored on a past day)
 * @returns {Promise<Array<Object>>} lean documents
 */
export async function loadBodyCompScans(userId, { BodyComposition }, { through = null } = {}) {
  const query = { userId };
  if (through) query.log_date = { $lte: through };
  return BodyComposition.find(query).sort({ measured_at: 1 }).lean();
}

/**
 * `loadBodyCompScans`, mapped to points.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function loadBodyCompPoints(userId, deps, opts) {
  const docs = await loadBodyCompScans(userId, deps, opts);
  return docs.map(toBodyCompPoint);
}

/**
 * The lean mass a target may be built on today, or null — plan D1/D3: the
 * 14-day mean lean mass ending at the latest scan, while that scan is at most
 * 30 days old (`leanMassForTargets`).
 *
 * @param {string} userId
 * @param {string|Date|null|undefined} today the caller's calendar day
 *   (`YYYY-MM-DD`); without one, UTC's today — the 30-day tolerance makes the
 *   difference immaterial.
 * @param {Object} deps `{ BodyComposition }`
 * @returns {Promise<{lean_mass_lb: number, scans: number, latest: Date, age_days: number}|null>}
 */
export async function leanMassFor(userId, today, deps) {
  const points = await loadBodyCompPoints(userId, deps);
  if (!points.length) return null;
  return leanMassForTargets(points, { today: today || utcMidnightToday() });
}
