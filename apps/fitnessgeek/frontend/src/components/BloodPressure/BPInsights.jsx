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
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { LabelPanel, FactRow, Rule, Tag } from '../primitives';

/**
 * "Is my blood pressure OK?" — answered with the week, not one reading
 * (review D-1). The headline used to be the LAST reading's category, so one
 * good morning painted an elevated week "Normal". Now it leads with the
 * 7-day average's category in plain words, then the last reading, then a
 * count of readings in the healthy range ("1 of 14", never "7%").
 */

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

    // Calculate percentage in healthy range
    const healthyReadings = sortedLogs.filter(log => {
      const category = getBPCategory(log.systolic, log.diastolic);
      return category.name === 'Normal';
    });
    const healthyPercentage = Math.round((healthyReadings.length / sortedLogs.length) * 100);

    // The last reading's category, and the week's — the week leads.
    const currentCategory = getBPCategory(latestReading.systolic, latestReading.diastolic);
    const weekCategory = avg7Systolic ? getBPCategory(avg7Systolic, avg7Diastolic) : null;

    return {
      latestReading,
      currentCategory,
      weekCategory,
      healthyCount: healthyReadings.length,
      avg7Systolic,
      avg7Diastolic,
      avg30Systolic,
      avg30Diastolic,
      trend,
      healthyPercentage,
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

  const getTrendIcon = () => {
    if (insights.trend === 'improving') {
      return <TrendingDownIcon sx={{ fontSize: 20, color: getTrendColor() }} />;
    } else if (insights.trend === 'worsening') {
      return <TrendingUpIcon sx={{ fontSize: 20, color: getTrendColor() }} />;
    }
    return <TrendingFlatIcon sx={{ fontSize: 20, color: getTrendColor() }} />;
  };

  const getTrendText = () => {
    if (insights.trend === 'improving') return 'Improving';
    if (insights.trend === 'worsening') return 'Going up';
    return 'Stable';
  };

  const getTrendColor = () => {
    if (insights.trend === 'improving') return theme.palette.success.main;
    if (insights.trend === 'worsening') return theme.palette.error.main;
    return theme.palette.text.primary;
  };

  const last = insights.latestReading;
  const lastWords = `${last.systolic}/${last.diastolic} · ${bpStageWords(insights.currentCategory.name).phrase.replace(/ \(.*\)$/, '')} · ${readingWhen(last)}`;
  const headCategory = insights.weekCategory || insights.currentCategory;
  const headWords = bpStageWords(headCategory.name);
  const headline = insights.weekCategory
    ? `Your average this week: ${insights.avg7Systolic}/${insights.avg7Diastolic} — ${headWords.phrase}`
    : `Your last reading: ${last.systolic}/${last.diastolic} — ${headWords.phrase}`;
  // The status colour is the theme's one small set (bpUtils: normal = success,
  // a little high = warning, high = error), drawn as a Tag's fill with the
  // words in it, and the heart beside it takes the same tone (UX review
  // 2026-11, A5). The week's headline number is the page's one big figure.
  const headTone = headCategory?.name === 'Normal'
    ? 'normal'
    : headCategory?.tone === 'error' || headCategory?.tone === 'tomato' ? 'high' : headCategory?.tone === 'muted' ? 'unknown' : 'raised';
  const headColor = categorizeBP(
    insights.weekCategory ? insights.avg7Systolic : last.systolic,
    insights.weekCategory ? insights.avg7Diastolic : last.diastolic,
    theme.palette.mode,
  ).color;
  const headValue = insights.weekCategory
    ? `${insights.avg7Systolic}/${insights.avg7Diastolic}`
    : `${last.systolic}/${last.diastolic}`;

  return (
    <LabelPanel level={1} title="Your blood pressure">
      {/* The number first, big, with its status beside it in words; then one
          sentence that says what the number is. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 3, rowGap: 2 }}>
        <Typography
          component="p"
          data-testid="bp-now"
          sx={{ m: 0, fontWeight: 700, fontSize: { xs: '2.5rem', sm: '2.75rem' }, lineHeight: 1.05, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {headValue}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HeartIcon data-testid="bp-heart" data-tone={headTone} aria-hidden sx={{ fontSize: 22, color: headColor }} />
          <Tag fill={headColor} sx={{ fontSize: '0.8125rem' }}>{headWords.label}</Tag>
        </Box>
      </Box>
      <Typography component="h3" data-testid="bp-headline" sx={{ m: 0, mt: 2, mb: 4, color: 'text.secondary', fontWeight: 400, fontSize: '0.9375rem', lineHeight: 1.5 }}>
        {headline}
      </Typography>

      <Rule weight="medium" />
      {insights.avg30Systolic && (
        <FactRow
          first
          name="30-day average"
          amount={`${insights.avg30Systolic}/${insights.avg30Diastolic}`}
          of={`· ${insights.last30DaysCount} ${insights.last30DaysCount === 1 ? 'reading' : 'readings'}`}
        />
      )}
      <FactRow
        first={!insights.avg30Systolic}
        name="Last 30 days"
        amount={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, verticalAlign: 'middle' }}>
            {getTrendIcon()}
            <Box component="span" sx={{ color: getTrendColor(), fontWeight: 700 }}>{getTrendText()}</Box>
          </Box>
        }
      />
      {/* Healthy readings: a count, not a percent (review D-1). */}
      <Box data-testid="bp-healthy-range">
        <FactRow name="Healthy range" amount={`${insights.healthyCount} of ${insights.totalReadings} readings`} />
      </Box>
      <Box data-testid="bp-last-reading">
        {insights.weekCategory ? (
          <FactRow name="Last reading" amount={lastWords} />
        ) : (
          <FactRow name="No readings in the last 7 days" />
        )}
      </Box>
    </LabelPanel>
  );
};

export default BPInsights;
