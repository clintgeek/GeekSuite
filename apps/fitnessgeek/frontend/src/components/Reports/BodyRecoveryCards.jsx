import React, { lazy, Suspense } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { ArrowForward as ArrowIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, SectionLabel, StatNumber } from '../primitives';
import { formatDay, formatSpan, signedLb } from '../BodyComposition/bodyCompFormat.js';
import {
  addDays,
  describeTrendChange,
  fitnessAgeGap,
  TREND_DAYS,
  WEEKLY_INTENSITY_GUIDELINE,
  windowCaption,
} from './bodyRecoveryModel.js';

const BodyRecoverySparkline = lazy(() => import('./BodyRecoverySparkline.jsx'));

const SPARK_HEIGHT = 56;

const caption = { color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.45 };
const mono = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

/** The card shell: a named article, so each card is its own landmark for a screen reader. */
const Card = ({ label, children, testId }) => (
  <Surface
    component="article"
    aria-label={label}
    data-testid={testId}
    sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}
  >
    {children}
  </Surface>
);

/**
 * The change line: a signed amount in the same ink as everything else, then
 * what it is measured against. No red or green — whether down is good depends
 * on the metric, and the card's meaning line says which.
 */
export const ChangeLine = ({ change }) => {
  if (!change) return null;
  return (
    <Typography sx={{ ...caption, color: 'text.primary' }} data-kind={change.kind} data-testid="trend-change">
      {(change.parts || (change.amount ? [{ amount: change.amount }] : [])).map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Box component="span" sx={{ color: 'text.secondary' }}>{' · '}</Box>}
          {p.label && <Box component="span">{p.label} </Box>}
          <Box component="span" sx={{ ...mono, mr: 0.75 }}>{p.amount}</Box>
        </React.Fragment>
      ))}
      <Box component="span" sx={{ color: change.kind === 'delta' ? 'text.secondary' : 'text.primary' }}>
        {change.text}
      </Box>
    </Typography>
  );
};

const Spark = ({ segments, end, minSpan, label }) => (
  <Suspense fallback={<Box sx={{ height: SPARK_HEIGHT }} />}>
    <BodyRecoverySparkline
      segments={segments}
      from={addDays(end, -(TREND_DAYS - 1))}
      to={end}
      minSpan={minSpan}
      label={label}
      height={SPARK_HEIGHT}
    />
  </Suspense>
);

/** Number on the left, 90-day shape on the right. */
const Headline = ({ label, value, decimals, unit, sub, segments, end, minSpan, sparkLabel }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(88px, 42%)',
      alignItems: 'end',
      columnGap: 2,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ mb: 1 }}>{label}</SectionLabel>
      <StatNumber value={value} decimals={decimals} unit={unit} size="display" />
      {sub && <Typography sx={{ ...caption, mt: 0.75 }}>{sub}</Typography>}
    </Box>
    {segments?.length ? (
      <Spark segments={segments} end={end} minSpan={minSpan} label={sparkLabel} />
    ) : <Box />}
  </Box>
);

const NoReadings = ({ label, children }) => (
  <Card label={label}>
    <SectionLabel>{label}</SectionLabel>
    <Typography sx={caption}>{children}</Typography>
  </Card>
);

const Meaning = ({ children }) =>
  children ? <Typography sx={{ ...caption, mt: 'auto' }}>{children}</Typography> : null;

/**
 * One Garmin metric: current 7-day mean, the change vs ~30 days earlier (or
 * the date it will exist), a 90-day sparkline and what the number means.
 */
export const TrendCard = ({ card, end, extra }) => {
  if (!card.current) {
    return <NoReadings label={card.label}>No readings in the last {TREND_DAYS} days.</NoReadings>;
  }
  const change = describeTrendChange(card.change, {
    decimals: card.decimals,
    unit: card.deltaUnit || '',
    steady: card.steady,
  });
  return (
    <Card label={card.label} testId={`trend-${card.key}`}>
      <Headline
        label={card.label}
        value={card.current.mean}
        decimals={card.decimals}
        unit={card.unit}
        sub={windowCaption(card.current, end)}
        segments={card.segments}
        end={end}
        minSpan={card.minSpan}
        sparkLabel={`${card.label}, 7-day average over the last ${TREND_DAYS} days`}
      />
      {extra}
      <ChangeLine change={change} />
      <Meaning>{card.meaning}</Meaning>
    </Card>
  );
};

/** Weekly intensity minutes, with where that sits against the 150-minute guideline. */
export const IntensityCard = ({ card, end }) => {
  const weekly = card.current ? Math.round(card.current.mean) : null;
  const vsGuideline = weekly === null
    ? null
    : weekly >= WEEKLY_INTENSITY_GUIDELINE
      ? `At or above the ${WEEKLY_INTENSITY_GUIDELINE}-minute guideline`
      : `${WEEKLY_INTENSITY_GUIDELINE - weekly} minutes short of ${WEEKLY_INTENSITY_GUIDELINE}`;
  return (
    <TrendCard
      card={card}
      end={end}
      extra={vsGuideline ? <Typography sx={{ ...caption, color: 'text.primary' }}>{vsGuideline}</Typography> : null}
    />
  );
};

/** A small labelled figure for the compact cards. */
const Figure = ({ label, value, unit, decimals = 0, note }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>{label}</Typography>
    {value === null || value === undefined
      ? <StatNumber value="—" size="body" />
      : <StatNumber value={value} decimals={decimals} unit={unit} size="body" />}
    {note && <Typography sx={{ ...caption, fontSize: '0.75rem', mt: 0.25 }}>{note}</Typography>}
  </Box>
);

/** Stress and Body Battery as daily means — one compact card, no sparkline. */
export const StressBatteryCard = ({ stress, high, low, end }) => {
  const label = 'Stress & Body Battery';
  if (!stress.current && !high.current && !low.current) {
    return <NoReadings label={label}>No readings in the last {TREND_DAYS} days.</NoReadings>;
  }
  const change = describeTrendChange(stress.change, { decimals: 0, unit: stress.deltaUnit, steady: stress.steady });
  return (
    <Card label={label} testId="trend-stress">
      <SectionLabel>{label}</SectionLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 2 }}>
        <Figure label="Stress" value={stress.current?.mean} unit="/ 100" />
        <Figure label="Battery high" value={high.current?.mean} />
        <Figure label="Battery low" value={low.current?.mean} />
      </Box>
      <Typography sx={caption}>{windowCaption(stress.current || high.current, end, { lead: 'Daily means, 7-day average' })}</Typography>
      {change && (
        <ChangeLine
          change={change.kind === 'delta'
            ? { ...change, text: `in stress ${change.text}` }
            : change.kind === 'level'
              ? { ...change, text: change.text.replace(/^About/, 'Stress about') }
              : change}
        />
      )}
      <Meaning>Lower stress is calmer. Body Battery is Garmin’s 0–100 energy estimate: what you charge to overnight, and drain to by evening.</Meaning>
    </Card>
  );
};

/** Garmin's fitness age against the user's own. Sparse and slow, so no sparkline. */
export const FitnessAgeCard = ({ model }) => {
  const label = 'Fitness age';
  if (!model) {
    return <NoReadings label={label}>Garmin hasn’t estimated one yet.</NoReadings>;
  }
  const gap = fitnessAgeGap(model);
  return (
    <Card label={label} testId="trend-fitness-age">
      <SectionLabel>{label}</SectionLabel>
      <StatNumber value={model.current} decimals={0} unit="years" size="display" />
      {gap && <Typography sx={{ ...caption, color: 'text.primary' }}>{gap}{model.chronological !== null ? ` (${model.chronological})` : ''}</Typography>}
      <Typography sx={caption}>
        {model.achievable !== null ? `Achievable: ${model.achievable}` : ''}
        {model.achievable !== null && model.asOf ? ' · ' : ''}
        {model.asOf ? `as of ${formatDay(model.asOf)}` : ''}
      </Typography>
      <Meaning>Garmin’s estimate from VO2 max. It moves over months, not weeks.</Meaning>
    </Card>
  );
};

const DetailLink = ({ to, children }) => (
  <Button
    component={RouterLink}
    to={to}
    size="small"
    endIcon={<ArrowIcon fontSize="small" />}
    sx={{ alignSelf: 'flex-start', minHeight: 44, px: 1, ml: -1, mt: 'auto', mb: -1 }}
  >
    {children}
  </Button>
);

/** Weight: the 7-day mean and the same smoothed change the dashboard shows. */
export const WeightCard = ({ model, end }) => {
  const label = 'Weight';
  if (!model.current) {
    return (
      <Card label={label}>
        <SectionLabel>{label}</SectionLabel>
        <Typography sx={caption}>No weigh-ins yet.</Typography>
        <DetailLink to="/weight">Weight &amp; body</DetailLink>
      </Card>
    );
  }
  const stale = model.current.to && model.current.to < addDays(end, -1);
  return (
    <Card label={label} testId="trend-weight">
      <Headline
        label={label}
        value={model.current.mean}
        decimals={1}
        unit="lb"
        sub={stale ? `7-day average to ${formatDay(model.current.to)}` : '7-day average'}
        segments={model.segments}
        end={end}
        minSpan={6}
        sparkLabel={`Weight, 7-day average over the last ${TREND_DAYS} days`}
      />
      <ChangeLine change={model.change} />
      <DetailLink to="/weight">Weight &amp; body</DetailLink>
    </Card>
  );
};

/**
 * Body composition: the server's smoothed summary — 14-day "current", and
 * its fat/lean change or the date that change appears. Phrased with the
 * Weight & body page's own helpers; nothing is subtracted here.
 */
export const BodyCompCard = ({ summary }) => {
  const label = 'Body composition';
  const current = summary?.current;
  if (!summary?.total_scans || !current) {
    return (
      <Card label={label}>
        <SectionLabel>{label}</SectionLabel>
        <Typography sx={caption}>No scans yet.</Typography>
        <DetailLink to="/weight">Weight &amp; body</DetailLink>
      </Card>
    );
  }
  const change = summary.change;
  let changeLine = null;
  if (change?.available) {
    changeLine = {
      kind: 'delta',
      parts: [
        { label: 'Fat', amount: signedLb(change.fat_change_lb) },
        { label: 'lean', amount: signedLb(change.lean_change_lb) },
      ],
      text: `vs ${formatSpan(change.baseline?.from, change.baseline?.to)}`,
    };
  } else if (change?.available_from) {
    changeLine = { kind: 'pending', text: `Change from ${formatDay(change.available_from)}` };
  }
  return (
    <Card label={label} testId="trend-body-comp">
      <SectionLabel>{label}</SectionLabel>
      <StatNumber value={current.body_fat_pct} decimals={1} unit="% body fat" size="display" />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2 }}>
        <Figure label="Fat mass" value={current.fat_mass_lb} decimals={1} unit="lb" />
        <Figure label="Lean mass" value={current.lean_mass_lb} decimals={1} unit="lb" />
      </Box>
      <Typography sx={caption}>
        14-day average · {current.scans} {current.scans === 1 ? 'scan' : 'scans'} · {formatSpan(current.from, current.to)}
      </Typography>
      <ChangeLine change={changeLine} />
      <DetailLink to="/weight">Weight &amp; body</DetailLink>
    </Card>
  );
};

/** Blood pressure: 7- and 30-day averages, like BP Insights. */
export const BPCard = ({ model }) => {
  const label = 'Blood pressure';
  if (!model.avg30) {
    return (
      <Card label={label}>
        <SectionLabel>{label}</SectionLabel>
        <Typography sx={caption}>
          {model.latest ? `No readings in the last 30 days; the latest was ${formatDay(model.latest)}.` : 'No readings yet.'}
        </Typography>
        <DetailLink to="/blood-pressure">Blood pressure</DetailLink>
      </Card>
    );
  }
  // StatNumber parses a string value ("124/79" would print "124"), so the
  // systolic rides in as the prefix of the diastolic.
  const Reading = ({ a, unit, size }) => (a
    ? <StatNumber value={a.diastolic} prefix={`${a.systolic}/`} unit={unit} size={size} />
    : <StatNumber value="—" size={size} />);
  const count = (a) => (a ? `${a.count} ${a.count === 1 ? 'reading' : 'readings'}` : 'no readings');
  return (
    <Card label={label} testId="trend-bp">
      <SectionLabel>{label}</SectionLabel>
      <Box>
        <Reading a={model.avg7} unit="mmHg" size="display" />
        <Typography sx={{ ...caption, mt: 0.75 }}>
          {model.avg7 ? `7-day average · ${count(model.avg7)}` : 'No readings in the last 7 days'}
        </Typography>
      </Box>
      <Typography sx={{ ...caption, color: 'text.primary' }}>
        <Box component="span" sx={{ color: 'text.secondary' }}>30-day average </Box>
        <Box component="span" sx={mono}>{model.avg30.systolic}/{model.avg30.diastolic}</Box>
        <Box component="span" sx={{ color: 'text.secondary' }}> · {count(model.avg30)}</Box>
      </Typography>
      {model.category && model.category.stage !== 'Unknown' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: model.category.color, flexShrink: 0 }} />
          <Typography sx={{ ...caption, color: 'text.primary' }}>
            The {model.categoryOf} average is in the {model.category.stage} range
          </Typography>
        </Box>
      )}
      <DetailLink to="/blood-pressure">Blood pressure</DetailLink>
    </Card>
  );
};
