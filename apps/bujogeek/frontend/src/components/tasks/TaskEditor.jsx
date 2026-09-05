import { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
  Autocomplete,
  Typography,
  useTheme,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { StickyNote } from 'lucide-react';
import { useMutation } from '@apollo/client';
import { useTaskContext } from '../../context/TaskContext.jsx';
import useTaskTags from '../../hooks/useTaskTags';
import useCollections from '../../hooks/useCollections';
import { CREATE_NOTE } from '../../graphql/notegeekMutations';
import { colors } from '../../theme/colors';
import BujoDialog from '../primitives/BujoDialog';
import RecurringEditDialog from './RecurringEditDialog';
import { buildRecurrenceRule, frequencyFromRecurrenceRule } from '../../utils/parseTaskInput';
import { useToast } from '@geeksuite/ui';

const SIGNIFIER_OPTIONS = [
  { value: '*', label: 'Task', mono: '*' },
  { value: '@', label: 'Event', mono: '@' },
  { value: '-', label: 'Note', mono: '-' },
  { value: '?', label: 'Question', mono: '?' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Normal', color: null },
  { value: 1, label: 'High', color: colors.priority.high },
  { value: 2, label: 'Medium', color: colors.priority.medium },
  { value: 3, label: 'Low', color: colors.priority.low },
];

// UI-only frequency picker. The value never leaves the component as-is — it is
// translated into an RRULE (`recurrenceRule`) on submit. The legacy
// `recurrencePattern` field is no longer written by this editor.
const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * TaskEditor — the editorial task edit/create dialog.
 *
 * Fraunces serif title, grouped field sections with dotted dividers,
 * IBM Plex Mono signifier badges, warm parchment background — all of which
 * now come from `BujoDialog`, the app's skin over `GeekDialog`. The mobile
 * rule (full-screen below `sm`, close ✕ / title / primary action header) is
 * inherited from the primitive rather than re-implemented here.
 *
 * The form lives in the dialog body while Save sits in the header, so the
 * `<form id>` / `<Button form=…>` pairing is what keeps submit (and
 * Enter-to-submit) working across the two.
 */
const FORM_ID = 'bujo-task-editor-form';
const TaskEditor = ({ open, onClose, task = null }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { createTask, updateTask } = useTaskContext();
  const existingTags = useTaskTags();
  const { collections } = useCollections();
  const { notify } = useToast();
  const [createNote, { loading: savingNote }] = useMutation(CREATE_NOTE);
  const [formData, setFormData] = useState({
    content: '',
    signifier: '*',
    status: 'pending',
    priority: null,
    dueDate: null,
    tags: [],
    note: '',
    recurrenceFreq: 'none',
    collectionId: '',
  });
  const [loading, setLoading] = useState(false);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);

  const isEditing = Boolean(task);

  useEffect(() => {
    if (task) {
      setFormData({
        content: task.content || '',
        signifier: task.signifier || '*',
        status: task.status || 'pending',
        priority: task.priority || null,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        tags: task.tags || [],
        note: task.note || '',
        recurrenceFreq: frequencyFromRecurrenceRule(task.recurrenceRule),
        collectionId: task.collectionId || '',
      });
    } else {
      setFormData({
        content: '',
        signifier: '*',
        status: 'pending',
        priority: null,
        dueDate: null,
        tags: [],
        note: '',
        recurrenceFreq: 'none',
        collectionId: '',
      });
    }
  }, [task]);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
  };

  const handleSaveAsNote = async () => {
    try {
      await createNote({
        variables: {
          title: formData.content,
          content: formData.note || formData.content,
          type: 'text',
          tags: formData.tags || [],
        },
      });
      notify('Note saved to NoteGeek', { tone: 'success' });
    } catch {
      notify('Failed to save note to NoteGeek', { tone: 'error' });
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (isEditing && (task.isSeriesMaster || task.seriesId || task.recurrenceRule || task.id?.startsWith('virtual_') || task._id?.startsWith('virtual_'))) {
      setRecurringDialogOpen(true);
      return;
    }
    await performSubmit('THIS_INSTANCE');
  };

  const handleRecurringConfirm = async (editScope) => {
    setRecurringDialogOpen(false);
    await performSubmit(editScope);
  };

  /**
   * Translate the UI-only frequency picker into the RRULE the API stores.
   * `recurrenceFreq` itself is never sent.
   */
  const buildPayload = () => {
    const { recurrenceFreq, collectionId, ...rest } = formData;
    return {
      ...rest,
      recurrenceRule: buildRecurrenceRule(recurrenceFreq, formData.dueDate),
      // '' is the "Not in a collection" option — send it as an explicit null so
      // the task is filed out of whatever collection it was in.
      collectionId: collectionId || null,
    };
  };

  const performSubmit = async (editScope) => {
    setLoading(true);
    try {
      const payload = buildPayload();
      if (isEditing) {
        await updateTask(task.id || task._id, payload, editScope);
      } else {
        await createTask(payload);
      }
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setLoading(false);
    }
  };

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  return (
    <BujoDialog
      open={open}
      onClose={onClose}
      eyebrow={isEditing ? 'Editing' : 'New entry'}
      title={isEditing ? 'Edit Task' : 'New Task'}
      primaryAction={
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          disabled={loading || !formData.content.trim()}
          size="small"
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            textTransform: 'none',
            px: 2.5,
          }}
        >
          {isEditing ? 'Update' : 'Create'}
        </Button>
      }
      secondaryAction={
        <>
          {isEditing && (
            <Button
              onClick={handleSaveAsNote}
              disabled={savingNote}
              startIcon={<StickyNote size={16} />}
              size="small"
              sx={{
                mr: 'auto',
                fontSize: '0.8125rem',
                color: mutedInk,
                textTransform: 'none',
                '&:hover': { color: primaryInk, backgroundColor: 'transparent' },
              }}
            >
              Save as Note
            </Button>
          )}
          <Button
            onClick={onClose}
            size="small"
            sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
          >
            Cancel
          </Button>
        </>
      }
      // Full-screen mode swallows the footer; keep it while editing so
      // "Save as Note" survives on a phone.
      keepSecondaryOnMobile={isEditing}
    >
      <Box component="form" id={FORM_ID} onSubmit={handleSubmit}>
          {/* ─── Content section ─────────────────────────────────── */}
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: primaryInk,
                mb: 1.25,
              }}
            >
              What needs to happen?
            </Typography>
            <TextField
              value={formData.content}
              onChange={handleChange('content')}
              multiline
              rows={2}
              required
              fullWidth
              placeholder="Write your task..."
              variant="outlined"
              size="small"
            />
          </Box>

          {/* ─── Note section ────────────────────────────────────── */}
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: primaryInk,
                mb: 1.25,
              }}
            >
              Notes
            </Typography>
            <TextField
              value={formData.note}
              onChange={handleChange('note')}
              multiline
              rows={2}
              fullWidth
              placeholder="Add context or details..."
              variant="outlined"
              size="small"
            />
          </Box>

          <Box sx={{ borderTop: dottedRule, pt: 2.5, mb: 2.5 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: primaryInk,
                mb: 1.5,
              }}
            >
              Details
            </Typography>

            {/* Type + Priority row */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.signifier}
                  onChange={handleChange('signifier')}
                  label="Type"
                >
                  {SIGNIFIER_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          component="span"
                          sx={{
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: mutedInk,
                            width: 16,
                            textAlign: 'center',
                          }}
                        >
                          {opt.mono}
                        </Box>
                        {opt.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select
                  value={formData.priority ?? ''}
                  onChange={handleChange('priority')}
                  label="Priority"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value ?? 'normal'} value={opt.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {opt.color && (
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: opt.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {opt.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Due date */}
            <Box sx={{ mb: 2 }}>
              <DateTimePicker
                label="Due date & time"
                value={formData.dueDate}
                onChange={(newDate) => setFormData({ ...formData, dueDate: newDate })}
                slotProps={{
                  textField: { fullWidth: true, size: 'small' },
                }}
              />
            </Box>

            {/* Tags — pick from existing or type new (Enter/comma) */}
            <Box sx={{ mb: 2 }}>
              <Autocomplete
                multiple
                freeSolo
                options={existingTags}
                value={formData.tags}
                onChange={(event, newValue) =>
                  setFormData({ ...formData, tags: newValue })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Tags"
                    placeholder={formData.tags.length ? 'Add another…' : 'Pick or type a tag'}
                    size="small"
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((tag, index) => {
                    const { key, ...chipProps } = getTagProps({ index });
                    return (
                      <Chip
                        key={key}
                        label={tag}
                        size="small"
                        sx={{
                          fontWeight: 500,
                          fontSize: '0.75rem',
                          backgroundColor: isDark ? 'rgba(96,152,204,0.15)' : colors.primary[50],
                          color: colors.primary[600],
                        }}
                        {...chipProps}
                      />
                    );
                  })
                }
              />
            </Box>

            {/* Collection — file this entry into a list outside the daily log.
                Archived collections are hidden unless the task is already in
                one, so a filed task never silently loses its home. */}
            <FormControl fullWidth size="small">
              <InputLabel>Collection</InputLabel>
              <Select
                value={
                  collections.some((c) => c.id === formData.collectionId)
                    ? formData.collectionId
                    : ''
                }
                onChange={handleChange('collectionId')}
                label="Collection"
              >
                <MenuItem value="">
                  <Box component="span" sx={{ color: mutedInk }}>Not in a collection</Box>
                </MenuItem>
                {collections
                  .filter((c) => !c.archived || c.id === formData.collectionId)
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {c.name}
                        {c.archived && (
                          <Box component="span" sx={{ fontSize: '0.6875rem', color: mutedInk }}>
                            (archived)
                          </Box>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Box>

          {/* ─── Recurrence section ──────────────────────────────── */}
          <Box sx={{ borderTop: dottedRule, pt: 2.5, mb: 1 }}>
            <Typography
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.6875rem',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: captionInk,
                mb: 1.5,
              }}
            >
              Repeats
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Repeat interval</InputLabel>
              <Select
                value={formData.recurrenceFreq}
                onChange={handleChange('recurrenceFreq')}
                label="Repeat interval"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
      </Box>

      <RecurringEditDialog
        open={recurringDialogOpen}
        actionType="edit"
        onClose={() => setRecurringDialogOpen(false)}
        onConfirm={handleRecurringConfirm}
      />
    </BujoDialog>
  );
};

export default TaskEditor;
