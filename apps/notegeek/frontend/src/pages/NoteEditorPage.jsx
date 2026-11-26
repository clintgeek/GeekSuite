import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { useQuery, useMutation, getApolloContext } from '@apollo/client';
import { GET_NOTE_BY_ID } from '../graphql/queries';
import { CREATE_NOTE, UPDATE_NOTE } from '../graphql/mutations';
import { saveDraft, getDraft, clearDraft, draftKeyFor } from '../utils/draftStore';
import RestoreDraftBanner from '../components/notes/RestoreDraftBanner';
import DeletedBanner from '../components/notes/DeletedBanner';
import { useAutoTranscribe } from '../hooks/useAutoTranscribe';
import { setOpenSketch, sketchClosed } from '@geeksuite/api-client';
import TranscriptStatus from '../components/notes/TranscriptStatus';
import ArchivedBanner from '../components/notes/ArchivedBanner';
import { useNoteArchiveState } from '../hooks/useNoteArchiveState';
import { useArchiveNotes } from '../hooks/useArchiveNotes';
import { usePinNote } from '../hooks/usePinNote';
import { useToast } from '@geeksuite/ui';
import { useAppPreferences } from '@geeksuite/user';
import { NoteShell, NoteMetaBar, NoteActions, NoteTypeRouter, NOTE_TYPES } from '../components/notes';
import { normalizeNoteType } from '../components/notes/noteTypeMeta';
import NoteFooter from '../components/notes/NoteFooter';
import { WikiLinkContext, useNoteLinks } from '../hooks/useNoteLinks';
import { BackButton } from '../components/notes/NoteActions';
import NotePrintView from '../components/notes/NotePrintView';
import useImportStore from '../store/importStore';
import { SaveStatus, SaveAlert } from '../components/notes/SaveStatus';
import { saveStampState } from '../utils/saveStamp';
import useOnline from '../hooks/useOnline';
import useEditorChrome from '../store/editorChromeStore';
import { toDate } from '../utils/dateUtils';
import { useDeleteNote } from '../hooks/useDeleteNote';
import { onNoteCreated, onNoteUpdated } from '../graphql/cacheUpdates';
import { overSizeMessage, saveErrorMessage } from '../utils/saveGuards';
import { isReadableSketchBody } from '@geeksuite/ink';
import UnreadableSketch from '../components/notes/UnreadableSketch';
import { applyInlineTags } from '../utils/inlineTags';
import { buildMeeting, buildOneOnOne, oneOnOneRoot, personName, personOfNote, personTag } from '../utils/oneOnOne';
import OpenItems from '../components/oneOnOne/OpenItems';
import { useNoteCompose } from './noteEditor/useNoteCompose';
import { useSketchConvert } from './noteEditor/useSketchConvert';
import { useSendTasks } from './noteEditor/useSendTasks';
import { useSketchPrint } from './noteEditor/useSketchPrint';
import EditorDialogs from './noteEditor/EditorDialogs';
import { NoteLoading, NoteLoadError } from './noteEditor/EditorLoadStates';
import ReferencePane from '../components/reference/ReferencePane';
import ReferencePicker from '../components/reference/ReferencePicker';
import { ReferenceButton, useReferenceNote } from '../components/reference/useReferenceNote';
import { rememberOpened } from '../utils/recentNotes';

/**
 * NoteEditorPage - Unified page for creating and editing notes
 * Uses the new modular note system components
 *
 * A new note is Markdown. `/notes/new` opens straight into it — there is no
 * "what are you writing?" picker any more (Graphite, 2026-09-29): the New
 * surfaces (NewNoteSheet, NewNoteMenu) offer Photo and Sketch beside it, and
 * Sketch links here with `?type=handwritten`. Any other note type (a leftover
 * text / code / mindmap note, or a `?type=` that is not offered) is a Markdown
 * note (normalizeNoteType).
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

  const { data, loading: isLoadingSelected, error: queryError, refetch } = useQuery(GET_NOTE_BY_ID, {
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
  const [noteType, setNoteType] = useState(NOTE_TYPES.MARKDOWN);
  // Save state, shown by the SaveStamp. Four facts rather than one status
  // string: the old string reached only a button that compared it against
  // 'Saved', so every error message it was ever set to rendered nowhere.
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  isSavingRef.current = isSaving;
  // Set where readOnlyMeta is computed (below); read by automatic transcription.
  const readOnlyMetaRef = useRef(false);
  // A handwritten note whose stored body could not be read. While true: no
  // canvas, no title/tag edits, and handleSave / handleContentChange refuse,
  // so nothing can be written over the original. A REF as well as state: a
  // flush that runs after unmount must see it. Set when the form is seeded
  // (a body that is not a snapshot) or by the editor (tldraw refused it).
  const [unreadable, setUnreadable] = useState(false);
  const unreadableRef = useRef(false);
  const markUnreadable = useCallback((value) => {
    unreadableRef.current = value;
    setUnreadable(value);
  }, []);
  const [reopenNonce, setReopenNonce] = useState(0);
  // The note is in Recently deleted (set where `deletedAt` is read, below).
  const inBinRef = useRef(false);
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
  // Bumped after every successful save, so [[links]] are re-resolved. A
  // counter rather than a boolean so two saves in a row are two refetches.
  const [saveToken, setSaveToken] = useState(0);
  // [[links]] in this note resolve through the gateway; refetched after each
  // save, since that is when links are (re)resolved.
  const resolveLink = useNoteLinks(savedNoteId, saveToken);

  const { notify } = useToast();

  const { preferences: appPrefs } = useAppPreferences('notegeek');
  // 1:1s: the tag people live under, and the person this note belongs to.
  const oneOnOneTag = oneOnOneRoot(appPrefs);
  const oneOnOneTagRef = useRef(oneOnOneTag);
  oneOnOneTagRef.current = oneOnOneTag;
  const [startSheet, setStartSheet] = useState(null);
  const oneOnOnePerson = personOfNote(tags, oneOnOneTag);
  // A second note, read-only, above this one (DOCS/REFERENCE_PANE_SPEC.md).
  // Page state only: nothing about it is saved, and it never touches this form.
  const reference = useReferenceNote();

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
  const isHandwritten = noteType === NOTE_TYPES.HANDWRITTEN;

  // Parse type from URL query for new notes
  const getTypeFromQuery = useCallback(() => {
    if (!isNewNote) return null;
    const params = new URLSearchParams(location.search);
    return normalizeNoteType(params.get('type'));
  }, [isNewNote, location.search]);

  // Reset form for new notes
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setTags([]);
    inlineProvisionalRef.current = new Set();
    inlineSuppressedRef.current = new Set();
    setNoteType(NOTE_TYPES.MARKDOWN);
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
      setNoteType(getTypeFromQuery());
      // `?title=` — an unresolved [[link]]'s "create this note". Seeded, not
      // dirty: nothing is saved until the writer actually writes.
      const params = new URLSearchParams(location.search);
      // `?oneOnOne=<person>` — a new 1:1 (DOCS/ONE_ON_ONE_SPEC.md req 1, 2):
      // a handwritten page, titled and tagged for the person, on the 1:1
      // sheet. Seeded the way `?title=` is: nothing is saved until the first ink.
      const oneOnOne = buildOneOnOne(params.get('oneOnOne'), oneOnOneTagRef.current);
      if (oneOnOne) {
        setNoteType(NOTE_TYPES.HANDWRITTEN);
        setTitle(oneOnOne.title);
        setTags(oneOnOne.tags);
      }
      // `?meeting=1` — "New meeting": the same kind of page on the Meeting
      // sheet, dated and tagged `meeting`.
      const meeting = oneOnOne ? null : buildMeeting(params.get('meeting'));
      if (meeting) {
        setNoteType(NOTE_TYPES.HANDWRITTEN);
        setTitle(meeting.title);
        setTags(meeting.tags);
      }
      setStartSheet((oneOnOne || meeting)?.sheet ?? null);
      const seededTitle = params.get('title');
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
      markUnreadable(
        normalizeNoteType(noteToEdit.type) === NOTE_TYPES.HANDWRITTEN && !isReadableSketchBody(noteToEdit.content),
      );
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
      // On this device only: what the reference picker offers first.
      rememberOpened({ id, title: noteToEdit.title, type: noteToEdit.type });

      setNoteType(normalizeNoteType(noteToEdit.type));

      setDirty(false);
      initializedFor.current = identity;
    }
  }, [id, noteToEdit, freshEnough, isNewNote, location.key, location.search, resetForm, getTypeFromQuery, markUnreadable, reopenNonce]);

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
    if (draft.type) setNoteType(normalizeNoteType(draft.type));
    if (draft.baseUpdatedAt) baseUpdatedAtRef.current = draft.baseUpdatedAt;
    setDirty(true);
  };

  const discardDraft = () => {
    setDraftOffer(null);
    clearDraft(draftKeyRef.current);
  };

  // ── Refs the extracted hooks close over ───────────────────────────────
  // Declared BEFORE the hook calls below (they take them as arguments). These
  // always point to the latest values so stale closures don't bite. The
  // handleSaveRef object is made here and pointed at handleSave once that is
  // defined, later in this same render.
  const handleSaveRef = useRef(null);
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
  // The sketch editor's imperative handle (export for Convert, Send tasks, print).
  const sketchApiRef = useRef(null);

  const [historyOpen, setHistoryOpen] = useState(false);

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

  // The background reader (@geeksuite/api-client) leaves the open sketch
  // to the hook above, and reads it a few seconds after it is closed if the
  // 90 s had not run out (the page used to wait until it was opened again).
  const openSketchId = isHandwritten ? savedNoteId : null;
  useEffect(() => {
    if (!openSketchId) return undefined;
    setOpenSketch(openSketchId);
    return () => sketchClosed(openSketchId);
  }, [openSketchId]);

  const { compose, setCompose, isComposing, canCompose, handleCompose, handleComposeSaveAsNew, handleComposeReplace } = useNoteCompose({
    noteType, content, title, tags, savedNoteId,
    createNoteMutation, updateNoteMutation, navigate, notify,
    setContent, setNoteType, setDirty, setSaveError, setLastSavedAt,
  });

  const {
    transcribe, setTranscribe, canTranscribe, closeTranscribe,
    handleTranscribe, saveFromSketch, handleTranscriptKeepPlain, handleTranscriptCompose,
    transcribeSketchMutation, saveTranscriptEdit, freshTranscriptState, transcribeErrorMessage,
  } = useSketchConvert({
    content, title, tags, isHandwritten, apollo,
    savedNoteIdRef, handleSaveRef, dirtyRef, sketchApiRef, transcriptViewRef,
    setTranscriptView, settleSave, createNoteMutation, navigate, notify,
    setCompose, handleCompose,
  });

  const { sendTasks, setSendTasks, openSendTasks, closeSendTasks, handleSendCorrections, handleSendTasks } = useSendTasks({
    title, savedNoteIdRef, tagsRef, oneOnOneTagRef, sketchApiRef, settleSave,
    freshTranscriptState, transcribeSketchMutation, transcribeErrorMessage,
    saveTranscriptEdit, setTranscriptView, notify,
  });

  // Handle save — allow if either title or content has text

  /**
   * Save what the form holds. Reads the form through refs, not this render's
   * state: a save that runs after the page unmounted (the unmount flush, or a
   * sketch flushing its last strokes on the way out) must write the newest
   * text, not the text of the last render it happened to close over.
   */
  const handleSave = async () => {
    if (discardedRef.current) return;
    // The stored writing could not be read: whatever the form holds is not
    // the note. Nothing is sent, whatever the screen shows or who asks.
    if (unreadableRef.current) return;
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

  handleSaveRef.current = handleSave;

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
    if (unreadableRef.current) return;
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
        // A note in Recently deleted is read-only: nothing to save.
        if (!inBinRef.current) handleSaveRef.current();
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
  // In Recently deleted (review 2026-11-20): read-only, no ⋯ menu; the
  // banner's Restore is the one thing to do. Opened from the bin's list, a
  // [[link]] or history, on a phone or in the two-pane's note pane alike.
  const inBin = Boolean(deletedAt);
  inBinRef.current = inBin;
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

  const { printSketch, handlePrint, isPrinting, printRootRef } = useSketchPrint({ isHandwritten, sketchApiRef, title });

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
    return <NoteLoading />;
  }

  // Error state
  if (selectedError && !isNewNote) {
    return <NoteLoadError message={selectedError} onBack={() => navigate('/notes')} />;
  }

  const isCanvas = isHandwritten;
  // "Try again": ask the server for the note again and open it from that copy.
  const retryOpen = async () => {
    try {
      await refetch?.();
    } catch {
      return; // still offline or failing: stay as we are
    }
    initializedFor.current = null;
    setReopenNonce((n) => n + 1);
  };
  const readOnlyMeta = inBin || unreadable;
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
      <ReferencePane
        noteId={reference.noteId}
        onClose={reference.close}
        onChange={reference.openPicker}
        onOpenFull={(refId) => navigate(`/notes/${refId}`)}
      >
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
            belowMeta={archived || draftOffer || deletedAt || oneOnOnePerson ? (
              <>
              {deletedAt && savedNoteId ? (
                <DeletedBanner noteId={savedNoteId} deletedAt={deletedAt} sx={{ mt: '8px' }} />
              ) : null}
              {draftOffer && !unreadable ? (
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
              {/* Not while a reference note is above: the page needs the height
                  (a landscape tablet has about 700px for both notes). */}
              {oneOnOnePerson && !archived && !reference.noteId ? (
                <Box sx={{ mt: '8px' }}>
                  <OpenItems
                    strip
                    tag={personTag(oneOnOneTag, oneOnOnePerson)}
                    name={personName(oneOnOnePerson)}
                    defaultOpen={isNewNote}
                  />
                </Box>
              ) : null}
              </>
            ) : null}
            actions={inBin ? null : (
              <>
              {reference.available ? (
                <ReferenceButton onClick={reference.openPicker} active={Boolean(reference.noteId)} />
              ) : null}
              <NoteActions
                onSave={handleSave}
                // At once, with Undo in the toast; no confirm (review
                // 2026-11-18 #8). Only a saved note offers Delete; unsaved
                // edits are saved before it goes (handleDeleteNote).
                onDelete={handleDeleteNote}
                canDelete={!isNewNote || !!savedNoteId}
                onHistory={savedNoteId ? () => setHistoryOpen(true) : undefined}
                onPin={savedNoteId ? handlePin : undefined}
                pinned={pinned}
                isPinning={isPinning}
                onFoldIn={canFoldIn && !unreadable ? () => setFoldInOpen(true) : undefined}
                onCompose={canCompose && !unreadable ? () => handleCompose() : undefined}
                isComposing={isComposing}
                onTranscribe={isHandwritten && !unreadable ? () => handleTranscribe() : undefined}
                onSendTasks={isHandwritten && !unreadable ? () => openSendTasks() : undefined}
                canTranscribe={canTranscribe && !unreadable}
                isTranscribing={transcribe?.stage === 'working'}
                onPrint={handlePrint}
                isPrinting={isPrinting}
                onArchive={savedNoteId ? handleArchiveToggle : undefined}
                archived={archived}
                isArchiving={isArchiving}
              />
              </>
            )}
          />
        }
        disableContentScroll={isHandwritten}
        footer={!isCanvas && savedNoteId ? <NoteFooter noteId={savedNoteId} /> : null}
      >
        {unreadable ? (
          <UnreadableSketch onRetry={retryOpen} />
        ) : (
        <NoteTypeRouter
          type={noteType}
          content={content}
          onChange={handleContentChange}
          readOnly={readOnlyMeta}
          isLoading={isLoadingSelected}
          {...(isHandwritten ? { sketchApiRef, onInkEdit, noteId: savedNoteId, startSheet: isNewNote ? startSheet : null, onLoadError: () => markUnreadable(true) } : {})}
        />
        )}
      </NoteShell>
      </ReferencePane>

      {/* Mounted only while open: its list queries have no reason to run otherwise. */}
      {reference.pickerOpen ? (
        <ReferencePicker
          open
          onClose={reference.closePicker}
          onPick={reference.show}
          currentNoteId={savedNoteId}
          person={oneOnOnePerson ? { tag: personTag(oneOnOneTag, oneOnOnePerson), name: personName(oneOnOnePerson) } : null}
        />
      ) : null}

      <NotePrintView
        note={{ title, type: noteType, content, tags, updatedAt: lastSavedAt }}
        sketchImages={isHandwritten ? printSketch.images : null}
        sketchError={isHandwritten ? printSketch.error : null}
        rootRef={printRootRef}
      />

      <EditorDialogs
        savedNoteId={savedNoteId} title={title} noteType={noteType} notify={notify}
        setTitle={setTitle} setContent={setContent} setNoteType={setNoteType}
        setDirty={setDirty} setSaveError={setSaveError} setLastSavedAt={setLastSavedAt}
        historyOpen={historyOpen} setHistoryOpen={setHistoryOpen}
        compose={compose} setCompose={setCompose} saveFromSketch={saveFromSketch}
        handleComposeSaveAsNew={handleComposeSaveAsNew} handleComposeReplace={handleComposeReplace}
        foldInOpen={foldInOpen} setFoldInOpen={setFoldInOpen}
        flushBeforeFoldIn={flushBeforeFoldIn} showServerNote={showServerNote}
        transcribe={transcribe} setTranscribe={setTranscribe} closeTranscribe={closeTranscribe}
        handleTranscribe={handleTranscribe} handleTranscriptCompose={handleTranscriptCompose}
        handleTranscriptKeepPlain={handleTranscriptKeepPlain}
        sendTasks={sendTasks} setSendTasks={setSendTasks} handleSendTasks={handleSendTasks}
        closeSendTasks={closeSendTasks} openSendTasks={openSendTasks}
        handleSendCorrections={handleSendCorrections}
        conflict={conflict} conflictBusy={conflictBusy} handleKeepMine={handleKeepMine}
        handleUseTheirs={handleUseTheirs} handleKeepBoth={handleKeepBoth}
      />

    </Box>
    </WikiLinkContext.Provider>
  );
}

export default NoteEditorPage;