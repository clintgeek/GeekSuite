/**
 * Circle to task, the confirm step (spec reqs 9–11).
 *
 * The circled ink is read by the gateway's handwriting transcription, shown
 * beside the crop for the user to correct, and only "Create task" creates
 * anything. Cancel, Back, Escape, a failed reading: no task.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useBackToClose } from '@geeksuite/ui';
import { READ_CIRCLED_INK } from '../graphql/documents.js';
import { describeReading, newClientId, readTask, transcriptToText } from '../lib/capture.js';

/** The gateway allows the model 45 s; wait a little longer than that, never forever. */
const READ_TIMEOUT_MS = 50000;

const CAP_MESSAGE = 'Today’s handwriting readings are used up. Type the task in the box instead; readings reset at midnight UTC.';
const READ_FAILED = 'Couldn’t read that handwriting. Try again, or type the task in the box.';
const NOTHING_READ = 'No writing was found in what you circled. Circle the words and try again.';

/** A sentence for the user; never the server's own words, except its own user-facing detail. */
export function readErrorMessage(error) {
  const gql = error?.graphQLErrors?.[0];
  const code = gql?.extensions?.code;
  if (code === 'AI_CAP') return CAP_MESSAGE;
  if (code === 'AI_EMPTY') return NOTHING_READ;
  if (error?.networkError?.statusCode === 413) return 'That is too much writing to read at once. Circle a smaller part.';
  return READ_FAILED;
}

export default function ConfirmTaskDialog({ crop, dayKey, onClose, onCreate, now }) {
  const open = Boolean(crop);
  const titleId = useId();
  const [readInk] = useMutation(READ_CIRCLED_INK);
  /** 'reading' | 'ready' | 'failed' */
  const [phase, setPhase] = useState('reading');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const clientId = useRef('');
  const run = useRef(0);

  const read = useCallback(async () => {
    if (!crop) return;
    const mine = ++run.current;
    setPhase('reading');
    setMessage('');
    setCreateError('');
    try {
      const { data } = await readInk({
        variables: { image: crop.image.base64, mediaType: crop.image.mediaType },
        context: { timeoutMs: READ_TIMEOUT_MS },
      });
      if (mine !== run.current) return;
      const words = transcriptToText(data?.transcribeSketch?.text);
      if (!words) {
        setMessage(NOTHING_READ);
        setPhase('failed');
        return;
      }
      setText(words);
      setPhase('ready');
    } catch (error) {
      if (mine !== run.current) return;
      setMessage(readErrorMessage(error));
      setPhase('failed');
    }
  }, [crop, readInk]);

  // A new crop is a new task: a new idempotency key, a fresh reading.
  useEffect(() => {
    if (!crop) {
      run.current += 1;
      return;
    }
    clientId.current = newClientId();
    setText('');
    setCreating(false);
    read();
  }, [crop, read]);

  const close = useCallback(() => {
    if (creating) return;
    run.current += 1;
    onClose();
  }, [creating, onClose]);

  useBackToClose(open, close);

  const reading = useMemo(() => readTask(text, dayKey, now), [text, dayKey, now]);
  const parts = describeReading(reading, now);

  const create = async (event) => {
    event.preventDefault();
    if (!reading.input || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      await onCreate(reading, clientId.current);
    } catch {
      // Same clientId on the next press: a task that did land is not made twice.
      setCreateError('The task wasn’t created. Check the connection and try again.');
      setCreating(false);
    }
  };

  const preview = crop ? `data:${crop.image.mediaType};base64,${crop.image.base64}` : '';

  return (
    <Dialog
      open={open}
      onClose={close}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="xs"
      PaperProps={{ component: 'form', onSubmit: create, 'data-testid': 'confirm-task', noValidate: true }}
    >
      <DialogTitle id={titleId} sx={{ pb: 1 }}>
        Make this a task?
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {preview ? (
          <Box
            sx={(theme) => ({
              // The crop is ink on white in both modes, like the page it came from in NoteGeek.
              bgcolor: '#FFFFFF',
              border: `1px solid ${theme.palette.day.border}`,
              borderRadius: 2,
              p: 1,
              display: 'grid',
              placeItems: 'center',
              maxHeight: 160,
              overflow: 'hidden',
            })}
          >
            <Box
              component="img"
              src={preview}
              alt="The handwriting you circled"
              sx={{ maxWidth: '100%', maxHeight: 144, objectFit: 'contain', display: 'block' }}
            />
          </Box>
        ) : null}

        {phase === 'reading' ? (
          <Box role="status" data-testid="confirm-reading" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56 }}>
            <CircularProgress size={20} aria-hidden />
            <Typography sx={{ color: 'text.secondary' }}>Reading your handwriting…</Typography>
          </Box>
        ) : null}

        {phase === 'failed' ? (
          <Alert severity="warning" data-testid="confirm-failed" sx={{ alignItems: 'center' }}>
            {message} No task was created.
          </Alert>
        ) : null}

        {phase === 'ready' ? (
          <>
            <TextField
              label="Task"
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoFocus
              multiline
              maxRows={4}
              fullWidth
              inputProps={{ maxLength: 2000, 'data-testid': 'confirm-task-text', enterKeyHint: 'done' }}
              onKeyDown={(event) => {
                // Enter creates; Shift+Enter is not a thing a task needs.
                if (event.key === 'Enter') create(event);
              }}
              helperText="Fix anything that was misread. Dates and times in the text are understood."
            />
            <Box data-testid="confirm-task-summary" aria-live="polite" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minHeight: 28 }}>
              {reading.input ? (
                parts.map((part, index) => (
                  <Box
                    key={`${part}-${index}`}
                    sx={(theme) => ({
                      px: 1,
                      py: 0.375,
                      borderRadius: 1.5,
                      border: `1px solid ${theme.palette.day.border}`,
                      fontSize: '0.8125rem',
                      fontWeight: index === 0 ? 700 : 500,
                      color: 'text.primary',
                      fontVariantNumeric: 'tabular-nums',
                    })}
                  >
                    {part}
                  </Box>
                ))
              ) : (
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>A task needs a few words.</Typography>
              )}
            </Box>
            {createError ? (
              <Alert severity="error" data-testid="confirm-create-error">
                {createError}
              </Alert>
            ) : null}
          </>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={close} disabled={creating} data-testid="confirm-task-cancel" sx={{ minHeight: 44 }}>
          {phase === 'failed' ? 'Close' : 'Cancel'}
        </Button>
        {phase === 'failed' ? (
          <Button variant="contained" onClick={read} data-testid="confirm-task-retry" sx={{ minHeight: 44 }}>
            Try again
          </Button>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={phase !== 'ready' || !reading.input || creating}
            data-testid="confirm-task-create"
            sx={{ minHeight: 44 }}
          >
            {creating ? 'Creating…' : 'Create task'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
