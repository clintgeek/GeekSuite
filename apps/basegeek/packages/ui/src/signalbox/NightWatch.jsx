/* eslint-disable react-refresh/only-export-components -- the overlay and its idle hook are one feature */
/**
 * NightWatch — the Signal Box's screensaver.
 *
 * After a few idle minutes on the dashboard (Settings → Night Watch; 5 by
 * default) the panel dims to a departures board: the time, the line status
 * and every station's lamp, all still live, drifting a little every half
 * minute so a wall-mounted tab does not burn in. Any key, click, touch, wheel
 * or pointer movement ends it.
 *
 * It never starts under reduced motion (it is motion, and a surprise), never
 * under a browser automation driver (the mobile harness), and never when the
 * switch is off.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import SplitFlap from './SplitFlap';
import Lamp from './Lamp';
import { isAutomated } from './motion';

const INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'scroll'];

/**
 * `true` once the page has had no input for `ms`. Resets on any input.
 * Disabled entirely (always false) when `enabled` is false or the browser is
 * automated.
 */
export function useIdle({ ms, enabled }) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(null);
  const allowed = enabled && !isAutomated() && ms > 0;

  useEffect(() => {
    if (!allowed) {
      setIdle(false);
      return undefined;
    }
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), ms);
    };
    const onInput = () => {
      setIdle(false);
      arm();
    };
    arm();
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true, capture: true });
    return () => {
      clearTimeout(timer.current);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
    };
  }, [allowed, ms]);

  return allowed && idle;
}

function clock(now) {
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function NightWatch({ active, stations = [], status, onExit }) {
  const [now, setNow] = useState(() => new Date());
  const [drift, setDrift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return undefined;
    const tick = setInterval(() => setNow(new Date()), 15000);
    const move = setInterval(() => {
      setDrift({ x: Math.round((Math.random() - 0.5) * 80), y: Math.round((Math.random() - 0.5) * 60) });
    }, 30000);
    return () => {
      clearInterval(tick);
      clearInterval(move);
    };
  }, [active]);

  if (!active) return null;

  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-label="Night Watch — press any key to return to the panel"
      onClick={onExit}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        bgcolor: '#050607',
        color: '#ece6d6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'none',
      }}
    >
      <Box
        sx={{
          transform: `translate(${drift.x}px, ${drift.y}px)`,
          transition: 'transform 6s ease-in-out',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          px: 2,
          maxWidth: 720,
          width: '100%',
        }}
      >
        <SplitFlap text={clock(now)} size="lg" tone="brass" />
        <SplitFlap text={status?.message || 'reading'} size="md" />
        <Box component="ul" sx={{ m: 0, p: 0, width: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          {stations.map((s) => (
            <Box component="li" key={s.label} sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, borderRadius: 1, bgcolor: '#101215', border: '1px solid #2b3037' }}>
              <Lamp state={s.state} size={16} />
              <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, fontSize: '0.875rem', color: '#ece6d6', flex: 1 }} noWrap>
                {s.label}
              </Typography>
              <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', color: '#b0b6be' }} noWrap>
                {s.word}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3ac' }}>
          Night watch · any key returns to the panel
        </Typography>
      </Box>
    </Box>
  );
}
