/**
 * The library's empty states — the first screen a new household sees, so
 * Moving Day is at its loudest here: the loading dock before the first box
 * goes on the truck.
 *
 *   first run   a black truck-side header with speed stripes and the lettering
 *               "Moving day starts here", a stack of empty boxes on a pallet,
 *               the three steps as numbered boxes, and the one action: the
 *               big orange "Load your first thing". When the household has
 *               already set up its rooms (Chef's real shape: 5 rooms, 0
 *               things), each room is a moving label that opens Pack a room
 *               straight into it.
 *   no match    "Nothing matches" — a different situation, a different sentence.
 *
 * No demo data (Chef's call): the first run says where to start.
 */
import React from 'react';
import { Box, Button, ButtonBase, Link, Typography } from '@mui/material';
import { CategoryOutlined as TypesIcon, LocalShippingOutlined as LoadIcon, WarehouseOutlined as PlacesIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import MovingBox from '../components/MovingBox';
import MovingLabel from '../components/MovingLabel';
import { CHROME, DISPLAY_FONT, LIVERY, STENCIL_FONT, dustImage, speedStripes } from '../theme/theme';

function Sheet({ children, wide, sx }) {
  return (
    <Box
      sx={{
        position: 'relative',
        mx: 'auto',
        mt: { xs: 1, md: 4 },
        maxWidth: wide ? 680 : 460,
        borderRadius: '4px',
        overflow: 'hidden',
        border: 1,
        borderColor: 'border',
        bgcolor: 'background.card',
        backgroundImage: (t) => dustImage(t.palette.mode),
        boxShadow: (t) => (t.palette.mode === 'dark' ? '0 3px 0 rgba(0,0,0,0.6)' : '0 3px 0 rgba(60,38,14,0.25)'),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The screen's one primary action: a big orange button, black lettering, a
 * black edge and a burnt-orange shadow under it — the Load button.
 */
export function LoadButton({ children, onClick, testId, startIcon = <LoadIcon />, sx }) {
  return (
    <Button
      variant="contained"
      color="load"
      disableElevation
      onClick={onClick}
      data-testid={testId}
      startIcon={startIcon}
      sx={{
        minHeight: 52,
        px: 3,
        fontSize: '1.0625rem',
        fontWeight: 800,
        border: 2,
        borderStyle: 'solid',
        borderColor: 'load.contrastText',
        boxShadow: `0 4px 0 ${LIVERY.burnt}`,
        '&:active': { transform: 'translateY(2px)', boxShadow: `0 2px 0 ${LIVERY.burnt}` },
        '& .MuiButton-startIcon svg': { fontSize: 26 },
        ...sx,
      }}
    >
      {children}
    </Button>
  );
}

const STEPS = [
  ['Take a photo', 'The overview, then the ID plate — that plate is where the serial lives.'],
  ['Pick a type', 'Boat, vehicle, firearm, tool… each asks only for what matters to it.'],
  ['Say where it lives', 'Garage › Shelf 2. Details can wait for a rainy day.'],
];

/** A numbered box: the step's number stencilled on a small box face. */
function StepBox({ n }) {
  return (
    <Box
      aria-hidden="true"
      data-caption={String(n)}
      sx={{
        position: 'relative',
        width: 44,
        height: 40,
        flexShrink: 0,
        bgcolor: 'box.face',
        border: '1.5px solid',
        borderColor: 'text.primary',
        borderRadius: '2px',
        display: 'grid',
        placeItems: 'center',
        // the band, and the number on it
        backgroundImage: `linear-gradient(180deg, transparent 0 52%, ${LIVERY.orange} 52% 82%, transparent 82%)`,
        color: LIVERY.ink,
        '&::before': { content: 'attr(data-caption)', fontFamily: STENCIL_FONT, fontSize: '1.125rem', lineHeight: 1, mt: '10px' },
        '&::after': { content: '""', position: 'absolute', top: 6, left: '50%', width: 14, height: 4, ml: '-7px', borderRadius: 2, bgcolor: 'box.hole' },
      }}
    />
  );
}

function DockHeader({ title, lede }) {
  return (
    <Box sx={{ position: 'relative', bgcolor: CHROME.bar, color: CHROME.text, px: { xs: 2.5, sm: 4 }, pt: { xs: 2.5, md: 3 }, pb: { xs: 2.5, md: 3 }, overflow: 'hidden' }}>
      {/* the speed stripes, off the trailing corner */}
      <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: { xs: '34%', sm: '40%' }, backgroundImage: speedStripes(), clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0 100%)', opacity: 0.95 }} />
      <Box sx={{ position: 'relative', maxWidth: { xs: '78%', sm: '66%' } }}>
        <Box component="span" aria-hidden="true" data-caption="THE LOADING DOCK" sx={{ display: 'block', mb: 0.75, color: LIVERY.orange, fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', '&::before': { content: 'attr(data-caption)' } }} />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '2rem', md: '2.5rem' }, lineHeight: 1.02, color: CHROME.text, textShadow: '0 2px 0 rgba(0,0,0,0.5)' }}>
          {title}
        </Typography>
        {lede ? <Typography sx={{ mt: 1, color: CHROME.secondary, fontSize: '0.9375rem', lineHeight: 1.5 }}>{lede}</Typography> : null}
      </Box>
    </Box>
  );
}

/** Chef's shape: rooms set up, nothing in them yet — each room opens Pack a room right there. */
function RoomsToPack({ rooms }) {
  return (
    <Box component="section" aria-labelledby="empty-rooms-heading" sx={{ mt: 3 }}>
      <Typography id="empty-rooms-heading" component="h3" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.125rem', mb: 0.5 }}>
        Your rooms are ready
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.25 }}>Pick one and pack it: snap, name, next — ten things in two minutes.</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {rooms.map((r) => (
          <Box component="li" key={r.id}>
            <ButtonBase
              component={RouterLink}
              to={`/walk?at=${encodeURIComponent(r.id)}`}
              aria-label={`Pack ${r.name}`}
              data-testid="empty-room"
              sx={{
                minHeight: 48,
                px: 0.25,
                borderRadius: '3px',
                '& [data-testid="moving-label"]': { transition: 'transform 120ms ease-out' },
                '@media (hover: hover)': { '&:hover [data-testid="moving-label"]': { transform: 'translateY(-2px) rotate(-1deg)' } },
                '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'text.primary', outlineOffset: 2 },
              }}
            >
              <MovingLabel kind={r.kind} size="md" tilt>
                {r.name}
              </MovingLabel>
            </ButtonBase>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function LibraryEmpty({ firstRun, onAdd, onClear, rooms = [] }) {
  if (firstRun) {
    const hasRooms = rooms.length > 0;
    return (
      <Sheet wide>
        <DockHeader
          title="Moving day starts here"
          lede={hasRooms ? `${rooms.length} room${rooms.length === 1 ? ' is' : 's are'} set up and empty. Time to load the truck.` : 'Everything you own, packed, labelled and insured — ready for a move, a claim or a bad day.'}
        />
        <Box sx={{ px: { xs: 2.5, sm: 4 }, pt: 3, pb: { xs: 3, md: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0, mb: 2.5 }}>
            {/* a short stack of empty boxes on the dock */}
            <MovingBox size="LARGE" width={132} sx={{ mr: -3, zIndex: 1 }} testId="empty-box" />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* stacked: the small open box sits on the medium one's lid */}
              <MovingBox size="SMALL" open width={84} testId="empty-box" sx={{ mb: '-30px', ml: '-8px', zIndex: 0 }} />
              <MovingBox size="MEDIUM" care="FRAGILE" width={116} testId="empty-box" />
            </Box>
          </Box>
          <Typography sx={{ color: 'text.secondary', mb: 2.5, lineHeight: 1.6, fontSize: '1rem', textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
            Start with the things you'd hate to lose — the boat, the guns, the good tools. A photo and where it is is enough to begin.
          </Typography>
          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, mb: 3, display: 'grid', gap: 1.5, maxWidth: 480, mx: 'auto' }}>
            {STEPS.map(([title, text], i) => (
              <Box component="li" key={title} data-testid="empty-step" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <StepBox n={i + 1} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h3" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.25 }}>
                    {title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.5 }}>{text}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <LoadButton onClick={onAdd} testId="empty-add">
              Load your first thing
            </LoadButton>
          </Box>
          {hasRooms ? <RoomsToPack rooms={rooms} /> : null}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 2.5 }}>
            <Button component={RouterLink} to="/where" startIcon={<PlacesIcon />} sx={{ color: 'text.primary' }}>
              {hasRooms ? 'Walk the storage yard' : 'Set up where things go'}
            </Button>
            <Button component={RouterLink} to="/types" startIcon={<TypesIcon />} sx={{ color: 'text.primary' }}>
              See the types
            </Button>
          </Box>
          <Typography sx={{ mt: 2.5, fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.6, textAlign: 'center' }}>
            Serial numbers are masked on screen and never sent to AI.{' '}
            <Link component={RouterLink} to="/settings#privacy" sx={{ fontWeight: 700, color: 'text.primary' }}>
              How ThingGeek keeps them
            </Link>
          </Typography>
        </Box>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ textAlign: 'center' }}>
      <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 4, md: 5 } }}>
        <MovingBox open width={110} sx={{ mb: 1.5 }} testId="empty-box" />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', mb: 1 }}>
          Nothing matches
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>That box is empty. Try a shorter search, or loosen the filters.</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={onClear} sx={{ color: 'text.primary', borderColor: 'text.primary' }}>
            Show everything
          </Button>
          <LoadButton onClick={onAdd} sx={{ minHeight: 44, fontSize: '0.9375rem', px: 2 }}>
            Load a thing
          </LoadButton>
        </Box>
      </Box>
    </Sheet>
  );
}
