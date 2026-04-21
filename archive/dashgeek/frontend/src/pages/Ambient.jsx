import React from 'react';
import { Box } from '@mui/material';
import Clock from '../components/ambient/Clock';
import Weather from '../components/ambient/Weather';
import NowPlaying from '../components/ambient/NowPlaying';
import Agenda from '../components/ambient/Agenda';
import Gmail from '../components/ambient/Gmail';

// Matches Brand header minHeight (52 xs / 56 md).
const BRAND_HEADER_H = 56;

/**
 * Ambient (`/`) — Screen 1 of the Desk shell.
 *
 * Two-column split:
 *   ┌─────────────────────────────┬─────────────┐
 *   │                             │  SPOTIFY    │
 *   │         CLOCK               │  WEATHER    │
 *   │       (64% wide)            │  AGENDA     │
 *   │                             │  INBOX      │
 *   └─────────────────────────────┴─────────────┘
 *
 * Fits 1280×800 landscape without page scroll. Below `md` the
 * layout collapses into a single stacked column — clock first,
 * then the rail.
 */
export default function Ambient() {
  return (
    <Box
      component="section"
      aria-label="Ambient"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 3, md: 4 },
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 3 },
        backgroundColor: 'background.default',
        minHeight: `calc(100vh - ${BRAND_HEADER_H}px)`,
        height: { md: `calc(100vh - ${BRAND_HEADER_H}px)` },
        overflow: { md: 'hidden' },
      }}
    >
      {/* Left ~64%: Hero clock */}
      <Box
        sx={{
          flex: { xs: 'none', md: '0 0 64%' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          minWidth: 0,
        }}
      >
        <Clock />
      </Box>

      {/* Right ~36%: stacked ambient cards — each sized to its content.
          Align to the top; leftover vertical space is the dark ambient.
          If content exceeds the viewport the rail scrolls subtly. */}
      <Box
        sx={{
          flex: { xs: 'none', md: '1 1 36%' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 2,
          minWidth: 0,
          minHeight: 0,
          overflowY: { md: 'auto' },
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 3,
          },
        }}
      >
        <NowPlaying />
        <Weather />
        <Agenda />
        <Gmail />
      </Box>
    </Box>
  );
}
