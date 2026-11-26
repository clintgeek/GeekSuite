import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import { NEW_FRONT, NEW_FRONT_PEN, NEW_PAGES, ONE_ON_ONE_ENTRY, newNotePath, noteTypeMeta } from '../notes/noteTypeMeta';
import { usePhoneLayout } from '../../hooks/useNoteFormFactor';
import { graphiteTokens } from '../../theme/tokens';
import { openImportPicker } from '../../store/importStore';
import { openOneOnOnePicker } from '../../store/oneOnOneStore';

/**
 * One row of the New surface: glyph, name, a line of description. The first
 * is the primary action, so it gets the highlighter.
 */
export function NewEntry({ entryKey, onPick, primary = false }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const meta = noteTypeMeta(entryKey);
  const Icon = meta.Icon;
  const name = meta.long;
  return (
    <ButtonBase
      data-new-entry={entryKey}
      onClick={() => onPick(entryKey)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '12px',
        width: '100%',
        minHeight: 56,
        px: '12px',
        py: '8px',
        borderRadius: '8px',
        textAlign: 'left',
        bgcolor: primary ? g.hl : 'transparent',
        color: primary ? g.onHl : 'text.primary',
        '&:hover': { bgcolor: primary ? g.hl : g.paper },
        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 22, color: primary ? g.onHl : 'text.secondary', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'inherit', lineHeight: 1.3 }}>{name}</Typography>
        <Typography component="div" sx={{ fontSize: '0.8125rem', color: primary ? g.onHl : 'text.secondary', lineHeight: 1.35 }}>
          {meta.description}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

/**
 * NewNoteSheet — "New" on a phone and on the tablet rail: the three
 * front-door entries (type a note, write by hand, a photo of a page), the
 * two pages written every day (1:1 and Meeting notes, both handwritten), and
 * "Import a Markdown file". Typing leads on a phone, the pen on a tablet.
 */
function NewNoteSheet({ open, onClose }) {
  const navigate = useNavigate();
  const front = usePhoneLayout() ? NEW_FRONT : NEW_FRONT_PEN;

  const pick = (key) => {
    // A 1:1 is a handwritten page for one person: ask who (DOCS/ONE_ON_ONE_SPEC.md req 1).
    if (key === ONE_ON_ONE_ENTRY.key) { onClose(); openOneOnOnePicker(); return; }
    // The file picker must open inside the tap (user activation), so it is
    // asked for before the sheet closes; the importer lives outside it.
    if (key === 'import') openImportPicker();
    onClose();
    if (key !== 'import') navigate(newNotePath(key));
  };

  return (
    <GeekSheet open={open} onClose={onClose} title="New">
      <Box role="list" aria-label="New" sx={{ display: 'flex', flexDirection: 'column', gap: '4px', pb: '8px' }}>
        {front.map((key, i) => (
          <Box role="listitem" key={key}><NewEntry entryKey={key} onPick={pick} primary={i === 0} /></Box>
        ))}
        {NEW_PAGES.map((key) => (
          <Box role="listitem" key={key}><NewEntry entryKey={key} onPick={pick} /></Box>
        ))}
        <Box role="listitem"><NewEntry entryKey="import" onPick={pick} /></Box>
      </Box>
    </GeekSheet>
  );
}

export default NewNoteSheet;
