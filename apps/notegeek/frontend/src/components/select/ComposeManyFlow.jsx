import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import ComposeDialog from '../editors/ComposeDialog';
import { COMPOSE_NOTES } from '../../graphql/archive';
import { CREATE_NOTE } from '../../graphql/mutations';
import { onNoteCreated } from '../../graphql/cacheUpdates';
import { useArchiveNotes } from '../../hooks/useArchiveNotes';
import { noteKey } from '../../hooks/useNoteSelection';
import { composedTitle, oldestFirst, skipSummary } from '../../utils/composeMany';

/**
 * Compose from several notes (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U3–U5).
 *
 * Mounted by the selection bar while it runs. It asks `composeNotes` for a
 * draft (which writes nothing), shows it in ComposeDialog, and on **Save as a
 * new note** creates ONE markdown note — titled from the draft's first `#`
 * heading, no tags (D3). Then, only after a successful save and only for the
 * notes that actually went in (`sources.used`), it offers to archive them.
 * Either answer opens the new note.
 *
 * Every refusal and error keeps the selection (`onClose`), so you can adjust
 * it and try again. `onDone` is the success exit: the selection goes.
 */
export default function ComposeManyFlow({ notes, onClose, onDone }) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [composeNotes] = useMutation(COMPOSE_NOTES);
  const [createNote] = useMutation(CREATE_NOTE, { update: onNoteCreated });
  const { archive } = useArchiveNotes();

  const ordered = useMemo(() => oldestFirst(notes), [notes]);
  const byId = useMemo(() => new Map(ordered.map((n) => [noteKey(n), n])), [ordered]);
  const [state, setState] = useState({ loading: true, markdown: '', stats: null, error: null, model: null, skipped: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null); // { id, used }
  const [archiving, setArchiving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const { data } = await composeNotes({ variables: { noteIds: ordered.map(noteKey) } });
        const result = data?.composeNotes;
        const reason = result?.provenance?.reason;
        const skipped = skipSummary(result?.sources?.skipped, byId);
        const base = { loading: false, markdown: '', stats: result?.stats || null, model: result?.provenance?.model || null, skipped };

        if (reason === 'not_enough_sources') {
          setState({ ...base, error: 'Compose needs at least two notes it can read. Select more notes, or different ones.' });
          return;
        }
        if (reason === 'content_too_long') {
          const total = result?.stats?.inputChars;
          setState({
            ...base,
            error: `That is more material than one compose can take${total ? ` (${total.toLocaleString()} characters)` : ''}. Select fewer notes.`,
          });
          return;
        }
        if (reason === 'degenerate_output') {
          setState({
            ...base,
            error: 'The model got stuck repeating itself, so that result was thrown away. '
              + 'Your notes are untouched — try again, and it may land on a better model.',
          });
          return;
        }
        if (!result?.markdown?.trim()) {
          setState({ ...base, error: 'Compose is unavailable right now — your notes are unchanged.' });
          return;
        }
        setState({ ...base, markdown: result.markdown, error: null, used: result?.sources?.used || [] });
      } catch (err) {
        setState({ loading: false, markdown: '', stats: null, model: null, skipped: '', error: err?.message || 'Could not compose these notes.' });
      }
    })();
  }, [composeNotes, ordered, byId]);

  const save = async () => {
    if (saving || !state.markdown) return;
    setSaving(true);
    try {
      const { data } = await createNote({
        variables: {
          title: composedTitle(state.markdown),
          content: state.markdown,
          type: 'markdown',
          tags: [],
        },
      });
      const id = data?.createNote?.id;
      if (!id) throw new Error('The new note came back without an id.');
      const used = (state.used || []).map(String);
      if (used.length) {
        setSaved({ id, used });
      } else {
        notify('Saved as a new note.', { tone: 'success' });
        onDone?.();
        navigate(`/notes/${id}`);
      }
    } catch (err) {
      notify(err?.message || 'Could not save the composed note.', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    const id = saved?.id;
    onDone?.();
    if (id) navigate(`/notes/${id}`);
  };

  const archiveSources = async () => {
    if (!saved || archiving) return;
    setArchiving(true);
    // Only `sources.used`: a skipped note was not composed, so archiving it
    // would hide material that is in no other note.
    await archive(saved.used);
    setArchiving(false);
    finish();
  };

  return (
    <ComposeDialog
      open
      sourceCount={ordered.length}
      loading={state.loading}
      markdown={state.markdown}
      stats={state.stats}
      error={state.error}
      model={state.model}
      skippedSummary={state.skipped}
      saving={saving}
      discardLabel={state.error ? 'Back to selection' : 'Discard'}
      onClose={() => { if (!saving) onClose?.(); }}
      onSaveAsNew={save}
      offer={saved ? {
        count: saved.used.length,
        busy: archiving,
        onArchive: archiveSources,
        onKeep: finish,
      } : undefined}
    />
  );
}
