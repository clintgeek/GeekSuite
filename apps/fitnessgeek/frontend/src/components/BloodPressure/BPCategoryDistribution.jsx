import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { categorizeBP, BP_STAGES } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { trackColor } from '../../theme/theme.jsx';
import { LabelPanel } from '../primitives';

const ORDER = Object.values(BP_STAGES);

/**
 * Readings by range, for the window the page's range toggle chose (review
 * D-1): the toggle sits above this card and the title names the window, so
 * it never shows an unstated span.
 *
 * LABELLED BARS, NOT A DONUT (round-two review). The donut filled a phone
 * screen with three coloured arcs and a bare count on each; its legend was
 * below the fold, so the colours had no key in view. Each range is now a row
 * that says its own name and count, with a bar for the share: the words carry
 * it and the colour only agrees. It also takes @nivo/pie off this page.
 *
 * Only the ranges that have readings are listed, mildest first.
 *
 * `windowLabel`: "last 30 days", "all time", …
 */
const BPCategoryDistribution = ({ bpLogs = [], windowLabel = '' }) => {
  const theme = useTheme();
  const rows = useMemo(() => {
    const counts = new Map();
    for (const log of bpLogs || []) {
      if (!log) continue;
      const category = categorizeBP(log.systolic, log.diastolic, theme.palette.mode);
      const seen = counts.get(category.stage) || { count: 0, color: category.color };
      seen.count += 1;
      counts.set(category.stage, seen);
    }
    const order = (stage) => (ORDER.indexOf(stage) === -1 ? ORDER.length : ORDER.indexOf(stage));
    return [...counts.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([stage, { count, color }]) => ({ id: stage, label: bpStageWords(stage).label, value: count, color }));
  }, [bpLogs, theme.palette.mode]);

  const title = `Readings by range${windowLabel ? `, ${windowLabel}` : ''}`;
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (rows.length === 0) {
    return (
      <LabelPanel title={title} titleComponent="h3">
        <Typography variant="body2" sx={{ color: 'text.secondary', pt: 1.5 }}>
          No readings{windowLabel ? ` in the ${windowLabel}` : ''}
        </Typography>
      </LabelPanel>
    );
  }

  return (
    <LabelPanel title={<span data-testid="bp-donut-title">{title}</span>} titleComponent="h3">
      <Box component="ul" data-testid="bp-donut-legend" sx={{ listStyle: 'none', m: 0, p: 0, pt: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row) => (
          <Box component="li" key={row.id} data-testid="bp-range-row">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: row.color }} />
                <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{row.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: '1rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{row.value}</Box>
                <Box component="span" sx={{ color: 'text.secondary' }}> {row.value === 1 ? 'reading' : 'readings'}</Box>
              </Typography>
            </Box>
            <Box aria-hidden sx={{ mt: 2, height: 8, borderRadius: 999, overflow: 'hidden', bgcolor: (t) => trackColor(t) }}>
              <Box sx={{ height: '100%', borderRadius: 999, width: `${Math.max(2, (row.value / total) * 100)}%`, bgcolor: row.color }} />
            </Box>
          </Box>
        ))}
      </Box>
    </LabelPanel>
  );
};

export default BPCategoryDistribution;
