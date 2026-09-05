import { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography, useTheme } from '@mui/material';
import BujoDialog from '../primitives/BujoDialog';
import { colors } from '../../theme/colors';
import { domainInk } from '../../theme/inks';

/**
 * AddSubtaskDialog — one field, for adding a step from a row's action strip
 * without opening the whole editor.
 *
 * Deliberately not the quick-add surface: `InlineQuickAdd` parses the full
 * entry grammar (`#tag`, `!high`, `/date`, `~blocked`), and a step is a line
 * of plain text under something that already carries all of that. Anything
 * more than a sentence belongs in the editor's Subtasks section, which is one
 * tap away and does reordering too.
 *
 * Stays open between adds so a writer can break a task into five steps in one
 * sitting; Enter commits, Escape (or Done) closes.
 */
const FORM_ID = 'bujo-add-subtask-form';

const AddSubtaskDialog = ({ open, task, onClose, onAdd }) => {
  const theme = useTheme();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (open) {
      setContent('');
      setAdded(0);
    }
  }, [open, task]);

  const submit = async (event) => {
    event?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await onAdd?.(task, trimmed);
      // On failure the text stays put — the context has already toasted, and
      // retyping a sentence you just wrote is the worst kind of small insult.
      if (created) {
        setContent('');
        setAdded((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const mutedInk = theme.palette.text.secondary;
  const parentName = String(task?.content ?? '').trim();

  return (
    <BujoDialog
      open={open}
      onClose={onClose}
      eyebrow="Break it down"
      title="Add a subtask"
      primaryAction={
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          size="small"
          disabled={busy || !content.trim()}
          sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5 }}
        >
          Add
        </Button>
      }
      secondaryAction={
        <Button
          onClick={onClose}
          size="small"
          sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
        >
          {added > 0 ? 'Done' : 'Cancel'}
        </Button>
      }
      keepSecondaryOnMobile
      maxWidth="xs"
    >
      <Box component="form" id={FORM_ID} onSubmit={submit}>
        {parentName && (
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              color: mutedInk,
              mb: 1.5,
            }}
          >
            a step of “{parentName}”
          </Typography>
        )}
        <TextField
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What is the next step?"
          size="small"
          fullWidth
          autoFocus
          disabled={busy}
          inputProps={{ 'aria-label': 'Subtask' }}
        />
        {added > 0 && (
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: domainInk(colors.aging.fresh, theme),
              mt: 1.25,
            }}
          >
            {added} step{added === 1 ? '' : 's'} added
          </Typography>
        )}
      </Box>
    </BujoDialog>
  );
};

export default AddSubtaskDialog;
