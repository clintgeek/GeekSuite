import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { GeekEmptyState } from '@geeksuite/ui';
import PanelShell, { PanelLabel } from './PanelShell';
import Tag from '../primitives/Tag';
import { fonts } from '../../theme/theme';

/**
 * CharacterPanel — the persistent character HUD (ideas #3). "Who am I, how
 * am I doing, what do I have" without opening a sheet. Reads the canonical
 * player character; degrades gracefully before the PC is established.
 */
const STATUS_TONE = { alive: 'good', dead: 'bad', missing: 'warn', unknown: 'neutral' };

export default function CharacterPanel({ player }) {
  const theme = useTheme();
  const c = theme.palette.candle;

  if (!player) {
    return (
      <PanelShell title="Character">
        <GeekEmptyState
          compact
          align="start"
          description="Your character will take shape as the tale begins."
          descriptionSx={{ color: 'text.secondary', fontStyle: 'italic' }}
          sx={{ py: 0 }}
        />
      </PanelShell>
    );
  }

  const inventory = (player.inventory || []).filter((i) => (i.quantity ?? 1) > 0);
  const skills = player.skills || [];

  return (
    <PanelShell title="Character">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 2 }}>
        <Box aria-hidden="true" sx={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          fontFamily: fonts.display, fontWeight: 700, fontSize: '1.2rem',
          color: c.mode === 'dark' ? '#1d1208' : '#f9f0dc',
          background: c.mode === 'dark'
            ? 'radial-gradient(circle at 35% 30%, #f3c472, #c98a2e 70%)'
            : 'radial-gradient(circle at 35% 30%, #9a3036, #7a1f24 70%)',
          boxShadow: `0 0 0 2px ${c.paper}, 0 0 0 3px ${c.rule}`,
        }}>
          {player.name?.[0]?.toUpperCase() || '?'}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{
            fontFamily: fonts.display, fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mb: 1,
          }}>
            {player.name}
          </Typography>
          <Tag tone={STATUS_TONE[player.status] || 'good'}>{player.status || 'alive'}</Tag>
        </Box>
      </Box>

      {player.currentState && (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.5, fontStyle: 'italic', mb: 2 }}>
          {player.currentState}
        </Typography>
      )}

      {inventory.length > 0 && (
        <Box sx={{ pt: 2, mt: 1, borderTop: `1px dashed ${c.rule}` }}>
          <PanelLabel>Inventory</PanelLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
            {inventory.map((it, i) => (
              <Box key={i} component="span" sx={{
                display: 'inline-flex', alignItems: 'center', minHeight: 26, px: 2, borderRadius: '3px',
                fontFamily: fonts.ui, fontSize: '0.875rem',
                border: `1px solid ${it.isEquipped ? c.accent : c.rule}`,
                bgcolor: it.isEquipped ? alpha(c.accent, 0.08) : 'transparent',
                color: it.isEquipped ? c.accent : 'text.primary',
                fontWeight: it.isEquipped ? 700 : 400,
              }}>
                {`${it.name}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}`}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {skills.length > 0 && (
        <Box sx={{ pt: 2, mt: 3, borderTop: `1px dashed ${c.rule}` }}>
          <PanelLabel>Skills</PanelLabel>
          <Box sx={{ mt: 1 }}>
            {skills.map((s, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', py: 0.75 }}>
                <Typography sx={{ fontFamily: fonts.ui, fontSize: '0.9375rem' }}>{s.name}</Typography>
                <Typography sx={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.9375rem', color: c.accent, fontVariantNumeric: 'lining-nums tabular-nums' }}>
                  {s.level}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </PanelShell>
  );
}
