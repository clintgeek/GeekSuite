import React from 'react';
import { Box, Typography, Chip, Avatar, Divider, alpha, useTheme } from '@mui/material';

/**
 * CharacterPanel — the persistent character HUD (ideas #3). "Who am I, how
 * am I doing, what do I have" without opening a sheet. Reads the canonical
 * player character; degrades gracefully before the PC is established.
 */
const STATUS_COLOR = { alive: 'success', dead: 'error', missing: 'warning', unknown: 'default' };

export default function CharacterPanel({ player }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  if (!player) {
    return (
      <PanelShell gold={gold} title="Character">
        <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          Your character will take shape as the tale begins.
        </Typography>
      </PanelShell>
    );
  }

  const inventory = (player.inventory || []).filter((i) => (i.quantity ?? 1) > 0);
  const skills = player.skills || [];

  return (
    <PanelShell gold={gold} title="Character">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
        <Avatar sx={{
          width: 40, height: 40, bgcolor: alpha(gold, 0.15), color: gold,
          fontFamily: '"Cinzel", serif', fontWeight: 700,
        }}>
          {player.name?.[0]?.toUpperCase() || '?'}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{
            fontFamily: '"Cinzel", serif', fontWeight: 600, fontSize: '1rem', lineHeight: 1.15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {player.name}
          </Typography>
          <Chip size="small" label={player.status || 'alive'} color={STATUS_COLOR[player.status] || 'success'}
            sx={{ height: 17, fontSize: '0.58rem', textTransform: 'uppercase', fontWeight: 700, mt: 0.25 }} />
        </Box>
      </Box>

      {player.currentState && (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1, fontStyle: 'italic' }}>
          {player.currentState}
        </Typography>
      )}

      {inventory.length > 0 && (
        <>
          <Divider sx={{ my: 1, borderColor: alpha(gold, 0.1) }} />
          <Label gold={gold}>Inventory</Label>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {inventory.map((it, i) => (
              <Chip key={i} size="small"
                label={`${it.name}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}`}
                variant="outlined"
                sx={{
                  height: 22, fontSize: '0.68rem',
                  borderColor: it.isEquipped ? gold : alpha(gold, 0.25),
                  color: it.isEquipped ? gold : 'text.secondary',
                }} />
            ))}
          </Box>
        </>
      )}

      {skills.length > 0 && (
        <>
          <Divider sx={{ my: 1, borderColor: alpha(gold, 0.1) }} />
          <Label gold={gold}>Skills</Label>
          <Box sx={{ mt: 0.5 }}>
            {skills.map((s, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
                <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{s.name}</Typography>
                <Typography variant="body2" sx={{ fontSize: '0.78rem', color: gold, fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.level}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </PanelShell>
  );
}

function PanelShell({ gold, title, children }) {
  return (
    <Box sx={{
      p: 1.5, borderRadius: 2, bgcolor: 'background.paper',
      border: `1px solid ${alpha(gold, 0.15)}`,
    }}>
      <Label gold={gold} block>{title}</Label>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  );
}

function Label({ gold, children, block }) {
  return (
    <Typography variant="overline" sx={{
      color: alpha(gold, 0.65), fontSize: '0.62rem', letterSpacing: '0.12em',
      display: block ? 'block' : 'inline',
    }}>
      {children}
    </Typography>
  );
}
