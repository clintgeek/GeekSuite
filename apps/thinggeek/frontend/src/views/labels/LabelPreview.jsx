/**
 * `/labels?ids=<id>,<id>,...` — fetch each thing, offer a size, preview, and
 * print. Missing or deleted ids get a friendly note (see fetchLabelThings),
 * never a crash.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { PrintOutlined as PrintIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useApolloClient } from '@apollo/client';
import LabelSticker, { LABEL_SIZES, LABEL_SIZE_ORDER } from './LabelSticker';
import { DISPLAY_FONT, dustImage } from '../../theme/theme';
import LabelPrintPortal from './LabelPrintPortal';
import { fetchLabelThings } from '../../utils/labelData';

export default function LabelPreview({ ids }) {
  const client = useApolloClient();
  const [size, setSize] = useState('small');
  const [state, setState] = useState({ loading: true, found: [], missingIds: [] });
  const idsKey = ids.join(',');

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, found: [], missingIds: [] });
    fetchLabelThings(client, ids).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
    // idsKey is ids' identity for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, idsKey]);

  const spec = LABEL_SIZES[size] ?? LABEL_SIZES.small;
  const ready = !state.loading;
  const hasAny = state.found.length > 0;
  const missingNote = useMemo(() => {
    if (!state.missingIds.length) return null;
    const n = state.missingIds.length;
    return `${n} thing${n === 1 ? "" : 's'} couldn't be found — ${n === 1 ? 'it' : 'they'} may have been deleted or moved to another household.`;
  }, [state.missingIds]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.625rem', color: 'text.primary' }}>Print labels</Typography>
        <Button component={RouterLink} to="/labels" sx={{ color: 'text.primary', minHeight: 44 }}>
          Choose different things
        </Button>
      </Box>

      <ToggleButtonGroup
        value={size}
        exclusive
        onChange={(_, next) => next && setSize(next)}
        aria-label="Label size"
        sx={{ mb: 2 }}
      >
        {LABEL_SIZE_ORDER.map((key) => (
          <ToggleButton key={key} value={key} sx={{ minHeight: 44, textTransform: 'none', color: 'text.primary' }}>
            {LABEL_SIZES[key].label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {missingNote ? (
        <Typography data-testid="labels-missing-note" sx={{ color: 'text.secondary', mb: 2 }}>
          {missingNote}
        </Typography>
      ) : null}

      {state.loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress size={24} aria-label="Loading" />
        </Box>
      ) : hasAny ? (
        <>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="hero"
              disableElevation
              startIcon={<PrintIcon />}
              onClick={() => window.print()}
              sx={{ minHeight: 44, fontWeight: 800, border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText' }}
            >
              Print
            </Button>
          </Box>
          <Box
            data-testid="labels-preview-sheet"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              p: 2,
              // The labels, stuck on the side of a box.
              bgcolor: 'box.face',
              backgroundImage: (t) => dustImage(t.palette.mode),
              border: 1,
              borderColor: 'border',
              borderRadius: '3px',
            }}
          >
            {state.found.map((thing) => (
              <LabelSticker key={thing.id} thing={thing} size={size} preview />
            ))}
          </Box>
        </>
      ) : (
        <Typography sx={{ color: 'text.secondary' }}>Nothing to print — every id in the link was missing.</Typography>
      )}

      {ready && hasAny ? <LabelPrintPortal things={state.found} size={spec.key} /> : null}
    </Box>
  );
}
