/**
 * Feed health: ok | stale | failing | broken | never. Never colour alone —
 * every state has its own glyph and its own word, in a measured tone ink
 * (theme GAZETTE.*.tone, asserted in gazetteContrast.test.js).
 */
import React from 'react';
import { Box } from '@mui/material';
import {
  CheckCircleOutline as OkIcon,
  HourglassBottom as StaleIcon,
  WarningAmberOutlined as FailingIcon,
  LinkOff as BrokenIcon,
  RadioButtonUnchecked as NeverIcon,
} from '@mui/icons-material';
import { GOTHIC } from '../theme/theme';
import { HEALTH } from '../utils/health';

const GLYPHS = { ok: OkIcon, stale: StaleIcon, failing: FailingIcon, broken: BrokenIcon, never: NeverIcon };

export default function HealthIndicator({ health, sx }) {
  const state = HEALTH[health] ? health : 'never';
  const { label, hint } = HEALTH[state];
  const Glyph = GLYPHS[state];
  return (
    <Box
      component="span"
      data-health={state}
      title={hint}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontFamily: GOTHIC,
        fontSize: '0.8125rem',
        fontWeight: 700,
        lineHeight: 1.3,
        color: (t) => t.palette.gazette.tone[state],
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      <Glyph aria-hidden="true" sx={{ fontSize: 16 }} />
      <span>{label}</span>
    </Box>
  );
}
