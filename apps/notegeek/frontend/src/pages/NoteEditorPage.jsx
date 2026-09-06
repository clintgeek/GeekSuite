import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button, Paper, Stack, alpha, useTheme } from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import TextIcon from '@mui/icons-material/TextFields';
import MarkdownIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import MindMapIcon from '@mui/icons-material/AccountTree';
import HandwrittenIcon from '@mui/icons-material/Draw';
import BackIcon from '@mui/icons-material/ArrowBack';
import { useQuery, useMutation } from '@apollo/client';
import { GET_NOTE_BY_ID } from '../graphql/queries';
import { CREATE_NOTE, UPDATE_NOTE } from '../graphql/mutations';
import { useToast } from '@geeksuite/ui';
import { NoteShell, NoteMetaBar, NoteActions, NoteTypeRouter, NOTE_TYPES } from '../components/notes';
import DeleteNoteDialog from '../components/DeleteNoteDialog';
import { onNoteCreated, onNoteUpdated } from '../graphql/cacheUpdates';
import { overSizeMessage, saveErrorMessage } from '../utils/saveGuards';
import { noteTypeColor, layout } from '../theme/tokens';

// Type card configuration. Colors come from theme.palette.noteTypes so light
// and dark modes stay in sync with NoteRow / NoteMetaBar / NoteViewer / sidebar.
const NOTE_TYPE_CARDS = [
  { type: NOTE_TYPES.TEXT,        icon: TextIcon,        title: 'Rich Text',  description: 'Bold, italic, lists',         themeKey: 'text' },
  { type: NOTE_TYPES.MARKDOWN,    icon: MarkdownIcon,    title: 'Markdown',   description: 'Plain text with live preview', themeKey: 'markdown' },
  { type: NOTE_TYPES.CODE,        icon: CodeIcon,        title: 'Code',       description: 'Syntax-highlighted snippets',  themeKey: 'code' },
  { type: NOTE_TYPES.MINDMAP,     icon: MindMapIcon,     title: 'Mind Map',   description: 'Visual idea mapping',         themeKey: 'mindmap' },
  { type: NOTE_TYPES.HANDWRITTEN, icon: HandwrittenIcon, title: 'Sketch',     description: 'Freehand drawing and notes',  themeKey: 'handwritten' },
];

// Type card — workspace style
function TypeCard({ config, onSelect }) {
  const theme = useTheme();
  const Icon = config.icon;
  const color = noteTypeColor(theme, config.themeKey);

  return (
    <Box
      component="button"
      onClick={() => onSelect(config.type)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: '100%',
        py: 1,
        px: 1.5,
        border: `1px solid ${ theme.palette.divider }`,
        borderRadius: 2,
        cursor: 'pointer',
        textAlign: 'left',
        bgcolor: 'background.paper',
        transition: 'all 100ms ease',
        '&:hover': {
          borderColor: alpha(color, 0.4),
          bgcolor: alpha(color, 0.03),
        },
        '&:focus-visible': {
          outline: `2px solid ${ color }`,
          outlineOffset: 2,
        },
      }}
    >
      <Icon sx={{ fontSize: 18, color: color, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.8125rem',
            color: 'text.primary',
          }}
        >
          {config.title}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            color: 'text.disabled',
          }}
        >
          {config.description}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * NoteEditorPage - Unified page for creating and editing notes
 * Uses the new modular note system components
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

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [noteType, setNoteType] = useState(NOTE_TYPES.TEXT);
  const [hasPickedType, setHasPickedType] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState(() => (id && id !== 'new' && id !== 'undefined' ? id : null));
  const [dirty, setDirty] = useState(false);

  const { notify } = useToast();

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
    setNoteType(NOTE_TYPES.TEXT);
    setHasPickedType(false);
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
      const typeFromQuery = getTypeFromQuery();
      if (typeFromQuery) {
        setNoteType(typeFromQuery);
        setHasPickedType(true);
      } else {
        setHasPickedType(false);
      }
      initializedFor.current = identity;
      return;
    }

    if (noteToEdit) {
      setTitle(noteToEdit.title || '');
      setContent(noteToEdit.content || '');
      setTags(noteToEdit.tags || []);
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
  const handleSave = async () => {
    if (discardedRef.current) return;

    if (!content.trim() && !title.trim()) {
      setSaveStatus('Error: Add a title or some content first');
      setTimeout(() => setSaveStatus(''), 2000);
      return;
    }

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
      setSaveStatus('');
      notify(tooBig, { tone: 'error' });
      return;
    }

    setSaveStatus('Saving...');
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
        setSaveStatus('Saved');
        // Only clean if the form still holds exactly what we wrote.
        if (contentRef.current === noteData.content && titleRef.current === title) {
          setDirty(false);
        }
        setTimeout(() => setSaveStatus(''), 2000);

        if (isMindMap && !isNewNote) {
          setIsEditMode(false);
        }
      } else {
        setSaveStatus('');
        notify('Failed to save — the server returned nothing.', { tone: 'error' });
      }
    } catch (error) {
      // `saveStatus` only ever reached NoteActions, which compares it against
      // the single string 'Saved'. Every error message this used to set was
      // rendered nowhere at all: a note that could not be saved looked exactly
      // like one that had been.
      setSaveStatus('');
      notify(saveErrorMessage(error), { tone: 'error' });
    } finally {
      savingRef.current = false;
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

  const showNewTypePicker = isNewNote && !savedNoteId && !hasPickedType;
  if (showNewTypePicker) {
    return (
      <Box
        sx={{
          width: '100%',
          maxWidth: layout.pickerWidth,
          mx: 'auto',
          py: { xs: 2, sm: 4 },
          px: { xs: 2, sm: 3 },
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Back button */}
        <Button
          startIcon={<BackIcon />}
          onClick={() => navigate(-1)}
          sx={{
            alignSelf: 'flex-start',
            mb: 3,
            color: 'text.secondary',
            fontWeight: 500,
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
        >
          Back
        </Button>

        {/* Header */}
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography
            sx={{
              fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 700,
              fontSize: { xs: '1.75rem', sm: '2rem' },
              color: 'text.primary',
              mb: 1,
            }}
          >
            New note
          </Typography>
          <Typography
            sx={{
              fontSize: '0.875rem',
              color: 'text.secondary',
            }}
          >
            Choose a format
          </Typography>
        </Box>

        {/* Type cards */}
        <Stack spacing={1.5}>
          {NOTE_TYPE_CARDS.map((config, index) => (
            <TypeCard
              key={config.type}
              config={config}
              index={index}
              onSelect={(type) => {
                navigate(`/notes/new?type=${ encodeURIComponent(type) }`, { replace: true });
              }}
            />
          ))}
        </Stack>
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
            fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NoteShell
        header={
          <NoteMetaBar
            title={title}
            onTitleChange={(v) => { setTitle(v); setDirty(true); }}
            noteType={noteType}
            tags={tags}
            onTagsChange={(v) => { setTags(v); setDirty(true); }}
            readOnly={!isEditMode && isMindMap}
            dirty={dirty}
            actions={
              <NoteActions
                onSave={handleSave}
                onDelete={() => setIsDeleteDialogOpen(true)}
                onToggleEdit={() => setIsEditMode(!isEditMode)}
                onBack={handleBack}
                isSaving={saveStatus === 'Saving...'}
                saveStatus={saveStatus}
                canDelete={!isNewNote || !!savedNoteId}
                canToggleEdit={isMindMap && !isNewNote && !!savedNoteId}
                isEditMode={isEditMode}
                variant="inline"
              />
            }
          />
        }
        actions={
          <NoteActions
            onSave={handleSave}
            onDelete={() => setIsDeleteDialogOpen(true)}
            onToggleEdit={() => setIsEditMode(!isEditMode)}
            onBack={handleBack}
            isSaving={saveStatus === 'Saving...'}
            saveStatus={saveStatus}
            canDelete={!isNewNote || !!savedNoteId}
            canToggleEdit={isMindMap && !isNewNote && !!savedNoteId}
            isEditMode={isEditMode}
            variant="bottom-bar"
          />
        }
        disableContentScroll={isHandwritten}
      >
        <NoteTypeRouter
          type={noteType}
          content={content}
          onChange={handleContentChange}
          readOnly={!isEditMode && isMindMap}
          isLoading={isLoadingSelected}
        />
      </NoteShell>

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
