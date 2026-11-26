import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { SKETCH_TRANSCRIPT } from '../../graphql/queries';
import { TRANSCRIBE_SKETCH, SAVE_SKETCH_TRANSCRIPT_EDIT } from '../../graphql/mutations';
import { sketchHasShapes } from '../../utils/sketchExport';
import { derivedNoteContent, derivedNoteTitle } from '../../utils/sketchToText';
import { carryCorrections, rememberCorrections } from '../../utils/transcriptCorrections';
import { saveErrorMessage } from '../../utils/saveGuards';

/** Release an object URL made for a preview, if there is one. */
export const revokeImage = (url) => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

/**
 * The "Convert handwriting to text" slice of the note editor. Also returns the
 * transcript pieces Send tasks shares (transcribeSketchMutation,
 * saveTranscriptEdit, freshTranscriptState, transcribeErrorMessage). Handlers
 * are recreated every render from the latest arguments, as in the page.
 */
export function useSketchConvert({
  content, title, tags, isHandwritten, apollo,
  savedNoteIdRef, handleSaveRef, dirtyRef, sketchApiRef, transcriptViewRef,
  setTranscriptView, settleSave, createNoteMutation, navigate, notify,
  setCompose, handleCompose,
}) {
  // ── Convert handwriting to text (DOCS/HANDWRITING.md §2) ──────────────
  //
  // Export the page, have it read, let the writer correct the reading, then
  // Compose it or keep it plain. Either way the result is a NEW markdown note
  // whose first line links back here. The sketch is never replaced: nothing
  // on this path calls updateNote or setContent.
  const transcribeRunRef = useRef(0);
  const [transcribeSketchMutation] = useMutation(TRANSCRIBE_SKETCH);
  const [saveTranscriptEdit] = useMutation(SAVE_SKETCH_TRANSCRIPT_EDIT);
  const [transcribe, setTranscribe] = useState(null);
  const canTranscribe = isHandwritten && sketchHasShapes(content);

  /**
   * The sketch's transcript state as the server sees it NOW — after a save
   * has just landed, `current` in the hook's copy can still describe the
   * sketch before it (2.8). Falls back to the hook's copy without a client.
   */
  const freshTranscriptState = async () => {
    const noteId = savedNoteIdRef.current;
    if (!apollo || !noteId) return transcriptViewRef.current;
    try {
      const { data: fresh } = await apollo.query({ query: SKETCH_TRANSCRIPT, variables: { noteId }, fetchPolicy: 'network-only' });
      const view = fresh?.sketchTranscript || null;
      if (view) setTranscriptView(view);
      return view || transcriptViewRef.current;
    } catch {
      return transcriptViewRef.current;
    }
  };

  const closeTranscribe = () => {
    transcribeRunRef.current += 1; // anything still in flight is now stale
    setTranscribe((t) => { revokeImage(t?.imageUrl); return null; });
  };

  const transcribeErrorMessage = (err) => {
    const status = err?.networkError?.statusCode;
    if (status === 413) return 'That page is too large for the server to accept (413). Your handwriting is unchanged.';
    if (err?.networkError && !err?.graphQLErrors?.length) return 'Could not reach the server. Your handwriting is unchanged.';
    return saveErrorMessage(err);
  };

  /**
   * The writer corrected the reading: keep the corrections as the sketch's
   * transcript (searchable, and never overwritten by automatic runs).
   * Best effort — Convert's own result never waits on it failing.
   */
  const keepTranscriptCorrections = async (t) => {
    const noteId = savedNoteIdRef.current;
    if (!noteId || !t?.text?.trim() || t.text === t.original) return;
    rememberCorrections(noteId, t.original, t.text); // carried into the next reading (2.11)
    try {
      const { data } = await saveTranscriptEdit({ variables: { noteId, text: t.text, forHash: t.forHash || undefined } });
      if (data?.saveSketchTranscriptEdit) setTranscriptView(data.saveSketchTranscriptEdit);
    } catch {
      // The new note is what the writer asked for; this is a bonus.
    }
  };

  const handleTranscribe = async ({ forceRead = false } = {}) => {
    const run = ++transcribeRunRef.current;
    const stale = () => run !== transcribeRunRef.current;

    setTranscribe((t) => {
      revokeImage(t?.imageUrl);
      return { open: true, stage: 'working', step: 'export', text: '', original: '', forHash: null, reused: null, error: null, model: null, imageUrl: null, saving: false };
    });

    // The new note links back to this sketch, and a stored reading is only
    // for the SAVED sketch: save first and wait for it (2.8), then ask the
    // server whether this exact page has been read already.
    const settled = await settleSave();
    if (stale()) return;
    const stored = settled ? await freshTranscriptState() : null;
    if (stale()) return;

    let exported;
    try {
      const api = sketchApiRef.current;
      if (!api) throw new Error('The page is still loading. Try again in a moment.');
      exported = await api.exportPng();
    } catch (err) {
      if (stale()) return;
      setTranscribe((t) => ({ ...t, stage: 'error', error: err?.message || 'Could not turn the page into an image.' }));
      return;
    }
    if (stale()) return;

    const imageUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(exported.blob) : null;

    // AUTO_TRANSCRIBE_SPEC.md §5: this exact sketch was already read (an
    // automatic run, an earlier Convert, or the writer's corrections). Show
    // that instead of paying again; "Transcribe again" is the explicit way
    // to spend a request. Only when nothing is unsaved: the stored reading is
    // for the SAVED sketch.
    if (!forceRead && settled && !dirtyRef.current && stored?.current && stored.text?.trim()) {
      const by = stored.edited || stored.source === 'user'
        ? 'Already transcribed · with your corrections'
        : `Already transcribed · ${stored.source === 'convert' ? 'by an earlier conversion' : 'automatically'}`;
      setTranscribe((t) => ({
        ...t, stage: 'review', step: 'read', imageUrl, text: stored.text, original: stored.text,
        forHash: stored.contentHash, reused: by, model: stored.edited ? null : stored.model,
      }));
      return;
    }
    setTranscribe((t) => ({ ...t, step: 'read', imageUrl, reused: null }));

    try {
      const { data } = await transcribeSketchMutation({
        variables: { image: exported.base64, mediaType: exported.mediaType, source: exported.form ? 'form' : undefined, noteId: savedNoteIdRef.current || undefined },
      });
      if (stale()) return;
      const result = data?.transcribeSketch;
      if (!result?.text?.trim()) {
        setTranscribe((t) => ({ ...t, stage: 'error', error: 'The model read nothing back from that page. Try again.' }));
        return;
      }
      setTranscribe((t) => ({ ...t, stage: 'review', text: carryCorrections(savedNoteIdRef.current, result.text), original: result.text, model: result.provenance?.model || null }));
      // The gateway keeps a paid reading as the sketch's transcript; show
      // that in the status line, and let Send tasks / the next Convert reuse
      // it instead of paying for the same page again (2.8).
      if (settled) freshTranscriptState();
    } catch (err) {
      if (stale()) return;
      setTranscribe((t) => ({ ...t, stage: 'error', error: transcribeErrorMessage(err) }));
    }
  };

  /** A new markdown note made from this sketch. Never an update to it. */
  const saveFromSketch = async (body, { composed }) => {
    if (!savedNoteIdRef.current) await handleSaveRef.current();
    const sketchId = savedNoteIdRef.current;
    if (!sketchId) {
      notify('Save this note first: the new note links back to it.', { tone: 'error' });
      return false;
    }
    try {
      const { data } = await createNoteMutation({
        variables: {
          title: derivedNoteTitle({ sketchTitle: title, body, composed }),
          content: derivedNoteContent({ sketchId, sketchTitle: title, body, composed }),
          type: 'markdown',
          tags,
        },
      });
      const created = data?.createNote;
      closeTranscribe();
      setCompose(null);
      notify('Saved as a new note. The handwriting is unchanged.', { tone: 'success' });
      if (created?.id) navigate(`/notes/${created.id}`);
      return true;
    } catch (err) {
      notify(saveErrorMessage(err), { tone: 'error' });
      return false;
    }
  };

  const handleTranscriptKeepPlain = async () => {
    if (!transcribe?.text?.trim()) return;
    setTranscribe((t) => ({ ...t, saving: true }));
    keepTranscriptCorrections(transcribe);
    const ok = await saveFromSketch(transcribe.text, { composed: false });
    if (!ok) setTranscribe((t) => (t ? { ...t, saving: false } : t));
  };

  const handleTranscriptCompose = () => {
    if (!transcribe?.text?.trim()) return;
    // Hidden, not closed: "Back to transcript" in Compose returns to it.
    keepTranscriptCorrections(transcribe);
    setTranscribe((t) => ({ ...t, open: false }));
    handleCompose(transcribe.text);
  };

  return {
    transcribe, setTranscribe, canTranscribe, closeTranscribe,
    handleTranscribe, saveFromSketch, handleTranscriptKeepPlain, handleTranscriptCompose,
    transcribeSketchMutation, saveTranscriptEdit, freshTranscriptState, transcribeErrorMessage,
  };
}
