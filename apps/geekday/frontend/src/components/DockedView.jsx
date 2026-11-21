/**
 * Docked mode (spec reqs 14 and 16): after two idle minutes the page becomes
 * a dim clock face — the time, the next task, the weather.
 *
 * It is a full-screen layer ABOVE the page, so the touch that wakes it lands
 * on the layer and never on a checkbox or the ink underneath. It wakes on the
 * release (click), not the press: if it vanished on pointerdown, the same
 * touch's pointerup would fall through to whatever was under it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { Box, Typography } from '@mui/material';
import { GET_DAY_TASKS } from '../graphql/documents.js';
import { tzOffsetFor } from '../lib/days.js';
import { clockLabel, groupDayTasks, nextTask } from '../lib/tasks.js';
import { fetchWeather, WEATHER_TTL_MS } from '../lib/weather.js';
import { useMinuteClock } from '../hooks/useDevice.js';
import { DISPLAY_FONT, DOCK } from '../theme/theme.js';

const TASK_POLL_MS = 5 * 60 * 1000;

const KIND_LABEL = { timed: 'Next', late: 'Still to do', overdue: 'Overdue', untimed: 'To do' };

function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchWeather().then((result) => {
        if (!cancelled && result) setWeather(result);
      });
    load();
    const timer = setInterval(load, WEATHER_TTL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return weather;
}

/** A few pixels of drift each minute, so a clock left up for days does not mark the panel. */
const drift = (now) => {
  const minute = now.getHours() * 60 + now.getMinutes();
  return { x: ((minute * 7) % 25) - 12, y: ((minute * 11) % 25) - 12 };
};

export default function DockedView({ today, onWake }) {
  const now = useMinuteClock(true);
  const weather = useWeather();
  const { data } = useQuery(GET_DAY_TASKS, {
    variables: { date: today, tzOffsetMinutes: tzOffsetFor(today) },
    fetchPolicy: 'network-only',
    pollInterval: TASK_POLL_MS,
  });

  const next = useMemo(() => {
    if (!data?.dailyTasks) return undefined; // not known yet: say nothing rather than "all clear"
    return nextTask(groupDayTasks(data.dailyTasks, today, today), now);
  }, [data, today, now]);

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const [clock, meridiem = ''] = time.split(/\s/);
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const { x, y } = drift(now);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`${time}, ${date}. Tap to return to the page.`}
      data-testid="docked"
      onClick={onWake}
      // A drag ends with no click. Wake a beat after the release, once the
      // browser has finished delivering this touch to this layer.
      onPointerUp={() => setTimeout(onWake, 80)}
      onKeyDown={(event) => {
        event.preventDefault();
        onWake();
      }}
      // The layer owns every touch on it: no scroll, no selection, no context menu from a pen.
      onContextMenu={(event) => event.preventDefault()}
      ref={(node) => node?.focus({ preventScroll: true })}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (theme) => theme.zIndex.modal + 10,
        bgcolor: DOCK.ground,
        color: DOCK.text,
        display: 'grid',
        placeItems: 'center',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      <Box sx={{ width: 'min(86vw, 640px)', transform: `translate(${x}px, ${y}px)`, transition: 'transform 2s ease' }}>
        <Typography
          component="div"
          data-testid="docked-clock"
          sx={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 500,
            fontSize: 'clamp(5rem, 24vw, 11rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clock}
          {meridiem ? (
            <Box component="span" sx={{ fontSize: '0.22em', letterSpacing: '0.04em', ml: '0.4em', color: DOCK.secondary, fontWeight: 500 }}>
              {meridiem}
            </Box>
          ) : null}
        </Typography>
        <Typography sx={{ mt: 1.5, fontSize: '1.375rem', color: DOCK.secondary }}>{date}</Typography>

        <Box sx={{ mt: 5, pt: 3, borderTop: `1px solid ${DOCK.divider}`, minHeight: 96 }} data-testid="docked-next">
          {next ? (
            <>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: DOCK.ribbon }}>
                {KIND_LABEL[next.kind]}
                {clockLabel(next.task) ? (
                  <Box component="span" sx={{ ml: 1, color: DOCK.text, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
                    {clockLabel(next.task)}
                  </Box>
                ) : null}
              </Typography>
              <Typography
                sx={{
                  mt: 0.75,
                  fontFamily: DISPLAY_FONT,
                  fontSize: '1.875rem',
                  lineHeight: 1.2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {next.task.content}
              </Typography>
            </>
          ) : null}
          {next === null ? (
            <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: '1.625rem', color: DOCK.secondary }}>Nothing left on today’s list.</Typography>
          ) : null}
        </Box>

        <Box sx={{ mt: 3, minHeight: 32 }} data-testid="docked-weather">
          {weather ? (
            <Typography sx={{ fontSize: '1.125rem', color: DOCK.secondary, fontVariantNumeric: 'tabular-nums' }}>
              <Box component="span" sx={{ color: DOCK.text, fontWeight: 600 }}>
                {weather.temperature}°
              </Box>
              {weather.description ? ` ${weather.description}` : ''}
              {weather.high !== null && weather.low !== null ? ` · High ${weather.high}° · Low ${weather.low}°` : ''}
              {weather.place ? ` · ${weather.place}` : ''}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
