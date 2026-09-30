import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { CREATE_NOTE } from '../graphql/mutations';
import { onNoteCreated } from '../graphql/cacheUpdates';
import { saveErrorMessage } from '../utils/saveGuards';
import { ImportError, partitionImportFiles, readImportFile } from '../utils/importMarkdown';

const names = (files, max = 3) => {
  const shown = files.slice(0, max).map((f) => f.name || 'a file');
  return files.length > max ? `${shown.join(', ')} and ${files.length - max} more` : shown.join(', ');
};

/**
 * useNoteImport — files in, new Markdown notes out (DOCS/CONTEXT.md §9),
 * through the ordinary `createNote` and its cache rule, so the list shows
 * each new note without a refetch.
 *
 *   const { importFiles } = useNoteImport();
 *   await importFiles(fileList);   // → the created notes
 *
 * What the writer is told: anything skipped (not Markdown or text), anything
 * refused (too big, empty, a failed save), and what landed. A single file
 * opens its note; several stay put with "Imported N notes".
 */
export default function useNoteImport() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [createNote] = useMutation(CREATE_NOTE, { update: onNoteCreated });

  return {
    importFiles: useCallback(async (fileList) => {
      const all = Array.from(fileList || []);
      if (!all.length) return [];
      const { accepted, rejected } = partitionImportFiles(all);
      if (rejected.length) {
        notify(
          `Skipped ${names(rejected)}: only .md, .markdown and .txt files import.`,
          { tone: 'warning' },
        );
      }

      const created = [];
      const failed = [];
      // One at a time: the list's cache rule (onNoteCreated) and the tag
      // index refetch are per note, and a burst of parallel creates gains
      // nothing a writer would notice.
      for (const file of accepted) {
        try {
          const { title, content } = await readImportFile(file);
          const { data } = await createNote({ variables: { title, content, type: 'markdown', tags: [] } });
          if (data?.createNote?.id) created.push(data.createNote);
          else failed.push(`${file.name}: the server returned nothing.`);
        } catch (err) {
          failed.push(err instanceof ImportError ? err.message : `${file.name}: ${saveErrorMessage(err)}`);
        }
      }

      if (failed.length) {
        notify(
          failed.length === 1 ? failed[0] : `${failed.length} files were not imported. ${failed.join(' ')}`,
          { tone: 'error' },
        );
      }
      if (created.length === 1 && all.length === 1) {
        notify(`Imported “${created[0].title}”.`, { tone: 'success' });
        navigate(`/notes/${created[0].id}`);
      } else if (created.length) {
        notify(created.length === 1 ? 'Imported 1 note.' : `Imported ${created.length} notes.`, { tone: 'success' });
      }
      return created;
    }, [createNote, navigate, notify]),
  };
}
