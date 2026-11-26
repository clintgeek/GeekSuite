import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { DIAGRAM_SKETCH } from '../../graphql/mutations';
import { diagramNoteContent, diagramNoteTitle } from '../../utils/sketchToText';
import { parseMermaid } from '../../utils/mermaidLoader';
import { saveErrorMessage } from '../../utils/saveGuards';
import { revokeImage } from './useSketchConvert';

/** What a client says while the gateway does not know diagramSketch yet (deploy order). */
export const DIAGRAMS_NOT_YET = "Diagrams aren't available yet. Try again in a minute.";

/** The gateway is older than this client: it rejects the operation itself. */
export function isUnknownOperation(err) {
  return (err?.graphQLErrors || []).some((e) => e?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED'
    || /Cannot query field "diagramSketch"|Unknown type "SketchDiagram"/.test(e?.message || ''));
}

export function diagramErrorMessage(err) {
  if (isUnknownOperation(err)) return DIAGRAMS_NOT_YET;
  const status = err?.networkError?.statusCode;
  // An old gateway can also answer an unknown field with a 400.
  if (status === 400 && /diagramSketch/.test(JSON.stringify(err?.networkError?.result || ''))) return DIAGRAMS_NOT_YET;
  if (status === 413) return 'That page is too large for the server to accept (413). Your handwriting is unchanged.';
  if (err?.networkError && !err?.graphQLErrors?.length) return 'Could not reach the server. Your handwriting is unchanged.';
  return saveErrorMessage(err);
}

/**
 * "Turn into a diagram" (DOCS/HANDWRITING.md): export the page, have the
 * gateway draw it as a Mermaid flowchart, check it with Mermaid itself, and
 * let the writer review it. If `mermaid.parse` refuses the answer, the
 * gateway is asked once more with the error (`previous` + `problem`).
 * Saving makes a NEW Typed note that links back; the handwritten note is
 * never touched (nothing here calls updateNote or setContent).
 */
export function useSketchDiagram({
  title, tags, savedNoteIdRef, handleSaveRef, sketchApiRef, settleSave,
  createNoteMutation, navigate, notify,
}) {
  const runRef = useRef(0);
  const [diagramSketchMutation] = useMutation(DIAGRAM_SKETCH);
  const [diagram, setDiagram] = useState(null);

  const closeDiagram = () => {
    runRef.current += 1; // anything in flight is now stale
    setDiagram((d) => { revokeImage(d?.imageUrl); return null; });
  };

  const handleDiagram = async () => {
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    setDiagram((d) => {
      revokeImage(d?.imageUrl);
      return { open: true, stage: 'working', step: 'export', source: '', parseError: null, error: null, imageUrl: null, model: null, saving: false };
    });

    // The new note links back to this one: save first, and wait for it.
    await settleSave();
    if (stale()) return;

    let exported;
    try {
      const api = sketchApiRef.current;
      if (!api) throw new Error('The page is still loading. Try again in a moment.');
      exported = await api.exportPng();
    } catch (err) {
      if (stale()) return;
      setDiagram((d) => ({ ...d, stage: 'error', error: err?.message || 'Could not turn the page into an image.' }));
      return;
    }
    if (stale()) return;
    const imageUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(exported.blob) : null;
    setDiagram((d) => ({ ...d, step: 'read', imageUrl }));

    const page = { image: exported.base64, mediaType: exported.mediaType, source: exported.form ? 'form' : undefined };
    let answer;
    try {
      const { data } = await diagramSketchMutation({ variables: page });
      answer = data?.diagramSketch;
      if (!answer?.mermaid?.trim()) throw new Error('The model sent nothing back for that page. Try again.');
    } catch (err) {
      if (stale()) return;
      setDiagram((d) => ({ ...d, stage: 'error', error: diagramErrorMessage(err) }));
      return;
    }
    if (stale()) return;

    // Mermaid's own parse is the real check. One repair if it fails.
    setDiagram((d) => ({ ...d, step: 'check' }));
    let checked = await parseMermaid(answer.mermaid);
    if (stale()) return;
    if (!checked.ok) {
      try {
        const { data } = await diagramSketchMutation({ variables: { ...page, previous: answer.mermaid, problem: checked.error } });
        const fixed = data?.diagramSketch;
        if (fixed?.mermaid?.trim()) {
          const again = await parseMermaid(fixed.mermaid);
          answer = fixed;
          checked = again;
        }
      } catch {
        // The first answer stays; the review says it could not be drawn.
      }
      if (stale()) return;
    }
    setDiagram((d) => ({
      ...d,
      stage: 'review',
      source: answer.mermaid,
      parseError: checked.ok ? null : checked.error,
      model: answer.provenance?.model || null,
    }));
  };

  /** A new Typed note with the diagram. Never an update to the handwriting. */
  const saveDiagram = async () => {
    if (!diagram?.source?.trim()) return;
    setDiagram((d) => ({ ...d, saving: true }));
    if (!savedNoteIdRef.current) await handleSaveRef.current();
    const sketchId = savedNoteIdRef.current;
    if (!sketchId) {
      notify('Save this note first: the new note links back to it.', { tone: 'error' });
      setDiagram((d) => (d ? { ...d, saving: false } : d));
      return;
    }
    try {
      const { data } = await createNoteMutation({
        variables: {
          title: diagramNoteTitle({ sketchTitle: title }),
          content: diagramNoteContent({ sketchId, sketchTitle: title, mermaid: diagram.source }),
          type: 'markdown',
          tags,
        },
      });
      const created = data?.createNote;
      closeDiagram();
      notify('Saved as a new note. The handwriting is unchanged.', { tone: 'success' });
      if (created?.id) navigate(`/notes/${created.id}`);
    } catch (err) {
      notify(saveErrorMessage(err), { tone: 'error' });
      setDiagram((d) => (d ? { ...d, saving: false } : d));
    }
  };

  const setDiagramSource = (source) => setDiagram((d) => (d ? { ...d, source } : d));
  /** The dialog drew (or could not draw) the source as it stands. */
  const onDiagramDrawn = ({ ok, error }) => setDiagram((d) => (d ? { ...d, parseError: ok ? null : error } : d));

  return { diagram, handleDiagram, closeDiagram, saveDiagram, setDiagramSource, onDiagramDrawn };
}
