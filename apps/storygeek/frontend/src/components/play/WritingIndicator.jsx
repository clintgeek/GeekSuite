import { useEffect, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import Candle from '../primitives/Candle';
import { fonts } from '../../theme/theme';

/** After this long a turn is past the usual range, and the line says so. */
export const LONG_WAIT_SECONDS = 120;

/** `m:ss` — "0:42", "2:05". */
export const formatElapsed = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A time as epoch ms, or null: a Date, an ISO string (the server's), or ms. */
const toMs = (value) => {
  if (value == null || value === '') return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Seconds since `startedAt` (when the wait really began: the send, or the
 * server's lock), or since the component mounted when that is unknown,
 * ticking once a second. Counting from the start, not the mount, keeps the
 * clock from going back to 0:00 when the play screen swaps one indicator
 * for another mid-turn (its own send → waiting out the same turn) or comes
 * back to a turn already running. Never negative: a server clock a little
 * ahead of this one reads 0:00. A text change, not motion, so reduced
 * motion does not stop it.
 */
export function useElapsedSeconds(startedAt = null) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const from = toMs(startedAt) ?? mountedAt;
  return Math.max(0, (now - from) / 1000);
}

/**
 * What the player is told while a turn of their own is written. Leaving is
 * genuinely safe: the server finishes the turn whether or not anyone is
 * listening (continueStory never watches the request close), and the
 * composer draft keeps the turn's clientId in localStorage, so a page that
 * comes back asks whether it landed before anything else (StoryPlay
 * `resumeFromDraft`, `waitForTurn`).
 */
export const USUAL_WAIT = 'A turn usually takes one to three minutes. You can leave; it will be here when you come back.';
export const LONG_WAIT = 'Taking longer than usual — still writing. You can leave; it will be here when you come back.';

/**
 * The "streaming" state. The GM's reply arrives whole (no token stream yet),
 * so this is a waiting mark on the page where the next paragraph will land:
 * a lit candle, a line that says who is writing, a clock, and what to expect.
 *
 * Only the words are a live region. The clock sits outside it: a polite
 * region that changes every second would be read out every second.
 *
 * `label`/`detail` reword it for a turn this screen is waiting out rather
 * than writing — the player's own resent turn, or another device's. The
 * usual-wait line follows either way, and changes once, at two minutes, to
 * say the turn is running long. `usualLine`/`longLine` reword those for a
 * wait that is not a turn (Bookify binding the tale). `startedAt` is when
 * the wait began (see `useElapsedSeconds`); without it the clock starts now.
 */
export default function WritingIndicator({
  label = 'The Game Master is writing',
  detail = null,
  usualLine = USUAL_WAIT,
  longLine = LONG_WAIT,
  startedAt = null,
}) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const elapsed = useElapsedSeconds(startedAt);
  const expectation = elapsed >= LONG_WAIT_SECONDS ? longLine : usualLine;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, mt: 0.5 }}>
      <Candle size={40} flame={c.mode === 'dark' ? c.accent : '#c98a2e'} wax={c.mode === 'dark' ? '#efe3c8' : '#fffaf0'} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Box role="status" aria-live="polite">
            <Typography sx={{ fontFamily: fonts.text, fontStyle: 'italic', fontSize: '1.0625rem', color: 'text.secondary' }}>
              {label}
              <Box component="span" className="sg-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></Box>
            </Typography>
          </Box>
          <Typography
            component="span"
            data-testid="writing-elapsed"
            sx={{
              fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary',
              fontVariantNumeric: 'lining-nums tabular-nums',
            }}
          >
            {formatElapsed(elapsed)}
          </Typography>
        </Box>
        <Box aria-live="polite">
          {detail && (
            <Typography sx={{ fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
              {detail}
            </Typography>
          )}
          <Typography sx={{ fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
            {expectation}
          </Typography>
        </Box>
        {/* Ghost lines where the paragraph will land. */}
        <Box aria-hidden="true" sx={{ mt: 1, display: 'grid', gap: 0.75, maxWidth: 420 }}>
          {[92, 100, 64].map((w) => (
            <Box key={w} className="sg-candle-glow" sx={{ height: 6, width: `${w}%`, borderRadius: 3, backgroundColor: c.rule, opacity: 0.8 }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
