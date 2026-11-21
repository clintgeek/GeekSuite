import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import BackIcon from '@mui/icons-material/ArrowBack';
import { useQuery, useMutation, getApolloContext } from '@apollo/client';
import { GET_NOTE_BY_ID, SKETCH_TRANSCRIPT } from '../graphql/queries';
import {
  CREATE_NOTE, UPDATE_NOTE, COMPOSE_NOTE, TRANSCRIBE_SKETCH, SAVE_SKETCH_TRANSCRIPT_EDIT,
  CREATE_TODO_TASK, RECORD_SKETCH_TASKS_SENT,
} from '../graphql/mutations';
import SendTasksDialog from '../components/editors/SendTasksDialog';
import { taskInputFor, sendTaskRows, sentKeysFor, applyLineEdits } from '../utils/journalLines';
import { taskClientId } from '../utils/taskClientId';
import { saveDraft, getDraft, clearDraft, draftKeyFor } from '../utils/draftStore';
import ConflictDialog from '../components/notes/ConflictDialog';
import RestoreDraftBanner from '../components/notes/RestoreDraftBanner';
import DeletedBanner from '../components/notes/DeletedBanner';
import { useAutoTranscribe } from '../hooks/useAutoTranscribe';
import TranscriptStatus from '../components/notes/TranscriptStatus';
import ComposeDialog from '../components/editors/ComposeDialog';
import TranscribeDialog from '../components/editors/TranscribeDialog';
import FoldInSheet from '../components/foldin/FoldInSheet';
import { sketchHasShapes } from '../utils/sketchExport';
import { derivedNoteContent, derivedNoteTitle } from '../utils/sketchToText';
import { carryCorrections, rememberCorrections } from '../utils/transcriptCorrections';
import NoteHistoryDialog from '../components/notes/NoteHistoryDialog';
import ArchivedBanner from '../components/notes/ArchivedBanner';
import { useNoteArchiveState } from '../hooks/useNoteArchiveState';
import { useArchiveNotes } from '../hooks/useArchiveNotes';
import { usePinNote } from '../hooks/usePinNote';
import { useToast } from '@geeksuite/ui';
import { useAppPreferences } from '@geeksuite/user';
import { NoteShell, NoteMetaBar, NoteActions, NoteTypeRouter, NOTE_TYPES, SuggestionStrip } from '../components/notes';
import NoteFooter from '../components/notes/NoteFooter';
import { WikiLinkContext, useNoteLinks } from '../hooks/useNoteLinks';
import { BackButton } from '../components/notes/NoteActions';
import NotePrintView from '../components/notes/NotePrintView';
import useNotePrint from '../hooks/useNotePrint';
import useImportStore from '../store/importStore';
import { SaveStatus, SaveAlert } from '../components/notes/SaveStatus';
import { saveStampState } from '../utils/saveStamp';
import useOnline from '../hooks/useOnline';
import useEditorChrome from '../store/editorChromeStore';
import { toDate } from '../utils/dateUtils';
import { useDeleteNote } from '../hooks/useDeleteNote';
import { onNoteCreated, onNoteUpdated } from '../graphql/cacheUpdates';
import { overSizeMessage, saveErrorMessage } from '../utils/saveGuards';
import { applyInlineTags } from '../utils/inlineTags';
import { containsNoteLink, insertLink, noteLinkMarkup, supportsLinkInsertion } from '../utils/noteLinks';

/**
 * NoteEditorPage - Unified page for creating and editing notes
 * Uses the new modular note system components
 *
 * A new note is Markdown. `/notes/new` opens straight into it — there is no
 * "what are you writing?" picker any more (Graphite, 2026-09-29): the New
 * surfaces (NewNoteSheet, NewNoteMenu) offer Photo and Sketch beside it and
 * Code / Mind map under "More", and each links here with `?type=`. Rich text
 * (`type: 'text'`) still opens and edits; it is just not offered as new.
 */
/** A server `updatedAt` (ISO, millis or numeric string) as the ISO string C3 compares. */
const isoOf = (value) => toDate(value)?.toISOString() || null;

/** The CONFLICT a guarded updateNote was refused with (C3), or null. */
function conflictFrom(error) {
  const hit = (error?.graphQLErrors || []).find((e) => e?.extensions?.code === 'CONFLICT');
  return hit ? { serverNote: hit.extensions.serverNote || null } : null;
}

const sameTags = (a = [], b = []) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

function NoteEditorPage({ editorKey } = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Apollo's client, when there is one (tests mock the hooks without a
  // provider). Used for the quiet checks that must not touch the form.
  const apollo = useContext(getApolloContext())?.client || null;

  const isNewNote = !id || id === 'new';
  // This mount began as a new note. The URL becomes /notes/<id>/edit after
  // the first autosave (1.20) without remounting, so `isNewNote` alone no
  // longer says how the page started.
  const startedNewRef = useRef(isNewNote);

  const { data, loading: isLoadingSelected, error: queryError } = useQuery(GET_NOTE_BY_ID, {
    variables: { id },
    skip: isNewNote || id === 'undefined',
    fetchPolicy: 'cache-and-network',
  });
  const noteToEdit = data?.note;
  const online = useOnline();
  // Seed the editor only from a network-fresh copy (1.4). `cache-and-network`
  // hands over the cached note first, with `loading` still true; editing that
  // copy and saving it wrote another device's newer text back over itself.
  // Offline, or when the network failed, the cached copy is all there is —
  // and C3's base check still protects the save.
  const freshEnough = !isLoadingSelected || !online || Boolean(queryError);
  // A failure only matters when there is nothing to show.
  const selectedError = noteToEdit ? null : queryError?.message;

  // `refetchQueries: [{ query: GET_NOTES }]` used to sit here with NO
  // variables. `NoteList` watches `notes(tag:…, prefix:…, type:…, limit: 200)`,
  // so that entry matched neither the observable nor the cache field key — it
  // was a wasted round trip that updated nothing. The cache rule
  // (graphql/cacheUpdates.js) is what actually makes the new note appear.
  const [createNoteMutation] = useMutation(CREATE_NOTE, { update: onNoteCreated });
  const [updateNoteMutation] = useMutation(UPDATE_NOTE, { update: onNoteUpdated });
  const [setPinned, { loading: isPinning }] = usePinNote();
  // Usually just a read of `noteToEdit.pinned` — the note entity merges its
  // own `pinned`/`pinnedAt` (usePinNote's optimistic response) and
  // `noteToEdit` reads that same normalized entity via GET_NOTE_BY_ID. But a
  // note that autosaved and was never navigated to keeps `id === 'new'` in
  // the URL (deliberately — see the create branch of handleSave below), so
  // GET_NOTE_BY_ID stays `skip`ped and `noteToEdit` stays undefined even
  // after it has a real id. `pinnedOverride` is the local fallback for
  // exactly that window: set by `handlePin`, cleared whenever this form is
  // (re)initialized for a note identity (below).
  const [pinnedOverride, setPinnedOverride] = useState(null);
  const pinned = pinnedOverride !== null ? pinnedOverride : !!noteToEdit?.pinned;

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  // Inline #tags (utils/inlineTags.js), per editing session: the tags a save
  // added from the body (so a word autosaved mid-typing can be taken back),
  // and the chips the user removed (so the body can't put them straight back).
  const inlineProvisionalRef = useRef(new Set());
  const inlineSuppressedRef = useRef(new Set());
  const [noteType, setNoteType] = useState(isNewNote ? NOTE_TYPES.MARKDOWN : NOTE_TYPES.TEXT);
  // Save state, shown by the SaveStamp. Four facts rather than one status
  // string: the old string reached only a button that compared it against
  // 'Saved', so every error message it was ever set to rendered nowhere.
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  isSavingRef.current = isSaving;
  // Set where readOnlyMeta is computed (below); read by automatic transcription.
  const readOnlyMetaRef = useRef(false);
  const [saveError, setSaveError] = useState(null);
  const [saveEmpty, setSaveEmpty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const deleteNoteNow = useDeleteNote();
  const [savedNoteId, setSavedNoteId] = useState(() => (id && id !== 'new' && id !== 'undefined' ? id : null));
  const [dirty, setDirty] = useState(false);
  // C3: the server copy that refused our save, while the writer chooses.
  const [conflict, setConflict] = useState(null);
  const conflictRef = useRef(null);
  conflictRef.current = conflict;
  const [conflictBusy, setConflictBusy] = useState(false);
  // 1.2: a draft on this device that the server never got.
  const [draftOffer, setDraftOffer] = useState(null);
  // Which note the form was seeded from (state, so the loading screen leaves
  // the moment it is seeded).
  const [seededId, setSeededId] = useState(null);
  // The `updatedAt` the text on screen was made against (C3), and the tags
  // the server last acknowledged (5.7: only a tag change evicts the tag index).
  const baseUpdatedAtRef = useRef(null);
  const lastSavedTagsRef = useRef([]);
  // Where this note's draft lives on the device (utils/draftStore.js).
  const draftKeyRef = useRef(null);
  // The page is going away: an edit that arrives now (a sketch flushing its
  // last strokes on unmount) is saved at once instead of scheduled.
  const unmountedRef = useRef(false);
  // Bumped after every successful save; SuggestionStrip watches it and asks
  // the gateway for a fresh set. A counter rather than a boolean so two saves
  // in a row are two requests.
  const [saveToken, setSaveToken] = useState(0);
  // [[links]] in this note resolve through the gateway; refetched after each
  // save, since that is when links are (re)resolved.
  const resolveLink = useNoteLinks(savedNoteId, saveToken);

  const { notify } = useToast();

  // "Suggest tags & links" — off by default, and stored where notegeek's other
  // preferences live (the gateway reads the same flag before it consults a
  // model, so switching it off is not merely a client-side courtesy).
  const { preferences: appPrefs } = useAppPreferences('notegeek');
  const suggestEnabled = appPrefs?.suggestOnSave === true;

  // Where the caret was in the body's textarea the last time it moved. Markdown
  // and code notes are plain textareas, so a related-note link can land where
  // the writer is actually typing; the rich-text editor is a ProseMirror
  // document with no meaningful offset into its HTML, so its links go on the
  // end (see utils/noteLinks.js).
  const caretRef = useRef(null);

  // Track which note this form has been initialized from. Keyed by identity,
  // not by object: the init effect below used to depend on `noteToEdit`, whose
  // reference changes every time `UPDATE_NOTE` writes a new `updatedAt` into
  // the normalized cache — so every successful save re-ran it and reset the
  // form to the server's copy, discarding anything typed during the round trip.
  const initializedFor = useRef(null);

  // The saved note's id as a REF, not just state. A save that lands after the
  // component has unmounted (the flush below) cannot read fresh state, and if
  // it reads a stale `null` it takes the create branch and makes a second note.
  const savedNoteIdRef = useRef(
    id && id !== 'new' && id !== 'undefined' ? id : null
  );

  // A save is in flight. Nothing guarded this before: the Back button fired a
  // save and then navigated, and the unmount flush — reading a `dirty` that the
  // in-flight save had not cleared yet — fired a SECOND one. On a new note both
  // took the create branch and one click produced two notes.
  const savingRef = useRef(false);
  // A save was requested while one was in flight; run once more when it lands,
  // so the newer content is not silently dropped.
  const saveAgainRef = useRef(false);
  // The user discarded this note. Suppresses the unmount flush, which would
  // otherwise dutifully save the draft they just threw away.
  const discardedRef = useRef(false);
  const isMindMap = noteType === NOTE_TYPES.MINDMAP;
  const isHandwritten = noteType === NOTE_TYPES.HANDWRITTEN;

  // Mind maps start in view mode for existing notes
  const [isEditMode, setIsEditMode] = useState(() => {
    if (isNewNote) return true;
    if (noteToEdit?.type === NOTE_TYPES.MINDMAP) return false;
    return true;
  });

  // Parse type from URL query for new notes
  const getTypeFromQuery = useCallback(() => {
    if (!isNewNote) return null;
    const params = new URLSearchParams(location.search);
    const t = params.get('type');
    if (t && Object.values(NOTE_TYPES).includes(t)) return t;
    return null;
  }, [isNewNote, location.search]);

  // Reset form for new notes
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setTags([]);
    inlineProvisionalRef.current = new Set();
    inlineSuppressedRef.current = new Set();
    setNoteType(NOTE_TYPES.MARKDOWN);
    setIsEditMode(true);
    setSavedNoteId(null);
  }, []);

  // Initialize form from note data or URL.
  //
  // Guarded by identity (`initializedFor`), not by the `noteToEdit` object.
  // `UPDATE_NOTE` writes a fresh `updatedAt` into the normalized cache on every
  // save, which gives `data.note` a new reference, which re-ran this effect and
  // called `setContent(server copy)` — discarding whatever the user typed while
  // the save was in flight. The form is seeded once per note and then belongs
  // to the user until they navigate somewhere else.
  useEffect(() => {
    // A new note is keyed on the history entry (1.20): "New note" while on a
    // new note is a new entry, so it starts fresh. The route remounts this
    // page per entry too (NoteEditorRoute); this is the belt to that brace.
    const identity = isNewNote ? `new:${ location.key }:${ location.search }` : id;
    if (initializedFor.current === identity) return;

    if (isNewNote) {
      resetForm();
      savedNoteIdRef.current = null;
      baseUpdatedAtRef.current = null;
      lastSavedTagsRef.current = [];
      setNoteType(getTypeFromQuery() || NOTE_TYPES.MARKDOWN);
      // `?title=` — an unresolved [[link]]'s "create this note". Seeded, not
      // dirty: nothing is saved until the writer actually writes.
      const seededTitle = new URLSearchParams(location.search).get('title');
      if (seededTitle) setTitle(seededTitle.trim().slice(0, 500));
      setPinnedOverride(null);
      initializedFor.current = identity;
      // The history key survives a reload of the same entry, so a new note
      // the OS killed before its first save is offered back here.
      draftKeyRef.current = draftKeyFor(null, location.key);
      offerDraftIfAny(draftKeyRef.current, null);
      return;
    }

    if (noteToEdit && freshEnough) {
      setTitle(noteToEdit.title || '');
      setContent(noteToEdit.content || '');
      setTags(noteToEdit.tags || []);
      inlineProvisionalRef.current = new Set();
      inlineSuppressedRef.current = new Set();
      setLastSavedAt(toDate(noteToEdit.updatedAt));
      setPinnedOverride(null);
      savedNoteIdRef.current = id;
      baseUpdatedAtRef.current = isoOf(noteToEdit.updatedAt);
      lastSavedTagsRef.current = noteToEdit.tags || [];
      draftKeyRef.current = draftKeyFor(id);
      offerDraftIfAny(draftKeyRef.current, noteToEdit);
      setSeededId(id);

      if (noteToEdit.type && Object.values(NOTE_TYPES).includes(noteToEdit.type)) {
        setNoteType(noteToEdit.type);
        if (noteToEdit.type === NOTE_TYPES.MINDMAP) {
          setIsEditMode(false);
        }
      } else {
        setNoteType(NOTE_TYPES.TEXT);
      }

      setDirty(false);
      initializedFor.current = identity;
    }
  }, [id, noteToEdit, freshEnough, isNewNote, location.key, location.search, resetForm, getTypeFromQuery]);

  /**
   * A draft on this device that differs from what the server holds is work
   * the server never got (1.2): offer it back. Restoring keeps the draft's
   * own base, so a note changed elsewhere since then still meets the
   * conflict check instead of being overwritten.
   */
  function offerDraftIfAny(key, serverNote) {
    getDraft(key).then((draft) => {
      if (!draft || draftKeyRef.current !== key) return;
      const serverContent = serverNote?.content || '';
      const serverTitle = serverNote?.title || '';
      const differs = (draft.content || '') !== serverContent || (draft.title || '') !== serverTitle;
      const hasWords = Boolean((draft.content || '').trim() || (draft.title || '').trim());
      if (differs && hasWords) setDraftOffer(draft);
      else clearDraft(key);
    }).catch(() => {});
  }

  const restoreDraft = () => {
    const draft = draftOffer;
    if (!draft) return;
    setDraftOffer(null);
    setTitle(draft.title || '');
    setContent(draft.content || '');
    if (Array.isArray(draft.tags)) setTags(draft.tags);
    if (draft.type && Object.values(NOTE_TYPES).includes(draft.type)) setNoteType(draft.type);
    if (draft.baseUpdatedAt) baseUpdatedAtRef.current = draft.baseUpdatedAt;
    setDirty(true);
  };

  const discardDraft = () => {
    setDraftOffer(null);
    clearDraft(draftKeyRef.current);
  };

  // Handle save — allow if either title or content has text
  // ── Compose ─────────────────────────────────────────────────────────────
  //
  // Build a document out of the scraps in this note. Nothing is written until
  // the result has been seen: a compose is lossy by design, and this note may
  // be the only copy of material pasted in from a chat or an email.
  const [composeNoteMutation, { loading: isComposing }] = useMutation(COMPOSE_NOTE);
  const [compose, setCompose] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // ── Fold in new info (DOCS/CONTEXT.md §13) ───────────────────────────
  //
  // The gateway proposes anchored changes against the STORED note, so a
  // pending edit is saved first — otherwise the proposal would be made
  // against text that is no longer on screen. The result is put on screen
  // as the server wrote it, clean.
  const [foldInOpen, setFoldInOpen] = useState(false);
  const canFoldIn = Boolean(savedNoteId) && noteType === NOTE_TYPES.MARKDOWN;

  const flushBeforeFoldIn = async () => {
    if (dirtyRef.current || savingRef.current) {
      await handleSaveRef.current();
      // A save already in flight returns at once and replays itself; wait.
      for (let i = 0; i < 100 && (savingRef.current || dirtyRef.current); i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (dirtyRef.current) {
      throw new Error('Your latest edits are not saved yet, so Fold-in cannot see them. Try again once the note says saved.');
    }
  };

  /**
   * Save anything pending and wait for it to land (2.8). Convert and Send
   * tasks used to fire the save and carry on, so they read the page while it
   * was still unsaved — and paid for a fresh reading of a page the automatic
   * run had already read. Resolves true when nothing is left unsaved.
   */
  const settleSave = async () => {
    if (dirtyRef.current || savingRef.current || !savedNoteIdRef.current) {
      await handleSaveRef.current();
      // Wait for the save in flight and any replay it queued — not for
      // `dirty`, which a failed (offline) save never clears.
      for (let i = 0; i < 100 && (savingRef.current || saveAgainRef.current); i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return !dirtyRef.current && Boolean(savedNoteIdRef.current);
  };

  const showServerNote = (note) => {
    if (!note) return;
    setContent(note.content || '');
    if (Array.isArray(note.tags)) setTags(note.tags);
    setDirty(false);
    setSaveError(null);
    setLastSavedAt(new Date());
    setSaveToken((n) => n + 1);
  };

  // ── Convert handwriting to text (DOCS/HANDWRITING.md §2) ──────────────
  //
  // Export the page, have it read, let the writer correct the reading, then
  // Compose it or keep it plain. Either way the result is a NEW markdown note
  // whose first line links back here. The sketch is never replaced: nothing
  // on this path calls updateNote or setContent.
  const sketchApiRef = useRef(null);
  const transcribeRunRef = useRef(0);
  const [transcribeSketchMutation] = useMutation(TRANSCRIBE_SKETCH);
  const [saveTranscriptEdit] = useMutation(SAVE_SKETCH_TRANSCRIPT_EDIT);
  const [transcribe, setTranscribe] = useState(null);
  const canTranscribe = isHandwritten && sketchHasShapes(content);

  // ── Automatic transcription (DOCS/AUTO_TRANSCRIBE_SPEC.md) ─────────────
  // The open sketch reads itself ~90 s after the last pen stroke. Autosave
  // knows nothing about it: only ink edits (onInkEdit) start the debounce,
  // and a pending save just makes it wait.
  const autoTranscribeOn = appPrefs?.autoTranscribeSketches !== false;
  const exportSketchPage = useCallback(async () => {
    const api = sketchApiRef.current;
    if (!api || !api.hasShapes?.()) return null;
    return await api.exportPng();
  }, []);
  const { view: transcriptView, setView: setTranscriptView, onInkEdit, transcribeNow } = useAutoTranscribe({
    noteId: isHandwritten ? savedNoteId : null,
    enabled: autoTranscribeOn,
    active: isHandwritten && !readOnlyMetaRef.current,
    exportPage: exportSketchPage,
    isBusy: () => dirtyRef.current || isSavingRef.current,
  });
  const transcriptViewRef = useRef(transcriptView);
  transcriptViewRef.current = transcriptView;

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

  const revokeImage = (url) => {
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  };

  const closeTranscribe = () => {
    transcribeRunRef.current += 1; // anything still in flight is now stale
    setTranscribe((t) => { revokeImage(t?.imageUrl); return null; });
  };

  const transcribeErrorMessage = (err) => {
    const status = err?.networkError?.statusCode;
    if (status === 413) return 'That page is too large for the server to accept (413). Your sketch is unchanged.';
    if (err?.networkError && !err?.graphQLErrors?.length) return 'Could not reach the server. Your sketch is unchanged.';
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
      if (!api) throw new Error('The sketch is still loading. Try again in a moment.');
      exported = await api.exportPng();
    } catch (err) {
      if (stale()) return;
      setTranscribe((t) => ({ ...t, stage: 'error', error: err?.message || 'Could not turn the sketch into an image.' }));
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
        variables: { image: exported.base64, mediaType: exported.mediaType, noteId: savedNoteIdRef.current || undefined },
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
      notify('Save the sketch first: the new note links back to it.', { tone: 'error' });
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
      notify('Saved as a new note. The sketch is unchanged.', { tone: 'success' });
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
        variables: { image: exported.base64, mediaType: exported.mediaType, noteId: savedNoteIdRef.current || undefined },
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
      const input = taskInputFor(row, { now, today: new Date(), sketch: sketchId ? { id: sketchId, title } : null, origin: window.location.origin });
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

  const handleTranscriptCompose = () => {
    if (!transcribe?.text?.trim()) return;
    // Hidden, not closed: "Back to transcript" in Compose returns to it.
    keepTranscriptCorrections(transcribe);
    setTranscribe((t) => ({ ...t, open: false }));
    handleCompose(transcribe.text);
  };

  /**
   * Save what the form holds. Reads the form through refs, not this render's
   * state: a save that runs after the page unmounted (the unmount flush, or a
   * sketch flushing its last strokes on the way out) must write the newest
   * text, not the text of the last render it happened to close over.
   */
  const handleSave = async () => {
    if (discardedRef.current) return;
    // Waiting on the writer's choice (C3): saving again would only be
    // refused again, and must not pick a side for them.
    if (conflictRef.current) return;

    const content = contentRef.current;
    const title = titleRef.current;
    const tags = tagsRef.current;
    const noteType = noteTypeRef.current;

    if (!content.trim() && !title.trim()) {
      // Shown by the stamp ("Nothing to save") for as long as it is true;
      // it used to be a status string that rendered nowhere.
      setSaveEmpty(true);
      return;
    }
    setSaveEmpty(false);

    // One save at a time. A second request while one is in flight is recorded
    // and replayed when the first lands, so nothing newer is dropped — and,
    // critically, a new note cannot be created twice by two concurrent calls
    // that both read `savedNoteId === null`.
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }

    // The gateway rejects an over-long body with a flat "Invalid input" that
    // used to be swallowed entirely (see utils/saveGuards.js). Say it here,
    // once, in the user's terms — and do not burn a round trip discovering it.
    const tooBig = overSizeMessage(content, noteType);
    if (tooBig) {
      setSaveError(tooBig);
      notify(tooBig, { tone: 'error' });
      return;
    }

    setIsSaving(true);
    savingRef.current = true;

    // What this save is actually writing. `dirty` is cleared only if the form
    // still holds it when the mutation lands — otherwise the user typed during
    // the round trip and there is genuinely more to save.
    //
    // Inline #tags in the body join the note's tags here, on save — additive
    // only (utils/inlineTags.js has the rule). The chips update to match.
    const inline = applyInlineTags({
      tags,
      content,
      type: noteType,
      provisional: inlineProvisionalRef.current,
      suppressed: inlineSuppressedRef.current,
    });
    inlineProvisionalRef.current = inline.provisional;
    if (inline.changed) {
      tagsRef.current = inline.tags;
      setTags(inline.tags);
    }

    // No "Untitled Note" (1.21): an empty title stays empty — the field shows
    // its placeholder and lists say "Untitled". Filling it in two seconds
    // into writing put words in the title the writer never typed.
    const noteData = {
      title: title.trim(),
      content,
      tags: inline.tags,
      type: noteType,
    };

    try {
      let savedNote;
      // The REF, not the state: a flush that runs after unmount cannot see a
      // `setSavedNoteId` from the save before it, and a stale `null` here is
      // how one Back click used to produce two notes.
      const currentId =
        savedNoteIdRef.current && savedNoteIdRef.current !== 'undefined'
          ? savedNoteIdRef.current
          : null;

      if (currentId) {
        const { data } = await updateNoteMutation({
          variables: { id: currentId, ...noteData, baseUpdatedAt: baseUpdatedAtRef.current || undefined },
          // 5.7: a save that did not change the tags leaves the tag index alone.
          context: { tagsChanged: !sameTags(inline.tags, lastSavedTagsRef.current) },
        });
        savedNote = data?.updateNote;
      } else {
        const { data } = await createNoteMutation({ variables: noteData });
        savedNote = data?.createNote;
        const newId = savedNote?.id || savedNote?._id;
        if (newId) {
          // Set the ref FIRST and synchronously, so any queued replay updates
          // the note instead of creating another one.
          savedNoteIdRef.current = newId;
          setSavedNoteId(newId);
          // The draft moves from the new-note key to the note's own.
          const oldKey = draftKeyRef.current;
          draftKeyRef.current = draftKeyFor(newId);
          if (oldKey && oldKey !== draftKeyRef.current) clearDraft(oldKey);
          // The address becomes the note's (1.20) — a reload, an OS kill or
          // the post-deploy reload now reopens THIS note, and Back/Forward
          // contain it. Replaced, not pushed, and to the editor route, so the
          // page is not remounted (NoteEditorRoute keeps the same key) and
          // the writer never leaves the editor. Not to `/notes/<id>`: that is
          // the read-only viewer.
          initializedFor.current = newId;
          setSeededId(newId);
          if (!unmountedRef.current && /\/notes\/new\/?$/.test(locationRef.current.pathname)) {
            navigate(`/notes/${newId}/edit`, { replace: true, state: { editorKey } });
          }
        }
      }

      if (savedNote) {
        if (savedNote.updatedAt) baseUpdatedAtRef.current = isoOf(savedNote.updatedAt);
        lastSavedTagsRef.current = savedNote.tags || noteData.tags;
        setSaveError(null);
        setLastSavedAt(new Date());
        setSaveToken((n) => n + 1);
        // Only clean if the form still holds exactly what we wrote.
        if (contentRef.current === noteData.content && titleRef.current === title) {
          setDirty(false);
          dirtyRef.current = false;
          // The server has it: the device copy is no longer needed.
          cancelDraftWrite();
          clearDraft(draftKeyRef.current);
        } else {
          // Typed during the round trip: keep the newer text on the device.
          writeDraftNowRef.current();
        }
        if (isMindMap && !isNewNote && !startedNewRef.current) {
          setIsEditMode(false);
        }
      } else {
        const message = 'Failed to save — the server returned nothing.';
        if (saveErrorRef.current !== message) notify(message, { tone: 'error' });
        setSaveError(message);
      }
    } catch (error) {
      const clash = conflictFrom(error);
      if (clash) {
        // C3: changed on another device since this text was loaded. Keep
        // the text on screen (and on the device), stop autosaving, and ask.
        conflictRef.current = clash;
        setConflict(clash);
        setSaveError('Changed on another device — choose which copy to keep.');
        writeDraftNowRef.current();
        return;
      }
      // The old `saveStatus` only ever reached NoteActions, which compared it
      // against the single string 'Saved'. Every error message it was set to
      // rendered nowhere at all: a note that could not be saved looked exactly
      // like one that had been. Now the stamp says "Not saved" (and keeps
      // saying it until a save lands), and the toast carries the detail.
      const message = saveErrorMessage(error);
      // Toast a failure once. The alert in the head (and the docked
      // toolbar) stays up until a save lands; the autosave retrying the
      // same failure every two seconds must not stack a toast each time.
      if (saveErrorRef.current !== message) notify(message, { tone: 'error' });
      setSaveError(message);
      saveErrorRef.current = message;
      writeDraftNowRef.current();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        handleSaveRef.current();
      }
    }
  };

  // ── Conflict (C3) ─────────────────────────────────────────────────────
  const resolveConflict = () => {
    conflictRef.current = null;
    setConflict(null);
    setSaveError(null);
  };

  /** Keep mine: write this screen over theirs, against their version. */
  const handleKeepMine = () => {
    const server = conflict?.serverNote;
    if (server?.updatedAt) baseUpdatedAtRef.current = isoOf(server.updatedAt);
    resolveConflict();
    setDirty(true);
    dirtyRef.current = true;
    handleSaveRef.current();
  };

  /** Use theirs: the other device's copy replaces what is on screen. */
  const handleUseTheirs = () => {
    const server = conflict?.serverNote;
    resolveConflict();
    if (server) adoptServerCopy(server);
  };

  /** Keep both: this screen's text becomes a new note; this one shows theirs. */
  const handleKeepBoth = async () => {
    const server = conflict?.serverNote;
    setConflictBusy(true);
    try {
      const mineTitle = titleRef.current.trim();
      const { data: made } = await createNoteMutation({
        variables: {
          title: `${mineTitle || 'Untitled'} (this device)`,
          content: contentRef.current,
          type: noteTypeRef.current,
          tags: tagsRef.current,
        },
      });
      const copyId = made?.createNote?.id;
      resolveConflict();
      if (server) adoptServerCopy(server);
      notify('Your version is saved as a new note.', {
        tone: 'success',
        duration: 10000,
        action: copyId ? (
          <Button
            color="inherit"
            size="small"
            onClick={() => navigate(`/notes/${copyId}`)}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44 }}
          >
            Open
          </Button>
        ) : undefined,
      });
    } catch (err) {
      notify(saveErrorMessage(err), { tone: 'error' });
    } finally {
      setConflictBusy(false);
    }
  };

  /**
   * Put the server's copy on screen as clean, and make it the base for the
   * next save. Used by "Use theirs", "Keep both", and the quiet re-check on
   * return to the app when nothing here is unsaved.
   */
  function adoptServerCopy(server) {
    setTitle(server.title || '');
    titleRef.current = server.title || '';
    setContent(server.content || '');
    contentRef.current = server.content || '';
    if (Array.isArray(server.tags)) {
      setTags(server.tags);
      tagsRef.current = server.tags;
      lastSavedTagsRef.current = server.tags;
    }
    if (server.type && Object.values(NOTE_TYPES).includes(server.type)) setNoteType(server.type);
    if (server.updatedAt) {
      baseUpdatedAtRef.current = isoOf(server.updatedAt);
      setLastSavedAt(toDate(server.updatedAt));
    }
    setDirty(false);
    dirtyRef.current = false;
    setSaveError(null);
    cancelDraftWrite();
    clearDraft(draftKeyRef.current);
  }

  // Handle content change
  //
  // The refs move at once, not on the next render: a sketch hands over its
  // last strokes while the page is being hidden or unmounted (its own flush,
  // 1.2), and that edit has to be saved right there — there may be no next
  // render, and no two seconds, before Android freezes the app.
  const handleContentChange = useCallback((newContent) => {
    contentRef.current = newContent;
    dirtyRef.current = true;
    setContent(newContent);
    setDirty(true);
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (unmountedRef.current || hidden) {
      writeDraftNowRef.current();
      handleSaveRef.current();
    }
  }, []);

  /**
   * Remember the caret whenever it moves inside the body. React's synthetic
   * events bubble out of the editor's own textarea, so this needs no change to
   * any of the five editors — and an editor that has no textarea simply never
   * fires it, which is exactly the "append instead" case.
   */
  const rememberCaret = useCallback((event) => {
    const el = event.target;
    if (el && typeof el.selectionStart === 'number' && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
      caretRef.current = el.selectionStart;
    }
  }, []);

  /** A tag chip: the tag joins the note's tags, and the ordinary save writes it. */
  const handleApplySuggestedTag = useCallback((tag) => {
    setTags((current) =>
      current.some((t) => t.toLowerCase() === String(tag).toLowerCase()) ? current : [...current, tag]
    );
    setDirty(true);
  }, []);

  /** A related-note chip: a link to that note, in this note's own markup. */
  const handleInsertNoteLink = useCallback((related) => {
    if (!supportsLinkInsertion(noteType)) return;
    setContent((current) =>
      containsNoteLink(current, related.id)
        ? current
        : insertLink(current, noteLinkMarkup(noteType, related), {
          caret: caretRef.current,
          noteType,
        })
    );
    setDirty(true);
  }, [noteType]);

  // ── Refs for flush-on-unmount and keyboard shortcut ───────────────────
  // These always point to the latest values so stale closures don't bite.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // What the form holds RIGHT NOW, for the "did the user type while the save
  // was in flight?" check inside handleSave.
  const contentRef = useRef(content);
  contentRef.current = content;
  const titleRef = useRef(title);
  titleRef.current = title;
  const saveErrorRef = useRef(saveError);
  saveErrorRef.current = saveError;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const noteTypeRef = useRef(noteType);
  noteTypeRef.current = noteType;
  const locationRef = useRef(location);
  locationRef.current = location;

  // ── The device copy (1.2) ─────────────────────────────────────────────
  // What is on screen, mirrored to IndexedDB half a second after it changes
  // (utils/draftStore.js), and at once when the app is hidden, the page
  // unmounts, or a save fails. Cleared when the server acknowledges a save.
  const draftTimerRef = useRef(null);
  const cancelDraftWrite = () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
  };
  const writeDraftNow = () => {
    cancelDraftWrite();
    if (discardedRef.current || !dirtyRef.current || !draftKeyRef.current) return;
    const body = contentRef.current;
    const head = titleRef.current;
    if (!body.trim() && !head.trim()) return;
    saveDraft(draftKeyRef.current, {
      noteId: savedNoteIdRef.current,
      title: head,
      content: body,
      tags: tagsRef.current,
      type: noteTypeRef.current,
      baseUpdatedAt: baseUpdatedAtRef.current,
    });
  };
  const writeDraftNowRef = useRef(writeDraftNow);
  writeDraftNowRef.current = writeDraftNow;

  useEffect(() => {
    if (!dirty) return undefined;
    cancelDraftWrite();
    draftTimerRef.current = setTimeout(() => writeDraftNowRef.current(), 500);
    return undefined;
  }, [dirty, content, title, tags, noteType]);

  // Debounced autosave — fires 2s after the last edit while dirty.
  // Resets on every content/title/tag change, giving a true debounce.
  // Paused while a conflict waits on the writer (C3).
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => {
      handleSaveRef.current();
    }, 2000);
    return () => clearTimeout(timer);
  }, [dirty, content, title, tags, conflict]);

  // ── Leaving, coming back, reconnecting (1.2, 1.3, 1.4) ─────────────────
  //
  // Hidden (switch app, lock the phone, take a call) or pagehide: save now
  // and keep the device copy — Android may freeze the PWA before the 2 s
  // debounce. Visible again: retry a save that failed or never ran, and ask
  // the server whether the note changed elsewhere while we were away.
  // `online`: the connection is back — send what the offline save could not.
  const recheckServerCopy = async () => {
    const noteId = savedNoteIdRef.current;
    if (!apollo || !noteId || !baseUpdatedAtRef.current) return;
    if (dirtyRef.current || savingRef.current || conflictRef.current) return;
    try {
      const { data: fresh } = await apollo.query({
        query: GET_NOTE_BY_ID, variables: { id: noteId }, fetchPolicy: 'network-only',
      });
      const server = fresh?.note;
      if (!server || unmountedRef.current) return;
      // Typed while the check was out: the next save meets C3 instead.
      if (dirtyRef.current || savingRef.current || conflictRef.current) return;
      if (isoOf(server.updatedAt) !== baseUpdatedAtRef.current) adoptServerCopy(server);
    } catch {
      // Offline or the gateway is restarting: the base check still guards the next save.
    }
  };
  const recheckRef = useRef(recheckServerCopy);
  recheckRef.current = recheckServerCopy;

  useEffect(() => {
    const flushNow = () => {
      if (discardedRef.current || !dirtyRef.current) return;
      writeDraftNowRef.current();
      handleSaveRef.current();
    };
    const retry = () => {
      if (discardedRef.current || conflictRef.current) return;
      if (dirtyRef.current) handleSaveRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      } else {
        retry();
        recheckRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('online', retry);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('online', retry);
    };
  }, []);

  // Cmd/Ctrl+S — manual save shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Flush on unmount — if there are unsaved changes when the user navigates
  // away (via in-app navigation, not tab close), fire the save.
  //
  // `handleSave`'s in-flight guard is what makes this safe next to
  // `handleBack`: the two fire in the same tick (save, then navigate, then
  // unmount), and before the guard existed the second one saw a `dirty` the
  // first had not cleared yet and created a duplicate note.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (dirtyRef.current && !discardedRef.current) {
        writeDraftNowRef.current();
        handleSaveRef.current();
      }
    };
  }, []);

  /**
   * Pin / unpin. Only offered once the note actually exists server-side
   * (`savedNoteId`), same gating as History — an unsaved draft has nothing
   * to pin. Feedback is error-only: a successful toggle is visible right in
   * the menu label and the row's own glyph, so a toast would just be noise.
   */
  const handlePin = async () => {
    if (!savedNoteId) return;
    const next = !pinned;
    setPinnedOverride(next);
    try {
      await setPinned(savedNoteId, next);
    } catch (err) {
      setPinnedOverride(!next);
      notify(err?.message || 'Could not update the pin.', { tone: 'error' });
    }
  };

  /**
   * Archive / Restore (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U6). Not an
   * edit: no version, `updatedAt` untouched, and an archived note can still
   * be edited (that does not restore it). The page stays put; the banner
   * says what happened and the toast carries Undo.
   */
  const { archived, archivedAt, deletedAt } = useNoteArchiveState(savedNoteId);
  const { archive: archiveNotes, restore: restoreNotes, busy: isArchiving } = useArchiveNotes();
  const handleArchiveToggle = async () => {
    if (!savedNoteId) return;
    if (archived) await restoreNotes([savedNoteId]);
    else await archiveNotes([savedNoteId]);
  };

  // Back / cancel — flush save if dirty, then navigate away
  const handleBack = useCallback(() => {
    if (dirtyRef.current) {
      handleSaveRef.current();
    }
    navigate(-1);
  }, [navigate]);

  /**
   * The note is gone — discarded as a draft, or deleted from the database.
   * Stand the unmount flush down: without this it saved the draft the writer
   * had just discarded, or fired `updateNote` at a row that no longer exists.
   * Navigation is useDeleteNote's; this only changes what this page will do
   * on its way out.
   */
  const handleDiscarded = useCallback(() => {
    discardedRef.current = true;
    setDirty(false);
    dirtyRef.current = false;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    clearDraft(draftKeyRef.current);
  }, []);

  /**
   * Delete, at once, with Undo in the toast (review 2026-11-18 #8). Edits
   * the autosave has not written yet are saved FIRST: Undo restores the
   * server's copy, so without this the last seconds of typing were gone for
   * good. A save that fails stops the delete; the head already says "not
   * saved", and the toast says the note was kept. A note emptied by hand has
   * nothing worth saving (the save refuses it), so it is simply deleted.
   */
  const handleDeleteNote = async () => {
    const id = savedNoteIdRef.current || savedNoteId;
    if (!id) return;
    const blank = !contentRef.current.trim() && !titleRef.current.trim();
    if (!blank && (dirtyRef.current || savingRef.current)) {
      const settled = await settleSave();
      if (!settled) {
        const why = saveErrorRef.current || 'Your latest edits are not saved.';
        notify(`${why} The note was not deleted.`, { tone: 'error' });
        return;
      }
    }
    await deleteNoteNow(id, { onDeleted: handleDiscarded });
  };

  // beforeunload guard — prevents accidental data loss on tab-close / hard-reload
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ── Print / Save as PDF (DOCS/CONTEXT.md §8) ──────────────────────────
  //
  // NotePrintView is the paper copy; the ⋯ menu and Ctrl/Cmd+P both go
  // through `printNote`. Only a sketch needs preparing: its canvas is
  // exported to images (one per photographed page) right before the dialog
  // opens, so the drawing printed is the drawing on screen.
  const [printSketch, setPrintSketch] = useState({ images: null, error: null });
  const revokePrintImages = (images) => images?.forEach((img) => revokeImage(img.url));
  const preparePrint = async () => {
    if (!isHandwritten) return;
    const api = sketchApiRef.current;
    if (!api?.exportForPrint) {
      setPrintSketch((prev) => {
        revokePrintImages(prev.images);
        return { images: null, error: 'The sketch was still loading, so the drawing is not on this page. Try again in a moment.' };
      });
      return;
    }
    let next;
    try {
      const pages = await api.exportForPrint();
      next = {
        images: pages.map((p) => ({ url: URL.createObjectURL(p.blob), width: p.width, height: p.height })),
        error: null,
      };
    } catch (err) {
      next = {
        images: null,
        error: err?.code === 'empty' ? 'This sketch is empty.' : `The drawing could not be exported (${err?.message || 'export failed'}).`,
      };
    }
    setPrintSketch((prev) => {
      revokePrintImages(prev.images);
      return next;
    });
  };
  const { print: handlePrint, printing: isPrinting, rootRef: printRootRef } = useNotePrint({
    title,
    prepare: preparePrint,
  });
  const printImagesRef = useRef(null);
  printImagesRef.current = printSketch.images;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  useEffect(() => () => revokePrintImages(printImagesRef.current), []);

  // ── Markdown import onto a blank note (DOCS/CONTEXT.md §9) ────────────
  // A file dropped on a brand-new, still-empty Markdown note becomes a note
  // of its own (NoteImporter), which then opens in this one's place: the
  // blank draft was never saved, so nothing is lost. Once anything is
  // written, a drop is the page's own business again.
  const setEditorDropOk = useImportStore((st) => st.setEditorDropOk);
  const editorDropOk = isNewNote && !savedNoteId && noteType === NOTE_TYPES.MARKDOWN
    && !title.trim() && !content.trim();
  useEffect(() => { setEditorDropOk(editorDropOk); }, [editorDropOk, setEditorDropOk]);
  useEffect(() => () => setEditorDropOk(false), [setEditorDropOk]);

  // The loud save status, published for the phone's docked toolbar
  // (EditorToolbar), which is what is on screen while typing.
  const { tone: saveTone, loud: saveLoud } = saveStampState({
    saving: isSaving, error: saveError, dirty, offline: !online, lastSavedAt,
  });
  const setSaveAlert = useEditorChrome((st) => st.setSaveAlert);
  useEffect(() => {
    setSaveAlert(
      saveLoud ? { tone: saveTone, detail: typeof saveError === 'string' ? saveError : null } : null,
      saveLoud ? () => handleSaveRef.current() : null,
    );
  }, [saveLoud, saveTone, saveError, setSaveAlert]);
  useEffect(() => () => setSaveAlert(null, null), [setSaveAlert]);

  // Loading state — until the form is seeded from a fresh copy (1.4). Not
  // when there is an error and nothing cached: that is the error state below.
  const awaitingSeed = !isNewNote && seededId !== id && !selectedError
    && (isLoadingSelected || (noteToEdit && !freshEnough));
  if (awaitingSeed) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
          minHeight: 300,
          gap: 2,
        }}
      >
        <CircularProgress size={32} thickness={4} />
        <Typography variant="body2" color="text.secondary">
          Loading note...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (selectedError && !isNewNote) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4,
          minHeight: 300,
          gap: 3,
          textAlign: 'center',
        }}
      >
        <Typography
          sx={{
            fontFamily: 'inherit',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'error.main',
          }}
        >
          Couldn't load this note
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
          {selectedError}
        </Typography>
        <Button
          variant="contained"
          startIcon={<BackIcon />}
          onClick={() => navigate('/notes')}
          sx={{ borderRadius: 2, fontWeight: 600 }}
        >
          Back to Notes
        </Button>
      </Box>
    );
  }

  const isCanvas = isMindMap || isHandwritten;
  const readOnlyMeta = !isEditMode && isMindMap;
  readOnlyMetaRef.current = readOnlyMeta;
  const saveState = {
    saving: isSaving,
    error: saveError,
    empty: saveEmpty && !content.trim() && !title.trim(),
    dirty,
    offline: !online,
    lastSavedAt,
  };

  return (
    <WikiLinkContext.Provider value={resolveLink}>
    <Box sx={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NoteShell
        variant={isCanvas ? 'canvas' : 'page'}
        header={
          <NoteMetaBar
            title={title}
            onTitleChange={(v) => { setTitle(v); setDirty(true); }}
            noteType={noteType}
            tags={tags}
            onTagsChange={(v) => {
              // A chip removed by hand stays removed for this session, even
              // while its #tag is still in the body.
              for (const t of tags) if (!v.includes(t)) inlineSuppressedRef.current.add(t);
              for (const t of v) inlineSuppressedRef.current.delete(t);
              setTags(v);
              setDirty(true);
            }}
            readOnly={readOnlyMeta}
            compact={isCanvas}
            leading={<BackButton onBack={handleBack} />}
            status={isHandwritten
              ? <>
                  <SaveStatus {...saveState} />
                  <TranscriptStatus view={transcriptView} onTranscribeNow={transcribeNow || null} />
                </>
              : <SaveStatus {...saveState} />}
            alert={<SaveAlert {...saveState} onRetry={() => handleSaveRef.current()} reportInView />}
            // Mounted only when the writer has switched suggestions on: the
            // strip owns a lazy query, and a feature that is off should cost
            // the editor nothing at all, not even a hook.
            belowMeta={archived || suggestEnabled || draftOffer || deletedAt ? (
              <>
              {deletedAt && savedNoteId ? (
                <DeletedBanner noteId={savedNoteId} deletedAt={deletedAt} sx={{ mt: '8px' }} />
              ) : null}
              {draftOffer ? (
                <RestoreDraftBanner
                  savedAt={draftOffer.savedAt}
                  onRestore={restoreDraft}
                  onDiscard={discardDraft}
                  sx={{ mt: '8px' }}
                />
              ) : null}
              {archived && savedNoteId ? (
                <ArchivedBanner
                  archivedAt={archivedAt}
                  onRestore={() => restoreNotes([savedNoteId])}
                  busy={isArchiving}
                  sx={{ mt: '8px' }}
                />
              ) : null}
              {suggestEnabled ? (
              <SuggestionStrip
                enabled
                noteId={savedNoteId}
                title={title}
                content={content}
                noteType={noteType}
                tags={tags}
                saveToken={saveToken}
                onApplyTag={handleApplySuggestedTag}
                onInsertLink={handleInsertNoteLink}
              />
              ) : null}
              </>
            ) : null}
            actions={
              <NoteActions
                onSave={handleSave}
                // At once, with Undo in the toast; no confirm (review
                // 2026-11-18 #8). Only a saved note offers Delete; unsaved
                // edits are saved before it goes (handleDeleteNote).
                onDelete={handleDeleteNote}
                onToggleEdit={() => setIsEditMode(!isEditMode)}
                canDelete={!isNewNote || !!savedNoteId}
                canToggleEdit={isMindMap && !isNewNote && !!savedNoteId}
                isEditMode={isEditMode}
                onHistory={savedNoteId ? () => setHistoryOpen(true) : undefined}
                onPin={savedNoteId ? handlePin : undefined}
                pinned={pinned}
                isPinning={isPinning}
                onFoldIn={canFoldIn ? () => setFoldInOpen(true) : undefined}
                onCompose={canCompose ? () => handleCompose() : undefined}
                isComposing={isComposing}
                onTranscribe={isHandwritten ? () => handleTranscribe() : undefined}
                onSendTasks={isHandwritten ? () => openSendTasks() : undefined}
                canTranscribe={canTranscribe}
                isTranscribing={transcribe?.stage === 'working'}
                onPrint={handlePrint}
                isPrinting={isPrinting}
                onArchive={savedNoteId ? handleArchiveToggle : undefined}
                archived={archived}
                isArchiving={isArchiving}
              />
            }
          />
        }
        disableContentScroll={isHandwritten}
        footer={!isCanvas && savedNoteId ? <NoteFooter noteId={savedNoteId} /> : null}
      >
        {/* `display: contents` — this wrapper exists only to catch the caret
            events bubbling out of whichever editor is mounted. It must not
            become a layout box: NoteShell's content zone sizes the editors
            directly, and an extra flex box in between resized the sketch and
            mind-map canvases. */}
        <Box
          onSelect={rememberCaret}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          sx={{ display: 'contents' }}
        >
          <NoteTypeRouter
            type={noteType}
            content={content}
            onChange={handleContentChange}
            readOnly={readOnlyMeta}
            isLoading={isLoadingSelected}
            {...(isHandwritten ? { sketchApiRef, onInkEdit, noteId: savedNoteId } : {})}
          />
        </Box>
      </NoteShell>

      <NotePrintView
        note={{ title, type: noteType, content, tags, updatedAt: lastSavedAt }}
        sketchImages={isHandwritten ? printSketch.images : null}
        sketchError={isHandwritten ? printSketch.error : null}
        rootRef={printRootRef}
      />

      {/* Mounted only while open: the dialog's own Apollo hooks have no reason
          to run on every editor mount, and the list query is network-only. */}
      {historyOpen && savedNoteId ? (
        <NoteHistoryDialog
          open={historyOpen}
          noteId={savedNoteId}
          onClose={() => setHistoryOpen(false)}
          onRestored={(note) => {
            // Put the restored text on screen without a reload, and mark it
            // clean: the server has already written it.
            if (!note) return;
            setTitle(note.title || '');
            setContent(note.content || '');
            setNoteType(note.type || NOTE_TYPES.TEXT);
            setDirty(false);
            setSaveError(null);
            setLastSavedAt(new Date());
            notify('Restored. The version you replaced is still in History.', { tone: 'success' });
          }}
        />
      ) : null}

      {compose && compose.origin === 'sketch' ? (
        // From a sketch's transcript: a new note only, never "Replace this
        // note" (the sketch is the original). Discard goes back to the
        // transcript rather than losing it.
        <ComposeDialog
          open={compose.open}
          loading={compose.loading}
          markdown={compose.markdown}
          stats={compose.stats}
          error={compose.error}
          model={compose.model}
          discardLabel="Back to transcript"
          onClose={() => {
            setCompose(null);
            setTranscribe((t) => (t ? { ...t, open: true } : t));
          }}
          onSaveAsNew={() => saveFromSketch(compose.markdown, { composed: true })}
        />
      ) : null}

      {compose && compose.origin !== 'sketch' ? (
        <ComposeDialog
          open={compose.open}
          loading={compose.loading}
          markdown={compose.markdown}
          stats={compose.stats}
          error={compose.error}
          model={compose.model}
          onClose={() => setCompose(null)}
          onSaveAsNew={() => handleComposeSaveAsNew(compose.markdown)}
          onReplace={() => handleComposeReplace(compose.markdown)}
        />
      ) : null}

      {foldInOpen && savedNoteId ? (
        <FoldInSheet
          open
          note={{ id: savedNoteId, title, type: noteType }}
          prepare={flushBeforeFoldIn}
          onClose={() => setFoldInOpen(false)}
          onApplied={({ note }) => showServerNote(note)}
          onUndone={showServerNote}
        />
      ) : null}

      {transcribe ? (
        <TranscribeDialog
          open={transcribe.open}
          stage={transcribe.stage}
          step={transcribe.step}
          text={transcribe.text}
          onTextChange={(text) => setTranscribe((t) => ({ ...t, text }))}
          error={transcribe.error}
          model={transcribe.model}
          imageUrl={transcribe.imageUrl}
          saving={transcribe.saving}
          onClose={closeTranscribe}
          onRetry={() => handleTranscribe({ forceRead: Boolean(transcribe.reused) })}
          onCompose={handleTranscriptCompose}
          onKeepPlain={handleTranscriptKeepPlain}
          reused={transcribe.reused}
          onTranscribeAgain={transcribe.reused ? () => handleTranscribe({ forceRead: true }) : null}
        />
      ) : null}

      {sendTasks ? (
        <SendTasksDialog
          open={sendTasks.open}
          stage={sendTasks.stage}
          rows={sendTasks.rows}
          error={sendTasks.error}
          sending={sendTasks.sending}
          result={sendTasks.result}
          onToggle={(key, on) => setSendTasks((t) => ({ ...t, rows: t.rows.map((r) => (r.key === key ? { ...r, on } : r)) }))}
          onTextChange={(key, text) => setSendTasks((t) => ({ ...t, rows: t.rows.map((r) => (r.key === key ? { ...r, text } : r)) }))}
          onSend={handleSendTasks}
          onClose={closeSendTasks}
          onRetry={openSendTasks}
          writtenAt={sendTasks.writtenAt}
          onCorrections={handleSendCorrections}
        />
      ) : null}

      <ConflictDialog
        open={Boolean(conflict)}
        serverNote={conflict?.serverNote}
        busy={conflictBusy}
        onKeepMine={handleKeepMine}
        onUseTheirs={handleUseTheirs}
        onKeepBoth={handleKeepBoth}
      />

    </Box>
    </WikiLinkContext.Provider>
  );
}

export default NoteEditorPage;
