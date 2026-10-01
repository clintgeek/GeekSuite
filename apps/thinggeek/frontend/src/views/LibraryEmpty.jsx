/**
 * The library's empty states — the first screen a new household sees, so
 * the Storage Yard is at its loudest here: a row of units, doors down,
 * waiting for what you keep.
 *
 *   first run   a black fleet-livery header with speed stripes, "YOUR
 *               STORAGE" and "Everything you own, in one place.", a short
 *               row of roll-up doors (one open onto the lit unit), the three
 *               steps on numbered unit plates, and the one action: the big
 *               orange "Add your first thing". When the household has
 *               already set up its rooms (Chef's real shape: 5 rooms, 0
 *               things), each room is a unit (a small door and its tag) that
 *               opens Walk the room straight into it.
 *   no match    "Nothing matches" — a different situation, a different sentence.
 *
 * No demo data (Chef's call): the first run says where to start.
 */
import React from 'react';
import { Box, Button, ButtonBase, Link, Typography } from '@mui/material';
import { Add as AddIcon, CategoryOutlined as TypesIcon, WarehouseOutlined as PlacesIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { MiniDoor, UnitDoor } from '../components/StorageUnit';
import UnitTag from '../components/UnitTag';
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
 * black edge and a burnt-orange shadow under it — the Add button.
 */
export function AddButton({ children, onClick, testId, startIcon = <AddIcon />, sx }) {
  return (
    <Button
      variant="contained"
      color="hero"
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
        borderColor: 'hero.contrastText',
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

/** A numbered unit plate: the step's number stencilled in orange on black. */
function StepPlate({ n }) {
  return (
    <Box
      aria-hidden="true"
      data-caption={String(n)}
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        bgcolor: CHROME.bar,
        border: `2px solid ${LIVERY.orange}`,
        borderRadius: '3px',
        display: 'grid',
        placeItems: 'center',
        color: LIVERY.orange,
        '&::before': { content: 'attr(data-caption)', fontFamily: STENCIL_FONT, fontSize: '1.25rem', lineHeight: 1 },
      }}
    />
  );
}

/** A short row of the yard's roll-up doors, the middle one up onto a lit unit. Decoration. */
function DoorRow() {
  return (
    <Box aria-hidden="true" data-testid="empty-doors" sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1, mb: 2.5 }}>
      <MiniDoor size={84} />
      <MiniDoor size={84} open />
      <MiniDoor size={84} />
    </Box>
  );
}

function YardHeader({ title, lede }) {
  return (
    <Box sx={{ position: 'relative', bgcolor: CHROME.bar, color: CHROME.text, px: { xs: 2.5, sm: 4 }, pt: { xs: 2.5, md: 3 }, pb: { xs: 2.5, md: 3 }, overflow: 'hidden' }}>
      {/* the speed stripes, off the trailing corner */}
      <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: { xs: '34%', sm: '40%' }, backgroundImage: speedStripes(), clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0 100%)', opacity: 0.95 }} />
      <Box sx={{ position: 'relative', maxWidth: { xs: '78%', sm: '66%' } }}>
        <Box component="span" aria-hidden="true" data-caption="YOUR STORAGE" sx={{ display: 'block', mb: 0.75, color: LIVERY.orange, fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', '&::before': { content: 'attr(data-caption)' } }} />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '2rem', md: '2.5rem' }, lineHeight: 1.02, color: CHROME.text, textShadow: '0 2px 0 rgba(0,0,0,0.5)' }}>
          {title}
        </Typography>
        {lede ? <Typography sx={{ mt: 1, color: CHROME.secondary, fontSize: '0.9375rem', lineHeight: 1.5 }}>{lede}</Typography> : null}
      </Box>
    </Box>
  );
}

/** Chef's shape: rooms set up, nothing in them yet — each room opens Walk the room right there. */
function RoomsToWalk({ rooms }) {
  return (
    <Box component="section" aria-labelledby="empty-rooms-heading" sx={{ mt: 3 }}>
      <Typography id="empty-rooms-heading" component="h3" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.125rem', mb: 0.5 }}>
        Your rooms are ready
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.25 }}>Pick one and walk it: snap, name, next — ten things in two minutes.</Typography>
      {/* A short aisle of units: each room's roll-up door with its tag on it. */}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', gap: 1 }}>
        {rooms.map((r) => (
          <Box component="li" key={r.id} sx={{ minWidth: 0 }}>
            <ButtonBase
              component={RouterLink}
              to={`/walk?at=${encodeURIComponent(r.id)}`}
              aria-label={`Walk ${r.name}`}
              data-testid="empty-room"
              sx={{
                display: 'block',
                width: '100%',
                borderRadius: '3px',
                '& [data-testid="unit-door"]': { transition: 'transform 160ms ease-out' },
                '@media (hover: hover)': { '&:hover [data-testid="unit-door"]': { transform: 'translateY(-2px)' } },
                '&:active [data-testid="unit-door"]': { transform: 'translateY(1px)' },
                '&.Mui-focusVisible': { outline: 3, outlineStyle: 'solid', outlineColor: 'text.primary', outlineOffset: 2 },
              }}
            >
              <UnitDoor name={r.name} minHeight={84}>
                <UnitTag kind={r.kind} size="sm" tilt sx={{ maxWidth: '100%' }}>
                  {r.name}
                </UnitTag>
              </UnitDoor>
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
        <YardHeader
          title="Everything you own, in one place."
          lede={
            hasRooms
              ? `${rooms.length} room${rooms.length === 1 ? ' is' : 's are'} set up and empty. Open one and start adding what's kept there.`
              : "Where it lives, what's due, and the photo, serial, receipt and value an insurer will ask for."
          }
        />
        <Box sx={{ px: { xs: 2.5, sm: 4 }, pt: 3, pb: { xs: 3, md: 4 } }}>
          <DoorRow />
          <Typography sx={{ color: 'text.secondary', mb: 2.5, lineHeight: 1.6, fontSize: '1rem', textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
            Start with the things you'd hate to lose — the boat, the guns, the good tools. A photo and where it is is enough to begin.
          </Typography>
          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, mb: 3, display: 'grid', gap: 1.5, maxWidth: 480, mx: 'auto' }}>
            {STEPS.map(([title, text], i) => (
              <Box component="li" key={title} data-testid="empty-step" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <StepPlate n={i + 1} />
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
            <AddButton onClick={onAdd} testId="empty-add">
              Add your first thing
            </AddButton>
          </Box>
          {hasRooms ? <RoomsToWalk rooms={rooms} /> : null}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 2.5 }}>
            <Button component={RouterLink} to="/where" startIcon={<PlacesIcon />} sx={{ color: 'text.primary' }}>
              {hasRooms ? 'See the storage yard' : 'Set up where things go'}
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
        <MiniDoor size={84} open sx={{ mb: 1.5 }} />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', mb: 1 }}>
          Nothing matches
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>Nothing in the yard fits that. Try a shorter search, or loosen the filters.</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={onClear} sx={{ color: 'text.primary', borderColor: 'text.primary' }}>
            Show everything
          </Button>
          <AddButton onClick={onAdd} sx={{ minHeight: 44, fontSize: '0.9375rem', px: 2 }}>
            Add a thing
          </AddButton>
        </Box>
      </Box>
    </Sheet>
  );
}
