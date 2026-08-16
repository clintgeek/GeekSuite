import React from 'react';
import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import { sceneVisual, stateBadge, weatherIcon, timeIcon, typeSigil } from '../../game/sceneStyle';

/**
 * ScenePanel — "where am I?" as a place, not a label (ideas #1).
 * A gradient scene card keyed to location type + mood + time, with the
 * canonical location STATE badge (intact / destroyed …) front and centre so
 * world-state drift is impossible to miss.
 */
export default function ScenePanel({ scene }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const vis = sceneVisual(scene);
  const badge = stateBadge(scene.state);
  const hasLocation = Boolean(scene.locationName);

  return (
    <Box sx={{
      borderRadius: 2,
      overflow: 'hidden',
      border: `1px solid ${alpha(gold, 0.18)}`,
      boxShadow: `0 2px 12px ${alpha('#000', 0.25)}`,
    }}>
      {/* Visual band */}
      <Box sx={{
        position: 'relative',
        minHeight: 92,
        background: vis.background,
        display: 'flex',
        alignItems: 'flex-end',
        p: 1.5,
      }}>
        <Box sx={{ position: 'absolute', inset: 0, background: vis.timeOverlay, pointerEvents: 'none' }} />
        <Typography sx={{ position: 'absolute', top: 8, right: 12, fontSize: '1.6rem', opacity: 0.5 }}>
          {vis.sigil}
        </Typography>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.65), display: 'block', mb: 0.25 }}>
            {typeSigil(scene.type) && scene.type !== 'other' ? scene.type.toUpperCase() : 'CURRENT SCENE'}
          </Typography>
          <Typography sx={{
            fontFamily: '"Cinzel", serif', fontWeight: 700, fontSize: '1.15rem',
            color: '#fff', lineHeight: 1.15, textShadow: `0 1px 8px ${alpha('#000', 0.6)}`,
          }}>
            {hasLocation ? scene.locationName : 'An unfolding tale'}
          </Typography>
        </Box>
      </Box>

      {/* Meta strip */}
      <Box sx={{ p: 1.5, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: scene.situation ? 1 : 0 }}>
          {hasLocation && (
            <Chip size="small" label={badge.label} color={badge.color}
              variant={scene.state === 'intact' ? 'outlined' : 'filled'}
              sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }} />
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
            Day {scene.storyDay}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {timeIcon(scene.timeOfDay)} {scene.timeOfDay}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {weatherIcon(scene.weather)} {scene.weather}
          </Typography>
          <Typography variant="caption" sx={{ color: alpha(gold, 0.7), textTransform: 'capitalize' }}>
            · {scene.mood}
          </Typography>
        </Box>
        {scene.situation && (
          <Typography variant="body2" sx={{
            color: 'text.secondary', fontStyle: 'italic', fontSize: '0.8rem', lineHeight: 1.5,
          }}>
            {scene.situation}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
