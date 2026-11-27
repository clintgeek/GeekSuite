import React, { useState, useEffect } from 'react';
import { influxService } from '../services/influxService';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  Tooltip,
} from '@mui/material';
import { LabelPanel, FactHeadline, LabelBar, Tag } from './primitives';
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

/** Garmin's ALL-CAPS words ("GOOD", "BALANCED") in sentence case. */
const sentenceWord = (word) => (typeof word === 'string' && word
  ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase().replace(/_/g, ' ')
  : word);
const HRV_WORDS = { HIGH: 'High', BALANCED: 'Balanced', LOW: 'Low', UNBALANCED: 'Unbalanced' };

/** An accordion drawn as a label panel: 2px ink border, square, no shadow. */
const accordionSx = {
  mb: 1,
  border: (t) => `2px solid ${t.palette.text.primary}`,
  borderRadius: 0,
  boxShadow: 'none',
  backgroundImage: 'none',
  '&:before': { display: 'none' },
  '&.Mui-expanded': { margin: '0 0 8px' },
  '& .MuiAccordionSummary-root': { minHeight: 56 },
  '& .MuiAccordionDetails-root': { borderTop: (t) => `1px solid ${t.palette.text.primary}`, pt: 2 },
};
const accordionTitleSx = { fontWeight: 900, fontSize: '1.125rem', lineHeight: 1.2 };

/** A small status mark beside a label; the label is the words. */
const StatusMark = ({ color }) => (
  color && color !== 'default' ? (
    <Box
      aria-hidden
      sx={{ width: 10, height: 10, flexShrink: 0, bgcolor: `${color}.main` }}
    />
  ) : null
);

/**
 * Metric card for displaying a single value
 */
/**
 * @param {boolean} higherIsBetter  which way a rising trend should read. The
 *   arrow used to be red for ANY rise — backwards for HRV, where the only
 *   caller passing a trend lives, so a strong recovery night showed a red
 *   up-arrow.
 */
function MetricCard({ label, value, unit, color = 'default', trend = null, higherIsBetter = false, tooltip = '' }) {
  return (
    <Tooltip title={tooltip} arrow>
      <Box
        sx={{
          height: '100%',
          borderTop: (t) => `1px solid ${t.palette.text.primary}`,
          pt: 1,
          pb: 0.5,
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
          <StatusMark color={color} />
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.2 }}>
            {label}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography component="div" sx={{ fontWeight: 900, fontSize: '2rem', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {value}
          </Typography>
          {unit && (
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary' }}>
              {unit}
            </Typography>
          )}
          {typeof trend === 'number' && trend !== 0 && (
            trend > 0
              ? <TrendingUpIcon color={higherIsBetter ? 'success' : 'error'} />
              : <TrendingDownIcon color={higherIsBetter ? 'error' : 'success'} />
          )}
        </Stack>
      </Box>
    </Tooltip>
  );
}

/**
 * Progress bar with label
 */
function ProgressMetric({ label, value, max = 100, color = 'primary', showPercentage = true }) {
  const percentage = Math.min(100, (value / max) * 100);

  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" fontWeight="bold">
          {showPercentage ? `${Math.round(percentage)}%` : `${value}${max ? `/${max}` : ''}`}
        </Typography>
      </Stack>
      {/* Blue is the measured bar; a stage that misses its line is marked in
          the theme's warning colour, a stage that makes it stays blue. */}
      <LabelBar
        value={percentage}
        label={`${label}: ${Math.round(percentage)}%`}
        height={10}
        sx={{ my: 0.5, '& > div': { bgcolor: color === 'primary' || color === 'success' || color === 'info' ? 'primary.main' : `${color}.main` } }}
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
            <Tag>{recommendation.category.replace('_', ' ')}</Tag>
          </Stack>
        }
        secondary={
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              <strong>Try this:</strong> {recommendation.suggestion}
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
        setData({ available: false, message: 'Couldn’t load your sleep for this night. Try again.' });
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
      <LabelPanel title="Your sleep">
        <Typography sx={{ pt: 1 }}>Loading your sleep…</Typography>
      </LabelPanel>
    );
  }

  if (!data || !data.available) {
    return (
      <LabelPanel title="Your sleep">
        <Alert severity="info" sx={{ mt: 1.5 }}>
          <AlertTitle>No sleep for this night</AlertTitle>
          {data?.message || 'Your watch hasn’t sent sleep for this night yet.'}
        </Alert>
      </LabelPanel>
    );
  }

  const { qualityScore, qualityLabel, metrics, recommendations, warnings } = data;

  return (
    <Box>
      {/* Summary panel: the score is the headline */}
      <LabelPanel title="Your sleep" level={1} sx={{ mb: 2 }}>
          {qualityScore != null ? (
            <Tooltip title="Garmin’s sleep score for this night — the same number your watch shows" arrow>
              <Box>
                <FactHeadline caption="Sleep score" name={qualityLabel ? <Tag>{sentenceWord(qualityLabel)}</Tag> : ''} value={`${qualityScore}/100`} />
              </Box>
            </Tooltip>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
              No score from the watch yet
            </Typography>
          )}
          <Box sx={{ height: 12 }} />

          {/* Key metrics: four headline numbers under one rule, no boxes */}
          <Grid container columnSpacing={2} rowSpacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Time asleep"
                value={Math.floor(metrics.architecture.asleepMinutes / 60)}
                unit={`h ${metrics.architecture.asleepMinutes % 60}m`}
                color={metrics.architecture.asleepMinutes >= 420 ? 'success' : 'warning'}
                tooltip="Time asleep, not counting time awake in bed (aim for 7–9 hours)"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Deep sleep"
                value={metrics.architecture.deepPercent}
                unit="%"
                color={metrics.architecture.deepPercent >= 15 ? 'success' : 'warning'}
                tooltip="Share of time asleep spent in deep sleep. Flagged below 15%, the same line the recommendations use."
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="HRV"
                value={metrics.hrvRecovery.avgHRV ?? '—'}
                unit={metrics.hrvRecovery.avgHRV != null ? 'ms' : undefined}
                color={
                  metrics.hrvRecovery.hrvStatus === 'LOW' ? 'warning'
                    : metrics.hrvRecovery.hrvStatus === 'HIGH' ? 'success'
                    : 'default'
                }
                trend={metrics.hrvRecovery.hrvDeviation}
                higherIsBetter
                tooltip={
                  metrics.hrvRecovery.baselineHRV != null
                    ? `Garmin’s overnight heart-rate variability (HRV), against your ${metrics.hrvRecovery.baselineHRV} ms average over the nights before`
                    : 'Garmin’s overnight heart-rate variability (HRV). A comparison appears once there are three nights to compare against.'
                }
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Asleep while in bed"
                value={metrics.architecture.sleepEfficiency}
                unit="%"
                color={metrics.architecture.sleepEfficiency >= 90 ? 'success' : 'warning'}
                tooltip="How much of your time in bed you were asleep (aim for over 90%)"
              />
            </Grid>
          </Grid>

          {/* Warnings */}
          {warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle>Worth a look</AlertTitle>
              <List dense>
                {warnings.map((warning, idx) => (
                  <ListItem key={idx} sx={{ py: 0 }}>
                    <ListItemText primary={warning} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
      </LabelPanel>

      {/* Sleep Architecture Accordion */}
      <Accordion
        expanded={expanded.architecture}
        onChange={handleAccordionChange('architecture')}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BedtimeIcon />
            <Typography sx={accordionTitleSx}>Sleep stages</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Time in each stage</Typography>
              <ProgressMetric
                label="Deep sleep"
                value={metrics.architecture.deepPercent}
                color={metrics.architecture.deepPercent >= 20 ? 'success' : 'error'}
              />
              <ProgressMetric
                label="Light sleep"
                value={metrics.architecture.lightPercent}
                color="info"
              />
              <ProgressMetric
                label="REM sleep"
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
              <Typography variant="subtitle2" gutterBottom>How settled you were</Typography>
              <Stack spacing={1}>
                <Typography variant="body2">
                  <strong>Time in bed:</strong> {Math.floor(metrics.architecture.totalMinutes / 60)}h {metrics.architecture.totalMinutes % 60}m
                  {' · '}<strong>asleep</strong> {Math.floor(metrics.architecture.asleepMinutes / 60)}h {metrics.architecture.asleepMinutes % 60}m
                </Typography>
                <Typography variant="body2">
                  <strong>Awakenings:</strong> {metrics.continuity.awakenings} times
                </Typography>
                {/* Transitions per hour asleep. There is deliberately no
                    Good/High chip: nothing calibrates a threshold for Garmin's
                    segment granularity, and the index this replaced read "92%
                    · High" on every night because it could not vary. */}
                <Typography variant="body2">
                  <strong>Stage changes:</strong> {metrics.continuity.transitionsPerHour} per hour asleep
                </Typography>
                <Typography variant="body2">
                  <strong>Stage changes in all:</strong> {metrics.continuity.stageTransitions}
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
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HeartIcon />
            <Typography sx={accordionTitleSx}>Heart rate overnight</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Resting heart rate"
                value={metrics.cardiovascular.restingHeartRate}
                unit="bpm"
                tooltip="10th percentile HR during sleep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Average while asleep"
                value={metrics.cardiovascular.avgHeartRate}
                unit="bpm"
                tooltip="Average heart rate throughout sleep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Average in deep sleep"
                value={metrics.cardiovascular.avgDeepSleepHR}
                unit="bpm"
                tooltip="Average heart rate during deep sleep"
              />
            </Grid>
          </Grid>
          {/* The HR-dip card and its verdict lived here. The dip compared
              deep-sleep HR with the night's median — a stage against a time of
              night — and warned about "limited HR recovery" every night. It
              returns when it can be measured against daytime heart rate. */}
        </AccordionDetails>
      </Accordion>

      {/* HRV & Recovery Accordion */}
      <Accordion
        expanded={expanded.recovery}
        onChange={handleAccordionChange('recovery')}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BrainIcon />
            <Typography sx={accordionTitleSx}>Heart-rate variability (HRV) and recovery</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>HRV</Typography>
                  <Typography variant="body2">
                    <strong>Last night:</strong> {metrics.hrvRecovery.avgHRV ?? '—'}{metrics.hrvRecovery.avgHRV != null && ' ms'}
                  </Typography>
                  {metrics.hrvRecovery.baselineHRV != null ? (
                    <>
                      <Typography variant="body2">
                        <strong>Your usual:</strong> {metrics.hrvRecovery.baselineHRV} ms
                        {metrics.hrvRecovery.baselineNights ? ` (${metrics.hrvRecovery.baselineNights} nights before)` : ''}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Difference:</strong> {metrics.hrvRecovery.hrvDeviation > 0 ? '+' : ''}{metrics.hrvRecovery.hrvDeviation}%
                        <Tag sx={{ ml: 1 }}>
                          {HRV_WORDS[metrics.hrvRecovery.hrvStatus] || sentenceWord(metrics.hrvRecovery.hrvStatus)}
                        </Tag>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Within 10% either side of your usual reads as balanced.
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No usual yet — it needs three nights before this one
                      {typeof metrics.hrvRecovery.baselineNights === 'number' ? ` (have ${metrics.hrvRecovery.baselineNights})` : ''}.
                    </Typography>
                  )}
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
                    <Tag sx={{ ml: 1 }}>{metrics.stress.bodyBatteryChange >= 20 ? 'Good' : 'Low'}</Tag>
                  </Typography>
                </Box>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Stress while asleep</Typography>
              <Typography variant="body2" paragraph>
                <strong>Average stress:</strong> {metrics.stress.avgStress}/100
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>Stress spikes:</strong> {metrics.stress.stressSpikes}
              </Typography>
              <Alert severity={metrics.stress.avgStress < 40 ? 'success' : 'warning'}>
                {metrics.stress.avgStress < 40
                  ? '✓ Low stress while asleep: your body was recovering'
                  : 'Stress stayed up while you slept. You may not be fully recovered.'}
              </Alert>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Respiratory Health Accordion */}
      <Accordion
        expanded={expanded.respiratory}
        onChange={handleAccordionChange('respiratory')}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AirIcon />
            <Typography sx={accordionTitleSx}>Breathing</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Breaths a minute"
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
                label="SpO2 dips"
                value={metrics.respiration.spo2Dips}
                color={metrics.respiration.spo2Dips === 0 ? 'success' : 'warning'}
                tooltip="Separate stretches with blood oxygen below 90%. A wrist sensor reads low when the arm is pressed or cold, so treat a pattern across nights as the signal, not one night."
              />
            </Grid>
          </Grid>
          {metrics.respiration.spo2Dips > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <AlertTitle>Blood oxygen dipped below 90%</AlertTitle>
              {metrics.respiration.spo2Dips} time{metrics.respiration.spo2Dips === 1 ? '' : 's'}, longest{' '}
              {metrics.respiration.longestDipMinutes} min, lowest {metrics.respiration.minSpO2}%. If this
              shows up night after night, consider:
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
          sx={accordionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckIcon />
              <Typography sx={accordionTitleSx}>Recommendations ({recommendations.length})</Typography>
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
