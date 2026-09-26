/**
 * The library's empty states. "The ledger is blank" and "nothing matches"
 * are different situations and get different sentences. No demo data
 * (Chef's call): the first run is a warm welcome that says where to start.
 */
import React from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { Add as AddIcon, CategoryOutlined as TypesIcon, PlaceOutlined as PlacesIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import TagMark from '../components/TagMark';
import { DISPLAY_FONT } from '../theme/theme';

function Frame({ children, wide }) {
  return (
    <Box
      sx={{
        mx: 'auto',
        mt: { xs: 1, md: 5 },
        maxWidth: wide ? 620 : 460,
        textAlign: 'center',
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, md: 5 },
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        backgroundImage: (t) => `radial-gradient(120% 70% at 50% 0%, ${t.palette.phosphor?.glow ?? 'transparent'}, transparent 70%)`,
      }}
    >
      {children}
    </Box>
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
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: { xs: '1.5rem', md: '1.75rem' }, letterSpacing: '-0.015em', mb: 1.25 }}>
          Start the household ledger
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6, fontSize: '1rem', maxWidth: 460, mx: 'auto' }}>
          Start with the things you'd hate to lose — the boat, the guns, the good tools. A photo and a place is enough to begin.
        </Typography>
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            mb: 3.5,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 1.5,
            textAlign: 'left',
          }}
        >
          {STEPS.map(([title, text], i) => (
            <Box component="li" key={title} sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.raised' }}>
              <Typography component="span" sx={{ display: 'block', fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.08em', color: 'primary.main', mb: 0.5 }}>
                STEP {i + 1}
              </Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', mb: 0.25 }}>{title}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>{text}</Typography>
            </Box>
          ))}
        </Box>
        <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onAdd} sx={{ px: 3 }}>
          Add a thing
        </Button>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 2 }}>
          <Button component={RouterLink} to="/places" startIcon={<PlacesIcon />} sx={{ color: 'text.primary' }}>
            Set up places first
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
      <TagMark size={44} sx={{ mx: 'auto', mb: 2 }} />
      <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
        Nothing matches
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
