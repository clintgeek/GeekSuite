/**
 * "What the shelves and stars mean" — Chef's own definitions, collapsed by
 * default. The short forms live next to the controls themselves (the shelf
 * picker, the rating section); this is the one place the FULL quotes live,
 * for whoever wants the whole sentence. Source: DOCS/TASTE_MODEL.md.
 */
import React, { useState } from 'react';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { BUILT_IN_SHELF_ORDER, RATING_MEANINGS, SHELF_MEANINGS } from '../../utils/tasteModel';
import { shelfLabel } from '../../utils/vocab';
import SettingsCard from './SettingsCard';

function DefinitionRow({ term, quote, provisional }) {
  return (
    <Box component="li" sx={{ listStyle: 'none', py: 1, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography component="span" sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 600 }}>
        {term}
        {provisional ? (
          <Typography component="span" sx={{ ml: 0.75, fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            provisional
          </Typography>
        ) : null}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.55, mt: 0.25 }}>
        &ldquo;{quote}&rdquo;
      </Typography>
    </Box>
  );
}

export default function TasteModelCard() {
  const [open, setOpen] = useState(false);

  return (
    <SettingsCard id="taste-model" title="Your shelves & ratings">
      <ButtonBase
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="taste-model-body"
        onClick={() => setOpen((v) => !v)}
        sx={{
          width: '100%', minHeight: 44, px: 1, ml: -1, gap: 1, justifyContent: 'flex-start', borderRadius: '8px',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>
          What the shelves and stars mean
        </Typography>
        <ExpandIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary', transition: 'transform 160ms ease', transform: open ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>
      <Collapse in={open} timeout={160} unmountOnExit>
        <Box id="taste-model-body" sx={{ pt: 1.5 }}>
          <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
            Shelves
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0, mb: 2 }}>
            {BUILT_IN_SHELF_ORDER.map((id) => {
              const meaning = SHELF_MEANINGS[id];
              if (!meaning) return null;
              return <DefinitionRow key={id} term={shelfLabel(id)} quote={meaning.full} provisional={meaning.provisional} />;
            })}
          </Box>
          <Typography component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
            Ratings
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {[5, 4, 3, 2, 1].map((star) => (
              <DefinitionRow key={star} term={`${star} ${star === 1 ? 'star' : 'stars'}`} quote={RATING_MEANINGS[star].full} />
            ))}
          </Box>
        </Box>
      </Collapse>
    </SettingsCard>
  );
}
