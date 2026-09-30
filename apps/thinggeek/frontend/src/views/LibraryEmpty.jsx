/**
 * The library's empty states — the first screen a new household sees, so
 * the Label Maker is at its loudest here: a card taped to the carton, the
 * steps punched out as tape, and the one action on an orange strip.
 *
 * The library's empty states. "The ledger is blank" and "nothing matches"
 * are different situations and get different sentences. No demo data
 * (Chef's call): the first run is a warm welcome that says where to start.
 */
import React from 'react';
import { Box, Button, ButtonBase, Link, Typography } from '@mui/material';
import { Add as AddIcon, CategoryOutlined as TypesIcon, PlaceOutlined as PlacesIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import DymoTape from '../components/DymoTape';
import PackingTape from '../components/PackingTape';
import TagMark from '../components/TagMark';
import { DISPLAY_FONT } from '../theme/theme';

function Frame({ children, wide }) {
  return (
    <Box
      sx={{
        position: 'relative',
        mx: 'auto',
        mt: { xs: 2.5, md: 6 },
        maxWidth: wide ? 620 : 460,
        textAlign: 'center',
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, md: 5 },
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 2px 8px rgba(60, 40, 15, 0.14)',
      }}
    >
      {/* A sheet of card stock, taped to the carton. */}
      <PackingTape width={132} />
      {children}
    </Box>
  );
}

/**
 * The screen's one primary action, struck on orange tape: a real button
 * (48px tall, a visible focus ring), wearing a strip of safety-orange refill
 * with dark letters — orange is a fill, never an ink.
 */
export function TapeButton({ children, onClick, testId }) {
  return (
    <ButtonBase
      onClick={onClick}
      data-testid={testId}
      sx={{
        minHeight: 48,
        px: 0.5,
        borderRadius: '8px',
        '& [data-testid="dymo-tape"]': { transition: 'transform 120ms ease-out' },
        '@media (hover: hover)': { '&:hover [data-testid="dymo-tape"]': { transform: 'rotate(-1deg) translateY(-1px)' } },
        '&:active [data-testid="dymo-tape"]': { transform: 'translateY(1px)' },
        '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'text.primary', outlineOffset: 2 },
      }}
    >
      <DymoTape size="xl" tone="orange" tilt={false}>
        {children}
      </DymoTape>
    </ButtonBase>
  );
}

const STEPS = [
  ['Take a photo', 'The overview, then the ID plate — that plate is where the serial lives.'],
  ['Pick a type', 'Boat, vehicle, firearm, tool… each asks only for what matters to it.'],
  ['Say where it lives', 'Garage › Shelf 2. Details can wait for a rainy day.'],
];

export default function LibraryEmpty({ firstRun, onAdd, onClear }) {
  if (firstRun) {
    return (
      <Frame wide>
        <TagMark size={64} sx={{ mx: 'auto', mb: 2.5 }} />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: { xs: '1.75rem', md: '2rem' }, mb: 1.25 }}>
          Start the household inventory
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6, fontSize: '1rem', maxWidth: 460, mx: 'auto' }}>
          Start with the things you'd hate to lose — the boat, the guns, the good tools. A photo and where it is is enough to begin.
        </Typography>
        {/* The steps, punched out as strips of tape: a label maker's to-do list. */}
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            mb: 3.5,
            display: 'grid',
            gap: 2,
            textAlign: 'left',
            maxWidth: 440,
            mx: 'auto',
          }}
        >
          {STEPS.map(([title, text], i) => (
            <Box component="li" key={title} data-testid="empty-step" sx={{ display: 'grid', gap: 0.75, justifyItems: 'start' }}>
              <Typography component="h3" sx={{ m: 0, lineHeight: 1 }}>
                <DymoTape size="lg">{`${i + 1} ${title}`}</DymoTape>
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.5, pl: 0.5 }}>{text}</Typography>
            </Box>
          ))}
        </Box>
        <TapeButton onClick={onAdd} testId="empty-add">
          Add a thing
        </TapeButton>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 2 }}>
          <Button component={RouterLink} to="/where" startIcon={<PlacesIcon />} sx={{ color: 'text.primary' }}>
            Set up where things go
          </Button>
          <Button component={RouterLink} to="/types" startIcon={<TypesIcon />} sx={{ color: 'text.primary' }}>
            See the types
          </Button>
        </Box>
        <Typography sx={{ mt: 2.5, fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.6 }}>
          Serial numbers are masked on screen and never sent to AI.{' '}
          <Link component={RouterLink} to="/settings#privacy" sx={{ fontWeight: 600 }}>
            How ThingGeek keeps them
          </Link>
        </Typography>
      </Frame>
    );
  }

  return (
    <Frame>
      <Typography component="h2" sx={{ mb: 1.5, lineHeight: 1 }}>
        <DymoTape size="lg">Nothing matches</DymoTape>
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>Try a shorter search, or loosen the filters.</Typography>
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={onClear} sx={{ color: 'text.primary' }}>
          Show everything
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
          Add a thing
        </Button>
      </Box>
    </Frame>
  );
}
