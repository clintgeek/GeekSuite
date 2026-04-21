import React, { useCallback, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AmbientCard from './AmbientCard';
import WeatherDialog from './dialogs/WeatherDialog';
import useInterval from '../../hooks/useInterval';
import { weatherCodeIcon, weatherCodeLabel } from './weatherIcons';

const DOMAIN = 'bujogeek';
const POLL_MS = 10 * 60 * 1000; // 10 min

export default function Weather() {
  const theme = useTheme();
  const domainColor = theme.palette.domains?.[DOMAIN];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(null);
  const [open, setOpen] = useState(false);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch('/api/ambient/weather', { credentials: 'include' });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setExpired(body.provider ?? 'google');
        setLoading(false);
        return;
      }
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setData(json);
      setExpired(null);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useInterval(fetchWeather, POLL_MS);

  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const current = data?.current;
  const isDay = current?.is_day !== 0;

  return (
    <>
      <AmbientCard
        domain={DOMAIN}
        title="WEATHER"
        loading={loading && !current}
        empty={!loading && !current && !expired}
        expiredProvider={expired}
        onClick={current ? () => setOpen(true) : undefined}
      >
        {current && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              minWidth: 0,
              position: 'relative',
            }}
          >
            <Box sx={{ color: domainColor ?? 'text.secondary', flexShrink: 0 }}>
              {weatherCodeIcon(current.weather_code, { size: 48, isDay })}
            </Box>
            <Box
              component="span"
              sx={{
                fontFamily: theme.typography.fontFamily,
                fontVariantNumeric: 'tabular-nums',
                fontSize: '2.5rem',
                fontWeight: 300,
                lineHeight: 1,
                color: 'text.primary',
              }}
            >
              {Math.round(current.temp)}°
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {weatherCodeLabel(current.weather_code)}
            </Typography>
            <Box
              component="span"
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                fontFamily: monoStack,
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.6875rem',
                color: 'text.disabled',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(current.humidity)}% · {Math.round(current.wind_speed)}mph
            </Box>
          </Box>
        )}
      </AmbientCard>

      <WeatherDialog
        open={open}
        onClose={() => setOpen(false)}
        current={current}
        daily={data?.daily ?? []}
      />
    </>
  );
}
