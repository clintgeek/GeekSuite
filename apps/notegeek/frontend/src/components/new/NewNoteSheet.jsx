import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Collapse, Typography, useTheme } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { GeekSheet } from '@geeksuite/ui';
import { NEW_FRONT, NEW_MORE, newNotePath, noteTypeMeta } from '../notes/noteTypeMeta';
import { graphiteTokens } from '../../theme/tokens';
import { openImportPicker } from '../../store/importStore';

/**
 * One row of the New surface: glyph, name, a line of description. The first
 * (a plain note) is the primary action, so it gets the highlighter.
 */
export function NewEntry({ entryKey, onPick, primary = false }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const meta = noteTypeMeta(entryKey);
  const Icon = meta.Icon;
  const name = entryKey === 'markdown' ? 'New note' : meta.long;
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
 * NewNoteSheet — the phone's "New": a bottom sheet with the three front-door
 * entries (a note, a photo of a page, a sketch), "More" folding out Code
 * and Mind map, and "Import a Markdown file". Markdown is the default note;
 * rich text is not offered.
 */
function NewNoteSheet({ open, onClose }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [more, setMore] = useState(false);

  const pick = (key) => {
    // The file picker must open inside the tap (user activation), so it is
    // asked for before the sheet closes; the importer lives outside it.
    if (key === 'import') openImportPicker();
    onClose();
    setMore(false);
    if (key !== 'import') navigate(newNotePath(key));
  };

  return (
    <GeekSheet open={open} onClose={() => { setMore(false); onClose(); }} title="New">
      <Box role="list" aria-label="New" sx={{ display: 'flex', flexDirection: 'column', gap: '4px', pb: '8px' }}>
        {NEW_FRONT.map((key, i) => (
          <Box role="listitem" key={key}><NewEntry entryKey={key} onPick={pick} primary={i === 0} /></Box>
        ))}
        <Box role="listitem">
          <ButtonBase
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            aria-controls="new-more"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
              width: '100%',
              minHeight: 44,
              px: '12px',
              borderRadius: '8px',
              color: 'text.secondary',
              fontSize: '0.875rem',
              fontWeight: 500,
              '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
            }}
          >
            <ExpandMore
              aria-hidden
              sx={{
                fontSize: 20,
                transform: more ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms ease',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
            More: code, mind map
          </ButtonBase>
          <Collapse in={more} id="new-more">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', pt: '4px' }}>
              {NEW_MORE.map((key) => <NewEntry key={key} entryKey={key} onPick={pick} />)}
            </Box>
          </Collapse>
        </Box>
        <Box role="listitem"><NewEntry entryKey="import" onPick={pick} /></Box>
      </Box>
    </GeekSheet>
  );
}

export default NewNoteSheet;
