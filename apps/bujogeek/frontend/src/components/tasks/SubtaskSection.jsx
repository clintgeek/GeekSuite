import { useCallback, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { reorderedSubtaskIds, subtaskId } from '../../utils/subtasks';

/**
 * SubtaskSection — the "Subtasks" block inside `TaskEditor`: add, reorder,
 * remove.
 *
 * Two modes, one list, because the writer should not have to know which they
 * are in:
 *
 *   - **Editing an existing entry** (`taskId` set) every change is a mutation
 *     that lands immediately. Steps are real tasks with real ids the moment
 *     they exist, and a step you add and then abandon the dialog on is a step
 *     you added — same as anywhere else in this app.
 *   - **Creating a new entry** (`taskId` null) there is nothing to attach a
 *     step to yet, so they are buffered here and created by the caller once
 *     the parent exists. `onPendingChange` is how they get back out.
 *
 * Reorder is up/down buttons rather than drag. Dragging a five-item list
 * inside a dialog that is itself full-screen on a phone is a fight between
 * three scroll containers, and a 44px arrow is something you can actually hit
 * — which is the same reason the row action strip became a sheet.
 */
const SubtaskSection = ({
  taskId,
  subtasks = [],
  onAdd,
  onRemove,
  onReorder,
  pending = [],
  onPendingChange,
  disabled = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const isEditing = Boolean(taskId);
  const items = isEditing ? subtasks : pending;

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;
  const rowRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`;
  const target = isMobile ? 44 : 32;

  const commitDraft = useCallback(async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (isEditing) {
        const created = await onAdd?.(content);
        // A failed add leaves the text where it was, so nothing is retyped.
        if (created) setDraft('');
      } else {
        onPendingChange?.([...pending, { tempId: `pending-${Date.now()}-${pending.length}`, content }]);
        setDraft('');
      }
    } finally {
      setBusy(false);
    }
  }, [draft, busy, isEditing, onAdd, onPendingChange, pending]);

  const removeAt = useCallback(async (index) => {
    const item = items[index];
    if (!item) return;
    if (isEditing) {
      await onRemove?.(item);
    } else {
      onPendingChange?.(pending.filter((_, i) => i !== index));
    }
  }, [items, isEditing, onRemove, onPendingChange, pending]);

  const move = useCallback(async (index, delta) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    if (isEditing) {
      await onReorder?.(reorderedSubtaskIds({ subtasks }, index, to));
    } else {
      const next = [...pending];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      onPendingChange?.(next);
    }
  }, [items.length, isEditing, onReorder, subtasks, pending, onPendingChange]);

  return (
    <Box sx={{ borderTop: dottedRule, pt: 2.5, mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: theme.palette.text.primary,
          }}
        >
          Subtasks
        </Typography>
        {items.length > 0 && (
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: captionInk,
            }}
          >
            {items.filter((i) => i.status === 'completed').length}/{items.length} done
          </Typography>
        )}
      </Box>

      {items.length === 0 && (
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            color: mutedInk,
            mb: 1.5,
          }}
        >
          {isEditing
            ? 'No steps yet — break this down if it helps.'
            : 'Steps you add here are created with the entry.'}
        </Typography>
      )}

      {items.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          {items.map((item, index) => {
            const id = isEditing ? subtaskId(item) : item.tempId;
            const done = item.status === 'completed';
            const label = String(item.content ?? '').trim();
            return (
              <Box
                key={id || index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  minHeight: target + 4,
                  borderBottom: index < items.length - 1 ? rowRule : 'none',
                }}
              >
                {/* Status is shown, not set: a step is completed from its row
                    in the log, where the gesture belongs. */}
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    ml: 0.25,
                    mr: 0.5,
                    borderRadius: '50%',
                    border: `1.5px solid ${done ? colors.aging.fresh : (isDark ? 'rgba(255,255,255,0.22)' : colors.ink[300])}`,
                    backgroundColor: done ? colors.aging.fresh : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                  aria-hidden="true"
                >
                  {done && <Check size={11} strokeWidth={3} />}
                </Box>

                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '0.875rem',
                    color: done ? mutedInk : theme.palette.text.primary,
                    textDecoration: done ? 'line-through' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Typography>

                <Tooltip title="Move up" placement="top">
                  <span>
                    <IconButton
                      type="button"
                      size="small"
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move "${label}" up`}
                      sx={{ width: target, height: target, color: mutedInk }}
                    >
                      <ArrowUp size={15} strokeWidth={1.75} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down" placement="top">
                  <span>
                    <IconButton
                      type="button"
                      size="small"
                      disabled={disabled || index === items.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move "${label}" down`}
                      sx={{ width: target, height: target, color: mutedInk }}
                    >
                      <ArrowDown size={15} strokeWidth={1.75} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove" placement="top">
                  <span>
                    <IconButton
                      type="button"
                      size="small"
                      disabled={disabled}
                      onClick={() => removeAt(index)}
                      aria-label={`Remove "${label}"`}
                      sx={{
                        width: target,
                        height: target,
                        color: mutedInk,
                        '&:hover': { color: colors.aging.overdue },
                      }}
                    >
                      <X size={15} strokeWidth={1.75} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // The dialog's Save button lives in the header and is wired to the
          // form by id, so a bare Enter in here would submit the whole entry.
          // Enter adds the step instead; the writer still has Save where it
          // has always been.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              commitDraft();
            }
          }}
          placeholder="Add a step…"
          size="small"
          fullWidth
          disabled={disabled}
          inputProps={{ 'aria-label': 'New subtask' }}
        />
        <Button
          type="button"
          onClick={commitDraft}
          disabled={disabled || busy || !draft.trim()}
          startIcon={<Plus size={16} />}
          size="small"
          sx={{
            flexShrink: 0,
            minHeight: target,
            fontSize: '0.8125rem',
            textTransform: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
};

export default SubtaskSection;
