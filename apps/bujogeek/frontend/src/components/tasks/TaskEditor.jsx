import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
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
  Skeleton,
  useTheme,
} from '@mui/material';
import { StickyNote } from 'lucide-react';
import { useMutation } from '@apollo/client';
import { useTaskContext } from '../../context/TaskContext.jsx';
import useTaskTags from '../../hooks/useTaskTags';
import useCollections from '../../hooks/useCollections';
import { CREATE_NOTE } from '../../graphql/notegeekMutations';
import { colors } from '../../theme/colors';
import BujoDialog from '../primitives/BujoDialog';
import RecurringEditDialog from './RecurringEditDialog';
import SubtaskSection from './SubtaskSection';
import { orderedSubtasks, subtaskId } from '../../utils/subtasks';
import { buildRecurrenceRule, frequencyFromRecurrenceRule } from '../../utils/parseTaskInput';
import { useToast } from '@geeksuite/ui';

/**
 * `@mui/x-date-pickers`' `DateTimePicker` (and the `useMobilePicker`/
 * `AdapterDateFns`-adjacent tail behind it, ~150+ kB — see `DOCS/CONTEXT.md`
 * § Frontend — Bundle) is the single biggest thing this always-mounted
 * (`open={bool}`) dialog was pulling onto every route that renders it (Q55).
 * `TaskDueDateField` isolates the picker import so it becomes a real dynamic
 * `import()`, fetched only when `BujoDialog` actually renders this subtree —
 * i.e. the dialog's first open, not the page's first paint (`GeekDialog`
 * doesn't mount its body while closed). Unmounting `TaskEditor` itself on
 * close was rejected because it would reset form state and kill MUI's close
 * transition; this gets the same byte win without that behaviour change.
 *
 * The fallback below is a plain MUI `Skeleton` rather than the app's warm-
 * parchment `SkeletonBar` (`components/shared/SkeletonLoader.jsx`) —
 * `Skeleton` ships inside `@mui/material`, which this file already pulls in
 * eagerly, so it costs nothing extra to reach for here, and it's on screen for
 * one chunk fetch on the dialog's first open, not a loading surface a user
 * sits with.
 */
const TaskDueDateField = lazy(() => import('./TaskDueDateField'));

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
  const {
    createTask, updateTask, addSubtask, reorderSubtasks, deleteTask,
  } = useTaskContext();
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
  // Steps are held locally rather than read back through the `task` prop: the
  // pages that open this dialog hold the task they opened it with in their own
  // state, so a step added in here would never reach the prop.
  const [subtasks, setSubtasks] = useState([]);
  // Create mode only — steps typed before the parent exists.
  const [pendingSubtasks, setPendingSubtasks] = useState([]);

  const isEditing = Boolean(task);
  const taskId = task ? (task.id || task._id) : null;
  // A recurring occurrence has no document of its own to hang steps off; the
  // gateway would have to materialize one, which is a bigger decision than a
  // dialog should make on the writer's behalf.
  const isVirtual = String(taskId ?? '').startsWith('virtual_');

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
      setSubtasks(orderedSubtasks(task));
      setPendingSubtasks([]);
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
      setSubtasks([]);
      setPendingSubtasks([]);
    }
  }, [task]);

  // ─── Steps ──────────────────────────────────────────────────────────────
  // Each of these lands immediately when editing; in create mode the section
  // buffers instead and `performSubmit` plays them back once the parent has an
  // id. Local state mirrors what the mutation returned so the list is right
  // without waiting for a refetch.

  const handleAddSubtask = useCallback(async (content) => {
    if (!taskId) return null;
    const created = await addSubtask(taskId, { content });
    if (created) setSubtasks((prev) => [...prev, created]);
    return created;
  }, [taskId, addSubtask]);

  const handleRemoveSubtask = useCallback(async (subtask) => {
    const id = subtaskId(subtask);
    // A step is an ordinary task, so removing one is deleting it — there is no
    // "detach" that would leave a parentless fragment in the log.
    await deleteTask(id, 'THIS_INSTANCE');
    setSubtasks((prev) => prev.filter((child) => subtaskId(child) !== id));
  }, [deleteTask]);

  const handleReorderSubtasks = useCallback(async (orderedIds) => {
    if (!taskId) return;
    const previous = subtasks;
    const byId = new Map(previous.map((child) => [subtaskId(child), child]));
    const next = orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
    if (next.length !== previous.length) return;
    setSubtasks(next);
    const result = await reorderSubtasks(taskId, orderedIds);
    if (!result) setSubtasks(previous);
  }, [taskId, subtasks, reorderSubtasks]);

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
   *
   * Two fields are only sent when the editor could actually have LOADED them.
   * Both are seeded from the task object, and both are destructive when they
   * are wrong: `collectionId: null` files the entry out of its collection and
   * `recurrenceRule: null` demotes a series to a plain task
   * (`graphql/bujogeek/services/taskService.js` updateTask). A query that
   * forgets to select one of them would otherwise make every unrelated edit —
   * a priority, a tag — quietly destroy it. `graphql/queries.js` selects both
   * on every task query today; this is the guard that keeps a future selection
   * change from being a silent data loss instead of a missing chip.
   */
  const buildPayload = () => {
    const { recurrenceFreq, collectionId, ...rest } = formData;
    const payload = { ...rest };

    if (!isEditing || 'recurrenceRule' in task) {
      payload.recurrenceRule = buildRecurrenceRule(recurrenceFreq, formData.dueDate);
    }
    if (!isEditing || 'collectionId' in task) {
      // '' is the "Not in a collection" option — send it as an explicit null so
      // the task is filed out of whatever collection it was in.
      payload.collectionId = collectionId || null;
    }

    return payload;
  };

  const performSubmit = async (editScope) => {
    setLoading(true);
    try {
      const payload = buildPayload();
      if (isEditing) {
        await updateTask(taskId, payload, editScope);
      } else {
        const created = await createTask(payload);
        // Steps typed before the entry existed. Created in order, one at a
        // time — the gateway appends, so a parallel burst would land in an
        // order nobody asked for. A failure here has already been surfaced by
        // the context; the entry itself is saved either way.
        const newId = created?.id || created?._id;
        if (newId) {
          for (const step of pendingSubtasks) {
            await addSubtask(newId, { content: step.content });
          }
        }
      }
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setLoading(false);
    }
  };

  const captionInk = theme.palette.text.muted;
  const primaryInk = theme.palette.text.primary;
  const mutedInk = theme.palette.text.secondary;
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
                <InputLabel id="task-type-label">Type</InputLabel>
                <Select
                  labelId="task-type-label"
                  value={formData.signifier}
                  onChange={handleChange('signifier')}
                  label="Type"
                  sx={{ minHeight: { xs: 44, md: 'auto' } }}
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
                <InputLabel id="task-priority-label">Priority</InputLabel>
                <Select
                  labelId="task-priority-label"
                  value={formData.priority ?? ''}
                  onChange={handleChange('priority')}
                  label="Priority"
                  sx={{ minHeight: { xs: 44, md: 'auto' } }}
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

            {/* Due date — the picker chunk itself is lazy, see TaskDueDateField */}
            <Box sx={{ mb: 2 }}>
              <Suspense
                fallback={
                  <Skeleton
                    variant="rounded"
                    width="100%"
                    height={44}
                    sx={{ borderRadius: 1 }}
                  />
                }
              >
                <TaskDueDateField
                  value={formData.dueDate}
                  onChange={(newDate) => setFormData({ ...formData, dueDate: newDate })}
                />
              </Suspense>
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
              <InputLabel id="task-collection-label">Collection</InputLabel>
              <Select
                labelId="task-collection-label"
                value={
                  collections.some((c) => c.id === formData.collectionId)
                    ? formData.collectionId
                    : ''
                }
                onChange={handleChange('collectionId')}
                label="Collection"
                sx={{ minHeight: { xs: 44, md: 'auto' } }}
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

          {/* ─── Subtasks section ────────────────────────────────── */}
          {!isVirtual && (
            <SubtaskSection
              taskId={taskId}
              subtasks={subtasks}
              onAdd={handleAddSubtask}
              onRemove={handleRemoveSubtask}
              onReorder={handleReorderSubtasks}
              pending={pendingSubtasks}
              onPendingChange={setPendingSubtasks}
              disabled={loading}
            />
          )}

          {/* ─── Recurrence section ──────────────────────────────── */}
          <Box sx={{ borderTop: dottedRule, pt: 2.5, mb: 1 }}>
            <Typography
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
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
              <InputLabel id="task-repeat-label">Repeat interval</InputLabel>
              <Select
                labelId="task-repeat-label"
                value={formData.recurrenceFreq}
                onChange={handleChange('recurrenceFreq')}
                label="Repeat interval"
                sx={{ minHeight: { xs: 44, md: 'auto' } }}
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
