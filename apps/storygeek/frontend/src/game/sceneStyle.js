/**
 * sceneStyle.js — the "visual identity per scene" (ideas #1), without image
 * generation. Each location type maps to a gradient + emoji sigil; mood and
 * time-of-day tint it. This turns the scene header from a text label into a
 * place you're standing, and it changes as the narrative moves — cheap now,
 * and a clean seam to drop generated art behind later.
 */
import { alpha } from '@mui/material';

// Base hue per location type (hex; tinted against the theme at render time).
const TYPE_STYLE = {
  tavern:     { c1: '#7a4a1e', c2: '#3a2410', sigil: '🍺' },
  city:       { c1: '#4a5a7a', c2: '#1e2436', sigil: '🏙️' },
  village:    { c1: '#6a5a3a', c2: '#2e2818', sigil: '🏘️' },
  castle:     { c1: '#5a4a6a', c2: '#241e30', sigil: '🏰' },
  dungeon:    { c1: '#3a3a44', c2: '#141418', sigil: '🗝️' },
  forest:     { c1: '#2d5a3a', c2: '#12241a', sigil: '🌲' },
  wilderness: { c1: '#4a5a2d', c2: '#1e2412', sigil: '⛰️' },
  temple:     { c1: '#6a5a2d', c2: '#2e2812', sigil: '⛩️' },
  shop:       { c1: '#6a4a5a', c2: '#2e1e28', sigil: '🏪' },
  other:      { c1: '#4a4438', c2: '#1e1c16', sigil: '📍' },
};

// Mood shifts the accent tint layered over the base gradient.
const MOOD_TINT = {
  dark:      '#3a1a2a',
  tense:     '#5a2a1a',
  hopeful:   '#2a4a3a',
  peaceful:  '#2a3a4a',
  mysterious:'#2a1a4a',
  chaotic:   '#4a1a1a',
  neutral:   null,
};

const TIME_OVERLAY = {
  dawn:     'rgba(255, 180, 120, 0.10)',
  morning:  'rgba(255, 230, 180, 0.08)',
  afternoon:'rgba(255, 245, 210, 0.05)',
  evening:  'rgba(120, 90, 160, 0.12)',
  night:    'rgba(20, 30, 70, 0.28)',
  midnight: 'rgba(10, 15, 40, 0.40)',
};

const STATE_BADGE = {
  intact:    { label: 'Intact',    color: 'success' },
  damaged:   { label: 'Damaged',   color: 'warning' },
  destroyed: { label: 'Destroyed', color: 'error' },
  altered:   { label: 'Altered',   color: 'info' },
};

const WEATHER_ICON = {
  stormy: '⛈️', clear: '☀️', foggy: '🌫️', windy: '🌬️', calm: '🌤️', rainy: '🌧️',
  snowy: '❄️', overcast: '☁️',
};

const TIME_ICON = {
  dawn: '🌅', morning: '🌄', afternoon: '🌞', evening: '🌆', night: '🌙', midnight: '🌌',
};

export function sceneVisual({ type = 'other', mood = 'neutral', timeOfDay = 'day', state = 'intact' }) {
  const base = TYPE_STYLE[type] || TYPE_STYLE.other;
  const moodTint = MOOD_TINT[mood];
  const timeOverlay = TIME_OVERLAY[timeOfDay] || 'transparent';

  // Destroyed places read as scorched regardless of type.
  const c1 = state === 'destroyed' ? '#3a2420' : base.c1;
  const c2 = state === 'destroyed' ? '#140c0a' : base.c2;

  const layers = [];
  if (moodTint) layers.push(`radial-gradient(ellipse at 70% 10%, ${alpha(moodTint, 0.55)} 0%, transparent 55%)`);
  layers.push(`linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`);
  const background = layers.join(', ');

  return { background, timeOverlay, sigil: base.sigil };
}

export function stateBadge(state) {
  return STATE_BADGE[state] || STATE_BADGE.intact;
}

export function weatherIcon(w) { return WEATHER_ICON[w] || '🌤️'; }
export function timeIcon(t) { return TIME_ICON[t] || '🕐'; }
export function typeSigil(type) { return (TYPE_STYLE[type] || TYPE_STYLE.other).sigil; }
