import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, ButtonBase, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  InputAdornment, TextField, Typography, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@apollo/client';
import { GET_NOTES, SEARCH_NOTES } from '../../graphql/queries';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';
import { formatRelativeTime, toDate } from '../../utils/dateUtils';
import { recentlyOpened } from '../../utils/recentNotes';
import TypeIcon from '../notes/TypeIcon';
import { normalizeNoteType } from '../notes/noteTypeMeta';

/** How many rows a section shows before the search box is the better tool. */
const SECTION_MAX = 8;

/**
 * The picker's sections, before anything is typed (req 5, decision 10):
 * in a 1:1 that person's earlier 1:1s, newest first, then the notes opened
 * most recently on this device, topped up with the most recently edited.
 * The note being written is never offered. Pure.
 */
export function referenceSections({ currentId, person, personNotes = [], opened = [], edited = [], max = SECTION_MAX }) {
  const seen = new Set(currentId ? [String(currentId)] : []);
  const take = (notes, limit) => {
    const rows = [];
    for (const note of notes) {
      const id = note && (note.id || note._id);
      if (!id || seen.has(String(id))) continue;
      seen.add(String(id));
      rows.push({ id: String(id), title: note.title || '', type: normalizeNoteType(note.type), at: note.createdAt || note.updatedAt || note.at || null });
      if (rows.length >= limit) break;
    }
    return rows;
  };
  const sections = [];
  if (person) {
    const newestFirst = [...personNotes].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    const rows = take(newestFirst, max);
    if (rows.length) sections.push({ key: 'person', label: `Earlier 1:1s with ${person.name}`, rows });
  }
  const recent = take([...opened, ...edited], max);
  if (recent.length) sections.push({ key: 'recent', label: 'Recent', rows: recent });
  return sections;
}

function Row({ row, onPick }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const when = row.at ? formatRelativeTime(toDate(row.at)) : '';
  return (
    <ButtonBase
      data-reference-option={row.id}
      onClick={() => onPick(row.id)}
      sx={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: 44,
        px: '12px', borderRadius: '6px', textAlign: 'left', justifyContent: 'flex-start',
        '&:hover, &:focus-visible': { bgcolor: g.hlSoft },
      }}
    >
      <TypeIcon type={row.type} size={16} />
      <Typography component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.title || 'Untitled'}
      </Typography>
      {when ? (
        <Typography component="span" sx={{ flexShrink: 0, fontSize: '0.75rem', color: 'text.secondary' }}>{when}</Typography>
      ) : null}
    </ButtonBase>
  );
}

/**
 * ReferencePicker — "which note do you want beside this one?"
 *
 * `person` is `{ tag, name }` when the note being written is a 1:1.
 * Mounted only while open (the page decides), so its queries cost nothing
 * until it is asked for.
 */
export default function ReferencePicker({ open, onClose, onPick, currentNoteId = null, person = null }) {
  const [find, setFind] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(find.trim()), 200);
    return () => clearTimeout(t);
  }, [find]);

  const { data: personData } = useQuery(GET_NOTES, {
    variables: { tag: person?.tag, limit: 30, sort: 'createdAt_desc' },
    skip: !open || !person?.tag,
    fetchPolicy: 'cache-and-network',
  });
  const { data: editedData, loading: loadingEdited } = useQuery(GET_NOTES, {
    variables: { limit: 12 },
    skip: !open,
    fetchPolicy: 'cache-and-network',
  });
  const { data: found, previousData, loading: searching, error: searchError } = useQuery(SEARCH_NOTES, {
    variables: { q: debounced },
    skip: !open || !debounced,
    fetchPolicy: 'cache-first',
  });

  const opened = useMemo(() => (open ? recentlyOpened() : []), [open]);
  const sections = useMemo(() => referenceSections({
    currentId: currentNoteId, person, personNotes: personData?.notes || [], opened, edited: editedData?.notes || [],
  }), [currentNoteId, person, personData, opened, editedData]);

  const results = useMemo(() => {
    if (!debounced) return null;
    const hits = (found || previousData)?.searchNotes || [];
    return referenceSections({ currentId: currentNoteId, edited: hits, max: 20 })[0]?.rows || [];
  }, [debounced, found, previousData, currentNoteId]);

  const pick = (id) => {
    setFind('');
    onPick(id);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="reference-picker-title"
      data-testid="reference-picker"
      // Near the top, where the pane will be, and clear of the keyboard.
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' }, '& .MuiDialog-paper': { mt: '48px' } }}
    >
      <DialogTitle id="reference-picker-title" sx={{ display: 'flex', alignItems: 'center', pr: '8px', pb: '8px', fontSize: '1rem', fontWeight: 600 }}>
        <Box component="span" sx={{ flex: 1 }}>Show a note above this one</Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ ...tapTarget44 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: '12px', pb: '12px' }}>
        <TextField
          fullWidth
          size="small"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Search all notes"
          inputProps={{ 'aria-label': 'Search all notes' }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: searching ? <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment> : null,
          }}
          sx={{ mb: '8px', '& .MuiInputBase-root': { minHeight: 44 } }}
        />
        <Box sx={{ maxHeight: '50vh', overflowY: 'auto' }} role="region" aria-label="Notes to show">
          {results ? (
            results.length ? results.map((row) => <Row key={row.id} row={row} onPick={pick} />) : (
              <Typography sx={{ px: '12px', py: '16px', fontSize: '0.875rem', color: 'text.secondary' }}>
                {searchError ? 'Search is not answering right now.' : searching ? 'Searching…' : `Nothing found for “${debounced}”.`}
              </Typography>
            )
          ) : sections.length ? sections.map((section) => (
            <Box key={section.key} data-reference-section={section.key} sx={{ mb: '8px' }}>
              <Typography component="h3" sx={{ px: '12px', py: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {section.label}
              </Typography>
              {section.rows.map((row) => <Row key={row.id} row={row} onPick={pick} />)}
            </Box>
          )) : (
            <Typography sx={{ px: '12px', py: '16px', fontSize: '0.875rem', color: 'text.secondary' }}>
              {loadingEdited ? 'Loading…' : 'No other notes yet.'}
            </Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
