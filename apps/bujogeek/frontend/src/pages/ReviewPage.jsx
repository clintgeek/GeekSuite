import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useLazyQuery, useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { useTaskContext } from '../context/TaskContext';
import ReviewCard from '../components/review/ReviewCard';
import ReviewProgress from '../components/review/ReviewProgress';
import ReviewComplete from '../components/review/ReviewComplete';
import ReviewDraftCard from '../components/review/ReviewDraftCard';
import ReviewNoteDialog from '../components/review/ReviewNoteDialog';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import useKeyboardNav from '../hooks/useKeyboardNav';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import useBujoPreferences from '../hooks/useBujoPreferences';
import { GET_REVIEW_DRAFT } from '../graphql/queries';
import { CREATE_JOURNAL_ENTRY } from '../graphql/mutations';
import { getTaskAge } from '../utils/taskAging';
import { normalizeTasks } from '../utils/normalizeTasks';
import { currentWeekStart, weekLabel as formatWeekLabel, weekStartKey } from '../utils/reviewWeek';
import { colors } from '../theme/colors';
import { addDays } from 'date-fns';
import { localDateString } from '@geeksuite/utils';

const MODES = [
  { value: 'endofday', label: 'End of Day' },
  { value: 'weekly', label: 'Weekly Review' },
];

const ReviewPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [mode, setMode] = useState('endofday');
  const [reviewedIds, setReviewedIds] = useState(new Set());
  const {
    tasks,
    loading,
    fetchTasks,
    fetchAllTasks,
    updateTask,
    updateTaskStatus,
    deleteTask,
    createTask,
    LoadingState,
  } = useTaskContext();

  // Fetch tasks based on mode
  useEffect(() => {
    if (mode === 'endofday') {
      fetchTasks('daily', new Date());
    } else {
      fetchAllTasks();
    }
    setReviewedIds(new Set());
  }, [mode, fetchTasks, fetchAllTasks]);

  const agingTasks = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed' || task.status === 'cancelled') return false;
      // Parked tasks are out of the ritual: the review asks "keep, move,
      // backlog or cancel?" and a blocked task has already answered "waiting".
      // The weekly mode reads the `all` corpus, which still contains them.
      if (task.status === 'blocked') return false;
      if (reviewedIds.has((task.id || task._id))) return false;
      if (mode === 'endofday') {
        return task.status === 'pending';
      }
      const { days } = getTaskAge(task);
      return days > 0;
    });
  }, [tasks, mode, reviewedIds]);

  const totalToReview = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed' || task.status === 'cancelled') return false;
      if (task.status === 'blocked') return false;
      if (mode === 'endofday') return task.status === 'pending';
      const { days } = getTaskAge(task);
      return days > 0;
    }).length;
  }, [tasks, mode]);

  const markReviewed = useCallback((taskId) => {
    setReviewedIds((prev) => new Set([...prev, taskId]));
  }, []);

  const handleKeep = useCallback(
    async (task) => {
      const todayStr = localDateString(new Date());
      await updateTask((task.id || task._id), { ...task, dueDate: todayStr });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleMoveTomorrow = useCallback(
    async (task) => {
      const tomorrowStr = localDateString(addDays(new Date(), 1));
      await updateTask((task.id || task._id), {
        ...task,
        dueDate: tomorrowStr,
        status: 'migrated_future',
      });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleMoveToDate = useCallback(
    async (task, date) => {
      const dateStr = localDateString(date);
      await updateTask((task.id || task._id), {
        ...task,
        dueDate: dateStr,
        status: 'migrated_future',
      });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleBacklog = useCallback(
    async (task) => {
      await updateTask((task.id || task._id), {
        ...task,
        status: 'migrated_back',
        dueDate: null,
        isBacklog: true,
      });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleDelete = useCallback(
    async (task) => {
      if (window.confirm('Delete this task permanently?')) {
        await deleteTask((task.id || task._id));
        markReviewed((task.id || task._id));
      }
    },
    [deleteTask, markReviewed]
  );

  const handleCancel = useCallback(
    async (task) => {
      await updateTaskStatus((task.id || task._id), 'cancelled');
      markReviewed((task.id || task._id));
    },
    [updateTaskStatus, markReviewed]
  );

  const isLoading = loading === LoadingState.FETCHING;
  const allReviewed = agingTasks.length === 0 && !isLoading && totalToReview > 0;
  const nothingToReview = totalToReview === 0 && !isLoading;

  // ─── Keyboard nav for review cards ─────────────────────────
  // j/k to move between cards, 1=Keep, 2=Tomorrow, 3=Backlog, d=Delete
  const { focusedTaskId } = useKeyboardNav({
    tasks: agingTasks,
    onToggle: handleKeep,     // x → keep today (closest semantic)
    onEdit: handleKeep,       // e → keep today (no edit in review)
    onDelete: handleDelete,
    enabled: !isLoading && !allReviewed && !nothingToReview,
  });

  // Review-specific number shortcuts (1/2/3)
  useEffect(() => {
    if (isLoading || allReviewed || nothingToReview) return;

    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const focusedTask = agingTasks.find(
        (t) => (t.id || t._id) === focusedTaskId
      );
      if (!focusedTask) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          handleKeep(focusedTask);
          break;
        case '2':
          e.preventDefault();
          handleMoveTomorrow(focusedTask);
          break;
        case '3':
          e.preventDefault();
          handleBacklog(focusedTask);
          break;
        case '4':
          e.preventDefault();
          handleCancel(focusedTask);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLoading, allReviewed, nothingToReview, focusedTaskId, agingTasks, handleKeep, handleMoveTomorrow, handleBacklog, handleCancel]);

  useGlobalShortcuts();

  // ─── The AI weekly review draft (DOCS/AI_IDEAS.md #1) ──────────────
  // Opt-in, off by default, and gated on BOTH ends: the card is not rendered
  // without the preference, and the gateway will not consult a model without
  // it either. Weekly mode only — an end-of-day pass is not a week.
  const { notify } = useToast();
  const { aiReviewDraft } = useBujoPreferences();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSeed, setNoteSeed] = useState({ title: '', content: '', aiDrafted: false });

  const weekStart = useMemo(() => currentWeekStart(), []);
  const weekKey = useMemo(() => weekStartKey(weekStart), [weekStart]);
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);
  const showDraftCard = mode === 'weekly' && aiReviewDraft;

  const [runDraft, draftState] = useLazyQuery(GET_REVIEW_DRAFT, {
    // "Draft again" has to mean again. The draft is a snapshot of a moving
    // week, and a cached one would quietly answer a different question.
    fetchPolicy: 'network-only',
  });
  const [saveReviewNote, { loading: savingNote }] = useMutation(CREATE_JOURNAL_ENTRY);

  const handleDraft = useCallback(() => {
    runDraft({ variables: { weekStart: weekKey } });
  }, [runDraft, weekKey]);

  /**
   * "Use as review" seeds the ordinary editor and stops. What goes in is the
   * summary plus the suggested focus — the two parts that are prose. Wins and
   * carry-forwards stay on the card, where each has its own action.
   */
  const handleUseAsReview = useCallback((draft) => {
    const body = [draft?.summary, draft?.suggestedFocus].filter(Boolean).join('\n\n');
    setNoteSeed({
      title: `Weekly review — ${weekLabel}`,
      content: body,
      aiDrafted: draftState.data?.reviewDraft?.provenance?.source === 'model',
    });
    setNoteOpen(true);
  }, [weekLabel, draftState.data]);

  const handleSaveNote = useCallback(async ({ title, content, aiDrafted }) => {
    try {
      await saveReviewNote({
        variables: { title, content, type: 'weekly', date: weekKey, aiDrafted },
      });
      setNoteOpen(false);
      notify('Review saved', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not save the review', { tone: 'error' });
    }
  }, [saveReviewNote, weekKey, notify]);

  const handleAddCarryForward = useCallback(async (title) => {
    // bujogeek has no inbox or default collection — an entry with no
    // collection and today's date IS the daily log. That is where a
    // carry-forward belongs, and it goes through the ordinary createTask.
    await createTask({ content: title, dueDate: localDateString(new Date()) });
    notify(`Added \u201c${title}\u201d to today`, { tone: 'success' });
  }, [createTask, notify]);


  const captionInk = theme.palette.text.muted;
  const mutedInk = theme.palette.text.secondary;
  const primaryInk = theme.palette.text.primary;
  const hairlineRule = `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`;

  // Editorial caption based on state
  const eyebrowText =
    nothingToReview
      ? 'A quiet moment'
      : allReviewed
      ? 'Well tended'
      : 'End of the day';

  const statsText =
    nothingToReview
      ? 'Nothing to review right now.'
      : allReviewed
      ? 'You tended to everything.'
      : `${agingTasks.length} ${agingTasks.length === 1 ? 'task waits' : 'tasks wait'} for your attention`;

  return (
    <Box
      sx={{
        maxWidth: 680,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: { xs: 2.5, sm: 3.5 },
        pb: 4,
      }}
    >
      {/* ─── Editorial masthead ─────────────────────────────────── */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontWeight: 400,
            color: captionInk,
            letterSpacing: '0.01em',
            mb: 0.5,
          }}
        >
          {eyebrowText}
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            fontWeight: 500,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: primaryInk,
            fontOpticalSizing: 'auto',
          }}
        >
          Review
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: captionInk,
            mt: 0.75,
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontFamily: '"Fraunces", serif',
          }}
        >
          {statsText}
        </Typography>
      </Box>

      {/* ─── Editorial segmented mode toggle ────────────────────── */}
      <Box
        role="tablist"
        aria-label="Review mode"
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: { xs: 2.5, sm: 3.5 },
          borderBottom: hairlineRule,
          mb: 3,
          px: 0.5,
        }}
      >
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <Box
              key={m.value}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setMode(m.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMode(m.value);
                }
              }}
              sx={{
                position: 'relative',
                py: 1.25,
                cursor: 'pointer',
                transition: 'color 200ms ease',
                '&:hover': {
                  color: isDark ? 'rgba(255,255,255,0.85)' : colors.ink[800],
                },
                '&:focus-visible': {
                  outline: `2px solid ${colors.primary[400]}`,
                  outlineOffset: 4,
                  borderRadius: 2,
                },
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: { xs: '0.9375rem', sm: '1.0625rem' },
                  fontWeight: active ? 500 : 400,
                  color: active ? primaryInk : mutedInk,
                  letterSpacing: '-0.005em',
                  lineHeight: 1.2,
                  transition: 'color 200ms ease',
                }}
              >
                {m.label}
              </Typography>
              {active && (
                <motion.div
                  layoutId="review-mode-underline"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2,
                    backgroundColor: colors.primary[500],
                    borderRadius: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {showDraftCard && (
        <ReviewDraftCard
          weekLabel={weekLabel}
          loading={draftState.loading}
          error={draftState.error?.message || null}
          result={draftState.data?.reviewDraft || null}
          onDraft={handleDraft}
          onUseAsReview={handleUseAsReview}
          onAddTask={handleAddCarryForward}
        />
      )}

      {showDraftCard && (
        <ReviewNoteDialog
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          onSave={handleSaveNote}
          initialTitle={noteSeed.title}
          initialContent={noteSeed.content}
          aiDrafted={noteSeed.aiDrafted}
          saving={savingNote}
        />
      )}

      {/* Progress */}
      {totalToReview > 0 && !allReviewed && (
        <ReviewProgress total={totalToReview} reviewed={reviewedIds.size} />
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader rows={4} />
      ) : allReviewed || nothingToReview ? (
        <ReviewComplete />
      ) : (
        <Box>
          <AnimatePresence mode="popLayout">
            {agingTasks.map((task) => (
              <motion.div
                key={(task.id || task._id)}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 32, transition: { duration: 0.24 } }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <ReviewCard
                  task={task}
                  onKeep={handleKeep}
                  onMoveTomorrow={handleMoveTomorrow}
                  onMoveTo={handleMoveToDate}
                  onBacklog={handleBacklog}
                  onCancel={handleCancel}
                  onDelete={handleDelete}
                  focused={focusedTaskId === (task.id || task._id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>
      )}
    </Box>
  );
};

export default ReviewPage;
