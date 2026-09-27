import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { sceneVisual, stateBadge, weatherIcon, timeIcon, typeSigil } from '../../game/sceneStyle';
import Tag from '../primitives/Tag';
import { fonts } from '../../theme/theme';

/**
 * ScenePanel — "where am I?" as a place, not a label (ideas #1).
 * A gradient scene card keyed to location type + mood + time, with the
 * canonical location STATE badge (intact / destroyed …) front and centre so
 * world-state drift is impossible to miss.
 *
 * The band is always dark (every scene gradient is), so its words are fixed
 * parchment inks, not mode tokens: #f6ecd6 / #e6d6b4 clear 4.6:1 even on
 * the lightest raw stop of the lightest gradient, before the bottom shade
 * the words actually sit on.
 */
export default function ScenePanel({ scene }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const vis = sceneVisual(scene);
  const badge = stateBadge(scene.state);
  const hasLocation = Boolean(scene.locationName);
  const meta = { fontFamily: fonts.ui, fontSize: '0.875rem', color: 'text.secondary' };

  return (
    <Box component="section" aria-label="Scene" sx={{
      borderRadius: '6px', overflow: 'hidden', border: `1px solid ${c.rule}`,
      boxShadow: `0 2px 12px ${alpha('#000', c.mode === 'dark' ? 0.35 : 0.12)}`,
    }}>
      {/* Visual band */}
      <Box sx={{ position: 'relative', minHeight: 112, background: vis.background, display: 'flex', alignItems: 'flex-end', p: 3 }}>
        <Box sx={{ position: 'absolute', inset: 0, background: vis.timeOverlay, pointerEvents: 'none' }} />
        {/* Candlelight falling across the scene from the top. */}
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 80% 70% at 30% 0%, ${alpha('#e8a94a', 0.16)} 0%, transparent 70%), linear-gradient(0deg, ${alpha('#000', 0.45)} 0%, transparent 70%)` }} />
        <Typography aria-hidden="true" sx={{ position: 'absolute', top: 10, right: 14, fontSize: '1.6rem', opacity: 0.55 }}>
          {vis.sigil}
        </Typography>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography sx={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#e6d6b4', display: 'block', mb: 0.5 }}>
            {typeSigil(scene.type) && scene.type !== 'other' ? scene.type : 'Current scene'}
          </Typography>
          <Typography sx={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: '1.2rem',
            color: '#f6ecd6', lineHeight: 1.15, textShadow: `0 1px 8px ${alpha('#000', 0.6)}`,
          }}>
            {hasLocation ? scene.locationName : 'An unfolding tale'}
          </Typography>
        </Box>
      </Box>

      {/* Meta strip */}
      <Box sx={{ p: 3, bgcolor: c.paper }}>
        <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 2, rowGap: 1, flexWrap: 'wrap', mb: scene.situation ? 2 : 0 }}>
          {hasLocation && <Tag tone={badge.tone}>{badge.label}</Tag>}
          <Typography component="span" sx={{ ...meta, fontVariantNumeric: 'lining-nums' }}>Day {scene.storyDay}</Typography>
          <Typography component="span" sx={meta}>{timeIcon(scene.timeOfDay)} {scene.timeOfDay}</Typography>
          <Typography component="span" sx={meta}>{weatherIcon(scene.weather)} {scene.weather}</Typography>
          <Typography component="span" sx={{ ...meta, color: c.accentLabel, fontWeight: 700, textTransform: 'capitalize' }}>
            · {scene.mood}
          </Typography>
        </Box>
        {scene.situation && (
          <Typography sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.9375rem', lineHeight: 1.5 }}>
            {scene.situation}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
