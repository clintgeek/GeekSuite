import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import NoteEditorPage from './NoteEditorPage';

/**
 * The editor's route element, for both `/notes/new` and `/notes/:id/edit`
 * (review 2026-11, 1.20).
 *
 * The key decides when the editor is a NEW page:
 *   - `/notes/new` is keyed on the history entry, so "New note" while already
 *     on a new note (autosaved or not) starts a fresh one. It used to keep
 *     editing the old one — the wrapper's key only bumped on mount.
 *   - After the first autosave the editor replaces the address with
 *     `/notes/<id>/edit` and passes its key along in `location.state`; the
 *     same key here means React keeps the same editor — no remount, no lost
 *     caret, no reload of the sketch — while a reload or Back now lands on
 *     the real note.
 */
export default function NoteEditorRoute() {
  const { id } = useParams();
  const location = useLocation();
  const carried = location.state && typeof location.state.editorKey === 'string' ? location.state.editorKey : null;
  const key = carried || (id && id !== 'new' ? `note:${id}` : `new:${location.key}`);
  return <NoteEditorPage key={key} editorKey={key} />;
}
