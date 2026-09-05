import React from 'react';
import {
  Drawer, Box, Typography, IconButton, Divider, Chip, alpha, useTheme,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { buildJournal, getClosedThreads } from '../../game/projections';

/**
 * JournalDrawer — what the CHARACTER knows (ideas #7), not the raw transcript.
 * Public canon plus the player's own secrets, grouped as People / Places /
 * Events / Details, followed by settled threads. This is the persistence
 * problem made legible: a durable record of what you've established, so a
 * long campaign stays legible to the player, not just the engine.
 */
const SECTIONS = [
  { key: 'people', title: 'People', icon: '👤' },
  { key: 'places', title: 'Places', icon: '🗺️' },
  { key: 'events', title: 'Events', icon: '⚡' },
  { key: 'details', title: 'Details', icon: '📎' },
];

export default function JournalDrawer({ open, onClose, story }) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const journal = buildJournal(story);
  const settled = getClosedThreads(story);
  const totalKnown = SECTIONS.reduce((n, s) => n + journal[s.key].length, 0);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, maxWidth: '100%' } }}>
      {/* Full-width on a phone already; the inset keeps the last entry clear
          of the home indicator now that <body> no longer pads it. */}
      <Box sx={{
        p: 2, pb: { xs: 'calc(16px + env(safe-area-inset-bottom))', sm: 2 },
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box>
            <Typography variant="overline" sx={{ color: alpha(gold, 0.6) }}>Your Character Knows</Typography>
            <Typography variant="h4" sx={{ lineHeight: 1.1 }}>Journal</Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: 'text.secondary' }}><CloseIcon /></IconButton>
        </Box>
        <Divider sx={{ borderColor: alpha(gold, 0.15), mb: 1.5 }} />

        <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
          {totalKnown === 0 && settled.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
              Nothing recorded yet. As you learn and establish facts, they'll be gathered here.
            </Typography>
          )}

          {SECTIONS.map((s) => {
            const entries = journal[s.key];
            if (entries.length === 0) return null;
            return (
              <Box key={s.key} sx={{ mb: 2 }}>
                <Typography sx={{ fontFamily: '"Cinzel", serif', fontSize: '0.85rem', fontWeight: 600, color: gold, mb: 0.5 }}>
                  {s.icon} {s.title}
                </Typography>
                {entries.map((e, i) => {
                  // Provenance: who put this in the record, and when.
                  const prov = e.source === 'player' ? { label: `You · T${e.turn ?? '?'}`, color: theme.palette.success.main }
                    : e.source === 'narrator' ? { label: `Narrator · T${e.turn ?? '?'}`, color: gold }
                    : e.source === 'setup' ? { label: 'Opening', color: theme.palette.info.main }
                    : null;
                  return (
                    <Box key={i} sx={{ display: 'flex', gap: 0.75, py: 0.35, alignItems: 'flex-start' }}>
                      <Typography sx={{ color: alpha(gold, 0.4), fontSize: '0.8rem', lineHeight: 1.6 }}>—</Typography>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                          {e.text}
                          {e.secret && (
                            <Chip size="small" label="secret" color="warning" variant="outlined"
                              sx={{ ml: 0.75, textTransform: 'uppercase', fontWeight: 700 }} />
                          )}
                        </Typography>
                        {prov && (
                          <Typography variant="caption" sx={{
                            color: alpha(prov.color, 0.75),
                            fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.04em',
                          }}>
                            {prov.label}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })}

          {settled.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Divider sx={{ borderColor: alpha(gold, 0.1), my: 1.5 }} />
              <Typography sx={{ fontFamily: '"Cinzel", serif', fontSize: '0.85rem', fontWeight: 600, color: alpha(gold, 0.7), mb: 0.5 }}>
                ✓ Settled Threads
              </Typography>
              {settled.map((t, i) => (
                <Box key={i} sx={{ py: 0.35 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.secondary' }}>
                    {t.name} <Chip size="small" label={t.status} sx={{ ml: 0.75, textTransform: 'uppercase' }} />
                  </Typography>
                  {t.resolution && (
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.disabled', fontStyle: 'italic' }}>
                      {t.resolution}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
