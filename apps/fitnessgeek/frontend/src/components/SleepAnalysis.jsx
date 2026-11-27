import React, { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { LabelPanel, FactHeadline, LabelBar, Tag, EmptyState } from './primitives';
import { EXPLAIN, WATCH_DOWN_TEXT, watchOutcome, sentenceWord } from './Reports/watchWords.js';
import { errorMessage } from '../utils/errorMessage.js';
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

/** A number for the screen, or a dash when the watch sent none. */
const show = (value) => (value == null || (typeof value === 'number' && !Number.isFinite(value)) ? '—' : value);
/** Whole hours and the minutes left over; dashes when the minutes are missing. */
const hoursAndMinutes = (minutes) => {
  const n = Number(minutes);
  if (minutes == null || !Number.isFinite(n)) return { hours: '—', rest: '' };
  return { hours: Math.floor(n / 60), rest: `h ${Math.round(n % 60)}m` };
};
const HRV_WORDS = { HIGH: 'High', BALANCED: 'Balanced', LOW: 'Low', UNBALANCED: 'Unbalanced' };

/** An accordion drawn as a card: hairline edge, 16px corners, no shadow. */
const accordionSx = {
  // 12px between the cards: the suite's spacing unit is 4px.
  mb: 3,
  border: (t) => `1px solid ${t.palette.divider}`,
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: 'none',
  backgroundImage: 'none',
  '&:before': { display: 'none' },
  '&.Mui-expanded': { margin: '0 0 12px' },
  '&:last-of-type': { mb: 0 },
  '& .MuiAccordionSummary-root': { minHeight: 56 },
  '& .MuiAccordionDetails-root': { borderTop: (t) => `1px solid ${t.palette.divider}`, pt: 4 },
};
const accordionTitleSx = { fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.25 };

/** A small status mark beside a label; the label is the words. */
const StatusMark = ({ color }) => (
  color && color !== 'default' ? (
    <Box
      aria-hidden
      sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: `${color}.main` }}
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
function MetricCard({ label, value, unit, color = 'default', trend = null, higherIsBetter = false, hint = '' }) {
  // `hint` is one plain line under the number. It used to be a hover
  // tooltip, which a phone never shows.
  return (
    <Box
      sx={{
        height: '100%',
        borderTop: (t) => `1px solid ${t.palette.divider}`,
        pt: 3,
        pb: 1,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <StatusMark color={color} />
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.2 }}>
          {label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1.5} alignItems="baseline">
        <Typography component="div" sx={{ fontWeight: 700, fontSize: '1.75rem', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {show(value)}
        </Typography>
        {unit && (
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary' }}>
            {unit}
          </Typography>
        )}
        {typeof trend === 'number' && trend !== 0 && (
          trend > 0
            ? <TrendingUpIcon color={higherIsBetter ? 'success' : 'error'} titleAccess="Above your usual" />
            : <TrendingDownIcon color={higherIsBetter ? 'error' : 'success'} titleAccess="Below your usual" />
        )}
      </Stack>
      {hint && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4, mt: 1 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Progress bar with label
 */
function ProgressMetric({ label, value, max = 100, color = 'primary', showPercentage = true }) {
  const known = value != null && Number.isFinite(Number(value));
  const percentage = known ? Math.min(100, (value / max) * 100) : 0;

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" fontWeight="bold">
          {!known ? '—' : showPercentage ? `${Math.round(percentage)}%` : `${value}${max ? `/${max}` : ''}`}
        </Typography>
      </Stack>
      {/* Blue is the measured bar; a stage that misses its line is marked in
          the theme's warning colour, a stage that makes it stays blue. */}
      <LabelBar
        value={percentage}
        label={known ? `${label}: ${Math.round(percentage)}%` : `${label}: no reading`}
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
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
            <Typography variant="subtitle2">{recommendation.issue}</Typography>
            {recommendation.category && <Tag>{sentenceWord(String(recommendation.category))}</Tag>}
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
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [expanded, setExpanded] = useState({
    architecture: false,
    cardiovascular: false,
    recovery: false,
    respiratory: false,
    recommendations: false
  });

  useEffect(() => {
    if (!date) return undefined;
    let current = true;

    async function fetchSleepData() {
      setLoading(true);
      setError(null);

      try {
        const response = await influxService.getSleepAnalysis(date);
        if (!current) return;
        // { available: false } means two different things. With
        // reason 'influx_unavailable' the data server could not be reached:
        // a failed read, said as one. Without it, the watch sent no sleep.
        // The server's own `message` is never shown; it names the database.
        if (watchOutcome(response) === 'down') {
          setData(null);
          setError(WATCH_DOWN_TEXT);
        } else {
          setData(response);
        }
      } catch (err) {
        if (!current) return;
        console.warn('Sleep analysis unavailable:', err?.message);
        // This used to be folded into the "No sleep for this night" state,
        // so a failed read looked like a night with no sleep.
        setData(null);
        setError(errorMessage(err, 'Couldn’t load your sleep for this night. Try again.'));
      } finally {
        if (current) setLoading(false);
      }
    }

    fetchSleepData();
    return () => { current = false; };
  }, [date, attempt]);

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpanded(prev => ({ ...prev, [panel]: isExpanded }));
  };

  if (loading) {
    return (
      <LabelPanel title="Your sleep">
        <Typography sx={{ color: 'text.secondary' }}>Loading your sleep…</Typography>
      </LabelPanel>
    );
  }

  if (error) {
    return <GeekErrorState title="Couldn’t load your sleep" error={error} onRetry={retry} data-testid="sleep-error" />;
  }

  if (!data || !data.available) {
    return (
      <EmptyState
        icon={BedtimeIcon}
        title="No sleep recorded for this night"
        copy="If you wore your watch, open the Garmin Connect app on your phone to sync it, then look again. If you didn’t wear it to bed, there is nothing to show for this night."
        data-testid="sleep-empty"
      />
    );
  }

  const { qualityScore, qualityLabel } = data;
  // A partial record must not take the panel down: every group defaults to
  // empty, and a missing number draws as a dash.
  const metrics = {
    architecture: {}, continuity: {}, cardiovascular: {}, hrvRecovery: {}, stress: {}, respiration: {},
    ...(data.metrics || {}),
  };
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.filter(Boolean) : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
  const asleep = hoursAndMinutes(metrics.architecture.asleepMinutes);
  const inBed = hoursAndMinutes(metrics.architecture.totalMinutes);

  return (
    <Box>
      {/* Summary panel: the score is the headline */}
      <LabelPanel title="Your sleep" level={1} sx={{ mb: 3 }}>
          {qualityScore != null ? (
            <>
              <FactHeadline caption="Sleep score" name={qualityLabel ? <Tag>{sentenceWord(qualityLabel)}</Tag> : ''} value={`${qualityScore}/100`} />
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1 }}>
                {`${EXPLAIN.sleepScore} The same number your watch shows.`}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
              No score from the watch yet
            </Typography>
          )}
          <Box sx={{ height: 16 }} />

          {/* Key metrics: four headline numbers under one rule, no boxes */}
          <Grid container columnSpacing={4} rowSpacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Time asleep"
                value={asleep.hours}
                unit={asleep.rest || undefined}
                color={metrics.architecture.asleepMinutes >= 420 ? 'success' : 'warning'}
                hint="Not counting time awake in bed. Aim for 7 to 9 hours."
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Deep sleep"
                value={metrics.architecture.deepPercent}
                unit="%"
                color={metrics.architecture.deepPercent >= 15 ? 'success' : 'warning'}
                hint="Of your time asleep. Marked when under 15%."
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
                hint={`Heart-rate variability. ${EXPLAIN.hrv}`}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Asleep while in bed"
                value={metrics.architecture.sleepEfficiency}
                unit="%"
                color={metrics.architecture.sleepEfficiency >= 90 ? 'success' : 'warning'}
                hint="Aim for over 90%."
              />
            </Grid>
          </Grid>

          {/* Warnings */}
          {warnings.length > 0 && (
            <Alert severity="warning" sx={{ mt: 3 }}>
              <AlertTitle>Worth a look</AlertTitle>
              <List dense disablePadding>
                {warnings.map((warning, idx) => (
                  <ListItem key={idx} disableGutters sx={{ py: 0 }}>
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
          <Stack direction="row" spacing={3} alignItems="center">
            <BedtimeIcon />
            <Typography sx={accordionTitleSx}>Sleep stages</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={4}>
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
              <Stack spacing={2}>
                <Typography variant="body2">
                  <strong>Time in bed:</strong> {inBed.hours}{inBed.rest}
                  {' · '}<strong>asleep</strong> {asleep.hours}{asleep.rest}
                </Typography>
                <Typography variant="body2">
                  <strong>Times awake:</strong> {show(metrics.continuity.awakenings)}
                </Typography>
                {/* Transitions per hour asleep. There is deliberately no
                    Good/High chip: nothing calibrates a threshold for Garmin's
                    segment granularity, and the index this replaced read "92%
                    · High" on every night because it could not vary. */}
                <Typography variant="body2">
                  <strong>Stage changes:</strong> {show(metrics.continuity.transitionsPerHour)} per hour asleep
                </Typography>
                <Typography variant="body2">
                  <strong>Stage changes in all:</strong> {show(metrics.continuity.stageTransitions)}
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
          <Stack direction="row" spacing={3} alignItems="center">
            <HeartIcon />
            <Typography sx={accordionTitleSx}>Heart rate overnight</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={4}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Resting heart rate"
                value={metrics.cardiovascular.restingHeartRate}
                unit="bpm"
hint="The low your heart settled to overnight."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Average while asleep"
                value={metrics.cardiovascular.avgHeartRate}
                unit="bpm"
hint="Across the whole night."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Average in deep sleep"
                value={metrics.cardiovascular.avgDeepSleepHR}
                unit="bpm"
hint="While in deep sleep."
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
          <Stack direction="row" spacing={3} alignItems="center">
            <BrainIcon />
            <Typography sx={accordionTitleSx}>Heart-rate variability (HRV) and recovery</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Stack spacing={4}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>HRV</Typography>
                  <Typography variant="body2">
                    <strong>Last night:</strong> {metrics.hrvRecovery.avgHRV ?? '—'}{metrics.hrvRecovery.avgHRV != null && ' ms'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {EXPLAIN.hrv}
                  </Typography>
                  {metrics.hrvRecovery.baselineHRV != null ? (
                    <>
                      <Typography variant="body2">
                        <strong>Your usual:</strong> {metrics.hrvRecovery.baselineHRV} ms
                        {metrics.hrvRecovery.baselineNights ? ` (${metrics.hrvRecovery.baselineNights} nights before)` : ''}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Difference:</strong> {metrics.hrvRecovery.hrvDeviation > 0 ? '+' : ''}{metrics.hrvRecovery.hrvDeviation}%
                        <Tag sx={{ ml: 2 }}>
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
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {EXPLAIN.bodyBattery}
                  </Typography>
                  <Typography variant="body2">
                    <strong>At bedtime:</strong> {show(metrics.stress.bodyBatteryStart)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>On waking:</strong> {show(metrics.stress.bodyBatteryEnd)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Charged overnight:</strong> {metrics.stress.bodyBatteryChange >= 0 ? '+' : ''}{show(metrics.stress.bodyBatteryChange)} points
                    {metrics.stress.bodyBatteryChange != null && (
                      <Tag sx={{ ml: 2 }}>{metrics.stress.bodyBatteryChange >= 20 ? 'Good' : 'Low'}</Tag>
                    )}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>Stress while asleep</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {EXPLAIN.stress}
              </Typography>
              <Typography variant="body2">
                <strong>Average stress:</strong> {show(metrics.stress.avgStress)}/100
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Stress spikes:</strong> {show(metrics.stress.stressSpikes)}
              </Typography>
              {metrics.stress.avgStress != null && (
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Tag tone={metrics.stress.avgStress < 40 ? 'success' : 'warning'}>
                    {metrics.stress.avgStress < 40 ? 'Calm' : 'Raised'}
                  </Tag>
                  {metrics.stress.avgStress < 40
                    ? 'Low stress while asleep: your body was recovering.'
                    : 'Stress stayed up while you slept. You may not be fully recovered.'}
                </Typography>
              )}
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
          <Stack direction="row" spacing={3} alignItems="center">
            <AirIcon />
            <Typography sx={accordionTitleSx}>Breathing</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={4}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Breaths a minute"
                value={metrics.respiration.avgRespirationRate}
                hint="Your average while asleep."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Blood oxygen, average"
                value={metrics.respiration.avgSpO2}
                unit="%"
                color={metrics.respiration.avgSpO2 >= 95 ? 'success' : 'warning'}
hint={EXPLAIN.spo2}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Blood oxygen, lowest"
                value={metrics.respiration.minSpO2}
                unit="%"
                color={metrics.respiration.minSpO2 >= 90 ? 'success' : 'error'}
hint="Marked when under 90%."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                label="Blood oxygen dips"
                value={metrics.respiration.spo2Dips}
                color={metrics.respiration.spo2Dips === 0 ? 'success' : 'warning'}
hint="Stretches under 90%. A wrist sensor reads low when the arm is pressed or cold, so one night proves little."
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
            <Stack direction="row" spacing={3} alignItems="center">
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
