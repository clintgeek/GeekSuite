import React, { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, SectionLabel, DisplayHeading, SurfaceSkeleton } from '../primitives';
import { useBodyRecoveryTrends } from '../../hooks/useBodyRecoveryTrends.js';
import { formatSpan } from '../BodyComposition/bodyCompFormat.js';
import {
  bpModel,
  comparisonWindow,
  fitnessAgeModel,
  garminCards,
  weightModel,
} from './bodyRecoveryModel.js';
import {
  BodyCompCard,
  BPCard,
  FitnessAgeCard,
  IntensityCard,
  StressBatteryCard,
  TrendCard,
  WeightCard,
} from './BodyRecoveryCards.jsx';

const grid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};

const Group = ({ label, children }) => (
  <Box component="section" aria-label={label} sx={{ mb: 3, '&:last-of-type': { mb: 0 } }}>
    <SectionLabel sx={{ mb: 1.25 }}>{label}</SectionLabel>
    {children}
  </Box>
);

const Skeletons = ({ n }) => (
  <Box sx={grid}>
    {Array.from({ length: n }).map((_, i) => <SurfaceSkeleton key={i} rows={2} />)}
  </Box>
);

/** One source failed: said once, in place of its cards, never blanking the rest. */
const SourceNotice = ({ children, action, testId }) => (
  <Surface data-testid={testId} sx={{ borderStyle: 'dashed', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
    <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5, flex: '1 1 240px' }}>
      {children}
    </Typography>
    {action}
  </Surface>
);

/**
 * Reports › Body & recovery — 90-day trends (DOCS/FITNESSGEEK_TRENDS_PLAN.md D1–D3).
 *
 * It ignores the page's 7/14/30-day toggle on purpose: a trend under the
 * smoothing rule needs a 7-day mean now against one ~30 days earlier, and a
 * sparkline long enough to show a direction. It sits below the food report
 * and its AI notes with its own "last 90 days" label, so it never needs to
 * apologise for the toggle (UX review 2026-10-17, D-5).
 *
 * The comparison week is said once, in the header (D-6); a card names its
 * own dates only when its source forces a different window.
 *
 * Four sources (Garmin trends, body-comp summary, weights, BP), each landing
 * or failing on its own. A user without the Influx connection (a 403) sees
 * the body cards and one line, with a way to connect Garmin.
 *
 * Not shown, by decision (plan D3): SpO2 and breathing.
 */
const BodyRecoverySection = () => {
  const { loading, end, garmin, weight, bodyComp, bp, reload } = useBodyRecoveryTrends();

  const cards = useMemo(
    () => (garmin.status === 'ok' ? garminCards(garmin.data, { end }) : null),
    [garmin, end],
  );
  const fitnessAge = useMemo(() => (garmin.status === 'ok' ? fitnessAgeModel(garmin.data) : null), [garmin]);
  const weightM = useMemo(() => weightModel(weight.logs, weight.stats, { end }), [weight, end]);
  const bpM = useMemo(() => bpModel(bp.logs, { end }), [bp, end]);

  const garminPending = garmin.status === 'loading';
  const compareWindow = useMemo(() => comparisonWindow(end), [end]);

  let garminNotice = null;
  if (garmin.status === 'not_connected') {
    garminNotice = (
      <SourceNotice
        testId="garmin-not-connected"
        action={(
          <Button component={RouterLink} to="/settings#garmin" variant="outlined" size="small" sx={{ minHeight: 44 }}>
            Connect Garmin
          </Button>
        )}
      >
        Heart rate, sleep and activity trends show here once Garmin is connected.
      </SourceNotice>
    );
  } else if (garmin.status === 'unavailable' || garmin.status === 'error') {
    garminNotice = (
      <SourceNotice
        testId="garmin-unavailable"
        action={(
          <Button onClick={reload} variant="outlined" size="small" sx={{ minHeight: 44 }}>
            Try again
          </Button>
        )}
      >
        {garmin.status === 'unavailable'
          ? 'Garmin trends aren’t available right now. The cards below are unaffected.'
          : 'Garmin trends didn’t load. The cards below are unaffected.'}
      </SourceNotice>
    );
  }

  return (
    <Box component="section" aria-labelledby="body-recovery-heading" id="body-recovery" sx={{ mb: 5 }}>
      <Box sx={{ mb: 2.5 }}>
        <DisplayHeading size="card" id="body-recovery-heading">Body and recovery, last 90 days</DisplayHeading>
        <Typography data-testid="body-recovery-window" sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, mt: 0.75, maxWidth: 720 }}>
          {`Each number is a 7-day average, compared with the same week a month ago (${formatSpan(compareWindow.from, compareWindow.to)}).`}
        </Typography>
      </Box>

      {garminNotice ? (
        <Box sx={{ mb: 3 }}>{garminNotice}</Box>
      ) : (
        <>
          <Group label="Heart and recovery">
            {garminPending || !cards ? <Skeletons n={3} /> : (
              <Box sx={grid}>
                <TrendCard card={cards.restingHR} end={end} window={compareWindow} />
                <TrendCard card={cards.hrv} end={end} window={compareWindow} />
                <TrendCard card={cards.sleepScore} end={end} window={compareWindow} />
                <TrendCard card={cards.sleepHours} end={end} window={compareWindow} />
                <StressBatteryCard stress={cards.stress} high={cards.bodyBatteryHigh} low={cards.bodyBatteryLow} end={end} window={compareWindow} />
              </Box>
            )}
          </Group>
          <Group label="Activity">
            {garminPending || !cards ? <Skeletons n={3} /> : (
              <Box sx={grid}>
                <IntensityCard card={cards.intensity} end={end} window={compareWindow} />
                <TrendCard card={cards.steps} end={end} window={compareWindow} />
                <FitnessAgeCard model={fitnessAge} />
              </Box>
            )}
          </Group>
        </>
      )}

      <Group label="Body">
        {loading && weight.status === 'loading' ? <Skeletons n={3} /> : (
          <Box sx={grid}>
            {weight.status === 'ok'
              ? <WeightCard model={weightM} end={end} />
              : <SourceNotice testId="weight-error">Weight didn’t load.</SourceNotice>}
            {bodyComp.status === 'ok'
              ? <BodyCompCard summary={bodyComp.summary} />
              : <SourceNotice testId="body-comp-error">Body composition didn’t load.</SourceNotice>}
            {bp.status === 'ok'
              ? <BPCard model={bpM} />
              : <SourceNotice testId="bp-error">Blood pressure didn’t load.</SourceNotice>}
          </Box>
        )}
      </Group>
    </Box>
  );
};

export default BodyRecoverySection;
