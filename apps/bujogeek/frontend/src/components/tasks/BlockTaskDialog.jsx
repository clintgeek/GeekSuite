import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { colors } from '../../theme/colors';

/** Same ceiling the gateway enforces (`MAX_BLOCKED_REASON` in taskService). */
export const MAX_BLOCKED_REASON = 280;

/**
 * BlockTaskDialog — asks the one question worth asking when a task is parked:
 * what is it waiting on? The reason is optional (blocking with an empty box is
 * a legitimate "not now"), capped at 280 characters so the gateway never has
 * to reject the write.
 *
 * Rendered once per page, not once per row: the row's "Block…" action opens it
 * with the task it was fired from.
 */
const BlockTaskDialog = ({ open, task, onClose, onConfirm }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [reason, setReason] = useState('');

  // Fresh box per task — and pre-fill when re-blocking (the gateway rewrites
  // the reason and keeps the original parked-since).
  useEffect(() => {
    if (open) setReason(task?.blockedReason || '');
  }, [open, task]);

  const handleSubmit = (event) => {
    event?.preventDefault();
    onConfirm?.(reason.trim());
  };

  const remaining = MAX_BLOCKED_REASON - reason.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '1.125rem',
            fontWeight: 500,
            pb: 0.5,
          }}
        >
          Park this task
        </DialogTitle>
        <DialogContent>
          {task?.content && (
            <Typography
              sx={{
                fontSize: '0.8125rem',
                color: isDark ? 'rgba(255,245,220,0.5)' : colors.ink[400],
                mb: 1.5,
              }}
            >
              {task.content}
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_BLOCKED_REASON))}
            label="What is it waiting on?"
            placeholder="Optional — e.g. waiting on legal to sign off"
            inputProps={{ maxLength: MAX_BLOCKED_REASON }}
            helperText={`Optional. ${remaining} characters left.`}
          />
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              color: isDark ? 'rgba(255,245,220,0.32)' : colors.ink[300],
              mt: 1.25,
            }}
          >
            It keeps its due date and leaves the log until you unblock it.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" sx={{ textTransform: 'none' }}>
            Block
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};

export default BlockTaskDialog;
