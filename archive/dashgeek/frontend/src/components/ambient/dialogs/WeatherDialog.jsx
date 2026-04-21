import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import { weatherCodeIcon, weatherCodeLabel } from '../weatherIcons';

function dayShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
}

export default function WeatherDialog({ open, onClose, current, daily = [] }) {
  const theme = useTheme();
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';
  const isDay = current?.is_day !== 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="weather-dialog-title"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)' } },
      }}
    >
      <DialogTitle
        id="weather-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontFamily: monoStack,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        Forecast
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 2 }}>
        {current && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Box sx={{ color: 'text.secondary' }}>
              {weatherCodeIcon(current.weather_code, { size: 48, isDay })}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box
                component="span"
                className="numeral"
                sx={{
                  fontFamily: monoStack,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '3rem',
                  fontWeight: 500,
                  color: 'text.primary',
                  lineHeight: 1,
                }}
              >
                {Math.round(current.temp)}°
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                {weatherCodeLabel(current.weather_code)} · Feels {Math.round(current.feels_like)}°
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto', textAlign: 'right' }}>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                Humidity {Math.round(current.humidity)}%
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                Wind {Math.round(current.wind_speed)}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.25 }}>
                Precip {Math.round(current.precipitation ?? 0)}
              </Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {daily.map((d, i) => (
            <Box
              key={d.date ?? i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                py: 1.5,
                borderTop: i === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
              }}
            >
              <Box
                component="span"
                sx={{
                  fontFamily: monoStack,
                  fontSize: '0.8125rem',
                  color: 'text.secondary',
                  width: 56,
                  flexShrink: 0,
                }}
              >
                {dayShort(d.date)}
              </Box>
              <Box sx={{ color: 'text.secondary' }}>
                {weatherCodeIcon(d.weather_code, { size: 22, isDay: true })}
              </Box>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}
              >
                {weatherCodeLabel(d.weather_code)}
                {d.precipitation_probability != null && (
                  <Box component="span" sx={{ color: 'text.disabled', ml: 0.75 }}>
                    · {Math.round(d.precipitation_probability)}%
                  </Box>
                )}
              </Typography>
              <Box
                component="span"
                className="numeral"
                sx={{
                  fontFamily: monoStack,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'text.primary',
                  fontSize: '0.9375rem',
                  minWidth: 40,
                  textAlign: 'right',
                }}
              >
                {Math.round(d.temp_max)}°
              </Box>
              <Box
                component="span"
                className="numeral"
                sx={{
                  fontFamily: monoStack,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'text.disabled',
                  fontSize: '0.9375rem',
                  minWidth: 40,
                  textAlign: 'right',
                }}
              >
                {Math.round(d.temp_min)}°
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
