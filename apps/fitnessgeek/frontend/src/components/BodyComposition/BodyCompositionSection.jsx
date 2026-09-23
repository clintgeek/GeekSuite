import React, { lazy } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Accessibility as BodyIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, SectionLabel, DisplayHeading, EmptyState, SurfaceSkeleton, SuspenseSurface } from '../primitives';
import BodyCompSummaryCard from './BodyCompSummaryCard.jsx';
import BodyCompChangeCard from './BodyCompChangeCard.jsx';

// The fat/lean chart is the only part of this section that needs Nivo; the
// cards above it paint first and the boundary reserves the chart's height.
const BodyCompTrend = lazy(() => import('./BodyCompTrend.jsx'));

/**
 * The body-composition half of "Weight & body" (FITNESSGEEK_BODY_DATA_PLAN D6).
 *
 * It owns its own loading, error and empty states so that nothing here can
 * take the weight half of the page down with it: `useBodyComp` is a separate
 * hook from `useWeight`, and a failed body-comp query ends in an error card
 * inside this section, not a blank page.
 */
const BodyCompositionSection = ({ summary, scans = [], loading, error, scansError, onRetry }) => {
  const header = (
    <Box sx={{ mb: 2 }}>
      <SectionLabel sx={{ mb: 0.75 }}>Body composition</SectionLabel>
      <DisplayHeading size="card">What it&rsquo;s made of</DisplayHeading>
    </Box>
  );

  let body;
  if (loading && !summary) {
    body = (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <SurfaceSkeleton rows={3} />
        <SurfaceSkeleton rows={2} />
      </Box>
    );
  } else if (error) {
    body = (
      <Surface role="alert">
        <Typography sx={{ color: 'text.primary', fontWeight: 600, mb: 0.5 }}>
          Body composition didn&rsquo;t load.
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 1.5 }}>
          Your weight above is unaffected. Try again in a moment.
        </Typography>
        {onRetry && (
          <Button variant="outlined" onClick={onRetry} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        )}
      </Surface>
    );
  } else if (!summary?.total_scans) {
    body = (
      <EmptyState
        icon={BodyIcon}
        title="No scans yet"
        copy="Scans arrive on their own when your scale's export lands in the Nextcloud folder, or you can import one yourself."
        action={
          <Button component={RouterLink} to="/scan-import" variant="contained" sx={{ minHeight: 44 }}>
            Import a scan
          </Button>
        }
      />
    );
  } else {
    body = (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <BodyCompSummaryCard summary={summary} />
        <BodyCompChangeCard summary={summary} />
        {scansError ? (
          <Surface>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              The trend chart couldn&rsquo;t load its scan history.
            </Typography>
          </Surface>
        ) : (
          <SuspenseSurface rows={4} height={340}>
            <BodyCompTrend scans={scans} />
          </SuspenseSurface>
        )}
      </Box>
    );
  }

  return (
    <Box component="section" aria-label="Body composition" id="body-composition">
      {header}
      {body}
    </Box>
  );
};

export default BodyCompositionSection;
