import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { Box, Button, CircularProgress, Typography, useTheme } from '@mui/material';
import { GeekEmptyState, useToast } from '@geeksuite/ui';
import { CREATE_NOTE } from '../graphql/mutations';
import { onNoteCreated } from '../graphql/cacheUpdates';
import { buildNoteFromShareParams } from '../utils/shareTarget';
import { foldInputFromShare } from '../utils/foldIn';
import { graphiteTokens, layout } from '../theme/tokens';
import FoldTargetPicker from '../components/foldin/FoldTargetPicker';
import FoldInSheet from '../components/foldin/FoldInSheet';

/**
 * The receiving end of "Share -> NoteGeek" (Android's share
 * sheet). Reached at `/share?title=&text=&url=` from the manifest's
 * `share_target` (GET; see `vite.config.js`). The route itself requires the
 * normal SSO session and, if the visitor is logged out, sends them through
 * `/login?redirect=` with this same query string so nothing shared is lost
 * (App.jsx).
 *
 * Two ways in (2026-10-01): **Save as a new note** — what this page used to
 * do on arrival, now one tap — or **Add to an existing note**, which ranks
 * the notes the share probably belongs in (hybrid search, local embeddings)
 * and opens Fold-in on the one picked (DOCS/CONTEXT.md §13). The extra tap on
 * the new-note path is the price of not guessing: creating a note on arrival
 * made "add this to my spiders note" impossible without a duplicate to delete.
 *
 * `buildNoteFromShareParams` (pure, tested separately) does the new-note
 * title/body parsing; `foldInputFromShare` the fold-in text.
 */
function ShareTarget() {
  const theme = useTheme();
  const g = graphiteTokens(theme);
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
  const foldText = useMemo(() => foldInputFromShare(shared), [shared]);

  const [createNoteMutation] = useMutation(CREATE_NOTE, { update: onNoteCreated });
  const [status, setStatus] = useState(noteInput ? 'choose' : 'empty');
  const [target, setTarget] = useState(null);

  const saveAsNew = async () => {
    if (!noteInput || status === 'saving') return;
    setStatus('saving');
    try {
      const { data } = await createNoteMutation({
        variables: { title: noteInput.title, content: noteInput.content, type: 'markdown' },
      });
      const id = data?.createNote?.id;
      if (!id) throw new Error('createNote returned no id');
      navigate(`/notes/${id}/edit`, { replace: true });
    } catch (err) {
      setStatus('error');
      notify(err?.message || 'Could not save the shared note.', { tone: 'error' });
    }
  };

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

  if (status === 'saving') {
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

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Box sx={{ maxWidth: layout.contentWidth, mx: 'auto', px: 2, py: { xs: 2, md: 4 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h1" sx={{ fontSize: '1.375rem', fontWeight: 600 }}>Shared to NoteGeek</Typography>
        <Box
          aria-label="What was shared"
          role="region"
          sx={{
            bgcolor: g.sheet,
            border: `1px solid ${g.rule}`,
            borderRadius: '6px',
            px: 1.5,
            py: 1,
            color: g.ink,
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {foldText}
        </Box>
        <Button variant="contained" onClick={saveAsNew} sx={{ textTransform: 'none', minHeight: 48, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
          Save as a new note
        </Button>

        <Box component="section" aria-labelledby="share-existing-heading" sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          <Typography id="share-existing-heading" variant="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            Add to an existing note
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.5 }}>
            Fold-in shows you where it would go before anything changes.
          </Typography>
          <FoldTargetPicker text={foldText} onPick={(n) => setTarget(n)} />
        </Box>
      </Box>

      {target ? (
        <FoldInSheet
          open
          note={target}
          initialInput={foldText}
          onClose={() => setTarget(null)}
          onApplied={({ note }) => navigate(`/notes/${note.id}`, { replace: true })}
        />
      ) : null}
    </Box>
  );
}

export default ShareTarget;
