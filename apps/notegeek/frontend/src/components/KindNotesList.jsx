import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import NoteList from './NoteList';
import { useListWidth } from './notes/ListColumn';
import { useOneOnOneRoot } from './oneOnOne/useOneOnOne';
import { KIND_LISTS, kindListQuery } from '../utils/noteKinds';

/** What each kind's list says when it is empty. */
const EMPTY = {
  dailies: ['No daily pages yet', 'A day you write on in GeekDay shows up here.'],
  meetings: ['No meetings yet', 'Start one with New meeting.'],
};

/**
 * One kind's list (DOCS/NOTE_KINDS_SPEC.md):
 *
 *   notes      — everything that is not a daily page, a meeting or a 1:1
 *   dailies    — GeekDay's pages, newest day first
 *   meetings   — meeting pages, newest first, with New meeting at the top
 *   everything — the merged stream, as the Notes page was before 2026-11-24
 *
 * 1:1s are not here: their page is the 1:1 tag's (TagNotesList), which
 * already lists the people.
 *
 * Dailies and meetings are one type, written once and dated, so they drop
 * the type chips and sort by the day they were made.
 */
export default function KindNotesList({ kind = 'notes' }) {
  const listWidth = useListWidth();
  const oneOnOneRoot = useOneOnOneRoot();
  const list = KIND_LISTS[kind] || KIND_LISTS.notes;
  const query = kindListQuery(kind, oneOnOneRoot);
  const ofOneKind = Boolean(list.under);

  return (
    <Box data-kind-list={kind}>
      {/* The top bar already names the page; this row is only the way to start one. */}
      {list.newPath ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', maxWidth: listWidth, mx: 'auto', px: { xs: '12px', sm: '4px' }, pt: { xs: '8px', sm: '16px' } }}>
          <Button
            component={RouterLink}
            to={list.newPath}
            variant="contained"
            startIcon={<AddIcon />}
            data-testid="kind-new"
            sx={{ minHeight: 44, flexShrink: 0, borderRadius: '8px', fontWeight: 650 }}
          >
            {list.newLabel}
          </Button>
        </Box>
      ) : null}
      <NoteList
        // A different kind is a different list: its own sort, filter and paging.
        key={kind}
        under={query.under}
        notUnder={query.notUnder}
        defaultSort={ofOneKind ? 'created' : 'updated'}
        typeFilters={!ofOneKind}
        noun={list.noun}
        emptyTitle={EMPTY[kind]?.[0]}
        emptyDescription={EMPTY[kind]?.[1]}
      />
    </Box>
  );
}
