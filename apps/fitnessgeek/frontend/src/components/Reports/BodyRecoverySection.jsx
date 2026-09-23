import React, { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, SectionLabel, DisplayHeading, SurfaceSkeleton } from '../primitives';
import { useBodyRecoveryTrends } from '../../hooks/useBodyRecoveryTrends.js';
import {
  bpModel,
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
 * sparkline long enough to show a direction. The header says so.
 *
 * Four sources (Garmin trends, body-comp summary, weights, BP), each landing
 * or failing on its own. A user without the Influx connection (a 403) sees
 * the body cards and one quiet line about the Garmin ones.
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

  let garminNotice = null;
  if (garmin.status === 'not_connected') {
    garminNotice = (
      <SourceNotice
        testId="garmin-not-connected"
        action={(
          <Button component={RouterLink} to="/health" variant="outlined" size="small" sx={{ minHeight: 44 }}>
            Health Dashboard
          </Button>
        )}
      >
        Garmin trends — resting heart rate, HRV, sleep and activity — appear here once the
        Health Dashboard connection is on.
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
        <SectionLabel sx={{ mb: 0.75 }}>Body &amp; recovery · 90-day trends</SectionLabel>
        <DisplayHeading size="card" id="body-recovery-heading">How your body is trending</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, mt: 0.75, maxWidth: 720 }}>
          Each figure is a 7-day average, compared with the week about 30 days earlier.
          The range toggle above applies to the food report only.
        </Typography>
      </Box>

      {garminNotice ? (
        <Box sx={{ mb: 3 }}>{garminNotice}</Box>
      ) : (
        <>
          <Group label="Heart & recovery">
            {garminPending || !cards ? <Skeletons n={3} /> : (
              <Box sx={grid}>
                <TrendCard card={cards.restingHR} end={end} />
                <TrendCard card={cards.hrv} end={end} />
                <TrendCard card={cards.sleepScore} end={end} />
                <TrendCard card={cards.sleepHours} end={end} />
                <StressBatteryCard stress={cards.stress} high={cards.bodyBatteryHigh} low={cards.bodyBatteryLow} end={end} />
              </Box>
            )}
          </Group>
          <Group label="Activity">
            {garminPending || !cards ? <Skeletons n={3} /> : (
              <Box sx={grid}>
                <IntensityCard card={cards.intensity} end={end} />
                <TrendCard card={cards.steps} end={end} />
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
