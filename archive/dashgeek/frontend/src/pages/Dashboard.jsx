import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchHero from '../components/SearchHero';
import BujoWidget from '../components/widgets/BujoWidget';
import NutritionWidget from '../components/widgets/NutritionWidget';
import FlockWidget from '../components/widgets/FlockWidget';

/**
 * Suite (`/suite`) — Screen 2 of the Desk shell.
 *
 * Hero search bar up top (cross-suite GraphQL search) + three
 * domain LedgerCards below (Bujo / Fitness / Flock). Designed to
 * fit 1280×800 landscape with no scroll; scales up cleanly.
 *
 * NOTE: component filename stays Dashboard.jsx for now to keep
 * the existing import wiring in App.jsx untouched. Route is /suite.
 */
export default function Suite() {
  const theme = useTheme();

  return (
    <Box
      component="section"
      aria-label="Suite"
      sx={{
        // Fill viewport below sticky Brand header (~56px) with no scroll
        minHeight: 'calc(100vh - 56px)',
        backgroundColor: 'background.default',
      }}
    >
      <Box
        component="main"
        sx={{
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 2, md: 2.5 },
          pb: { xs: 3, md: 3 },
          maxWidth: 1400,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 2, md: 2.5 },
          // Height-locked: hero + grid must both fit the viewport
          height: 'calc(100vh - 56px)',
        }}
      >
        {/* Hero search */}
        <SearchHero compact />

        {/* Three-card grid — flexes to fill remaining vertical space */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            '& > *': {
              minWidth: 0,
              minHeight: 0,
            },
            '& > * > *:first-of-type': {
              height: '100%',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <BujoWidget />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <NutritionWidget />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <FlockWidget />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
