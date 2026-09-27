/**
 * Labels — the three ways the Signal Box writes on its own panels.
 *
 *   Dymo      embossed plastic tape, stuck on by hand: small labels, eyebrows,
 *             the name of a gauge. White on black (15.8:1) or on red (7.5:1).
 *   BrassPlate the engraved plate over a panel or under a lever: titles.
 *             Engraved ink on the flat of the brass (7.6:1).
 *   Enamel    the cream nameboard of a station on the line (14.1:1).
 *
 * All three are fixed fills in both modes: a label is an object screwed to
 * the panel, not a surface of it, so its ink is measured against its own
 * face and never against the theme's paper.
 */
import { Box, Typography } from '@mui/material';

/** A stable little tilt per label, so a row of tapes looks hand-applied. */
function tiltFor(text) {
  const s = String(text ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.25;
}

export function Dymo({ children, tone = 'black', component = 'span', tilt = true, caps = true, sx, ...rest }) {
  return (
    <Box
      component={component}
      {...rest}
      sx={(theme) => ({
        display: 'inline-block',
        px: 1,
        py: 0.25,
        borderRadius: '2px',
        bgcolor: theme.palette.box.tape[tone] || theme.palette.box.tape.black,
        color: theme.palette.box.tape.ink,
        fontFamily: theme.typography.fontFamilyMono,
        fontWeight: 700,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        letterSpacing: caps ? '0.12em' : '0.02em',
        textTransform: caps ? 'uppercase' : 'none',
        whiteSpace: 'nowrap',
        // The embossing: a lit lower edge on every letter, a sheen on the tape.
        textShadow: '0 1px 0 rgba(255,255,255,0.18)',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%, rgba(0,0,0,0.18))',
        boxShadow: '0 1px 1px rgba(0,0,0,0.35)',
        transform: tilt ? `rotate(${tiltFor(children)}deg)` : 'none',
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
    >
      {children}
    </Box>
  );
}

/**
 * An engraved brass plate. `number` is a lever or panel number, set in its own
 * roundel at the left. The heading level is the caller's (`component`), so a
 * page keeps a sane outline under the theatre.
 */
export function BrassPlate({ children, number, component = 'h2', size = 'md', sx, id }) {
  const fontSize = size === 'lg' ? '1.5rem' : size === 'sm' ? '0.95rem' : '1.2rem';
  return (
    <Box
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        maxWidth: '100%',
        px: 1.5,
        py: 0.5,
        borderRadius: '3px',
        background: theme.palette.accent.gradient,
        color: theme.palette.box.plate.ink,
        border: `1px solid ${theme.palette.box.plate.edge}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.35)',
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
    >
      {number !== undefined && number !== null && (
        <Box
          component="span"
          aria-hidden="true"
          sx={(theme) => ({
            width: 22,
            height: 22,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: theme.palette.box.plate.ink,
            color: theme.palette.box.plate.face,
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 700,
            fontSize: '0.75rem',
          })}
        >
          {number}
        </Box>
      )}
      <Typography
        component={component}
        id={id}
        sx={(theme) => ({
          fontFamily: theme.typography.fontFamilyPlate,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.15,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'inherit',
          // Engraved: a dark cut with a lit lower lip.
          textShadow: '0 1px 0 rgba(255,255,255,0.35)',
          m: 0,
          overflowWrap: 'anywhere',
        })}
      >
        {children}
      </Typography>
    </Box>
  );
}

/** A cream enamel nameboard with a black rim — a station's name. */
export function Enamel({ children, sx, component = 'span' }) {
  return (
    <Box
      component={component}
      sx={(theme) => ({
        display: 'inline-block',
        px: 1.25,
        py: 0.25,
        borderRadius: '4px',
        bgcolor: theme.palette.box.enamel.face,
        color: theme.palette.box.enamel.ink,
        border: `2px solid ${theme.palette.box.enamel.rim}`,
        boxShadow: `inset 0 0 0 1px ${theme.palette.box.enamel.face}, inset 0 0 0 2px ${theme.palette.box.enamel.rim}`,
        fontFamily: theme.typography.fontFamily,
        fontWeight: 700,
        fontSize: '0.8125rem',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
    >
      {children}
    </Box>
  );
}
