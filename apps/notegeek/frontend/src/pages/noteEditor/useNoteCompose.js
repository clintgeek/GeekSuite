import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { COMPOSE_NOTE } from '../../graphql/mutations';

/**
 * The "Compose" slice of the note editor: build a document out of this note's
 * scraps, then save it as a new note or replace the body. Handlers are
 * recreated every render from the latest arguments, as they were in the page.
 */
export function useNoteCompose({
  noteType, content, title, tags, savedNoteId,
  createNoteMutation, updateNoteMutation, navigate, notify,
  setContent, setNoteType, setDirty, setSaveError, setLastSavedAt,
}) {
  // ── Compose ─────────────────────────────────────────────────────────────
  //
  // Build a document out of the scraps in this note. Nothing is written until
  // the result has been seen: a compose is lossy by design, and this note may
  // be the only copy of material pasted in from a chat or an email.
  const [composeNoteMutation, { loading: isComposing }] = useMutation(COMPOSE_NOTE);
  const [compose, setCompose] = useState(null);

  /**
   * Types Compose can read.
   *
   * `text` is TipTap HTML, so the markup is stripped before it goes out — the
   * model should see the writing, not the tags, and tags are most of the
   * tokens. `code` is already plain. A null type is the app's old default and
   * behaves as text (six of sixteen live notes carry one). `mindmap` and
   * `handwritten` are excluded: their content is not prose.
   */
  const COMPOSABLE = ['text', 'markdown', 'code', null, undefined];
  const canCompose = COMPOSABLE.includes(noteType);

  const plainTextForCompose = () => {
    if (noteType !== 'text' && noteType !== null && noteType !== undefined) return content;
    // A parser, not a regex: stripping tags by pattern mangles anything
    // containing a literal `<`, which code fragments routinely do.
    const doc = new DOMParser().parseFromString(content || '', 'text/html');
    return (doc.body?.textContent || '').trim();
  };

  /**
   * `override` is the handwriting path's reviewed transcript
   * (DOCS/HANDWRITING.md §2): Compose reads that instead of this note's body,
   * and the result can only become a new note (`origin: 'sketch'`).
   */
  const handleCompose = async (override) => {
    const fromSketch = typeof override === 'string';
    const origin = fromSketch ? 'sketch' : 'note';
    const source = fromSketch ? override : plainTextForCompose();
    if (!source || !source.trim() || isComposing) return;
    const show = (state) => setCompose({ ...state, origin });
    show({ open: true, loading: true, markdown: '', stats: null, error: null });
    try {
      const { data } = await composeNoteMutation({ variables: { content: source } });
      const result = data?.composeNote;
      const reason = result?.provenance?.reason;

      if (reason === 'content_too_long') {
        show({
          open: true, loading: false, markdown: '', stats: result?.stats || null,
          error: 'That is more material than one compose can take. Split it across two notes and compose each.',
        });
        return;
      }
      if (reason === 'degenerate_output') {
        // The gateway threw the answer away because it was a loop, not a
        // document. Say what happened and that retrying is worth a try —
        // routing picks again, so a second attempt is not the same attempt.
        show({
          open: true, loading: false, markdown: '', stats: result?.stats || null,
          error: 'The model got stuck repeating itself, so that result was thrown away. '
            + 'Your note is untouched — try again, and it may land on a better model.',
          model: result?.provenance?.model || null,
        });
        return;
      }
      if (!result?.markdown?.trim()) {
        show({
          open: true, loading: false, markdown: '', stats: result?.stats || null,
          error: 'Compose is unavailable right now — your note is unchanged.',
        });
        return;
      }
      show({
        open: true, loading: false, markdown: result.markdown, stats: result.stats, error: null,
        model: result?.provenance?.model || null,
      });
    } catch (err) {
      show({
        open: true, loading: false, markdown: '', stats: null,
        error: err?.message || 'Could not compose this note.',
      });
    }
  };

  /** The safe path: a new markdown note, source left exactly as it was. */
  const handleComposeSaveAsNew = async (markdown) => {
    setCompose(null);
    try {
      const { data } = await createNoteMutation({
        variables: {
          title: title ? `${title} (composed)` : 'Composed note',
          content: markdown,
          type: 'markdown',
          tags,
        },
      });
      const created = data?.createNote;
      notify('Saved as a new note.', { tone: 'success' });
      if (created?.id) navigate(`/notes/${created.id}`);
    } catch (err) {
      notify(err?.message || 'Could not save the composed note.', { tone: 'error' });
    }
  };

  /**
   * Replace this note's body with the composed document.
   *
   * Safe only because every note now carries version history — this lands as
   * one `compose` entry in it and is undoable. It would have been the single
   * irreversible action in the app otherwise.
   */
  const handleComposeReplace = async (markdown) => {
    setCompose(null);
    setContent(markdown);
    setNoteType('markdown');
    setDirty(true);
    try {
      if (savedNoteId) {
        await updateNoteMutation({
          variables: {
            id: savedNoteId,
            title,
            content: markdown,
            type: 'markdown',
            tags,
            changeReason: 'compose',
          },
        });
        // The server has it now, so the editor is clean again. Leaving it
        // dirty would have the unmount flush re-save the same text on the way
        // out — harmless, but it also leaves a false "unsaved" on screen.
        setDirty(false);
        setSaveError(null);
        setLastSavedAt(new Date());
        notify('Replaced. The previous version is in History.', { tone: 'success' });
      } else {
        // An unsaved note has nothing to replace server-side yet. The text is
        // on screen and dirty, so the ordinary autosave (or Cmd/Ctrl+S, or
        // "Save now" in the ⋯ menu) writes it.
        notify('Composed. It saves like any other edit.', { tone: 'success' });
      }
    } catch (err) {
      notify(err?.message || 'Could not replace the note.', { tone: 'error' });
    }
  };

  return {
    compose, setCompose, isComposing, canCompose,
    handleCompose, handleComposeSaveAsNew, handleComposeReplace,
  };
}
