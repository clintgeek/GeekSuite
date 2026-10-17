import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { readableOn } from '@geeksuite/ui';
import {
  Favorite as HeartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
} from '@mui/icons-material';
import { parseISO } from 'date-fns';
import { newestReadingFirst, readingWhen } from './bpTimeUtils.js';
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';

/**
 * "Is my blood pressure OK?" — answered with the week, not one reading
 * (review D-1). The headline used to be the LAST reading's category, so one
 * good morning painted an elevated week "Normal". Now it leads with the
 * 7-day average's category in plain words, then the last reading, then a
 * count of readings in the healthy range ("1 of 14", never "7%").
 */

// The category itself — name, thresholds — comes from the one shared categoriser.
const getBPCategory = (systolic, diastolic) => ({ name: categorizeBP(systolic, diastolic).stage });

const BPInsights = ({ bpLogs = [] }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const insights = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) {
      return null;
    }

    // Newest by the instant it was taken, not by `log_date`: every reading on
    // one day shares a `log_date`, so the morning reading could stay
    // "latest" after the evening one was saved.
    const sortedLogs = [...bpLogs].sort(newestReadingFirst);
    const latestReading = sortedLogs[0];
    const today = new Date();

    // Calculate 7-day average
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7Days = sortedLogs.filter(log => {
      const logDate = parseISO(log.log_date);
      return logDate >= sevenDaysAgo;
    });

    const avg7Systolic = last7Days.length > 0
      ? Math.round(last7Days.reduce((sum, log) => sum + log.systolic, 0) / last7Days.length)
      : null;
    const avg7Diastolic = last7Days.length > 0
      ? Math.round(last7Days.reduce((sum, log) => sum + log.diastolic, 0) / last7Days.length)
      : null;

    // Calculate 30-day average
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30Days = sortedLogs.filter(log => {
      const logDate = parseISO(log.log_date);
      return logDate >= thirtyDaysAgo;
    });

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
      last7DaysCount: last7Days.length,
      last30DaysCount: last30Days.length
    };
  }, [bpLogs]);

  if (!insights) {
    return (
      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <HeartIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
          <Typography variant="h6" sx={{ color: theme.palette.text.primary, mb: 1 }}>
            No readings yet
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Log a reading and this shows how your blood pressure is doing.
          </Typography>
        </CardContent>
      </Card>
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
    return theme.palette.primary.main;
  };

  const trendTint = alpha(getTrendColor(), isDark ? 0.12 : 0.06);

  const last = insights.latestReading;
  const lastWords = `${last.systolic}/${last.diastolic} · ${bpStageWords(insights.currentCategory.name).phrase.replace(/ \(.*\)$/, '')} · ${readingWhen(last)}`;
  const headline = insights.weekCategory
    ? `Your average this week: ${insights.avg7Systolic}/${insights.avg7Diastolic} — ${bpStageWords(insights.weekCategory.name).phrase}`
    : `Your last reading: ${last.systolic}/${last.diastolic} — ${bpStageWords(insights.currentCategory.name).phrase}`;
  const tile = {
    p: 2,
    // Nested tiles take the smaller radius inside the card's 24 (review B6);
    // at night a faint cream lift, not a third near-identical brown (A10).
    borderRadius: '16px',
    backgroundColor: isDark ? alpha(theme.palette.text.primary, 0.04) : theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`
  };

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            backgroundColor: theme.palette.primary.main,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <HeartIcon sx={{ fontSize: 28, color: theme.palette.primary.contrastText }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" data-testid="bp-headline" sx={{ fontWeight: 800, fontSize: { xs: '1.1875rem', sm: '1.375rem' }, lineHeight: 1.3, color: theme.palette.text.primary, mb: 0.5 }}>
              {headline}
            </Typography>
            <Typography data-testid="bp-last-reading" sx={{ fontSize: '1rem', color: theme.palette.text.secondary }}>
              {insights.weekCategory ? `Last reading ${lastWords}` : 'No readings in the last 7 days'}
            </Typography>
          </Box>
        </Box>

        {/* Insights Grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2
        }}>
          {/* 7-Day Average */}
          {insights.avg7Systolic && (
            <Box sx={tile}>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
                7-day average
              </Typography>
              <Typography variant="h6" sx={{ color: theme.palette.text.primary }}>
                {insights.avg7Systolic}/{insights.avg7Diastolic}
              </Typography>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                {insights.last7DaysCount} {insights.last7DaysCount === 1 ? 'reading' : 'readings'}
              </Typography>
            </Box>
          )}

          {/* 30-Day Average */}
          {insights.avg30Systolic && (
            <Box sx={tile}>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
                30-day average
              </Typography>
              <Typography variant="h6" sx={{ color: theme.palette.text.primary }}>
                {insights.avg30Systolic}/{insights.avg30Diastolic}
              </Typography>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                {insights.last30DaysCount} {insights.last30DaysCount === 1 ? 'reading' : 'readings'}
              </Typography>
            </Box>
          )}

          {/* Trend */}
          <Box sx={{
            p: 2,
            borderRadius: '16px',
            backgroundColor: trendTint,
            border: `1px solid ${alpha(getTrendColor(), 0.3)}`
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {getTrendIcon()}
              {/* The tint is a surface, so the label is measured against it —
                  text.secondary read 4.39:1 on the light trend panel. */}
              <Typography variant="caption" sx={{ color: readableOn(theme.palette.text.secondary, trendTint, { under: theme.palette.background.paper }), fontWeight: 600 }}>
                Last 30 days
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ color: getTrendColor() }}>
              {getTrendText()}
            </Typography>
          </Box>

          {/* Healthy readings: a count, not a percent, and no red tile
              saying it without words (review D-1). */}
          <Box sx={tile} data-testid="bp-healthy-range">
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
              Healthy range
            </Typography>
            <Typography variant="h6" sx={{ color: theme.palette.text.primary }}>
              {insights.healthyCount} of {insights.totalReadings} readings
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPInsights;
