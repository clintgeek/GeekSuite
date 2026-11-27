import { useCallback, useEffect, useRef, useState } from 'react';
import { fitnessGeekService } from '../../services/fitnessGeekService.js';
import { goalsService } from '../../services/goalsService.js';
import { weightService } from '../../services/weightService.js';
import { bpService } from '../../services/bpService.js';
import { streakService } from '../../services/streakService.js';
import { weightStatView } from '../Dashboard/weightStatView.js';
import { newestReading } from '../../utils/checkIns.js';

/**
 * Everything Today reads for the day on screen (DOCS/ONE_APP_PLAN.md §1).
 *
 * Two kinds of read. The day's FOOD (its summary and its logs) belongs to
 * `day`, the day on screen. Everything else (the target, the weight and blood
 * pressure rows, Garmin's steps, the streak) belongs to `today`, the real
 * one, whichever day is being looked at.
 *
 * So a food write, and moving to another day, re-ask only the two food reads
 * and reuse the rest: the refresh used to re-fire all eight, five of them
 * live Garmin calls (SUITE_REVIEW_2026-11 FitnessGeek #5).
 *
 * A failed read is not an empty day (review L1). During a fleet restart, or
 * on a weak signal, the day's reads fail; each read that fails keeps what
 * was on screen for the same day, one that never succeeded stays unknown
 * (`known`), and `loadProblem` says so. Yesterday's meals are never shown as
 * today's: while the day on screen has not answered yet, `loading` is true.
 *
 * Fast taps on the day arrows can let a slow answer for Tuesday arrive after
 * Wednesday's; only the newest read may write the page (B19).
 */

// Wraps a service call so a missing method (or a sync throw) lands in
// allSettled as a rejection instead of escaping it.
const safe = (fn) => Promise.resolve().then(fn);
// Indexes of the reads a food write, or another day, can change: the day's
// summary (0) and its logs (4).
const FOOD_READS = new Set([0, 4]);
// Newest weight / BP rows asked for. Today's check-ins and the latest
// reading are all the page shows; a day never holds anywhere near this many.
const RECENT_ROWS = 20;

const rowsOf = (res) => {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : [];
};
// The streak query answers through apiService's envelope: { success, data }.
const streakDays = (res) => {
  const body = res?.data ?? res;
  const n = Number(body?.currentStreak);
  return Number.isFinite(n) ? n : 0;
};
const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? Math.round(v) : null);

const EMPTY_DATA = {
  calories: { consumed: 0, goal: 0 },
  netCarbs: 0,
  macros: {
    protein: { current: 0, goal: 150 },
    carbs: { current: 0, goal: 250 },
    fat: { current: 0, goal: 65 },
  },
  stats: {
    weight: { value: '—', unit: '', caption: '' },
    bloodPressure: { systolic: null, diastolic: null, trend: null, trendValue: '' },
    steps: { value: null, trend: null, trendValue: '' },
    streak: { value: 0 },
  },
};

export function useDayData({ day, today, onError }) {
  // The day the data on screen belongs to; null until the first answer.
  const [shownDay, setShownDay] = useState(null);
  const [logs, setLogs] = useState([]);
  // null = couldn't be read, and nothing from before (todayStrip leaves it out).
  const [checkIns, setCheckIns] = useState({ weights: null, bloodPressures: null });
  // Which reads have succeeded. A read that fails keeps the last good value
  // for the same day; one that has never succeeded is unknown, and the page
  // never draws "nothing" from it.
  const [known, setKnown] = useState({ day: null, today: null, logs: false, summary: false, goals: false });
  const [loadProblem, setLoadProblem] = useState(false);
  const [data, setData] = useState(EMPTY_DATA);
  const [proteinBasis, setProteinBasis] = useState(null);
  // The target without, and the extra for, today's activity.
  const [allowance, setAllowance] = useState({ base: 0, add: 0 });

  const shownRef = useRef({ day: null, today: null });
  // The last settled answer of every read, for this `today`.
  const lastReadsRef = useRef(null);
  const seqRef = useRef(0);
  // The load must not re-run because a callback changed identity.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async ({ foodOnly = false } = {}) => {
    const seq = ++seqRef.current;
    try {
      const cached = foodOnly && lastReadsRef.current?.today === today ? lastReadsRef.current.results : null;
      const reads = [
        () => fitnessGeekService.getDailySummary(day),
        () => goalsService.getDerivedMacros(),
        () => weightService.getWeightStats(),
        // `today` (local) — NOT the no-argument form: the containers run
        // UTC, and an evening dashboard asked Garmin about tomorrow.
        () => fitnessGeekService.getGarminDaily(today),
        () => fitnessGeekService.getLogsForDate(day),
        () => streakService.getLoginStreak(),
        // The newest few only: "Weighed today", "BP today" and the latest
        // reading — not every row ever (review 2026-11 #1).
        () => weightService.getWeightLogs({ limit: RECENT_ROWS }),
        () => bpService.getBPLogs({ limit: RECENT_ROWS }),
      ];
      const reuse = (i) => cached && !FOOD_READS.has(i);
      const settled = await Promise.allSettled(reads.map((fn, i) => (reuse(i) ? null : safe(fn))));
      // A newer read owns the page; this answer is for a day no longer shown.
      if (seq !== seqRef.current) return;
      const results = settled.map((r, i) => (reuse(i) ? cached[i] : r));
      lastReadsRef.current = { today, results };
      const [summaryResult, goalsResult, weightResult, garminResult, logsResult, streakResult, weightsResult, bpsResult] = results;

      const value = (r) => (r.status === 'fulfilled' ? r.value : null);
      const ok = (r) => r.status === 'fulfilled';
      const logsOk = ok(logsResult);
      const summaryOk = ok(summaryResult);
      const goalsOk = ok(goalsResult);

      // What's on screen is this day's: a failed read may keep it.
      const sameDay = shownRef.current.day === day;
      const sameToday = shownRef.current.today === today;
      shownRef.current = { day, today };

      // A failed check-in read keeps what today already showed (null if
      // nothing), so a blip never turns "Weighed ✓" into "Weigh in +".
      setCheckIns((prev) => ({
        weights: ok(weightsResult) ? rowsOf(value(weightsResult)) : (sameToday ? prev.weights : null),
        bloodPressures: ok(bpsResult) ? rowsOf(value(bpsResult)) : (sameToday ? prev.bloodPressures : null),
      }));
      setKnown((prev) => ({
        day,
        today,
        logs: logsOk || (prev.day === day && prev.logs),
        summary: summaryOk || (prev.day === day && prev.summary),
        goals: goalsOk || (prev.today === today && prev.goals),
      }));
      // The reads that decide what the card and the meals say.
      setLoadProblem(!logsOk || !summaryOk || !goalsOk);

      if (logsOk) setLogs(rowsOf(value(logsResult)));
      else if (!sameDay) setLogs([]);

      const summary = value(summaryResult)?.data || value(summaryResult) || null;
      const derived = value(goalsResult);
      const payload = derived?.data || derived || null;
      const todayTargets = payload?.today;
      setProteinBasis(payload?.rules?.protein_basis || null);
      if (goalsOk) {
        setAllowance({
          base: Math.round(todayTargets?.base_calories || 0),
          add: Math.round(todayTargets?.activity_add_kcal || 0),
        });
      } else if (!sameToday) {
        setAllowance({ base: 0, add: 0 });
      }

      const weight = value(weightResult)?.data ? weightStatView(value(weightResult).data) : null;
      // The newest reading by when it was taken, not the first row of the day.
      const bp = newestReading(rowsOf(value(bpsResult)));
      const garmin = value(garminResult);
      const streak = value(streakResult);

      setData((prev) => {
        // A failed read keeps the last good value, for this day only.
        const keep = (isOk, fresh, old, empty) => (isOk ? fresh : sameDay ? old : empty);
        const goal = goalsOk
          ? num(todayTargets?.target_calories ?? todayTargets?.calories ?? payload?.calories?.daily) ?? (summary?.calorieGoal || prev.calories.goal)
          : (summary?.calorieGoal || (sameToday ? prev.calories.goal : 0));
        let bpTrend = 'normal';
        let bpTrendValue = '';
        if (bp && (bp.systolic >= 140 || bp.diastolic >= 90)) { bpTrend = 'up'; bpTrendValue = 'High'; }
        else if (bp && (bp.systolic < 90 || bp.diastolic < 60)) { bpTrend = 'down'; bpTrendValue = 'Low'; }
        const freshMacros = {
          protein: { current: summary?.totals?.protein_grams || 0, goal: num(todayTargets?.protein_g ?? payload?.fixed?.protein_g) ?? summary?.proteinGoal ?? 150 },
          carbs: { current: summary?.totals?.carbs_grams || 0, goal: num(todayTargets?.carbs_g) ?? summary?.carbsGoal ?? 250 },
          fat: { current: summary?.totals?.fat_grams || 0, goal: num(todayTargets?.fat_g ?? payload?.fixed?.fat_g) ?? summary?.fatGoal ?? 65 },
        };
        return {
          calories: { consumed: keep(summaryOk, summary?.totals?.calories || 0, prev.calories.consumed, 0), goal: goal || 0 },
          netCarbs: keep(summaryOk, summary?.totals?.net_carbs_grams || 0, prev.netCarbs, 0),
          macros: keep(summaryOk, freshMacros, prev.macros, freshMacros),
          stats: {
            weight: weight || prev.stats.weight,
            bloodPressure: bp
              ? { systolic: bp.systolic, diastolic: bp.diastolic, trend: bpTrend, trendValue: bpTrendValue }
              : prev.stats.bloodPressure,
            steps: garmin?.steps
              ? { value: garmin.steps, trend: garmin.steps > 8000 ? 'up' : 'down', trendValue: garmin.steps > 8000 ? `${((garmin.steps - 8000) / 1000).toFixed(1)}k` : '' }
              : prev.stats.steps,
            streak: { value: streakDays(streak) },
          },
        };
      });
    } catch (err) {
      console.error('Error loading the day:', err);
      if (seq === seqRef.current) onErrorRef.current?.(err);
    } finally {
      if (seq === seqRef.current) setShownDay(day);
    }
  }, [day, today]);

  // Another day on screen asks for that day's food only; the first load, and
  // a new "today", ask for everything.
  useEffect(() => {
    load({ foodOnly: lastReadsRef.current?.today === today });
  }, [load, today]);

  const reload = useCallback(() => load(), [load]);
  const reloadFood = useCallback(() => load({ foodOnly: true }), [load]);

  return {
    loading: shownDay !== day,
    logs,
    data,
    known,
    loadProblem,
    checkIns,
    proteinBasis,
    allowance,
    reload,
    reloadFood,
  };
}

export default useDayData;
