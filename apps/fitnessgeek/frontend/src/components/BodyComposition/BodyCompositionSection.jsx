import React, { lazy, Suspense } from 'react';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { LabelPanel, Rule } from '../primitives';
import BodyCompSummaryCard from './BodyCompSummaryCard.jsx';
import BodyCompChangeCard from './BodyCompChangeCard.jsx';

// The fat/lean chart is the only part of this section that needs Nivo; the
// rows above it paint first and the boundary reserves the chart's height.
const BodyCompTrend = lazy(() => import('./BodyCompTrend.jsx'));

/**
 * The body-composition half of "Weight & body" (FITNESSGEEK_BODY_DATA_PLAN D6).
 *
 * One card: the figures as rows (two columns on a phone),
 * hairlines between the summary, the change and the trend — no boxes inside
 * the panel.
 *
 * It owns its own loading, error and empty states so that nothing here can
 * take the weight half of the page down with it: `useBodyComp` is a separate
 * hook from `useWeight`, and a failed body-comp query ends in an error state
 * inside this section, not a blank page.
 */
const BodyCompositionSection = ({ summary, scans = [], loading, error, scansError, onRetry }) => {
  // "Add a scan" sits where the scans are (review IA-5); the empty state has
  // its own Import button, so the header only offers it once there are some.
  const addScan = summary?.total_scans > 0 && !error ? (
    <Button
      component={RouterLink}
      to="/scan-import"
      variant="text"
      data-testid="add-a-scan"
      sx={{ minHeight: 44, px: 0, fontWeight: 700, color: 'primary.main' }}
    >
      Add a scan
    </Button>
  ) : null;

  let body;
  if (loading && !summary) {
    body = (
      <Box sx={{ pt: 1.5 }} aria-busy="true">
        <Skeleton variant="rectangular" height={64} sx={{ mb: 1.5 }} />
        <Skeleton variant="rectangular" height={120} />
      </Box>
    );
  } else if (error) {
    body = (
      <Box role="alert" sx={{ pt: 1.5 }}>
        <Typography sx={{ color: 'text.primary', fontWeight: 700, mb: 0.5 }}>
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
      </Box>
    );
  } else if (!summary?.total_scans) {
    body = (
      <Box sx={{ pt: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2 }}>No scans yet</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, mb: 1.5 }}>
          Scans arrive on their own when your scale&rsquo;s export lands in the Nextcloud folder, or you can import one yourself.
        </Typography>
        <Button component={RouterLink} to="/scan-import" variant="outlined" sx={{ minHeight: 44 }}>
          Import a scan
        </Button>
      </Box>
    );
  } else {
    body = (
      <>
        <BodyCompSummaryCard summary={summary} />
        <BodyCompChangeCard summary={summary} />
        <Rule weight="medium" sx={{ mt: 2 }} />
        {scansError ? (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', pt: 1.5 }}>
            The trend chart couldn&rsquo;t load its scan history.
          </Typography>
        ) : (
          <Suspense fallback={<Skeleton variant="rectangular" height={340} sx={{ mt: 1.5 }} />}>
            <BodyCompTrend scans={scans} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <LabelPanel
      component="section"
      aria-label="What your weight is made of"
      id="body-composition"
      title="What your weight is made of"
      titleComponent="h3"
      action={addScan}
    >
      {body}
    </LabelPanel>
  );
};

export default BodyCompositionSection;
