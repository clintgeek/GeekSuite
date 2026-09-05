import React from 'react';
import { Box, Typography, Chip, Tooltip, alpha, useTheme } from '@mui/material';

/**
 * QuestPanel — threads as living objects (ideas #6). Active obligations,
 * quests, debts, secrets, and consequences the engine is tracking — with a
 * DORMANT cue when one has gone quiet, the same signal the GM context uses to
 * resurface it. Unresolved commitments never silently vanish here.
 */
const TYPE_META = {
  quest:       { icon: '⚔️',  label: 'Quest' },
  promise:     { icon: '🤝', label: 'Promise' },
  debt:        { icon: '💰', label: 'Debt' },
  secret:      { icon: '🤫', label: 'Secret' },
  hunt:        { icon: '🎯', label: 'Hunt' },
  consequence: { icon: '⚖️',  label: 'Consequence' },
  other:       { icon: '📜', label: 'Thread' },
};

export default function QuestPanel({ threads }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: `1px solid ${alpha(gold, 0.15)}` }}>
      <Typography variant="overline" sx={{ color: alpha(gold, 0.65), fontSize: '0.75rem', letterSpacing: '0.12em', display: 'block', mb: 1 }}>
        Open Threads · {threads.length}
      </Typography>
      {threads.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic', fontSize: '0.8rem' }}>
          No unresolved threads yet.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {threads.map((t) => {
            const meta = TYPE_META[t.type] || TYPE_META.other;
            return (
              <Box key={t.name} sx={{
                p: 1, borderRadius: 1.5,
                border: `1px solid ${t.dormant ? alpha(theme.palette.warning.main, 0.35) : alpha(gold, 0.12)}`,
                bgcolor: t.dormant ? alpha(theme.palette.warning.main, 0.04) : alpha(gold, 0.02),
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.2 }}>{meta.icon}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.2 }}>
                        {t.name}
                      </Typography>
                      {t.dormant && (
                        <Tooltip title={`Quiet for ${t.age} turns — the GM may resurface it`}>
                          <Chip size="small" label="dormant" color="warning" variant="outlined"
                            sx={{ textTransform: 'uppercase', fontWeight: 700 }} />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25, lineHeight: 1.45 }}>
                      {t.description}
                    </Typography>
                    {t.characterNames?.length > 0 && (
                      <Typography variant="caption" sx={{ color: alpha(gold, 0.6) }}>
                        {meta.label} · {t.characterNames.join(', ')}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
