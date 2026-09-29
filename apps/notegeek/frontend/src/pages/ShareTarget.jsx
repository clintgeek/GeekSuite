import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { Box, Button, CircularProgress, Typography, useTheme } from '@mui/material';
import { GeekEmptyState, useToast } from '@geeksuite/ui';
import { CREATE_NOTE } from '../graphql/mutations';
import { onNoteCreated } from '../graphql/cacheUpdates';
import { buildNoteFromShareParams } from '../utils/shareTarget';

/**
 * The receiving end of "Share -> NoteGeek" (Android's share
 * sheet). Reached at `/share?title=&text=&url=` from the manifest's
 * `share_target` (GET; see `vite.config.js`). The route itself requires the
 * normal SSO session and, if the visitor is logged out, sends them through
 * `/login?redirect=` with this same query string so nothing shared is lost
 * (App.jsx).
 *
 * `buildNoteFromShareParams` (pure, tested separately) does the actual
 * title/body parsing. This component's only job is: parse once, create the
 * note, open it in the editor — or say plainly that there was nothing to
 * share.
 */
function ShareTarget() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notify } = useToast();

  const shared = useMemo(
    () => ({
      title: searchParams.get('title') || '',
      text: searchParams.get('text') || '',
      url: searchParams.get('url') || '',
    }),
    [searchParams]
  );

  const noteInput = useMemo(() => buildNoteFromShareParams(shared), [shared]);

  const [createNoteMutation] = useMutation(CREATE_NOTE, { update: onNoteCreated });
  const [status, setStatus] = useState(noteInput ? 'saving' : 'empty');
  const started = useRef(false);

  useEffect(() => {
    if (!noteInput || started.current) return;
    started.current = true;
    createNoteMutation({
      variables: { title: noteInput.title, content: noteInput.content, type: 'markdown' },
    })
      .then(({ data }) => {
        const id = data?.createNote?.id;
        if (!id) throw new Error('createNote returned no id');
        navigate(`/notes/${id}/edit`, { replace: true });
      })
      .catch((err) => {
        setStatus('error');
        notify(err?.message || 'Could not save the shared note.', { tone: 'error' });
      });
  }, [noteInput, createNoteMutation, navigate, notify]);

  const containerSx = {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    px: 2,
    py: 6,
    bgcolor: 'background.default',
    color: 'text.primary',
  };

  if (status === 'empty') {
    return (
      <Box sx={containerSx}>
        <GeekEmptyState
          title="Nothing to share"
          description="Share some text or a link to NoteGeek and it'll show up here as a new note."
          action={
            <Button variant="outlined" onClick={() => navigate('/', { replace: true })} sx={{ textTransform: 'none', minHeight: 44 }}>
              Go to NoteGeek
            </Button>
          }
        />
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box sx={containerSx}>
        <GeekEmptyState
          title="Couldn't save that share"
          description="Something went wrong creating the note. Your shared content wasn't lost from the share sheet — try sharing again."
          action={
            <Button variant="outlined" onClick={() => navigate('/', { replace: true })} sx={{ textTransform: 'none', minHeight: 44 }}>
              Go to NoteGeek
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <Box sx={containerSx}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={32} sx={{ color: theme.palette.primary.main }} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Saving your share as a note…
        </Typography>
      </Box>
    </Box>
  );
}

export default ShareTarget;
