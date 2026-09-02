import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from '@mui/material';
import {
  Plus,
  X,
  Flame,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import useHabits, { toDateKey } from '../hooks/useHabits';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import EmptyState from '../components/shared/EmptyState';
import { useToast } from '../components/shared/Toast';
import { colors } from '../theme/colors';

/**
 * HabitsPage — a week at a glance.
 *
 * Rows are habits, columns are seven days ending at today (or at the end of
 * whichever earlier week you have paged back to). A cell is a tap target: fill
 * it and the day is done, tap again and it is not. Days the habit isn't
 * scheduled for are inert and dimmed — they neither ask anything of you nor
 * break a streak.
 */

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHOWN = 7;

// Dots drawn from the app's own palette — warm, planner-ish, never neon.
const HABIT_COLORS = [
  colors.primary[500],
  colors.aging.fresh,
  colors.aging.warning,
  colors.aging.overdue,
  colors.aging.stale,
  colors.signifier.event,
  colors.gold.muted,
];

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const emptyForm = { name: '', daysOfWeek: [], color: HABIT_COLORS[0] };

const HabitsPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const toast = useToast();

  useGlobalShortcuts();

  // 0 = the week ending today; 1 = the seven days before that, and so on.
  const [weeksBack, setWeeksBack] = useState(0);
  const [editing, setEditing] = useState(null); // null | 'new' | habit
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const todayKey = toDateKey(new Date());

  const days = useMemo(() => {
    const end = addDays(startOfDay(new Date()), -weeksBack * DAYS_SHOWN);
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(end, i - (DAYS_SHOWN - 1)));
  }, [weeksBack]);

  const startDate = toDateKey(days[0]);
  const endDate = toDateKey(days[days.length - 1]);

  const {
    active,
    archived,
    loading,
    isDone,
    toggle,
    createHabit,
    updateHabit,
    deleteHabit,
  } = useHabits({ startDate, endDate });

  const captionInk = isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;
  const emptyCell = isDark ? 'rgba(255,255,255,0.16)' : colors.ink[200];

  const isScheduled = (habit, date) =>
    !habit.daysOfWeek?.length || habit.daysOfWeek.includes(date.getDay());

  const handleToggle = async (habit, date) => {
    const key = toDateKey(date);
    try {
      await toggle(habit.id, key);
    } catch {
      toast.error(`Couldn’t update ${habit.name}`);
    }
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditing('new');
  };

  const openEdit = (habit) => {
    setForm({
      name: habit.name,
      daysOfWeek: habit.daysOfWeek ?? [],
      color: habit.color || HABIT_COLORS[0],
    });
    setEditing(habit);
  };

  const closeDialog = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async (event) => {
    event?.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await createHabit({ name, daysOfWeek: form.daysOfWeek, color: form.color });
      } else {
        await updateHabit(editing.id, {
          name,
          daysOfWeek: form.daysOfWeek,
          color: form.color,
        });
      }
      closeDialog();
    } catch {
      toast.error('Failed to save habit');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (habit, event) => {
    event?.stopPropagation();
    try {
      await updateHabit(habit.id, { archived: !habit.archived });
      toast.success(habit.archived ? 'Habit restored' : 'Habit archived');
    } catch {
      toast.error('Failed to update habit');
    }
  };

  const handleDelete = async () => {
    if (!editing || editing === 'new') return;
    setSaving(true);
    try {
      await deleteHabit(editing.id);
      closeDialog();
      toast.success('Habit deleted with its history');
    } catch {
      toast.error('Failed to delete habit');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (habit) => {
    const accent = habit.color || colors.primary[500];

    return (
      <Box
        key={habit.id}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 1.25, sm: 2 },
          py: 1,
          borderBottom: dottedRule,
          opacity: habit.archived ? 0.6 : 1,
          '&:last-of-type': { borderBottom: 'none' },
          '&:hover .habit-archive': { opacity: 1 },
        }}
      >
        {/* Name — click to edit */}
        <Box
          onClick={() => openEdit(habit)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openEdit(habit);
            }
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            '&:hover .habit-name': { color: theme.palette.text.primary },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: accent,
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              className="habit-name"
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '0.9375rem', sm: '1rem' },
                fontWeight: 500,
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
                color: theme.palette.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'color 0.14s ease',
              }}
            >
              {habit.name}
            </Typography>
            {habit.daysOfWeek?.length > 0 && (
              <Typography
                sx={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.5625rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: captionInk,
                  mt: 0.25,
                }}
              >
                {habit.daysOfWeek.map((d) => DAY_INITIALS[d]).join(' ')}
              </Typography>
            )}
          </Box>
        </Box>

        {/* The week's cells */}
        <Box sx={{ display: 'flex', gap: { xs: 0.375, sm: 0.75 }, flexShrink: 0 }}>
          {days.map((date) => {
            const key = toDateKey(date);
            const scheduled = isScheduled(habit, date);
            const done = isDone(habit.id, key);
            const inert = !scheduled || habit.archived;
            const label = `${habit.name} — ${DAY_NAMES[date.getDay()]} ${date.getDate()}`;

            return (
              <Tooltip
                key={key}
                title={scheduled ? label : `${label} · not scheduled`}
                placement="top"
                enterDelay={500}
              >
                <Box
                  component="button"
                  type="button"
                  disabled={inert}
                  aria-pressed={done}
                  aria-label={label}
                  onClick={() => !inert && handleToggle(habit, date)}
                  sx={{
                    width: { xs: 28, sm: 32 },
                    height: { xs: 28, sm: 32 },
                    p: 0,
                    borderRadius: '7px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: inert ? 'default' : 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    backgroundColor: done ? accent : 'transparent',
                    border: done
                      ? `1px solid ${accent}`
                      : `1px ${inert ? 'dotted' : 'solid'} ${emptyCell}`,
                    opacity: inert && !done ? 0.4 : 1,
                    transition: 'background-color 0.14s ease, border-color 0.14s ease, transform 0.1s ease',
                    '&:hover': inert
                      ? {}
                      : {
                          borderColor: accent,
                          backgroundColor: done ? accent : `${accent}22`,
                        },
                    '&:active': inert ? {} : { transform: 'scale(0.92)' },
                  }}
                />
              </Tooltip>
            );
          })}
        </Box>

        {/* Streak */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.375,
            width: 38,
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
          title={`${habit.currentStreak} day streak`}
        >
          <Flame
            size={13}
            color={habit.currentStreak > 0 ? colors.aging.warning : captionInk}
            fill={habit.currentStreak > 0 ? colors.aging.warning : 'none'}
            strokeWidth={1.75}
          />
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: habit.currentStreak > 0 ? theme.palette.text.secondary : captionInk,
            }}
          >
            {habit.currentStreak ?? 0}
          </Typography>
        </Box>

        <Tooltip title={habit.archived ? 'Restore' : 'Archive'} placement="top">
          <IconButton
            className="habit-archive"
            size="small"
            onClick={(e) => handleArchive(habit, e)}
            aria-label={habit.archived ? 'Restore habit' : 'Archive habit'}
            sx={{
              color: mutedInk,
              width: 28,
              height: 28,
              flexShrink: 0,
              opacity: { xs: 1, sm: habit.archived ? 1 : 0 },
              transition: 'opacity 0.14s ease, color 0.14s ease',
              '&:hover': { color: colors.primary[500] },
            }}
          >
            {habit.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  const listSurface = {
    borderRadius: '10px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100]}`,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.paper,
    overflow: 'hidden',
  };

  const doneToday = active.filter((h) => isDone(h.id, todayKey)).length;
  const dueToday = active.filter((h) => isScheduled(h, new Date())).length;

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 1, sm: 3 }, pb: 4 }}>
      {/* ─── Header ───────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2, sm: 0.5 },
          pt: { xs: 2.5, sm: 3.5 },
          pb: 1,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: captionInk,
              mb: 0.5,
              letterSpacing: '0.01em',
            }}
          >
            {weeksBack === 0
              ? `${doneToday} of ${dueToday} done today`
              : `${weeksBack} week${weeksBack > 1 ? 's' : ''} back`}
          </Typography>
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '1.75rem', sm: '2.25rem' },
              color: theme.palette.text.primary,
              lineHeight: 1.2,
            }}
          >
            Habits
          </Typography>
        </Box>

        <Button
          onClick={openNew}
          variant="contained"
          size="small"
          startIcon={<Plus size={15} />}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', flexShrink: 0 }}
        >
          New
        </Button>
      </Box>

      <Box sx={{ mt: 2.5, px: { xs: 0.5, sm: 0 } }}>
        {loading && active.length === 0 && archived.length === 0 ? (
          <SkeletonLoader rows={4} />
        ) : active.length === 0 && archived.length === 0 ? (
          <EmptyState
            title="No habits yet."
            description="A habit is something you mean to do again and again — stretch, read, write morning pages. Tap a day to mark it done; the streak counts the scheduled days you've kept."
          />
        ) : (
          <>
            {/* ─── Column header: the week ─────────────────────── */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 1,
                px: { xs: 1.25, sm: 2 },
                pb: 0.75,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <IconButton
                  size="small"
                  onClick={() => setWeeksBack((w) => w + 1)}
                  aria-label="Previous week"
                  sx={{ color: mutedInk, width: 24, height: 24 }}
                >
                  <ChevronLeft size={15} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
                  disabled={weeksBack === 0}
                  aria-label="Next week"
                  sx={{ color: mutedInk, width: 24, height: 24 }}
                >
                  <ChevronRight size={15} />
                </IconButton>
              </Box>

              <Box sx={{ display: 'flex', gap: { xs: 0.375, sm: 0.75 }, flexShrink: 0 }}>
                {days.map((date) => {
                  const key = toDateKey(date);
                  const isToday = key === todayKey;
                  return (
                    <Box
                      key={key}
                      sx={{
                        width: { xs: 28, sm: 32 },
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: '0.5625rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          color: isToday ? colors.primary[500] : captionInk,
                          lineHeight: 1.4,
                        }}
                      >
                        {DAY_INITIALS[date.getDay()]}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: '0.625rem',
                          fontWeight: isToday ? 700 : 400,
                          color: isToday ? colors.primary[500] : mutedInk,
                          lineHeight: 1.3,
                        }}
                      >
                        {date.getDate()}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* Spacers matching the streak + archive columns */}
              <Box sx={{ width: 38, flexShrink: 0 }} />
              <Box sx={{ width: 28, flexShrink: 0 }} />
            </Box>

            {active.length > 0 && <Box sx={listSurface}>{active.map(renderRow)}</Box>}

            {active.length === 0 && archived.length > 0 && (
              <Typography sx={{ fontSize: '0.875rem', fontStyle: 'italic', color: mutedInk, px: 0.5 }}>
                Every habit is archived.
              </Typography>
            )}

            {/* ─── Archived ────────────────────────────────────── */}
            {archived.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Box
                  onClick={() => setShowArchived((v) => !v)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.75,
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { opacity: 0.8 },
                  }}
                >
                  <Archive size={13} color={captionInk} />
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: captionInk,
                    }}
                  >
                    Archived
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: theme.palette.text.muted }}>
                    {archived.length}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: theme.palette.text.muted, ml: 0.5 }}>
                    {showArchived ? 'hide' : 'show'}
                  </Typography>
                </Box>

                {showArchived && <Box sx={listSurface}>{archived.map(renderRow)}</Box>}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ─── Create / edit dialog ─────────────────────────────── */}
      <Dialog
        open={Boolean(editing)}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}
      >
        <form onSubmit={handleSave}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              px: 3,
              pt: 3,
              pb: 2,
              borderBottom: dottedRule,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontStyle: 'italic',
                  fontSize: '0.75rem',
                  color: captionInk,
                  mb: 0.5,
                }}
              >
                Something you mean to keep doing
              </Typography>
              <Typography
                component="h2"
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: '1.375rem',
                  fontWeight: 500,
                  color: theme.palette.text.primary,
                  lineHeight: 1.15,
                }}
              >
                {editing === 'new' ? 'New Habit' : 'Edit Habit'}
              </Typography>
            </Box>
            <IconButton onClick={closeDialog} size="small" aria-label="Close" sx={{ color: mutedInk, mt: 0.5 }}>
              <X size={18} />
            </IconButton>
          </Box>

          <DialogContent sx={{ px: 3, py: 3 }}>
            <TextField
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              label="Name"
              placeholder="Morning pages"
              autoFocus
              required
              fullWidth
              size="small"
              sx={{ mb: 2.5 }}
            />

            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: captionInk,
                mb: 1,
              }}
            >
              Days
            </Typography>
            <ToggleButtonGroup
              value={form.daysOfWeek}
              onChange={(_, next) => setForm({ ...form, daysOfWeek: [...next].sort((a, b) => a - b) })}
              size="small"
              fullWidth
              sx={{
                mb: 0.75,
                '& .MuiToggleButton-root': {
                  py: 0.75,
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  borderRadius: '7px !important',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200]} !important`,
                  mx: 0.25,
                },
              }}
            >
              {DAY_INITIALS.map((initial, index) => (
                <ToggleButton key={index} value={index} aria-label={DAY_NAMES[index]}>
                  {initial}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontStyle: 'italic',
                fontFamily: '"Fraunces", serif',
                color: mutedInk,
                mb: 2.5,
              }}
            >
              {form.daysOfWeek.length === 0
                ? 'No days picked — this habit is due every day.'
                : 'Other days sit out: they never count, and never break a streak.'}
            </Typography>

            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: captionInk,
                mb: 1,
              }}
            >
              Colour
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {HABIT_COLORS.map((color) => (
                <Box
                  key={color}
                  component="button"
                  type="button"
                  aria-label={`Colour ${color}`}
                  aria-pressed={form.color === color}
                  onClick={() => setForm({ ...form, color })}
                  sx={{
                    width: 26,
                    height: 26,
                    p: 0,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    backgroundColor: color,
                    border: form.color === color
                      ? `2px solid ${theme.palette.text.primary}`
                      : '2px solid transparent',
                    outline: form.color === color ? `1px solid ${color}` : 'none',
                    outlineOffset: 1,
                    transition: 'transform 0.1s ease',
                    '&:hover': { transform: 'scale(1.1)' },
                  }}
                />
              ))}
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, borderTop: dottedRule, gap: 1 }}>
            {editing && editing !== 'new' && (
              <Button
                onClick={handleDelete}
                size="small"
                startIcon={<Trash2 size={14} />}
                disabled={saving}
                sx={{
                  fontSize: '0.8125rem',
                  color: colors.status.error,
                  textTransform: 'none',
                  mr: 'auto',
                }}
              >
                Delete
              </Button>
            )}
            <Button
              onClick={closeDialog}
              size="small"
              sx={{ fontSize: '0.8125rem', color: mutedInk, textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="small"
              disabled={saving || !form.name.trim()}
              sx={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 2.5 }}
            >
              {editing === 'new' ? 'Create' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default HabitsPage;
