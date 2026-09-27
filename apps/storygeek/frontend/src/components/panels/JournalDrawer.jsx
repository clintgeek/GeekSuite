import React from 'react';
import { Drawer, Box, Typography, IconButton, useTheme } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { GeekEmptyState } from '@geeksuite/ui';
import { buildJournal, getClosedThreads } from '../../game/projections';
import WaxSeal from '../primitives/WaxSeal';
import Tag from '../primitives/Tag';
import { PanelLabel } from './PanelShell';
import { fonts } from '../../theme/theme';

/**
 * JournalDrawer — what the CHARACTER knows (ideas #7), not the raw transcript.
 * Public canon plus the player's own secrets, grouped as People / Places /
 * Events / Details, followed by settled threads. This is the persistence
 * problem made legible: a durable record of what you've established, so a
 * long campaign stays legible to the player, not just the engine.
 *
 * Drawn as the character's own notebook: parchment leaf, entries with the
 * same wax-seal provenance the canon scroll uses.
 */
const SECTIONS = [
  { key: 'people', title: 'People', glyph: '☙' },
  { key: 'places', title: 'Places', glyph: '⌂' },
  { key: 'events', title: 'Events', glyph: '✧' },
  { key: 'details', title: 'Details', glyph: '❧' },
];

export default function JournalDrawer({ open, onClose, story }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const journal = buildJournal(story);
  const settled = getClosedThreads(story);
  const totalKnown = SECTIONS.reduce((n, s) => n + journal[s.key].length, 0);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100%', bgcolor: c.page, borderLeft: `1px solid ${c.pageEdge}` } }}>
      {/* Full-width on a phone already; the inset keeps the last entry clear
          of the home indicator now that <body> no longer pads it. */}
      <Box sx={{
        p: 4, pb: { xs: 'calc(16px + env(safe-area-inset-bottom))', sm: 4 },
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, pb: 3, borderBottom: `1px solid ${c.rule}` }}>
          <Box>
            <PanelLabel>Your character knows</PanelLabel>
            <Typography variant="h3" component="h2" sx={{ lineHeight: 1.1, mt: 0.5 }}>Journal</Typography>
          </Box>
          <IconButton aria-label="Close journal" onClick={onClose} sx={{ width: 44, height: 44, color: 'text.secondary', mr: -1 }}><CloseIcon /></IconButton>
        </Box>

        {/* A scroll box owes a keyboard route in (axe scrollable-region-focusable). */}
        <Box tabIndex={0} role="region" aria-label="Journal entries" sx={{ flex: 1, overflowY: 'auto', pr: 1, '&:focus-visible': { outline: `2px solid ${c.accent}`, outlineOffset: 2 } }}>
          {totalKnown === 0 && settled.length === 0 && (
            <GeekEmptyState
              align="start"
              description="Nothing recorded yet. As you learn and establish facts, they'll be gathered here."
              descriptionSx={{ color: 'text.secondary', fontStyle: 'italic' }}
              sx={{ py: 0 }}
            />
          )}

          {SECTIONS.map((s) => {
            const entries = journal[s.key];
            if (entries.length === 0) return null;
            return (
              <Box component="section" key={s.key} sx={{ mb: 5 }}>
                <Typography component="h3" sx={{ fontFamily: fonts.display, fontSize: '1rem', fontWeight: 700, color: c.accent, mb: 1.5, display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
                  <span aria-hidden="true">{s.glyph}</span> {s.title}
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {entries.map((e, i) => (
                    <Box component="li" key={i} sx={{ py: 2, borderTop: i === 0 ? 'none' : `1px dashed ${c.rule}` }}>
                      <Typography sx={{ fontSize: '1rem', lineHeight: 1.55 }}>
                        {e.text}
                        {e.secret && <Tag tone="warn" sx={{ ml: 1.5 }}>secret</Tag>}
                      </Typography>
                      {/* Provenance: who put this in the record, and when. */}
                      {['player', 'narrator', 'setup'].includes(e.source) && (
                        <WaxSeal source={e.source} turn={e.source === 'setup' ? null : (e.turn ?? '?')} size={18} sx={{ mt: 1 }} />
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            );
          })}

          {settled.length > 0 && (
            <Box component="section" sx={{ mb: 4, pt: 4, borderTop: `1px solid ${c.rule}` }}>
              <Typography component="h3" sx={{ fontFamily: fonts.display, fontSize: '1rem', fontWeight: 700, color: c.accentLabel, mb: 1.5 }}>
                ✓ Settled Threads
              </Typography>
              {settled.map((t, i) => (
                <Box key={i} sx={{ py: 1.5 }}>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.secondary', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {t.name} <Tag>{t.status}</Tag>
                  </Typography>
                  {t.resolution && (
                    <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', fontStyle: 'italic', mt: 0.5 }}>
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
