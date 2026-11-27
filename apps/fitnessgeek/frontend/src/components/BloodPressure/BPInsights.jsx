import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Favorite as HeartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
} from '@mui/icons-material';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { newestReadingFirst, readingWhen } from './bpTimeUtils.js';
import { bpGuidance, categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { LabelPanel, FactRow, Rule, Tag } from '../primitives';

/**
 * "Is my blood pressure OK?" — answered with the week, not one reading
 * (review D-1). The headline used to be the LAST reading's category, so one
 * good morning painted an elevated week "Normal". It leads with the 7-day
 * average and its category.
 *
 * ONE SENTENCE RECONCILES THE WEEK AND THE LATEST READING (round-two review).
 * The card said "A little high", then "Last reading… normal", then "Healthy
 * range 1 of 14" (a count over every reading ever, beside a 30-day average),
 * and left the person to work out which was true. Now: "Your average for the
 * last 7 days is a little high. Your last reading, today 7:42 AM, was
 * normal." The rows under it each name their window, and the count of normal
 * readings is for the same 30 days as the average above it ("1 of 14", never
 * "7%").
 *
 * THE BIG NUMBER SAYS WHAT IT IS, AND ONE THING HAS ONE NAME (round three).
 * 126/79 stood unlabelled over a sentence about "this week" and a row called
 * "30-day average" that happened to hold the same figure. A small label now
 * sits directly above it (`BP_LABELS`): "Average, last 7 days" (today and the
 * six days before it, which is what is computed), or "Last reading" when the
 * week is empty and the number is that. The sentence and the rows use the
 * same words: "last 7 days", "last 30 days", "last reading".
 */

/** The names this card uses, each in one place. */
export const BP_LABELS = Object.freeze({
  week: 'Average, last 7 days',
  last: 'Last reading',
  month: 'Average, last 30 days',
  trend: 'Trend, last 30 days',
});

/** "a little high (elevated)" → "a little high": the stage name is on the tag. */
const plain = (stage) => bpStageWords(stage).phrase.replace(/ \(.*\)$/, '');

/** The one sentence under the big number. */
export function bpSummarySentence({ weekStage, lastStage, lastWhen }) {
  const when = lastWhen ? `, ${lastWhen},` : '';
  if (!weekStage) {
    return `No readings in the last 7 days. Your last one${when} was ${plain(lastStage)}.`;
  }
  const week = `Your average for the last 7 days is ${plain(weekStage)}.`;
  return weekStage === lastStage
    ? `${week} So was your last reading${lastWhen ? `, ${lastWhen}` : ''}.`
    : `${week} Your last reading${when} was ${plain(lastStage)}.`;
}

// The category itself — name, thresholds — comes from the one shared categoriser.
const getBPCategory = (systolic, diastolic) => {
  const c = categorizeBP(systolic, diastolic);
  return { name: c.stage, tone: c.tone };
};

const BPInsights = ({ bpLogs = [] }) => {
  const theme = useTheme();
  const insights = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) {
      return null;
    }

    // Newest by the instant it was taken, not by `log_date`: every reading on
    // one day shares a `log_date`, so the morning reading could stay
    // "latest" after the evening one was saved.
    const sortedLogs = bpLogs.filter((l) => l && Number.isFinite(Number(l.systolic)) && Number.isFinite(Number(l.diastolic))).sort(newestReadingFirst);
    if (sortedLogs.length === 0) return null;
    const latestReading = sortedLogs[0];
    // "This week" / "30 days" are CALENDAR days: today and the 6 (29) before
    // it, on the device's calendar. `log_date` is a calendar day stored at
    // UTC midnight; comparing it with "this instant minus 7 days" put the
    // oldest day in or out by the hour — west of UTC, after 18:00 the week
    // lost its first day and the headline average moved (harness 67-bp-week,
    // red in Chicago evenings).
    const today = new Date();
    const firstDay = (n) => { const d = new Date(today); d.setDate(d.getDate() - (n - 1)); return localDateString(d); };
    const inLastDays = (log, n) => utcDateString(log.log_date) >= firstDay(n);
    const last7Days = sortedLogs.filter((log) => inLastDays(log, 7));

    const avg7Systolic = last7Days.length > 0
      ? Math.round(last7Days.reduce((sum, log) => sum + log.systolic, 0) / last7Days.length)
      : null;
    const avg7Diastolic = last7Days.length > 0
      ? Math.round(last7Days.reduce((sum, log) => sum + log.diastolic, 0) / last7Days.length)
      : null;

    // Calculate 30-day average
    const last30Days = sortedLogs.filter((log) => inLastDays(log, 30));

    const avg30Systolic = last30Days.length > 0
      ? Math.round(last30Days.reduce((sum, log) => sum + log.systolic, 0) / last30Days.length)
      : null;
    const avg30Diastolic = last30Days.length > 0
      ? Math.round(last30Days.reduce((sum, log) => sum + log.diastolic, 0) / last30Days.length)
      : null;

    // Calculate trend (comparing first half vs second half of last 30 days)
    let trend = 'stable';
    if (last30Days.length >= 4) {
      const midpoint = Math.floor(last30Days.length / 2);
      const firstHalf = last30Days.slice(0, midpoint);
      const secondHalf = last30Days.slice(midpoint);

      const firstAvgSystolic = firstHalf.reduce((sum, log) => sum + log.systolic, 0) / firstHalf.length;
      const secondAvgSystolic = secondHalf.reduce((sum, log) => sum + log.systolic, 0) / secondHalf.length;

      const difference = secondAvgSystolic - firstAvgSystolic;
      if (difference < -3) {
        trend = 'improving';
      } else if (difference > 3) {
        trend = 'worsening';
      }
    }

    // Readings in the normal range, counted over the same 30 days as the
    // average shown beside it (every reading, when none are that recent).
    const countedLogs = last30Days.length > 0 ? last30Days : sortedLogs;
    const healthyReadings = countedLogs.filter(log => {
      const category = getBPCategory(log.systolic, log.diastolic);
      return category.name === 'Normal';
    });

    // The last reading's category, and the week's — the week leads.
    const currentCategory = getBPCategory(latestReading.systolic, latestReading.diastolic);
    const weekCategory = avg7Systolic ? getBPCategory(avg7Systolic, avg7Diastolic) : null;

    return {
      latestReading,
      currentCategory,
      weekCategory,
      healthyCount: healthyReadings.length,
      countedReadings: countedLogs.length,
      countedRecent: last30Days.length > 0,
      avg7Systolic,
      avg7Diastolic,
      avg30Systolic,
      avg30Diastolic,
      trend,
      totalReadings: sortedLogs.length,
      last30DaysCount: last30Days.length
    };
  }, [bpLogs]);

  if (!insights) {
    return (
      <LabelPanel level={1} title="Your blood pressure">
        <Box sx={{ pt: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem', mb: 0.5 }}>
            No readings yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Log a reading and this shows how your blood pressure is doing.
          </Typography>
        </Box>
      </LabelPanel>
    );
  }

  // The trend is a word with an arrow beside it, in the normal ink: "Going
  // up" in red was a second alarm on a card that already has a status tag.
  const TrendIcon = insights.trend === 'improving'
    ? TrendingDownIcon
    : insights.trend === 'worsening' ? TrendingUpIcon : TrendingFlatIcon;
  const trendText = insights.trend === 'improving'
    ? 'Coming down'
    : insights.trend === 'worsening' ? 'Going up' : 'Steady';

  const last = insights.latestReading;
  const lastWords = `${last.systolic}/${last.diastolic} · ${plain(insights.currentCategory.name)} · ${readingWhen(last)}`;
  const headCategory = insights.weekCategory || insights.currentCategory;
  const headWords = bpStageWords(headCategory.name);
  const headline = bpSummarySentence({
    weekStage: insights.weekCategory?.name || null,
    lastStage: insights.currentCategory.name,
    lastWhen: readingWhen(last),
  });
  // The status colour is the theme's one small set (bpUtils: normal =
  // success, a little high and stage 1 = warning, stage 2 and up = error),
  // drawn as a Tag's wash with the words in it, and the heart beside it takes
  // the same tone (UX review 2026-11, A5). The week's average is the page's
  // one big figure.
  const headTone = headCategory?.name === 'Normal'
    ? 'normal'
    : headCategory?.tone === 'error' ? 'high' : headCategory?.tone === 'muted' ? 'unknown' : 'raised';
  const headColor = categorizeBP(
    insights.weekCategory ? insights.avg7Systolic : last.systolic,
    insights.weekCategory ? insights.avg7Diastolic : last.diastolic,
    theme.palette.mode,
  ).color;
  const headValue = insights.weekCategory
    ? `${insights.avg7Systolic}/${insights.avg7Diastolic}`
    : `${last.systolic}/${last.diastolic}`;
  const guidance = bpGuidance(headCategory.name);

  return (
    <LabelPanel level={1} title="Your blood pressure">
      {/* The number first, big, with its status beside it in words; then one
          sentence that says what the number is and squares it with the
          latest reading. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 3, rowGap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            data-testid="bp-now-label"
            sx={{ m: 0, mb: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}
          >
            {insights.weekCategory ? BP_LABELS.week : BP_LABELS.last}
          </Typography>
          <Typography
            component="p"
            data-testid="bp-now"
            sx={{ m: 0, fontWeight: 700, fontSize: { xs: '2.5rem', sm: '2.75rem' }, lineHeight: 1.05, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
          >
            {headValue}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HeartIcon data-testid="bp-heart" data-tone={headTone} aria-hidden sx={{ fontSize: 22, color: headColor }} />
          <Tag fill={headColor} sx={{ fontSize: '0.8125rem' }}>{headWords.label}</Tag>
        </Box>
      </Box>
      <Typography component="h3" data-testid="bp-headline" sx={{ m: 0, mt: 3, color: 'text.primary', fontWeight: 400, fontSize: '1rem', lineHeight: 1.5 }}>
        {headline}
      </Typography>
      {guidance && (
        <Typography
          data-testid="bp-guidance"
          role={guidance.serious ? 'alert' : undefined}
          sx={{ mt: 1, color: guidance.serious ? 'text.primary' : 'text.secondary', fontWeight: guidance.serious ? 600 : 400, fontSize: '0.9375rem', lineHeight: 1.5 }}
        >
          {guidance.text}
        </Typography>
      )}

      <Rule weight="medium" sx={{ mt: 4 }} />
      {/* When the week has readings the big number is the week's, so the last
          reading gets its own row; otherwise the big number IS the last one. */}
      <Box data-testid="bp-last-reading">
        {insights.weekCategory && <FactRow first name={BP_LABELS.last} amount={lastWords} />}
      </Box>
      {insights.avg30Systolic && (
        <FactRow
          first={!insights.weekCategory}
          name={BP_LABELS.month}
          amount={`${insights.avg30Systolic}/${insights.avg30Diastolic}`}
          of={`· ${insights.last30DaysCount} ${insights.last30DaysCount === 1 ? 'reading' : 'readings'}`}
        />
      )}
      {/* Normal readings: a count, not a percent (review D-1), over the same
          30 days as the average above it. */}
      <Box data-testid="bp-healthy-range">
        <FactRow
          first={!insights.weekCategory && !insights.avg30Systolic}
          name="In the normal range"
          amount={`${insights.healthyCount} of ${insights.countedReadings} ${insights.countedReadings === 1 ? 'reading' : 'readings'}`}
          of={insights.countedRecent ? '· last 30 days' : undefined}
        />
      </Box>
      {insights.last30DaysCount >= 4 && (
        <FactRow
          name={BP_LABELS.trend}
          amount={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
              <TrendIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
              <Box component="span" sx={{ fontWeight: 600 }}>{trendText}</Box>
            </Box>
          }
        />
      )}
    </LabelPanel>
  );
};

export default BPInsights;
