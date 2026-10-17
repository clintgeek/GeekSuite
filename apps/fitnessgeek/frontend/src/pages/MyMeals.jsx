import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  CircularProgress,
  DialogContentText,
  Button,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restaurant as MealIcon,
  PlaylistAdd as LogIcon,
} from '@mui/icons-material';
import { useToast, useGeekDialogFullScreen } from '@geeksuite/ui';
import { thumbSaveProps } from '../components/BloodPressure/thumbSave.jsx';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import EditMealDialog from '../components/Meals/EditMealDialog.jsx';
import { useUndoToast } from '../components/FoodSearch/undoToast.jsx';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useToday } from '../hooks/useToday.js';
import { errorMessage } from '../utils/errorMessage.js';
import { addedMessage, friendlyDay, mealLabel } from '../utils/plainWords.js';
import {
  Surface,
  SectionLabel,
  DisplayHeading,
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

const MyMeals = () => {
  const { notify } = useToast();
  // "Log it" sits at the bottom on a phone, like every save (UX review L9).
  const fullScreen = useGeekDialogFullScreen();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
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
      setMeals(data || []);
    } catch (e) {
      notify(errorMessage(e, 'Failed to load meals'), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = meals.filter(
    (m) => !query || m.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleEdit = (meal) => {
    setEditingMeal(meal);
    setEditOpen(true);
  };

  const requestDelete = (meal) => {
    setMealToDelete(meal);
  };

  const confirmDelete = async () => {
    if (!mealToDelete) return;
    try {
      setDeleting(true);
      await fitnessGeekService.deleteMeal(mealToDelete._id || mealToDelete.id);
      await loadMeals();
      setMealToDelete(null);
    } catch (e) {
      notify(errorMessage(e, 'Failed to delete meal'), { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (!editingMeal) return;
    try {
      setSaving(true);
      await fitnessGeekService.updateMeal(editingMeal._id || editingMeal.id, payload);
      setEditOpen(false);
      setEditingMeal(null);
      await loadMeals();
    } catch (e) {
      notify(errorMessage(e, 'Failed to save meal'), { tone: 'error' });
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
        offerUndo(addedMessage(logMealType, `${mealToLog.name}${day}`), result.logIds);
        setMealToLog(null);
      } else {
        notify(errorMessage(result?.errors?.[0], "Couldn't log that meal. Try again."), { tone: 'error' });
      }
    } catch (e) {
      notify(errorMessage(e, "Couldn't log that meal. Try again."), { tone: 'error' });
    } finally {
      setLogging(false);
    }
  };

  const mealSummary = (m) => {
    const itemCount = m.food_items?.length || 0;
    const totalCals = (m.food_items || []).reduce((sum, it) => {
      const f = it.food_item_id || it.food_item || {};
      const c = f?.nutrition?.calories_per_serving || 0;
      return sum + c * (it.servings || 1);
    }, 0);
    return { itemCount, totalCals: Math.round(totalCals) };
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Library · Meals</SectionLabel>
        <DisplayHeading size="page">My Meals</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Save your favorite combinations and reuse them in a single tap.
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search meals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
        />
      </Box>

      {loading ? (
        <SurfaceSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MealIcon}
          title={query ? 'Nothing matches that' : 'No meals saved yet'}
          copy={
            query
              ? 'Try a different search, or clear the filter to see everything.'
              : 'Save a meal from the Food Log when you log something worth remembering. It\'ll show up here, ready to reuse.'
          }
        />
      ) : (
        <Surface padded={false}>
          <Box
            sx={{
              px: 2.5,
              pt: 2,
              pb: 1.25,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: (theme) => `1px dashed ${theme.palette.divider}`,
            }}
          >
            <SectionLabel count={filtered.length}>Saved Meals</SectionLabel>
          </Box>
          <List sx={{ p: 0 }}>
            {filtered.map((m) => {
              const { itemCount, totalCals } = mealSummary(m);
              return (
                <ListItem
                  key={m._id || m.id}
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    // Room for "Log this" and the two icons beside the name.
                    pr: { xs: 26, sm: 28 },
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Button
                        size="small"
                        startIcon={<LogIcon />}
                        onClick={() => startLog(m)}
                        aria-label={`Log ${m.name}`}
                        sx={{ minHeight: 44, fontWeight: 700 }}
                      >
                        Log this
                      </Button>
                      <IconButton
                        aria-label={`Edit ${m.name}`}
                        onClick={() => handleEdit(m)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${m.name}`}
                        color="error"
                        onClick={() => requestDelete(m)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Typography
                        sx={{ fontWeight: 600, fontSize: '1rem', color: 'text.primary' }}
                      >
                        {m.name}
                      </Typography>
                    }
                    secondary={
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.8125rem',
                          color: 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mt: 0.25,
                        }}
                      >
                        <Box
                          component="span"
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {m.meal_type || 'meal'}
                        </Box>
                        <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
                        <Box
                          component="span"
                          sx={{
                            fontFamily: "inherit",
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </Box>
                        {totalCals > 0 && (
                          <>
                            <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
                            <Box
                              component="span"
                              sx={{
                                fontFamily: "inherit",
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {totalCals} kcal
                            </Box>
                          </>
                        )}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Surface>
      )}

      <EditMealDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        meal={editingMeal}
        onSave={handleSave}
        loading={saving}
      />

      {/* Log a saved meal: which meal, which day (backfilling is real). */}
      <PremiumDialog
        open={!!mealToLog}
        onClose={() => !logging && setMealToLog(null)}
        eyebrow="Log a meal"
        title={mealToLog ? `Log ${mealToLog.name}` : 'Log a meal'}
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
            <Button onClick={() => setMealToLog(null)} disabled={logging}>
              Cancel
            </Button>
          ),
        })}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }} role="group" aria-label="Meal">
          {MEALS.map((meal) => (
            <Chip
              key={meal}
              label={mealLabel(meal)}
              onClick={() => setLogMealType(meal)}
              aria-pressed={meal === logMealType}
              color={meal === logMealType ? 'primary' : 'default'}
              variant={meal === logMealType ? 'filled' : 'outlined'}
              disabled={logging}
              sx={{ height: 44, borderRadius: 999, fontWeight: 600, '& .MuiChip-label': { px: 1.75 } }}
            />
          ))}
        </Box>
        <DateField label="Day" value={logDay} onChange={setLogDay} fullWidth size="medium" />
      </PremiumDialog>

      {/* Delete confirmation — replaces window.confirm */}
      <PremiumDialog
        open={!!mealToDelete}
        onClose={() => !deleting && setMealToDelete(null)}
        eyebrow="Confirm"
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
          <strong>{mealToDelete?.name}</strong> will be permanently removed from your
          saved meals library. This can't be undone.
        </DialogContentText>
      </PremiumDialog>
    </Box>
  );
};

export default MyMeals;
