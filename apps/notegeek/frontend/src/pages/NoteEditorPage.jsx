import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import BackIcon from '@mui/icons-material/ArrowBack';
import { useQuery, useMutation } from '@apollo/client';
import { GET_NOTE_BY_ID } from '../graphql/queries';
import { CREATE_NOTE, UPDATE_NOTE, COMPOSE_NOTE, TRANSCRIBE_SKETCH } from '../graphql/mutations';
import ComposeDialog from '../components/editors/ComposeDialog';
import TranscribeDialog from '../components/editors/TranscribeDialog';
import { sketchHasShapes } from '../utils/sketchExport';
import { derivedNoteContent, derivedNoteTitle } from '../utils/sketchToText';
import NoteHistoryDialog from '../components/notes/NoteHistoryDialog';
import { usePinNote } from '../hooks/usePinNote';
import { useToast } from '@geeksuite/ui';
import { useAppPreferences } from '@geeksuite/user';
import { NoteShell, NoteMetaBar, NoteActions, NoteTypeRouter, NOTE_TYPES, SuggestionStrip } from '../components/notes';
import { BackButton } from '../components/notes/NoteActions';
import { SaveStatus, SaveAlert } from '../components/notes/SaveStatus';
import { saveStampState } from '../utils/saveStamp';
import useOnline from '../hooks/useOnline';
import useEditorChrome from '../store/editorChromeStore';
import { toDate } from '../utils/dateUtils';
import DeleteNoteDialog from '../components/DeleteNoteDialog';
import { onNoteCreated, onNoteUpdated } from '../graphql/cacheUpdates';
import { overSizeMessage, saveErrorMessage } from '../utils/saveGuards';
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
function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isNewNote = !id || id === 'new';

  const { data, loading: isLoadingSelected, error: queryError } = useQuery(GET_NOTE_BY_ID, {
    variables: { id },
    skip: isNewNote || id === 'undefined',
    fetchPolicy: 'cache-and-network',
  });
  const noteToEdit = data?.note;
  const selectedError = queryError?.message;

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
  const [noteType, setNoteType] = useState(isNewNote ? NOTE_TYPES.MARKDOWN : NOTE_TYPES.TEXT);
  // Save state, shown by the SaveStamp. Four facts rather than one status
  // string: the old string reached only a button that compared it against
  // 'Saved', so every error message it was ever set to rendered nowhere.
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveEmpty, setSaveEmpty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState(() => (id && id !== 'new' && id !== 'undefined' ? id : null));
  const [dirty, setDirty] = useState(false);
  // Bumped after every successful save; SuggestionStrip watches it and asks
  // the gateway for a fresh set. A counter rather than a boolean so two saves
  // in a row are two requests.
  const [saveToken, setSaveToken] = useState(0);

  const { notify } = useToast();
  const online = useOnline();

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
    const identity = isNewNote ? `new:${ location.search }` : id;
    if (initializedFor.current === identity) return;

    if (isNewNote) {
      resetForm();
      savedNoteIdRef.current = null;
      setNoteType(getTypeFromQuery() || NOTE_TYPES.MARKDOWN);
      setPinnedOverride(null);
      initializedFor.current = identity;
      return;
    }

    if (noteToEdit) {
      setTitle(noteToEdit.title || '');
      setContent(noteToEdit.content || '');
      setTags(noteToEdit.tags || []);
      setLastSavedAt(toDate(noteToEdit.updatedAt));
      setPinnedOverride(null);
      savedNoteIdRef.current = id;

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
  }, [id, noteToEdit, isNewNote, location.search, resetForm, getTypeFromQuery]);

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

  // ── Convert handwriting to text (DOCS/HANDWRITING.md §2) ──────────────
  //
  // Export the page, have it read, let the writer correct the reading, then
  // Compose it or keep it plain. Either way the result is a NEW markdown note
  // whose first line links back here. The sketch is never replaced: nothing
  // on this path calls updateNote or setContent.
  const sketchApiRef = useRef(null);
  const transcribeRunRef = useRef(0);
  const [transcribeSketchMutation] = useMutation(TRANSCRIBE_SKETCH);
  const [transcribe, setTranscribe] = useState(null);
  const canTranscribe = isHandwritten && sketchHasShapes(content);

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

  const handleTranscribe = async () => {
    const run = ++transcribeRunRef.current;
    const stale = () => run !== transcribeRunRef.current;
    // The new note links back to this sketch, so it has to exist on the
    // server by the time that note is saved. Saving now overlaps the read.
    if (dirtyRef.current || !savedNoteIdRef.current) handleSaveRef.current();

    setTranscribe((t) => {
      revokeImage(t?.imageUrl);
      return { open: true, stage: 'working', step: 'export', text: '', error: null, model: null, imageUrl: null, saving: false };
    });

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
    setTranscribe((t) => ({ ...t, step: 'read', imageUrl }));

    try {
      const { data } = await transcribeSketchMutation({
        variables: { image: exported.base64, mediaType: exported.mediaType },
      });
      if (stale()) return;
      const result = data?.transcribeSketch;
      if (!result?.text?.trim()) {
        setTranscribe((t) => ({ ...t, stage: 'error', error: 'The model read nothing back from that page. Try again.' }));
        return;
      }
      setTranscribe((t) => ({ ...t, stage: 'review', text: result.text, model: result.provenance?.model || null }));
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
    const ok = await saveFromSketch(transcribe.text, { composed: false });
    if (!ok) setTranscribe((t) => (t ? { ...t, saving: false } : t));
  };

  const handleTranscriptCompose = () => {
    if (!transcribe?.text?.trim()) return;
    // Hidden, not closed: "Back to transcript" in Compose returns to it.
    setTranscribe((t) => ({ ...t, open: false }));
    handleCompose(transcribe.text);
  };

  const handleSave = async () => {
    if (discardedRef.current) return;

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
    const noteData = {
      title: title.trim() || 'Untitled Note',
      content,
      tags,
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
        const { data } = await updateNoteMutation({ variables: { id: currentId, ...noteData } });
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
          // Deliberately NO navigate() here. It used to send the browser to
          // `/notes/<id>`, which App.jsx routes to NotePage — the read-only
          // VIEWER. Two seconds into typing a new note, autosave threw the
          // writer out of the editor and into a page they could not type in.
          // The note is saved; the URL catches up when they navigate.
        }
      }

      if (savedNote) {
        if (savedNote.title && savedNote.title !== title) {
          setTitle(savedNote.title);
        }
        setSaveError(null);
        setLastSavedAt(new Date());
        setSaveToken((n) => n + 1);
        // Only clean if the form still holds exactly what we wrote.
        if (contentRef.current === noteData.content && titleRef.current === title) {
          setDirty(false);
        }
        if (isMindMap && !isNewNote) {
          setIsEditMode(false);
        }
      } else {
        const message = 'Failed to save — the server returned nothing.';
        if (saveErrorRef.current !== message) notify(message, { tone: 'error' });
        setSaveError(message);
      }
    } catch (error) {
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
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        handleSaveRef.current();
      }
    }
  };

  // Handle content change
  const handleContentChange = useCallback((newContent) => {
    setContent(newContent);
    setDirty(true);
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

  // Debounced autosave — fires 2s after the last edit while dirty.
  // Resets on every content/title/tag change, giving a true debounce.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      handleSaveRef.current();
    }, 2000);
    return () => clearTimeout(timer);
  }, [dirty, content, title, tags]);

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
    return () => {
      if (dirtyRef.current && !discardedRef.current) {
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
   * Navigation is the dialog's; this only changes what this page will do on
   * its way out.
   */
  const handleDiscarded = useCallback(() => {
    discardedRef.current = true;
    setDirty(false);
  }, []);

  // beforeunload guard — prevents accidental data loss on tab-close / hard-reload
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

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

  // Loading state
  if (isLoadingSelected && !isNewNote) {
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
  const saveState = {
    saving: isSaving,
    error: saveError,
    empty: saveEmpty && !content.trim() && !title.trim(),
    dirty,
    offline: !online,
    lastSavedAt,
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NoteShell
        variant={isCanvas ? 'canvas' : 'page'}
        header={
          <NoteMetaBar
            title={title}
            onTitleChange={(v) => { setTitle(v); setDirty(true); }}
            noteType={noteType}
            tags={tags}
            onTagsChange={(v) => { setTags(v); setDirty(true); }}
            readOnly={readOnlyMeta}
            compact={isCanvas}
            leading={<BackButton onBack={handleBack} />}
            status={<SaveStatus {...saveState} />}
            alert={<SaveAlert {...saveState} onRetry={() => handleSaveRef.current()} />}
            // Mounted only when the writer has switched suggestions on: the
            // strip owns a lazy query, and a feature that is off should cost
            // the editor nothing at all, not even a hook.
            belowMeta={suggestEnabled ? (
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
            actions={
              <NoteActions
                onSave={handleSave}
                onDelete={() => setIsDeleteDialogOpen(true)}
                onToggleEdit={() => setIsEditMode(!isEditMode)}
                canDelete={!isNewNote || !!savedNoteId}
                canToggleEdit={isMindMap && !isNewNote && !!savedNoteId}
                isEditMode={isEditMode}
                onHistory={savedNoteId ? () => setHistoryOpen(true) : undefined}
                onPin={savedNoteId ? handlePin : undefined}
                pinned={pinned}
                isPinning={isPinning}
                onCompose={canCompose ? () => handleCompose() : undefined}
                isComposing={isComposing}
                onTranscribe={isHandwritten ? handleTranscribe : undefined}
                canTranscribe={canTranscribe}
                isTranscribing={transcribe?.stage === 'working'}
              />
            }
          />
        }
        disableContentScroll={isHandwritten}
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
            {...(isHandwritten ? { sketchApiRef } : {})}
          />
        </Box>
      </NoteShell>

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
          onRetry={handleTranscribe}
          onCompose={handleTranscriptCompose}
          onKeepPlain={handleTranscriptKeepPlain}
        />
      ) : null}

      <DeleteNoteDialog
        open={isDeleteDialogOpen}
        // Cancel means cancel. This used to navigate to /notes whenever the
        // note was unsaved — so backing out of the confirm dialog left the
        // page, and the unmount flush then saved the draft anyway.
        onClose={() => setIsDeleteDialogOpen(false)}
        onDiscarded={handleDiscarded}
        noteId={savedNoteId}
        noteTitle={title}
        // `savedNoteId` alone: once autosave has created the note it is a real,
        // deletable row, even though the URL is still /notes/new and
        // `isNewNote` is still true. Keying on `isNewNote` too offered
        // "Discard" for a note that was already on disk.
        isUnsavedNote={!savedNoteId}
      />
    </Box>
  );
}

export default NoteEditorPage;
