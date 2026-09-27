/**
 * SuiteMap — the illuminated track diagram. The suite is one line out of the
 * box: every app is a station on it, and the lamp on the track at each
 * station is that app's live health check (`/api/health/app/<name>`, proxied
 * by baseGeek). The nameboards are the launcher — each is a link to the app.
 *
 * Desktop draws the line across the panel with nameboards alternating above
 * and below it, joined to the track by a stub that is lit brass when the
 * station answers and broken when it does not. A phone draws the same line
 * down the left edge, one station per row, so nothing scrolls sideways.
 *
 * Below the line, the depot: the shared services everything runs on.
 */
import { Box, Typography } from '@mui/material';
import Lamp, { StatusLamp } from './Lamp';
import { Dymo, Enamel } from './Labels';
import { LAMP, healthDetail, healthLamp, HEALTH_WORD } from './readings';

const BOARD_H = 116;
const NODE_H = 40;

/** The measured part of a reading: "42ms · v1.4.2", or nothing yet. */
function stationDetail(reading) {
  const state = healthLamp(reading);
  if (state === LAMP.UNKNOWN || state === LAMP.FAULT) return '';
  const version = reading.version ? ` · v${reading.version}` : '';
  return `${healthDetail(reading)}${version}`;
}

function Station({ app, reading, index, count }) {
  const state = healthLamp(reading);
  const above = index % 2 === 0;
  const lit = state === LAMP.OK || state === LAMP.WARN;
  const word = HEALTH_WORD[state];
  const detail = stationDetail(reading);

  return (
    <Box
      component="li"
      sx={(theme) => ({
        listStyle: 'none',
        position: 'relative',
        minWidth: 0,
        // Phone: a row hung off the vertical line at the left.
        display: 'grid',
        gridTemplateColumns: '40px 1fr',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        // Desktop: a column, the board above or below the track.
        [theme.breakpoints.up('md')]: {
          gridTemplateColumns: '1fr',
          gridTemplateRows: `${BOARD_H}px ${NODE_H}px ${BOARD_H}px`,
          gap: 0,
          py: 0,
          zIndex: count - index,
        },
      })}
    >
      <Box
        sx={(theme) => ({
          gridColumn: 1,
          gridRow: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          [theme.breakpoints.up('md')]: { gridRow: 2 },
        })}
      >
        <Box
          sx={(theme) => ({
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: theme.palette.box.tape.black,
            border: `2px solid ${lit ? theme.palette.box.trackLit : theme.palette.box.bezel}`,
          })}
        >
          <Lamp state={state} size={14} />
        </Box>
      </Box>

      <Box
        component="a"
        href={app.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${app.displayName} (${[word, detail].filter(Boolean).join(', ')})`}
        sx={(theme) => ({
          gridColumn: 2,
          gridRow: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.5,
          minWidth: 0,
          minHeight: 44,
          px: 1.25,
          py: 1,
          borderRadius: 1,
          textDecoration: 'none',
          color: 'inherit',
          border: `1px solid ${theme.palette.line.panel}`,
          bgcolor: theme.palette.surfaces.elevated,
          transition: 'border-color 150ms ease, transform 150ms ease',
          '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          '@media (hover: hover)': {
            '&:hover': { borderColor: theme.palette.primary.main, transform: 'translateY(-1px)' },
          },
          [theme.breakpoints.up('md')]: {
            gridColumn: 1,
            gridRow: above ? 1 : 3,
            alignSelf: above ? 'end' : 'start',
            alignItems: 'center',
            textAlign: 'center',
            mx: 0.5,
            my: '14px',
            // The stub from the board to the track.
            '&::after': {
              content: '""',
              position: 'absolute',
              left: '50%',
              width: 0,
              height: 14,
              [above ? 'bottom' : 'top']: -16,
              borderLeft: `3px ${lit ? 'solid' : 'dashed'} ${lit ? theme.palette.box.trackLit : theme.palette.box.bezel}`,
              transform: 'translateX(-1.5px)',
            },
          },
        })}
      >
        <Enamel>{app.displayName}</Enamel>
        {app.description && (
          <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.3 }}>
            {app.description}
          </Typography>
        )}
        <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', color: 'text.primary', lineHeight: 1.3 }}>
          <Box component="span" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{word}</Box>
          {detail && <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>{detail}</Box>}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * @param {object} props
 * @param {Array}  props.apps           registry rows, in line order
 * @param {object} props.health         app name → health reading
 * @param {Array}  props.services       [{ key, name }]
 * @param {object} props.serviceStatus  service key → { online, latency, version }
 */
export default function SuiteMap({ apps, health, services, serviceStatus }) {
  return (
    <Box>
      <Box
        component="ol"
        aria-label="The line: every suite app and its health"
        sx={(theme) => ({
          position: 'relative',
          m: 0,
          p: 0,
          pl: 0,
          '&::before': {
            content: '""',
            position: 'absolute',
            borderRadius: 2,
            bgcolor: theme.palette.box.track,
          },
          // Phone: the track runs down the left, through every lamp. (Split
          // with down/up rather than base + override: MUI's sx lets a base
          // pseudo-element property beat the same property under a breakpoint.)
          [theme.breakpoints.down('md')]: {
            '&::before': { left: 18, top: 8, bottom: 8, width: 4 },
          },
          [theme.breakpoints.up('md')]: {
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(apps.length, 1)}, minmax(0, 1fr))`,
            '&::before': {
              left: 0,
              right: 0,
              top: BOARD_H + NODE_H / 2 - 2,
              height: 4,
            },
            // The buffer stop at the far end of the line.
            '&::after': {
              content: '""',
              position: 'absolute',
              right: -2,
              top: BOARD_H + NODE_H / 2 - 12,
              width: 6,
              height: 24,
              borderRadius: 1,
              bgcolor: theme.palette.box.tape.red,
            },
          },
        })}
      >
        {apps.map((app, index) => (
          <Station key={app.name} app={app} reading={health[app.name]} index={index} count={apps.length} />
        ))}
      </Box>

      <Box
        sx={{
          mt: { xs: 2.5, md: 1 },
          pt: 2,
          borderTop: '2px dashed',
          borderColor: 'line.panel',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Dymo component="h3" sx={{ m: 0 }}>Infrastructure</Dymo>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            The depot: the shared services every station runs on.
          </Typography>
        </Box>
        <Box
          component="ul"
          sx={{
            m: 0,
            p: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${Math.min(services.length, 4)}, minmax(0, 1fr))` },
            gap: 1.5,
          }}
        >
          {services.map((svc) => {
            const reading = serviceStatus[svc.key];
            const state = healthLamp(reading);
            const version = reading?.online && reading.version ? ` · v${reading.version}` : '';
            return (
              <Box
                component="li"
                key={svc.key}
                sx={{
                  listStyle: 'none',
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'line.panel',
                  bgcolor: 'surfaces.elevated',
                  minWidth: 0,
                }}
              >
                <StatusLamp state={state} label={svc.name} word={`${healthDetail(reading)}${version}`} />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
