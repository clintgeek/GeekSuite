import React from 'react';

/**
 * Clean SVG weather icons — ported from geekPanel/ui/src/components/Weather.jsx.
 * All icons render with `currentColor` so they adopt the surrounding
 * MUI text color (e.g. set via `sx={{ color: 'text.secondary' }}`).
 */

export function IconSun({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
export function IconMoon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
export function IconPartCloud({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M12.9 7.1A4 4 0 0 0 8 4a4 4 0 0 0-1.5 7.7" />
      <path d="M12 2v1M4.93 4.93l.7.7M2 12h1" />
      <path d="M18 13a4 4 0 0 0-8 0 3.5 3.5 0 0 0 0 7h8a3 3 0 1 0-.8-5.9" />
    </svg>
  );
}
export function IconCloud({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}
export function IconRain({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <line x1="8" y1="19" x2="8" y2="21" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="16" y1="19" x2="16" y2="21" />
    </svg>
  );
}
export function IconSnow({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
      <line x1="8" y1="16" x2="8.01" y2="16" /><line x1="8" y1="20" x2="8.01" y2="20" />
      <line x1="12" y1="18" x2="12.01" y2="18" /><line x1="12" y1="22" x2="12.01" y2="22" />
      <line x1="16" y1="16" x2="16.01" y2="16" /><line x1="16" y1="20" x2="16.01" y2="20" />
    </svg>
  );
}
export function IconStorm({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
      <polyline points="13,11 9,17 15,17 11,23" />
    </svg>
  );
}
export function IconFog({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M4 14h16M4 18h12M8 10h12" />
    </svg>
  );
}

/**
 * WMO weather_code → icon mapping.
 *   0          Clear
 *   1,2        Mainly/partly cloudy
 *   3          Overcast
 *   45,48      Fog
 *   51–57      Drizzle
 *   61–67      Rain
 *   71–77      Snow
 *   80–82      Rain showers
 *   85–86      Snow showers
 *   95–99      Thunderstorm
 */
export function weatherCodeIcon(code, { size = 28, isDay = true } = {}) {
  const c = Number(code);
  if (Number.isNaN(c)) return <IconSun size={size} />;
  if (c === 0) return isDay ? <IconSun size={size} /> : <IconMoon size={size} />;
  if (c === 1 || c === 2) return <IconPartCloud size={size} />;
  if (c === 3) return <IconCloud size={size} />;
  if (c === 45 || c === 48) return <IconFog size={size} />;
  if (c >= 51 && c <= 57) return <IconRain size={size} />;
  if (c >= 61 && c <= 67) return <IconRain size={size} />;
  if (c >= 71 && c <= 77) return <IconSnow size={size} />;
  if (c >= 80 && c <= 82) return <IconRain size={size} />;
  if (c === 85 || c === 86) return <IconSnow size={size} />;
  if (c >= 95 && c <= 99) return <IconStorm size={size} />;
  return <IconCloud size={size} />;
}

export function weatherCodeLabel(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return 'Unknown';
  if (c === 0) return 'Clear';
  if (c === 1) return 'Mainly clear';
  if (c === 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Rain showers';
  if (c === 85 || c === 86) return 'Snow showers';
  if (c >= 95 && c <= 99) return 'Thunderstorm';
  return 'Cloudy';
}
