import { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import BujoDialog from '../primitives/BujoDialog';

/**
 * ReviewNoteDialog — the written half of the weekly review.
 *
 * BuJoGeek's Review page has always been a *triage* ritual (keep / tomorrow /
 * backlog / cancel) with a "Weekly Review" mode that had nowhere to write the
 * review down. The gateway has had the model for it since inception — a
 * `JournalEntry` of `type: 'weekly'` — with `createJournalEntry` wired and no
 * call site in the app. This is that call site: the ordinary editor the
 * ordinary mutation saves through.
 *
 * The AI draft card seeds it and nothing more. A review written here by hand
 * is the same row, minus the `aiDrafted` mark — which is exactly the contract
 * (DOCS/AI_IDEAS.md rule 2: the model proposes, the user's confirmation is
 * what writes).
 */
const FORM_ID = 'bujo-review-note-form';

const ReviewNoteDialog = ({
  open,
  onClose,
  onSave,
  initialTitle = '',
  initialContent = '',
  aiDrafted = false,
  saving = false,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

  // Re-seed on every open: the card may have drafted again since last time.
  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setContent(initialContent);
  }, [open, initialTitle, initialContent]);

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !saving;

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (!canSave) return;
    onSave?.({ title: title.trim(), content: content.trim(), aiDrafted });
  };

  return (
    <BujoDialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      eyebrow="Weekly review"
      title="Write it down"
      primaryAction={
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          size="small"
          disabled={!canSave}
          sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5, minHeight: 44 }}
        >
          {saving ? 'Saving…' : 'Save review'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} size="small" sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
      }
    >
      <Box component="form" id={FORM_ID} onSubmit={handleSubmit}>
        <TextField
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          label="Title"
          inputProps={{ maxLength: 200 }}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          label="The week"
          placeholder="What got done, what kept slipping, what next week is for."
        />
        {aiDrafted && (
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              color: 'text.muted',
              mt: 1.25,
            }}
          >
            Saved with an AI-drafted mark. Edit it as much as you like — the mark records where it
            started, not who wrote it.
          </Typography>
        )}
      </Box>
    </BujoDialog>
  );
};

export default ReviewNoteDialog;
