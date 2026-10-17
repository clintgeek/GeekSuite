import React, { lazy } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Accessibility as BodyIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, DisplayHeading, EmptyState, SurfaceSkeleton, SuspenseSurface } from '../primitives';
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
  // "Add a scan" sits where the scans are (review IA-5); the empty state has
  // its own Import button, so the header only offers it once there are some.
  const header = (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box>
        <DisplayHeading size="card">What your weight is made of</DisplayHeading>
      </Box>
      {summary?.total_scans > 0 && !error && (
        <Button
          component={RouterLink}
          to="/scan-import"
          variant="text"
          data-testid="add-a-scan"
          sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none' }}
        >
          Add a scan
        </Button>
      )}
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
          Your scans didn&rsquo;t load.
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
        copy="Scans arrive on their own when your scale&rsquo;s export lands in the Nextcloud folder, or you can import one yourself."
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
    <Box component="section" aria-label="What your weight is made of" id="body-composition">
      {header}
      {body}
    </Box>
  );
};

export default BodyCompositionSection;
