import React, { useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Flag as GoalIcon } from '@mui/icons-material';
import { differenceInWeeks, differenceInDays, parseISO, format } from 'date-fns';
import { shortDay } from '../../utils/dates.js';
import { utcDateString } from '@geeksuite/utils';
import { programPace, neededPacePerWeek, trendSince } from './weightTrend.js';
import { LabelPanel, FactHeadline, FactRow, FactColumnHead, LabelBar, Rule, Tag } from '../primitives';

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
  // Simple (review L25): the trend in words first, and no chip or pace maths.
  simple = false
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

  if (!goal || !goal.enabled || !insights) {
    const noGoal = !goal || !goal.enabled;
    // A goal with nothing to measure yet is not a missing goal.
    const needsWeighIn = !noGoal && !currentWeight;
    // Simple with no goal still leads with the trend, once there is one.
    const looseTrend = simple && noGoal ? trendSince(weightLogs, null) : null;
    const trendLine = looseTrend ? (
      <Typography component="h3" data-testid="weight-trend-words" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, fontWeight: 700, lineHeight: 1.2, my: 1.5, textAlign: 'left' }}>
        {trendWords(looseTrend, unitWord(unit))}
      </Typography>
    ) : null;
    if (noGoal && firstRunGoal === 'lose' && onEditGoal) {
      // One sentence, one button. No heading announcing what's missing.
      return (
        <LabelPanel level={1} title="Your weight">
          {trendLine}
          <Typography sx={{ color: 'text.primary', fontSize: '1.0625rem', lineHeight: 1.5, mt: trendLine ? 0 : 1.5, mb: 2 }}>
            You said you&rsquo;d like to lose a little. Set a goal and this page will show how it&rsquo;s going.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<GoalIcon />}
            onClick={onEditGoal}
            sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
          >
            Set your goal
          </Button>
        </LabelPanel>
      );
    }
    return (
      <LabelPanel level={1} title="Your weight">
        {trendLine}
        <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem', mt: 1.5, mb: 0.5 }}>
          {needsWeighIn ? 'Weigh in to see your progress' : 'No weight goal yet'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {needsWeighIn
            ? 'Your goal is set. Log a weight and your progress shows here.'
            : 'Set a weight goal and this page will show how it’s going.'}
        </Typography>
        {onEditGoal && !needsWeighIn && (
          <Button
            variant="outlined"
            startIcon={<GoalIcon />}
            onClick={onEditGoal}
            sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
          >
            Set your goal
          </Button>
        )}
      </LabelPanel>
    );
  }

  // Theme palette only — no hex literals (F10). Nothing on this panel is red
  // (review D-2: the plan says "nothing turns red"): behind plan is the
  // warning fill with the words "Behind plan" — never colour alone; ahead and
  // on track are the blue.
  const u = unitWord(unit);
  const total = Math.abs(goal.targetWeight - goal.startWeight);
  const moved = (total * (insights.progressPercent || 0)) / 100;
  const losing = goal.targetWeight < goal.startWeight;
  const movedWord = goal.targetWeight === goal.startWeight ? 'kept' : losing ? 'lost' : 'gained';
  const progressText = total > 0
    ? `${trim1(moved)} of ${trim1(total)} ${u} ${movedWord}`
    : 'Holding steady';
  const basis = `From your 7-day average, ${Number(currentWeight).toFixed(1)} ${u}`;
  const trend = simple ? trendSince(weightLogs, goal, currentWeight) : null;
  const pct = Math.round(insights.progressPercent || 0);
  const goalByDate = goal?.goalDate ? fmtYmd(utcDateString(goal.goalDate)) : '';

  const status = insights.isAhead
    ? { label: 'Ahead of plan', bg: 'primary.main' }
    : insights.isBehind
      ? { label: 'Behind plan', bg: 'warning.main' }
      : { label: 'On track', bg: 'primary.main' };

  const rateText = insights.currentRate === null
    ? '—'
    : `${Math.abs(insights.currentRate).toFixed(1)} ${u} a week`;

  return (
    <LabelPanel
      level={1}
      title="Your weight"
      meta="7-day average"
      metaRight={
        <>
          Goal <b>{trim1(goal.targetWeight)}</b> {u}{goalByDate ? ` by ${goalByDate}` : ''}
        </>
      }
    >
      {/* Simple leads with the trend in words (review L25): how it's going,
          not the goal maths. */}
      {trend && (
        <Box sx={{ py: 1.25 }}>
          <Typography component="h3" data-testid="weight-trend-words" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, fontWeight: 700, lineHeight: 1.2 }}>
            {trendWords(trend, u)}
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: '1rem', color: 'text.secondary' }}>{basis}</Typography>
        </Box>
      )}

      <FactHeadline caption="Amount this week" name="Weight" value={Number(currentWeight).toFixed(1)} unit={u} />
      <LabelBar value={insights.progressPercent} label={`Progress to goal weight: ${progressText}`} />
      {/* One basis for "to go", said out loud (review D-3). */}
      {!trend && (
        <Typography data-testid="weight-basis" sx={{ fontSize: '0.9375rem', color: 'text.secondary', mb: 0.5 }}>
          {basis}
        </Typography>
      )}

      <Rule weight="medium" />
      {!simple && <FactColumnHead>% of goal</FactColumnHead>}
      <FactRow first name="Started" amount={`${trim1(goal.startWeight)} ${u}`} />
      <FactRow
        name={<span data-testid="weight-progress-count">{progressText}</span>}
        percent={simple ? undefined : `${pct}%`}
      />
      <FactRow
        name={`${trim1(insights.remainingWeight || 0)} ${u} to go`}
        percent={simple ? undefined : `${Math.max(0, 100 - pct)}%`}
      />

      {/* Simple stops there: no status, no pace maths (review L25). */}
      {!simple && (
        <>
          <FactRow
            name="Pace"
            amount={
              <>
                {rateText}
                <Tag fill={status.bg} sx={{ ml: 1.5 }}>
                  <span data-testid="weight-status">{status.label}</span>
                </Tag>
              </>
            }
          />
          <FactRow
            name="Time left"
            amount={`${insights.weeksToGoal || 0} ${(insights.weeksToGoal || 0) === 1 ? 'week' : 'weeks'}`}
            of={`· ${insights.daysToGoal || 0} ${(insights.daysToGoal || 0) === 1 ? 'day' : 'days'} until ${goalByDate || '—'}`}
          />

          <Rule weight="medium" />
          {/* Pace: hers beside the one the dates need (review D-2) */}
          <Box data-testid="weight-pace" sx={{ pt: 1 }}>
            <Typography sx={{ fontWeight: 600, lineHeight: 1.4 }}>
              {paceSentence(insights, goal, u)}
            </Typography>
            {insights.currentRate === null && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {rateWaitText(insights.pace)}
              </Typography>
            )}
          </Box>

          {/* Projection, in words (review D-2) */}
          <Box data-testid="weight-projection" sx={{ pt: 1, pb: 0.5 }}>
            <Typography component="span" sx={{ fontWeight: 700, display: 'block' }}>
              {projectionHeadline(insights, goal)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {projectionCaption(insights, goal, u)}
            </Typography>
          </Box>
        </>
      )}

      {onEditGoal && (
        <Button
          variant="text"
          onClick={onEditGoal}
          sx={{ minHeight: 44, px: 0, mt: 0.5, fontWeight: 700, color: 'primary.main', justifyContent: 'flex-start', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
        >
          Change goal
        </Button>
      )}
    </LabelPanel>
  );
};

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

/** "Down 12.1 lb since June" (Simple's headline). */
function trendWords({ change, since }, u) {
  if (Math.abs(change) < 0.5) return `About the same since ${monthName(since)}`;
  return `${change < 0 ? 'Down' : 'Up'} ${trim1(Math.abs(change))} ${u} since ${monthName(since)}`;
}

/**
 * "You're losing 1.3 lb a week. To reach 195 by Dec 1 you'd need 1.5."
 * The needed pace is the dates' (neededPacePerWeek), not the stored rate.
 */
function paceSentence(insights, goal, u) {
  const needed = neededPacePerWeek(goal);
  const goalVerb = goal.targetWeight < goal.startWeight ? 'lose' : 'gain';
  const by = `To reach ${trim1(goal.targetWeight)} by ${fmtYmd(utcDateString(goal.goalDate))}`;
  if (goal.targetWeight === goal.startWeight || needed === null) {
    return insights.currentRate === null
      ? `Your goal is to stay at ${trim1(goal.targetWeight)} ${u}.`
      : `You’re ${insights.currentRate < 0 ? 'losing' : 'gaining'} ${Math.abs(insights.currentRate).toFixed(1)} ${u} a week.`;
  }
  const need = needed.toFixed(1);
  if (insights.currentRate === null) return `${by} you’d need to ${goalVerb} ${need} ${u} a week.`;
  const rate = insights.currentRate;
  if (Math.abs(rate) < 0.05) return `Your weight is holding steady. ${by} you’d need to ${goalVerb} ${need} ${u} a week.`;
  const verb = rate < 0 ? 'losing' : 'gaining';
  const sameWay = (rate < 0) === (goalVerb === 'lose');
  return `You’re ${verb} ${Math.abs(rate).toFixed(1)} ${u} a week. ${by} you’d need ${sameWay ? need : `to ${goalVerb} ${need}`}.`;
}

/** Why there's no measured rate yet. */
function rateWaitText(pace) {
  if (pace?.phase === 'not-started') return `Your own pace shows once you start, ${fmtYmd(pace.startDate)}`;
  const left = Math.max(1, 14 - (pace?.programDays || 0));
  return `Your own pace shows after 2 weeks in (${left} day${left === 1 ? '' : 's'} to go)`;
}

/** The projection's big line: a time of month only when there is an honest one. */
function projectionHeadline(insights, goal) {
  const { pace } = insights;
  if (!pace || pace.phase !== 'measured') return `Your plan finishes ${fmtYmd(utcDateString(goal.goalDate))}`;
  if (pace.projectedDate) return `At this pace: ${whenInWords(pace.projectedDate)}`;
  if (pace.heading === 'away') return 'Not heading toward your goal yet';
  return 'At this pace: well past your goal date';
}

/** …and what it means against the goal date. */
function projectionCaption(insights, goal, u) {
  const { pace } = insights;
  const goalRate = `${Math.abs(insights.goalRate || 0).toFixed(1)} ${u} a week`;
  if (!pace || pace.phase === 'none') return `Your plan, at ${goalRate}`;
  if (pace.phase === 'not-started') return `Your plan, at ${goalRate} — the program starts ${fmtYmd(pace.startDate)}`;
  if (pace.phase === 'too-early') return `Your plan, at ${goalRate}, until there are two weeks of weigh-ins to measure your own pace`;
  if (pace.projectedDate) {
    const days = insights.daysAheadBehind;
    if (Math.abs(days) <= 7) return 'That’s right about your goal date.';
    return `That’s ${gapInWords(days)} ${days < 0 ? 'after' : 'before'} your goal date.`;
  }
  if (pace.heading === 'away') return `Your trend since ${fmtYmd(pace.startDate)} is going the other way — early weeks are noisy`;
  return `At this pace the finish is more than twice the plan’s length out`;
}

export default WeightProgress;
