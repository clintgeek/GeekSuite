import React, { useState, useEffect } from 'react';
import { influxService } from '../services/influxService';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  LinearProgress,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Bedtime as BedtimeIcon,
  FavoriteBorder as HeartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Air as AirIcon,
  Psychology as BrainIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';

/**
 * Quality score color
 */
function getQualityColor(score) {
  if (score >= 80) return 'success';
  if (score >= 70) return 'info';
  if (score >= 60) return 'warning';
  return 'error';
}

/**
 * Quality label with emoji
 */
function getQualityEmoji(label) {
  const map = {
    EXCELLENT: '🌟',
    GOOD: '✅',
    FAIR: '⚠️',
    POOR: '❌'
  };
  return map[label] || '❓';
}

/**
 * Metric card for displaying a single value
 */
function MetricCard({ label, value, unit, color = 'default', trend = null, tooltip = '' }) {
  return (
    <Tooltip title={tooltip} arrow>
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {label}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" component="div" color={`${color}.main`}>
              {value}
            </Typography>
            {unit && (
              <Typography variant="body2" color="text.secondary">
                {unit}
              </Typography>
            )}
            {trend && (
              trend > 0 ? <TrendingUpIcon color="error" /> : <TrendingDownIcon color="success" />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Tooltip>
  );
}

/**
 * Progress bar with label
 */
function ProgressMetric({ label, value, max = 100, color = 'primary', showPercentage = true }) {
  const percentage = Math.min(100, (value / max) * 100);

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight="bold">
          {showPercentage ? `${Math.round(percentage)}%` : `${value}${max ? `/${max}` : ''}`}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percentage}
        color={color}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

/**
 * Recommendation item
 */
function RecommendationItem({ recommendation }) {
  const priorityColors = {
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'info'
  };

  const priorityIcons = {
    HIGH: <ErrorIcon />,
    MEDIUM: <WarningIcon />,
    LOW: <InfoIcon />
  };

  return (
    <ListItem alignItems="flex-start">
      <ListItemIcon sx={{ color: `${priorityColors[recommendation.priority]}.main` }}>
        {priorityIcons[recommendation.priority]}
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2">{recommendation.issue}</Typography>
            <Chip
              label={recommendation.category.replace('_', ' ')}
              size="small"
              color={priorityColors[recommendation.priority]}
              variant="outlined"
            />
          </Stack>
        }
        secondary={
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              <strong>Suggestion:</strong> {recommendation.suggestion}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {recommendation.impact}
            </Typography>
          </>
        }
      />
    </ListItem>
  );
}

/**
 * Main SleepAnalysis component
 */
export default function SleepAnalysis({ date }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({
    architecture: false,
    cardiovascular: false,
    recovery: false,
    respiratory: false,
    recommendations: false
  });

  useEffect(() => {
    async function fetchSleepData() {
      if (!date) return;

      setLoading(true);

      try {
        const response = await influxService.getSleepAnalysis(date);
        // Backend returns { available: false, reason, message } for both "no data"
        // and "influx unavailable" cases — treat both as empty-state, not an error.
        setData(response);
      } catch (err) {
        // Defensive: backend should no longer 500, but handle it quietly.
        console.warn('Sleep analysis unavailable:', err.message);
        // Synthesize the same shape as a backend "unavailable" response so the
        // existing !data.available empty-state renders instead of an error alert.
        setData({ available: false, message: 'Sleep data could not be loaded.' });
      } finally {
        setLoading(false);
      }
    }

    fetchSleepData();
  }, [date]);

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpanded(prev => ({ ...prev, [panel]: isExpanded }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading sleep analysis...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.available) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            <AlertTitle>No Sleep Data Available</AlertTitle>
            {data?.message || 'No sleep data found for this date'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { qualityScore, qualityLabel, metrics, recommendations, warnings } = data;

  return (
    <Box>
      {/* Summary Card */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BedtimeIcon color="primary" />
              <Typography variant="h5">Sleep Analysis</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h4" color={`${getQualityColor(qualityScore)}.main`}>
                {qualityScore}/100
              </Typography>
              <Chip
                label={`${qualityLabel} ${getQualityEmoji(qualityLabel)}`}
                color={getQualityColor(qualityScore)}
                size="large"
              />
            </Stack>
          </Stack>

          {/* Key Metrics Grid */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Total Sleep"
                value={Math.floor(metrics.architecture.totalMinutes / 60)}
                unit={`h ${metrics.architecture.totalMinutes % 60}m`}
                color={metrics.architecture.totalMinutes >= 420 ? 'success' : 'warning'}
                tooltip="Total time asleep (target: 7-9 hours)"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Deep Sleep"
                value={metrics.architecture.deepPercent}
                unit="%"
                color={metrics.architecture.deepPercent >= 20 ? 'success' : 'error'}
                tooltip="Deep sleep percentage (target: 20-25%)"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="HRV"
                value={metrics.hrvRecovery.avgHRV}
                unit="ms"
                color={metrics.hrvRecovery.hrvDeviation >= 0 ? 'success' : 'warning'}
                trend={metrics.hrvRecovery.hrvDeviation}
                tooltip="Heart rate variability - higher is better"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Sleep Efficiency"
                value={metrics.architecture.sleepEfficiency}
                unit="%"
                color={metrics.architecture.sleepEfficiency >= 90 ? 'success' : 'warning'}
                tooltip="Time asleep / time in bed (target: >90%)"
              />
            </Grid>
          </Grid>

          {/* Warnings */}
          {warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle>Areas of Concern</AlertTitle>
              <List dense>
                {warnings.map((warning, idx) => (
                  <ListItem key={idx} sx={{ py: 0 }}>
                    <ListItemText primary={warning} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sleep Architecture Accordion */}
      <Accordion
        expanded={expanded.architecture}
        onChange={handleAccordionChange('architecture')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BedtimeIcon />
            <Typography variant="h6">Sleep Architecture</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Sleep Stage Distribution</Typography>
              <ProgressMetric
                label="Deep Sleep"
                value={metrics.architecture.deepPercent}
                color={metrics.architecture.deepPercent >= 20 ? 'success' : 'error'}
              />
              <ProgressMetric
                label="Light Sleep"
                value={metrics.architecture.lightPercent}
                color="info"
              />
              <ProgressMetric
                label="REM Sleep"
                value={metrics.architecture.remPercent}
                color={metrics.architecture.remPercent >= 20 ? 'success' : 'warning'}
              />
              <ProgressMetric
                label="Awake"
                value={metrics.architecture.awakePercent}
                color={metrics.architecture.awakePercent < 5 ? 'success' : 'warning'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Sleep Quality Factors</Typography>
              <Stack spacing={1}>
                <Typography variant="body2">
                  <strong>Total Minutes:</strong> {metrics.architecture.totalMinutes} min ({Math.floor(metrics.architecture.totalMinutes / 60)}h {metrics.architecture.totalMinutes % 60}m)
                </Typography>
                <Typography variant="body2">
                  <strong>Awakenings:</strong> {metrics.continuity.awakenings} times
                </Typography>
                <Typography variant="body2">
                  <strong>Fragmentation Index:</strong> {metrics.continuity.fragmentationIndex}%
                  <Chip size="small" label={metrics.continuity.fragmentationIndex < 20 ? 'Good' : 'High'} color={metrics.continuity.fragmentationIndex < 20 ? 'success' : 'warning'} sx={{ ml: 1 }} />
                </Typography>
                <Typography variant="body2">
                  <strong>Stage Transitions:</strong> {metrics.continuity.stageTransitions}
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Cardiovascular Recovery Accordion */}
      <Accordion
        expanded={expanded.cardiovascular}
        onChange={handleAccordionChange('cardiovascular')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HeartIcon />
            <Typography variant="h6">Cardiovascular Recovery</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Resting HR"
                value={metrics.cardiovascular.restingHeartRate}
                unit="bpm"
                tooltip="10th percentile HR during sleep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Avg Sleep HR"
                value={metrics.cardiovascular.avgHeartRate}
                unit="bpm"
                tooltip="Average heart rate throughout sleep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="HR Dip"
                value={metrics.cardiovascular.hrDipPercent}
                unit="%"
                color={metrics.cardiovascular.hrDipPercent >= 15 ? 'success' : 'warning'}
                tooltip="HR drop during deep sleep (target: 15-25%)"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Deep Sleep HR"
                value={metrics.cardiovascular.avgDeepSleepHR}
                unit="bpm"
                tooltip="Average HR during deep sleep stages"
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Alert severity={metrics.cardiovascular.hrDipPercent >= 15 ? 'success' : 'warning'}>
              {metrics.cardiovascular.hrDipPercent >= 15
                ? '✓ Good HR recovery during sleep indicates proper parasympathetic activation'
                : '⚠️ Limited HR recovery suggests incomplete relaxation or overtraining'}
            </Alert>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* HRV & Recovery Accordion */}
      <Accordion
        expanded={expanded.recovery}
        onChange={handleAccordionChange('recovery')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BrainIcon />
            <Typography variant="h6">HRV & Recovery Status</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>HRV Metrics</Typography>
                  <Typography variant="body2">
                    <strong>Average HRV:</strong> {metrics.hrvRecovery.avgHRV} ms
                  </Typography>
                  <Typography variant="body2">
                    <strong>Baseline Deviation:</strong> {metrics.hrvRecovery.hrvDeviation}%
                    <Chip
                      size="small"
                      label={metrics.hrvRecovery.hrvStatus}
                      color={metrics.hrvRecovery.hrvStatus === 'HIGH' ? 'success' : metrics.hrvRecovery.hrvStatus === 'BALANCED' ? 'info' : 'warning'}
                      sx={{ ml: 1 }}
                    />
                  </Typography>
                  <Typography variant="body2">
                    <strong>Recovery Score:</strong> {metrics.hrvRecovery.recoveryScore}/100
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Body Battery</Typography>
                  <Typography variant="body2">
                    <strong>Start:</strong> {metrics.stress.bodyBatteryStart}
                  </Typography>
                  <Typography variant="body2">
                    <strong>End:</strong> {metrics.stress.bodyBatteryEnd}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Recovery:</strong> {metrics.stress.bodyBatteryChange >= 0 ? '+' : ''}{metrics.stress.bodyBatteryChange} points
                    <Chip
                      size="small"
                      label={metrics.stress.bodyBatteryChange >= 20 ? 'Good' : 'Low'}
                      color={metrics.stress.bodyBatteryChange >= 20 ? 'success' : 'warning'}
                      sx={{ ml: 1 }}
                    />
                  </Typography>
                </Box>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Stress During Sleep</Typography>
              <Typography variant="body2" paragraph>
                <strong>Average Stress:</strong> {metrics.stress.avgStress}/100
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>Stress Spikes:</strong> {metrics.stress.stressSpikes} events
              </Typography>
              <Alert severity={metrics.stress.avgStress < 40 ? 'success' : 'warning'}>
                {metrics.stress.avgStress < 40
                  ? '✓ Low stress during sleep indicates good autonomic nervous system recovery'
                  : '⚠️ Elevated stress during sleep may indicate incomplete recovery or anxiety'}
              </Alert>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Respiratory Health Accordion */}
      <Accordion
        expanded={expanded.respiratory}
        onChange={handleAccordionChange('respiratory')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AirIcon />
            <Typography variant="h6">Respiratory Health</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Avg Respiration"
                value={metrics.respiration.avgRespirationRate}
                unit="bpm"
                tooltip="Average breaths per minute during sleep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Avg SpO2"
                value={metrics.respiration.avgSpO2}
                unit="%"
                color={metrics.respiration.avgSpO2 >= 95 ? 'success' : 'warning'}
                tooltip="Average blood oxygen saturation"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Min SpO2"
                value={metrics.respiration.minSpO2}
                unit="%"
                color={metrics.respiration.minSpO2 >= 90 ? 'success' : 'error'}
                tooltip="Minimum blood oxygen level (warning if <90%)"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Apnea Events"
                value={metrics.respiration.apneaIndicators}
                color={metrics.respiration.apneaIndicators === 0 ? 'success' : 'error'}
                tooltip="Number of potential apnea events (SpO2 <90%)"
              />
            </Grid>
          </Grid>
          {metrics.respiration.apneaIndicators > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Sleep Apnea Warning</AlertTitle>
              {metrics.respiration.apneaIndicators} potential apnea events detected. Consider:
              <ul>
                <li>Sleeping on your side instead of back</li>
                <li>Sleep apnea screening with a healthcare provider</li>
                <li>Reducing alcohol consumption before bed</li>
              </ul>
            </Alert>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Recommendations Accordion */}
      {recommendations.length > 0 && (
        <Accordion
          expanded={expanded.recommendations}
          onChange={handleAccordionChange('recommendations')}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckIcon />
              <Typography variant="h6">Recommendations ({recommendations.length})</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {recommendations.map((rec, idx) => (
                <React.Fragment key={idx}>
                  <RecommendationItem recommendation={rec} />
                  {idx < recommendations.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
