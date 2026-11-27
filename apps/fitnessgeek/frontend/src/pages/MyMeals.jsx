import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  DialogContentText,
  Button,
  Chip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
  // A book of meals, so My meals stops sharing My foods' cutlery (C12).
  MenuBook as MealIcon,
  PlaylistAdd as LogIcon,
  CloudOff as FailedIcon,
} from '@mui/icons-material';
import { useToast, useGeekDialogFullScreen } from '@geeksuite/ui';
import { thumbSaveProps } from '../components/BloodPressure/thumbSave.jsx';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import Shell from './embeddedShell.jsx';
import EditMealDialog from '../components/Meals/EditMealDialog.jsx';
import { useUndoToast } from '../components/FoodSearch/undoToast.jsx';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useToday } from '../hooks/useToday.js';
import { errorMessage } from '../utils/errorMessage.js';
import { addedMessage, fmt, friendlyDay, mealLabel } from '../utils/plainWords.js';
import {
  Surface,
  EmptyState,
  SurfaceSkeleton,
  PremiumDialog,
  DateField,
} from '../components/primitives';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealTypeForNow = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
};

/** What to call a meal that somehow has no name. */
const nameOf = (meal) => String(meal?.name || '').trim() || 'Untitled meal';

/**
 * How many foods a saved meal holds and what it comes to. Every step is
 * guarded: a meal with no list, a null entry in the list, or a food that was
 * deleted (no nutrition) counts for nothing instead of throwing.
 */
const mealSummary = (meal) => {
  const items = (Array.isArray(meal?.food_items) ? meal.food_items : []).filter((it) => it && typeof it === 'object');
  let total = 0;
  let known = false;
  for (const it of items) {
    const food = (it.food_item_id && typeof it.food_item_id === 'object' ? it.food_item_id : it.food_item) || {};
    const per = Number(food?.nutrition?.calories_per_serving);
    if (Number.isFinite(per)) {
      known = true;
      total += per * (Number(it.servings) > 0 ? Number(it.servings) : 1);
    }
  }
  // The gateway's own total, when the foods carried no numbers of their own.
  if (!known && Number(meal?.totalNutrition?.calories_per_serving) > 0) total = Number(meal.totalNutrition.calories_per_serving);
  return { itemCount: items.length, totalCals: Math.round(total) };
};

const MyMeals = ({ embedded = false }) => {
  const { notify } = useToast();
  // "Log it" sits at the bottom on a phone, like every save (UX review L9).
  const fullScreen = useGeekDialogFullScreen();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed read is its own state, never "No meals saved yet".
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [editingMeal, setEditingMeal] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state (replaces window.confirm)
  const [mealToDelete, setMealToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // "Log this": the page promises one-tap reuse, and had no way to log one.
  // It goes through the same `logItems` → `logMeal` path the add box's Again
  // chips use, so the toast, the Undo and the ids are the same.
  const today = useToday();
  const [mealToLog, setMealToLog] = useState(null);
  const [logMealType, setLogMealType] = useState('dinner');
  const [logDay, setLogDay] = useState(today);
  const [logging, setLogging] = useState(false);
  const { logItems, undoLogs } = useFoodLogging({ date: logDay });
  const { offerUndo } = useUndoToast(undoLogs);

  useEffect(() => {
    loadMeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; loadMeals now closes over `notify` from useToast(), which the linter can't prove is stable.
  }, []);

  const loadMeals = async () => {
    setLoading(true);
    try {
      const data = await fitnessGeekService.getMeals();
      // One null in the list used to take the page to the error boundary
      // (`m.name.toLowerCase()`): only real rows are kept.
      setMeals((Array.isArray(data) ? data : []).filter((m) => m && typeof m === 'object'));
      setLoadFailed(false);
    } catch (e) {
      // After a save or a delete the list on screen is still right enough to
      // keep; with nothing on screen, the page itself says the read failed.
      setLoadFailed(true);
      notify(errorMessage(e, 'Couldn’t load your meals. Try again.'), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const filtered = meals.filter((m) => !needle || nameOf(m).toLowerCase().includes(needle));

  const handleEdit = (meal) => {
    setEditingMeal(meal);
    setEditOpen(true);
  };

  const requestDelete = (meal) => {
    setMealToDelete(meal);
  };

  const confirmDelete = async () => {
    if (!mealToDelete || deleting) return;
    try {
      setDeleting(true);
      await fitnessGeekService.deleteMeal(mealToDelete._id || mealToDelete.id);
      // It is gone: say so and close before the list is read again, so a
      // slow or failed re-read can't leave "Delete" up for a second tap.
      notify(`Deleted ${nameOf(mealToDelete)}`, { tone: 'success' });
      const goneId = mealToDelete._id || mealToDelete.id;
      setMeals((prev) => prev.filter((m) => (m._id || m.id) !== goneId));
      setMealToDelete(null);
      await loadMeals();
    } catch (e) {
      notify(errorMessage(e, 'Couldn’t delete that meal. Try again.'), { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (!editingMeal || saving) return;
    try {
      setSaving(true);
      await fitnessGeekService.updateMeal(editingMeal._id || editingMeal.id, payload);
      setEditOpen(false);
      setEditingMeal(null);
      await loadMeals();
      notify('Meal saved', { tone: 'success' });
    } catch (e) {
      notify(errorMessage(e, 'Couldn’t save that meal. Try again.'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const startLog = (meal) => {
    setMealToLog(meal);
    setLogMealType(MEALS.includes(meal.meal_type) ? meal.meal_type : mealTypeForNow());
    setLogDay(today);
  };

  const confirmLog = async () => {
    if (!mealToLog || logging) return;
    setLogging(true);
    try {
      const result = await logItems([{ ...mealToLog, type: 'meal' }], logMealType);
      if ((result?.ok ?? 0) > 0) {
        const day = logDay === today ? '' : ` · ${friendlyDay(logDay, today)}`;
        offerUndo(addedMessage(logMealType, `${nameOf(mealToLog)}${day}`), result.logIds);
        setMealToLog(null);
      } else {
        notify(errorMessage(result?.errors?.[0], 'Couldn’t log that meal. Try again.'), { tone: 'error' });
      }
    } catch (e) {
      notify(errorMessage(e, 'Couldn’t log that meal. Try again.'), { tone: 'error' });
    } finally {
      setLogging(false);
    }
  };

  return (
    <Shell embedded={embedded}>
      {/* No card title: the tab already says "Meals". */}
      <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
        Meals you saved, ready to log again in one tap.
      </Typography>

      {/* Search: only when there is something to search. */}
      {meals.length > 0 && (
        <TextField
          placeholder="Search meals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
          inputProps={{ 'aria-label': 'Search meals' }}
        />
      )}

      {loading && meals.length === 0 ? (
        <SurfaceSkeleton rows={4} />
      ) : loadFailed && meals.length === 0 ? (
        <EmptyState
          icon={FailedIcon}
          title="Couldn’t load your meals"
          copy="Nothing is lost. Check your connection and try again."
          action={<Button variant="contained" onClick={loadMeals}>Try again</Button>}
          data-testid="my-meals-failed"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MealIcon}
          title={needle ? 'Nothing matches that' : 'No meals saved yet'}
          copy={
            needle
              ? 'Try a different word, or clear the search to see every meal.'
              : 'On Today, tap the ⋯ beside a meal and choose “Save as a meal”. It shows up here, ready to log again in one tap.'
          }
          action={needle ? <Button variant="tonal" onClick={() => setQuery('')}>Clear search</Button> : undefined}
        />
      ) : (
        <Box>
          <Typography
            role="status"
            sx={{ fontSize: '0.875rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', mb: 2, px: 1 }}
          >
            {needle
              ? `${filtered.length} of ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'}`
              : `${filtered.length} ${filtered.length === 1 ? 'meal' : 'meals'}`}
          </Typography>
          <Surface sx={{ py: { xs: 1, sm: 2 } }}>
            <Box component="ul" aria-label="Your saved meals" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {filtered.map((m, index) => {
                const { itemCount, totalCals } = mealSummary(m);
                const name = nameOf(m);
                return (
                  <Box
                    component="li"
                    key={m._id || m.id || `meal-${index}`}
                    data-testid="saved-meal-row"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      // On a phone the actions take their own line under the
                      // name, so nothing overlaps; from sm they sit beside it.
                      flexWrap: { xs: 'wrap', sm: 'nowrap' },
                      columnGap: 3,
                      rowGap: 1.5,
                      py: 3,
                      borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 0' }, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                        {name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                        {[
                          m.meal_type ? mealLabel(m.meal_type) : 'Any meal',
                          `${itemCount} ${itemCount === 1 ? 'food' : 'foods'}`,
                          totalCals > 0 ? `${fmt(totalCals)} cal` : null,
                        ].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
                      {/* The row's one action in words; tonal, because the
                          page has no filled button competing with it. */}
                      <Button
                        variant="tonal"
                        size="small"
                        startIcon={<LogIcon />}
                        onClick={() => startLog(m)}
                        aria-label={`Log ${name}`}
                        sx={{ minHeight: 44, px: 4, fontWeight: 700, mr: { xs: 'auto', sm: 1 } }}
                      >
                        Log this
                      </Button>
                      {/* Outlined, secondary ink; Delete is red only under a
                          finger or pointer (visual review B7). */}
                      <IconButton
                        aria-label={`Edit ${name}`}
                        onClick={() => handleEdit(m)}
                        sx={{ width: 44, height: 44, color: 'text.secondary' }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${name}`}
                        onClick={() => requestDelete(m)}
                        sx={{ width: 44, height: 44, mr: -2, color: 'text.secondary', '&:hover, &:active': { color: 'error.main' } }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Surface>
        </Box>
      )}

      <EditMealDialog
        open={editOpen}
        onClose={() => { if (!saving) setEditOpen(false); }}
        meal={editingMeal}
        onSave={handleSave}
        loading={saving}
      />

      {/* Log a saved meal: which meal, which day (backfilling is real). */}
      <PremiumDialog
        open={!!mealToLog}
        onClose={() => !logging && setMealToLog(null)}
        title={mealToLog ? `Log ${nameOf(mealToLog)}` : 'Log a meal'}
        maxWidth="xs"
        {...thumbSaveProps({
          fullScreen,
          save: (
            <Button
              onClick={confirmLog}
              variant="contained"
              disabled={logging || !logDay}
              startIcon={logging ? <CircularProgress size={16} color="inherit" /> : <LogIcon />}
            >
              {logging ? 'Adding…' : 'Log it'}
            </Button>
          ),
          cancel: (
            <Button onClick={() => { if (!logging) setMealToLog(null); }} disabled={logging}>
              Cancel
            </Button>
          ),
        })}
      >
        {/* 4px theme unit: 8px between the chips, 20px above the day. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 5 }} role="group" aria-label="Meal">
          {MEALS.map((meal) => (
            <Chip
              key={meal}
              label={mealLabel(meal)}
              onClick={() => setLogMealType(meal)}
              aria-pressed={meal === logMealType}
              variant="outlined"
              disabled={logging}
              sx={{
                height: 44,
                borderRadius: 999,
                fontWeight: 700,
                borderWidth: 1.5,
                borderColor: (t) => t.palette.outline || t.palette.divider,
                color: 'text.primary',
                '& .MuiChip-label': { px: 1.75 },
                ...(meal === logMealType ? {
                  bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.2 : 0.1),
                  borderColor: 'primary.main',
                  '&&:hover, &&:focus': { bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.28 : 0.16) },
                } : {}),
              }}
            />
          ))}
        </Box>
        <DateField label="Day" value={logDay} onChange={setLogDay} fullWidth size="medium" />
      </PremiumDialog>

      {/* Delete confirmation — replaces window.confirm */}
      <PremiumDialog
        open={!!mealToDelete}
        onClose={() => !deleting && setMealToDelete(null)}
        title="Delete this meal?"
        maxWidth="xs"
        primaryAction={
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            Delete
          </Button>
        }
        secondaryAction={
          <Button onClick={() => setMealToDelete(null)} disabled={deleting}>
            Cancel
          </Button>
        }
      >
        <DialogContentText>
          <strong>{mealToDelete ? nameOf(mealToDelete) : ''}</strong> will be deleted from your saved
          meals. This can’t be undone.
        </DialogContentText>
      </PremiumDialog>
    </Shell>
  );
};

export default MyMeals;
