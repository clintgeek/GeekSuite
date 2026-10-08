import { useQuery } from '@apollo/client';
import { NOTE_ARCHIVE_STATE } from '../graphql/archive';

/**
 * Is this note archived? Its own small query (graphql/archive.js), so a note
 * opened from a [[link]], a bookmark or history can say so. Writes from
 * archive/restore land on the same `Note:<id>` entity (onNotesArchived), so
 * the answer flips without a refetch. Unknown (loading, an older gateway) is
 * "not archived" — nothing is shown.
 */
export function useNoteArchiveState(noteId) {
  const { data } = useQuery(NOTE_ARCHIVE_STATE, {
    variables: { id: noteId },
    skip: !noteId,
    fetchPolicy: 'cache-and-network',
  });
  const note = data?.note;
  return { archived: Boolean(note?.archived), archivedAt: note?.archivedAt || null };
}

export default useNoteArchiveState;
