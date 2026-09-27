import React from 'react';
import { Box, Typography, Tooltip, alpha, useTheme } from '@mui/material';
import { GeekEmptyState } from '@geeksuite/ui';
import PanelShell from './PanelShell';
import Tag from '../primitives/Tag';
import { fonts } from '../../theme/theme';

/**
 * QuestPanel — threads as living objects (ideas #6). Active obligations,
 * quests, debts, secrets, and consequences the engine is tracking — with a
 * DORMANT cue when one has gone quiet, the same signal the GM context uses to
 * resurface it. Unresolved commitments never silently vanish here.
 */
const TYPE_META = {
  quest:       { glyph: '⚔', label: 'Quest' },
  promise:     { glyph: '✋', label: 'Promise' },
  debt:        { glyph: '⚖', label: 'Debt' },
  secret:      { glyph: '✦', label: 'Secret' },
  hunt:        { glyph: '➶', label: 'Hunt' },
  consequence: { glyph: '☍', label: 'Consequence' },
  other:       { glyph: '❧', label: 'Thread' },
};

export default function QuestPanel({ threads }) {
  const theme = useTheme();
  const c = theme.palette.candle;

  return (
    <PanelShell title={`Open Threads · ${threads.length}`}>
      {threads.length === 0 ? (
        <GeekEmptyState
          compact
          align="start"
          description="No unresolved threads yet."
          descriptionSx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.9375rem' }}
          sx={{ py: 0 }}
        />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {threads.map((t) => {
            const meta = TYPE_META[t.type] || TYPE_META.other;
            return (
              <Box component="li" key={t.name} sx={{
                p: 2, borderRadius: '4px', display: 'flex', gap: 2, alignItems: 'flex-start',
                border: `1px solid ${t.dormant ? alpha(c.tone.warn, 0.55) : c.rule}`,
                bgcolor: t.dormant ? alpha(c.tone.warn, 0.05) : c.raised,
              }}>
                <Typography aria-hidden="true" sx={{ fontFamily: fonts.display, fontSize: '1rem', lineHeight: 1.3, color: c.accentLabel, width: 16, textAlign: 'center', flexShrink: 0 }}>
                  {meta.glyph}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontFamily: fonts.display, fontSize: '0.9rem', fontWeight: 700, lineHeight: 1.3 }}>
                      {t.name}
                    </Typography>
                    {t.dormant && (
                      <Tooltip title={`Quiet for ${t.age} turns — the GM may resurface it`}>
                        <Tag tone="warn">dormant</Tag>
                      </Tooltip>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
                    {t.description}
                  </Typography>
                  <Typography sx={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: c.accentLabel, mt: 1 }}>
                    {meta.label}{t.characterNames?.length > 0 ? ` · ${t.characterNames.join(', ')}` : ''}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </PanelShell>
  );
}
