import React, { useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Flag as GoalIcon } from '@mui/icons-material';
import { differenceInWeeks, differenceInDays, parseISO, format } from 'date-fns';
import { nearDay, shortDay } from '../../utils/dates.js';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { programPace, neededPacePerWeek, trendSince } from './weightTrend.js';
import { LabelPanel, FactRow, LabelBar, Rule } from '../primitives';

const WeightProgress = ({
  weightLogs = [],
  goal = null,
  currentWeight = null,
  unit = 'lbs',
  onEditGoal,
  // The first run's answer, in her words (`experience.goal`). "Lose a little"
  // was stored and never used (review Phase 2.14); here it turns the empty
  // card into the next step.
  firstRunGoal = null,
  // The goal could not be read (not the same as having none): say so, and
  // offer a retry, never "No weight goal yet".
  goalUnknown = false,
  onRetryGoal
}) => {
  const insights = useMemo(() => {
    if (!goal || !goal.enabled || !currentWeight || !goal.startDate || !goal.goalDate) {
      return null;
    }

    try {
      const startDate = parseISO(goal.startDate);
      const goalDate = parseISO(goal.goalDate);
      const today = new Date();

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(goalDate.getTime())) {
        return null;
      }

    // PROGRESS IS DIRECTIONAL. Both of these used to be wrapped in
    // `Math.abs`, which threw the direction away and counted movement AWAY
    // from the target as progress: start 200, target 180, now 210 rendered
    // "50.0% Complete" with a half-filled bar — sitting next to a correctly
    // computed "30.0 lbs to go" — and 220 rendered 100%. The right answer in
    // both cases is 0%.
    //
    // Signed delta over signed goal: same sign means moving toward the
    // target, opposite means away. Clamped to 0..100, so overshooting reads
    // as complete and backsliding reads as none.
    const goalDelta = goal.targetWeight - goal.startWeight;
    const currentDelta = currentWeight - goal.startWeight;
    // A maintenance goal (target === start) has no distance to cover; 0/0 used
    // to produce NaN, which rendered "0.0%" on the label but passed NaN to the
    // progress bar's `value`.
    const progressPercent = goalDelta === 0
      ? (currentDelta === 0 ? 100 : 0)
      : Math.min(Math.max((currentDelta / goalDelta) * 100, 0), 100);

    // Calculate time metrics. Before the start date "time elapsed" is 0, not
    // negative.
    const weeksToGoal = Math.max(0, differenceInWeeks(goalDate, today));
    const daysToGoal = Math.max(0, differenceInDays(goalDate, today));
    const totalDays = Math.max(1, differenceInDays(goalDate, startDate));
    const timeProgressPercent = Math.min(Math.max((differenceInDays(today, startDate) / totalDays) * 100, 0), 100);

    // PACE IS THE PROGRAM'S (weightTrend.js `programPace`, Chef 2026-10-14).
    // This used to be "the last 6 weeks of logs", whatever the goal said —
    // before a program, or early in one, that measured the flat weight of
    // life before it, and remaining ÷ ~0 projected "2050". Now: weigh-ins on
    // or after the start date only; no rate and no forecast until two weeks
    // of them; and a forecast more than two plan-lengths out is not printed
    // as a date.
    const remainingWeight = Math.abs(goal.targetWeight - currentWeight);
    const pace = programPace(weightLogs, goal);
    const measured = pace.phase === 'measured';
    const currentRate = measured ? pace.slopePerWeek : null;
    const useGoalRateForProjection = !measured;

    let projectedDate = null;
    let daysAheadBehind = 0;
    if (!measured) {
      // Not started, or too early to measure: the plan is the projection.
      projectedDate = goalDate;
    } else if (pace.projectedDate) {
      projectedDate = new Date(`${pace.projectedDate}T12:00:00`);
      daysAheadBehind = differenceInDays(goalDate, projectedDate);
    } else if (pace.heading === 'toward' || pace.heading === 'flat') {
      // Heading the right way, just slowly: behind by more than a plan.
      daysAheadBehind = -totalDays;
    } else if (pace.heading === 'away') {
      daysAheadBehind = -totalDays;
    }

    // Status
    const isOnTrack = Math.abs(daysAheadBehind) <= 7; // Within 1 week
    const isAhead = daysAheadBehind > 7;
    const isBehind = daysAheadBehind < -7;

    return {
      progressPercent,
      currentRate,
      goalRate: goal.ratePerWeek,
      remainingWeight,
      daysToGoal,
      weeksToGoal,
      daysAheadBehind,
      projectedDate: projectedDate && !isNaN(projectedDate.getTime()) ? projectedDate : null,
      isOnTrack,
      isAhead,
      isBehind,
      timeProgressPercent,
      useGoalRateForProjection,
      pace
    };
    } catch (error) {
      console.error('Error calculating weight progress insights:', error);
      return null;
    }
  }, [weightLogs, goal, currentWeight, unit]);

  const latest = latestWeighIn(weightLogs);

  if (!goal || !goal.enabled || !insights) {
    const noGoal = !goal || !goal.enabled;
    // A goal with nothing to measure yet is not a missing goal.
    const needsWeighIn = !noGoal && !currentWeight;
    const hasLogs = Array.isArray(weightLogs) && weightLogs.length > 0;
    // With no goal the card still leads with the number and, once there is
    // one, the trend. It used to show neither: a person who weighs in but
    // never set a goal opened this page to "No weight goal yet".
    const looseTrend = noGoal ? trendSince(weightLogs, null) : null;
    const number = hasLogs && Number.isFinite(Number(currentWeight)) && Number(currentWeight) > 0
      ? <BigWeight value={currentWeight} unit={unitWord(unit)} latest={latest} />
      : null;
    const trendLine = looseTrend ? (
      <Typography component="h3" data-testid="weight-trend-words" sx={TREND_SX}>
        {trendWords(looseTrend, unitWord(unit))}
      </Typography>
    ) : null;
    const lead = number || trendLine ? (
      <Box sx={{ pb: 4, mb: 4, borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
        {number}
        {trendLine}
      </Box>
    ) : null;
    const goalButton = onEditGoal && !needsWeighIn ? (
      <Button
        variant="tonal"
        startIcon={<GoalIcon />}
        onClick={onEditGoal}
        sx={{ minHeight: 48, mt: 4, width: { xs: '100%', sm: 'auto' } }}
      >
        Set your goal
      </Button>
    ) : null;
    if (noGoal && goalUnknown) {
      return (
        <LabelPanel level={1} title="Your weight">
          {lead}
          <Typography role="alert" data-testid="weight-goal-unknown" sx={{ fontWeight: 600, fontSize: '1rem', mb: 1 }}>
            Couldn&rsquo;t load your goal
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.5 }}>
            Your weigh-ins are fine. The goal just didn&rsquo;t come through.
          </Typography>
          {onRetryGoal && (
            <Button variant="tonal" onClick={onRetryGoal} sx={{ minHeight: 48, mt: 4, width: { xs: '100%', sm: 'auto' } }}>
              Try again
            </Button>
          )}
        </LabelPanel>
      );
    }
    if (noGoal && firstRunGoal === 'lose' && onEditGoal) {
      // One sentence, one button. No heading announcing what's missing.
      return (
        <LabelPanel level={1} title="Your weight">
          {lead}
          <Typography sx={{ color: 'text.primary', fontSize: '1rem', lineHeight: 1.5 }}>
            You said you&rsquo;d like to lose a little. Set a goal and this page will show how it&rsquo;s going.
          </Typography>
          {goalButton}
        </LabelPanel>
      );
    }
    return (
      <LabelPanel level={1} title="Your weight">
        {lead}
        <Typography sx={{ fontWeight: 600, fontSize: '1rem', mb: 1 }}>
          {needsWeighIn ? 'Weigh in to see your progress' : 'No weight goal yet'}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.5 }}>
          {needsWeighIn
            ? 'Your goal is set. Log a weight and your progress shows here.'
            : 'Set a weight goal and this page will show how it’s going.'}
        </Typography>
        {goalButton}
      </LabelPanel>
    );
  }

  // Nothing on this panel grades her (round-two review: someone down 12 lb
  // read "Behind plan", "Off track" and "well past your goal date"). The
  // progress leads; the pace is a fact with the plan's beside it; and where
  // the pace lands is said once, as information, with a way to move the date.
  // No status tag, nothing red, nothing amber.
  const u = unitWord(unit);
  const total = Math.abs(goal.targetWeight - goal.startWeight);
  const moved = (total * (insights.progressPercent || 0)) / 100;
  const losing = goal.targetWeight < goal.startWeight;
  const movedWord = goal.targetWeight === goal.startWeight ? 'kept' : losing ? 'lost' : 'gained';
  const progressText = total > 0
    ? `${trim1(moved)} of ${trim1(total)} ${u} ${movedWord}`
    : 'Holding steady';
  const trend = trendSince(weightLogs, goal, currentWeight);
  const pct = Math.round(insights.progressPercent || 0);
  const goalByDate = goal?.goalDate ? fmtYmd(utcDateString(goal.goalDate)) : '';

  const measured = insights.currentRate !== null;
  const needed = neededPacePerWeek(goal);
  const forecast = forecastWords(insights, goal, u);

  return (
    <LabelPanel level={1} title="Your weight">
      {/* The number first, big; then how it's going, in words (review L25);
          then the goal maths. The number is the 7-day average, and says so
          above it: it is the one basis "to go" is measured from (review
          D-3). Her latest weigh-in sits right under it. */}
      <BigWeight value={currentWeight} unit={u} latest={latest} />
      {trend && (
        <Typography component="h3" data-testid="weight-trend-words" sx={TREND_SX}>
          {trendWords(trend, u)}
        </Typography>
      )}

      {/* The goal: what it is, how far along, what is left. The percent sits
          on the bar it describes. */}
      <Box sx={{ mt: 4, pt: 4, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 3 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', minWidth: 0 }}>
            Goal {trim1(goal.targetWeight)} {u}
            {goalByDate && (
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> by {goalByDate}</Box>
            )}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {pct}%
          </Typography>
        </Box>
        <LabelBar value={insights.progressPercent} label={`Progress to goal weight: ${progressText}`} sx={{ my: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap', fontSize: '0.9375rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          <span data-testid="weight-progress-count">{progressText}</span>
          <span>{`${trim1(insights.remainingWeight || 0)} ${u} to go`}</span>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <FactRow name="Started" amount={`${trim1(goal.startWeight)} ${u}`} />
        {/* Her pace beside the one the dates need (review D-2): two numbers,
            no verdict. */}
        <Box data-testid="weight-pace">
          <FactRow
            name="Pace"
            amount={measured ? `${Math.abs(insights.currentRate).toFixed(1)} ${u} a week` : 'Not measured yet'}
            of={measured && needed !== null && total > 0 ? `· your plan needs ${needed.toFixed(1)}` : undefined}
          />
          {!measured && (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, mt: -1, pb: 2 }}>
              {rateWaitText(insights.pace)}
            </Typography>
          )}
        </Box>
      </Box>

      <Rule />
      {/* Where this pace lands, said once and plainly (review D-2). */}
      <Box data-testid="weight-projection" sx={{ pt: 3 }}>
        <Typography sx={{ lineHeight: 1.5 }}>
          {forecast.line}
        </Typography>
        {forecast.note && (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5, mt: 0.5 }}>
            {forecast.note}
          </Typography>
        )}
      </Box>

      {onEditGoal && (
        <Button
          variant="text"
          onClick={onEditGoal}
          data-testid="weight-change-goal"
          sx={{ minHeight: 44, px: 0, mt: 2, mb: -2, fontWeight: 600, color: 'primary.main', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
        >
          {forecast.late ? 'Move the date or change the goal' : 'Change goal'}
        </Button>
      )}
    </LabelPanel>
  );
};

/** The trend in words, under the number. */
const TREND_SX = { m: 0, mt: 2, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.3 };

/**
 * Her newest weigh-in: `{ value, when }` with `when` as the log list says it
 * ("Today", "Yesterday", "Tuesday", "Nov 21"), or null. `log_date` is a
 * calendar day stored at UTC midnight, so it is read with `utcDateString`.
 */
export function latestWeighIn(logs, today = localDateString()) {
  let best = null;
  for (const log of Array.isArray(logs) ? logs : []) {
    const value = parseFloat(log?.weight_value);
    const day = log?.log_date ? utcDateString(log.log_date) : '';
    if (!day || !Number.isFinite(value) || value <= 0) continue;
    if (!best || day > best.day) best = { day, value };
  }
  return best ? { value: best.value, when: nearDay(best.day, today) } : null;
}

/**
 * The page's one big figure: the 7-day average, named as that ABOVE the
 * number, with her own latest weigh-in on a plain line right under it.
 *
 * The average stays the headline on purpose: "to go" and the pace are
 * measured from it. But she weighed 218.7 this morning and the card said
 * 219.9 with its basis in small print underneath, which read as a wrong
 * number (review, round three). The label now comes first, and the number
 * she saw on the scale is always in view beside it.
 */
function BigWeight({ value, unit, latest = null }) {
  return (
    <Box>
      <Typography data-testid="weight-basis" sx={{ m: 0, mb: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>
        7-day average
      </Typography>
      <Typography
        component="p"
        data-testid="weight-now"
        sx={{ m: 0, fontWeight: 700, fontSize: { xs: '2.5rem', sm: '2.75rem' }, lineHeight: 1.05, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {Number(value).toFixed(1)}
        <Box component="span" sx={{ fontSize: '1.125rem', fontWeight: 500, letterSpacing: 0, color: 'text.secondary' }}> {unit}</Box>
      </Typography>
      {latest && (
        <Typography data-testid="weight-latest" sx={{ mt: 2, fontSize: '0.9375rem', color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
          {latest.when}: <Box component="span" sx={{ fontWeight: 600 }}>{latest.value.toFixed(1)} {unit}</Box>
        </Typography>
      )}
    </Box>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const unitWord = (unit) => (unit === 'lbs' ? 'lb' : unit);
/** 12.1 → "12.1", 37 → "37". */
const trim1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1).replace(/\.0$/, '');
/** "Dec 1", with the year only when it isn't this year. */
const fmtYmd = (ymd) => (ymd ? shortDay(ymd) : '');
const todayYmd = () => format(new Date(), 'yyyy-MM-dd');
const yearOf = (ymd) => Number(String(ymd).slice(0, 4));
const monthName = (ymd) => {
  const name = MONTHS[Number(String(ymd).slice(5, 7)) - 1] || '';
  return yearOf(ymd) === yearOf(todayYmd()) ? name : `${name} ${yearOf(ymd)}`;
};

/** "late February", "early March 2027" — a forecast is a part of a month, not a day. */
function whenInWords(ymd) {
  const day = Number(String(ymd).slice(8, 10));
  const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
  return `${part} ${monthName(ymd)}`;
}

/** 88 days → "about 3 months"; 12 → "about 2 weeks"; 3 → "a few days". */
function gapInWords(days) {
  const d = Math.abs(Math.round(days));
  if (d < 7) return 'a few days';
  if (d < 45) {
    const w = Math.round(d / 7);
    return `about ${w} week${w === 1 ? '' : 's'}`;
  }
  const m = Math.round(d / 30.4);
  return `about ${m} month${m === 1 ? '' : 's'}`;
}

/** "Down 12.1 lb since June" (the card's headline). */
function trendWords({ change, since }, u) {
  if (Math.abs(change) < 0.5) return `About the same since ${monthName(since)}`;
  return `${change < 0 ? 'Down' : 'Up'} ${trim1(Math.abs(change))} ${u} since ${monthName(since)}`;
}

/** Why there's no measured rate yet. */
function rateWaitText(pace) {
  if (pace?.phase === 'not-started') return `Your own pace shows once you start, ${fmtYmd(pace.startDate)}.`;
  const left = Math.max(1, 14 - (pace?.programDays || 0));
  return `Your own pace shows after two weeks of weigh-ins (${left} more day${left === 1 ? '' : 's'}).`;
}

/** A finish further out than this is not named as a month. */
const FORECAST_MAX_DAYS = 548; // about 18 months

const daysFromToday = (ymd) => Math.round((new Date(`${ymd}T12:00:00`) - new Date(`${todayYmd()}T12:00:00`)) / 86400000);

/**
 * Where the pace lands, in one plain sentence, and (once) what that means
 * against the goal date.
 *
 * `line` is the sentence; `note` a quiet second line when there is something
 * useful to add; `late` is true when the goal date will be missed at this
 * pace, which is what turns "Change goal" into "Move the date or change the
 * goal". It is information, never a grade: the old card said "Behind plan",
 * "well past your goal date" and "more than twice the plan's length out" to a
 * person who had lost 12 lb.
 */
function forecastWords(insights, goal, u) {
  const { pace } = insights;
  const goalDay = fmtYmd(utcDateString(goal.goalDate));
  const target = `${trim1(goal.targetWeight)} ${u}`;
  const needed = neededPacePerWeek(goal);
  const goalVerb = goal.targetWeight < goal.startWeight ? 'lose' : 'gain';
  const plan = needed !== null && goal.targetWeight !== goal.startWeight
    ? `To reach ${target} by ${goalDay} you’d ${goalVerb} about ${needed.toFixed(1)} ${u} a week.`
    : `Your goal is to stay at ${target}.`;

  if (!pace || pace.phase === 'none') return { line: plan, note: null, late: false };
  // Not started, or too early to measure: the plan is the forecast. The Pace
  // row above already says when her own pace will show.
  if (pace.phase !== 'measured') return { line: plan, note: null, late: false };

  if (pace.heading === 'done') return { line: `You’re at your goal of ${target}.`, note: null, late: false };
  if (pace.projectedDate) {
    const days = insights.daysAheadBehind;
    const when = `At this pace you’d get there around ${whenInWords(pace.projectedDate)}`;
    if (Math.abs(days) <= 7) return { line: `${when}, right about your goal date.`, note: null, late: false };
    if (days > 0) return { line: `${when}, ${gapInWords(days)} ahead of your goal date.`, note: null, late: false };
    return {
      line: `${when}, ${gapInWords(days)} after your ${goalDay} goal date.`,
      note: 'That’s still steady progress. You can move the date whenever you like.',
      late: true,
    };
  }
  if (pace.heading === 'away') {
    return {
      line: `Your weight hasn’t started moving toward ${target} yet.`,
      note: 'The first weeks bounce around. Keep weighing in and this will settle.',
      late: false,
    };
  }
  // Heading the right way, but landing a long way past the goal date.
  const far = pace.finishDate && daysFromToday(pace.finishDate) <= FORECAST_MAX_DAYS;
  if (far) {
    return {
      line: `At this pace you’d get there around ${monthName(pace.finishDate)}, ${gapInWords(daysFromToday(pace.finishDate) - daysFromToday(utcDateString(goal.goalDate)))} after your ${goalDay} goal date.`,
      note: 'That’s still steady progress. You can move the date whenever you like.',
      late: true,
    };
  }
  return {
    line: pace.heading === 'flat'
      ? `Your weight is holding steady, so ${goalDay} is likely to come first.`
      : `At this pace ${target} is more than a year away, so ${goalDay} is likely to come first.`,
    note: 'A later date or a closer goal may suit you better.',
    late: true,
  };
}

export default WeightProgress;
