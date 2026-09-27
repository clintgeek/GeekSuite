/**
 * SplitFlap — a departures-board line. Each character is a flap; a character
 * that changes flips over (a cell is keyed by its character, so only the ones
 * that changed remount and play), staggered left to right. On first paint the
 * whole line clatters in. Reduced motion lands every flap at once (index.css).
 *
 * The flaps are `aria-hidden`; the text is given once, whole, as a visually
 * hidden span, so a screen reader hears "all lines clear" and not twenty
 * letters.
 */
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';

const flip = keyframes`
  0% { transform: rotateX(90deg); opacity: 0.2; }
  60% { transform: rotateX(-12deg); opacity: 1; }
  100% { transform: rotateX(0deg); opacity: 1; }
`;

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
};

export default function SplitFlap({ text, length, size = 'md', tone = 'ink', sx }) {
  const raw = String(text ?? '').toUpperCase();
  const chars = (length ? raw.padEnd(length, ' ').slice(0, length) : raw).split('');
  const cell = size === 'lg' ? { w: 22, h: 32, f: '1.25rem' } : size === 'sm' ? { w: 13, h: 20, f: '0.75rem' } : { w: 16, h: 24, f: '0.9375rem' };

  return (
    <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px', perspective: '400px', maxWidth: '100%', ...sx }}>
      <Box component="span" sx={srOnly}>{String(text ?? '')}</Box>
      {chars.map((ch, i) => (
        <Box
          key={`${i}-${ch}`} // position is the identity of a flap
          component="span"
          aria-hidden="true"
          sx={(theme) => ({
            position: 'relative',
            width: cell.w,
            height: cell.h,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '2px',
            bgcolor: '#23272d',
            backgroundImage: 'linear-gradient(180deg, #2b3037 0 50%, #1d2126 50% 100%)',
            color: tone === 'brass' ? theme.palette.box.plate.shine : theme.palette.box.tape.ink,
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 700,
            fontSize: cell.f,
            lineHeight: 1,
            boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.06), 0 1px 1px rgba(0,0,0,0.4)',
            // The hinge: a hairline across the middle of every flap.
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              height: '1px',
              bgcolor: 'rgba(0,0,0,0.55)',
            },
            animation: `${flip} 420ms ease-out both`,
            animationDelay: `${Math.min(i * 28, 600)}ms`,
            transformOrigin: 'center',
          })}
        >
          {ch === ' ' ? ' ' : ch}
        </Box>
      ))}
    </Box>
  );
}
