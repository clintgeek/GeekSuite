/**
 * "Save view" for the library: the shared SaveViewDialog bound to
 * `saveGameFilter`. It saves the WHOLE GameFilterInput as `filter` plus
 * `sortBy`/`sortDir` (DOCS/TAGS_AND_FILTERS.md §B1 "Saved filters"); the view
 * then lives in the sidebar under Shelves.
 */
import React from 'react';
import { useMutation } from '@apollo/client';
import { SaveViewDialog } from '@geeksuite/collection';
import { SAVE_GAME_FILTER } from '../graphql/mutations';
import { SORT_LABELS } from '../utils/libraryFilter';

const savedMessage = (name) => `Saved “${name}”. It's in the sidebar under Shelves.`;

export default function SaveLibraryView({ open, onClose, filterInput, sort, dir, chips = [] }) {
  const [save] = useMutation(SAVE_GAME_FILTER);
  const onSave = (name) =>
    save({
      variables: {
        input: {
          name,
          filter: filterInput ?? {},
          sortBy: sort,
          sortDir: sort === 'random' ? 'asc' : dir,
        },
      },
    });
  return (
    <SaveViewDialog
      open={open}
      onClose={onClose}
      onSave={onSave}
      chips={chips}
      fallbackName={SORT_LABELS[sort] ?? 'My view'}
      savedMessage={savedMessage}
    />
  );
}
