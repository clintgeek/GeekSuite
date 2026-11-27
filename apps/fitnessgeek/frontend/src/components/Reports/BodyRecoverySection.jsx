import React, { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Surface, SectionLabel, DisplayHeading, SurfaceSkeleton } from '../primitives';
import { useBodyRecoveryTrends } from '../../hooks/useBodyRecoveryTrends.js';
import { formatSpan } from '../BodyComposition/bodyCompFormat.js';
import {
  bpModel,
  fitnessAgeModel,
  garminCards,
  sharedComparisonWindow,
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
  // 12px on a phone, 16px from md: the suite's spacing unit is 4px.
  gap: { xs: 3, md: 4 },
};

// Without a label (the body cards alone, under "Your body") the group is a
// plain block: a "Body" label under a "Your body" heading says it twice.
const Group = ({ label, children }) => (
  <Box component={label ? 'section' : 'div'} aria-label={label} sx={{ mb: 6, '&:last-of-type': { mb: 0 } }}>
    {label && <SectionLabel sx={{ mb: 2.5 }}>{label}</SectionLabel>}
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
  <Surface data-testid={testId} sx={{ borderStyle: 'dashed', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
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
 * own dates only when its source forces a different window. The header's
 * week is the one the cards actually used (sharedComparisonWindow) — it used
 * to be the planned week even when the history started later, so it said
 * "Sep 11–17" above cards comparing with Sep 16–22.
 *
 * Four sources (Garmin trends, body-comp summary, weights, BP), each landing
 * or failing on its own.
 *
 * A person with no watch (`watch` false from Trends, or the trends route
 * answering "not enabled") sees the body cards and NOTHING about a watch: no
 * empty heart-rate cards, no "connect" card. Trends says it once, in one
 * quiet line at the foot of the page. Likewise the body-composition card is
 * left out for someone who has never sent a scan: it is a smart-scale
 * feature, and "No scans yet" only tells them about a thing they don't own.
 *
 * Not shown, by decision (plan D3): SpO2 and breathing.
 */
const BodyRecoverySection = ({ watch }) => {
  const { loading, end, garmin, weight, bodyComp, bp, reload } = useBodyRecoveryTrends();

  const cards = useMemo(
    () => (garmin.status === 'ok' ? garminCards(garmin.data, { end }) : null),
    [garmin, end],
  );
  const fitnessAge = useMemo(() => (garmin.status === 'ok' ? fitnessAgeModel(garmin.data) : null), [garmin]);
  const compareWindow = useMemo(() => sharedComparisonWindow(cards, end), [cards, end]);
  const weightM = useMemo(() => weightModel(weight.logs, weight.stats, { end, window: compareWindow }), [weight, end, compareWindow]);
  const bpM = useMemo(() => bpModel(bp.logs, { end }), [bp, end]);

  const garminPending = garmin.status === 'loading';
  const span = formatSpan(compareWindow.from, compareWindow.to);

  // No watch: known from Trends, or from the trends route itself.
  const noWatch = watch === false || garmin.status === 'not_connected';
  // A smart-scale card only for someone who has sent a scan (a failed read
  // still says so: it is never drawn as "no scans").
  const hasScans = bodyComp.status !== 'ok' || !!bodyComp.summary?.total_scans;

  let garminNotice = null;
  if (noWatch) {
    garminNotice = null;
  } else if (garmin.status === 'unavailable' || garmin.status === 'error') {
    garminNotice = (
      <SourceNotice
        testId="garmin-unavailable"
        action={(
          <Button onClick={reload} variant="tonal" sx={{ minHeight: 44 }}>
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
    <Box component="section" aria-labelledby="body-recovery-heading" id="body-recovery">
      <Box sx={{ mb: 4 }}>
        <DisplayHeading size="card" id="body-recovery-heading">
          {noWatch ? 'Your body, last 90 days' : 'Body and recovery, last 90 days'}
        </DisplayHeading>
        <Typography data-testid="body-recovery-window" sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, mt: 1.5, maxWidth: 720 }}>
          {compareWindow.planned
            ? `Each number is a 7-day average, compared with the same week a month ago (${span}).`
            : `Each number is a 7-day average, compared with the week of ${span}.`}
        </Typography>
      </Box>

      {noWatch ? null : garminNotice ? (
        <Box sx={{ mb: 6 }}>{garminNotice}</Box>
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

      <Group label={noWatch ? undefined : 'Body'}>
        {loading && weight.status === 'loading' ? <Skeletons n={3} /> : (
          <Box sx={grid}>
            {weight.status === 'ok'
              ? <WeightCard model={weightM} end={end} />
              : <SourceNotice testId="weight-error">Weight didn’t load.</SourceNotice>}
            {hasScans && (bodyComp.status === 'ok'
              ? <BodyCompCard summary={bodyComp.summary} />
              : <SourceNotice testId="body-comp-error">Body composition didn’t load.</SourceNotice>)}
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
