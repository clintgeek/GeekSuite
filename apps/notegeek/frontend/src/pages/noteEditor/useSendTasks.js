import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { CREATE_TODO_TASK, RECORD_SKETCH_TASKS_SENT } from '../../graphql/mutations';
import { taskInputFor, sendTaskRows, sentKeysFor, applyLineEdits } from '../../utils/journalLines';
import { taskClientId } from '../../utils/taskClientId';
import { personOfNote, personTag } from '../../utils/oneOnOne';

/**
 * The "Journal lines -> TodoGeek" slice of the note editor. Shares the
 * transcript pieces with useSketchConvert (passed in). Handlers are recreated
 * every render from the latest arguments, as in the page.
 */
export function useSendTasks({
  title, savedNoteIdRef, tagsRef, oneOnOneTagRef, sketchApiRef, settleSave,
  freshTranscriptState, transcribeSketchMutation, transcribeErrorMessage,
  saveTranscriptEdit, setTranscriptView, notify,
}) {
  // ── Journal lines → TodoGeek (DOCS/BUJO_HANDWRITING.md) ────────────────
  // The page read as a bullet journal. Uses the stored transcript when it is
  // for exactly this sketch (no request spent); otherwise reads the page the
  // way Convert does. Tasks are TodoGeek's own createTask, built by its own
  // grammar. The sketch is never changed; sent lines are remembered so they
  // are not offered twice.
  const [createTodoTask] = useMutation(CREATE_TODO_TASK);
  const [recordTasksSent] = useMutation(RECORD_SKETCH_TASKS_SENT);
  const [sendTasks, setSendTasks] = useState(null);
  const sendTasksRunRef = useRef(0);

  const rowsFromText = (text, sentKeys = []) => sendTaskRows(text, sentKeys);

  const openSendTasks = async () => {
    const run = ++sendTasksRunRef.current;
    const stale = () => run !== sendTasksRunRef.current;
    setSendTasks({ open: true, stage: 'working', rows: [], error: null, sending: false, result: null, transcript: '', forHash: null, writtenAt: null });

    // Save first and wait (2.8): a stored reading is for the SAVED sketch,
    // and the lines sent are remembered against this note's id.
    const settled = await settleSave();
    if (stale()) return;
    const stored = settled ? await freshTranscriptState() : null;
    if (stale()) return;
    if (settled && stored?.current && stored.text?.trim()) {
      setSendTasks((t) => (t ? {
        ...t, stage: 'review', rows: rowsFromText(stored.text, stored.sentTaskKeys || []),
        transcript: stored.text, forHash: stored.contentHash || null, writtenAt: stored.at || null,
      } : t));
      return;
    }
    try {
      const api = sketchApiRef.current;
      if (!api) throw new Error('The sketch is still loading. Try again in a moment.');
      const exported = await api.exportPng();
      const { data } = await transcribeSketchMutation({
        variables: { image: exported.base64, mediaType: exported.mediaType, source: exported.form ? 'form' : undefined, noteId: savedNoteIdRef.current || undefined },
      });
      if (stale()) return;
      const text = data?.transcribeSketch?.text || '';
      // The gateway kept that reading as the transcript: the status line
      // and the next Convert can use it rather than pay again.
      const after = settled ? await freshTranscriptState() : null;
      if (stale()) return;
      setSendTasks((t) => (t ? {
        ...t, stage: 'review', rows: rowsFromText(text, after?.sentTaskKeys || stored?.sentTaskKeys || []),
        transcript: text, forHash: after?.current ? after.contentHash || null : null, writtenAt: null,
      } : t));
    } catch (err) {
      if (stale()) return;
      setSendTasks((t) => (t ? { ...t, stage: 'error', error: err?.graphQLErrors?.length || err?.networkError ? transcribeErrorMessage(err) : (err?.message || 'Could not read the page.') } : t));
    }
  };

  const closeSendTasks = () => {
    sendTasksRunRef.current += 1;
    setSendTasks(null);
  };

  /**
   * Words the writer corrected in the Send dialog become corrections to the
   * sketch's transcript (1.11), the same as Convert's review: "Bbo" fixed to
   * "Bob" stays fixed, and a later reading of the page matches the line that
   * was sent. Called by the dialog on Send, with `[{ line, from, to }]`.
   * Best effort — the tasks are what was asked for.
   */
  const pendingCorrectionsRef = useRef(null);
  const handleSendCorrections = (edits) => {
    pendingCorrectionsRef.current = edits && edits.length ? edits : null;
  };

  const saveSendCorrections = async (edits, sketchId) => {
    const base = sendTasks?.transcript;
    if (!edits || !sketchId || !base) return;
    const corrected = applyLineEdits(base, edits);
    if (!corrected || corrected === base) return;
    try {
      const { data } = await saveTranscriptEdit({
        variables: { noteId: sketchId, text: corrected, forHash: sendTasks?.forHash || undefined },
      });
      if (data?.saveSketchTranscriptEdit) setTranscriptView(data.saveSketchTranscriptEdit);
    } catch {
      // The corrections are a bonus; the tasks went (or did not) on their own.
    }
  };

  const handleSendTasks = async ({ now: anchor = null } = {}) => {
    const chosen = (sendTasks?.rows || []).filter((r) => r.on && r.text.trim());
    if (!chosen.length) return;
    if (!savedNoteIdRef.current) await settleSave();
    const sketchId = savedNoteIdRef.current;
    const edits = pendingCorrectionsRef.current;
    pendingCorrectionsRef.current = null;
    setSendTasks((t) => ({ ...t, sending: true }));
    const now = anchor instanceof Date ? anchor : new Date();
    const sentRows = [];
    let failed = 0;
    // One at a time, in page order: TodoGeek lists them in the order they arrive.
    for (const row of chosen) {
      // A 1:1's tasks carry the person's tag, so they show as open with them (req 3).
      const person = personOfNote(tagsRef.current, oneOnOneTagRef.current);
      const input = taskInputFor(row, {
        now, today: new Date(), sketch: sketchId ? { id: sketchId, title } : null, origin: window.location.origin,
        tags: person ? [personTag(oneOnOneTagRef.current, person)] : [],
      });
      if (!input) { failed += 1; continue; }
      try {
        // C1: the same line of the same sketch always carries the same
        // clientId, so a retry (or a second Send of a line that went) returns
        // the task TodoGeek already has instead of making another.
        const clientId = sketchId ? await taskClientId(sketchId, row.key) : null;
        await createTodoTask({ variables: clientId ? { ...input, clientId } : input });
        sentRows.push(row);
      } catch {
        failed += 1;
      }
    }
    if (edits && sketchId) await saveSendCorrections(edits, sketchId);
    const sentKeys = sentRows.map((r) => r.key);
    if (sentRows.length && sketchId) {
      try {
        // As read AND as sent (journalLines.sentKeysFor), so a corrected or
        // re-read line is still known to have gone (1.11).
        const keys = [...new Set(sentRows.flatMap((r) => sentKeysFor(r)))];
        const { data } = await recordTasksSent({ variables: { noteId: sketchId, keys } });
        if (data?.recordSketchTasksSent) setTranscriptView(data.recordSketchTasksSent);
      } catch {
        // The tasks are in TodoGeek; only the "already sent" memory was lost.
      }
    }
    const todoGeekUrl = window.location.hostname.includes('notegeek')
      ? `${window.location.protocol}//${window.location.hostname.replace('notegeek', 'todogeek')}/today`
      : null;
    setSendTasks((t) => (t ? {
      ...t,
      sending: false,
      stage: sentKeys.length ? 'done' : 'review',
      error: null,
      rows: t.rows.map((r) => (sentKeys.includes(r.key) ? { ...r, sent: true, on: false } : r)),
      result: { sent: sentKeys.length, failed, todoGeekUrl },
    } : t));
    if (!sentKeys.length) notify('Nothing was added to TodoGeek. Try again in a moment.', { tone: 'error' });
  };

  return {
    sendTasks, setSendTasks, openSendTasks, closeSendTasks,
    handleSendCorrections, handleSendTasks,
  };
}
