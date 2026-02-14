import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Favorite as HeartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { parseISO, differenceInDays } from 'date-fns';

// BP Categories based on AHA guidelines
const getBPCategory = (systolic, diastolic) => {
  if (systolic < 120 && diastolic < 80) {
    return { name: 'Normal', color: '#10b981', icon: CheckIcon };
  } else if (systolic >= 120 && systolic < 130 && diastolic < 80) {
    return { name: 'Elevated', color: '#f59e0b', icon: WarningIcon };
  } else if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) {
    return { name: 'Stage 1 Hypertension', color: '#f97316', icon: WarningIcon };
  } else if (systolic >= 140 || diastolic >= 90) {
    return { name: 'Stage 2 Hypertension', color: '#ef4444', icon: ErrorIcon };
  } else if (systolic >= 180 || diastolic >= 120) {
    return { name: 'Hypertensive Crisis', color: '#dc2626', icon: ErrorIcon };
  }
  return { name: 'Unknown', color: '#78716C', icon: HeartIcon };
};

const BPInsights = ({ bpLogs = [] }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const insights = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) {
      return null;
    }

    const sortedLogs = [...bpLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
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

    // Get current category
    const currentCategory = getBPCategory(latestReading.systolic, latestReading.diastolic);

    return {
      latestReading,
      currentCategory,
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
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${theme.palette.divider}`
      }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <HeartIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 1 }}>
            No Blood Pressure Data
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Start tracking your blood pressure to see insights
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (insights.trend === 'improving') {
      return <TrendingDownIcon sx={{ fontSize: 20, color: '#10b981' }} />;
    } else if (insights.trend === 'worsening') {
      return <TrendingUpIcon sx={{ fontSize: 20, color: '#ef4444' }} />;
    }
    return <TrendingFlatIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />;
  };

  const getTrendText = () => {
    if (insights.trend === 'improving') return 'Improving';
    if (insights.trend === 'worsening') return 'Needs Attention';
    return 'Stable';
  };

  const getTrendColor = () => {
    if (insights.trend === 'improving') return theme.palette.success.main;
    if (insights.trend === 'worsening') return theme.palette.error.main;
    return theme.palette.primary.main;
  };

  const CategoryIcon = insights.currentCategory.icon;

  return (
    <Card sx={{
      borderRadius: '20px',
      boxShadow: theme.shadows[1],
      border: `1px solid ${theme.palette.divider}`,
      background: theme.palette.background.paper
    }}>
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
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
          }}>
            <HeartIcon sx={{ fontSize: 28, color: 'white' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 0.5 }}>
              Blood Pressure Insights
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {insights.latestReading.systolic}/{insights.latestReading.diastolic} mmHg
            </Typography>
          </Box>
        </Box>

        {/* Current Category */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CategoryIcon sx={{ fontSize: 20, color: insights.currentCategory.color }} />
          <Chip
            label={insights.currentCategory.name}
            sx={{
              backgroundColor: `${insights.currentCategory.color}15`,
              color: insights.currentCategory.color,
              fontWeight: 700,
              border: `1px solid ${insights.currentCategory.color}30`,
              borderRadius: '999px'
            }}
          />
        </Box>

        {/* Insights Grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2
        }}>
          {/* 7-Day Average */}
          {insights.avg7Systolic && (
            <Box sx={{
              p: 2,
              borderRadius: '12px',
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
              border: `1px solid ${theme.palette.divider}`
            }}>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
                7-Day Average
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                {insights.avg7Systolic}/{insights.avg7Diastolic}
              </Typography>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                {insights.last7DaysCount} readings
              </Typography>
            </Box>
          )}

          {/* 30-Day Average */}
          {insights.avg30Systolic && (
            <Box sx={{
              p: 2,
              borderRadius: '12px',
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
              border: `1px solid ${theme.palette.divider}`
            }}>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
                30-Day Average
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                {insights.avg30Systolic}/{insights.avg30Diastolic}
              </Typography>
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                {insights.last30DaysCount} readings
              </Typography>
            </Box>
          )}

          {/* Trend */}
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            backgroundColor: `${getTrendColor()}${isDark ? '20' : '10'}`,
            border: `1px solid ${getTrendColor()}30`
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {getTrendIcon()}
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                30-Day Trend
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: getTrendColor() }}>
              {getTrendText()}
            </Typography>
          </Box>

          {/* Healthy Readings */}
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            backgroundColor: insights.healthyPercentage >= 70
              ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.05)')
              : (isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.05)'),
            border: `1px solid ${insights.healthyPercentage >= 70 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
              Healthy Range
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {insights.healthyPercentage}%
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              of {insights.totalReadings} readings
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPInsights;
