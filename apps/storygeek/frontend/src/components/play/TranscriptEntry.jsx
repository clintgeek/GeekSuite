import { Box, Typography, alpha, useTheme } from '@mui/material';
import Narration from '../Narration';
import DiceRoll from './DiceRoll';
import { fonts } from '../../theme/theme';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const time = (m) => m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Stamp({ message, align = 'right' }) {
  return (
    <Typography component="span" sx={{
      display: 'block', mt: 0.75, textAlign: align, fontFamily: fonts.ui, fontSize: '0.75rem',
      letterSpacing: '0.06em', color: 'text.secondary', fontVariantNumeric: 'lining-nums tabular-nums',
    }}>
      {time(message)}
    </Typography>
  );
}

/** A scene break: a small fleuron between rules, before a new scene opens. */
function SceneBreak() {
  const theme = useTheme();
  const c = theme.palette.candle;
  return (
    <Box aria-hidden="true" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 3.5, color: c.accentLabel }}>
      <Box sx={{ flex: 1, height: '1px', background: `linear-gradient(90deg, transparent, ${c.rule})` }} />
      <Typography component="span" sx={{ fontFamily: fonts.display, fontSize: '1.1rem', lineHeight: 1 }}>❦</Typography>
      <Box sx={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${c.rule}, transparent)` }} />
    </Box>
  );
}

/**
 * GM narration — the page of the tale. No bubble: prose on the sheet, at a
 * reading measure, with an illuminated initial when it opens a scene.
 */
export function NarrationEntry({ message, opensScene, isFirst }) {
  return (
    <Box component="article" className="fade-in-up" data-entry="narration" sx={{ mb: 3.5, position: 'relative' }}>
      {opensScene && !isFirst && <SceneBreak />}
      <Box component="span" sx={visuallyHidden}>The Game Master:</Box>
      <Narration
        content={message.content}
        dropCap={opensScene}
        sx={{
          fontFamily: fonts.text,
          fontSize: { xs: '1.0625rem', md: '1.1875rem' },
          lineHeight: { xs: 1.7, md: 1.75 },
          color: 'text.primary',
        }}
      />
      {message.diceResults?.length > 0 && (
        <DiceRoll dice={message.diceResults[0]} meta={message.diceMeta} />
      )}
      <Stamp message={message} />
    </Box>
  );
}

/**
 * The player's own voice: set in from the margin, italic, ruled in the
 * player's ink and attributed by name, so it can never be mistaken for the
 * narrator.
 */
export function PlayerEntry({ message, playerName }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  return (
    <Box component="article" className="fade-in-up" data-entry="player" sx={{
      mb: 3.5, ml: { xs: 2, sm: 5 }, pl: { xs: 1.75, sm: 2.25 }, py: 0.75,
      borderLeft: `3px solid ${c.voice}`,
      background: `linear-gradient(90deg, ${alpha(c.voice, 0.07)} 0%, transparent 85%)`,
      borderRadius: '0 4px 4px 0',
    }}>
      <Typography component="p" sx={{
        fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em',
        textTransform: 'uppercase', color: c.voice, mb: 0.5,
      }}>
        {playerName ? `${playerName} · you` : 'You'}
      </Typography>
      <Narration content={message.content} sx={{
        fontFamily: fonts.text, fontStyle: 'italic',
        fontSize: { xs: '1.0625rem', md: '1.125rem' }, lineHeight: 1.6, color: 'text.primary',
      }} />
      <Stamp message={message} align="left" />
    </Box>
  );
}

/** Table talk — the engine or the app speaking, not the fiction. */
export function SystemEntry({ message }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  return (
    <Box component="aside" className="fade-in-up" data-entry="system" sx={{
      mb: 3, mx: { xs: 0, sm: 2 }, px: 2, py: 1.25,
      border: `1px dashed ${c.rule}`, borderRadius: '4px',
      backgroundColor: alpha(c.ink, 0.03),
    }}>
      <Typography component="p" sx={{
        fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em',
        textTransform: 'uppercase', color: c.accentLabel, mb: 0.5,
      }}>
        Table note
      </Typography>
      <Narration content={message.content} sx={{ fontFamily: fonts.ui, fontSize: '0.9375rem', lineHeight: 1.55, color: 'text.secondary' }} />
      <Stamp message={message} align="left" />
    </Box>
  );
}
