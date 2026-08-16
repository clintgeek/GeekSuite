import React, { useState } from 'react';
import { Box, Typography, Chip, Avatar, Collapse, alpha, useTheme } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { npcRelationshipToPlayer, npcKnownFacts } from '../../game/projections';

/**
 * PartyPanel — "who's here?" (ideas #4). One card per present NPC: identity,
 * their standing toward the player, and a bounded KNOWS line drawn straight
 * from the knowledge model. The game remembers who Mira is so the player
 * needn't. Crucially, the KNOWS list shows only what the engine granted them —
 * the UI can't imply an NPC knows something they don't.
 */
const REL_COLOR = {
  friend: 'success', lover: 'success', family: 'success', mentor: 'info',
  student: 'info', ally: 'success', rival: 'warning', enemy: 'error', neutral: 'default',
};

export default function PartyPanel({ npcs, player, story }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: `1px solid ${alpha(gold, 0.15)}` }}>
      <Typography variant="overline" sx={{ color: alpha(gold, 0.65), fontSize: '0.62rem', letterSpacing: '0.12em', display: 'block', mb: 1 }}>
        Present · {npcs.length}
      </Typography>
      {npcs.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic', fontSize: '0.8rem' }}>
          No one else is here.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {npcs.map((npc) => (
            <NpcCard key={npc.name} npc={npc} player={player} story={story} gold={gold} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function NpcCard({ npc, player, story, gold }) {
  const [open, setOpen] = useState(false);
  const rel = npcRelationshipToPlayer(npc, player);
  const known = npcKnownFacts(npc, story);

  return (
    <Box sx={{
      p: 1, borderRadius: 1.5, border: `1px solid ${alpha(gold, 0.12)}`,
      bgcolor: alpha(gold, 0.02),
      cursor: known.length ? 'pointer' : 'default',
      transition: 'border-color 120ms ease',
      '&:hover': known.length ? { borderColor: alpha(gold, 0.3) } : {},
    }}
      onClick={() => known.length && setOpen((v) => !v)}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: alpha(gold, 0.12), color: gold, fontFamily: '"Cinzel", serif' }}>
          {npc.name?.[0]?.toUpperCase() || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {npc.name}
          </Typography>
          {rel && (
            <Chip size="small" label={rel.relationshipType} color={REL_COLOR[rel.relationshipType] || 'default'}
              sx={{ height: 15, fontSize: '0.55rem', textTransform: 'uppercase', fontWeight: 700 }} />
          )}
        </Box>
        {known.length > 0 && (open ? <ExpandLess sx={{ fontSize: 18, color: 'text.disabled' }} /> : <ExpandMore sx={{ fontSize: 18, color: 'text.disabled' }} />)}
      </Box>

      {npc.motivation && (
        <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.5, fontStyle: 'italic' }}>
          {npc.motivation}
        </Typography>
      )}

      {/* Bounded knowledge line */}
      <Box sx={{ mt: 0.5 }}>
        <Typography variant="caption" sx={{ color: alpha(gold, 0.6), fontSize: '0.6rem' }}>
          KNOWS {known.length > 0 ? `· ${known.length}` : '· nothing notable'}
        </Typography>
        <Collapse in={open} unmountOnExit>
          <Box sx={{ mt: 0.5, pl: 0.5, borderLeft: `2px solid ${alpha(gold, 0.2)}` }}>
            {known.map((f, i) => (
              <Typography key={i} variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary', pl: 0.75, py: 0.15 }}>
                • {f.fact}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
