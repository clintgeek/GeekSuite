import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Collapse
} from '@mui/material';
import NutritionInputs from './NutritionInputs.jsx';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import { rowDay } from '../../utils/experience.js';
import { fmt, mealLabel } from '../../utils/plainWords.js';
import { foodService } from '../../services/foodService.js';
import { forgetFavorites } from '../FoodSearch/useFavoriteFoods.js';
import {
  DeleteOutline as RemoveIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  ExpandMore as ExpandIcon,
  Remove as MinusIcon,
  Add as PlusIcon
} from '@mui/icons-material';
import { displayName } from '../FoodSearch/entries.js';

const PARTIAL_NUMBER = /^\d*[.,]?\d*$/;
const toNumber = (raw) => Number.parseFloat(String(raw ?? '').replace(',', '.'));
const round = (v, p = 1) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const MAX_CALORIES = 10000;
const MACROS = ['protein_grams', 'carbs_grams', 'fat_grams'];
const SERVING_STEP = 0.25;

/**
 * Edit one logged entry: how much, which meal, which day, and — the one that
 * was missing (REVIEW_2026-10 Phase 2.12) — what it came to.
 *
 * A described meal is an estimate. "1.5 servings of a bowl of chicken soup"
 * is not a question anyone can answer, so the calorie number itself is
 * editable. The dialog asks for the entry's calories as a whole first ("this
 * was about 300"); the day, a note, the per-serving numbers and the macros
 * sit behind "More options", closed. Either way they go out as the gateway's
 * per-serving overrides (CONTRACTS C3: `calories`, `protein_grams`,
 * `carbs_grams`, `fat_grams`), and only the ones that changed. The food in the
 * catalog is never touched.
 *
 * "Day" moves the entry (`log_date`), which is how last night's dinner logged
 * this morning gets back to last night.
 *
 * Save sits at the bottom on a phone (thumbSaveProps, UX review L9): with the
 * keyboard up, the only button she could see was ✕, which reads as cancel.
 * "Remove" lives here too (`onRemove`), because the rows have no trash icon
 * any more (L15); the page shows the usual "Removed X" toast with Undo.
 *
 * CALORIES AND SERVINGS, AND HOW THEY RELATE (review 2026-11-27). There was a
 * slider for servings beside a Servings box, under a Calories box, and nothing
 * said which drove which. The slider is gone: servings is the same − / + and
 * number the serving sheet uses. Each field says its part in one line —
 * Calories is the total and can be typed if she knows it; more or fewer
 * servings changes that total.
 *
 * So does the favorite star, for the same reason (ONE_APP_PLAN.md): the
 * dialog reads whether this food is a favorite when it opens and toggles it
 * itself. The button stays off until that read answers, so it never offers
 * "Add to favorites" for a food that already is one; a failed toggle puts
 * the star back and says so.
 */
const EditLogDialog = ({
  open,
  onClose,
  onSave,
  log,
  loading = false,
  onRemove
}) => {
  const fullScreen = useGeekDialogFullScreen();
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState('dinner');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState('');
  // The whole entry's calories, as typed.
  const [totalCalories, setTotalCalories] = useState('');
  // Which number the person last set, so only that one goes out: the entry's
  // total ('total') or the per-serving calories in the disclosure ('serving').
  const [calorieSource, setCalorieSource] = useState('total');
  const [detailOpen, setDetailOpen] = useState(false);
  // null = not known yet (or couldn't be read): the button waits.
  const [favorite, setFavorite] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const favoriteFood = log?.food_item || log?.food_item_id;
  const favoriteFoodId = favoriteFood && typeof favoriteFood === 'object' ? (favoriteFood._id || favoriteFood.id) : null;

  useEffect(() => {
    setFavorite(null);
    setFavoriteError(false);
    if (!open || !favoriteFoodId) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => foodService.getFavorites())
      .then((favorites) => {
        if (cancelled) return;
        const list = Array.isArray(favorites) ? favorites : (favorites?.data || []);
        setFavorite(list.some((f) => String(f?._id || f?.id) === String(favoriteFoodId)));
      })
      .catch(() => { /* unknown: the button stays off */ });
    return () => { cancelled = true; };
  }, [open, favoriteFoodId]);

  const toggleFavorite = async () => {
    if (favorite === null || favoriteBusy || !favoriteFoodId) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteBusy(true);
    setFavoriteError(false);
    try {
      if (next) await foodService.addFavorite(favoriteFoodId);
      else await foodService.removeFavorite(favoriteFoodId);
      // The add sheet's Favorites chips are cached; they are wrong now.
      forgetFavorites();
    } catch {
      setFavorite(!next);
      setFavoriteError(true);
    } finally {
      setFavoriteBusy(false);
    }
  };
  const [nutrition, setNutrition] = useState({
    calories_per_serving: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0
  });

  const food_item_ref = log?.food_item || log?.food_item_id;
  const initialNutrition = useMemo(() => (
    (log?.nutrition && Object.keys(log.nutrition).length > 0 ? log.nutrition : null)
    || food_item_ref?.nutrition
    || { calories_per_serving: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
  ), [log, food_item_ref]);
  const initialServings = Number(log?.servings) > 0 ? Number(log.servings) : 1;
  const initialDay = rowDay(log) || '';
  const initialTotal = Math.round((Number(initialNutrition.calories_per_serving) || 0) * initialServings);

  useEffect(() => {
    if (log) {
      setServings(log.servings?.toString() || '1');
      setMealType(log.meal_type || 'dinner');
      setNotes(log.notes || '');
      setNutrition(initialNutrition);
      setDay(initialDay);
      setTotalCalories(String(initialTotal));
      setCalorieSource('total');
      // Closed, unless what it hides is something she must see: a note she
      // wrote, or a day that is missing (Save waits for one).
      setDetailOpen(Boolean(String(log.notes || '').trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(initialDay));
    }
  }, [log]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when a different entry opens

  const servingsCount = toNumber(servings);
  const servingsOk = Number.isFinite(servingsCount) && servingsCount > 0;
  const typedTotal = toNumber(totalCalories);
  const totalOk = Number.isFinite(typedTotal) && typedTotal >= 0 && typedTotal <= MAX_CALORIES * (servingsOk ? servingsCount : 1);
  const perServingOk = Number(nutrition.calories_per_serving) >= 0 && Number(nutrition.calories_per_serving) <= MAX_CALORIES;
  const caloriesOk = calorieSource === 'total' ? totalOk : perServingOk;
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(day);
  const canSave = Boolean(log) && !loading && servingsOk && caloriesOk && dayOk;

  // What the entry comes to with the numbers on screen.
  const perServingCalories = calorieSource === 'total'
    ? (totalOk && servingsOk ? typedTotal / servingsCount : Number(initialNutrition.calories_per_serving) || 0)
    : Number(nutrition.calories_per_serving) || 0;

  const handleSave = () => {
    if (!canSave) return;
    const updateData = {
      servings: servingsCount,
      meal_type: mealType,
      notes: notes.trim()
    };
    if (day !== initialDay) updateData.log_date = day;

    // Only what changed goes out — an override that repeats the old number
    // is still an override, and it would pin a value the person never set.
    const changed = (key) => round(nutrition[key], 2) !== round(initialNutrition[key], 2);
    if (calorieSource === 'total') {
      const per = round(typedTotal / servingsCount, 2);
      if (per !== round(initialNutrition.calories_per_serving, 2)) updateData.calories = per;
    } else if (changed('calories_per_serving')) {
      updateData.calories = Math.max(0, round(nutrition.calories_per_serving, 2));
    }
    for (const key of MACROS) {
      if (changed(key)) updateData[key] = Math.max(0, round(nutrition[key], 2));
    }
    onSave(log._id || log.id, updateData);
  };

  // The total is the entry's, so more servings means a bigger total — the
  // same food, more of it — unless she then types her own number.
  const changeServings = (next) => {
    const prev = toNumber(servings);
    const n = toNumber(next);
    if (calorieSource === 'total') {
      if (totalOk && prev > 0 && n > 0) setTotalCalories(String(Math.round((typedTotal / prev) * n)));
    } else if (n > 0) {
      setTotalCalories(String(Math.round((Number(nutrition.calories_per_serving) || 0) * n)));
    }
    setServings(next);
  };

  /** − / +: a quarter serving at a time, never below a quarter. */
  const stepServings = (delta) => {
    const current = toNumber(servings);
    const next = Math.max(SERVING_STEP, round((Number.isFinite(current) ? current : 0) + delta, 2));
    changeServings(String(next));
  };

  // Typing the total keeps the per-serving box in step, for show; what goes
  // out is decided by `calorieSource`.
  const changeTotal = (next) => {
    setTotalCalories(next);
    setCalorieSource('total');
    const t = toNumber(next);
    if (Number.isFinite(t) && servingsOk) {
      setNutrition((prev) => ({ ...prev, calories_per_serving: round(t / servingsCount, 2) }));
    }
  };

  const handleClose = () => {
    onClose();
  };

  const food_item = log?.food_item || log?.food_item_id;

  const setNutritionField = (field, value) => {
    const v = parseFloat(value);
    if (field === 'calories_per_serving') {
      setCalorieSource('serving');
      if (servingsOk) setTotalCalories(String(Math.round((Number.isFinite(v) ? v : 0) * servingsCount)));
    }
    setNutrition((prev) => ({
      ...prev,
      [field]: Number.isFinite(v) ? v : 0
    }));
  };

  const mealTypeOptions = [
    { value: 'breakfast', label: mealLabel('breakfast') },
    { value: 'lunch', label: mealLabel('lunch') },
    { value: 'dinner', label: mealLabel('dinner') },
    { value: 'snack', label: mealLabel('snack') }
  ];

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title="Edit entry"
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!canSave}
          >
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: (
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        ),
      })}
    >
        <Box>
          {/* What this is, and the star: keep it as a favorite. It sits up
              here, under the name, because at the bottom of the form it was
              below the fold on a phone and nobody found it. Remove is the
              last thing in the dialog (below). */}
          {log && (food_item?.name || favoriteFoodId) && (
            <Box sx={{ mb: 5, pb: 2, borderBottom: (t) => `1px solid ${t.palette.divider}` }}>
              {food_item?.name && (
                <Typography component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                  {displayName(food_item.name)}
                </Typography>
              )}
              {food_item?.brand && (
                <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                  {displayName(food_item.brand)}
                </Typography>
              )}
              {favoriteFoodId && (
                <Box sx={{ mt: 1, mx: -2 }}>
                    <Button
                      color="inherit"
                      data-testid="edit-log-favorite"
                      startIcon={favorite ? <StarIcon sx={{ color: 'warning.main' }} /> : <StarBorderIcon />}
                      onClick={toggleFavorite}
                      disabled={loading || favoriteBusy || favorite === null}
                      aria-pressed={Boolean(favorite)}
                      sx={{ minHeight: 44, px: 2, fontWeight: 600 }}
                    >
                      {favorite ? 'In your favorites' : 'Add to favorites'}
                    </Button>
                </Box>
              )}
              {favorite && !favoriteError && (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  Favorites are one tap away when you add food.
                </Typography>
              )}
              {favoriteError && (
                <Typography role="alert" sx={{ mt: 1, fontSize: '0.9375rem', color: 'error.main' }}>
                  Couldn’t change that just now. Try again.
                </Typography>
              )}
            </Box>
          )}

          {/* One number, the whole entry — what she remembers. */}
          <TextField
              fullWidth
              label="Calories"
              value={totalCalories}
              onChange={(e) => {
                const next = e.target.value.trim();
                if (PARTIAL_NUMBER.test(next)) changeTotal(next);
              }}
              error={calorieSource === 'total' ? totalCalories !== '' && !totalOk : !perServingOk}
              helperText={calorieSource === 'total' && totalCalories !== '' && !totalOk ? 'That looks too high. Check the number.' : 'The total for this entry. Type it here if you know it.'}
              inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
              sx={{ mb: 4 }}
            />

          {/* Servings: the serving sheet's − / + and number. */}
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton
                onClick={() => stepServings(-SERVING_STEP)}
                disabled={loading || !servingsOk || servingsCount <= SERVING_STEP}
                aria-label="Fewer servings"
                sx={{ width: 48, height: 48, flexShrink: 0, border: (t) => `1px solid ${t.palette.outline || t.palette.divider}` }}
              >
                <MinusIcon />
              </IconButton>
              <TextField
                label="Servings"
                value={servings}
                onChange={(e) => {
                  const next = e.target.value.trim();
                  if (PARTIAL_NUMBER.test(next)) changeServings(next);
                }}
                error={servings !== '' && !servingsOk}
                inputProps={{ inputMode: 'decimal', autoComplete: 'off', style: { textAlign: 'center', fontWeight: 700 } }}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <IconButton
                onClick={() => stepServings(SERVING_STEP)}
                disabled={loading}
                aria-label="More servings"
                sx={{ width: 48, height: 48, flexShrink: 0, border: (t) => `1px solid ${t.palette.outline || t.palette.divider}` }}
              >
                <PlusIcon />
              </IconButton>
            </Box>
            <Typography data-testid="edit-log-servings-help" sx={{ mt: 1, mx: 3.5, fontSize: '0.75rem', lineHeight: 1.66, color: 'text.secondary' }}>
              More or fewer servings changes the calories above.
            </Typography>
          </Box>

          {/* Meal Type */}
          <FormControl fullWidth>
            <InputLabel id="edit-log-meal-label">Meal</InputLabel>
            <Select
              labelId="edit-log-meal-label"
              value={mealType}
              label="Meal"
              onChange={(e) => setMealType(e.target.value)}
            >
              {mealTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* More options — the day, a note, and the per-serving numbers the
              total hides. One disclosure, closed, so the dialog opens on what
              she came for: how many calories, how much, which meal. */}
          <Button
            onClick={() => setDetailOpen((o) => !o)}
            aria-expanded={detailOpen}
            aria-controls="edit-log-detail"
            endIcon={<ExpandIcon sx={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ mt: 2, minHeight: 44, px: 0, fontWeight: 700, justifyContent: 'flex-start' }}
          >
            More options
          </Button>
          <Collapse in={detailOpen} unmountOnExit>
            <Box id="edit-log-detail" sx={{ mt: 3 }}>
              {/* Day — moves the entry. */}
              <DateField
                label="Day"
                value={day}
                onChange={setDay}
                fullWidth
                size="medium"
                sx={{ mb: 4 }}
              />

              {/* Notes */}
              <TextField
                fullWidth
                label="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={1}
                maxRows={4}
                placeholder="Anything to remember about this food…"
                sx={{ mb: 4 }}
              />

              {/* These fields hold PER-SERVING numbers — the same object the
                  "Nutrition for N servings" preview below multiplies by
                  `servings`. Plain "Calories" here would read as the total
                  someone remembers eating (that is the field above), so the
                  qualifier makes the units explicit at the point of entry. */}
              <NutritionInputs
                values={nutrition}
                onChange={(field, val) => setNutritionField(field, val)}
                qualifier=" (per serving)"
              />
              <Box sx={{ mt: 4 }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 2 }}>
                  Nutrition for {servings} serving{parseFloat(servings) !== 1 ? 's' : ''}:
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${fmt(perServingCalories * (servingsOk ? servingsCount : 0))} cal`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Protein ${fmt((Number(nutrition.protein_grams) || 0) * (servingsOk ? servingsCount : 0))}g`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Carbs ${fmt((Number(nutrition.carbs_grams) || 0) * (servingsOk ? servingsCount : 0))}g`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Fat ${fmt((Number(nutrition.fat_grams) || 0) * (servingsOk ? servingsCount : 0))}g`}
                    size="small"
                    variant="tag"
                  />
                </Box>
              </Box>
            </Box>
          </Collapse>

          {/* Remove: the last thing in the dialog, quiet and to the left,
              where a thumb heading for Save does not pass over it. Undo for
              a removal is in the page's toast. */}
          {log && onRemove && (
            <Box sx={{ mt: 2, mx: -2 }}>
              <Button
                color="error"
                startIcon={<RemoveIcon />}
                onClick={() => onRemove(log._id || log.id)}
                disabled={loading}
                aria-label={food_item?.name ? `Remove ${food_item.name}` : 'Remove'}
                sx={{ minHeight: 44, px: 2, fontWeight: 600 }}
              >
                Remove
              </Button>
            </Box>
          )}
        </Box>
    </PremiumDialog>
  );
};

export default EditLogDialog;