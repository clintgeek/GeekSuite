import React, { useState, useEffect, useCallback } from 'react';
import { influxService } from '../services/influxService';
import { Box, Typography, CircularProgress } from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { LabelPanel, FactHeadline, LabelBar, Tag, ListRow, EmptyState } from './primitives';
import { BatteryChargingFull as EnergyIcon } from '@mui/icons-material';
import { EXPLAIN, WATCH_DOWN_TEXT, watchOutcome } from './Reports/watchWords.js';
import { errorMessage } from '../utils/errorMessage.js';

const PRIORITY_WORDS = { HIGH: 'Do this first', MEDIUM: 'Worth doing', LOW: 'Nice to have' };

const quiet = { color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5 };

/** The score in a word, the tone that word takes (the colour agrees with the
 * word: green for the two good bands, amber for Moderate, red for Low), and
 * what to do with it. The bands and sentences are unchanged. */
function readinessWords(score) {
  if (score >= 80) return { label: 'Excellent', tone: 'success', advice: 'Well recovered. A hard workout is fine today.' };
  if (score >= 70) return { label: 'Good', tone: 'success', advice: 'Recovered. A moderate to hard workout suits today.' };
  if (score >= 60) return { label: 'Good', tone: undefined, advice: 'Partly recovered. Keep it moderate and listen to your body.' };
  if (score >= 50) return { label: 'Moderate', tone: 'warning', advice: 'Partly recovered. Keep it moderate and listen to your body.' };
  if (score >= 40) return { label: 'Moderate', tone: 'warning', advice: 'Not well recovered. Keep it light: a walk, yoga or stretching.' };
  if (score >= 30) return { label: 'Low', tone: 'error', advice: 'Not well recovered. Keep it light: a walk, yoga or stretching.' };
  return { label: 'Low', tone: 'error', advice: 'Run down. Take a rest day and put sleep first.' };
}

/** The score, what it is, and how hard to go: one card, one colour (the tag). */
function Readiness({ score }) {
  const { label, tone, advice } = readinessWords(score);
  return (
    <LabelPanel title="Ready-for-today score" level={1}>
      <Typography sx={{ ...quiet, fontSize: '0.8125rem', mt: -1.5 }}>{EXPLAIN.readiness}</Typography>
      <FactHeadline name={<Tag tone={tone}>{label}</Tag>} value={score} unit="/100" />
      <LabelBar value={score} label={`Ready-for-today score: ${score} out of 100`} height={10} sx={{ mt: 3, mb: 4 }} />
      <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>How hard to go today</Typography>
      <Typography sx={{ fontSize: '1rem', lineHeight: 1.5, mt: 0.5 }}>{advice}</Typography>
    </LabelPanel>
  );
}

/** A plain list: a bold line and a quiet one, hairlines between. */
function Tips({ title, items }) {
  return (
    <LabelPanel title={title} sx={{ minWidth: 0 }}>
      {items.map(([primary, secondary], i) => (
        <ListRow key={primary} first={i === 0} sx={{ display: 'block', py: 2.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.35 }}>{primary}</Typography>
          <Typography sx={{ ...quiet, mt: 0.5 }}>{secondary}</Typography>
        </ListRow>
      ))}
    </LabelPanel>
  );
}

/**
 * Health › Recovery: a readiness score for the day and what follows from it.
 *
 * The notes are worked out by fixed rules on the server from last night's
 * sleep and the day's readings. The heading used to call them "notes from
 * the AI"; no model writes them, so it no longer says so.
 */
export default function RecoveryCoach({ date }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!date) return undefined;
    let current = true;

    async function fetchRecommendations() {
      setLoading(true);
      setError(null);

      try {
        const response = await influxService.getRecoveryRecommendations(date);
        if (!current) return;
        // "The data server is down" is a failed read, not a day with nothing
        // to go on.
        if (watchOutcome(response) === 'down') {
          setData(null);
          setError(WATCH_DOWN_TEXT);
        } else {
          setData(response);
        }
      } catch (err) {
        if (!current) return;
        console.warn('Recovery recommendations unavailable:', err?.message);
        setData(null);
        setError(errorMessage(err, WATCH_DOWN_TEXT));
      } finally {
        if (current) setLoading(false);
      }
    }

    fetchRecommendations();
    return () => { current = false; };
  }, [date, attempt]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading your recovery notes" />
      </Box>
    );
  }

  if (error) {
    return <GeekErrorState title="Couldn’t load your recovery notes" error={error} onRetry={retry} data-testid="recovery-error" />;
  }

  const score = Number(data?.readinessScore);
  if (!data || !data.available || !Number.isFinite(score)) {
    return (
      <EmptyState
        icon={EnergyIcon}
        title="Nothing to go on yet"
        copy="Recovery notes need last night’s sleep and today’s readings from your watch. Check back after it syncs."
        data-testid="recovery-empty"
      />
    );
  }

  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.filter(Boolean) : [];
  const deepSleepLow = data.context?.sleep?.deepSleepPercent < 20;
  const stressHigh = data.context?.current?.stress > 60;

  const food = [
    score < 60 && ['Put protein and whole foods first', 'About 1g of protein per lb of body weight, plus oily fish and colorful vegetables.'],
    deepSleepLow && ['Support deep sleep with magnesium-rich foods', 'Pumpkin seeds, dark chocolate, spinach. Consider 400mg magnesium glycinate supplement.'],
    stressHigh && ['Include adaptogens and B vitamins', 'Ashwagandha, rhodiola, B-complex. Go easy on caffeine.'],
    ['Stay hydrated', 'About half your body weight in ounces of water, more if you work out.'],
  ].filter(Boolean);

  const sleep = [
    deepSleepLow && ['Cool your bedroom to 65–68°F', 'A cooler room helps deep sleep.'],
    deepSleepLow && ['Finish dinner by 7 PM', 'A late meal can cut into deep sleep.'],
    ['No screens for an hour before bed', 'Screen light can keep you awake.'],
    ['Keep the same bedtime', 'Go to bed and get up at the same times every day, weekends too.'],
  ].filter(Boolean);

  const gap = { xs: 3, md: 4 };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap }}>
      <Readiness score={score} />

      <LabelPanel title="For you today" data-testid="recovery-notes">
        {recommendations.length > 0 ? recommendations.map((rec, idx) => (
          <ListRow key={idx} first={idx === 0} sx={{ display: 'block', py: 3 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
              <Typography component="h4" sx={{ m: 0, fontWeight: 600, fontSize: '1rem', lineHeight: 1.35 }}>{rec.title}</Typography>
              {rec.priority && <Tag>{PRIORITY_WORDS[rec.priority] || rec.priority}</Tag>}
            </Box>
            {rec.message && <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.5, mt: 1 }}>{rec.message}</Typography>}
            {rec.action && (
              <Typography sx={{ ...quiet, mt: 1 }}>
                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>Try this: </Box>
                {rec.action}
              </Typography>
            )}
          </ListRow>
        )) : (
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
            Nothing stands out today. Keep doing what you’re doing.
          </Typography>
        )}
      </LabelPanel>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap, alignItems: 'start' }}>
        <Tips title="What to eat today" items={food} />
        <Tips title="Tonight’s sleep" items={sleep} />
      </Box>

      <Typography sx={{ ...quiet, fontSize: '0.75rem' }}>
        Worked out from last night’s sleep and today’s watch readings. General guidance, not medical advice.
      </Typography>
    </Box>
  );
}
