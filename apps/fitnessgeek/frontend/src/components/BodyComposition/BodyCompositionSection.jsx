import React, { lazy, Suspense, useId, useState } from 'react';
import { Box, Button, Collapse, Skeleton, Typography } from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { LabelPanel, Rule } from '../primitives';
import BodyCompSummaryCard, { BodyCompMore } from './BodyCompSummaryCard.jsx';
import BodyCompChangeCard from './BodyCompChangeCard.jsx';

// The fat/lean chart is the only part of this section that needs Nivo; the
// rows above it paint first and the boundary reserves the chart's height.
const BodyCompTrend = lazy(() => import('./BodyCompTrend.jsx'));

/**
 * The body-composition half of "Weight & body" (FITNESSGEEK_BODY_DATA_PLAN D6).
 *
 * One card, and at rest one tidy summary in plain words: body fat, muscle,
 * calories burned at rest. The fat and lean split, the change between two
 * weeks and the trend chart are behind "More from your scans" (round-two
 * review: the open card was a lab report). The chart is not even fetched
 * until it is asked for. `defaultOpen` is for the link from Import a scan,
 * which promises the whole picture.
 *
 * With no scans it is one quiet line (most people have no body-composition
 * scale), and while loading it is nothing.
 *
 * It owns its own loading, error and empty states so that nothing here can
 * take the weight half of the page down with it: `useBodyComp` is a separate
 * hook from `useWeight`, and a failed body-comp query ends in an error state
 * inside this section, not a blank page.
 */
const BodyCompositionSection = ({ summary, scans = [], loading, error, scansError, onRetry, defaultOpen = false }) => {
  const [more, setMore] = useState(defaultOpen);
  const moreId = useId();
  // "Add a scan" sits where the scans are (review IA-5); with no scans the
  // section is one line with its own Import link.
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

  // Still loading, with nothing to show yet: draw nothing. Most people have
  // no body-composition scale, and a skeleton card that then vanishes is a
  // promise the page does not keep.
  if (loading && !summary && !error) return null;

  // The read failed: say so in one quiet line, with a way to try again. Not
  // a card with a headline, and not an alert: we cannot tell whether this
  // person has a scan at all, and for most people this section is a
  // footnote. It is still never drawn as "no scans".
  if (error) {
    return (
      <Box
        component="section"
        id="body-composition"
        aria-label="What your weight is made of"
        role="status"
        data-testid="body-comp-unknown"
        sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3, px: 1 }}
      >
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5 }}>
          Couldn&rsquo;t check for body scans just now.
        </Typography>
        {onRetry && (
          <Button variant="text" onClick={onRetry} disabled={loading} sx={{ minHeight: 44, px: 0, fontWeight: 600 }}>
            {loading ? 'Trying…' : 'Try again'}
          </Button>
        )}
      </Box>
    );
  }

  // No scans: one friendly line, not an empty card. Nothing here assumes a
  // particular scale or a folder import; the Import a scan page explains.
  if (!summary?.total_scans) {
    return (
      <Box
        component="section"
        id="body-composition"
        aria-label="What your weight is made of"
        data-testid="body-comp-invite"
        sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3, px: 1 }}
      >
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.5 }}>
          Have a scale that measures body fat?
        </Typography>
        <Button
          component={RouterLink}
          to="/scan-import"
          variant="text"
          sx={{ minHeight: 44, px: 0, fontWeight: 600 }}
        >
          Import a scan
        </Button>
      </Box>
    );
  }

  const body = (
    <>
      <BodyCompSummaryCard summary={summary} />
      <Button
        variant="text"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        aria-controls={moreId}
        data-testid="body-comp-more"
        endIcon={<ExpandIcon sx={{ transition: 'transform .2s', transform: more ? 'rotate(180deg)' : 'none' }} />}
        sx={{ minHeight: 44, px: 0, mt: 1, mb: more ? 0 : -2, fontWeight: 600, justifyContent: 'flex-start', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
      >
        {more ? 'Show less' : 'More from your scans'}
      </Button>
      <Collapse in={more} id={moreId} unmountOnExit>
        <Box sx={{ pt: 1 }}>
          <BodyCompMore summary={summary} />
          <BodyCompChangeCard summary={summary} />
          <Rule weight="medium" sx={{ mt: 2 }} />
          {scansError ? (
            <Box role="status" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3, pt: 2 }}>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                The trend chart couldn&rsquo;t load its scan history.
              </Typography>
              {onRetry && (
                <Button variant="text" onClick={onRetry} disabled={loading} sx={{ minHeight: 44, px: 0, fontWeight: 600 }}>
                  Try again
                </Button>
              )}
            </Box>
          ) : (
            <Suspense fallback={<Skeleton variant="rectangular" height={340} sx={{ mt: 1.5 }} />}>
              <BodyCompTrend scans={scans} />
            </Suspense>
          )}
        </Box>
      </Collapse>
    </>
  );

  return (
    <LabelPanel
      component="section"
      aria-label="What your weight is made of"
      id="body-composition"
      title="What your weight is made of"
      titleComponent="h3"
      action={addScan}
      // Clear of the top bar when a link scrolls here.
      sx={{ scrollMarginTop: '88px' }}
    >
      {body}
    </LabelPanel>
  );
};

export default BodyCompositionSection;
