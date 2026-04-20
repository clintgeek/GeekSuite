import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button, Paper, Stack, alpha, useTheme } from '@mui/material';
import {
  TextFields as TextIcon,
  Description as MarkdownIcon,
  Code as CodeIcon,
  AccountTree as MindMapIcon,
  Draw as HandwrittenIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useQuery, useMutation } from '@apollo/client';
import { GET_NOTE_BY_ID, GET_NOTES } from '../graphql/queries';
import { CREATE_NOTE, UPDATE_NOTE } from '../graphql/mutations';
import { NoteShell, NoteMetaBar, NoteActions, NoteTypeRouter, NOTE_TYPES } from '../components/notes';
import DeleteNoteDialog from '../components/DeleteNoteDialog';

// Type card configuration. Colors come from theme.palette.noteTypes so light
// and dark modes stay in sync with NoteRow / NoteMetaBar / NoteViewer / sidebar.
const NOTE_TYPE_CARDS = [
  { type: NOTE_TYPES.TEXT,        icon: TextIcon,        title: 'Rich Text',     description: 'Format with bold, italic, lists, and more',  themeKey: 'text' },
  { type: NOTE_TYPES.MARKDOWN,    icon: MarkdownIcon,    title: 'Markdown',      description: 'Write in Markdown with live preview',         themeKey: 'markdown' },
  { type: NOTE_TYPES.CODE,        icon: CodeIcon,        title: 'Code Snippet',  description: 'Syntax highlighting for any language',        themeKey: 'code' },
  { type: NOTE_TYPES.MINDMAP,     icon: MindMapIcon,     title: 'Mind Map',      description: 'Visual brainstorming and idea mapping',       themeKey: 'mindmap' },
  { type: NOTE_TYPES.HANDWRITTEN, icon: HandwrittenIcon, title: 'Sketch',        description: 'Draw and write with stylus or touch',         themeKey: 'handwritten' },
];

// Type card — workspace style
function TypeCard({ config, onSelect }) {
  const theme = useTheme();
  const Icon = config.icon;
  const color = theme.palette.noteTypes?.[config.themeKey] || theme.palette.text.primary;

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

  const [createNoteMutation] = useMutation(CREATE_NOTE, {
    refetchQueries: [{ query: GET_NOTES }]
  });
  const [updateNoteMutation] = useMutation(UPDATE_NOTE);

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

  // Track initialization
  const initialized = useRef(false);
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

  // Initialize form from note data or URL
  useEffect(() => {
    initialized.current = false;

    if (isNewNote) {
      resetForm();
      const typeFromQuery = getTypeFromQuery();
      if (typeFromQuery) {
        setNoteType(typeFromQuery);
        setHasPickedType(true);
      } else {
        setHasPickedType(false);
      }
      initialized.current = true;
      return;
    }

    if (noteToEdit) {
      setTitle(noteToEdit.title || '');
      setContent(noteToEdit.content || '');
      setTags(noteToEdit.tags || []);

      if (noteToEdit.type && Object.values(NOTE_TYPES).includes(noteToEdit.type)) {
        setNoteType(noteToEdit.type);
        if (noteToEdit.type === NOTE_TYPES.MINDMAP) {
          setIsEditMode(false);
        }
      } else {
        setNoteType(NOTE_TYPES.TEXT);
      }

      initialized.current = true;
    }

    return () => {
      initialized.current = false;
      if (isNewNote) {
        resetForm();
      }
    };
  }, [id, noteToEdit, isNewNote, resetForm, getTypeFromQuery]);

  // Handle save
  const handleSave = async () => {
    if (!content.trim()) {
      setSaveStatus('Error: Content required');
      setTimeout(() => setSaveStatus(''), 2000);
      return;
    }

    setSaveStatus('Saving...');

    const noteData = {
      title: title.trim() || 'Untitled Note',
      content,
      tags,
      type: noteType,
    };

    try {
      let savedNote;
      const currentId = savedNoteId && savedNoteId !== 'undefined' ? savedNoteId : null;

      if (currentId) {
        const { data } = await updateNoteMutation({ variables: { id: currentId, ...noteData } });
        savedNote = data?.updateNote;
      } else {
        const { data } = await createNoteMutation({ variables: noteData });
        savedNote = data?.createNote;
        if (savedNote?.id || savedNote?._id) {
          const newId = savedNote.id || savedNote._id;
          setSavedNoteId(newId);
          navigate(`/notes/${ newId }`, { replace: true });
        }
      }

      if (savedNote) {
        if (savedNote.title && savedNote.title !== title) {
          setTitle(savedNote.title);
        }
        setSaveStatus('Saved');
        setDirty(false);
        setTimeout(() => setSaveStatus(''), 2000);

        if (isMindMap && !isNewNote) {
          setIsEditMode(false);
        }
      } else {
        setSaveStatus('Failed to save');
      }
    } catch (error) {
      setSaveStatus('Error: ' + (error.message || 'Failed to save'));
    }
  };

  // Handle content change
  const handleContentChange = useCallback((newContent) => {
    setContent(newContent);
    setDirty(true);
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
          maxWidth: 480,
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
            Create a note ✨
          </Typography>
          <Typography
            sx={{
              fontSize: '0.95rem',
              color: 'text.secondary',
            }}
          >
            Choose how you want to capture your thoughts
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
        onClose={() => {
          setIsDeleteDialogOpen(false);
          if (!savedNoteId || isNewNote) {
            navigate('/notes');
          }
        }}
        noteId={savedNoteId}
        noteTitle={title}
        isUnsavedNote={!savedNoteId || isNewNote}
      />
    </Box>
  );
}

export default NoteEditorPage;
