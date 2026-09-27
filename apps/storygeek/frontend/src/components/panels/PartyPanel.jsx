import React, { useState } from 'react';
import { Box, Typography, ButtonBase, Collapse, alpha, useTheme } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { GeekEmptyState } from '@geeksuite/ui';
import { npcRelationshipToPlayer, npcKnownFacts } from '../../game/projections';
import PanelShell from './PanelShell';
import Tag from '../primitives/Tag';
import { fonts } from '../../theme/theme';

/**
 * PartyPanel — "who's here?" (ideas #4). One card per present NPC: identity,
 * their standing toward the player, and a bounded KNOWS line drawn straight
 * from the knowledge model. The game remembers who Mira is so the player
 * needn't. Crucially, the KNOWS list shows only what the engine granted them —
 * the UI can't imply an NPC knows something they don't.
 */
const REL_TONE = {
  friend: 'good', lover: 'good', family: 'good', mentor: 'info',
  student: 'info', ally: 'good', rival: 'warn', enemy: 'bad', neutral: 'neutral',
};

export default function PartyPanel({ npcs, player, story }) {
  return (
    <PanelShell title={`Present · ${npcs.length}`}>
      {npcs.length === 0 ? (
        <GeekEmptyState
          compact
          align="start"
          description="No one else is here."
          descriptionSx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.9375rem' }}
          sx={{ py: 0 }}
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {npcs.map((npc) => (
            <NpcCard key={npc.name} npc={npc} player={player} story={story} />
          ))}
        </Box>
      )}
    </PanelShell>
  );
}

function NpcCard({ npc, player, story }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const [open, setOpen] = useState(false);
  const rel = npcRelationshipToPlayer(npc, player);
  const known = npcKnownFacts(npc, story);
  const canOpen = known.length > 0;

  return (
    <Box sx={{ p: 2, borderRadius: '4px', border: `1px solid ${c.rule}`, bgcolor: c.raised }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box aria-hidden="true" sx={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
          fontFamily: fonts.display, fontWeight: 700, fontSize: '0.9rem',
          border: `1px solid ${c.accentLabel}`, color: c.accentLabel,
        }}>
          {npc.name?.[0]?.toUpperCase() || '?'}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {npc.name}
          </Typography>
        </Box>
        {rel && <Tag tone={REL_TONE[rel.relationshipType] || 'neutral'}>{rel.relationshipType}</Tag>}
      </Box>

      {npc.motivation && (
        <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', mt: 1.5, fontStyle: 'italic', lineHeight: 1.45 }}>
          {npc.motivation}
        </Typography>
      )}

      {/* Bounded knowledge line — a real button, so it is reachable and
          announced (it used to be a click handler on a plain box). */}
      <ButtonBase
        onClick={() => canOpen && setOpen((v) => !v)}
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        sx={{
          mt: 1, width: '100%', minHeight: 44, justifyContent: 'space-between', borderRadius: '3px',
          fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.12em',
          textTransform: 'uppercase', color: c.accentLabel, px: 0.5,
          '&.Mui-disabled': { color: c.inkFaint },
          '@media (hover: hover)': { '&:hover': { bgcolor: alpha(c.accent, 0.06) } },
        }}
      >
        <span>Knows {canOpen ? `· ${known.length}` : '· nothing notable'}</span>
        {canOpen && (open ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />)}
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, pl: 2, borderLeft: `2px solid ${c.rule}` }}>
          {known.map((f, i) => (
            <Typography component="li" key={i} sx={{ fontSize: '0.9375rem', color: 'text.secondary', py: 0.5, lineHeight: 1.45 }}>
              {f.fact}
            </Typography>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
