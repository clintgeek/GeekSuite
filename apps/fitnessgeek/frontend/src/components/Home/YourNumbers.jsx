import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { MetricTile } from '../primitives';
import { newestReading } from '../../utils/checkIns.js';
import { rowDay } from '../../utils/experience.js';
import { categorizeBP } from '../../utils/bpUtils.js';

// Steps are drawn against the number Home always compared with. It is not a
// goal anyone set; the tile says "of 8,000 today", not "goal".
const STEP_MARK = 8000;
const BP_TONE = { success: 'success', warning: 'warning', tomato: 'warning', error: 'error' };

const byWhen = (row) => String(row?.measured_at ?? row?.log_date ?? row?.date ?? '');
const oldestFirst = (rows) => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => byWhen(a).localeCompare(byWhen(b)));

/**
 * "Your numbers" (DOCS/ONE_APP_PLAN.md §1.7): the latest weight, blood
 * pressure, steps and streak, each a tile and (but for the streak) a link to
 * its page. They are the newest readings, whichever day is on screen.
 *
 * Sparklines come from the same newest-few rows the check-ins already read;
 * fewer than three points draws none. Blood pressure says its status in
 * words, never by colour alone.
 */
export default function YourNumbers({ stats, checkIns, today, titleSx }) {
  const theme = useTheme();
  const weightSpark = oldestFirst(checkIns?.weights).map((r) => Number(r?.weight_value)).filter((n) => Number.isFinite(n) && n > 0);
  const bpSpark = oldestFirst(checkIns?.bloodPressures).map((r) => Number(r?.systolic)).filter((n) => Number.isFinite(n) && n > 0);
  const bp = stats.bloodPressure;
  const bpNewest = newestReading(checkIns?.bloodPressures);
  const bpDay = bpNewest ? rowDay(bpNewest) : null;
  const bpWhen = !bpDay ? null : bpDay === today ? 'Today' : (() => {
    const [y, m, d] = bpDay.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();
  const bpCategory = bp.systolic ? categorizeBP(bp.systolic, bp.diastolic, theme.palette.mode) : null;
  const bpStatus = !bp.systolic ? null
    : bp.trendValue === 'Low' ? { label: 'Low', tone: 'warning' }
      : BP_TONE[bpCategory?.tone] ? { label: bpCategory.stage, tone: BP_TONE[bpCategory.tone] } : null;
  const steps = stats.steps.value;

  return (
    <Box component="section" aria-labelledby="your-numbers" data-testid="your-numbers">
      <Typography id="your-numbers" component="h2" sx={titleSx}>Your numbers</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
        <MetricTile
          label="Weight"
          value={stats.weight.value ?? '—'}
          unit={stats.weight.unit}
          caption={stats.weight.caption}
          spark={weightSpark}
          to="/weight"
        />
        <MetricTile
          label="Blood pressure"
          value={bp.systolic ? `${bp.systolic}/${bp.diastolic}` : '—'}
          unit="mmHg"
          status={bpStatus}
          caption={bp.systolic ? [bpWhen, 'systolic / diastolic'].filter(Boolean).join(' · ') : 'No readings yet'}
          spark={bpSpark}
          to="/blood-pressure"
        />
        <MetricTile
          label="Steps"
          value={steps != null ? steps.toLocaleString('en-US') : '—'}
          caption={steps != null ? `of ${STEP_MARK.toLocaleString('en-US')} today` : 'No step count yet today'}
          progress={steps != null ? Math.min(100, (steps / STEP_MARK) * 100) : undefined}
          progressLabel={steps != null ? `${steps.toLocaleString('en-US')} of ${STEP_MARK.toLocaleString('en-US')} steps` : undefined}
          to="/trends?tab=activity"
        />
        <MetricTile
          label="Days in a row"
          value={stats.streak.value}
          unit={stats.streak.value === 1 ? 'day' : 'days'}
        />
      </Box>
    </Box>
  );
}
